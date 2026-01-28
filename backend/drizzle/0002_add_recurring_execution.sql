-- Migration: Add recurring transaction execution fields
-- Description: Adds fields to support automated recurring transaction execution

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "next_execution_date" timestamp;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "last_executed_date" timestamp;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurring_source_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_recurring" ON "expenses" ("is_recurring", "next_execution_date") WHERE "is_recurring" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_recurring_source" ON "expenses" ("recurring_source_id");
