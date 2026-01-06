CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#3B82F6' NOT NULL,
	"icon" text DEFAULT 'tag',
	"type" text DEFAULT 'expense',
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"parent_category_id" uuid,
	"budget" jsonb DEFAULT '{"monthly":0,"yearly":0}'::jsonb,
	"spending_limit" numeric(12, 2) DEFAULT '0',
	"priority" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{"usageCount":0,"lastUsed":null,"averageAmount":0}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR',
	"description" text NOT NULL,
	"subcategory" text,
	"date" timestamp DEFAULT now() NOT NULL,
	"payment_method" text DEFAULT 'other',
	"location" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"receipt" jsonb,
	"is_recurring" boolean DEFAULT false,
	"recurring_pattern" jsonb,
	"notes" text,
	"status" text DEFAULT 'completed',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"target_amount" numeric(12, 2) NOT NULL,
	"current_amount" numeric(12, 2) DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"type" text DEFAULT 'savings',
	"priority" text DEFAULT 'medium',
	"status" text DEFAULT 'active',
	"deadline" timestamp NOT NULL,
	"start_date" timestamp DEFAULT now(),
	"completed_date" timestamp,
	"milestones" jsonb DEFAULT '[]'::jsonb,
	"recurring_contribution" jsonb DEFAULT '{"amount":0,"frequency":"monthly"}'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"is_public" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{"lastContribution":null,"totalContributions":0,"averageContribution":0,"streakDays":0}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"profile_picture" text DEFAULT '',
	"date_of_birth" timestamp,
	"phone_number" text,
	"currency" text DEFAULT 'USD',
	"monthly_income" numeric(12, 2) DEFAULT '0',
	"monthly_budget" numeric(12, 2) DEFAULT '0',
	"emergency_fund" numeric(12, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true,
	"last_login" timestamp DEFAULT now(),
	"preferences" jsonb DEFAULT '{"notifications":{"email":true,"push":true,"sms":false},"theme":"auto","language":"en"}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;