-- Migration: Add Autonomous Anomaly Detection & Security Guardrail System
-- Issue #195: Security markers and disputed transactions tables

-- Security Markers Table (Anomaly Detection)
CREATE TABLE IF NOT EXISTS "security_markers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "expense_id" uuid REFERENCES "expenses"("id") ON DELETE CASCADE,
    "marker_type" text NOT NULL,
    "severity" text NOT NULL DEFAULT 'medium',
    "status" text NOT NULL DEFAULT 'pending',
    "detection_method" text NOT NULL,
    "anomaly_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "ai_analysis" jsonb DEFAULT '{}'::jsonb,
    "requires_mfa" boolean DEFAULT false,
    "mfa_verified_at" timestamp,
    "reviewed_by" uuid REFERENCES "users"("id"),
    "reviewed_at" timestamp,
    "review_notes" text,
    "auto_resolve" boolean DEFAULT false,
    "auto_resolve_at" timestamp,
    "metadata" jsonb DEFAULT '{"triggerRules": [], "userNotified": false, "escalationLevel": 0}'::jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Disputed Transactions Table
CREATE TABLE IF NOT EXISTS "disputed_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "expense_id" uuid NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
    "security_marker_id" uuid REFERENCES "security_markers"("id") ON DELETE SET NULL,
    "dispute_type" text NOT NULL,
    "dispute_reason" text NOT NULL,
    "dispute_status" text NOT NULL DEFAULT 'open',
    "original_amount" numeric(12, 2) NOT NULL,
    "disputed_amount" numeric(12, 2),
    "evidence" jsonb DEFAULT '[]'::jsonb,
    "merchant_info" jsonb DEFAULT '{}'::jsonb,
    "resolution_details" jsonb DEFAULT '{}'::jsonb,
    "priority" text DEFAULT 'normal',
    "assigned_to" uuid REFERENCES "users"("id"),
    "communication_log" jsonb DEFAULT '[]'::jsonb,
    "is_blocked" boolean DEFAULT true,
    "resolved_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_security_markers_user_id" ON "security_markers"("user_id");
CREATE INDEX IF NOT EXISTS "idx_security_markers_expense_id" ON "security_markers"("expense_id");
CREATE INDEX IF NOT EXISTS "idx_security_markers_status" ON "security_markers"("status");
CREATE INDEX IF NOT EXISTS "idx_security_markers_severity" ON "security_markers"("severity");
CREATE INDEX IF NOT EXISTS "idx_security_markers_marker_type" ON "security_markers"("marker_type");
CREATE INDEX IF NOT EXISTS "idx_security_markers_created_at" ON "security_markers"("created_at");
CREATE INDEX IF NOT EXISTS "idx_security_markers_auto_resolve" ON "security_markers"("auto_resolve", "auto_resolve_at");

CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_user_id" ON "disputed_transactions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_expense_id" ON "disputed_transactions"("expense_id");
CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_status" ON "disputed_transactions"("dispute_status");
CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_security_marker_id" ON "disputed_transactions"("security_marker_id");
CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_created_at" ON "disputed_transactions"("created_at");
CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_priority" ON "disputed_transactions"("priority");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_security_markers_user_status" ON "security_markers"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_disputed_transactions_user_status" ON "disputed_transactions"("user_id", "dispute_status", "created_at");

-- Add comments for documentation
COMMENT ON TABLE "security_markers" IS 'Anomaly detection markers for suspicious transactions requiring review';
COMMENT ON COLUMN "security_markers"."marker_type" IS 'Type of anomaly: anomaly_detected, high_risk_description, geo_anomaly, rapid_fire, unusual_amount';
COMMENT ON COLUMN "security_markers"."severity" IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN "security_markers"."status" IS 'Status: pending, cleared, disputed, blocked';
COMMENT ON COLUMN "security_markers"."detection_method" IS 'Method: statistical_analysis, ai_detection, rule_based, mixed';
COMMENT ON COLUMN "security_markers"."anomaly_details" IS 'JSON object with detection details: reason, baselineValue, currentValue, deviationPercent, patternType';
COMMENT ON COLUMN "security_markers"."ai_analysis" IS 'AI-powered risk assessment: risk_score, scam_indicators, recommendation, confidence';
COMMENT ON COLUMN "security_markers"."requires_mfa" IS 'Whether MFA verification is required to clear this marker';
COMMENT ON COLUMN "security_markers"."auto_resolve" IS 'Whether marker should auto-clear after specified time';

COMMENT ON TABLE "disputed_transactions" IS 'User-reported disputed or fraudulent transactions';
COMMENT ON COLUMN "disputed_transactions"."dispute_type" IS 'Type: unauthorized, fraudulent, incorrect_amount, duplicate, other';
COMMENT ON COLUMN "disputed_transactions"."dispute_status" IS 'Status: open, investigating, resolved, rejected, closed';
COMMENT ON COLUMN "disputed_transactions"."evidence" IS 'Array of evidence items with type, url, description, uploadedAt';
COMMENT ON COLUMN "disputed_transactions"."communication_log" IS 'Timeline of updates and communications';
COMMENT ON COLUMN "disputed_transactions"."is_blocked" IS 'Whether transaction is blocked from ledger calculations';
