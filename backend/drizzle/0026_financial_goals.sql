-- Migration: Financial Goals & Savings Tracker
-- Issue: #664
-- Implements goal framework with progress tracking, savings plans, and timeline projections

-- Financial Goals - Core goal definitions with state management
CREATE TABLE IF NOT EXISTS financial_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Goal basics
    goal_name TEXT NOT NULL,
    description TEXT,
    goal_type TEXT NOT NULL, -- savings, investment, debt_reduction, milestone, habit
    category TEXT NOT NULL, -- emergency_fund, retirement, education, home, vehicle, travel, wedding, business, debt_payoff, custom
    
    -- Target definition
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    target_date TIMESTAMP NOT NULL,
    
    -- Priority and importance
    priority INTEGER DEFAULT 0, -- 0-100 calculated priority score
    importance INTEGER DEFAULT 50, -- 1-100 user-defined importance
    risk_tolerance TEXT DEFAULT 'moderate', -- conservative, moderate, aggressive
    
    -- Status tracking
    status TEXT DEFAULT 'planning', -- planning, active, paused, on_track, off_track, achieved, abandoned, exceeded
    progress_percentage NUMERIC(5, 2) DEFAULT 0,
    is_auto_tracked BOOLEAN DEFAULT FALSE,
    auto_calculate_savings BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    tags JSONB DEFAULT '[]',
    notes TEXT,
    custom_properties JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    achieved_at TIMESTAMP,
    abandoned_at TIMESTAMP
);

-- Indexes for financial goals
CREATE INDEX idx_financial_goals_user_id ON financial_goals(user_id);
CREATE INDEX idx_financial_goals_vault_id ON financial_goals(vault_id);
CREATE INDEX idx_financial_goals_status ON financial_goals(status);
CREATE INDEX idx_financial_goals_category ON financial_goals(category);
CREATE INDEX idx_financial_goals_target_date ON financial_goals(target_date);
CREATE INDEX idx_financial_goals_priority ON financial_goals(priority DESC);
CREATE INDEX idx_financial_goals_created ON financial_goals(created_at DESC);

-- Goal Progress Snapshots - Versioned progress history
CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Progress metrics
    contributed_amount NUMERIC(15, 2) NOT NULL,
    contributed_percentage NUMERIC(5, 2) NOT NULL,
    remaining_amount NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL, -- on_track, off_track, at_risk, achieved, behind
    
    -- Timeline metrics
    days_elapsed INTEGER,
    days_remaining INTEGER,
    pace_ratio NUMERIC(5, 2), -- Expected contribution at this point (0-1.0)
    
    -- Calculation metrics
    required_monthly_amount NUMERIC(15, 2),
    required_weekly_amount NUMERIC(15, 2),
    monthly_contribution_trend NUMERIC(15, 2), -- Average monthly contribution
    
    -- Projection metrics
    achievement_probability NUMERIC(5, 2), -- 0-100 success probability
    confidence_level TEXT, -- low (10%), medium (50%), high (90%)
    projected_completion_date TIMESTAMP,
    
    -- Variance analysis
    variance_from_pace NUMERIC(5, 2), -- Positive = ahead, negative = behind
    variance_trend TEXT, -- improving, stable, declining
    
    -- Snapshot metadata
    snapshot_type TEXT DEFAULT 'periodic', -- periodic, manual, milestone, status_change
    calculated_by TEXT DEFAULT 'system', -- system, user, trigger
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for progress snapshots
CREATE INDEX idx_progress_snapshots_goal_id ON goal_progress_snapshots(goal_id);
CREATE INDEX idx_progress_snapshots_user_id ON goal_progress_snapshots(user_id);
CREATE INDEX idx_progress_snapshots_created ON goal_progress_snapshots(created_at DESC);
CREATE INDEX idx_progress_snapshots_status ON goal_progress_snapshots(status);

-- Savings Plans - Calculated contribution schedules
CREATE TABLE IF NOT EXISTS savings_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Plan targets
    starting_amount NUMERIC(15, 2) NOT NULL,
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) NOT NULL,
    time_to_target_months INTEGER NOT NULL,
    
    -- Contribution calculation
    base_monthly_amount NUMERIC(15, 2) NOT NULL,
    weekly_amount NUMERIC(15, 2),
    biweekly_amount NUMERIC(15, 2),
    required_monthly_amount NUMERIC(15, 2),
    contribution_frequency TEXT DEFAULT 'monthly', -- weekly, biweekly, monthly, quarterly, custom
    custom_frequency_days INTEGER,
    
    -- Buffer strategy
    buffer_percentage NUMERIC(5, 2) DEFAULT 10,
    buffer_amount NUMERIC(15, 2),
    adjusted_monthly_amount NUMERIC(15, 2),
    
    -- Payment configuration
    payment_method TEXT, -- cash, auto_debit, investment, allocation
    auto_debit_enabled BOOLEAN DEFAULT FALSE,
    auto_debit_date INTEGER, -- Day of month (1-31)
    target_account_id UUID,
    
    -- Plan adjustments
    previous_versions INTEGER DEFAULT 0,
    adjustment_reason TEXT,
    last_adjusted_at TIMESTAMP,
    
    -- Plan status
    status TEXT DEFAULT 'active', -- active, paused, completed, failed
    success_rate NUMERIC(5, 2), -- Historical adherence percentage
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for savings plans
CREATE INDEX idx_savings_plans_goal_id ON savings_plans(goal_id);
CREATE INDEX idx_savings_plans_user_id ON savings_plans(user_id);
CREATE INDEX idx_savings_plans_status ON savings_plans(status);
CREATE INDEX idx_savings_plans_contribution_frequency ON savings_plans(contribution_frequency);

-- Goal Milestones - Progress checkpoints
CREATE TABLE IF NOT EXISTS goal_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Milestone definition
    milestone_name TEXT NOT NULL,
    milestone_type TEXT NOT NULL, -- percentage, amount, time, custom
    milestone_value NUMERIC(15, 2), -- For amount milestones
    percentage_value NUMERIC(5, 2), -- For percentage milestones (0-100)
    
    -- Target definition
    target_date TIMESTAMP,
    sequence_order INTEGER DEFAULT 0,
    
    -- Status tracking
    status TEXT DEFAULT 'pending', -- pending, achieved, missed, skipped
    achieved_date TIMESTAMP,
    time_to_achieve_days INTEGER, -- Days from goal start to milestone
    
    -- Celebration
    celebration_enabled BOOLEAN DEFAULT TRUE,
    celebration_message TEXT,
    badge_earned TEXT,
    motivation_message TEXT,
    notification_sent BOOLEAN DEFAULT FALSE,
    
    -- Milestone metadata
    is_automatic BOOLEAN DEFAULT FALSE, -- Auto-generated vs user-created
    custom_properties JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for milestones
CREATE INDEX idx_milestones_goal_id ON goal_milestones(goal_id);
CREATE INDEX idx_milestones_user_id ON goal_milestones(user_id);
CREATE INDEX idx_milestones_status ON goal_milestones(status);
CREATE INDEX idx_milestones_achieved_date ON goal_milestones(achieved_date);
CREATE INDEX idx_milestones_sequence ON goal_milestones(sequence_order);

-- Milestone Achievements - Track completions with badges
CREATE TABLE IF NOT EXISTS milestone_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES goal_milestones(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Achievement details
    achieved_date TIMESTAMP NOT NULL,
    achievement_status TEXT DEFAULT 'completed', -- completed, early, late, missed
    days_ahead_or_behind INTEGER,
    
    -- Badge and recognition
    badge_type TEXT, -- gold, silver, bronze, milestone, streak
    badge_description TEXT,
    points_earned INTEGER DEFAULT 0,
    
    -- Celebration tracking
    celebration_shared BOOLEAN DEFAULT FALSE,
    shared_at TIMESTAMP,
    sharing_platform TEXT, -- email, social, internal
    
    -- Motivation
    motivation_factor NUMERIC(5, 2), -- 0-100 motivation boost
    next_milestone_id UUID REFERENCES goal_milestones(id) ON DELETE SET NULL,
    
    -- Metadata
    achievement_note TEXT,
    media_url TEXT, -- Screenshot, celebration image
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for achievements
CREATE INDEX idx_achievements_milestone_id ON milestone_achievements(milestone_id);
CREATE INDEX idx_achievements_goal_id ON milestone_achievements(goal_id);
CREATE INDEX idx_achievements_user_id ON milestone_achievements(user_id);
CREATE INDEX idx_achievements_achieved_date ON milestone_achievements(achieved_date DESC);

-- Goal Transactions Link - Connect transactions to goals
CREATE TABLE IF NOT EXISTS goal_transactions_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Contribution details
    contributed_amount NUMERIC(15, 2) NOT NULL,
    contribution_date TIMESTAMP NOT NULL,
    transaction_type TEXT, -- deposit, transfer, investment_return, accrued_interest
    
    -- Linking metadata
    is_automatic BOOLEAN DEFAULT FALSE, -- Auto-categorized vs manual
    confidence_score NUMERIC(5, 2), -- How confident we are this contributes to goal
    linking_reason TEXT, -- category_match, user_specified, pattern_detected
    
    -- Notes
    notes TEXT,
    
    linked_at TIMESTAMP DEFAULT NOW(),
    unlinked_at TIMESTAMP
);

-- Indexes for goal transaction links
CREATE INDEX idx_goal_transactions_goal_id ON goal_transactions_link(goal_id);
CREATE INDEX idx_goal_transactions_transaction_id ON goal_transactions_link(transaction_id);
CREATE INDEX idx_goal_transactions_user_id ON goal_transactions_link(user_id);
CREATE INDEX idx_goal_transactions_contribution_date ON goal_transactions_link(contribution_date);

-- Goal Timeline Projections - Monte Carlo simulations and predictions
CREATE TABLE IF NOT EXISTS goal_timeline_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Projection parameters
    projection_type TEXT NOT NULL, -- deterministic, stochastic, scenario
    simulation_count INTEGER DEFAULT 1000, -- For Monte Carlo
    
    -- Projection results
    success_probability NUMERIC(5, 2), -- 0-100 success rate
    confidence_level TEXT, -- low (10%), medium (50%), high (90%)
    
    -- Completion timing
    projected_completion_date TIMESTAMP,
    median_completion_date TIMESTAMP,
    earliest_completion_date TIMESTAMP,
    latest_completion_date TIMESTAMP,
    
    -- Amount projections
    current_amount NUMERIC(15, 2),
    target_amount NUMERIC(15, 2),
    best_case_amount NUMERIC(15, 2), -- Optimistic scenario
    worst_case_amount NUMERIC(15, 2), -- Pessimistic scenario
    most_likely_amount NUMERIC(15, 2), -- 50th percentile
    
    -- Variance metrics
    monthly_variance NUMERIC(15, 2), -- Standard deviation of monthly contributions
    return_variance NUMERIC(5, 2), -- Investment return variance (if applicable)
    
    -- Scenario data (JSON)
    percentiles JSONB DEFAULT '{}', -- {10: value, 25: value, 50: value, 75: value, 90: value}
    scenario_results JSONB DEFAULT '{}', -- Different scenario outcomes
    
    -- Projection metadata
    generated_at TIMESTAMP NOT NULL,
    valid_until TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for projections
CREATE INDEX idx_projections_goal_id ON goal_timeline_projections(goal_id);
CREATE INDEX idx_projections_user_id ON goal_timeline_projections(user_id);
CREATE INDEX idx_projections_generated_at ON goal_timeline_projections(generated_at DESC);
CREATE INDEX idx_projections_success_probability ON goal_timeline_projections(success_probability DESC);

-- Goal Analytics Snapshots - Historical analytics and insights
CREATE TABLE IF NOT EXISTS goal_analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Time period
    snapshot_month TEXT NOT NULL, -- YYYY-MM format
    
    -- Health and risk
    health_score NUMERIC(5, 2), -- 0-100 goal health
    health_status TEXT, -- excellent, good, fair, poor, critical
    risk_level TEXT, -- low, medium, high, critical
    
    -- Scoring components
    priority_score NUMERIC(5, 2), -- 0-100
    achievability_score NUMERIC(5, 2), -- 0-100
    progress_velocity NUMERIC(15, 2), -- Amount per month
    
    -- Trend analysis
    trend_direction TEXT, -- improving, stable, declining
    trend_strength TEXT, -- weak, moderate, strong
    momentum NUMERIC(5, 2), -- -100 to +100 (negative = decelerating)
    
    -- Insights and recommendations
    recommended_action TEXT, -- increase_contributions, maintain_pace, reduce_savings, pause, accelerate
    insight_messages JSONB DEFAULT '[]', -- Array of insight strings
    alerts JSONB DEFAULT '[]', -- Warning/alert messages
    
    -- Analytics data
    metrics JSONB DEFAULT '{}', -- Detailed metrics JSON
    analysis_data JSONB DEFAULT '{}', -- Additional analysis data
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX idx_analytics_goal_id ON goal_analytics_snapshots(goal_id);
CREATE INDEX idx_analytics_user_id ON goal_analytics_snapshots(user_id);
CREATE INDEX idx_analytics_snapshot_month ON goal_analytics_snapshots(snapshot_month);
CREATE INDEX idx_analytics_health_status ON goal_analytics_snapshots(health_status);
CREATE INDEX idx_analytics_created ON goal_analytics_snapshots(created_at DESC);

-- Pre-seed some common goal categories (if needed)
-- This is optional but helps with demo/testing
INSERT INTO financial_goals (user_id, vault_id, goal_name, goal_type, category, target_amount, target_date, priority, importance, status)
VALUES 
    (gen_random_uuid(), gen_random_uuid(), 'Emergency Fund', 'savings', 'emergency_fund', 10000, NOW() + INTERVAL '12 months', 95, 100, 'active'),
    (gen_random_uuid(), gen_random_uuid(), 'Retirement', 'investment', 'retirement', 1000000, NOW() + INTERVAL '25 years', 90, 95, 'active'),
    (gen_random_uuid(), gen_random_uuid(), 'Home Down Payment', 'savings', 'home', 50000, NOW() + INTERVAL '36 months', 80, 85, 'active')
ON CONFLICT DO NOTHING;

-- Grants
GRANT SELECT, INSERT, UPDATE ON financial_goals TO authenticated;
GRANT SELECT, INSERT ON goal_progress_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON savings_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON goal_milestones TO authenticated;
GRANT SELECT, INSERT ON milestone_achievements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_transactions_link TO authenticated;
GRANT SELECT, INSERT ON goal_timeline_projections TO authenticated;
GRANT SELECT, INSERT ON goal_analytics_snapshots TO authenticated;

-- Comments
COMMENT ON TABLE financial_goals IS 'Core financial goal definitions with state and progress tracking';
COMMENT ON TABLE goal_progress_snapshots IS 'Versioned progress history for goals with calculated metrics';
COMMENT ON TABLE savings_plans IS 'Calculated contribution schedules and payment plans';
COMMENT ON TABLE goal_milestones IS 'Progress checkpoints and celebration markers';
COMMENT ON TABLE milestone_achievements IS 'Tracked milestone completions with badges and recognition';
COMMENT ON TABLE goal_transactions_link IS 'Links transactions to goals for automatic progress tracking';
COMMENT ON TABLE goal_timeline_projections IS 'Monte Carlo projections and achievability predictions';
COMMENT ON TABLE goal_analytics_snapshots IS 'Historical analytics with health scores and insights';
