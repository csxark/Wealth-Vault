-- Social Financial Challenges Enhancement
-- Add tables for comments, likes, activity feed, and social features

-- Challenge Comments Table
CREATE TABLE "challenge_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "content" text NOT NULL,
    "parent_comment_id" uuid REFERENCES "challenge_comments"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT NOW(),
    "updated_at" timestamp with time zone DEFAULT NOW()
);

-- Challenge Likes/Hearts Table
CREATE TABLE "challenge_likes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT NOW(),
    UNIQUE("challenge_id", "user_id")
);

-- Challenge Activity Feed Table
CREATE TABLE "challenge_activity" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "challenge_id" uuid REFERENCES "challenges"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "activity_type" text NOT NULL, -- 'joined', 'completed', 'milestone', 'comment', 'like', 'created'
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamp with time zone DEFAULT NOW()
);

-- Challenge Templates Table (predefined challenges)
CREATE TABLE "challenge_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "target_type" text NOT NULL, -- 'save_amount', 'reduce_expense', 'increase_income'
    "target_amount" numeric(12, 2) NOT NULL,
    "default_duration_days" integer NOT NULL DEFAULT 30,
    "difficulty" text DEFAULT 'medium', -- 'easy', 'medium', 'hard'
    "category" text NOT NULL, -- 'savings', 'budgeting', 'debt_payoff', 'emergency_fund', 'investment'
    "icon" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT NOW()
);

-- User Challenge Stats Table
CREATE TABLE "user_challenge_stats" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade UNIQUE,
    "total_challenges_joined" integer DEFAULT 0,
    "total_challenges_completed" integer DEFAULT 0,
    "total_challenges_created" integer DEFAULT 0,
    "total_wins" integer DEFAULT 0, -- Number of times finished #1
    "best_streak" integer DEFAULT 0, -- Longest consecutive challenge completions
    "current_streak" integer DEFAULT 0,
    "total_points_earned" integer DEFAULT 0,
    "average_finish_position" numeric(5, 2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT NOW(),
    "updated_at" timestamp with time zone DEFAULT NOW()
);

-- Challenge Invitations Table
CREATE TABLE "challenge_invitations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE cascade,
    "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "invitee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "status" text DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired'
    "created_at" timestamp with time zone DEFAULT NOW(),
    "responded_at" timestamp with time zone,
    UNIQUE("challenge_id", "invitee_id")
);

-- Add Indexes for Performance
CREATE INDEX "challenge_comments_challenge_id_idx" ON "challenge_comments"("challenge_id");
CREATE INDEX "challenge_comments_user_id_idx" ON "challenge_comments"("user_id");
CREATE INDEX "challenge_likes_challenge_id_idx" ON "challenge_likes"("challenge_id");
CREATE INDEX "challenge_likes_user_id_idx" ON "challenge_likes"("user_id");
CREATE INDEX "challenge_activity_challenge_id_idx" ON "challenge_activity"("challenge_id");
CREATE INDEX "challenge_activity_user_id_idx" ON "challenge_activity"("user_id");
CREATE INDEX "challenge_activity_created_at_idx" ON "challenge_activity"("created_at");
CREATE INDEX "challenge_invitations_challenge_id_idx" ON "challenge_invitations"("challenge_id");
CREATE INDEX "challenge_invitations_invitee_id_idx" ON "challenge_invitations"("invitee_id");
CREATE INDEX "challenges_category_idx" ON "challenges"(((metadata->>'category')));
CREATE INDEX "challenges_difficulty_idx" ON "challenges"(((metadata->>'difficulty')));

-- Insert Default Challenge Templates
INSERT INTO "challenge_templates" ("title", "description", "target_type", "target_amount", "default_duration_days", "difficulty", "category", "icon") VALUES
('$500 Emergency Fund', 'Build a $500 emergency fund in 30 days', 'save_amount', 500, 30, 'easy', 'emergency_fund', '🛡️'),
('$1000 Emergency Fund', 'Build a $1000 emergency fund in 60 days', 'save_amount', 1000, 60, 'medium', 'emergency_fund', '🛡️'),
('3-Month Emergency Fund', 'Build 3 months of expenses as emergency fund', 'save_amount', 3000, 90, 'hard', 'emergency_fund', '🏰'),
('Reduce Dining Out', 'Reduce dining out expenses by 50% this month', 'reduce_expense', 50, 30, 'medium', 'budgeting', '🍽️'),
('Cut Subscription Costs', 'Reduce monthly subscription spending by $50', 'reduce_expense', 50, 30, 'easy', 'budgeting', '📺'),
('No Spend Challenge', 'Go 7 days without any unnecessary spending', 'reduce_expense', 100, 7, 'hard', 'budgeting', '🎯'),
('Save 20% Income', 'Save 20% of your monthly income', 'save_amount', 500, 30, 'hard', 'savings', '💰'),
('Daily Coffee Savings', 'Skip the daily coffee and save that money', 'save_amount', 60, 30, 'easy', 'savings', '☕'),
('Pay Off $500 Debt', 'Pay off $500 of credit card debt', 'reduce_expense', 500, 30, 'medium', 'debt_payoff', '💳'),
('Pay Off $1000 Debt', 'Pay off $1000 of credit card debt', 'reduce_expense', 1000, 60, 'hard', 'debt_payoff', '💳'),
('Increase Income Side Hustle', 'Earn $200 from a side hustle', 'increase_income', 200, 30, 'hard', 'investment', '🚀'),
('Investment Goal', 'Invest $100 in your portfolio', 'increase_income', 100, 30, 'medium', 'investment', '📈');

-- Add columns to challenges table if not exist
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "cover_image" text;
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "allow_comments" boolean DEFAULT true;
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "show_on_homepage" boolean DEFAULT false;

-- Update user_challenge_stats when challenge participant is created (trigger function)
CREATE OR REPLACE FUNCTION update_user_challenge_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_challenge_stats (user_id, total_challenges_joined, current_streak)
    VALUES (NEW.user_id, 1, 1)
    ON CONFLICT (user_id) DO UPDATE SET
        total_challenges_joined = user_challenge_stats.total_challenges_joined + 1,
        current_streak = user_challenge_stats.current_streak + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_challenge_join
AFTER INSERT ON "challenge_participants"
FOR EACH ROW
EXECUTE FUNCTION update_user_challenge_stats();

