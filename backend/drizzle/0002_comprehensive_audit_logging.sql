CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "category" text DEFAULT 'general',
  "resource_type" text,
  "resource_id" text,
  "method" text,
  "path" text,
  "status_code" integer,
  "outcome" text DEFAULT 'success',
  "severity" text DEFAULT 'low',
  "ip_address" text,
  "user_agent" text,
  "request_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "changes" jsonb DEFAULT '{}'::jsonb,
  "previous_hash" text,
  "entry_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk"
 FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_tenant_created_idx" ON "audit_logs" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_idx" ON "audit_logs" ("action", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_created_idx" ON "audit_logs" ("actor_user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_logs_entry_hash_unique" ON "audit_logs" ("entry_hash");