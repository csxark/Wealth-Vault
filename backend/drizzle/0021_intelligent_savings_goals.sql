-- Migration: Add Intelligent Savings Goals with Auto-Allocation
-- Issue #640: Intelligent Savings Goals with Auto-Allocation

-- Enhance goals table with intelligent features
ALTER TABLE goals ADD COLUMN IF NOT EXISTS priority_score NUMERIC(5, 2) DEFAULT 50.00; -- 0-100 score
ALTER TABLE goals ADD COLUMN IF NOT EXISTS urgency_rating NUMERIC(3, 2) DEFAULT 0.50; -- 0-1 scale
ALTER TABLE goals ADD COLUMN IF NOT EXISTS importance_score INTEGER DEFAULT 5 CHECK (importance_score >= 1 AND importance_score <= 10);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS allocation_strategy TEXT DEFAULT 'balanced'; -- balanced, deadline_focused, priority_based, completion_first
ALTER TABLE goals ADD COLUMN IF NOT EXISTS minimum_monthly_contribution NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS maximum_monthly_contribution NUMERIC(12, 2);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS auto_allocate_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS velocity NUMERIC(12, 2); -- Average contribution per month
ALTER TABLE goals ADD COLUMN IF NOT EXISTS projected_completion_date TIMESTAMP;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS is_conflict_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS conflict_severity TEXT; -- low, medium, high
ALTER TABLE goals ADD COLUMN IF NOT EXISTS last_priority_calculated_at TIMESTAMP;

-- Create goal priorities table for tracking priority calculations
CREATE TABLE IF NOT EXISTS goal_priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    priority_score NUMERIC(5, 2) NOT NULL,
    urgency_score NUMERIC(5, 2) NOT NULL,
    importance_score NUMERIC(5, 2) NOT NULL,
    progress_score NUMERIC(5, 2) NOT NULL,
    impact_score NUMERIC(5, 2) NOT NULL,
    ranking INTEGER, -- Overall ranking among user's goals
    calculation_factors JSONB, -- Store factors used in calculation
    calculated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- Cache expiration
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_priorities_goal ON goal_priorities(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_priorities_user ON goal_priorities(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_priorities_score ON goal_priorities(priority_score DESC);

-- Create goal allocations table for storing recommendation history
CREATE TABLE IF NOT EXISTS goal_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allocation_period TEXT NOT NULL, -- YYYY-MM format
    total_available NUMERIC(12, 2) NOT NULL,
    strategy_used TEXT NOT NULL, -- balanced, deadline_focused, priority_based, completion_first
    allocations JSONB NOT NULL, -- Array of {goalId, amount, percentage, reasoning}
    was_accepted BOOLEAN DEFAULT NULL,
    was_modified BOOLEAN DEFAULT FALSE,
    actual_allocations JSONB, -- What user actually did
    recommendation_quality_score NUMERIC(3, 2), -- User feedback 0-1
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    applied_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_allocations_user ON goal_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_allocations_period ON goal_allocations(allocation_period);
CREATE INDEX IF NOT EXISTS idx_goal_allocations_accepted ON goal_allocations(was_accepted);

-- Create goal achievements table
CREATE TABLE IF NOT EXISTS goal_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_type TEXT NOT NULL, -- goal_setter, first_milestone, halfway, completed, consistent_saver, speed_demon, etc.
    achievement_name TEXT NOT NULL,
    achievement_description TEXT,
    badge_icon TEXT,
    badge_color TEXT,
    points_earned INTEGER DEFAULT 0,
    related_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    earned_at TIMESTAMP DEFAULT NOW(),
    claimed_at TIMESTAMP,
    is_claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_achievements_user ON goal_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_achievements_type ON goal_achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_goal_achievements_earned ON goal_achievements(earned_at DESC);

-- Enhance goal_milestones table
ALTER TABLE goal_milestones ADD COLUMN IF NOT EXISTS milestone_type TEXT DEFAULT 'custom'; -- custom, percentage, amount, date
ALTER TABLE goal_milestones ADD COLUMN IF NOT EXISTS percentage_target NUMERIC(5, 2); -- For percentage-based milestones
ALTER TABLE goal_milestones ADD COLUMN IF NOT EXISTS achievement_id UUID REFERENCES goal_achievements(id) ON DELETE SET NULL;
ALTER TABLE goal_milestones ADD COLUMN IF NOT EXISTS celebration_triggered BOOLEAN DEFAULT FALSE;
ALTER TABLE goal_milestones ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- Create goal conflicts table
CREATE TABLE IF NOT EXISTS goal_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conflict_type TEXT NOT NULL, -- insufficient_funds, deadline_overlap, priority_clash, capacity_exceeded
    severity TEXT NOT NULL, -- low, medium, high, critical
    affected_goal_ids UUID[] NOT NULL,
    description TEXT NOT NULL,
    recommendations JSONB, -- Array of resolution suggestions
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolution_method TEXT, -- deadline_extension, amount_adjustment, goal_pause, allocation_adjustment
    resolution_notes TEXT,
    detected_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_conflicts_user ON goal_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_conflicts_severity ON goal_conflicts(severity);
CREATE INDEX IF NOT EXISTS idx_goal_conflicts_resolved ON goal_conflicts(is_resolved);

-- Create goal scenarios table for "what if" modeling
CREATE TABLE IF NOT EXISTS goal_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_name TEXT NOT NULL,
    scenario_type TEXT NOT NULL, -- increased_contribution, deadline_change, new_goal, income_change
    base_monthly_contribution NUMERIC(12, 2),
    simulated_monthly_contribution NUMERIC(12, 2),
    affected_goal_ids UUID[],
    simulation_results JSONB NOT NULL, -- Projected outcomes
    comparison_metrics JSONB, -- Before vs After metrics
    is_saved BOOLEAN DEFAULT FALSE,
    is_applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_scenarios_user ON goal_scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_scenarios_saved ON goal_scenarios(is_saved);
CREATE INDEX IF NOT EXISTS idx_goal_scenarios_created ON goal_scenarios(created_at DESC);

-- Create goal templates table
CREATE TABLE IF NOT EXISTS goal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT UNIQUE NOT NULL,
    template_name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- emergency_fund, vacation, home_purchase, debt_payoff, etc.
    icon TEXT,
    default_target_formula TEXT, -- Formula to calculate default amount (e.g., "income * 6")
    recommended_timeline_months INTEGER,
    priority_default INTEGER DEFAULT 5,
    tips JSONB DEFAULT '[]', -- Array of helpful tips
    milestones_template JSONB DEFAULT '[]', -- Suggested milestones
    is_system_template BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_templates_category ON goal_templates(category);
CREATE INDEX IF NOT EXISTS idx_goal_templates_active ON goal_templates(is_active);

-- Insert default goal templates
INSERT INTO goal_templates (template_key, template_name, description, category, icon, default_target_formula, recommended_timeline_months, priority_default, tips, milestones_template)
VALUES
    ('emergency_fund', 'Emergency Fund', 'Build a safety net for unexpected expenses', 'savings', '🛡️', 'income * 6', 12, 9, 
     '["Start with $1000 as a mini emergency fund", "Aim for 3-6 months of expenses", "Keep in high-yield savings account"]'::jsonb,
     '[{"percentage": 25, "name": "First Month Covered"}, {"percentage": 50, "name": "Three Months Covered"}, {"percentage": 100, "name": "Fully Funded"}]'::jsonb),
    
    ('vacation', 'Dream Vacation', 'Save for your next adventure', 'travel', '✈️', '3000', 12, 5,
     '["Research costs early", "Book flights during sales", "Consider off-season travel"]'::jsonb,
     '[{"percentage": 25, "name": "Flights Booked"}, {"percentage": 75, "name": "Accommodation Ready"}, {"percentage": 100, "name": "Ready to Go"}]'::jsonb),
    
    ('home_down_payment', 'Home Down Payment', 'Save for your first home or next property', 'housing', '🏠', '50000', 36, 8,
     '["Typical down payment is 20%", "Consider first-time buyer programs", "Factor in closing costs"]'::jsonb,
     '[{"percentage": 25, "name": "Quarter Way There"}, {"percentage": 50, "name": "Halfway Home"}, {"percentage": 100, "name": "Ready to Buy"}]'::jsonb),
    
    ('car_purchase', 'Car Purchase', 'Save for a new or used vehicle', 'transportation', '🚗', '15000', 24, 6,
     '["Save at least 20% for down payment", "Consider total cost of ownership", "Compare financing options"]'::jsonb,
     '[{"percentage": 20, "name": "Down Payment Ready"}, {"percentage": 100, "name": "Cash Purchase Ready"}]'::jsonb),
    
    ('debt_payoff', 'Debt Payoff', 'Become debt-free faster', 'debt', '💳', '5000', 18, 9,
     '["Target high-interest debt first", "Consider avalanche or snowball method", "Negotiate lower rates"]'::jsonb,
     '[{"percentage": 25, "name": "Quarter Paid"}, {"percentage": 50, "name": "Halfway Free"}, {"percentage": 100, "name": "Debt Free!"}]'::jsonb),
    
    ('wedding', 'Wedding Fund', 'Save for your special day', 'life_events', '💍', '25000', 18, 7,
     '["Average wedding costs vary by location", "Prioritize must-haves", "Consider seasonal discounts"]'::jsonb,
     '[{"percentage": 33, "name": "Venue Secured"}, {"percentage": 66, "name": "Vendors Booked"}, {"percentage": 100, "name": "Wedding Ready"}]'::jsonb),
    
    ('education', 'Education Fund', 'Invest in learning and growth', 'education', '🎓', '10000', 24, 7,
     '["Research tuition costs", "Look for scholarships", "Consider payment plans"]'::jsonb,
     '[{"percentage": 50, "name": "First Semester Covered"}, {"percentage": 100, "name": "Fully Funded"}]'::jsonb),
    
    ('retirement', 'Retirement Savings', 'Build your retirement nest egg', 'retirement', '🌅', 'income * 12', 120, 10,
     '["Start early for compound growth", "Max out employer match", "Diversify investments"]'::jsonb,
     '[{"percentage": 10, "name": "Getting Started"}, {"percentage": 50, "name": "Halfway to Retirement"}, {"percentage": 100, "name": "Retirement Ready"}]'::jsonb)
ON CONFLICT (template_key) DO NOTHING;

-- Create goal reminder settings table
CREATE TABLE IF NOT EXISTS goal_reminder_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE, -- NULL means global settings
    reminder_enabled BOOLEAN DEFAULT TRUE,
    reminder_frequency TEXT DEFAULT 'weekly', -- daily, weekly, biweekly, monthly, payday
    reminder_day_of_week INTEGER, -- 0-6 for weekly reminders
    reminder_day_of_month INTEGER, -- 1-31 for monthly reminders
    reminder_time TIME DEFAULT '09:00:00',
    context_aware BOOLEAN DEFAULT TRUE, -- Use spending pattern analysis
    custom_message TEXT,
    last_reminder_sent TIMESTAMP,
    next_reminder_due TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_reminder_settings_user ON goal_reminder_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_reminder_settings_next_due ON goal_reminder_settings(next_reminder_due);

-- Create allocation recommendations audit log
CREATE TABLE IF NOT EXISTS allocation_recommendation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id UUID NOT NULL REFERENCES goal_allocations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feedback_type TEXT NOT NULL, -- accepted, rejected, modified, helpful, not_helpful
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_notes TEXT,
    improvement_suggestions TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocation_feedback_allocation ON allocation_recommendation_feedback(allocation_id);
CREATE INDEX IF NOT EXISTS idx_allocation_feedback_user ON allocation_recommendation_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_allocation_feedback_type ON allocation_recommendation_feedback(feedback_type);

-- Add indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_goals_priority_score ON goals(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_goals_deadline ON goals(deadline);
CREATE INDEX IF NOT EXISTS idx_goals_auto_allocate ON goals(auto_allocate_enabled) WHERE auto_allocate_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_goals_template ON goals(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_conflict ON goals(is_conflict_detected) WHERE is_conflict_detected = TRUE;
