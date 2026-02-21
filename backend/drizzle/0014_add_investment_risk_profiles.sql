-- Investment Risk Profiles Table
-- Stores user risk profiles for personalized investment recommendations

CREATE TABLE IF NOT EXISTS investment_risk_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Risk Assessment Answers
    risk_score INTEGER NOT NULL DEFAULT 50,
    risk_tolerance VARCHAR(20) NOT NULL DEFAULT 'moderate', -- conservative, moderate, aggressive
    investment_horizon VARCHAR(20) NOT NULL DEFAULT 'medium', -- short, medium, long
    investment_experience VARCHAR(20) NOT NULL DEFAULT 'intermediate', -- beginner, intermediate, advanced
    
    -- Financial Profile
    annual_income NUMERIC(15, 2) DEFAULT '0',
    net_worth NUMERIC(15, 2) DEFAULT '0',
    liquidAssets NUMERIC(15, 2) DEFAULT '0',
    emergency_fund_months INTEGER DEFAULT 3,
    
    -- Investment Goals
    primary_goal VARCHAR(50) NOT NULL DEFAULT 'growth', -- growth, income, preservation, balanced
    retirement_age INTEGER,
    target_retirement_amount NUMERIC(15, 2),
    monthly_investment_capacity NUMERIC(12, 2) DEFAULT '0',
    
    -- Risk Factors
    has_debt BOOLEAN DEFAULT false,
    debt_amount NUMERIC(15, 2) DEFAULT '0',
    has_dependents BOOLEAN DEFAULT false,
    dependent_count INTEGER DEFAULT 0,
    has_other_income BOOLEAN DEFAULT false,
    other_income_monthly NUMERIC(12, 2) DEFAULT '0',
    
    -- Market Understanding
    understands_market_volatility BOOLEAN DEFAULT false,
    can_afford_losses BOOLEAN DEFAULT false,
    max_loss_tolerance NUMERIC(12, 2) DEFAULT '0',
    
    -- Assessment Details
    assessment_date TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_investment_risk_profiles_user_id ON investment_risk_profiles(user_id);

-- Investment Recommendations Table
-- Stores AI-generated investment recommendations

CREATE TABLE IF NOT EXISTS investment_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
    
    -- Recommendation Details
    recommendation_type VARCHAR(20) NOT NULL, -- buy, sell, hold, diversify, rebalance
    asset_symbol VARCHAR(10),
    asset_name VARCHAR(100),
    asset_type VARCHAR(20), -- stock, etf, mutual_fund, bond, crypto
    
    -- Reasoning
    reasoning TEXT NOT NULL,
    reasoning_factors JSONB DEFAULT '[]', -- Factors considered in the recommendation
    
    -- Metrics
    expected_return NUMERIC(8, 4),
    risk_level VARCHAR(10) NOT NULL, -- low, medium, high
    confidence_score NUMERIC(5, 2), -- 0-100
    time_horizon VARCHAR(10), -- short, medium, long
    
    -- Priority and Status
    priority VARCHAR(10) DEFAULT 'medium', -- low, medium, high
    status VARCHAR(20) DEFAULT 'active', -- active, dismissed, implemented
    expires_at TIMESTAMP,
    
    -- Financial Impact
    suggested_amount NUMERIC(15, 2),
    potential_gain_loss NUMERIC(15, 2),
    
    -- AI Metadata
    model_version VARCHAR(20),
    analysis_data JSONB DEFAULT '{}',
    
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for investment recommendations
CREATE INDEX IF NOT EXISTS idx_investment_recommendations_user_id ON investment_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_recommendations_portfolio_id ON investment_recommendations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_investment_recommendations_status ON investment_recommendations(status);

-- Portfolio Rebalancing History Table
-- Tracks portfolio rebalancing actions and suggestions

CREATE TABLE IF NOT EXISTS portfolio_rebalancing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    
    -- Rebalancing Details
    rebalance_type VARCHAR(20) NOT NULL, -- automatic, suggested, manual
    trigger_reason VARCHAR(50), -- threshold_exceeded, time_based, optimization, manual
    
    -- Before State
    before_allocation JSONB NOT NULL,
    before_value NUMERIC(15, 2) NOT NULL,
    
    -- After State
    after_allocation JSONB,
    after_value NUMERIC(15, 2),
    
    -- Actions Taken
    actions JSONB DEFAULT '[]', -- Array of buy/sell actions
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, cancelled
    completed_at TIMESTAMP,
    
    -- Metrics
    expected_improvement NUMERIC(8, 4), -- Expected improvement in Sharpe ratio
    actual_improvement NUMERIC(8, 4),
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for portfolio rebalancing
CREATE INDEX IF NOT EXISTS idx_portfolio_rebalancing_portfolio_id ON portfolio_rebalancing(portfolio_id);

-- Add comments
COMMENT ON TABLE investment_risk_profiles IS 'Stores user risk profiles for personalized investment recommendations';
COMMENT ON TABLE investment_recommendations IS 'AI-generated investment recommendations for users';
COMMENT ON TABLE portfolio_rebalancing IS 'Tracks portfolio rebalancing history and suggestions';
