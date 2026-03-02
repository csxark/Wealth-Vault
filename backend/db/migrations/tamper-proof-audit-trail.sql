-- Tamper-Proof Audit Trail Migration (#627)
-- Implements append-only logging with cryptographic hash chaining and periodic Merkle root anchoring

-- Create audit integrity triggers to prevent tampering
CREATE OR REPLACE FUNCTION prevent_audit_log_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow inserts only
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Prevent updates and deletes
    RAISE EXCEPTION 'Audit logs are append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_audit_anchor_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow inserts only
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Prevent updates and deletes
    RAISE EXCEPTION 'Audit anchors are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to audit tables
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_updates();

DROP TRIGGER IF EXISTS audit_anchors_immutable ON audit_anchors;
CREATE TRIGGER audit_anchors_immutable
    BEFORE UPDATE OR DELETE ON audit_anchors
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_anchor_updates();

-- Add hash chain validation function
CREATE OR REPLACE FUNCTION validate_audit_hash_chain(tenant_uuid UUID DEFAULT NULL)
RETURNS TABLE(
    tenant_id UUID,
    total_logs BIGINT,
    chain_breaks BIGINT,
    hash_mismatches BIGINT,
    is_integrity_ok BOOLEAN
) AS $$
DECLARE
    log_record RECORD;
    expected_prev_hash TEXT := NULL;
    computed_hash TEXT;
    chain_break_count BIGINT := 0;
    hash_mismatch_count BIGINT := 0;
    total_count BIGINT := 0;
BEGIN
    FOR log_record IN
        SELECT
            al.id,
            al.tenant_id,
            al.actor_user_id,
            al.action,
            al.category,
            al.resource_type,
            al.resource_id,
            al.method,
            al.path,
            al.status_code,
            al.outcome,
            al.severity,
            al.ip_address,
            al.user_agent,
            al.request_id,
            al.metadata,
            al.changes,
            al.previous_hash,
            al.entry_hash,
            al.created_at
        FROM audit_logs al
        WHERE (tenant_uuid IS NULL AND al.tenant_id IS NULL) OR al.tenant_id = tenant_uuid
        ORDER BY al.created_at, al.id
    LOOP
        total_count := total_count + 1;

        -- Check chain continuity
        IF log_record.previous_hash IS DISTINCT FROM expected_prev_hash THEN
            chain_break_count := chain_break_count + 1;
        END IF;

        -- Validate entry hash
        computed_hash := encode(
            digest(
                COALESCE(log_record.previous_hash, 'ROOT') ||
                json_build_object(
                    'tenantId', log_record.tenant_id,
                    'actorUserId', log_record.actor_user_id,
                    'action', log_record.action,
                    'category', log_record.category,
                    'resourceType', log_record.resource_type,
                    'resourceId', log_record.resource_id,
                    'method', log_record.method,
                    'path', log_record.path,
                    'statusCode', log_record.status_code,
                    'outcome', log_record.outcome,
                    'severity', log_record.severity,
                    'ipAddress', log_record.ip_address,
                    'userAgent', log_record.user_agent,
                    'requestId', log_record.request_id,
                    'metadata', log_record.metadata,
                    'changes', log_record.changes
                )::text,
                'sha256'
            ),
            'hex'
        );

        IF computed_hash != log_record.entry_hash THEN
            hash_mismatch_count := hash_mismatch_count + 1;
        END IF;

        expected_prev_hash := log_record.entry_hash;
    END LOOP;

    RETURN QUERY SELECT
        tenant_uuid,
        total_count,
        chain_break_count,
        hash_mismatch_count,
        (chain_break_count = 0 AND hash_mismatch_count = 0)::BOOLEAN;
END;
$$ LANGUAGE plpgsql;

-- Add function to get latest Merkle root for external anchoring
CREATE OR REPLACE FUNCTION get_latest_merkle_root(tenant_uuid UUID DEFAULT NULL)
RETURNS TABLE(
    tenant_id UUID,
    merkle_root TEXT,
    sealed_at TIMESTAMP,
    event_count INTEGER,
    anchor_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        aa.tenant_id,
        aa.merkle_root,
        aa.sealed_at,
        aa.event_count,
        aa.id
    FROM audit_anchors aa
    WHERE (tenant_uuid IS NULL AND aa.tenant_id IS NULL) OR aa.tenant_id = tenant_uuid
    ORDER BY aa.sealed_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for better performance on integrity checks
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entry_hash ON audit_logs(entry_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_previous_hash ON audit_logs(previous_hash);
CREATE INDEX IF NOT EXISTS idx_audit_anchors_tenant_sealed ON audit_anchors(tenant_id, sealed_at DESC);

-- Add comments for documentation
COMMENT ON FUNCTION prevent_audit_log_updates() IS 'Prevents any updates or deletes on audit_logs table to ensure append-only behavior';
COMMENT ON FUNCTION prevent_audit_anchor_updates() IS 'Prevents any updates or deletes on audit_anchors table to ensure immutability';
COMMENT ON FUNCTION validate_audit_hash_chain(UUID) IS 'Validates the cryptographic hash chain integrity for audit logs';
COMMENT ON FUNCTION get_latest_merkle_root(UUID) IS 'Retrieves the latest Merkle root for external anchoring';