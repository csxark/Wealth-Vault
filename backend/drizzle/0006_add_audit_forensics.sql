-- Migration: Add Enterprise-Grade Security Audit Trail & Forensics Engine
-- Issue #469: Enhanced audit logging with delta tracking and cryptographic verification

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "action" text NOT NULL,
    "resource_type" text,
    "resource_id" uuid,
    "original_state" jsonb,
    "new_state" jsonb,
    "delta" jsonb,
    "delta_hash" text,
    "status" text NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "session_id" uuid,
    "request_id" text,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "performed_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_id" ON "audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_resource" ON "audit_logs"("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_performed_at" ON "audit_logs"("performed_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_session_id" ON "audit_logs"("session_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_request_id" ON "audit_logs"("request_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_status" ON "audit_logs"("status");

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_action_date" ON "audit_logs"("user_id", "action", "performed_at");

-- Comment on table
COMMENT ON TABLE "audit_logs" IS 'Enterprise-grade security audit trail with delta tracking and cryptographic verification for forensics analysis';
COMMENT ON COLUMN "audit_logs"."delta" IS 'JSON object containing added, modified, and removed fields';
COMMENT ON COLUMN "audit_logs"."delta_hash" IS 'SHA-256 cryptographic hash of delta for tamper detection';
COMMENT ON COLUMN "audit_logs"."session_id" IS 'Session identifier for correlating related audit events';
COMMENT ON COLUMN "audit_logs"."request_id" IS 'Unique request identifier for tracking audit events across the system';
