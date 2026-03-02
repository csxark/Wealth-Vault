-- Tenant-Aware Log Isolation and Access Controls Migration (#629)
-- Implements row-level security and tenant-scoped access controls for audit logs

-- Enable Row Level Security on audit tables
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Create tenant membership verification function
CREATE OR REPLACE FUNCTION get_user_tenant_memberships(user_uuid UUID)
RETURNS TABLE(tenant_id UUID, role TEXT, status TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT tm.tenant_id, tm.role, tm.status
    FROM tenant_members tm
    WHERE tm.user_id = user_uuid
    AND tm.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policy for audit_logs: Users can only see logs for tenants they belong to
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

-- RLS Policy for audit_anchors: Users can only see anchors for tenants they belong to
CREATE POLICY audit_anchors_tenant_isolation ON audit_anchors
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

-- RLS Policy for security_events: Users can only see events for tenants they belong to
CREATE POLICY security_events_tenant_isolation ON security_events
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

-- Create function to set current user context for RLS
CREATE OR REPLACE FUNCTION set_audit_user_context(user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Set the user ID in a session variable for RLS policies
    PERFORM set_config('app.current_user_id', user_id::TEXT, false);

    -- Log the context setting for audit purposes
    INSERT INTO audit_logs (
        tenant_id,
        actor_user_id,
        action,
        category,
        resource_type,
        resource_id,
        outcome,
        severity,
        metadata
    )
    SELECT
        tm.tenant_id,
        user_id,
        'audit:context:set',
        'security',
        'user',
        user_id::TEXT,
        'success',
        'low',
        jsonb_build_object('context_action', 'set_user_context', 'tenant_count', COUNT(*))
    FROM get_user_tenant_memberships(user_id) tm
    GROUP BY tm.tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clear user context
CREATE OR REPLACE FUNCTION clear_audit_user_context()
RETURNS VOID AS $$
BEGIN
    -- Clear the user ID from session
    PERFORM set_config('app.current_user_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create tenant-scoped audit access control function
CREATE OR REPLACE FUNCTION check_tenant_audit_access(
    user_uuid UUID,
    tenant_uuid UUID,
    required_permissions TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
    has_membership BOOLEAN := FALSE;
    user_permissions TEXT[];
    has_required_perms BOOLEAN := FALSE;
BEGIN
    -- Check if user is a member of the tenant
    SELECT EXISTS(
        SELECT 1 FROM get_user_tenant_memberships(user_uuid)
        WHERE tenant_id = tenant_uuid
    ) INTO has_membership;

    IF NOT has_membership THEN
        RETURN FALSE;
    END IF;

    -- Get user's permissions for this tenant
    SELECT array_agg(rp.permission_key)
    INTO user_permissions
    FROM tenant_members tm
    JOIN tenant_member_roles tmr ON tm.id = tmr.tenant_member_id
    JOIN rbac_role_permissions rp ON tmr.role_id = rp.role_id
    WHERE tm.user_id = user_uuid
    AND tm.tenant_id = tenant_uuid
    AND tm.status = 'active';

    -- Check if user has required permissions
    SELECT required_permissions <@ user_permissions INTO has_required_perms;

    RETURN has_required_perms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit access logging function
CREATE OR REPLACE FUNCTION log_audit_access_attempt(
    user_uuid UUID,
    tenant_uuid UUID,
    action TEXT,
    resource_type TEXT,
    resource_id TEXT,
    success BOOLEAN,
    metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO audit_logs (
        tenant_id,
        actor_user_id,
        action,
        category,
        resource_type,
        resource_id,
        outcome,
        severity,
        metadata
    ) VALUES (
        tenant_uuid,
        user_uuid,
        action,
        'access_control',
        resource_type,
        resource_id,
        CASE WHEN success THEN 'success' ELSE 'failure' END,
        CASE WHEN success THEN 'low' ELSE 'high' END,
        metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for tenant-scoped audit summary
CREATE OR REPLACE VIEW tenant_audit_summary AS
SELECT
    al.tenant_id,
    COUNT(*) as total_logs,
    COUNT(CASE WHEN al.outcome = 'failure' THEN 1 END) as failed_actions,
    COUNT(CASE WHEN al.severity = 'high' THEN 1 END) as high_severity_events,
    COUNT(CASE WHEN al.category = 'security' THEN 1 END) as security_events,
    MAX(al.created_at) as last_activity,
    MIN(al.created_at) as first_activity
FROM audit_logs al
WHERE al.tenant_id IS NOT NULL
GROUP BY al.tenant_id;

-- Grant appropriate permissions
GRANT SELECT ON tenant_audit_summary TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_tenant_memberships(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION set_audit_user_context(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION clear_audit_user_context() TO PUBLIC;
GRANT EXECUTE ON FUNCTION check_tenant_audit_access(UUID, UUID, TEXT[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION log_audit_access_attempt(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO PUBLIC;

-- Create indexes for better performance with RLS
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_actor ON audit_logs(tenant_id, actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_category ON audit_logs(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_anchors_tenant_sealed ON audit_anchors(tenant_id, sealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_tenant_created ON security_events(tenant_id, created_at DESC);

-- Add comments for documentation
COMMENT ON FUNCTION get_user_tenant_memberships(UUID) IS 'Returns active tenant memberships for a user';
COMMENT ON FUNCTION set_audit_user_context(UUID) IS 'Sets the current user context for RLS policies';
COMMENT ON FUNCTION clear_audit_user_context() IS 'Clears the current user context';
COMMENT ON FUNCTION check_tenant_audit_access(UUID, UUID, TEXT[]) IS 'Checks if user has required permissions for tenant audit access';
COMMENT ON FUNCTION log_audit_access_attempt(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB) IS 'Logs audit access attempts for monitoring';
COMMENT ON VIEW tenant_audit_summary IS 'Provides tenant-scoped audit statistics';