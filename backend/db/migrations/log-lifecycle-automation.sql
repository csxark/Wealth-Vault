-- Log Lifecycle Automation with Cold Storage Migration (#633)
-- Automate log migration based on age thresholds (hot → warm → cold tiers)

-- Create storage tiers enum
CREATE TYPE log_storage_tier AS ENUM ('hot', 'warm', 'cold');

-- Create log lifecycle policies table
CREATE TABLE IF NOT EXISTS log_lifecycle_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Policy configuration
    policy_name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Age thresholds in days
    hot_to_warm_threshold INTEGER DEFAULT 30,  -- Move to warm after 30 days
    warm_to_cold_threshold INTEGER DEFAULT 90, -- Move to cold after 90 days total (60 days in warm)
    cold_retention_days INTEGER DEFAULT 365,   -- Delete after 365 days total

    -- Storage tier configurations
    hot_storage_config JSONB DEFAULT '{
        "compression": "none",
        "indexing": "full",
        "access_pattern": "frequent"
    }',
    warm_storage_config JSONB DEFAULT '{
        "compression": "gzip",
        "indexing": "partial",
        "access_pattern": "occasional"
    }',
    cold_storage_config JSONB DEFAULT '{
        "compression": "lz4",
        "indexing": "minimal",
        "access_pattern": "rare"
    }',

    -- Migration settings
    auto_migration_enabled BOOLEAN DEFAULT TRUE,
    migration_batch_size INTEGER DEFAULT 1000,
    migration_schedule VARCHAR(50) DEFAULT '0 2 * * *', -- Daily at 2 AM

    -- Monitoring and alerts
    enable_monitoring BOOLEAN DEFAULT TRUE,
    alert_on_migration_failure BOOLEAN DEFAULT TRUE,
    alert_on_storage_threshold BOOLEAN DEFAULT TRUE,
    storage_threshold_percent DECIMAL(5,2) DEFAULT 80.0,

    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, policy_name),
    INDEX idx_log_lifecycle_policies_tenant (tenant_id),
    INDEX idx_log_lifecycle_policies_schedule (migration_schedule)
);

-- Row Level Security for lifecycle policies
ALTER TABLE log_lifecycle_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY log_lifecycle_policies_tenant_isolation ON log_lifecycle_policies
    FOR ALL USING (tenant_id = current_tenant_id());

-- Create log storage locations table
CREATE TABLE IF NOT EXISTS log_storage_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Storage configuration
    storage_tier log_storage_tier NOT NULL,
    storage_type VARCHAR(50) NOT NULL DEFAULT 'database', -- 'database', 's3', 'azure_blob', 'gcs'
    connection_string TEXT, -- For external storage
    bucket_name VARCHAR(100), -- For cloud storage
    region VARCHAR(50), -- For cloud storage

    -- Storage limits and costs
    max_size_gb INTEGER,
    current_size_gb DECIMAL(10,2) DEFAULT 0,
    estimated_cost_per_gb DECIMAL(8,4),

    -- Access patterns
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    health_status VARCHAR(20) DEFAULT 'healthy', -- 'healthy', 'degraded', 'unavailable'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, storage_tier, storage_type),
    INDEX idx_log_storage_locations_tenant_tier (tenant_id, storage_tier),
    INDEX idx_log_storage_locations_active (is_active)
);

-- Row Level Security for storage locations
ALTER TABLE log_storage_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY log_storage_locations_tenant_isolation ON log_storage_locations
    FOR ALL USING (tenant_id = current_tenant_id());

-- Add storage tier column to audit_logs table
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS storage_tier log_storage_tier DEFAULT 'hot',
ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS original_location_id UUID REFERENCES log_storage_locations(id),
ADD COLUMN IF NOT EXISTS lifecycle_policy_id UUID REFERENCES log_lifecycle_policies(id);

-- Create indexes for lifecycle management
CREATE INDEX IF NOT EXISTS idx_audit_logs_storage_tier ON audit_logs(storage_tier);
CREATE INDEX IF NOT EXISTS idx_audit_logs_migrated_at ON audit_logs(migrated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_lifecycle_policy ON audit_logs(lifecycle_policy_id);

-- Create log migration history table
CREATE TABLE IF NOT EXISTS log_migration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Migration details
    migration_batch_id UUID NOT NULL,
    lifecycle_policy_id UUID REFERENCES log_lifecycle_policies(id),

    -- Source and destination
    source_tier log_storage_tier NOT NULL,
    destination_tier log_storage_tier NOT NULL,
    source_location_id UUID REFERENCES log_storage_locations(id),
    destination_location_id UUID REFERENCES log_storage_locations(id),

    -- Migration statistics
    logs_migrated_count INTEGER DEFAULT 0,
    data_size_bytes BIGINT DEFAULT 0,
    compression_ratio DECIMAL(5,2),
    migration_duration_ms INTEGER,

    -- Status and errors
    status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'failed', 'partial'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    INDEX idx_log_migration_history_tenant_batch (tenant_id, migration_batch_id),
    INDEX idx_log_migration_history_status (status),
    INDEX idx_log_migration_history_started_at (started_at)
);

-- Row Level Security for migration history
ALTER TABLE log_migration_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY log_migration_history_tenant_isolation ON log_migration_history
    FOR ALL USING (tenant_id = current_tenant_id());

-- Create log lifecycle monitoring table
CREATE TABLE IF NOT EXISTS log_lifecycle_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Monitoring period
    monitoring_date DATE NOT NULL,
    lifecycle_policy_id UUID REFERENCES log_lifecycle_policies(id),

    -- Storage statistics by tier
    hot_logs_count INTEGER DEFAULT 0,
    hot_data_size_gb DECIMAL(10,2) DEFAULT 0,
    warm_logs_count INTEGER DEFAULT 0,
    warm_data_size_gb DECIMAL(10,2) DEFAULT 0,
    cold_logs_count INTEGER DEFAULT 0,
    cold_data_size_gb DECIMAL(10,2) DEFAULT 0,

    -- Migration statistics
    migrations_completed INTEGER DEFAULT 0,
    migrations_failed INTEGER DEFAULT 0,
    total_migrated_logs INTEGER DEFAULT 0,
    total_migrated_size_gb DECIMAL(10,2) DEFAULT 0,

    -- Performance metrics
    average_migration_time_ms INTEGER,
    storage_cost_estimate DECIMAL(10,2),

    -- Threshold alerts
    hot_storage_threshold_exceeded BOOLEAN DEFAULT FALSE,
    warm_storage_threshold_exceeded BOOLEAN DEFAULT FALSE,
    cold_storage_threshold_exceeded BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, monitoring_date, lifecycle_policy_id),
    INDEX idx_log_lifecycle_monitoring_tenant_date (tenant_id, monitoring_date),
    INDEX idx_log_lifecycle_monitoring_thresholds (
        hot_storage_threshold_exceeded,
        warm_storage_threshold_exceeded,
        cold_storage_threshold_exceeded
    )
);

-- Row Level Security for lifecycle monitoring
ALTER TABLE log_lifecycle_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY log_lifecycle_monitoring_tenant_isolation ON log_lifecycle_monitoring
    FOR ALL USING (tenant_id = current_tenant_id());

-- Create function to get logs eligible for migration
CREATE OR REPLACE FUNCTION get_logs_for_migration(
    p_tenant_id UUID,
    p_source_tier log_storage_tier,
    p_destination_tier log_storage_tier,
    p_age_threshold_days INTEGER,
    p_batch_size INTEGER DEFAULT 1000
)
RETURNS TABLE (
    log_id UUID,
    performed_at TIMESTAMP WITH TIME ZONE,
    storage_tier log_storage_tier,
    data_size_bytes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.performed_at,
        al.storage_tier,
        pg_column_size(al.*) as data_size_bytes
    FROM audit_logs al
    WHERE al.tenant_id = p_tenant_id
      AND al.storage_tier = p_source_tier
      AND al.performed_at < NOW() - INTERVAL '1 day' * p_age_threshold_days
    ORDER BY al.performed_at ASC
    LIMIT p_batch_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update log storage tier
CREATE OR REPLACE FUNCTION update_log_storage_tier(
    p_log_ids UUID[],
    p_new_tier log_storage_tier,
    p_migration_batch_id UUID,
    p_destination_location_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE audit_logs
    SET
        storage_tier = p_new_tier,
        migrated_at = NOW(),
        original_location_id = COALESCE(p_destination_location_id, original_location_id)
    WHERE id = ANY(p_log_ids)
      AND storage_tier != p_new_tier;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to calculate storage tier statistics
CREATE OR REPLACE FUNCTION calculate_storage_tier_stats(
    p_tenant_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    storage_tier log_storage_tier,
    logs_count BIGINT,
    data_size_gb DECIMAL,
    oldest_log_age_days INTEGER,
    newest_log_age_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.storage_tier,
        COUNT(*) as logs_count,
        (SUM(pg_column_size(al.*)) / 1024.0 / 1024.0 / 1024.0)::DECIMAL(10,2) as data_size_gb,
        EXTRACT(EPOCH FROM (NOW() - MIN(al.performed_at)))::INTEGER / 86400 as oldest_log_age_days,
        EXTRACT(EPOCH FROM (NOW() - MAX(al.performed_at)))::INTEGER / 86400 as newest_log_age_days
    FROM audit_logs al
    WHERE al.tenant_id = p_tenant_id
      AND DATE(al.performed_at) <= p_date
    GROUP BY al.storage_tier
    ORDER BY al.storage_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old logs based on retention policy
CREATE OR REPLACE FUNCTION cleanup_expired_logs(
    p_tenant_id UUID,
    p_retention_days INTEGER DEFAULT 365
)
RETURNS TABLE (
    deleted_count INTEGER,
    freed_space_gb DECIMAL
) AS $$
DECLARE
    v_deleted_count INTEGER := 0;
    v_freed_space BIGINT := 0;
BEGIN
    -- Calculate space that will be freed
    SELECT
        COUNT(*),
        COALESCE(SUM(pg_column_size(al.*)), 0)
    INTO v_deleted_count, v_freed_space
    FROM audit_logs al
    WHERE al.tenant_id = p_tenant_id
      AND al.storage_tier = 'cold'
      AND al.performed_at < NOW() - INTERVAL '1 day' * p_retention_days;

    -- Delete expired logs
    DELETE FROM audit_logs
    WHERE tenant_id = p_tenant_id
      AND storage_tier = 'cold'
      AND performed_at < NOW() - INTERVAL '1 day' * p_retention_days;

    -- Return statistics
    RETURN QUERY SELECT v_deleted_count, (v_freed_space / 1024.0 / 1024.0 / 1024.0)::DECIMAL(10,2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default lifecycle policy for each tenant
INSERT INTO log_lifecycle_policies (
    tenant_id,
    policy_name,
    description,
    hot_to_warm_threshold,
    warm_to_cold_threshold,
    cold_retention_days
)
SELECT
    t.id as tenant_id,
    'Default Lifecycle Policy' as policy_name,
    'Default automated log lifecycle management policy' as description,
    30 as hot_to_warm_threshold,   -- 30 days
    90 as warm_to_cold_threshold,  -- 90 days total (60 days in warm)
    365 as cold_retention_days     -- 365 days total retention
FROM tenants t
ON CONFLICT (tenant_id, policy_name) DO NOTHING;

-- Insert default storage locations
INSERT INTO log_storage_locations (
    tenant_id,
    storage_tier,
    storage_type,
    max_size_gb,
    estimated_cost_per_gb
)
SELECT
    t.id as tenant_id,
    'hot'::log_storage_tier as storage_tier,
    'database' as storage_type,
    100 as max_size_gb,
    0.10 as estimated_cost_per_gb
FROM tenants t
UNION ALL
SELECT
    t.id as tenant_id,
    'warm'::log_storage_tier as storage_tier,
    'database' as storage_type,
    500 as max_size_gb,
    0.05 as estimated_cost_per_gb
FROM tenants t
UNION ALL
SELECT
    t.id as tenant_id,
    'cold'::log_storage_tier as storage_tier,
    'database' as storage_type,
    2000 as max_size_gb,
    0.02 as estimated_cost_per_gb
FROM tenants t
ON CONFLICT (tenant_id, storage_tier, storage_type) DO NOTHING;</content>
<parameter name="filePath">c:\Users\Gupta\Downloads\Wealth-Vault\backend\db\migrations\log-lifecycle-automation.sql