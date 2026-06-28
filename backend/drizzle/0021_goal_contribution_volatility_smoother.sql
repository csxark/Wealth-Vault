-- Migration: Goal Contribution Volatility Smoother - Issue #713
-- Purpose: Create tables for contribution smoothing, rolling cashflow averages, and recommendation tracking
-- Created: 2026-03-02
-- Description: Limits abrupt contribution changes using rolling averages and guardrails

-- ============================================================================
-- SMOOTHING CONFIGURATION TABLE
-- ============================================================================
-- Stores per-user or per-goal smoothing configurations
CREATE TABLE IF NOT EXISTS goal_contribution_smoothing_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES financial_goals(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Smoothing Parameters
    rolling_window_months INTEGER DEFAULT 3 CHECK (rolling_window_months >= 1 AND rolling_window_months <= 12),
    smoothing_factor NUMERIC(3, 2) DEFAULT 0.70 CHECK (smoothing_factor >= 0.1 AND smoothing_factor <= 1.0),
    variance_threshold_percentage NUMERIC(5, 2) DEFAULT 25.00 CHECK (variance_threshold_percentage >= 5 AND variance_threshold_percentage <= 100),
    
    -- Guardrails
    min_contribution_amount NUMERIC(12, 2) DEFAULT 0,
    max_contribution_amount NUMERIC(12, 2),
    max_month_over_month_change_pct NUMERIC(5, 2) DEFAULT 30.00 CHECK (max_month_over_month_change_pct >= 5 AND max_month_over_month_change_pct <= 100),
    
    -- Flags
    enable_smoothing BOOLEAN DEFAULT TRUE,
    enable_cashflow_detection BOOLEAN DEFAULT TRUE,
    require_manual_override BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    last_calculated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, goal_id)
);

CREATE INDEX idx_smoothing_configs_user ON goal_contribution_smoothing_configs(user_id);
CREATE INDEX idx_smoothing_configs_goal ON goal_contribution_smoothing_configs(goal_id);
CREATE INDEX idx_smoothing_configs_user_vault ON goal_contribution_smoothing_configs(user_id, vault_id);

-- ============================================================================
-- CASHFLOW HISTORY TABLE
-- ============================================================================
-- Tracks rolling cashflow averages for smoothing calculations
CREATE TABLE IF NOT EXISTS goal_cashflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Cashflow Data
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type TEXT DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
    
    -- Financial Metrics
    total_income NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    total_expenses NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    net_cashflow NUMERIC(15, 2) NOT NULL,
    discretionary_cashflow NUMERIC(15, 2), -- Income - (fixed expenses)
    
    -- Goal Contributions
    total_goal_contributions NUMERIC(15, 2) DEFAULT 0,
    contribution_count INTEGER DEFAULT 0,
    
    -- Volatility Metrics
    income_volatility NUMERIC(5, 2), -- Standard deviation
    expense_volatility NUMERIC(5, 2),
    cashflow_volatility NUMERIC(5, 2),
    
    -- Metadata
    data_source TEXT DEFAULT 'calculated' CHECK (data_source IN ('calculated', 'imported', 'manual', 'projected')),
    is_complete BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_period CHECK (period_end > period_start),
    CONSTRAINT valid_cashflow CHECK (net_cashflow = (total_income - total_expenses)),
    UNIQUE(user_id, vault_id, period_start, period_type)
);

CREATE INDEX idx_cashflow_history_user_period ON goal_cashflow_history(user_id, period_start DESC);
CREATE INDEX idx_cashflow_history_vault_period ON goal_cashflow_history(vault_id, period_start DESC);
CREATE INDEX idx_cashflow_history_period_type ON goal_cashflow_history(period_type, period_start DESC);
CREATE INDEX idx_cashflow_history_complete ON goal_cashflow_history(user_id, is_complete, period_start DESC);

-- ============================================================================
-- CONTRIBUTION RECOMMENDATIONS TABLE
-- ============================================================================
-- Stores smoothed contribution recommendations with variance bands and confidence
CREATE TABLE IF NOT EXISTS goal_contribution_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    config_id UUID REFERENCES goal_contribution_smoothing_configs(id) ON DELETE SET NULL,
    
    -- Recommendation Period
    recommendation_date TIMESTAMP NOT NULL,
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    
    -- Smoothed Recommendation
    raw_calculated_amount NUMERIC(12, 2) NOT NULL, -- Original calculated amount before smoothing
    smoothed_amount NUMERIC(12, 2) NOT NULL, -- Final smoothed recommendation
    previous_amount NUMERIC(12, 2), -- Last period's recommendation
    amount_change NUMERIC(12, 2), -- Difference from previous
    amount_change_percentage NUMERIC(5, 2),
    
    -- Variance Band
    variance_band_lower NUMERIC(12, 2) NOT NULL,
    variance_band_upper NUMERIC(12, 2) NOT NULL,
    variance_band_percentage NUMERIC(5, 2) DEFAULT 15.00,
    
    -- Confidence Metrics
    confidence_score NUMERIC(5, 2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    confidence_level TEXT NOT NULL CHECK (confidence_level IN ('very_low', 'low', 'moderate', 'high', 'very_high')),
    stability_index NUMERIC(5, 2), -- How stable the recommendation is (0-100)
    
    -- Supporting Data
    rolling_avg_cashflow NUMERIC(12, 2),
    rolling_avg_contributions NUMERIC(12, 2),
    cashflow_trend TEXT CHECK (cashflow_trend IN ('increasing', 'stable', 'decreasing', 'volatile')),
    major_cashflow_shift_detected BOOLEAN DEFAULT FALSE,
    
    -- Recommendation Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'overridden', 'expired')),
    user_feedback TEXT CHECK (user_feedback IN ('too_high', 'too_low', 'just_right', 'ignored')),
    override_amount NUMERIC(12, 2),
    override_reason TEXT,
    
    -- Metadata
    algorithm_version TEXT DEFAULT 'v1.0',
    calculation_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_recommendation_period CHECK (valid_until > valid_from),
    CONSTRAINT valid_variance_band CHECK (variance_band_upper >= variance_band_lower),
    CONSTRAINT smoothed_in_band CHECK (smoothed_amount >= variance_band_lower AND smoothed_amount <= variance_band_upper)
);

CREATE INDEX idx_recommendations_user_goal ON goal_contribution_recommendations(user_id, goal_id);
CREATE INDEX idx_recommendations_goal_date ON goal_contribution_recommendations(goal_id, recommendation_date DESC);
CREATE INDEX idx_recommendations_validity ON goal_contribution_recommendations(valid_from, valid_until);
CREATE INDEX idx_recommendations_status ON goal_contribution_recommendations(status, recommendation_date DESC);
CREATE INDEX idx_recommendations_user_date ON goal_contribution_recommendations(user_id, recommendation_date DESC);

-- ============================================================================
-- MAJOR CASHFLOW EVENTS TABLE
-- ============================================================================
-- Tracks detected major cashflow shifts that might require recommendation recalculation
CREATE TABLE IF NOT EXISTS goal_cashflow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN ('income_spike', 'income_drop', 'expense_spike', 'expense_drop', 'pattern_change', 'manual')),
    detected_at TIMESTAMP NOT NULL,
    event_date TIMESTAMP NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
    
    -- Event Metrics
    previous_avg_value NUMERIC(12, 2),
    new_value NUMERIC(12, 2),
    percentage_change NUMERIC(5, 2),
    deviation_from_norm NUMERIC(5, 2), -- Standard deviations from mean
    
    -- Impact on Goals
    affected_goal_ids JSONB DEFAULT '[]',
    recommendation_invalidated BOOLEAN DEFAULT FALSE,
    
    -- Event Resolution
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    requires_user_action BOOLEAN DEFAULT FALSE,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cashflow_events_user_date ON goal_cashflow_events(user_id, detected_at DESC);
CREATE INDEX idx_cashflow_events_type ON goal_cashflow_events(event_type, severity);
CREATE INDEX idx_cashflow_events_unacknowledged ON goal_cashflow_events(user_id, acknowledged) WHERE NOT acknowledged;
CREATE INDEX idx_cashflow_events_unresolved ON goal_cashflow_events(user_id, resolved) WHERE NOT resolved;

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- View: Latest recommendations per goal
CREATE OR REPLACE VIEW v_latest_goal_recommendations AS
SELECT DISTINCT ON (goal_id)
    r.*,
    g.goal_name,
    g.target_amount,
    g.current_amount,
    g.status as goal_status
FROM goal_contribution_recommendations r
JOIN financial_goals g ON r.goal_id = g.id
WHERE r.status IN ('pending', 'accepted')
    AND r.valid_from <= NOW()
    AND r.valid_until > NOW()
ORDER BY goal_id, recommendation_date DESC;

-- View: Contribution volatility metrics per user
CREATE OR REPLACE VIEW v_user_contribution_volatility AS
SELECT
    user_id,
    goal_id,
    COUNT(*) as total_recommendations,
    AVG(smoothed_amount) as avg_smoothed_amount,
    STDDEV(smoothed_amount) as contribution_stddev,
    AVG(ABS(amount_change_percentage)) as avg_change_percentage,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE major_cashflow_shift_detected) as cashflow_shift_count,
    MIN(recommendation_date) as first_recommendation,
    MAX(recommendation_date) as last_recommendation
FROM goal_contribution_recommendations
WHERE status IN ('pending', 'accepted')
GROUP BY user_id, goal_id;

-- View: Cashflow stability trends
CREATE OR REPLACE VIEW v_cashflow_stability_trends AS
SELECT
    user_id,
    vault_id,
    DATE_TRUNC('month', period_start) as month,
    AVG(net_cashflow) as avg_net_cashflow,
    AVG(discretionary_cashflow) as avg_discretionary_cashflow,
    AVG(cashflow_volatility) as avg_volatility,
    SUM(total_goal_contributions) as total_contributions,
    COUNT(*) as period_count
FROM goal_cashflow_history
WHERE is_complete = TRUE
GROUP BY user_id, vault_id, DATE_TRUNC('month', period_start)
ORDER BY user_id, month DESC;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contribution_smoothing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_smoothing_config_timestamp
    BEFORE UPDATE ON goal_contribution_smoothing_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_contribution_smoothing_timestamp();

CREATE TRIGGER trg_update_recommendation_timestamp
    BEFORE UPDATE ON goal_contribution_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_contribution_smoothing_timestamp();

-- ============================================================================
-- SEED DEFAULT CONFIGURATIONS
-- ============================================================================

-- Function to create default smoothing config for a user
CREATE OR REPLACE FUNCTION create_default_smoothing_config(p_user_id UUID, p_vault_id UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_config_id UUID;
BEGIN
    INSERT INTO goal_contribution_smoothing_configs (
        user_id,
        vault_id,
        rolling_window_months,
        smoothing_factor,
        variance_threshold_percentage,
        max_month_over_month_change_pct,
        enable_smoothing,
        enable_cashflow_detection
    ) VALUES (
        p_user_id,
        p_vault_id,
        3,           -- 3-month rolling average
        0.70,        -- 70% smoothing factor
        25.00,       -- 25% variance threshold
        30.00,       -- Max 30% month-over-month change
        TRUE,
        TRUE
    )
    ON CONFLICT (user_id, goal_id) DO NOTHING
    RETURNING id INTO v_config_id;
    
    RETURN v_config_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE goal_contribution_smoothing_configs IS 'Configuration for contribution smoothing per user/goal to prevent volatile savings behavior';
COMMENT ON TABLE goal_cashflow_history IS 'Rolling cashflow history for smoothing calculations and trend analysis';
COMMENT ON TABLE goal_contribution_recommendations IS 'Smoothed contribution recommendations with variance bands and confidence scores';
COMMENT ON TABLE goal_cashflow_events IS 'Major cashflow events that trigger recommendation recalculation';

COMMENT ON COLUMN goal_contribution_smoothing_configs.smoothing_factor IS 'Exponential smoothing factor: higher = more smoothing (0.1-1.0)';
COMMENT ON COLUMN goal_contribution_smoothing_configs.rolling_window_months IS 'Number of months to include in rolling average calculation';
COMMENT ON COLUMN goal_contribution_smoothing_configs.variance_threshold_percentage IS 'Percentage threshold for detecting major changes';

COMMENT ON COLUMN goal_contribution_recommendations.confidence_score IS 'Confidence in recommendation accuracy (0-100), based on data quality and stability';
COMMENT ON COLUMN goal_contribution_recommendations.stability_index IS 'How stable the cashflow pattern is (0-100), higher = more stable';
COMMENT ON COLUMN goal_contribution_recommendations.variance_band_lower IS 'Lower bound of acceptable contribution range';
COMMENT ON COLUMN goal_contribution_recommendations.variance_band_upper IS 'Upper bound of acceptable contribution range';

COMMENT ON COLUMN goal_cashflow_history.discretionary_cashflow IS 'Income minus fixed/essential expenses, available for goals';
COMMENT ON COLUMN goal_cashflow_history.cashflow_volatility IS 'Standard deviation of cashflow within the period';
