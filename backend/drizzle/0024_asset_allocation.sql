-- Issue #654: AI-Powered Smart Asset Allocation Advisor
-- Database Schema Migration

-- Create userProfiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    risk_tolerance TEXT NOT NULL CHECK (risk_tolerance IN ('very_conservative', 'conservative', 'moderate', 'aggressive', 'very_aggressive')),
    risk_score DECIMAL(5, 2) NOT NULL DEFAULT 50.00 CHECK (risk_score >= 0 AND risk_score <= 100),
    age_group TEXT CHECK (age_group IN ('18-25', '26-35', '36-45', '46-55', '56-65', '65+')),
    income_level TEXT CHECK (income_level IN ('under_50k', '50k_100k', '100k_250k', '250k_500k', '500k+')),
    job_stability TEXT CHECK (job_stability IN ('high', 'medium', 'low')),
    employment_type TEXT CHECK (employment_type IN ('employed', 'self_employed', 'retired', 'unemployed')),
    debt_ratio DECIMAL(5, 2) DEFAULT 0 CHECK (debt_ratio >= 0),
    liquidity_ratio DECIMAL(5, 2) DEFAULT 0 CHECK (liquidity_ratio >= 0),
    net_worth DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_risk_tolerance ON user_profiles(risk_tolerance);

-- Create allocationRecommendations table
CREATE TABLE IF NOT EXISTS allocation_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    recommendation_date TIMESTAMP NOT NULL DEFAULT NOW(),
    equity_percentage DECIMAL(5, 2) NOT NULL CHECK (equity_percentage >= 0 AND equity_percentage <= 100),
    bond_percentage DECIMAL(5, 2) NOT NULL CHECK (bond_percentage >= 0 AND bond_percentage <= 100),
    cash_percentage DECIMAL(5, 2) NOT NULL CHECK (cash_percentage >= 0 AND cash_percentage <= 100),
    alternatives_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (alternatives_percentage >= 0 AND alternatives_percentage <= 100),
    real_estate_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (real_estate_percentage >= 0 AND real_estate_percentage <= 100),
    confidence_score DECIMAL(5, 2) NOT NULL DEFAULT 80 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    expected_return DECIMAL(5, 2) NOT NULL,
    expected_volatility DECIMAL(5, 2) NOT NULL,
    sharpe_ratio DECIMAL(5, 2),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_allocation_recommendations_user_id ON allocation_recommendations(user_id);
CREATE INDEX idx_allocation_recommendations_vault_id ON allocation_recommendations(vault_id);
CREATE INDEX idx_allocation_recommendations_status ON allocation_recommendations(status);

-- Create allocationTargets table
CREATE TABLE IF NOT EXISTS allocation_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES financial_goals(id) ON DELETE CASCADE,
    equity_percentage DECIMAL(5, 2) NOT NULL,
    bond_percentage DECIMAL(5, 2) NOT NULL,
    cash_percentage DECIMAL(5, 2) NOT NULL,
    alternatives_percentage DECIMAL(5, 2) DEFAULT 0,
    target_date DATE NOT NULL,
    expected_return DECIMAL(5, 2) NOT NULL,
    funding_gap DECIMAL(15, 2),
    probability DECIMAL(5, 2) CHECK (probability >= 0 AND probability <= 100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_allocation_targets_user_id ON allocation_targets(user_id);
CREATE INDEX idx_allocation_targets_goal_id ON allocation_targets(goal_id);
CREATE INDEX idx_allocation_targets_target_date ON allocation_targets(target_date);

-- Create glidePaths table
CREATE TABLE IF NOT EXISTS glide_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES financial_goals(id) ON DELETE CASCADE,
    start_allocation JSONB NOT NULL,
    end_allocation JSONB NOT NULL,
    start_date DATE NOT NULL,
    target_date DATE NOT NULL,
    adjustment_frequency TEXT NOT NULL DEFAULT 'yearly' CHECK (adjustment_frequency IN ('yearly', 'quarterly', 'monthly')),
    current_allocation JSONB NOT NULL,
    next_adjustment_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_glide_paths_user_id ON glide_paths(user_id);
CREATE INDEX idx_glide_paths_goal_id ON glide_paths(goal_id);
CREATE INDEX idx_glide_paths_next_adjustment ON glide_paths(next_adjustment_date);

-- Create scenarioProjections table
CREATE TABLE IF NOT EXISTS scenario_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    scenario_type TEXT NOT NULL CHECK (scenario_type IN ('base', 'optimistic', 'pessimistic', 'crash', 'reverse_sequence')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    projections JSONB NOT NULL,
    success_probability DECIMAL(5, 2),
    ending_value DECIMAL(15, 2),
    volatility DECIMAL(5, 2),
    max_drawdown DECIMAL(5, 2),
    Monte_Carlo_iterations INTEGER DEFAULT 1000,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenario_projections_user_id ON scenario_projections(user_id);
CREATE INDEX idx_scenario_projections_scenario_type ON scenario_projections(scenario_type);

-- Create assetClassAllocations table
CREATE TABLE IF NOT EXISTS asset_class_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    allocation_id UUID REFERENCES allocation_recommendations(id) ON DELETE CASCADE,
    asset_class TEXT NOT NULL CHECK (asset_class IN ('equities', 'bonds', 'cash', 'alternatives', 'real_estate', 'commodities')),
    percentage DECIMAL(5, 2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    target_value DECIMAL(15, 2),
    current_value DECIMAL(15, 2),
    variance DECIMAL(5, 2),
    drift DECIMAL(5, 2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_class_allocations_user_id ON asset_class_allocations(user_id);
CREATE INDEX idx_asset_class_allocations_allocation_id ON asset_class_allocations(allocation_id);

-- Create peerBenchmarks table
CREATE TABLE IF NOT EXISTS peer_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_group TEXT NOT NULL,
    asset_class TEXT NOT NULL CHECK (asset_class IN ('equities', 'bonds', 'cash', 'alternatives', 'real_estate', 'commodities')),
    median_allocation DECIMAL(5, 2) NOT NULL,
    p25_allocation DECIMAL(5, 2),
    p75_allocation DECIMAL(5, 2),
    count INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_peer_benchmarks_unique ON peer_benchmarks(profile_group, asset_class);
CREATE INDEX idx_peer_benchmarks_profile_group ON peer_benchmarks(profile_group);

-- Pre-load peer benchmarks for common profiles
INSERT INTO peer_benchmarks (profile_group, asset_class, median_allocation, p25_allocation, p75_allocation, count) VALUES
-- Age-based profiles (Conservative approach)
('age_20s_conservative', 'equities', 50.00, 40.00, 60.00, 150),
('age_20s_conservative', 'bonds', 35.00, 25.00, 45.00, 150),
('age_20s_conservative', 'cash', 10.00, 5.00, 15.00, 150),
('age_20s_conservative', 'alternatives', 5.00, 0.00, 10.00, 150),

-- Age-based profiles (Moderate approach)
('age_20s_moderate', 'equities', 70.00, 60.00, 80.00, 200),
('age_20s_moderate', 'bonds', 25.00, 15.00, 35.00, 200),
('age_20s_moderate', 'cash', 3.00, 0.00, 10.00, 200),
('age_20s_moderate', 'alternatives', 2.00, 0.00, 5.00, 200),

-- Age-based profiles (Aggressive approach)
('age_20s_aggressive', 'equities', 85.00, 75.00, 95.00, 180),
('age_20s_aggressive', 'bonds', 10.00, 5.00, 15.00, 180),
('age_20s_aggressive', 'cash', 2.00, 0.00, 5.00, 180),
('age_20s_aggressive', 'alternatives', 3.00, 0.00, 10.00, 180),

-- Age 30s profiles
('age_30s_conservative', 'equities', 55.00, 45.00, 65.00, 180),
('age_30s_conservative', 'bonds', 35.00, 25.00, 45.00, 180),
('age_30s_conservative', 'cash', 8.00, 3.00, 15.00, 180),
('age_30s_conservative', 'alternatives', 2.00, 0.00, 5.00, 180),

('age_30s_moderate', 'equities', 65.00, 55.00, 75.00, 250),
('age_30s_moderate', 'bonds', 28.00, 18.00, 38.00, 250),
('age_30s_moderate', 'cash', 5.00, 0.00, 10.00, 250),
('age_30s_moderate', 'alternatives', 2.00, 0.00, 5.00, 250),

('age_30s_aggressive', 'equities', 80.00, 70.00, 90.00, 220),
('age_30s_aggressive', 'bonds', 15.00, 5.00, 25.00, 220),
('age_30s_aggressive', 'cash', 2.00, 0.00, 5.00, 220),
('age_30s_aggressive', 'alternatives', 3.00, 0.00, 10.00, 220),

-- Age 40s profiles
('age_40s_conservative', 'equities', 50.00, 40.00, 60.00, 200),
('age_40s_conservative', 'bonds', 40.00, 30.00, 50.00, 200),
('age_40s_conservative', 'cash', 8.00, 3.00, 15.00, 200),
('age_40s_conservative', 'alternatives', 2.00, 0.00, 5.00, 200),

('age_40s_moderate', 'equities', 60.00, 50.00, 70.00, 280),
('age_40s_moderate', 'bonds', 32.00, 22.00, 42.00, 280),
('age_40s_moderate', 'cash', 5.00, 0.00, 10.00, 280),
('age_40s_moderate', 'alternatives', 3.00, 0.00, 8.00, 280),

('age_40s_aggressive', 'equities', 75.00, 65.00, 85.00, 250),
('age_40s_aggressive', 'bonds', 18.00, 8.00, 28.00, 250),
('age_40s_aggressive', 'cash', 3.00, 0.00, 8.00, 250),
('age_40s_aggressive', 'alternatives', 4.00, 0.00, 10.00, 250),

-- Age 50s profiles
('age_50s_conservative', 'equities', 45.00, 35.00, 55.00, 180),
('age_50s_conservative', 'bonds', 45.00, 35.00, 55.00, 180),
('age_50s_conservative', 'cash', 8.00, 3.00, 15.00, 180),
('age_50s_conservative', 'alternatives', 2.00, 0.00, 5.00, 180),

('age_50s_moderate', 'equities', 55.00, 45.00, 65.00, 240),
('age_50s_moderate', 'bonds', 38.00, 28.00, 48.00, 240),
('age_50s_moderate', 'cash', 5.00, 0.00, 10.00, 240),
('age_50s_moderate', 'alternatives', 2.00, 0.00, 5.00, 240),

('age_50s_aggressive', 'equities', 70.00, 60.00, 80.00, 200),
('age_50s_aggressive', 'bonds', 22.00, 12.00, 32.00, 200),
('age_50s_aggressive', 'cash', 3.00, 0.00, 8.00, 200),
('age_50s_aggressive', 'alternatives', 5.00, 0.00, 10.00, 200),

-- Age 60+ profiles (Pre/Early Retirement)
('age_60plus_conservative', 'equities', 35.00, 25.00, 45.00, 150),
('age_60plus_conservative', 'bonds', 55.00, 45.00, 65.00, 150),
('age_60plus_conservative', 'cash', 8.00, 3.00, 15.00, 150),
('age_60plus_conservative', 'alternatives', 2.00, 0.00, 5.00, 150),

('age_60plus_moderate', 'equities', 45.00, 35.00, 55.00, 180),
('age_60plus_moderate', 'bonds', 48.00, 38.00, 58.00, 180),
('age_60plus_moderate', 'cash', 5.00, 0.00, 10.00, 180),
('age_60plus_moderate', 'alternatives', 2.00, 0.00, 5.00, 180),

('age_60plus_aggressive', 'equities', 60.00, 50.00, 70.00, 120),
('age_60plus_aggressive', 'bonds', 30.00, 20.00, 40.00, 120),
('age_60plus_aggressive', 'cash', 5.00, 0.00, 10.00, 120),
('age_60plus_aggressive', 'alternatives', 5.00, 0.00, 10.00, 120)
ON CONFLICT DO NOTHING;

-- Create allocationChangeHistory table
CREATE TABLE IF NOT EXISTS allocation_change_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    allocation_id UUID REFERENCES allocation_recommendations(id) ON DELETE CASCADE,
    previous_allocation JSONB,
    new_allocation JSONB NOT NULL,
    reason TEXT,
    changed_date TIMESTAMP NOT NULL DEFAULT NOW(),
    changed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_allocation_change_history_user_id ON allocation_change_history(user_id);
CREATE INDEX idx_allocation_change_history_allocation_id ON allocation_change_history(allocation_id);

-- Note: Ensure financial_goals table exists before foreign key constraints
-- ALTER TABLE allocation_targets ADD CONSTRAINT fk_allocation_targets_goal 
-- FOREIGN KEY (goal_id) REFERENCES financial_goals(id) ON DELETE CASCADE;

-- Trigger to update allocation_recommendations updated_at
CREATE OR REPLACE FUNCTION update_allocation_recommendations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_allocation_recommendations_updated
BEFORE UPDATE ON allocation_recommendations
FOR EACH ROW
EXECUTE FUNCTION update_allocation_recommendations_timestamp();

-- Trigger to update user_profiles updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_profiles_updated
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profiles_timestamp();
