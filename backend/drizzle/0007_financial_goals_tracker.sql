-- Migration: Financial Goals & Savings Tracker - Issue #664
-- Purpose: Create all tables for goal management, progress tracking, savings plans, milestones, and analytics
-- Created: 2026-03-02

-- Create financial_goals table
CREATE TABLE IF NOT EXISTS financial_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    goal_name TEXT NOT NULL,
    description TEXT,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('savings', 'investment', 'debt_reduction', 'milestone', 'habit')),
    category TEXT NOT NULL,
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    target_date TIMESTAMP NOT NULL,
    priority INTEGER DEFAULT 0,
    importance INTEGER DEFAULT 50 CHECK (importance >= 0 AND importance <= 100),
    risk_tolerance TEXT DEFAULT 'moderate' CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
    status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'achieved', 'abandoned', 'on_hold', 'on_track', 'off_track')),
    progress_percentage NUMERIC(5, 2) DEFAULT 0,
    is_auto_tracked BOOLEAN DEFAULT FALSE,
    auto_calculate_savings BOOLEAN DEFAULT TRUE,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    custom_properties JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    achieved_at TIMESTAMP,
    abandoned_at TIMESTAMP,
    CONSTRAINT target_amount_positive CHECK (target_amount > 0)
);

-- Indexes for financial_goals
CREATE INDEX idx_financial_goals_user_id ON financial_goals(user_id);
CREATE INDEX idx_financial_goals_vault_id ON financial_goals(vault_id);
CREATE INDEX idx_financial_goals_status ON financial_goals(status);
CREATE INDEX idx_financial_goals_category ON financial_goals(category);
CREATE INDEX idx_financial_goals_target_date ON financial_goals(target_date);
CREATE INDEX idx_financial_goals_priority ON financial_goals(priority DESC);
CREATE INDEX idx_financial_goals_created_at ON financial_goals(created_at DESC);
CREATE INDEX idx_financial_goals_user_vault ON financial_goals(user_id, vault_id);

-- Create goal_progress_snapshots table
CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    contributed_amount NUMERIC(15, 2) NOT NULL,
    contributed_percentage NUMERIC(5, 2) NOT NULL,
    remaining_amount NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('on_track', 'off_track', 'at_risk', 'achieved')),
    days_elapsed INTEGER,
    days_remaining INTEGER,
    pace_ratio NUMERIC(5, 2),
    required_monthly_amount NUMERIC(15, 2),
    required_weekly_amount NUMERIC(15, 2),
    monthly_contribution_trend NUMERIC(15, 2),
    achievement_probability NUMERIC(5, 2),
    confidence_level TEXT CHECK (confidence_level IN ('very_low', 'low', 'moderate', 'high', 'very_high')),
    projected_completion_date TIMESTAMP,
    variance_from_pace NUMERIC(5, 2),
    variance_trend TEXT CHECK (variance_trend IN ('improving', 'stable', 'declining')),
    snapshot_type TEXT DEFAULT 'periodic' CHECK (snapshot_type IN ('manual', 'periodic', 'milestone', 'adjustment')),
    calculated_by TEXT DEFAULT 'system' CHECK (calculated_by IN ('system', 'user', 'scheduler')),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT contributed_percentage_range CHECK (contributed_percentage >= 0 AND contributed_percentage <= 100)
);

-- Indexes for goal_progress_snapshots
CREATE INDEX idx_progress_snapshots_goal_id ON goal_progress_snapshots(goal_id);
CREATE INDEX idx_progress_snapshots_user_id ON goal_progress_snapshots(user_id);
CREATE INDEX idx_progress_snapshots_status ON goal_progress_snapshots(status);
CREATE INDEX idx_progress_snapshots_created_at ON goal_progress_snapshots(created_at DESC);

-- Create savings_plans table
CREATE TABLE IF NOT EXISTS savings_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    starting_amount NUMERIC(15, 2) NOT NULL,
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) NOT NULL,
    time_to_target_months INTEGER NOT NULL,
    base_monthly_amount NUMERIC(15, 2) NOT NULL,
    weekly_amount NUMERIC(15, 2),
    biweekly_amount NUMERIC(15, 2),
    required_monthly_amount NUMERIC(15, 2),
    contribution_frequency TEXT DEFAULT 'monthly' CHECK (contribution_frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'custom')),
    custom_frequency_days INTEGER,
    buffer_percentage NUMERIC(5, 2) DEFAULT 10 CHECK (buffer_percentage >= 0 AND buffer_percentage <= 100),
    buffer_amount NUMERIC(15, 2),
    adjusted_monthly_amount NUMERIC(15, 2),
    payment_method TEXT,
    auto_debit_enabled BOOLEAN DEFAULT FALSE,
    auto_debit_date INTEGER CHECK (auto_debit_date >= 1 AND auto_debit_date <= 31),
    target_account_id UUID,
    previous_versions INTEGER DEFAULT 0,
    adjustment_reason TEXT,
    last_adjusted_at TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
    success_rate NUMERIC(5, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for savings_plans
CREATE INDEX idx_savings_plans_goal_id ON savings_plans(goal_id);
CREATE INDEX idx_savings_plans_user_id ON savings_plans(user_id);
CREATE INDEX idx_savings_plans_status ON savings_plans(status);
CREATE INDEX idx_savings_plans_created_at ON savings_plans(created_at DESC);

-- Create goal_milestones table
CREATE TABLE IF NOT EXISTS goal_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    milestone_name TEXT NOT NULL,
    milestone_type TEXT NOT NULL CHECK (milestone_type IN ('percentage', 'amount', 'date', 'custom')),
    milestone_value NUMERIC(15, 2),
    percentage_value NUMERIC(5, 2),
    target_date TIMESTAMP,
    sequence_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'achieved', 'missed')),
    achieved_date TIMESTAMP,
    time_to_achieve_days INTEGER,
    celebration_enabled BOOLEAN DEFAULT TRUE,
    celebration_message TEXT,
    badge_earned TEXT,
    motivation_message TEXT,
    notification_sent BOOLEAN DEFAULT FALSE,
    is_automatic BOOLEAN DEFAULT FALSE,
    custom_properties JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for goal_milestones
CREATE INDEX idx_milestones_goal_id ON goal_milestones(goal_id);
CREATE INDEX idx_milestones_user_id ON goal_milestones(user_id);
CREATE INDEX idx_milestones_status ON goal_milestones(status);
CREATE INDEX idx_milestones_sequence ON goal_milestones(sequence_order);
CREATE INDEX idx_milestones_target_date ON goal_milestones(target_date);

-- Create milestone_achievements table
CREATE TABLE IF NOT EXISTS milestone_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES goal_milestones(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    achieved_date TIMESTAMP NOT NULL,
    achievement_status TEXT DEFAULT 'completed' CHECK (achievement_status IN ('completed', 'early', 'late')),
    days_ahead_or_behind INTEGER,
    badge_type TEXT,
    badge_description TEXT,
    points_earned INTEGER DEFAULT 0,
    celebration_shared BOOLEAN DEFAULT FALSE,
    shared_at TIMESTAMP,
    sharing_platform TEXT,
    motivation_factor NUMERIC(5, 2),
    next_milestone_id UUID REFERENCES goal_milestones(id) ON DELETE SET NULL,
    achievement_note TEXT,
    media_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for milestone_achievements
CREATE INDEX idx_achievements_milestone_id ON milestone_achievements(milestone_id);
CREATE INDEX idx_achievements_goal_id ON milestone_achievements(goal_id);
CREATE INDEX idx_achievements_user_id ON milestone_achievements(user_id);
CREATE INDEX idx_achievements_achieved_date ON milestone_achievements(achieved_date DESC);

-- Create goal_transactions_link table
CREATE TABLE IF NOT EXISTS goal_transactions_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    contributed_amount NUMERIC(15, 2) NOT NULL,
    contribution_date TIMESTAMP NOT NULL,
    transaction_type TEXT,
    is_automatic BOOLEAN DEFAULT FALSE,
    confidence_score NUMERIC(5, 2),
    linking_reason TEXT,
    notes TEXT,
    linked_at TIMESTAMP DEFAULT NOW(),
    unlinked_at TIMESTAMP
);

-- Indexes for goal_transactions_link
CREATE INDEX idx_goal_transactions_goal_id ON goal_transactions_link(goal_id);
CREATE INDEX idx_goal_transactions_transaction_id ON goal_transactions_link(transaction_id);
CREATE INDEX idx_goal_transactions_user_id ON goal_transactions_link(user_id);
CREATE INDEX idx_goal_transactions_linked_at ON goal_transactions_link(linked_at DESC);
CREATE INDEX idx_goal_transactions_unlinked ON goal_transactions_link(unlinked_at) WHERE unlinked_at IS NULL;

-- Create goal_timeline_projections table
CREATE TABLE IF NOT EXISTS goal_timeline_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    projection_type TEXT NOT NULL CHECK (projection_type IN ('deterministic', 'stochastic')),
    simulation_count INTEGER DEFAULT 1000,
    success_probability NUMERIC(5, 2),
    confidence_level TEXT CHECK (confidence_level IN ('very_low', 'low', 'moderate', 'high', 'very_high')),
    projected_completion_date TIMESTAMP,
    median_completion_date TIMESTAMP,
    earliest_completion_date TIMESTAMP,
    latest_completion_date TIMESTAMP,
    current_amount NUMERIC(15, 2),
    target_amount NUMERIC(15, 2),
    best_case_amount NUMERIC(15, 2),
    worst_case_amount NUMERIC(15, 2),
    most_likely_amount NUMERIC(15, 2),
    monthly_variance NUMERIC(15, 2),
    return_variance NUMERIC(5, 2),
    percentiles JSONB DEFAULT '{}',
    scenario_results JSONB DEFAULT '{}',
    generated_at TIMESTAMP NOT NULL,
    valid_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for goal_timeline_projections
CREATE INDEX idx_projections_goal_id ON goal_timeline_projections(goal_id);
CREATE INDEX idx_projections_user_id ON goal_timeline_projections(user_id);
CREATE INDEX idx_projections_success_probability ON goal_timeline_projections(success_probability DESC);
CREATE INDEX idx_projections_generated_at ON goal_timeline_projections(generated_at DESC);
CREATE INDEX idx_projections_valid_until ON goal_timeline_projections(valid_until);

-- Create goal_analytics_snapshots table
CREATE TABLE IF NOT EXISTS goal_analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    snapshot_month TEXT NOT NULL,
    health_score NUMERIC(5, 2),
    health_status TEXT CHECK (health_status IN ('excellent', 'good', 'fair', 'poor', 'critical')),
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    priority_score NUMERIC(5, 2),
    achievability_score NUMERIC(5, 2),
    progress_velocity NUMERIC(15, 2),
    trend_direction TEXT CHECK (trend_direction IN ('improving', 'stable', 'declining')),
    trend_strength TEXT CHECK (trend_strength IN ('weak', 'moderate', 'strong')),
    momentum NUMERIC(5, 2),
    recommended_action TEXT,
    insight_messages JSONB DEFAULT '[]',
    alerts JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '{}',
    analysis_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for goal_analytics_snapshots
CREATE INDEX idx_analytics_goal_id ON goal_analytics_snapshots(goal_id);
CREATE INDEX idx_analytics_user_id ON goal_analytics_snapshots(user_id);
CREATE INDEX idx_analytics_snapshot_month ON goal_analytics_snapshots(snapshot_month);
CREATE INDEX idx_analytics_health_status ON goal_analytics_snapshots(health_status);
CREATE INDEX idx_analytics_risk_level ON goal_analytics_snapshots(risk_level);
CREATE INDEX idx_analytics_created_at ON goal_analytics_snapshots(created_at DESC);

-- Create views for monitoring and analysis

-- View: Current goal status overview
CREATE OR REPLACE VIEW v_financial_goals_overview AS
SELECT 
    fg.id,
    fg.user_id,
    fg.vault_id,
    fg.goal_name,
    fg.goal_type,
    fg.category,
    fg.target_amount,
    fg.current_amount,
    fg.target_date,
    fg.status,
    fg.priority,
    (fg.current_amount / fg.target_amount * 100)::NUMERIC(5, 2) AS progress_percentage,
    EXTRACT(DAY FROM fg.target_date - NOW())::INTEGER AS days_remaining,
    sp.adjusted_monthly_amount AS monthly_contribution,
    sp.status AS plan_status,
    las.health_score,
    las.risk_level,
    ltp.success_probability
FROM financial_goals fg
LEFT JOIN savings_plans sp ON fg.id = sp.goal_id
LEFT JOIN LATERAL (
    SELECT health_score, risk_level
    FROM goal_analytics_snapshots
    WHERE goal_id = fg.id
    ORDER BY created_at DESC
    LIMIT 1
) las ON TRUE
LEFT JOIN LATERAL (
    SELECT success_probability
    FROM goal_timeline_projections
    WHERE goal_id = fg.id
    ORDER BY generated_at DESC
    LIMIT 1
) ltp ON TRUE
ORDER BY fg.priority DESC, fg.target_date ASC;

-- View: Goal progress trends
CREATE OR REPLACE VIEW v_goal_progress_trends AS
SELECT 
    gps.goal_id,
    gps.user_id,
    COUNT(*) AS total_snapshots,
    MAX(gps.contributed_percentage) AS current_progress,
    AVG(gps.monthly_contribution_trend) AS average_monthly,
    MAX(CASE WHEN gps.status = 'on_track' THEN 1 ELSE 0 END) AS is_on_track,
    MAX(gps.achievement_probability) AS latest_success_probability,
    MAX(gps.created_at) AS last_updated
FROM goal_progress_snapshots gps
GROUP BY gps.goal_id, gps.user_id;

-- Grants
GRANT SELECT, INSERT, UPDATE ON financial_goals TO authenticated;
GRANT SELECT, INSERT ON goal_progress_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON savings_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON goal_milestones TO authenticated;
GRANT SELECT, INSERT ON milestone_achievements TO authenticated;
GRANT SELECT, INSERT ON goal_transactions_link TO authenticated;
GRANT SELECT, INSERT ON goal_timeline_projections TO authenticated;
GRANT SELECT, INSERT ON goal_analytics_snapshots TO authenticated;
GRANT SELECT ON v_financial_goals_overview TO authenticated;
GRANT SELECT ON v_goal_progress_trends TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE financial_goals IS 'Core financial goal definitions with target amounts, dates, and status tracking';
COMMENT ON TABLE goal_progress_snapshots IS 'Historical progress snapshots for trend analysis and milestone detection';
COMMENT ON TABLE savings_plans IS 'Calculated contribution plans with frequency and auto-debit settings';
COMMENT ON TABLE goal_milestones IS 'Progress checkpoints and celebrations for motivation';
COMMENT ON TABLE milestone_achievements IS 'Completion records for milestones with badges and sharing';
COMMENT ON TABLE goal_transactions_link IS 'Links between transactions and goals for auto-tracking';
COMMENT ON TABLE goal_timeline_projections IS 'Monte Carlo simulation results for timeline and achievability';
COMMENT ON TABLE goal_analytics_snapshots IS 'Health scores, risk levels, and actionable recommendations';
