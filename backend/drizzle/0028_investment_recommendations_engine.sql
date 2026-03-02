-- Migration: Investment Recommendations Engine
-- Issue: #666
-- AI-powered robo-advisor with asset allocation, rebalancing, tax-loss harvesting, and diversification analysis

-- Investment Recommendations - AI-generated investment advice
CREATE TABLE IF NOT EXISTS investment_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
    
    -- Recommendation details
    recommendation_type TEXT NOT NULL, -- asset_allocation, rebalance, diversify, tax_harvest, risk_adjust, consolidate
    title TEXT NOT NULL,
    description TEXT,
    reasoning TEXT NOT NULL, -- AI explanation
    
    -- Target action
    action_type TEXT NOT NULL, -- buy, sell, hold, rebalance, swap
    suggested_actions JSONB DEFAULT '[]'::jsonb, -- Array of specific actions
    
    -- Confidence metrics
    confidence_score NUMERIC(5, 2) NOT NULL, -- 0-100
    expected_return_increase NUMERIC(5, 2), -- Projected annual return improvement
    risk_reduction NUMERIC(5, 2), -- Risk reduction in percentage points
    tax_savings NUMERIC(15, 2), -- Estimated tax savings
    
    -- Priority and urgency
    priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    urgency TEXT NOT NULL DEFAULT 'normal', -- normal, time_sensitive, immediate
    time_horizon TEXT, -- short_term, medium_term, long_term
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'active', -- active, acknowledged, executed, dismissed, expired
    executed_at TIMESTAMP,
    dismissed_at TIMESTAMP,
    dismissal_reason TEXT,
    
    -- Impact tracking
    estimated_impact JSONB DEFAULT '{}'::jsonb, -- Expected financial impact
    actual_impact JSONB DEFAULT '{}'::jsonb, -- Realized impact after execution
    
    -- Metadata
    generated_by TEXT DEFAULT 'ai', -- ai, rule_engine, manual
    generation_model TEXT, -- Model version used
    expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for recommendations
CREATE INDEX idx_investment_recs_user ON investment_recommendations(user_id);
CREATE INDEX idx_investment_recs_portfolio ON investment_recommendations(portfolio_id);
CREATE INDEX idx_investment_recs_status ON investment_recommendations(status);
CREATE INDEX idx_investment_recs_type ON investment_recommendations(recommendation_type);
CREATE INDEX idx_investment_recs_priority ON investment_recommendations(priority);
CREATE INDEX idx_investment_recs_created ON investment_recommendations(created_at DESC);
CREATE INDEX idx_investment_recs_active ON investment_recommendations(status) WHERE status = 'active';
CREATE INDEX idx_investment_recs_tenant ON investment_recommendations(tenant_id);

-- Asset Allocation Models - Pre-defined and custom allocation strategies
CREATE TABLE IF NOT EXISTS asset_allocation_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = system-wide model
    
    -- Model details
    model_name TEXT NOT NULL,
    description TEXT,
    model_type TEXT NOT NULL, -- conservative, moderate, aggressive, custom, target_date, factor_based
    risk_level INTEGER NOT NULL, -- 1-10 scale
    
    -- Target allocations (percentages adding to 100)
    target_equities NUMERIC(5, 2) DEFAULT 0,
    target_bonds NUMERIC(5, 2) DEFAULT 0,
    target_cash NUMERIC(5, 2) DEFAULT 0,
    target_alternatives NUMERIC(5, 2) DEFAULT 0,
    target_real_estate NUMERIC(5, 2) DEFAULT 0,
    target_commodities NUMERIC(5, 2) DEFAULT 0,
    target_crypto NUMERIC(5, 2) DEFAULT 0,
    
    -- Detailed allocations (optional)
    detailed_allocations JSONB DEFAULT '{}'::jsonb, -- Granular allocation by sector, geography, etc.
    
    -- Rebalancing rules
    rebalance_threshold NUMERIC(5, 2) DEFAULT 5.0, -- Trigger rebalance at X% drift
    rebalance_frequency TEXT DEFAULT 'quarterly', -- monthly, quarterly, semi_annual, annual, threshold_based
    
    -- Expected performance
    expected_annual_return NUMERIC(5, 2),
    expected_volatility NUMERIC(5, 2),
    expected_sharpe_ratio NUMERIC(5, 2),
    
    -- Constraints
    min_equity_allocation NUMERIC(5, 2),
    max_equity_allocation NUMERIC(5, 2),
    allow_leverage BOOLEAN DEFAULT FALSE,
    esg_focused BOOLEAN DEFAULT FALSE,
    
    -- Model status
    is_active BOOLEAN DEFAULT TRUE,
    is_template BOOLEAN DEFAULT FALSE, -- System templates
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for allocation models
CREATE INDEX idx_allocation_models_user ON asset_allocation_models(user_id);
CREATE INDEX idx_allocation_models_type ON asset_allocation_models(model_type);
CREATE INDEX idx_allocation_models_risk ON asset_allocation_models(risk_level);
CREATE INDEX idx_allocation_models_active ON asset_allocation_models(is_active);
CREATE INDEX idx_allocation_models_template ON asset_allocation_models(is_template) WHERE is_template = TRUE;
CREATE INDEX idx_allocation_models_tenant ON asset_allocation_models(tenant_id);

-- Portfolio Allocations - Current allocations per portfolio
CREATE TABLE IF NOT EXISTS portfolio_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Current allocations
    current_equities NUMERIC(5, 2) DEFAULT 0,
    current_bonds NUMERIC(5, 2) DEFAULT 0,
    current_cash NUMERIC(5, 2) DEFAULT 0,
    current_alternatives NUMERIC(5, 2) DEFAULT 0,
    current_real_estate NUMERIC(5, 2) DEFAULT 0,
    current_commodities NUMERIC(5, 2) DEFAULT 0,
    current_crypto NUMERIC(5, 2) DEFAULT 0,
    
    -- Target model reference
    target_model_id UUID REFERENCES asset_allocation_models(id),
    
    -- Drift metrics
    total_drift NUMERIC(5, 2), -- Sum of absolute drifts
    max_drift NUMERIC(5, 2), -- Largest individual drift
    drift_direction TEXT, -- overweight_equities, underweight_bonds, balanced
    requires_rebalancing BOOLEAN DEFAULT FALSE,
    
    -- Diversification metrics
    diversification_score NUMERIC(5, 2), -- 0-100
    concentration_risk NUMERIC(5, 2), -- Herfindahl index
    asset_count INTEGER,
    sector_count INTEGER,
    geography_count INTEGER,
    
    -- Analysis date
    computed_at TIMESTAMP DEFAULT NOW(),
    next_rebalance_date TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for portfolio allocations
CREATE INDEX idx_portfolio_allocations_portfolio ON portfolio_allocations(portfolio_id);
CREATE INDEX idx_portfolio_allocations_user ON portfolio_allocations(user_id);
CREATE INDEX idx_portfolio_allocations_needs_rebalance ON portfolio_allocations(requires_rebalancing) WHERE requires_rebalancing = TRUE;
CREATE INDEX idx_portfolio_allocations_computed ON portfolio_allocations(computed_at DESC);
CREATE INDEX idx_portfolio_allocations_tenant ON portfolio_allocations(tenant_id);

-- Rebalancing Actions - Specific trades to rebalance
CREATE TABLE IF NOT EXISTS rebalancing_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES investment_recommendations(id) ON DELETE CASCADE,
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Action details
    action_type TEXT NOT NULL, -- buy, sell, swap
    asset_symbol TEXT NOT NULL,
    asset_name TEXT,
    asset_class TEXT,
    
    -- Trade specifics
    current_value NUMERIC(15, 2),
    current_shares NUMERIC(20, 8),
    target_value NUMERIC(15, 2),
    target_shares NUMERIC(20, 8),
    trade_value NUMERIC(15, 2), -- Amount to buy/sell
    trade_shares NUMERIC(20, 8),
    
    -- Tax considerations
    has_tax_implications BOOLEAN DEFAULT FALSE,
    estimated_capital_gain NUMERIC(15, 2),
    estimated_tax_liability NUMERIC(15, 2),
    is_tax_loss_opportunity BOOLEAN DEFAULT FALSE,
    wash_sale_risk BOOLEAN DEFAULT FALSE,
    
    -- Execution
    order_id UUID, -- Link to actual trade order
    execution_status TEXT DEFAULT 'pending', -- pending, submitted, filled, partial, cancelled, failed
    executed_at TIMESTAMP,
    execution_price NUMERIC(15, 8),
    execution_shares NUMERIC(20, 8),
    
    -- Metadata
    sequence_order INTEGER, -- Order of execution in rebalancing plan
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for rebalancing actions
CREATE INDEX idx_rebalancing_actions_recommendation ON rebalancing_actions(recommendation_id);
CREATE INDEX idx_rebalancing_actions_portfolio ON rebalancing_actions(portfolio_id);
CREATE INDEX idx_rebalancing_actions_user ON rebalancing_actions(user_id);
CREATE INDEX idx_rebalancing_actions_status ON rebalancing_actions(execution_status);
CREATE INDEX idx_rebalancing_actions_asset ON rebalancing_actions(asset_symbol);
CREATE INDEX idx_rebalancing_actions_tenant ON rebalancing_actions(tenant_id);

-- Tax Harvesting Opportunities - Identified tax-loss harvesting opportunities
CREATE TABLE IF NOT EXISTS tax_harvesting_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
    
    -- Asset details
    asset_symbol TEXT NOT NULL,
    asset_name TEXT,
    asset_class TEXT,
    
    -- Loss details
    current_price NUMERIC(15, 8),
    cost_basis NUMERIC(15, 8),
    unrealized_loss NUMERIC(15, 2) NOT NULL,
    unrealized_loss_percentage NUMERIC(5, 2),
    
    -- Tax impact
    tax_benefit NUMERIC(15, 2), -- Estimated tax savings
    marginal_tax_rate NUMERIC(5, 2),
    
    -- Replacement suggestion
    suggested_replacement_symbol TEXT,
    suggested_replacement_name TEXT,
    replacement_rationale TEXT,
    correlation_with_replacement NUMERIC(5, 2), -- How similar the replacement is
    
    -- Timing constraints
    wash_sale_window_ends TIMESTAMP, -- Cannot repurchase before this date
    opportunity_expires TIMESTAMP, -- Market conditions may change
    
    -- Priority
    priority_score NUMERIC(5, 2), -- 0-100
    confidence TEXT, -- low, medium, high
    
    -- Status
    status TEXT DEFAULT 'identified', -- identified, planned, executed, expired, dismissed
    executed_at TIMESTAMP,
    harvest_amount NUMERIC(15, 2), -- Actual realized loss
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for tax harvesting
CREATE INDEX idx_tax_harvest_user ON tax_harvesting_opportunities(user_id);
CREATE INDEX idx_tax_harvest_portfolio ON tax_harvesting_opportunities(portfolio_id);
CREATE INDEX idx_tax_harvest_status ON tax_harvesting_opportunities(status);
CREATE INDEX idx_tax_harvest_asset ON tax_harvesting_opportunities(asset_symbol);
CREATE INDEX idx_tax_harvest_priority ON tax_harvesting_opportunities(priority_score DESC);
CREATE INDEX idx_tax_harvest_tenant ON tax_harvesting_opportunities(tenant_id);

-- Diversification Analysis - Track portfolio diversification metrics
CREATE TABLE IF NOT EXISTS diversification_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Overall diversification
    diversification_score NUMERIC(5, 2), -- 0-100 (higher is better)
    herfindahl_index NUMERIC(8, 6), -- Concentration measure (lower is more diversified)
    effective_number_of_assets NUMERIC(10, 2), -- Weighted number of holdings
    
    -- Asset class diversification
    asset_class_count INTEGER,
    asset_class_entropy NUMERIC(8, 6), -- Shannon entropy measure
    largest_asset_class_weight NUMERIC(5, 2),
    
    -- Sector diversification
    sector_count INTEGER,
    sector_concentration NUMERIC(5, 2), -- Largest sector weight
    sector_entropy NUMERIC(8, 6),
    
    -- Geographic diversification
    geography_count INTEGER,
    domestic_allocation NUMERIC(5, 2),
    international_allocation NUMERIC(5, 2),
    emerging_markets_allocation NUMERIC(5, 2),
    
    -- Position sizing
    largest_position_weight NUMERIC(5, 2),
    top_10_concentration NUMERIC(5, 2), -- Combined weight of top 10 holdings
    positions_over_5_percent INTEGER, -- Number of oversized positions
    
    -- Risk metrics
    portfolio_beta NUMERIC(8, 4), -- Systematic risk
    unsystematic_risk NUMERIC(8, 4), -- Diversifiable risk
    correlation_to_benchmark NUMERIC(5, 2),
    
    -- Gaps and opportunities
    underweighted_sectors JSONB DEFAULT '[]'::jsonb,
    overweighted_sectors JSONB DEFAULT '[]'::jsonb,
    missing_asset_classes JSONB DEFAULT '[]'::jsonb,
    diversification_recommendations JSONB DEFAULT '[]'::jsonb,
    
    -- Overall assessment
    diversification_grade TEXT, -- A+, A, B, C, D, F
    risk_level TEXT, -- low, moderate, high, very_high
    
    -- Analysis metadata
    analyzed_at TIMESTAMP DEFAULT NOW(),
    benchmark_index TEXT, -- S&P 500, etc.
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for diversification analysis
CREATE INDEX idx_diversification_portfolio ON diversification_analysis(portfolio_id);
CREATE INDEX idx_diversification_user ON diversification_analysis(user_id);
CREATE INDEX idx_diversification_score ON diversification_analysis(diversification_score);
CREATE INDEX idx_diversification_analyzed ON diversification_analysis(analyzed_at DESC);
CREATE INDEX idx_diversification_tenant ON diversification_analysis(tenant_id);

-- Robo Advisor Settings - User preferences for automated advice
CREATE TABLE IF NOT EXISTS robo_advisor_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Automation preferences
    auto_generate_recommendations BOOLEAN DEFAULT TRUE,
    auto_rebalance BOOLEAN DEFAULT FALSE,
    auto_tax_harvest BOOLEAN DEFAULT FALSE,
    
    -- Thresholds
    rebalance_threshold NUMERIC(5, 2) DEFAULT 5.0, -- % drift to trigger
    min_trade_amount NUMERIC(15, 2) DEFAULT 100, -- Minimum trade size
    tax_harvest_min_loss NUMERIC(15, 2) DEFAULT 500, -- Minimum loss to harvest
    
    -- Risk parameters
    risk_tolerance TEXT DEFAULT 'moderate', -- conservative, moderate, aggressive
    target_allocation_model_id UUID REFERENCES asset_allocation_models(id),
    max_single_position_weight NUMERIC(5, 2) DEFAULT 10.0,
    allow_international BOOLEAN DEFAULT TRUE,
    allow_alternatives BOOLEAN DEFAULT FALSE,
    
    -- Tax considerations
    tax_optimization_enabled BOOLEAN DEFAULT TRUE,
    marginal_tax_rate NUMERIC(5, 2),
    account_type TEXT, -- taxable, ira, roth_ira, 401k
    
    -- Notification preferences
    notify_on_recommendations BOOLEAN DEFAULT TRUE,
    notify_on_rebalance_needed BOOLEAN DEFAULT TRUE,
    notify_on_tax_opportunities BOOLEAN DEFAULT TRUE,
    notification_frequency TEXT DEFAULT 'weekly', -- daily, weekly, monthly, immediate
    
    -- ESG preferences
    esg_enabled BOOLEAN DEFAULT FALSE,
    exclude_sectors JSONB DEFAULT '[]'::jsonb, -- e.g., ["tobacco", "weapons"]
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, tenant_id)
);

-- Indexes for robo advisor settings
CREATE INDEX idx_robo_settings_user ON robo_advisor_settings(user_id);
CREATE INDEX idx_robo_settings_auto_rebalance ON robo_advisor_settings(auto_rebalance) WHERE auto_rebalance = TRUE;
CREATE INDEX idx_robo_settings_auto_harvest ON robo_advisor_settings(auto_tax_harvest) WHERE auto_tax_harvest = TRUE;
CREATE INDEX idx_robo_settings_tenant ON robo_advisor_settings(tenant_id);

-- Recommendation Performance Tracking
CREATE TABLE IF NOT EXISTS recommendation_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recommendation_id UUID NOT NULL REFERENCES investment_recommendations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Performance metrics
    days_to_execute INTEGER,
    execution_quality TEXT, -- excellent, good, fair, poor
    
    -- Financial impact
    expected_return NUMERIC(15, 2),
    actual_return NUMERIC(15, 2),
    return_accuracy NUMERIC(5, 2), -- How close was the prediction
    
    expected_tax_savings NUMERIC(15, 2),
    actual_tax_savings NUMERIC(15, 2),
    
    -- User feedback
    user_rating INTEGER, -- 1-5 stars
    user_feedback TEXT,
    was_helpful BOOLEAN,
    
    -- Model performance
    model_version TEXT,
    confidence_vs_outcome NUMERIC(5, 2), -- Calibration metric
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance tracking
CREATE INDEX idx_rec_performance_recommendation ON recommendation_performance(recommendation_id);
CREATE INDEX idx_rec_performance_user ON recommendation_performance(user_id);
CREATE INDEX idx_rec_performance_quality ON recommendation_performance(execution_quality);
CREATE INDEX idx_rec_performance_tenant ON recommendation_performance(tenant_id);

-- Views for monitoring and analytics

-- Active Recommendations Summary
CREATE OR REPLACE VIEW v_active_recommendations_summary AS
SELECT 
    user_id,
    tenant_id,
    recommendation_type,
    priority,
    COUNT(*) as recommendation_count,
    AVG(confidence_score) as avg_confidence,
    SUM(CASE WHEN tax_savings IS NOT NULL THEN tax_savings ELSE 0 END) as total_tax_savings_potential,
    MIN(created_at) as oldest_recommendation
FROM investment_recommendations
WHERE status = 'active'
GROUP BY user_id, tenant_id, recommendation_type, priority;

-- Portfolio Rebalancing Needs
CREATE OR REPLACE VIEW v_rebalancing_needs AS
SELECT 
    pa.user_id,
    pa.tenant_id,
    pa.portfolio_id,
    pa.total_drift,
    pa.max_drift,
    pa.requires_rebalancing,
    pa.next_rebalance_date,
    COUNT(DISTINCT ra.id) as pending_actions,
    SUM(CASE WHEN ra.has_tax_implications THEN 1 ELSE 0 END) as tax_sensitive_actions
FROM portfolio_allocations pa
LEFT JOIN rebalancing_actions ra ON ra.portfolio_id = pa.portfolio_id AND ra.execution_status = 'pending'
WHERE pa.requires_rebalancing = TRUE
GROUP BY pa.user_id, pa.tenant_id, pa.portfolio_id, pa.total_drift, pa.max_drift, pa.requires_rebalancing, pa.next_rebalance_date;

-- Tax Harvesting Pipeline
CREATE OR REPLACE VIEW v_tax_harvest_pipeline AS
SELECT 
    tho.user_id,
    tho.tenant_id,
    tho.portfolio_id,
    tho.status,
    COUNT(*) as opportunity_count,
    SUM(tho.unrealized_loss) as total_loss_available,
    SUM(tho.tax_benefit) as total_tax_benefit,
    AVG(tho.priority_score) as avg_priority
FROM tax_harvesting_opportunities tho
WHERE tho.status IN ('identified', 'planned')
GROUP BY tho.user_id, tho.tenant_id, tho.portfolio_id, tho.status;

-- Diversification Health Dashboard
CREATE OR REPLACE VIEW v_diversification_health AS
SELECT 
    da.user_id,
    da.tenant_id,
    da.portfolio_id,
    da.diversification_score,
    da.diversification_grade,
    da.risk_level,
    da.largest_position_weight,
    da.top_10_concentration,
    da.asset_class_count,
    da.sector_count,
    da.geography_count,
    da.analyzed_at
FROM diversification_analysis da
WHERE da.analyzed_at = (
    SELECT MAX(analyzed_at) 
    FROM diversification_analysis da2 
    WHERE da2.portfolio_id = da.portfolio_id
);

-- Helper function: Calculate portfolio drift
CREATE OR REPLACE FUNCTION calculate_portfolio_drift(
    p_portfolio_id UUID
) RETURNS TABLE(
    asset_class TEXT,
    current_allocation NUMERIC,
    target_allocation NUMERIC,
    drift NUMERIC,
    requires_action BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'equities'::TEXT,
        pa.current_equities,
        aam.target_equities,
        ABS(pa.current_equities - aam.target_equities),
        ABS(pa.current_equities - aam.target_equities) > aam.rebalance_threshold
    FROM portfolio_allocations pa
    LEFT JOIN asset_allocation_models aam ON aam.id = pa.target_model_id
    WHERE pa.portfolio_id = p_portfolio_id
    UNION ALL
    SELECT 
        'bonds'::TEXT,
        pa.current_bonds,
        aam.target_bonds,
        ABS(pa.current_bonds - aam.target_bonds),
        ABS(pa.current_bonds - aam.target_bonds) > aam.rebalance_threshold
    FROM portfolio_allocations pa
    LEFT JOIN asset_allocation_models aam ON aam.id = pa.target_model_id
    WHERE pa.portfolio_id = p_portfolio_id;
    -- Add similar for other asset classes...
END;
$$ LANGUAGE plpgsql;

-- Helper function: Generate rebalancing recommendation
CREATE OR REPLACE FUNCTION generate_rebalancing_recommendation(
    p_user_id UUID,
    p_portfolio_id UUID
) RETURNS UUID AS $$
DECLARE
    v_rec_id UUID;
    v_total_drift NUMERIC;
    v_requires_rebalancing BOOLEAN;
BEGIN
    -- Get current drift
    SELECT total_drift, requires_rebalancing 
    INTO v_total_drift, v_requires_rebalancing
    FROM portfolio_allocations
    WHERE portfolio_id = p_portfolio_id
    ORDER BY computed_at DESC
    LIMIT 1;
    
    IF v_requires_rebalancing THEN
        INSERT INTO investment_recommendations (
            user_id,
            portfolio_id,
            recommendation_type,
            title,
            description,
            reasoning,
            action_type,
            confidence_score,
            priority,
            status
        ) VALUES (
            p_user_id,
            p_portfolio_id,
            'rebalance',
            'Portfolio Rebalancing Recommended',
            'Your portfolio has drifted from target allocation',
            format('Your portfolio has drifted by %s%% from target allocation. Rebalancing will restore optimal risk-return profile.', v_total_drift::TEXT),
            'rebalance',
            85,
            CASE 
                WHEN v_total_drift > 10 THEN 'high'
                WHEN v_total_drift > 7 THEN 'medium'
                ELSE 'low'
            END,
            'active'
        ) RETURNING id INTO v_rec_id;
        
        RETURN v_rec_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Grants
GRANT SELECT, INSERT, UPDATE ON investment_recommendations TO authenticated;
GRANT SELECT ON asset_allocation_models TO authenticated;
GRANT SELECT, INSERT, UPDATE ON portfolio_allocations TO authenticated;
GRANT SELECT, INSERT ON rebalancing_actions TO authenticated;
GRANT SELECT ON tax_harvesting_opportunities TO authenticated;
GRANT SELECT ON diversification_analysis TO authenticated;
GRANT SELECT, INSERT, UPDATE ON robo_advisor_settings TO authenticated;
GRANT SELECT, INSERT ON recommendation_performance TO authenticated;
GRANT SELECT ON v_active_recommendations_summary TO authenticated;
GRANT SELECT ON v_rebalancing_needs TO authenticated;
GRANT SELECT ON v_tax_harvest_pipeline TO authenticated;
GRANT SELECT ON v_diversification_health TO authenticated;

-- Comments
COMMENT ON TABLE investment_recommendations IS 'AI-generated investment recommendations with confidence scores and impact estimates';
COMMENT ON TABLE asset_allocation_models IS 'Pre-defined and custom asset allocation strategies for different risk levels';
COMMENT ON TABLE portfolio_allocations IS 'Current portfolio allocations with drift analysis and rebalancing needs';
COMMENT ON TABLE rebalancing_actions IS 'Specific trades required to rebalance portfolio to target allocation';
COMMENT ON TABLE tax_harvesting_opportunities IS 'Identified tax-loss harvesting opportunities with replacement suggestions';
COMMENT ON TABLE diversification_analysis IS 'Comprehensive portfolio diversification metrics and risk assessment';
COMMENT ON TABLE robo_advisor_settings IS 'User preferences and thresholds for automated investment advice';
COMMENT ON TABLE recommendation_performance IS 'Track performance and accuracy of recommendations over time';
COMMENT ON FUNCTION calculate_portfolio_drift IS 'Calculate current vs. target allocation drift for each asset class';
COMMENT ON FUNCTION generate_rebalancing_recommendation IS 'Auto-generate rebalancing recommendation when drift exceeds threshold';
