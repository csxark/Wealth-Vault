-- Gamification System Migration
-- Financial Wellness Score & Gamification Feature

-- Achievement Definitions Table (predefined achievements)
CREATE TABLE IF NOT EXISTS achievement_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'savings', 'budgeting', 'goals', 'streaks', 'challenges', 'education'
    icon VARCHAR(100),
    tier VARCHAR(20) NOT NULL DEFAULT 'bronze', -- 'bronze', 'silver', 'gold', 'platinum', 'diamond'
    points_required INTEGER DEFAULT 0,
    criteria JSONB NOT NULL, -- { type: 'action_count'|'milestone'|'streak'|'score', value: number, metric: string }
    reward_points INTEGER NOT NULL DEFAULT 0,
    reward_badge BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Achievements Table (tracks earned achievements)
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    achievement_id UUID REFERENCES achievement_definitions(id) ON DELETE CASCADE NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    progress INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, achievement_id)
);

-- User Points System Table
CREATE TABLE IF NOT EXISTS user_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    total_points INTEGER NOT NULL DEFAULT 0,
    lifetime_points INTEGER NOT NULL DEFAULT 0,
    current_level INTEGER NOT NULL DEFAULT 1,
    total_badges INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_activity_date DATE,
    weekly_points INTEGER NOT NULL DEFAULT 0,
    monthly_points INTEGER NOT NULL DEFAULT 0,
    points_to_next_level INTEGER NOT NULL DEFAULT 100,
    level_progress INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Points History Table (transaction log)
CREATE TABLE IF NOT EXISTS points_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    points INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'achievement_earned', 'challenge_completed', 'goal_reached', 'daily_login', etc.
    description VARCHAR(255),
    reference_id UUID, -- Optional reference to related entity (achievement_id, challenge_id, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Streaks Table
CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    streak_type VARCHAR(30) NOT NULL, -- 'daily_login', 'budget_adherence', 'savings_contribution', 'expense_log'
    current_count INTEGER NOT NULL DEFAULT 0,
    longest_count INTEGER NOT NULL DEFAULT 0,
    start_date DATE,
    last_activity_date DATE,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, streak_type)
);

-- Insert default achievement definitions
INSERT INTO achievement_definitions (code, name, description, category, icon, tier, points_required, criteria, reward_points) VALUES
-- Onboarding Achievements
('first_login', 'First Steps', 'Complete your profile setup', 'onboarding', 'rocket', 'bronze', 0, '{"type": "milestone", "metric": "profile_complete"}', 50),
('first_goal', 'Goal Setter', 'Create your first savings goal', 'goals', 'target', 'bronze', 0, '{"type": "milestone", "metric": "goal_created"}', 75),
('first_budget', 'Budget Boss', 'Set up your first monthly budget', 'budgeting', 'pie-chart', 'bronze', 0, '{"type": "milestone", "metric": "budget_created"}', 75),

-- Savings Achievements
('save_100', 'First Hundred', 'Save your first $100', 'savings', 'dollar-sign', 'bronze', 100, '{"type": "milestone", "metric": "total_savings", "value": 100}', 100),
('save_1000', 'Savings Starter', 'Save $1,000 total', 'savings', 'piggy-bank', 'silver', 500, '{"type": "milestone", "metric": "total_savings", "value": 1000}', 200),
('save_5000', 'Money Minded', 'Save $5,000 total', 'savings', 'trending-up', 'silver', 1000, '{"type": "milestone", "metric": "total_savings", "value": 5000}', 350),
('save_10000', 'Ten Grand', 'Save $10,000 total', 'savings', 'award', 'gold', 2000, '{"type": "milestone", "metric": "total_savings", "value": 10000}', 500),

-- Budget Achievements
('budget_streak_7', 'Week Warrior', 'Stay on budget for 7 days', 'budgeting', 'calendar', 'bronze', 0, '{"type": "streak", "metric": "budget_adherence", "value": 7}', 100),
('budget_streak_30', 'Monthly Master', 'Stay on budget for 30 days', 'budgeting', 'calendar-check', 'silver', 0, '{"type": "streak", "metric": "budget_adherence", "value": 30}', 300),
('budget_streak_100', 'Century Champion', 'Stay on budget for 100 days', 'budgeting', 'star', 'gold', 0, '{"type": "streak", "metric": "budget_adherence", "value": 100}', 750),

-- Goals Achievements
('goal_completed_1', 'Dream Achiever', 'Complete your first goal', 'goals', 'check-circle', 'bronze', 0, '{"type": "milestone", "metric": "goals_completed", "value": 1}', 150),
('goal_completed_5', 'Goal Getter', 'Complete 5 goals', 'goals', 'trophy', 'silver', 0, '{"type": "milestone", "metric": "goals_completed", "value": 5}', 400),
('goal_completed_10', 'Tenacious Ten', 'Complete 10 goals', 'goals', 'medal', 'gold', 0, '{"type": "milestone", "metric": "goals_completed", "value": 10}', 750),

-- Expense Tracking Achievements
('expense_log_10', 'Expense Tracker', 'Log 10 expenses', 'expenses', 'list', 'bronze', 0, '{"type": "action_count", "metric": "expenses_logged", "value": 10}', 50),
('expense_log_100', 'Expense Master', 'Log 100 expenses', 'expenses', 'file-text', 'silver', 0, '{"type": "action_count", "metric": "expenses_logged", "value": 100}', 150),
('expense_log_500', 'Expense Pro', 'Log 500 expenses', 'expenses', 'folder', 'gold', 0, '{"type": "action_count", "metric": "expenses_logged", "value": 500}', 350),

-- Emergency Fund Achievements
('emergency_fund_1month', 'Safety First', 'Save 1 month of expenses', 'savings', 'shield', 'bronze', 0, '{"type": "milestone", "metric": "emergency_fund_months", "value": 1}', 100),
('emergency_fund_3month', 'Prepared', 'Save 3 months of expenses', 'savings', 'shield-check', 'silver', 0, '{"type": "milestone", "metric": "emergency_fund_months", "value": 3}', 250),
('emergency_fund_6month', 'Fully Protected', 'Save 6 months of expenses', 'savings', 'shield-off', 'gold', 0, '{"type": "milestone", "metric": "emergency_fund_months", "value": 6}', 500),

-- Financial Health Achievements
('health_excellent', 'Financial Wizard', 'Achieve Excellent health score', 'health', 'heart', 'gold', 0, '{"type": "score", "metric": "financial_health_score", "value": 80}', 500),
('health_good', 'Finance Fit', 'Achieve Good health score', 'health', 'activity', 'silver', 0, '{"type": "score", "metric": "financial_health_score", "value": 60}', 250),

-- Challenge Achievements
('challenge_joined', 'Challenger', 'Join your first challenge', 'challenges', 'users', 'bronze', 0, '{"type": "milestone", "metric": "challenges_joined", "value": 1}', 75),
('challenge_completed_1', 'Challenge Champion', 'Complete your first challenge', 'challenges', 'flag', 'silver', 0, '{"type": "milestone", "metric": "challenges_completed", "value": 1}', 200),
('challenge_completed_5', 'Challenge Master', 'Complete 5 challenges', 'challenges', 'zap', 'gold', 0, '{"type": "milestone", "metric": "challenges_completed", "value": 5}', 500),

-- Streak Achievements
('login_streak_7', 'Consistent', 'Log in 7 days in a row', 'streaks', 'clock', 'bronze', 0, '{"type": "streak", "metric": "daily_login", "value": 7}', 75),
('login_streak_30', 'Dedicated', 'Log in 30 days in a row', 'streaks', 'calendar', 'silver', 0, '{"type": "streak", "metric": "daily_login", "value": 30}', 250),
('login_streak_100', 'Unstoppable', 'Log in 100 days in a row', 'streaks', 'calendar', 'gold', 0, '{"type": "streak", "metric": "daily_login", "value": 100}', 750),

-- Level Achievements
('level_5', 'Rising Star', 'Reach Level 5', 'levels', 'star', 'bronze', 0, '{"type": "level", "value": 5}', 100),
('level_10', 'Finance Pro', 'Reach Level 10', 'levels', 'star', 'silver', 0, '{"type": "level", "value": 10}', 250),
('level_25', 'Wealth Builder', 'Reach Level 25', 'levels', 'star', 'gold', 0, '{"type": "level", "value": 25}', 500),
('level_50', 'Money Master', 'Reach Level 50', 'levels', 'crown', 'platinum', 0, '{"type": "level", "value": 50}', 1000);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_points_history_user_id ON points_history(user_id);
CREATE INDEX IF NOT EXISTS idx_points_history_created_at ON points_history(created_at);
CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON user_streaks(user_id);
