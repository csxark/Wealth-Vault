-- Migration: Recurring Payment Duplication Prevention
-- Issue: #568
-- Implements scheduler + API + worker layer idempotency with dead-letter handling

-- Recurring Payment Executions - Deduplicate recurring contributions
CREATE TABLE IF NOT EXISTS recurring_payment_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Billing Window - Defines the unique execution period
    billing_window_start TIMESTAMPTZ NOT NULL,
    billing_window_end TIMESTAMPTZ NOT NULL,
    
    -- Source Event Tracking for exactly-once processing
    source_event_id UUID, -- References outbox_events.id or external event systems
    source_event_type TEXT, -- 'scheduler', 'api_trigger', 'webhook', 'manual'
    
    -- Execution Fingerprint - Deterministic hash of input parameters
    execution_fingerprint TEXT NOT NULL, -- SHA-256 of (goal_id, window, event_id, frequency, amount)
    
    -- Execution Status and Results
    status TEXT NOT NULL DEFAULT 'pending', -- pending, executing, completed, failed, dead_letter
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    
    -- Contribution details
    contribution_amount_cents INTEGER NOT NULL,
    contribution_currency TEXT NOT NULL DEFAULT 'USD',
    contribution_line_item_id UUID REFERENCES goal_contribution_line_items(id) ON DELETE SET NULL,
    
    -- Replay-safe response storage
    response_code INTEGER,
    response_body JSONB,
    
    -- Scheduling metadata
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    
    -- Error tracking
    last_error TEXT,
    error_stacktrace TEXT,
    failure_reason TEXT,
    
    -- Dead-letter handling
    moved_to_dlq_at TIMESTAMPTZ,
    dlq_reason TEXT,
    dlq_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit trail
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- UNIQUE CONSTRAINT: Prevents duplicate executions for same billing window
    CONSTRAINT unique_execution_per_window UNIQUE (goal_id, billing_window_start, billing_window_end, source_event_id)
);

-- Indexes for recurring_payment_executions
CREATE INDEX idx_recurring_payments_tenant ON recurring_payment_executions(tenant_id);
CREATE INDEX idx_recurring_payments_goal ON recurring_payment_executions(goal_id);
CREATE INDEX idx_recurring_payments_user ON recurring_payment_executions(user_id);
CREATE INDEX idx_recurring_payments_status ON recurring_payment_executions(status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_recurring_payments_window ON recurring_payment_executions(billing_window_start, billing_window_end);
CREATE INDEX idx_recurring_payments_fingerprint ON recurring_payment_executions(execution_fingerprint);
CREATE INDEX idx_recurring_payments_source_event ON recurring_payment_executions(source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX idx_recurring_payments_retry ON recurring_payment_executions(next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_recurring_payments_dlq ON recurring_payment_executions(moved_to_dlq_at) WHERE moved_to_dlq_at IS NOT NULL;

-- Dead Letter Queue - Stores permanently failed recurring payments for manual intervention
CREATE TABLE IF NOT EXISTS recurring_payment_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Original execution reference
    execution_id UUID NOT NULL REFERENCES recurring_payment_executions(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Failure classification
    failure_category TEXT NOT NULL, -- 'transient_exhausted', 'permanent_error', 'validation_failed', 'business_logic_error'
    failure_severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    
    -- Failure details
    total_retry_attempts INTEGER NOT NULL,
    first_failure_at TIMESTAMPTZ NOT NULL,
    last_failure_at TIMESTAMPTZ NOT NULL,
    error_summary TEXT,
    full_error_log TEXT,
    
    -- Context snapshot for replay
    original_payload JSONB NOT NULL,
    execution_context JSONB DEFAULT '{}'::jsonb, -- Snapshot of tenant/user/goal state at failure time
    
    -- Resolution tracking
    status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review, investigating, resolved, ignored
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    
    -- Replay tracking
    replay_attempted_at TIMESTAMPTZ,
    replay_count INTEGER DEFAULT 0,
    replay_success BOOLEAN,
    
    -- Alerting
    alert_sent BOOLEAN DEFAULT FALSE,
    alert_sent_at TIMESTAMPTZ,
    alert_recipients JSONB DEFAULT '[]'::jsonb,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for dead_letters
CREATE INDEX idx_dlq_tenant ON recurring_payment_dead_letters(tenant_id);
CREATE INDEX idx_dlq_execution ON recurring_payment_dead_letters(execution_id);
CREATE INDEX idx_dlq_goal ON recurring_payment_dead_letters(goal_id);
CREATE INDEX idx_dlq_status ON recurring_payment_dead_letters(status) WHERE status = 'pending_review';
CREATE INDEX idx_dlq_severity ON recurring_payment_dead_letters(failure_severity) WHERE failure_severity IN ('high', 'critical');
CREATE INDEX idx_dlq_category ON recurring_payment_dead_letters(failure_category);
CREATE INDEX idx_dlq_created ON recurring_payment_dead_letters(created_at DESC);

-- Execution Fingerprint Cache - Fast lookup for replay detection across scheduler layers
CREATE TABLE IF NOT EXISTS recurring_payment_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Fingerprint details
    fingerprint TEXT NOT NULL UNIQUE,
    execution_id UUID NOT NULL REFERENCES recurring_payment_executions(id) ON DELETE CASCADE,
    
    -- Fast response replay
    cached_response_code INTEGER,
    cached_response_body JSONB,
    
    -- TTL management
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ
);

-- Indexes for fingerprints
CREATE INDEX idx_fingerprints_tenant ON recurring_payment_fingerprints(tenant_id);
CREATE INDEX idx_fingerprints_execution ON recurring_payment_fingerprints(execution_id);
CREATE INDEX idx_fingerprints_expires ON recurring_payment_fingerprints(expires_at);

-- Scheduler Coordination Lock - Prevents duplicate scheduler runs
CREATE TABLE IF NOT EXISTS scheduler_coordination_locks (
    lock_name TEXT PRIMARY KEY,
    holder_instance_id TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_scheduler_locks_expires ON scheduler_coordination_locks(expires_at);

-- Helper function: Generate execution fingerprint
CREATE OR REPLACE FUNCTION generate_execution_fingerprint(
    p_goal_id UUID,
    p_window_start TIMESTAMPTZ,
    p_window_end TIMESTAMPTZ,
    p_event_id UUID,
    p_amount_cents INTEGER,
    p_currency TEXT
) RETURNS TEXT AS $$
DECLARE
    v_input TEXT;
BEGIN
    v_input := p_goal_id::TEXT || '|' || 
               p_window_start::TEXT || '|' || 
               p_window_end::TEXT || '|' || 
               COALESCE(p_event_id::TEXT, 'null') || '|' || 
               p_amount_cents::TEXT || '|' || 
               p_currency;
    
    RETURN encode(digest(v_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function: Calculate next billing window for a goal
CREATE OR REPLACE FUNCTION calculate_next_billing_window(
    p_goal_id UUID,
    p_current_timestamp TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(window_start TIMESTAMPTZ, window_end TIMESTAMPTZ) AS $$
DECLARE
    v_frequency TEXT;
    v_start_date TIMESTAMPTZ;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
BEGIN
    -- Get goal's recurring contribution frequency
    SELECT 
        (recurring_contribution->>'frequency')::TEXT,
        start_date
    INTO v_frequency, v_start_date
    FROM goals
    WHERE id = p_goal_id;
    
    IF v_frequency IS NULL OR v_frequency = 'none' THEN
        RETURN;
    END IF;
    
    -- Calculate window based on frequency
    CASE v_frequency
        WHEN 'daily' THEN
            v_window_start := date_trunc('day', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '1 day';
        WHEN 'weekly' THEN
            v_window_start := date_trunc('week', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '1 week';
        WHEN 'biweekly' THEN
            v_window_start := date_trunc('week', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '2 weeks';
        WHEN 'monthly' THEN
            v_window_start := date_trunc('month', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '1 month';
        WHEN 'quarterly' THEN
            v_window_start := date_trunc('quarter', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '3 months';
        WHEN 'yearly' THEN
            v_window_start := date_trunc('year', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '1 year';
        ELSE
            -- Default to monthly
            v_window_start := date_trunc('month', p_current_timestamp);
            v_window_end := v_window_start + INTERVAL '1 month';
    END CASE;
    
    RETURN QUERY SELECT v_window_start, v_window_end;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function: Check if execution already exists
CREATE OR REPLACE FUNCTION check_execution_exists(
    p_goal_id UUID,
    p_window_start TIMESTAMPTZ,
    p_window_end TIMESTAMPTZ,
    p_source_event_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 
        FROM recurring_payment_executions
        WHERE goal_id = p_goal_id
          AND billing_window_start = p_window_start
          AND billing_window_end = p_window_end
          AND (p_source_event_id IS NULL OR source_event_id = p_source_event_id)
          AND status IN ('completed', 'executing', 'pending')
    ) INTO v_exists;
    
    RETURN v_exists;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function: Move execution to dead-letter queue
CREATE OR REPLACE FUNCTION move_execution_to_dlq(
    p_execution_id UUID,
    p_failure_category TEXT,
    p_failure_severity TEXT DEFAULT 'medium'
) RETURNS UUID AS $$
DECLARE
    v_execution RECORD;
    v_dlq_id UUID;
BEGIN
    -- Get execution details
    SELECT * INTO v_execution
    FROM recurring_payment_executions
    WHERE id = p_execution_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Execution % not found', p_execution_id;
    END IF;
    
    -- Create dead-letter entry
    INSERT INTO recurring_payment_dead_letters (
        tenant_id,
        execution_id,
        goal_id,
        failure_category,
        failure_severity,
        total_retry_attempts,
        first_failure_at,
        last_failure_at,
        error_summary,
        full_error_log,
        original_payload
    ) VALUES (
        v_execution.tenant_id,
        v_execution.id,
        v_execution.goal_id,
        p_failure_category,
        p_failure_severity,
        v_execution.retry_count,
        v_execution.failed_at,
        NOW(),
        v_execution.last_error,
        v_execution.error_stacktrace,
        jsonb_build_object(
            'goal_id', v_execution.goal_id,
            'billing_window_start', v_execution.billing_window_start,
            'billing_window_end', v_execution.billing_window_end,
            'amount_cents', v_execution.contribution_amount_cents,
            'currency', v_execution.contribution_currency,
            'source_event_id', v_execution.source_event_id
        )
    )
    RETURNING id INTO v_dlq_id;
    
    -- Update execution status
    UPDATE recurring_payment_executions
    SET 
        status = 'dead_letter',
        moved_to_dlq_at = NOW(),
        dlq_reason = p_failure_category,
        updated_at = NOW()
    WHERE id = p_execution_id;
    
    RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function: Remove expired fingerprints
CREATE OR REPLACE FUNCTION cleanup_expired_fingerprints() RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM recurring_payment_fingerprints
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function: Release expired scheduler locks
CREATE OR REPLACE FUNCTION cleanup_expired_scheduler_locks() RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM scheduler_coordination_locks
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- View: Active recurring payments pending execution
CREATE OR REPLACE VIEW v_pending_recurring_payments AS
SELECT 
    rpe.id AS execution_id,
    rpe.tenant_id,
    rpe.goal_id,
    g.title AS goal_title,
    g.user_id,
    rpe.billing_window_start,
    rpe.billing_window_end,
    rpe.contribution_amount_cents,
    rpe.contribution_currency,
    rpe.retry_count,
    rpe.max_retries,
    rpe.status,
    rpe.next_retry_at,
    rpe.scheduled_at,
    g.recurring_contribution,
    g.status AS goal_status
FROM recurring_payment_executions rpe
JOIN goals g ON g.id = rpe.goal_id
WHERE rpe.status IN ('pending', 'failed')
  AND rpe.retry_count < rpe.max_retries
  AND g.status = 'active'
  AND (rpe.next_retry_at IS NULL OR rpe.next_retry_at <= NOW());

-- View: Dead-letter queue summary
CREATE OR REPLACE VIEW v_dead_letter_summary AS
SELECT 
    dlq.id,
    dlq.tenant_id,
    dlq.goal_id,
    g.title AS goal_title,
    dlq.failure_category,
    dlq.failure_severity,
    dlq.status,
    dlq.total_retry_attempts,
    dlq.first_failure_at,
    dlq.last_failure_at,
    dlq.replay_count,
    dlq.replay_success,
    dlq.assigned_to_user_id,
    dlq.created_at
FROM recurring_payment_dead_letters dlq
JOIN goals g ON g.id = dlq.goal_id
WHERE dlq.status IN ('pending_review', 'investigating')
ORDER BY dlq.failure_severity DESC, dlq.created_at DESC;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON recurring_payment_executions TO authenticated;
GRANT SELECT ON recurring_payment_dead_letters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_payment_fingerprints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduler_coordination_locks TO authenticated;
GRANT SELECT ON v_pending_recurring_payments TO authenticated;
GRANT SELECT ON v_dead_letter_summary TO authenticated;

-- Add comment annotations
COMMENT ON TABLE recurring_payment_executions IS 'Tracks recurring payment execution with idempotency constraints to prevent duplication';
COMMENT ON TABLE recurring_payment_dead_letters IS 'Dead-letter queue for failed recurring payments requiring manual intervention';
COMMENT ON TABLE recurring_payment_fingerprints IS 'Execution fingerprint cache for fast replay detection and response caching';
COMMENT ON TABLE scheduler_coordination_locks IS 'Distributed lock coordination for scheduler instances';
COMMENT ON CONSTRAINT unique_execution_per_window ON recurring_payment_executions IS 'Prevents duplicate executions within the same billing window';
