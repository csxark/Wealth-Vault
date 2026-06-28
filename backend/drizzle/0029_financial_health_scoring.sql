-- Migration: Financial Health Scoring & Insights
-- Issue: #667
-- Description: Implements wealth score (0-850), financial health dashboard, spending heatmaps,
--              peer benchmarking, personalized recommendations, and wellness trends

-- Create enums
CREATE TYPE health_score_status AS ENUM ('excellent', 'good', 'fair', 'poor', 'critical');
CREATE TYPE recommendation_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE recommendation_status AS ENUM ('pending', 'in_progress', 'completed', 'dismissed', 'expired');

-- Financial Health Scores Table
CREATE TABLE IF NOT EXISTS financial_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Overall wealth score (0-850, like credit score)
    wealth_score INTEGER NOT NULL CHECK (wealth_score >= 0 AND wealth_score <= 850),
    previous_score INTEGER CHECK (previous_score IS NULL OR (previous_score >= 0 AND previous_score <= 850)),
    score_change INTEGER,
    
    -- Component scores (each 0-100)
    savings_score INTEGER NOT NULL DEFAULT 0 CHECK (savings_score >= 0 AND savings_score <= 100),
    debt_score INTEGER NOT NULL DEFAULT 0 CHECK (debt_score >= 0 AND debt_score <= 100),
    spending_score INTEGER NOT NULL DEFAULT 0 CHECK (spending_score >= 0 AND spending_score <= 100),
    investment_score INTEGER NOT NULL DEFAULT 0 CHECK (investment_score >= 0 AND investment_score <= 100),
    income_score INTEGER NOT NULL DEFAULT 0 CHECK (income_score >= 0 AND income_score <= 100),
    
    -- Health status derived from score
    health_status health_score_status NOT NULL,
    
    -- Key metrics used in calculation
    metrics JSONB NOT NULL DEFAULT '{
        "emergencyFundMonths": 0,
        "savingsRate": 0,
        "liquidAssets": 0,
        "debtToIncomeRatio": 0,
        "creditUtilization": 0,
        "totalDebt": 0,
        "monthlyDebtPayments": 0,
        "budgetAdherence": 0,
        "spendingVariability": 0,
        "discretionarySpending": 0,
        "essentialSpending": 0,
        "portfolioValue": 0,
        "portfolioDiversification": 0,
        "investmentReturns": 0,
        "riskAdjustedReturns": 0,
        "monthlyIncome": 0,
        "incomeGrowthRate": 0,
        "incomeStability": 0,
        "multipleIncomeStreams": false
    }'::JSONB,
    
    -- Benchmarking data
    peer_comparison JSONB DEFAULT '{
        "percentile": 50,
        "ageGroupAverage": 500,
        "incomeGroupAverage": 500,
        "regionAverage": 500
    }'::JSONB,
    
    -- Calculation metadata
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    calculation_version TEXT NOT NULL DEFAULT '1.0',
    data_quality INTEGER NOT NULL DEFAULT 100 CHECK (data_quality >= 0 AND data_quality <= 100),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one current score per user
    CONSTRAINT unique_user_current_score UNIQUE (tenant_id, user_id)
);

-- Health Score History Table
CREATE TABLE IF NOT EXISTS health_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score_id UUID REFERENCES financial_health_scores(id) ON DELETE CASCADE,
    
    -- Historical snapshot
    wealth_score INTEGER NOT NULL CHECK (wealth_score >= 0 AND wealth_score <= 850),
    savings_score INTEGER NOT NULL CHECK (savings_score >= 0 AND savings_score <= 100),
    debt_score INTEGER NOT NULL CHECK (debt_score >= 0 AND debt_score <= 100),
    spending_score INTEGER NOT NULL CHECK (spending_score >= 0 AND spending_score <= 100),
    investment_score INTEGER NOT NULL CHECK (investment_score >= 0 AND investment_score <= 100),
    income_score INTEGER NOT NULL CHECK (income_score >= 0 AND income_score <= 100),
    
    health_status health_score_status NOT NULL,
    
    -- Snapshot date
    snapshot_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spending Heatmaps Table
CREATE TABLE IF NOT EXISTS spending_heatmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Time period for this heatmap
    period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    
    -- Heatmap data structures
    category_heatmap JSONB NOT NULL DEFAULT '{}'::JSONB,
    time_of_day_heatmap JSONB NOT NULL DEFAULT '{}'::JSONB,
    day_of_week_heatmap JSONB NOT NULL DEFAULT '{}'::JSONB,
    merchant_heatmap JSONB NOT NULL DEFAULT '{}'::JSONB,
    
    -- Insights derived from heatmap
    peak_spending_times JSONB DEFAULT '[]'::JSONB,
    top_categories JSONB DEFAULT '[]'::JSONB,
    spending_patterns JSONB DEFAULT '[]'::JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One heatmap per user per period
    CONSTRAINT unique_user_period_heatmap UNIQUE (tenant_id, user_id, period, start_date)
);

-- Peer Benchmarks Table
CREATE TABLE IF NOT EXISTS peer_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Segment definition
    age_min INTEGER,
    age_max INTEGER,
    income_min INTEGER,
    income_max INTEGER,
    region TEXT,
    
    -- Aggregate statistics
    avg_wealth_score NUMERIC(5, 2),
    median_wealth_score INTEGER,
    p25_wealth_score INTEGER,
    p75_wealth_score INTEGER,
    
    -- Component averages
    avg_savings_score NUMERIC(5, 2),
    avg_debt_score NUMERIC(5, 2),
    avg_spending_score NUMERIC(5, 2),
    avg_investment_score NUMERIC(5, 2),
    avg_income_score NUMERIC(5, 2),
    
    -- Sample size and confidence
    sample_size INTEGER NOT NULL,
    confidence_level NUMERIC(4, 2),
    
    -- Calculation metadata
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique benchmark per segment
    CONSTRAINT unique_benchmark_segment UNIQUE (age_min, age_max, income_min, income_max, region)
);

-- Health Recommendations Table
CREATE TABLE IF NOT EXISTS health_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score_id UUID REFERENCES financial_health_scores(id) ON DELETE CASCADE,
    
    -- Recommendation details
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('savings', 'debt', 'spending', 'investment', 'income')),
    priority recommendation_priority NOT NULL,
    status recommendation_status NOT NULL DEFAULT 'pending',
    
    -- Impact estimation
    estimated_score_impact INTEGER,
    estimated_dollar_impact INTEGER,
    estimated_timeframe TEXT,
    
    -- Action items
    action_items JSONB NOT NULL DEFAULT '[]'::JSONB,
    
    -- Tracking
    viewed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    
    -- Recommendation metadata
    generated_by TEXT NOT NULL DEFAULT 'system',
    confidence NUMERIC(4, 2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wellness Trends Table
CREATE TABLE IF NOT EXISTS wellness_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Trend period
    trend_date TIMESTAMPTZ NOT NULL,
    
    -- Financial wellness metrics
    net_worth INTEGER,
    liquid_net_worth INTEGER,
    savings_rate NUMERIC(5, 2),
    debt_to_income_ratio NUMERIC(5, 2),
    
    -- Behavioral metrics
    budget_adherence NUMERIC(5, 2),
    savings_goal_progress NUMERIC(5, 2),
    investment_growth NUMERIC(5, 2),
    
    -- Stress indicators
    financial_stress_score INTEGER CHECK (financial_stress_score IS NULL OR (financial_stress_score >= 0 AND financial_stress_score <= 100)),
    spending_volatility NUMERIC(5, 2),
    emergency_fund_coverage NUMERIC(5, 2),
    
    -- Metadata
    data_quality INTEGER NOT NULL DEFAULT 100 CHECK (data_quality >= 0 AND data_quality <= 100),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One trend data point per user per date
    CONSTRAINT unique_user_trend_date UNIQUE (tenant_id, user_id, trend_date)
);

-- Indexes for performance optimization

-- Financial Health Scores indexes
CREATE INDEX idx_financial_health_scores_user ON financial_health_scores(user_id);
CREATE INDEX idx_financial_health_scores_tenant ON financial_health_scores(tenant_id);
CREATE INDEX idx_financial_health_scores_status ON financial_health_scores(health_status);
CREATE INDEX idx_financial_health_scores_calculated ON financial_health_scores(calculated_at DESC);
CREATE INDEX idx_financial_health_scores_wealth_score ON financial_health_scores(wealth_score DESC);

-- Health Score History indexes
CREATE INDEX idx_health_score_history_user ON health_score_history(user_id, snapshot_date DESC);
CREATE INDEX idx_health_score_history_tenant ON health_score_history(tenant_id);
CREATE INDEX idx_health_score_history_score ON health_score_history(score_id);
CREATE INDEX idx_health_score_history_snapshot ON health_score_history(snapshot_date DESC);

-- Spending Heatmaps indexes
CREATE INDEX idx_spending_heatmaps_user ON spending_heatmaps(user_id);
CREATE INDEX idx_spending_heatmaps_tenant ON spending_heatmaps(tenant_id);
CREATE INDEX idx_spending_heatmaps_period ON spending_heatmaps(period, start_date DESC);
CREATE INDEX idx_spending_heatmaps_dates ON spending_heatmaps(start_date, end_date);

-- Peer Benchmarks indexes
CREATE INDEX idx_peer_benchmarks_age ON peer_benchmarks(age_min, age_max);
CREATE INDEX idx_peer_benchmarks_income ON peer_benchmarks(income_min, income_max);
CREATE INDEX idx_peer_benchmarks_region ON peer_benchmarks(region);
CREATE INDEX idx_peer_benchmarks_valid ON peer_benchmarks(valid_until) WHERE valid_until > NOW();

-- Health Recommendations indexes
CREATE INDEX idx_health_recommendations_user ON health_recommendations(user_id, status);
CREATE INDEX idx_health_recommendations_tenant ON health_recommendations(tenant_id);
CREATE INDEX idx_health_recommendations_score ON health_recommendations(score_id);
CREATE INDEX idx_health_recommendations_status ON health_recommendations(status);
CREATE INDEX idx_health_recommendations_priority ON health_recommendations(priority);
CREATE INDEX idx_health_recommendations_category ON health_recommendations(category);
CREATE INDEX idx_health_recommendations_expires ON health_recommendations(expires_at) WHERE expires_at IS NOT NULL;

-- Wellness Trends indexes
CREATE INDEX idx_wellness_trends_user ON wellness_trends(user_id, trend_date DESC);
CREATE INDEX idx_wellness_trends_tenant ON wellness_trends(tenant_id);
CREATE INDEX idx_wellness_trends_date ON wellness_trends(trend_date DESC);
CREATE INDEX idx_wellness_trends_stress ON wellness_trends(financial_stress_score DESC) WHERE financial_stress_score IS NOT NULL;

-- Functions for automatic updates

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_financial_health_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_financial_health_scores_updated_at
    BEFORE UPDATE ON financial_health_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_health_updated_at();

CREATE TRIGGER update_spending_heatmaps_updated_at
    BEFORE UPDATE ON spending_heatmaps
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_health_updated_at();

CREATE TRIGGER update_peer_benchmarks_updated_at
    BEFORE UPDATE ON peer_benchmarks
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_health_updated_at();

CREATE TRIGGER update_health_recommendations_updated_at
    BEFORE UPDATE ON health_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_health_updated_at();

-- Function to automatically create history entry when score is updated
CREATE OR REPLACE FUNCTION create_health_score_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create history if score changed
    IF OLD.wealth_score IS DISTINCT FROM NEW.wealth_score THEN
        INSERT INTO health_score_history (
            tenant_id,
            user_id,
            score_id,
            wealth_score,
            savings_score,
            debt_score,
            spending_score,
            investment_score,
            income_score,
            health_status,
            snapshot_date
        ) VALUES (
            NEW.tenant_id,
            NEW.user_id,
            NEW.id,
            NEW.wealth_score,
            NEW.savings_score,
            NEW.debt_score,
            NEW.spending_score,
            NEW.investment_score,
            NEW.income_score,
            NEW.health_status,
            NEW.calculated_at
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create history entry
CREATE TRIGGER create_health_score_history_trigger
    AFTER INSERT OR UPDATE ON financial_health_scores
    FOR EACH ROW
    EXECUTE FUNCTION create_health_score_history();

-- Function to calculate health status from wealth score
CREATE OR REPLACE FUNCTION calculate_health_status(score INTEGER)
RETURNS health_score_status AS $$
BEGIN
    CASE
        WHEN score >= 750 THEN RETURN 'excellent'::health_score_status;
        WHEN score >= 650 THEN RETURN 'good'::health_score_status;
        WHEN score >= 550 THEN RETURN 'fair'::health_score_status;
        WHEN score >= 450 THEN RETURN 'poor'::health_score_status;
        ELSE RETURN 'critical'::health_score_status;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comments for documentation
COMMENT ON TABLE financial_health_scores IS 'Stores current financial health scores for users with wealth score (0-850) and component scores';
COMMENT ON TABLE health_score_history IS 'Historical snapshots of financial health scores for trend analysis';
COMMENT ON TABLE spending_heatmaps IS 'Analyzes spending patterns by category, time, and merchant with visual heatmap data';
COMMENT ON TABLE peer_benchmarks IS 'Anonymized aggregated peer comparison data for benchmarking';
COMMENT ON TABLE health_recommendations IS 'Personalized AI-driven financial recommendations with action items';
COMMENT ON TABLE wellness_trends IS 'Tracks financial wellness metrics and stress indicators over time';

COMMENT ON COLUMN financial_health_scores.wealth_score IS 'Overall financial health score (0-850, similar to credit score)';
COMMENT ON COLUMN financial_health_scores.data_quality IS 'Completeness and reliability of data used for calculation (0-100)';
COMMENT ON COLUMN health_recommendations.estimated_score_impact IS 'Expected improvement in wealth score if recommendation is followed';
COMMENT ON COLUMN wellness_trends.financial_stress_score IS 'Derived stress indicator from spending patterns and financial obligations (0-100, higher = more stress)';
