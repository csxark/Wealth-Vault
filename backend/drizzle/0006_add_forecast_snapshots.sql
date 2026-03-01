-- Migration: Add forecast_snapshots table for predictive cash flow forecasting
-- Issue: #179 - Predictive Cash Flow Forecasting & "Danger Zone" AI Guardrails

CREATE TABLE IF NOT EXISTS "forecast_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"forecast_date" timestamp NOT NULL,
	"horizon_days" integer NOT NULL,
	"daily_projections" jsonb NOT NULL,
	"predicted_anomalies" jsonb,
	"danger_zones" jsonb,
	"accuracy_score" numeric(5, 2),
	"ai_insights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create index on user_id and forecast_date for faster queries
CREATE INDEX IF NOT EXISTS "forecast_user_date_idx" ON "forecast_snapshots" USING btree ("user_id", "forecast_date");

-- Create index on created_at for historical lookups
CREATE INDEX IF NOT EXISTS "forecast_created_at_idx" ON "forecast_snapshots" USING btree ("created_at");
