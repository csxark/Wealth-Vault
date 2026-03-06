DO $$ BEGIN
 CREATE TYPE "public"."rbac_entity_type" AS ENUM('role', 'permission', 'member_role', 'member_permission');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rbac_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "parent_role_id" uuid,
  "is_system" boolean DEFAULT false,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rbac_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "key" text NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rbac_role_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_member_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_member_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rbac_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "entity_type" "rbac_entity_type" NOT NULL,
  "entity_id" uuid,
  "changes" jsonb DEFAULT '{}'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_roles" ADD CONSTRAINT "rbac_roles_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_roles" ADD CONSTRAINT "rbac_roles_parent_role_id_rbac_roles_id_fk"
 FOREIGN KEY ("parent_role_id") REFERENCES "public"."rbac_roles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_permissions" ADD CONSTRAINT "rbac_permissions_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_role_id_rbac_roles_id_fk"
 FOREIGN KEY ("role_id") REFERENCES "public"."rbac_roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_permission_id_rbac_permissions_id_fk"
 FOREIGN KEY ("permission_id") REFERENCES "public"."rbac_permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "tenant_member_roles" ADD CONSTRAINT "tenant_member_roles_tenant_member_id_tenant_members_id_fk"
 FOREIGN KEY ("tenant_member_id") REFERENCES "public"."tenant_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "tenant_member_roles" ADD CONSTRAINT "tenant_member_roles_role_id_rbac_roles_id_fk"
 FOREIGN KEY ("role_id") REFERENCES "public"."rbac_roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_audit_logs" ADD CONSTRAINT "rbac_audit_logs_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "rbac_audit_logs" ADD CONSTRAINT "rbac_audit_logs_actor_user_id_users_id_fk"
 FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "rbac_roles_tenant_slug_unique" ON "rbac_roles" ("tenant_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rbac_permissions_tenant_key_unique" ON "rbac_permissions" ("tenant_id", "key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rbac_role_permissions_unique" ON "rbac_role_permissions" ("role_id", "permission_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_member_roles_unique" ON "tenant_member_roles" ("tenant_member_id", "role_id");