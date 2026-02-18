-- Add emergency_fund_goals table
CREATE TABLE IF NOT EXISTS "emergency_fund_goals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "target_months" integer NOT NULL DEFAULT 3,
    "target_amount" numeric(12, 2) NOT NULL,
    "current_savings" numeric(12, 2) DEFAULT '0',
    "currency" text DEFAULT 'USD',
    "status" text DEFAULT 'active',
    "monthly_expenses" numeric(12, 2) DEFAULT '0',
    "notes" text,
    "metadata" jsonb DEFAULT '{"lastContribution": null, "totalContributions": 0, "contributionHistory": []}',
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS "emergency_fund_goals_user_id_idx" ON "emergency_fund_goals"("user_id");

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS "emergency_fund_goals_status_idx" ON "emergency_fund_goals"("status");
