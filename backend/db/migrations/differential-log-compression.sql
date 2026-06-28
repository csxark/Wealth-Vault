-- Differential Log Compression Strategy (#632)
-- Schema-aware compression with delta encoding for repetitive metadata fields

-- Create compressed audit logs table
CREATE TABLE IF NOT EXISTS compressed_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    original_log_id UUID REFERENCES audit_logs(id) ON DELETE SET NULL,

    -- Compressed data
    compressed_data TEXT NOT NULL, -- Base64 encoded compressed JSON

    -- Compression metadata
    original_size INTEGER NOT NULL, -- Size in bytes before compression
    compressed_size INTEGER NOT NULL, -- Size in bytes after compression
    compression_ratio DECIMAL(5,2) NOT NULL, -- Original/Compressed ratio

    -- Compression flags
    is_delta_encoded BOOLEAN DEFAULT FALSE,
    dictionary_hits INTEGER DEFAULT 0,
    base_log_id UUID REFERENCES compressed_audit_logs(id), -- For delta encoding

    -- Compression statistics
    compression_method VARCHAR(50) DEFAULT 'differential', -- 'differential', 'gzip', 'lz4', etc.
    compression_level INTEGER DEFAULT 6, -- Compression level used

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    compressed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for efficient querying
    INDEX idx_compressed_audit_logs_tenant_id (tenant_id),
    INDEX idx_compressed_audit_logs_created_at (created_at),
    INDEX idx_compressed_audit_logs_original_log_id (original_log_id),
    INDEX idx_compressed_audit_logs_compression_ratio (compression_ratio),
    INDEX idx_compressed_audit_logs_is_delta_encoded (is_delta_encoded)
);

-- Row Level Security policies
ALTER TABLE compressed_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy for tenant isolation
CREATE POLICY compressed_audit_logs_tenant_isolation ON compressed_audit_logs
    FOR ALL USING (tenant_id = current_tenant_id());

-- Create compression statistics table
CREATE TABLE IF NOT EXISTS compression_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Time period
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Compression metrics
    total_logs_processed INTEGER DEFAULT 0,
    total_original_size BIGINT DEFAULT 0, -- Total size in bytes before compression
    total_compressed_size BIGINT DEFAULT 0, -- Total size in bytes after compression
    average_compression_ratio DECIMAL(5,2) DEFAULT 0,

    -- Delta encoding metrics
    delta_encoded_count INTEGER DEFAULT 0,
    delta_encoding_rate DECIMAL(5,2) DEFAULT 0, -- Percentage of logs delta encoded

    -- Dictionary metrics
    dictionary_hits INTEGER DEFAULT 0,
    dictionary_efficiency DECIMAL(5,2) DEFAULT 0, -- Percentage of fields compressed via dictionary

    -- Performance metrics
    average_compression_time DECIMAL(8,4) DEFAULT 0, -- Average time in milliseconds
    compression_failures INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, period_start, period_end),
    INDEX idx_compression_statistics_tenant_period (tenant_id, period_start, period_end),
    INDEX idx_compression_statistics_created_at (created_at)
);

-- Row Level Security for compression statistics
ALTER TABLE compression_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY compression_statistics_tenant_isolation ON compression_statistics
    FOR ALL USING (tenant_id = current_tenant_id());

-- Create compression dictionaries table for persistent storage
CREATE TABLE IF NOT EXISTS compression_dictionaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Dictionary metadata
    dictionary_name VARCHAR(100) NOT NULL, -- 'actions', 'user_agents', 'ip_addresses', etc.
    dictionary_version INTEGER DEFAULT 1,

    -- Dictionary data (JSON object mapping values to IDs)
    dictionary_data JSONB NOT NULL,

    -- Statistics
    entry_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, dictionary_name, dictionary_version),
    INDEX idx_compression_dictionaries_tenant_name (tenant_id, dictionary_name),
    INDEX idx_compression_dictionaries_last_updated (last_updated)
);

-- Row Level Security for compression dictionaries
ALTER TABLE compression_dictionaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY compression_dictionaries_tenant_isolation ON compression_dictionaries
    FOR ALL USING (tenant_id = current_tenant_id());

-- Create function to get current tenant compression statistics
CREATE OR REPLACE FUNCTION get_tenant_compression_stats(
    p_tenant_id UUID,
    p_period_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
    total_logs BIGINT,
    total_original_size BIGINT,
    total_compressed_size BIGINT,
    average_ratio DECIMAL,
    delta_rate DECIMAL,
    dictionary_efficiency DECIMAL,
    storage_savings_percent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(cs.total_logs_processed), 0)::BIGINT as total_logs,
        COALESCE(SUM(cs.total_original_size), 0)::BIGINT as total_original_size,
        COALESCE(SUM(cs.total_compressed_size), 0)::BIGINT as total_compressed_size,
        COALESCE(AVG(cs.average_compression_ratio), 0)::DECIMAL as average_ratio,
        COALESCE(AVG(cs.delta_encoding_rate), 0)::DECIMAL as delta_rate,
        COALESCE(AVG(cs.dictionary_efficiency), 0)::DECIMAL as dictionary_efficiency,
        CASE
            WHEN SUM(cs.total_original_size) > 0 THEN
                ((SUM(cs.total_original_size) - SUM(cs.total_compressed_size))::DECIMAL /
                 SUM(cs.total_original_size) * 100)::DECIMAL
            ELSE 0
        END as storage_savings_percent
    FROM compression_statistics cs
    WHERE cs.tenant_id = p_tenant_id
      AND cs.period_end >= NOW() - INTERVAL '1 hour' * p_period_hours;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to compress log entry (called from application)
CREATE OR REPLACE FUNCTION compress_audit_log(
    p_tenant_id UUID,
    p_log_data JSONB,
    p_compression_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_compressed_id UUID;
    v_compressed_data TEXT;
    v_original_size INTEGER;
    v_compressed_size INTEGER;
    v_compression_ratio DECIMAL(5,2);
    v_is_delta_encoded BOOLEAN := FALSE;
    v_dictionary_hits INTEGER := 0;
    v_base_log_id UUID := NULL;
BEGIN
    -- Extract compression metadata
    v_compressed_data := p_compression_metadata->>'compressed';
    v_original_size := (p_compression_metadata->>'originalSize')::INTEGER;
    v_compressed_size := (p_compression_metadata->>'compressedSize')::INTEGER;
    v_compression_ratio := (p_compression_metadata->>'compressionRatio')::DECIMAL(5,2);
    v_is_delta_encoded := (p_compression_metadata->>'isDeltaEncoded')::BOOLEAN;
    v_dictionary_hits := (p_compression_metadata->>'dictionaryHits')::INTEGER;

    -- If base ID provided for delta encoding, resolve it
    IF v_is_delta_encoded AND p_compression_metadata->>'baseId' IS NOT NULL THEN
        SELECT id INTO v_base_log_id
        FROM compressed_audit_logs
        WHERE tenant_id = p_tenant_id
          AND id = (p_compression_metadata->>'baseId')::UUID;
    END IF;

    -- Insert compressed log entry
    INSERT INTO compressed_audit_logs (
        tenant_id,
        compressed_data,
        original_size,
        compressed_size,
        compression_ratio,
        is_delta_encoded,
        dictionary_hits,
        base_log_id,
        compression_method,
        compression_level
    ) VALUES (
        p_tenant_id,
        v_compressed_data,
        v_original_size,
        v_compressed_size,
        v_compression_ratio,
        v_is_delta_encoded,
        v_dictionary_hits,
        v_base_log_id,
        'differential',
        6
    ) RETURNING id INTO v_compressed_id;

    RETURN v_compressed_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to decompress log entry
CREATE OR REPLACE FUNCTION decompress_audit_log(
    p_compressed_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_compressed_record RECORD;
    v_decompressed_data JSONB;
BEGIN
    -- Get compressed record
    SELECT * INTO v_compressed_record
    FROM compressed_audit_logs
    WHERE id = p_compressed_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compressed log entry not found: %', p_compressed_id;
    END IF;

    -- For now, return the compressed data (decompression happens in application)
    -- In a full implementation, this would handle decompression in SQL
    v_decompressed_data := jsonb_build_object(
        'compressed_data', v_compressed_record.compressed_data,
        'metadata', jsonb_build_object(
            'original_size', v_compressed_record.original_size,
            'compressed_size', v_compressed_record.compressed_size,
            'compression_ratio', v_compressed_record.compression_ratio,
            'is_delta_encoded', v_compressed_record.is_delta_encoded,
            'dictionary_hits', v_compressed_record.dictionary_hits,
            'base_log_id', v_compressed_record.base_log_id
        )
    );

    RETURN v_decompressed_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update compression statistics
CREATE OR REPLACE FUNCTION update_compression_statistics(
    p_tenant_id UUID,
    p_period_start TIMESTAMP WITH TIME ZONE,
    p_period_end TIMESTAMP WITH TIME ZONE,
    p_stats JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO compression_statistics (
        tenant_id,
        period_start,
        period_end,
        total_logs_processed,
        total_original_size,
        total_compressed_size,
        average_compression_ratio,
        delta_encoded_count,
        delta_encoding_rate,
        dictionary_hits,
        dictionary_efficiency,
        average_compression_time,
        compression_failures
    ) VALUES (
        p_tenant_id,
        p_period_start,
        p_period_end,
        (p_stats->>'totalLogsProcessed')::INTEGER,
        (p_stats->>'totalOriginalSize')::BIGINT,
        (p_stats->>'totalCompressedSize')::BIGINT,
        (p_stats->>'compressionRatio')::DECIMAL,
        (p_stats->>'deltaEncodedCount')::INTEGER,
        (p_stats->>'deltaEncodingRate')::DECIMAL,
        (p_stats->>'dictionaryHits')::INTEGER,
        (p_stats->>'dictionaryEfficiency')::DECIMAL,
        (p_stats->>'averageCompressionTime')::DECIMAL,
        (p_stats->>'compressionFailures')::INTEGER
    )
    ON CONFLICT (tenant_id, period_start, period_end)
    DO UPDATE SET
        total_logs_processed = EXCLUDED.total_logs_processed,
        total_original_size = EXCLUDED.total_original_size,
        total_compressed_size = EXCLUDED.total_compressed_size,
        average_compression_ratio = EXCLUDED.average_compression_ratio,
        delta_encoded_count = EXCLUDED.delta_encoded_count,
        delta_encoding_rate = EXCLUDED.delta_encoding_rate,
        dictionary_hits = EXCLUDED.dictionary_hits,
        dictionary_efficiency = EXCLUDED.dictionary_efficiency,
        average_compression_time = EXCLUDED.average_compression_time,
        compression_failures = EXCLUDED.compression_failures;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old compression statistics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_compression_statistics()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM compression_statistics
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create index for efficient compression queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compressed_audit_logs_tenant_created_at
ON compressed_audit_logs (tenant_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compressed_audit_logs_compression_ratio_desc
ON compressed_audit_logs (compression_ratio DESC);

-- Add comments for documentation
COMMENT ON TABLE compressed_audit_logs IS 'Stores compressed audit log entries using differential encoding and schema-aware compression';
COMMENT ON TABLE compression_statistics IS 'Tracks compression performance and efficiency metrics over time';
COMMENT ON TABLE compression_dictionaries IS 'Persistent storage for compression dictionaries used in log compression';

COMMENT ON FUNCTION get_tenant_compression_stats(UUID, INTEGER) IS 'Returns compression statistics for a tenant over the specified period';
COMMENT ON FUNCTION compress_audit_log(UUID, JSONB, JSONB) IS 'Stores a compressed audit log entry in the database';
COMMENT ON FUNCTION decompress_audit_log(UUID) IS 'Retrieves and prepares a compressed log entry for decompression';
COMMENT ON FUNCTION update_compression_statistics(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, JSONB) IS 'Updates compression statistics for a time period';
COMMENT ON FUNCTION cleanup_compression_statistics() IS 'Removes old compression statistics to maintain database performance';