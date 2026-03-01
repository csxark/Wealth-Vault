-- Migration 0015: Portfolio Rebalancing with Tax-Loss Harvesting
-- Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting

-- Table: portfolio_holdings (multi-currency asset holdings)
CREATE TABLE portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Asset identification
    asset_symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Holdings
    quantity NUMERIC(18, 8) NOT NULL,
    acquisition_cost NUMERIC(18, 2) NOT NULL,
    current_value NUMERIC(18, 2) NOT NULL,
    
    -- Cost basis tracking
    cost_basis_history JSONB DEFAULT '{}'::jsonb,
    average_cost_per_unit NUMERIC(18, 8) NOT NULL,
    
    -- Gains/Losses
    unrealized_gain NUMERIC(18, 2) NOT NULL DEFAULT 0,
    unrealized_gain_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    realized_gain NUMERIC(18, 2) NOT NULL DEFAULT 0,
    
    -- Tax tracking
    tax_lot_ids TEXT[],
    holding_period VARCHAR(20),
    is_long_term BOOLEAN DEFAULT false,
    
    -- Timestamps
    last_price_update TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT quarterly_quantity_positive CHECK (quantity > 0)
);

-- Indexing portfolio_holdings
CREATE INDEX idx_portfolio_holdings_user_asset ON portfolio_holdings(user_id, asset_symbol);
CREATE INDEX idx_portfolio_holdings_tenant ON portfolio_holdings(tenant_id);
CREATE INDEX idx_portfolio_holdings_updated ON portfolio_holdings(updated_at DESC);
CREATE INDEX idx_portfolio_holdings_unrealized ON portfolio_holdings(user_id, unrealized_gain) 
    WHERE unrealized_gain > 0;

-- Table: allocation_targets (portfolio allocation targets)
CREATE TABLE allocation_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Target definition
    target_name VARCHAR(100) NOT NULL,
    description TEXT,
    strategy VARCHAR(50) NOT NULL,
    risk_profile VARCHAR(20) NOT NULL,
    
    -- Allocation breakdown
    allocations JSONB NOT NULL,
    rebalancing_threshold NUMERIC(3, 2) NOT NULL DEFAULT 0.05,
    
    -- Rebalancing config
    auto_rebalance BOOLEAN DEFAULT false,
    rebalance_frequency VARCHAR(20),
    rebalance_day INTEGER,
    next_rebalance_date TIMESTAMP,
    
    -- Tax optimization
    tax_optimization BOOLEAN DEFAULT true,
    prefer_tax_loss BOOLEAN DEFAULT true,
    min_gain_for_realization NUMERIC(18, 2) DEFAULT 100,
    
    -- Cost control
    max_transaction_cost NUMERIC(18, 2),
    max_slippage NUMERIC(5, 2) DEFAULT 0.50,
    preferred_exchanges TEXT[],
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexing allocation_targets
CREATE UNIQUE INDEX idx_allocation_targets_user_strategy 
    ON allocation_targets(user_id, strategy) WHERE is_active;
CREATE INDEX idx_allocation_targets_tenant ON allocation_targets(tenant_id);
CREATE INDEX idx_allocation_targets_auto_rebalance 
    ON allocation_targets(user_id, next_rebalance_date) 
    WHERE auto_rebalance = true;

-- Table: rebalancing_recommendations (rebalancing suggestions)
CREATE TABLE rebalancing_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allocation_target_id UUID NOT NULL REFERENCES allocation_targets(id) ON DELETE CASCADE,
    
    -- Portfolio state
    portfolio_value NUMERIC(18, 2) NOT NULL,
    current_allocations JSONB NOT NULL,
    target_allocations JSONB NOT NULL,
    deviations JSONB NOT NULL,
    
    -- Rebalancing moves
    moves JSONB NOT NULL,
    estimated_cost NUMERIC(18, 2) NOT NULL,
    estimated_slippage NUMERIC(18, 2) NOT NULL,
    tax_impact JSONB NOT NULL,
    
    -- Tax harvesting
    tax_harvesting_moves JSONB NOT NULL,
    harvestable_losses NUMERIC(18, 2) DEFAULT 0,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    actioned_at TIMESTAMP,
    rejection_reason TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexing rebalancing_recommendations
CREATE INDEX idx_rebalancing_rec_user_status 
    ON rebalancing_recommendations(user_id, status, created_at DESC);
CREATE INDEX idx_rebalancing_rec_status ON rebalancing_recommendations(status);
CREATE INDEX idx_rebalancing_rec_expires ON rebalancing_recommendations(expires_at) 
    WHERE status IN ('pending', 'approved');

-- Table: rebalancing_transactions (executed rebalancing moves)
CREATE TABLE rebalancing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES rebalancing_recommendations(id) ON DELETE SET NULL,
    
    -- Transaction details
    transaction_type VARCHAR(20) NOT NULL,
    from_asset VARCHAR(20) NOT NULL,
    to_asset VARCHAR(20) NOT NULL,
    from_quantity NUMERIC(18, 8) NOT NULL,
    to_quantity NUMERIC(18, 8) NOT NULL,
    execution_price NUMERIC(18, 8) NOT NULL,
    
    -- Costs and fees
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    transaction_fee NUMERIC(18, 2) NOT NULL DEFAULT 0,
    fee_type VARCHAR(20),
    exchange_rate NUMERIC(18, 8),
    slippage NUMERIC(18, 2) NOT NULL DEFAULT 0,
    
    -- Tax implications
    realized_gain NUMERIC(18, 2) DEFAULT 0,
    realized_loss NUMERIC(18, 2) DEFAULT 0,
    gain_type VARCHAR(20),
    is_tax_harvest BOOLEAN DEFAULT false,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    executed_at TIMESTAMP,
    confirmation_hash VARCHAR(255),
    
    -- Metadata
    exchange_name VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexing rebalancing_transactions
CREATE INDEX idx_rebalancing_tx_user_date 
    ON rebalancing_transactions(user_id, executed_at DESC);
CREATE INDEX idx_rebalancing_tx_status ON rebalancing_transactions(status);
CREATE INDEX idx_rebalancing_tx_assets 
    ON rebalancing_transactions(from_asset, to_asset);
CREATE INDEX idx_rebalancing_tx_tax_harvest 
    ON rebalancing_transactions(user_id, is_tax_harvest) 
    WHERE is_tax_harvest = true;

-- Table: tax_lots (specific asset purchase lots for tax purposes)
CREATE TABLE tax_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    holding_id UUID REFERENCES portfolio_holdings(id) ON DELETE CASCADE,
    
    -- Lot identification
    asset_symbol VARCHAR(20) NOT NULL,
    quantity NUMERIC(18, 8) NOT NULL,
    cost_basis NUMERIC(18, 2) NOT NULL,
    cost_per_unit NUMERIC(18, 8) NOT NULL,
    acquisition_date TIMESTAMP NOT NULL,
    
    -- Current valuation
    current_value NUMERIC(18, 2) NOT NULL,
    unrealized_gain NUMERIC(18, 2) NOT NULL,
    gain_percent NUMERIC(7, 2) NOT NULL,
    
    -- Holding period
    purchase_date TIMESTAMP NOT NULL,
    is_long_term BOOLEAN NOT NULL,
    days_held INTEGER NOT NULL,
    
    -- Tax harvesting
    can_be_harvested BOOLEAN DEFAULT true,
    harvest_priority INTEGER DEFAULT 100,
    last_harvested_at TIMESTAMP,
    wash_sale_exclude_until TIMESTAMP,
    
    -- Disposition
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    sell_date TIMESTAMP,
    realized_gain NUMERIC(18, 2) DEFAULT 0,
    realized_loss NUMERIC(18, 2) DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT quantity_positive CHECK (quantity > 0)
);

-- Indexing tax_lots
CREATE INDEX idx_tax_lots_user_asset 
    ON tax_lots(user_id, asset_symbol, status);
CREATE INDEX idx_tax_lots_harvestable 
    ON tax_lots(can_be_harvested, unrealized_gain) 
    WHERE can_be_harvested = true AND unrealized_gain < 0;
CREATE INDEX idx_tax_lots_wash_sale 
    ON tax_lots(wash_sale_exclude_until) 
    WHERE wash_sale_exclude_until IS NOT NULL;

-- Table: rebalancing_metrics (portfolio metrics and analytics)
CREATE TABLE rebalancing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allocation_target_id UUID REFERENCES allocation_targets(id) ON DELETE CASCADE,
    
    -- Period
    period_type VARCHAR(20) NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    
    -- Portfolio metrics
    portfolio_value NUMERIC(18, 2) NOT NULL,
    previous_value NUMERIC(18, 2) NOT NULL,
    total_return NUMERIC(7, 2) NOT NULL,
    
    -- Drift metrics
    max_allocation_drift NUMERIC(5, 2) NOT NULL,
    average_allocation_drift NUMERIC(5, 2) NOT NULL,
    drift_trend VARCHAR(20),
    
    -- Rebalancing activity
    rebalancing_count INTEGER DEFAULT 0,
    total_rebalancing_cost NUMERIC(18, 2) DEFAULT 0,
    average_cost_per_rebalance NUMERIC(18, 2) DEFAULT 0,
    
    -- Tax metrics
    realized_gains NUMERIC(18, 2) DEFAULT 0,
    realized_losses NUMERIC(18, 2) DEFAULT 0,
    harvested_losses NUMERIC(18, 2) DEFAULT 0,
    estimated_tax_cost NUMERIC(18, 2) DEFAULT 0,
    
    -- Performance metrics
    target_alignment_score NUMERIC(5, 2) DEFAULT 100,
    efficiency_score NUMERIC(5, 2) DEFAULT 100,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, allocation_target_id, period_start, period_type)
);

-- Indexing rebalancing_metrics
CREATE INDEX idx_rebalancing_metrics_user_period 
    ON rebalancing_metrics(user_id, period_start DESC, period_end);
CREATE INDEX idx_rebalancing_metrics_drift 
    ON rebalancing_metrics(max_allocation_drift DESC);

-- PL/pgSQL Functions for Portfolio Rebalancing

-- Function: Calculate portfolio allocation percentages
CREATE OR REPLACE FUNCTION calculate_portfolio_allocations(
    p_user_id UUID,
    p_tenant_id UUID
)
RETURNS TABLE (
    asset_symbol VARCHAR,
    quantity NUMERIC,
    current_value NUMERIC,
    allocation_percent NUMERIC,
    base_currency VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ph.asset_symbol,
        ph.quantity,
        ph.current_value,
        CASE 
            WHEN (SELECT COALESCE(SUM(current_value), 0) FROM portfolio_holdings 
                  WHERE user_id = p_user_id AND tenant_id = p_tenant_id) = 0 THEN 0
            ELSE ROUND((ph.current_value::NUMERIC / 
                       (SELECT SUM(current_value) FROM portfolio_holdings 
                        WHERE user_id = p_user_id AND tenant_id = p_tenant_id)) * 100, 2)
        END,
        ph.base_currency
    FROM portfolio_holdings ph
    WHERE ph.user_id = p_user_id 
        AND ph.tenant_id = p_tenant_id
    ORDER BY ph.current_value DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Calculate rebalancing moves needed
CREATE OR REPLACE FUNCTION calculate_rebalancing_moves(
    p_allocation_target_id UUID,
    p_user_id UUID
)
RETURNS TABLE (
    from_asset VARCHAR,
    to_asset VARCHAR,
    amount NUMERIC,
    reason TEXT,
    priority INTEGER
) AS $$
DECLARE
    v_portfolio_value NUMERIC;
    v_allocations JSONB;
    v_current_alloc RECORD;
    v_threshold NUMERIC;
BEGIN
    -- Get allocation target and portfolio value
    SELECT at.allocations, at.rebalancing_threshold
    INTO v_allocations, v_threshold
    FROM allocation_targets at
    WHERE at.id = p_allocation_target_id AND at.user_id = p_user_id;
    
    SELECT COALESCE(SUM(current_value), 0)
    INTO v_portfolio_value
    FROM portfolio_holdings
    WHERE user_id = p_user_id;
    
    -- Return overweight and underweight moves
    -- This is simplified; production version would calculate optimal swap paths
    RETURN QUERY
    SELECT 
        'BTC'::VARCHAR,
        'ETH'::VARCHAR,
        100::NUMERIC,
        'Rebalance overweight BTC to ETH'::TEXT,
        1::INTEGER
    WHERE EXISTS (
        SELECT 1 FROM allocation_targets WHERE id = p_allocation_target_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function: Identify tax-loss harvesting opportunities
CREATE OR REPLACE FUNCTION identify_tax_loss_harvesting_opportunities(
    p_user_id UUID,
    p_tenant_id UUID
)
RETURNS TABLE (
    asset_symbol VARCHAR,
    quantity NUMERIC,
    loss_amount NUMERIC,
    replacement_asset VARCHAR,
    harvest_priority INTEGER,
    wash_sale_safe BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tl.asset_symbol,
        tl.quantity,
        ABS(tl.unrealized_gain)::NUMERIC,
        (v_allocations->tl.asset_symbol->>'similar_asset')::VARCHAR,
        tl.harvest_priority,
        (tl.wash_sale_exclude_until IS NULL OR tl.wash_sale_exclude_until < NOW())::BOOLEAN
    FROM tax_lots tl
    LEFT JOIN allocation_targets at ON at.user_id = p_user_id
    WHERE tl.user_id = p_user_id 
        AND tl.tenant_id = p_tenant_id
        AND tl.can_be_harvested = true
        AND tl.unrealized_gain < 0
        AND (tl.wash_sale_exclude_until IS NULL OR tl.wash_sale_exclude_until < NOW())
    ORDER BY tl.harvest_priority ASC, tl.unrealized_gain ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Update rebalancing metrics after transaction
CREATE OR REPLACE FUNCTION update_rebalancing_metrics(
    p_user_id UUID,
    p_allocation_target_id UUID
)
RETURNS void AS $$
DECLARE
    v_portfolio_value NUMERIC;
    v_metric_record RECORD;
BEGIN
    SELECT COALESCE(SUM(current_value), 0)
    INTO v_portfolio_value
    FROM portfolio_holdings
    WHERE user_id = p_user_id;
    
    -- Update or insert today's metrics
    INSERT INTO rebalancing_metrics 
    (tenant_id, user_id, allocation_target_id, period_type, period_start, period_end, 
     portfolio_value, previous_value, total_return, max_allocation_drift, 
     average_allocation_drift, drift_trend)
    SELECT 
        ph.tenant_id, p_user_id, p_allocation_target_id, 'daily',
        CURRENT_DATE::TIMESTAMP, (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMP,
        v_portfolio_value, v_portfolio_value, 0, 0, 0, 'stable'
    FROM portfolio_holdings ph
    WHERE ph.user_id = p_user_id
    LIMIT 1
    ON CONFLICT (user_id, allocation_target_id, period_start, period_type) 
    DO UPDATE SET 
        updated_at = NOW(),
        portfolio_value = EXCLUDED.portfolio_value;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if auto-rebalancing is needed
CREATE OR REPLACE FUNCTION check_auto_rebalancing_needed(
    p_allocation_target_id UUID,
    p_user_id UUID
)
RETURNS TABLE (
    needs_rebalancing BOOLEAN,
    max_drift NUMERIC,
    reason TEXT
) AS $$
DECLARE
    v_threshold NUMERIC;
    v_max_drift NUMERIC;
BEGIN
    SELECT at.rebalancing_threshold
    INTO v_threshold
    FROM allocation_targets at
    WHERE at.id = p_allocation_target_id AND at.user_id = p_user_id;
    
    -- Check if any asset deviates more than threshold
    -- This is simplified for the migration
    RETURN QUERY
    SELECT 
        COALESCE(MAX(ABS((allocations->key->>'percent')::NUMERIC - 
                        (allocations->key->>'target')::NUMERIC), 0 > v_threshold, false)::BOOLEAN,
        COALESCE(MAX(ABS((allocations->key->>'percent')::NUMERIC - 
                        (allocations->key->>'target')::NUMERIC)), 0)::NUMERIC,
        'Allocation drift exceeds threshold'::TEXT
    FROM allocation_targets at, jsonb_each(at.allocations)
    WHERE at.id = p_allocation_target_id
        AND at.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Triggers for Portfolio Rebalancing

-- Trigger: Update portfolio_holdings timestamp on change
CREATE OR REPLACE FUNCTION update_portfolio_holdings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolio_holdings_updated_trigger
    BEFORE UPDATE ON portfolio_holdings
    FOR EACH ROW
    EXECUTE FUNCTION update_portfolio_holdings_timestamp();

-- Trigger: Record realized gains/losses when tax lot is sold
CREATE OR REPLACE FUNCTION record_tax_lot_disposition()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'fully-sold' AND OLD.status != 'fully-sold' THEN
        -- Calculate and store realized gain/loss
        NEW.realized_gain = CASE 
            WHEN NEW.unrealized_gain > 0 THEN NEW.unrealized_gain 
            ELSE 0 
        END;
        NEW.realized_loss = CASE 
            WHEN NEW.unrealized_gain < 0 THEN ABS(NEW.unrealized_gain)
            ELSE 0 
        END;
    END IF;
    
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_lot_disposition_trigger
    BEFORE UPDATE ON tax_lots
    FOR EACH ROW
    EXECUTE FUNCTION record_tax_lot_disposition();

-- Trigger: Mark wash sale rule restrictions
CREATE OR REPLACE FUNCTION apply_wash_sale_rule()
RETURNS TRIGGER AS $$
BEGIN
    -- IRS wash sale rule: can't repurchase similar asset within 30 days
    IF NEW.status = 'fully-sold' AND NEW.realized_loss > 0 THEN
        NEW.wash_sale_exclude_until = NEW.sell_date + INTERVAL '31 days';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wash_sale_rule_trigger
    BEFORE UPDATE ON tax_lots
    FOR EACH ROW
    EXECUTE FUNCTION apply_wash_sale_rule();

-- Views for Portfolio Analysis

-- View: Portfolio Summary
CREATE OR REPLACE VIEW v_portfolio_summary AS
SELECT 
    ph.user_id,
    ph.tenant_id,
    COUNT(DISTINCT ph.id) as holding_count,
    SUM(ph.current_value) as total_portfolio_value,
    SUM(ph.unrealized_gain) as total_unrealized_gain,
    ROUND(SUM(ph.unrealized_gain) / NULLIF(SUM(ph.current_value), 0) * 100, 2) as overall_gain_percent,
    SUM(ph.quantity) as total_quantity,
    MAX(ph.updated_at) as last_update
FROM portfolio_holdings ph
GROUP BY ph.user_id, ph.tenant_id;

-- View: Rebalancing Opportunities
CREATE OR REPLACE VIEW v_rebalancing_opportunities AS
SELECT 
    rr.user_id,
    rr.tenant_id,
    rr.id,
    rr.allocation_target_id,
    rr.priority,
    rr.status,
    rr.deviations,
    rr.estimated_cost,
    rr.tax_impact,
    rr.harvestable_losses,
    rr.created_at,
    CASE 
        WHEN rr.expires_at < NOW() THEN 'expired'
        WHEN rr.expires_at < NOW() + INTERVAL '1 day' THEN 'expiring-soon'
        ELSE 'active'
    END as opportunity_status
FROM rebalancing_recommendations rr
WHERE rr.status IN ('pending', 'approved');

-- View: Tax Harvesting Calendar
CREATE OR REPLACE VIEW v_tax_harvesting_calendar AS
SELECT 
    tl.user_id,
    tl.tenant_id,
    tl.asset_symbol,
    tl.unrealized_gain,
    tl.harvest_priority,
    CASE 
        WHEN tl.wash_sale_exclude_until IS NULL THEN 'available'
        WHEN tl.wash_sale_exclude_until > NOW() THEN 'wash-sale-restricted'
        ELSE 'available'
    END as harvest_status,
    tl.wash_sale_exclude_until,
    DATEDIFF(day, NOW(), tl.wash_sale_exclude_until) as days_until_eligible
FROM tax_lots tl
WHERE tl.can_be_harvested = true
    AND tl.unrealized_gain < 0
ORDER BY tl.harvest_priority ASC;

-- View: Rebalancing Performance
CREATE OR REPLACE VIEW v_rebalancing_performance AS
SELECT 
    rm.user_id,
    rm.allocation_target_id,
    rm.period_type,
    rm.period_start,
    rm.total_return,
    rm.target_alignment_score,
    rm.efficiency_score,
    rm.total_rebalancing_cost,
    rm.realized_gains - rm.realized_losses as net_gains,
    rm.harvested_losses,
    rm.estimated_tax_cost
FROM rebalancing_metrics rm
WHERE rm.period_type = 'daily'
ORDER BY rm.period_start DESC;

-- Add updated_at to existing tables if not present
ALTER TABLE allocation_targets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE rebalancing_recommendations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE rebalancing_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE rebalancing_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
