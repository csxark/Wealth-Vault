-- Issue #573: Goal Milestone Race Conditions - Duplicate/Missed Milestone Triggers
-- Prevents duplicate or missed milestone triggers through transactional locking and ledger tracking

-- 1. Milestone definitions table
CREATE TABLE IF NOT EXISTS goal_milestones (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  goal_id BIGINT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  milestone_name VARCHAR(255) NOT NULL,
  threshold_cents BIGINT NOT NULL, -- Store as cents for deterministic comparison
  threshold_percent DECIMAL(5, 2),
  reward_message TEXT,
  icon VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_threshold_cents CHECK (threshold_cents >= 0),
  CONSTRAINT valid_threshold_percent CHECK (threshold_percent >= 0 AND threshold_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal 
  ON goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_tenant 
  ON goal_milestones(tenant_id);

-- 2. Milestone trigger ledger - prevents duplicate triggers
CREATE TABLE IF NOT EXISTS milestone_trigger_ledger (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  goal_id BIGINT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  milestone_id BIGINT NOT NULL REFERENCES goal_milestones(id) ON DELETE CASCADE,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  triggered_by_contribution_id BIGINT,
  progress_before_cents BIGINT NOT NULL,
  progress_after_cents BIGINT NOT NULL,
  threshold_crossed_cents BIGINT NOT NULL,
  target_amount_cents BIGINT NOT NULL,
  is_duplicate BOOLEAN DEFAULT FALSE,
  reconciliation_backfilled BOOLEAN DEFAULT FALSE,
  
  -- UNIQUE constraint prevents duplicate triggers
  CONSTRAINT unique_milestone_trigger UNIQUE(tenant_id, goal_id, milestone_id),
  CONSTRAINT valid_progress CHECK (
    progress_before_cents >= 0 AND 
    progress_after_cents >= 0 AND 
    progress_after_cents > progress_before_cents
  )
);

CREATE INDEX IF NOT EXISTS idx_milestone_trigger_goal 
  ON milestone_trigger_ledger(goal_id);
CREATE INDEX IF NOT EXISTS idx_milestone_trigger_tenant 
  ON milestone_trigger_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_milestone_trigger_time 
  ON milestone_trigger_ledger(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_milestone_trigger_backfilled 
  ON milestone_trigger_ledger(reconciliation_backfilled, triggered_at DESC);

-- 3. Missed milestone detection audit
CREATE TABLE IF NOT EXISTS milestone_missed_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  goal_id BIGINT NOT NULL,
  milestone_id BIGINT NOT NULL,
  expected_trigger_amount_cents BIGINT,
  current_progress_cents BIGINT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  backfilled_at TIMESTAMP WITH TIME ZONE,
  backfill_trigger_id BIGINT REFERENCES milestone_trigger_ledger(id),
  severity VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high'
  
  CONSTRAINT valid_missed_amounts CHECK (
    current_progress_cents >= expected_trigger_amount_cents
  )
);

CREATE INDEX IF NOT EXISTS idx_missed_milestone_tenant 
  ON milestone_missed_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_missed_milestone_detected 
  ON milestone_missed_audit(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_milestone_backfilled 
  ON milestone_missed_audit(backfilled_at DESC NULLS LAST);

-- 4. Goal progress snapshots for concurrent update protection
CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  goal_id BIGINT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  snapshot_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  progress_cents BIGINT NOT NULL,
  target_cents BIGINT NOT NULL,
  contribution_count INT DEFAULT 0,
  last_contribution_id BIGINT,
  version BIGINT NOT NULL DEFAULT 1, -- For optimistic locking
  
  CONSTRAINT valid_snapshot_amounts CHECK (
    progress_cents >= 0 AND target_cents > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshot_goal 
  ON goal_progress_snapshots(goal_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshot_tenant 
  ON goal_progress_snapshots(tenant_id);

-- 5. Helper function: Convert dollars to cents deterministically
CREATE OR REPLACE FUNCTION dollars_to_cents(
  p_dollar_amount DECIMAL
) RETURNS BIGINT AS $$
BEGIN
  RETURN FLOOR(p_dollar_amount * 100)::BIGINT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Helper function: Evaluate milestone crossing with locking
CREATE OR REPLACE FUNCTION evaluate_milestone_crossing(
  p_tenant_id UUID,
  p_goal_id BIGINT,
  p_milestone_id BIGINT,
  p_progress_before_cents BIGINT,
  p_progress_after_cents BIGINT,
  p_contribution_id BIGINT DEFAULT NULL
) RETURNS TABLE (
  crossed BOOLEAN,
  threshold_cents BIGINT,
  is_duplicate BOOLEAN
) AS $$
DECLARE
  v_threshold_cents BIGINT;
  v_existing_trigger BIGINT;
BEGIN
  -- Get milestone threshold
  SELECT threshold_cents INTO v_threshold_cents
  FROM goal_milestones
  WHERE id = p_milestone_id;

  -- Check if milestone was already triggered (idempotency)
  SELECT id INTO v_existing_trigger
  FROM milestone_trigger_ledger
  WHERE tenant_id = p_tenant_id
    AND goal_id = p_goal_id
    AND milestone_id = p_milestone_id;

  -- Milestone crossed if:
  -- 1. Before value was BELOW threshold
  -- 2. After value is AT OR ABOVE threshold
  -- 3. Not already triggered
  IF p_progress_before_cents < v_threshold_cents 
     AND p_progress_after_cents >= v_threshold_cents THEN
    
    IF v_existing_trigger IS NOT NULL THEN
      -- Already triggered, this is a duplicate attempt
      RETURN QUERY SELECT TRUE, v_threshold_cents, TRUE;
    ELSE
      -- Valid crossing
      RETURN QUERY SELECT TRUE, v_threshold_cents, FALSE;
    END IF;
  ELSE
    -- No crossing
    RETURN QUERY SELECT FALSE, v_threshold_cents, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Helper function: Record milestone trigger atomically
CREATE OR REPLACE FUNCTION record_milestone_trigger(
  p_tenant_id UUID,
  p_goal_id BIGINT,
  p_milestone_id BIGINT,
  p_progress_before_cents BIGINT,
  p_progress_after_cents BIGINT,
  p_threshold_cents BIGINT,
  p_target_cents BIGINT,
  p_contribution_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_trigger_id BIGINT;
BEGIN
  -- Insert with UNIQUE constraint protection (ON CONFLICT DO NOTHING)
  INSERT INTO milestone_trigger_ledger (
    tenant_id,
    goal_id,
    milestone_id,
    triggered_at,
    triggered_by_contribution_id,
    progress_before_cents,
    progress_after_cents,
    threshold_crossed_cents,
    target_amount_cents,
    is_duplicate
  ) VALUES (
    p_tenant_id,
    p_goal_id,
    p_milestone_id,
    NOW(),
    p_contribution_id,
    p_progress_before_cents,
    p_progress_after_cents,
    p_threshold_cents,
    p_target_cents,
    FALSE
  )
  ON CONFLICT (tenant_id, goal_id, milestone_id) DO NOTHING
  RETURNING id INTO v_trigger_id;

  RETURN v_trigger_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Helper function: Detect missed milestones for a goal
CREATE OR REPLACE FUNCTION detect_missed_milestones(
  p_tenant_id UUID,
  p_goal_id BIGINT,
  p_current_progress_cents BIGINT
) RETURNS TABLE (
  milestone_id BIGINT,
  milestone_name VARCHAR,
  threshold_cents BIGINT,
  should_have_triggered BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gm.id,
    gm.milestone_name,
    gm.threshold_cents,
    (p_current_progress_cents >= gm.threshold_cents) AS should_have_triggered
  FROM goal_milestones gm
  LEFT JOIN milestone_trigger_ledger mtl 
    ON mtl.goal_id = gm.goal_id 
    AND mtl.milestone_id = gm.id
    AND mtl.tenant_id = p_tenant_id
  WHERE gm.goal_id = p_goal_id
    AND gm.tenant_id = p_tenant_id
    AND p_current_progress_cents >= gm.threshold_cents  -- Progress exceeds threshold
    AND mtl.id IS NULL;  -- But not yet triggered
END;
$$ LANGUAGE plpgsql;

-- 9. Helper function: Snapshot goal progress with optimistic locking
CREATE OR REPLACE FUNCTION snapshot_goal_progress(
  p_tenant_id UUID,
  p_goal_id BIGINT,
  p_progress_cents BIGINT,
  p_target_cents BIGINT,
  p_contribution_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_current_version BIGINT;
  v_contribution_count INT;
BEGIN
  -- Get current version
  SELECT COALESCE(MAX(version), 0) INTO v_current_version
  FROM goal_progress_snapshots
  WHERE goal_id = p_goal_id;

  -- Count contributions
  SELECT COUNT(*) INTO v_contribution_count
  FROM contributions
  WHERE goal_id = p_goal_id;

  -- Create snapshot with incremented version
  INSERT INTO goal_progress_snapshots (
    tenant_id,
    goal_id,
    snapshot_time,
    progress_cents,
    target_cents,
    contribution_count,
    last_contribution_id,
    version
  ) VALUES (
    p_tenant_id,
    p_goal_id,
    NOW(),
    p_progress_cents,
    p_target_cents,
    v_contribution_count,
    p_contribution_id,
    v_current_version + 1
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- 10. Monitoring view: Milestone status by goal
CREATE OR REPLACE VIEW v_milestone_status AS
SELECT 
  gm.id AS milestone_id,
  gm.goal_id,
  gm.milestone_name,
  gm.threshold_cents,
  gm.threshold_percent,
  CASE 
    WHEN mtl.id IS NOT NULL THEN 'triggered'
    ELSE 'pending'
  END AS status,
  mtl.triggered_at,
  mtl.progress_after_cents AS triggered_at_progress,
  mtl.is_duplicate,
  mtl.reconciliation_backfilled
FROM goal_milestones gm
LEFT JOIN milestone_trigger_ledger mtl 
  ON mtl.milestone_id = gm.id 
  AND mtl.goal_id = gm.goal_id;

-- 11. Monitoring view: Missed milestone summary
CREATE OR REPLACE VIEW v_missed_milestones_summary AS
SELECT 
  tenant_id,
  goal_id,
  COUNT(*) AS missed_count,
  MAX(detected_at) AS latest_detection,
  SUM(CASE WHEN backfilled_at IS NULL THEN 1 ELSE 0 END) AS pending_backfill,
  AVG(current_progress_cents - expected_trigger_amount_cents) AS avg_overshoot_cents
FROM milestone_missed_audit
GROUP BY tenant_id, goal_id
ORDER BY missed_count DESC;

-- 12. Trigger: Auto-snapshot on goal progress update
CREATE OR REPLACE FUNCTION auto_snapshot_goal_progress()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM snapshot_goal_progress(
    NEW.tenant_id,
    NEW.id,
    dollars_to_cents(NEW.current_amount),
    dollars_to_cents(NEW.target_amount),
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_snapshot_goal ON goals;
CREATE TRIGGER trg_auto_snapshot_goal
AFTER UPDATE OF current_amount ON goals
FOR EACH ROW
WHEN (OLD.current_amount IS DISTINCT FROM NEW.current_amount)
EXECUTE FUNCTION auto_snapshot_goal_progress();

-- 13. Grant permissions (multi-tenant)
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_trigger_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_missed_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY milestone_tenant_isolation ON goal_milestones
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY milestone_trigger_tenant_isolation ON milestone_trigger_ledger
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY missed_milestone_tenant_isolation ON milestone_missed_audit
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY progress_snapshot_tenant_isolation ON goal_progress_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
