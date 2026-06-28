CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plaid_account_id" text NOT NULL,
	"plaid_item_id" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"mask" text,
	"institution_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"balance_current" numeric(15, 2),
	"balance_available" numeric(15, 2),
	"currency" text DEFAULT 'USD',
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"plaid_transaction_id" text NOT NULL,
	"expense_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"description" text NOT NULL,
	"original_description" text,
	"date" timestamp NOT NULL,
	"category" jsonb,
	"category_id" text,
	"pending" boolean DEFAULT false,
	"pending_transaction_id" text,
	"account_owner" text,
	"location" jsonb,
	"payment_meta" jsonb,
	"transaction_type" text,
	"transaction_code" text,
	"is_imported" boolean DEFAULT false,
	"import_status" text DEFAULT 'pending',
	"import_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "bank_transactions_plaid_transaction_id_unique" UNIQUE("plaid_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "cash_flow_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model_type" text NOT NULL,
	"model_data" jsonb NOT NULL,
	"model_architecture" jsonb,
	"training_data" jsonb,
	"accuracy" double precision,
	"last_trained" timestamp DEFAULT now(),
	"next_retraining" timestamp,
	"is_active" boolean DEFAULT true,
	"currency" text DEFAULT 'USD',
	"metadata" jsonb DEFAULT '{"trainingSamples":0,"features":[],"hyperparameters":{},"performanceMetrics":{},"version":1}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"current_progress" numeric(12, 2) DEFAULT '0',
	"target_progress" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'active',
	"last_updated" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{"milestones":[],"streak":0,"bestStreak":0}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_type" text NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"target_category_id" uuid,
	"currency" text DEFAULT 'USD',
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_public" boolean DEFAULT true,
	"max_participants" integer,
	"status" text DEFAULT 'active',
	"rules" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{"tags":[],"difficulty":"medium","category":"savings"}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "education_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"difficulty" text DEFAULT 'beginner',
	"estimated_read_time" integer DEFAULT 5,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"target_audience" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{"author":null,"source":null,"lastReviewed":null,"viewCount":0}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "education_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"questions" jsonb NOT NULL,
	"passing_score" integer DEFAULT 70,
	"time_limit" integer,
	"max_attempts" integer DEFAULT 3,
	"is_active" boolean DEFAULT true,
	"difficulty" text DEFAULT 'beginner',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{"totalQuestions":0,"averageScore":0,"completionRate":0}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"vault_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"status" text DEFAULT 'pending',
	"approval_notes" text,
	"requested_at" timestamp DEFAULT now(),
	"approved_at" timestamp,
	"metadata" jsonb DEFAULT '{"budgetId":null,"amount":0,"category":null}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"forecast_type" text NOT NULL,
	"period" text NOT NULL,
	"forecast_data" jsonb NOT NULL,
	"parameters" jsonb NOT NULL,
	"accuracy" double precision,
	"confidence_level" double precision DEFAULT 0.95,
	"scenario" text DEFAULT 'baseline',
	"is_simulation" boolean DEFAULT false,
	"simulation_inputs" jsonb,
	"currency" text DEFAULT 'USD',
	"metadata" jsonb DEFAULT '{"modelType":"linear_regression","trainingDataPoints":0,"seasonalAdjustment":false,"externalFactors":[],"lastTrained":null}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1,
	"answers" jsonb NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean DEFAULT false,
	"time_taken" integer,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"metadata" jsonb DEFAULT '{"correctAnswers":0,"totalQuestions":0,"questionBreakdown":[]}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "savings_roundups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"expense_id" uuid NOT NULL,
	"original_amount" numeric(12, 2) NOT NULL,
	"rounded_amount" numeric(12, 2) NOT NULL,
	"round_up_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"status" text DEFAULT 'pending',
	"transfer_id" text,
	"transfer_date" timestamp,
	"error_message" text,
	"metadata" jsonb DEFAULT '{"roundUpToNearest":"1.00","createdBy":"system"}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shared_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"total_budget" numeric(12, 2) NOT NULL,
	"current_spent" numeric(12, 2) DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"period" text DEFAULT 'monthly',
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"approval_required" boolean DEFAULT false,
	"approval_threshold" numeric(12, 2),
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"metadata" jsonb DEFAULT '{"categories":[],"contributors":[],"approvers":[]}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_education_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started',
	"progress" double precision DEFAULT 0,
	"time_spent" integer DEFAULT 0,
	"completed_at" timestamp,
	"last_accessed_at" timestamp DEFAULT now(),
	"quiz_score" integer,
	"quiz_passed" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{"bookmarks":[],"notes":"","favorite":false}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "savings_round_up_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "savings_goal_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "round_up_to_nearest" numeric(5, 2) DEFAULT '1.00';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "peer_comparison_consent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_group" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "income_range" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_models" ADD CONSTRAINT "cash_flow_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_quizzes" ADD CONSTRAINT "education_quizzes_content_id_education_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."education_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_education_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."education_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_roundups" ADD CONSTRAINT "savings_roundups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_roundups" ADD CONSTRAINT "savings_roundups_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_roundups" ADD CONSTRAINT "savings_roundups_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_budgets" ADD CONSTRAINT "shared_budgets_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_budgets" ADD CONSTRAINT "shared_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_education_progress" ADD CONSTRAINT "user_education_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_education_progress" ADD CONSTRAINT "user_education_progress_content_id_education_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."education_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_savings_goal_id_goals_id_fk" FOREIGN KEY ("savings_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;