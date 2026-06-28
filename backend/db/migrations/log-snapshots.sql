-- Migration: Add log_snapshots table for regulatory export
-- Issue #648: Log Snapshot for Regulatory Export

-- Create enum for snapshot status
DO $$ BEGIN
    CREATE TYPE snapshot_status AS ENUM ('pending', 'generating', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for snapshot format
DO $$ BEGIN
    CREATE TYPE snapshot_format AS ENUM ('json', 'csv');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create log_snapshots table
CREATE TABLE IF NOT EXISTS log_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status snapshot_status DEFAULT 'pending',
    format snapshot_format DEFAULT 'json',
    bundle_path TEXT,
    checksum TEXT,
    signature TEXT,
    record_count INTEGER DEFAULT 0,
    file_size INTEGER,
    filters JSONB DEFAULT '{}',
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    error_message TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_log_snapshots_tenant ON log_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_log_snapshots_status ON log_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_log_snapshots_created ON log_snapshots(created_at DESC);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_log_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_snapshots_updated_at ON log_snapshots;
CREATE TRIGGER trigger_log_snapshots_updated_at
    BEFORE UPDATE ON log_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_log_snapshots_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON log_snapshots TO app_user;
GRANT USAGE ON SEQUENCE log_snapshots_id_seq TO app_user;