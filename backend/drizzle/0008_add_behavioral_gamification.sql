-- Migration: Add Behavioral Finance Gamification Tables
-- Issue: #194
-- Description: Adds comprehensive gamification system with scoring, badges, and habit tracking

-- User Scores Table
-- Tracks multi-dimensional financial health scores for each user
CREATE TABLE IF NOT EXISTS user_scores (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Score metrics (0-100 scale)
    overall_score INTEGER DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
    budget_adherence_score INTEGER DEFAULT 0 CHECK (budget_adherence_score >= 0 AND budget_adherence_score <= 100),
    savings_rate_score INTEGER DEFAULT 0 CHECK (savings_rate_score >= 0 AND savings_rate_score <= 100),
    consistency_score INTEGER DEFAULT 0 CHECK (consistency_score >= 0 AND consistency_score <= 100),
    impulse_control_score INTEGER DEFAULT 0 CHECK (impulse_control_score >= 0 AND impulse_control_score <= 100),
    planning_score INTEGER DEFAULT 0 CHECK (planning_score >= 0 AND planning_score <= 100),
    
    -- Historical tracking
    score_history JSONB DEFAULT '[]'::jsonb,
    
    -- AI-generated insights
    insights JSONB DEFAULT '{}'::jsonb,
    strengths TEXT[] DEFAULT ARRAY[]::TEXT[],
    improvements TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Gamification metrics
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1 CHECK (level >= 1 AND level <= 100),
    experience_points INTEGER DEFAULT 0,
    next_level_threshold INTEGER DEFAULT 100,
    
    -- Timestamps
    last_calculated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Badges Table
-- Defines and tracks user achievements
CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Badge identity
    badge_type VARCHAR(100) NOT NULL,
    badge_name VARCHAR(200) NOT NULL,
    badge_description TEXT,
    badge_icon VARCHAR(20) DEFAULT '🏆',
    
    -- Badge tier system
    badge_tier VARCHAR(20) DEFAULT 'bronze' CHECK (badge_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
    
    -- Requirements and progress
    requirement JSONB NOT NULL, -- Defines what's needed to earn the badge
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    
    -- Award status
    is_unlocked BOOLEAN DEFAULT FALSE,
    earned_at TIMESTAMP,
    experience_reward INTEGER DEFAULT 0,
    
    -- Organization
    category VARCHAR(50) DEFAULT 'general',
    rarity VARCHAR(20) DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
    display_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent duplicate badges per user
    UNIQUE(user_id, badge_type)
);

-- Habit Logs Table
-- Records detected spending habits and behavioral patterns
CREATE TABLE IF NOT EXISTS habit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Habit classification
    habit_type VARCHAR(100) NOT NULL, -- e.g., weekend_overspending, payday_splurge
    habit_category VARCHAR(20) DEFAULT 'neutral' CHECK (habit_category IN ('positive', 'negative', 'neutral')),
    impact_score INTEGER DEFAULT 0 CHECK (impact_score >= -100 AND impact_score <= 100),
    
    -- Detection metadata
    detected_by VARCHAR(50) DEFAULT 'system' CHECK (detected_by IN ('system', 'ai', 'user')),
    confidence DECIMAL(3, 2) DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
    
    -- AI analysis
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    
    -- Contextual data
    context_data JSONB DEFAULT '{}'::jsonb, -- dayOfWeek, timeOfDay, location, trigger, etc.
    related_expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
    related_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    
    -- User acknowledgment
    user_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    correction_action TEXT,
    
    -- Timestamps
    logged_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance optimization

-- User Scores indexes
CREATE INDEX IF NOT EXISTS idx_user_scores_user_id ON user_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scores_overall_score ON user_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_scores_level ON user_scores(level DESC);
CREATE INDEX IF NOT EXISTS idx_user_scores_last_calculated ON user_scores(last_calculated_at);

-- Badges indexes
CREATE INDEX IF NOT EXISTS idx_badges_user_id ON badges(user_id);
CREATE INDEX IF NOT EXISTS idx_badges_is_unlocked ON badges(is_unlocked);
CREATE INDEX IF NOT EXISTS idx_badges_user_unlocked ON badges(user_id, is_unlocked);
CREATE INDEX IF NOT EXISTS idx_badges_category ON badges(category);
CREATE INDEX IF NOT EXISTS idx_badges_earned_at ON badges(earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_badges_progress ON badges(progress DESC);

-- Habit Logs indexes
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_id ON habit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_category ON habit_logs(habit_category);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_category ON habit_logs(user_id, habit_category);
CREATE INDEX IF NOT EXISTS idx_habit_logs_logged_at ON habit_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_related_expense ON habit_logs(related_expense_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_acknowledged ON habit_logs(user_acknowledged);
CREATE INDEX IF NOT EXISTS idx_habit_logs_impact_score ON habit_logs(impact_score);

-- Comments for documentation
COMMENT ON TABLE user_scores IS 'Stores multi-dimensional financial health scores and gamification metrics for users';
COMMENT ON TABLE badges IS 'Defines and tracks achievement badges earned by users for financial milestones';
COMMENT ON TABLE habit_logs IS 'Records detected spending habits and behavioral patterns with AI analysis';

COMMENT ON COLUMN user_scores.overall_score IS 'Composite financial health score (0-100)';
COMMENT ON COLUMN user_scores.score_history IS 'Array of historical score snapshots with timestamps';
COMMENT ON COLUMN user_scores.insights IS 'AI-generated insights about financial behavior';
COMMENT ON COLUMN user_scores.current_streak IS 'Current streak of positive financial behaviors (days)';
COMMENT ON COLUMN user_scores.level IS 'User level based on experience points (1-100)';

COMMENT ON COLUMN badges.badge_tier IS 'Achievement tier: bronze, silver, gold, platinum, diamond';
COMMENT ON COLUMN badges.requirement IS 'JSON object defining badge requirements (e.g., {type: budget_adherence, weeks: 4})';
COMMENT ON COLUMN badges.progress IS 'Progress towards unlocking badge (0-100%)';

COMMENT ON COLUMN habit_logs.habit_type IS 'Specific habit pattern detected (e.g., weekend_overspending, payday_splurge)';
COMMENT ON COLUMN habit_logs.impact_score IS 'Impact on financial health: -100 (very negative) to +100 (very positive)';
COMMENT ON COLUMN habit_logs.confidence IS 'AI confidence in detection (0.0-1.0)';
COMMENT ON COLUMN habit_logs.context_data IS 'Contextual information about when/where habit occurred';
