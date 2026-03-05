-- Migration: Cross-Currency Goal Progress with FX Rate Normalization
-- Issue: #570
-- Implements consistent exchange-rate application and multi-currency progress tracking

-- FX Rate Snapshots - Store historical exchange rates with policy lock
CREATE TABLE IF NOT EXISTS fx_rate_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Rate details
    source_currency TEXT NOT NULL, -- Currency being converted FROM
    target_currency TEXT NOT NULL, -- Currency being converted TO (e.g., USD)
    exchange_rate NUMERIC(18, 8) NOT NULL, -- Exchange rate with high precision
    
    -- Timestamp locking
    rate_timestamp TIMESTAMPTZ NOT NULL, -- When this rate applies
    rate_source TEXT NOT NULL DEFAULT 'market', -- 'market', 'manual', 'bank', 'approximation'
    
    -- Policy metadata
    policy_type TEXT NOT NULL DEFAULT 'transaction_time', -- 'transaction_time', 'day_close', 'month_close'
    policy_version INTEGER NOT NULL DEFAULT 1, -- Version of policy used
    
    -- Validity tracking
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Override handling
    is_override BOOLEAN DEFAULT FALSE, -- Manual override of market rate
    override_reason TEXT, -- Why was rate overridden
    overridden_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for FX rates
CREATE INDEX idx_fx_rates_tenant ON fx_rate_snapshots(tenant_id);
CREATE INDEX idx_fx_rates_pair ON fx_rate_snapshots(source_currency, target_currency);
CREATE INDEX idx_fx_rates_timestamp ON fx_rate_snapshots(rate_timestamp);
CREATE INDEX idx_fx_rates_policy ON fx_rate_snapshots(policy_type, policy_version);
CREATE INDEX idx_fx_rates_active ON fx_rate_snapshots(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX idx_fx_rates_policy_timestamp ON fx_rate_snapshots(tenant_id, source_currency, target_currency, rate_timestamp) 
    WHERE is_active = TRUE;

-- FX Conversion Policy - Define how conversions are applied per tenant
CREATE TABLE IF NOT EXISTS fx_conversion_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Policy definition
    policy_type TEXT NOT NULL, -- 'transaction_time', 'day_close', 'month_close'
    policy_name TEXT NOT NULL,
    description TEXT,
    
    -- Configuration
    base_currency TEXT NOT NULL DEFAULT 'USD', -- All amounts normalized to this
    rounding_mode TEXT NOT NULL DEFAULT 'HALF_UP', -- HALF_UP, HALF_DOWN, CEILING, FLOOR
    rounding_decimals INTEGER NOT NULL DEFAULT 2,
    
    -- Rate lookup strategy
    rate_lookup_window_hours INTEGER NOT NULL DEFAULT 24, -- How far back to look for rates
    use_forward_rates BOOLEAN DEFAULT FALSE, -- Allow future rates if current period closed
    fallback_rate_source TEXT DEFAULT 'manual', -- Fallback if market rate unavailable
    
    -- Allowable currencies per tenant
    allowed_currencies JSONB DEFAULT '[]'::jsonb, -- Array of allowed currency codes
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for policies
CREATE INDEX idx_fx_policies_tenant ON fx_conversion_policies(tenant_id);
CREATE INDEX idx_fx_policies_type ON fx_conversion_policies(policy_type);
CREATE INDEX idx_fx_policies_active ON fx_conversion_policies(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX idx_fx_policies_tenant_active ON fx_conversion_policies(tenant_id) 
    WHERE is_active = TRUE AND policy_type = 'transaction_time';

-- Goal Contribution Line Items with FX Normalization
-- This enhances the existing goal_contribution_line_items table
CREATE TABLE IF NOT EXISTS goal_contribution_fx_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_item_id UUID NOT NULL REFERENCES goal_contribution_line_items(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Original amount details
    original_currency TEXT NOT NULL, -- Currency user contributed
    original_amount_cents INTEGER NOT NULL, -- Amount in original currency
    
    -- Normalized details (Base currency)
    base_currency TEXT NOT NULL, -- Policy base currency
    normalized_amount_cents INTEGER NOT NULL, -- Amount converted to base
    
    -- FX details
    fx_rate NUMERIC(18, 8) NOT NULL, -- Rate used for conversion
    fx_rate_id UUID REFERENCES fx_rate_snapshots(id) ON DELETE SET NULL,
    fx_timestamp TIMESTAMPTZ NOT NULL, -- When was rate locked
    policy_type TEXT NOT NULL, -- Which policy determined the rate
    policy_version INTEGER NOT NULL,
    
    -- Tracking
    is_normalized BOOLEAN NOT NULL DEFAULT TRUE,
    normalization_version INTEGER NOT NULL DEFAULT 1,
    
    -- Audit
    normalized_at TIMESTAMPTZ DEFAULT NOW(),
    normalized_by TEXT DEFAULT 'system', -- 'system', 'user_override', 'reconciliation'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for FX details
CREATE INDEX idx_goal_fx_line_item ON goal_contribution_fx_details(line_item_id);
CREATE INDEX idx_goal_fx_goal ON goal_contribution_fx_details(goal_id);
CREATE INDEX idx_goal_fx_tenant ON goal_contribution_fx_details(tenant_id);
CREATE INDEX idx_goal_fx_currency ON goal_contribution_fx_details(original_currency, base_currency);
CREATE INDEX idx_goal_fx_normalized ON goal_contribution_fx_details(is_normalized);

-- FX Reconciliation Audit - Track all FX conversions and corrections
CREATE TABLE IF NOT EXISTS fx_reconciliation_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Context
    reconciliation_type TEXT NOT NULL, -- 'rate_correction', 'policy_change', 'historical_recompute'
    trigger_reason TEXT, -- Why was reconciliation triggered
    
    -- Before state
    previous_total_cents INTEGER NOT NULL,
    previous_normalized_currency TEXT NOT NULL,
    previous_fx_rate_id UUID REFERENCES fx_rate_snapshots(id) ON DELETE SET NULL,
    
    -- After state  
    new_total_cents INTEGER NOT NULL,
    new_normalized_currency TEXT NOT NULL,
    new_fx_rate_id UUID REFERENCES fx_rate_snapshots(id) ON DELETE SET NULL,
    
    -- Impact
    correction_amount_cents INTEGER GENERATED ALWAYS AS (new_total_cents - previous_total_cents) STORED,
    correction_percentage NUMERIC(8, 4) GENERATED ALWAYS AS (
        CASE 
            WHEN previous_total_cents = 0 THEN 0
            ELSE ROUND(((new_total_cents::NUMERIC - previous_total_cents::NUMERIC) / previous_total_cents::NUMERIC) * 100, 4)
        END
    ) STORED,
    affected_contributions INTEGER NOT NULL, -- How many line items affected
    
    -- Affected rates
    old_rate NUMERIC(18, 8),
    new_rate NUMERIC(18, 8),
    rate_change_percentage NUMERIC(8, 4),
    
    -- Metadata
    affected_currencies JSONB DEFAULT '[]'::jsonb, -- Currencies impacted
    manual_override BOOLEAN DEFAULT FALSE,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approval_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for reconciliation
CREATE INDEX idx_reconciliation_tenant ON fx_reconciliation_audit(tenant_id);
CREATE INDEX idx_reconciliation_goal ON fx_reconciliation_audit(goal_id);
CREATE INDEX idx_reconciliation_type ON fx_reconciliation_audit(reconciliation_type);
CREATE INDEX idx_reconciliation_impact ON fx_reconciliation_audit(correction_amount_cents) 
    WHERE correction_amount_cents != 0;
CREATE INDEX idx_reconciliation_created ON fx_reconciliation_audit(created_at DESC);

-- FX Rate Cache - Fast lookup table for most recent rates
CREATE TABLE IF NOT EXISTS fx_rate_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Pair
    source_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    
    -- Most recent data
    latest_rate NUMERIC(18, 8) NOT NULL,
    latest_rate_timestamp TIMESTAMPTZ NOT NULL,
    latest_rate_id UUID REFERENCES fx_rate_snapshots(id) ON DELETE SET NULL,
    
    -- Cache metadata
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 0,
    
    PRIMARY KEY (tenant_id, source_currency, target_currency)
);

-- Indexes for cache
CREATE INDEX idx_fx_cache_expires ON fx_rate_cache(expires_at);

-- Helper function: Get applicable FX rate for a timestamp
CREATE OR REPLACE FUNCTION get_fx_rate_for_timestamp(
    p_tenant_id UUID,
    p_source_currency TEXT,
    p_target_currency TEXT,
    p_timestamp TIMESTAMPTZ,
    p_policy_type TEXT DEFAULT 'transaction_time'
) RETURNS TABLE(
    rate NUMERIC,
    rate_id UUID,
    rate_timestamp TIMESTAMPTZ,
    policy_version INTEGER
) AS $$
DECLARE
    v_rate_record RECORD;
    v_lookup_start TIMESTAMPTZ;
BEGIN
    -- Handle if source = target
    IF p_source_currency = p_target_currency THEN
        RETURN QUERY SELECT 
            1.00000000::NUMERIC,
            NULL::UUID,
            p_timestamp,
            1::INTEGER;
        RETURN;
    END IF;
    
    -- Determine lookup window based on policy
    CASE p_policy_type
        WHEN 'transaction_time' THEN
            -- Use rate at exact transaction time or closest before
            v_lookup_start := p_timestamp - INTERVAL '24 hours';
        WHEN 'day_close' THEN
            -- Use rate at end of day
            v_lookup_start := date_trunc('day', p_timestamp);
        WHEN 'month_close' THEN
            -- Use rate at end of month
            v_lookup_start := date_trunc('month', p_timestamp);
        ELSE
            v_lookup_start := p_timestamp - INTERVAL '24 hours';
    END CASE;
    
    -- Look up most applicable rate
    SELECT * INTO v_rate_record FROM fx_rate_snapshots
    WHERE tenant_id = p_tenant_id
      AND source_currency = p_source_currency
      AND target_currency = p_target_currency
      AND is_active = TRUE
      AND rate_timestamp >= v_lookup_start
      AND rate_timestamp <= p_timestamp
    ORDER BY rate_timestamp DESC
    LIMIT 1;
    
    IF FOUND THEN
        RETURN QUERY SELECT 
            v_rate_record.exchange_rate,
            v_rate_record.id,
            v_rate_record.rate_timestamp,
            v_rate_record.policy_version;
    ELSE
        -- Fallback: use closest available rate
        SELECT * INTO v_rate_record FROM fx_rate_snapshots
        WHERE tenant_id = p_tenant_id
          AND source_currency = p_source_currency
          AND target_currency = p_target_currency
          AND is_active = TRUE
        ORDER BY ABS(EXTRACT(EPOCH FROM (rate_timestamp - p_timestamp)))
        LIMIT 1;
        
        IF FOUND THEN
            RETURN QUERY SELECT 
                v_rate_record.exchange_rate,
                v_rate_record.id,
                v_rate_record.rate_timestamp,
                v_rate_record.policy_version;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function: Normalize amount to base currency
CREATE OR REPLACE FUNCTION normalize_amount_to_base(
    p_tenant_id UUID,
    p_amount_cents INTEGER,
    p_source_currency TEXT,
    p_timestamp TIMESTAMPTZ
) RETURNS TABLE(
    normalized_cents INTEGER,
    fx_rate NUMERIC,
    rate_id UUID
) AS $$
DECLARE
    v_policy RECORD;
    v_rate_record RECORD;
    v_normalized_amount NUMERIC;
BEGIN
    -- Get active policy
    SELECT * INTO v_policy FROM fx_conversion_policies
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active FX policy for tenant %', p_tenant_id;
    END IF;
    
    -- Get applicable rate
    SELECT rate, rate_id, policy_version INTO v_rate_record
    FROM get_fx_rate_for_timestamp(
        p_tenant_id,
        p_source_currency,
        v_policy.base_currency,
        p_timestamp,
        v_policy.policy_type
    );
    
    IF v_rate_record IS NULL THEN
        RAISE EXCEPTION 'No FX rate found for %/% at %', p_source_currency, v_policy.base_currency, p_timestamp;
    END IF;
    
    -- Convert amount
    v_normalized_amount := ROUND((p_amount_cents::NUMERIC * v_rate_record.rate)::NUMERIC, 0);
    
    RETURN QUERY SELECT 
        v_normalized_amount::INTEGER,
        v_rate_record.rate,
        v_rate_record.rate_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Views for monitoring
CREATE OR REPLACE VIEW v_goal_progress_by_currency AS
SELECT 
    g.id AS goal_id,
    g.title,
    gcfd.original_currency,
    gcfd.base_currency,
    COUNT(*) as contribution_count,
    SUM(gcfd.original_amount_cents) as original_total_cents,
    SUM(gcfd.normalized_amount_cents) as normalized_total_cents,
    AVG(gcfd.fx_rate) as avg_fx_rate,
    g.target_amount * 100 as target_cents,
    ROUND((SUM(gcfd.normalized_amount_cents)::NUMERIC / (g.target_amount * 100)::NUMERIC) * 100, 2) as progress_percentage
FROM goals g
LEFT JOIN goal_contribution_line_items gcli ON g.id = gcli.goal_id
LEFT JOIN goal_contribution_fx_details gcfd ON gcli.id = gcfd.line_item_id
GROUP BY g.id, g.title, gcfd.original_currency, gcfd.base_currency, g.target_amount;

CREATE OR REPLACE VIEW v_fx_rate_status AS
SELECT 
    frs.tenant_id,
    frs.source_currency,
    frs.target_currency,
    frs.exchange_rate,
    frs.rate_timestamp,
    frs.policy_type,
    frs.is_override,
    NOW() - frs.rate_timestamp as age,
    COUNT(DISTINCT gcfd.line_item_id) as usage_count
FROM fx_rate_snapshots frs
LEFT JOIN goal_contribution_fx_details gcfd ON frs.id = gcfd.fx_rate_id
WHERE frs.is_active = TRUE
GROUP BY frs.id, frs.tenant_id, frs.source_currency, frs.target_currency, frs.exchange_rate, frs.rate_timestamp, frs.policy_type, frs.is_override
ORDER BY frs.rate_timestamp DESC;

CREATE OR REPLACE VIEW v_fx_reconciliation_impact AS
SELECT 
    tenant_id,
    COUNT(*) as total_reconciliations,
    SUM(CASE WHEN correction_amount_cents != 0 THEN 1 ELSE 0 END) as corrections_applied,
    SUM(ABS(correction_amount_cents)) as total_correction_cents,
    AVG(ABS(correction_percentage)) as avg_correction_percentage,
    MAX(correction_percentage) as max_positive_correction,
    MIN(correction_percentage) as max_negative_correction,
    MAX(created_at) as last_reconciliation
FROM fx_reconciliation_audit
GROUP BY tenant_id;

-- Grants
GRANT SELECT, INSERT, UPDATE ON fx_rate_snapshots TO authenticated;
GRANT SELECT ON fx_conversion_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON goal_contribution_fx_details TO authenticated;
GRANT SELECT ON fx_reconciliation_audit TO authenticated;
GRANT SELECT ON fx_rate_cache TO authenticated;
GRANT SELECT ON v_goal_progress_by_currency TO authenticated;
GRANT SELECT ON v_fx_rate_status TO authenticated;
GRANT SELECT ON v_fx_reconciliation_impact TO authenticated;

-- Comments
COMMENT ON TABLE fx_rate_snapshots IS 'Historical exchange rate snapshots with policy locking to prevent FX distortion';
COMMENT ON TABLE fx_conversion_policies IS 'Tenant-specific FX conversion policies (transaction-time, day-close, month-close)';
COMMENT ON TABLE goal_contribution_fx_details IS 'FX normalization details for multi-currency goal contributions';
COMMENT ON TABLE fx_reconciliation_audit IS 'Audit trail of FX conversions and corrections for compliance';
COMMENT ON FUNCTION get_fx_rate_for_timestamp IS 'Retrieve applicable FX rate for a timestamp based on conversion policy';
COMMENT ON FUNCTION normalize_amount_to_base IS 'Convert amount from source currency to base currency using historical FX';
