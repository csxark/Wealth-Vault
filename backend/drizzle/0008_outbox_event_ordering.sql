-- Issue #571: Outbox/Event Ordering Violations - Projection Drift in Analytics
-- Ensures monotonic event ordering per-aggregate and consumer-side idempotency

-- 1. Per-aggregate sequence number tracking
CREATE TABLE IF NOT EXISTS outbox_sequence_numbers (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  current_sequence BIGINT NOT NULL DEFAULT 0,
  last_event_id UUID,
  last_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, aggregate_id, aggregate_type),
  CONSTRAINT valid_sequence CHECK (current_sequence >= 0)
);

CREATE INDEX idx_outbox_seq_tenant_aggregate 
  ON outbox_sequence_numbers(tenant_id, aggregate_id, aggregate_type);
CREATE INDEX idx_outbox_seq_updated 
  ON outbox_sequence_numbers(updated_at DESC);

-- 2. Consumer-side idempotency: track which events each consumer has processed
CREATE TABLE IF NOT EXISTS consumer_idempotency (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_id UUID NOT NULL,
  consumer_name VARCHAR(255) NOT NULL,
  aggregate_id UUID,
  aggregate_type VARCHAR(255),
  event_sequence BIGINT,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, event_id, consumer_name),
  CONSTRAINT valid_event_seq CHECK (event_sequence IS NULL OR event_sequence >= 0)
);

CREATE INDEX idx_consumer_idempotent_tenant 
  ON consumer_idempotency(tenant_id, consumer_name);
CREATE INDEX idx_consumer_idempotent_event 
  ON consumer_idempotency(event_id);
CREATE INDEX idx_consumer_idempotent_processed 
  ON consumer_idempotency(processed_at DESC);

-- 3. Audit trail tracking sequence violations and backfill operations
CREATE TABLE IF NOT EXISTS event_sequence_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  violation_type VARCHAR(100) NOT NULL, -- 'gap', 'out_of_order', 'duplicate'
  expected_sequence BIGINT,
  actual_sequence BIGINT,
  gap_size BIGINT,
  event_ids UUID[] NOT NULL DEFAULT '{}',
  affected_consumers TEXT[],
  severity VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high'
  auto_backfilled BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  root_cause TEXT,
  
  CONSTRAINT valid_gap_size CHECK (gap_size IS NULL OR gap_size > 0)
);

CREATE INDEX idx_event_seq_audit_tenant 
  ON event_sequence_audit(tenant_id);
CREATE INDEX idx_event_seq_audit_violation 
  ON event_sequence_audit(violation_type, severity DESC);
CREATE INDEX idx_event_seq_audit_detected 
  ON event_sequence_audit(detected_at DESC);
CREATE INDEX idx_event_seq_audit_aggregate 
  ON event_sequence_audit(tenant_id, aggregate_id, aggregate_type);

-- 4. Projection rebuild audit trail for replay-safe rebuilds
CREATE TABLE IF NOT EXISTS projection_rebuild_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  projection_name VARCHAR(255) NOT NULL,
  rebuild_type VARCHAR(100) NOT NULL, -- 'full', 'partial', 'backfill'
  scope_aggregate_id UUID,
  scope_aggregate_type VARCHAR(255),
  start_sequence BIGINT,
  end_sequence BIGINT,
  events_replayed BIGINT DEFAULT 0,
  duration_ms BIGINT,
  status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  error_message TEXT,
  initiated_by VARCHAR(255), -- 'system', 'manual', 'auto_recovery'
  initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT valid_events_replayed CHECK (events_replayed >= 0)
);

CREATE INDEX idx_projection_rebuild_tenant 
  ON projection_rebuild_audit(tenant_id, projection_name);
CREATE INDEX idx_projection_rebuild_status 
  ON projection_rebuild_audit(status, initiated_at DESC);
CREATE INDEX idx_projection_rebuild_initiated 
  ON projection_rebuild_audit(initiated_at DESC);

-- 5. Helper function: Assign sequence number to event
CREATE OR REPLACE FUNCTION assign_event_sequence(
  p_tenant_id UUID,
  p_aggregate_id UUID,
  p_aggregate_type VARCHAR,
  p_event_id UUID
) RETURNS BIGINT AS $$
DECLARE
  v_next_sequence BIGINT;
  v_prev_sequence BIGINT;
BEGIN
  -- Get or initialize sequence counter for this aggregate
  INSERT INTO outbox_sequence_numbers (
    tenant_id, aggregate_id, aggregate_type, current_sequence, last_event_id, last_timestamp
  ) VALUES (
    p_tenant_id, p_aggregate_id, p_aggregate_type, 0, NULL, NULL
  ) ON CONFLICT (tenant_id, aggregate_id, aggregate_type) DO NOTHING;

  -- Increment and get sequence number
  UPDATE outbox_sequence_numbers
  SET 
    current_sequence = current_sequence + 1,
    last_event_id = p_event_id,
    last_timestamp = NOW(),
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND aggregate_id = p_aggregate_id
    AND aggregate_type = p_aggregate_type
  RETURNING current_sequence INTO v_next_sequence;

  RETURN v_next_sequence;
END;
$$ LANGUAGE plpgsql;

-- 6. Helper function: Detect sequence violations
CREATE OR REPLACE FUNCTION detect_sequence_violation(
  p_tenant_id UUID,
  p_aggregate_id UUID,
  p_aggregate_type VARCHAR,
  p_event_sequence BIGINT
) RETURNS TABLE (
  violation_detected BOOLEAN,
  expected_sequence BIGINT,
  gap_size BIGINT
) AS $$
DECLARE
  v_current_sequence BIGINT;
  v_expected_next BIGINT;
  v_gap_size BIGINT := 0;
BEGIN
  -- Get current sequence for this aggregate
  SELECT current_sequence INTO v_current_sequence
  FROM outbox_sequence_numbers
  WHERE tenant_id = p_tenant_id
    AND aggregate_id = p_aggregate_id
    AND aggregate_type = p_aggregate_type;

  v_current_sequence := COALESCE(v_current_sequence, 0);
  v_expected_next := v_current_sequence + 1;

  -- Calculate gap if incoming sequence is higher than expected
  IF p_event_sequence > v_expected_next THEN
    v_gap_size := p_event_sequence - v_expected_next;
    RETURN QUERY SELECT TRUE, v_expected_next, v_gap_size;
  ELSIF p_event_sequence <= v_current_sequence THEN
    -- Out of order or duplicate
    RETURN QUERY SELECT TRUE, v_expected_next, 0::BIGINT;
  ELSE
    -- Sequence is correct (monotonic)
    RETURN QUERY SELECT FALSE, v_expected_next, 0::BIGINT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Helper function: Check consumer idempotency
CREATE OR REPLACE FUNCTION check_consumer_idempotency(
  p_tenant_id UUID,
  p_event_id UUID,
  p_consumer_name VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM consumer_idempotency
    WHERE tenant_id = p_tenant_id
      AND event_id = p_event_id
      AND consumer_name = p_consumer_name
  ) INTO v_exists;

  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- 8. Helper function: Record consumer idempotency
CREATE OR REPLACE FUNCTION record_consumer_idempotency(
  p_tenant_id UUID,
  p_event_id UUID,
  p_consumer_name VARCHAR,
  p_aggregate_id UUID DEFAULT NULL,
  p_aggregate_type VARCHAR DEFAULT NULL,
  p_event_sequence BIGINT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO consumer_idempotency (
    tenant_id, event_id, consumer_name, aggregate_id, aggregate_type, event_sequence
  ) VALUES (
    p_tenant_id, p_event_id, p_consumer_name, p_aggregate_id, p_aggregate_type, p_event_sequence
  ) ON CONFLICT (tenant_id, event_id, consumer_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 9. Monitoring view: Current sequence status by aggregate
CREATE OR REPLACE VIEW v_outbox_sequence_status AS
SELECT 
  osn.tenant_id,
  osn.aggregate_id,
  osn.aggregate_type,
  osn.current_sequence,
  osn.last_event_id,
  osn.last_timestamp,
  (SELECT COUNT(*) FROM consumer_idempotency 
   WHERE tenant_id = osn.tenant_id 
     AND aggregate_id = osn.aggregate_id) AS processed_by_consumers,
  (SELECT COUNT(*) FROM event_sequence_audit 
   WHERE tenant_id = osn.tenant_id 
     AND aggregate_id = osn.aggregate_id 
     AND resolved_at IS NULL) AS unresolved_violations,
  osn.updated_at
FROM outbox_sequence_numbers osn
ORDER BY osn.updated_at DESC;

-- 10. Monitoring view: Consumer processing status
CREATE OR REPLACE VIEW v_consumer_processing_status AS
SELECT 
  tenant_id,
  consumer_name,
  COUNT(*) AS events_processed,
  COUNT(DISTINCT aggregate_id) AS aggregates_touched,
  MAX(processed_at) AS last_processed,
  MIN(event_sequence) AS min_sequence,
  MAX(event_sequence) AS max_sequence
FROM consumer_idempotency
WHERE event_sequence IS NOT NULL
GROUP BY tenant_id, consumer_name
ORDER BY max_sequence DESC NULLS LAST;

-- 11. Monitoring view: Event sequence violations summary
CREATE OR REPLACE VIEW v_event_violations_summary AS
SELECT 
  tenant_id,
  violation_type,
  severity,
  COUNT(*) AS violation_count,
  SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved,
  MAX(detected_at) AS latest_detection,
  CAST(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - detected_at))) AS BIGINT) AS avg_resolution_seconds
FROM event_sequence_audit
GROUP BY tenant_id, violation_type, severity
ORDER BY violation_count DESC;

-- 12. Trigger: Auto-update outbox_sequence_numbers timestamp
CREATE OR REPLACE FUNCTION update_outbox_seq_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_outbox_seq_timestamp ON outbox_sequence_numbers;
CREATE TRIGGER trg_outbox_seq_timestamp
BEFORE UPDATE ON outbox_sequence_numbers
FOR EACH ROW
EXECUTE FUNCTION update_outbox_seq_timestamp();

-- 13. Grant permissions (multi-tenant)
ALTER TABLE outbox_sequence_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumer_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sequence_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_rebuild_audit ENABLE ROW LEVEL SECURITY;

-- Policies for tenant isolation
CREATE POLICY outbox_seq_tenant_isolation ON outbox_sequence_numbers
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY consumer_idem_tenant_isolation ON consumer_idempotency
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY event_seq_audit_tenant_isolation ON event_sequence_audit
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY projection_rebuild_tenant_isolation ON projection_rebuild_audit
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
