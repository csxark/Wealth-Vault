CREATE TABLE "budget_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"vault_id" uuid,
	"threshold" integer NOT NULL,
	"period" text NOT NULL,
	"triggered_at" timestamp DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "budget_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text NOT NULL,
	"condition" jsonb NOT NULL,
	"threshold" numeric(12, 2) NOT NULL,
	"period" text NOT NULL,
	"notification_type" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_triggered" timestamp,
	"metadata" jsonb DEFAULT '{"triggerCount":0,"lastAmount":0,"createdBy":"user"}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text,
	"device_type" text DEFAULT 'web',
	"ip_address" text,
	"user_agent" text,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"is_active" boolean DEFAULT true,
	"last_activity" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "device_sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"rate" double precision NOT NULL,
	"source" text DEFAULT 'exchangerate-api',
	"valid_from" timestamp DEFAULT now(),
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"share_amount" numeric(12, 2) NOT NULL,
	"share_percentage" double precision,
	"is_paid" boolean DEFAULT false,
	"paid_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"family_name" text,
	"default_split_method" text DEFAULT 'equal',
	"currency" text DEFAULT 'USD',
	"monthly_budget" numeric(12, 2),
	"enable_reimbursements" boolean DEFAULT true,
	"enable_health_scoring" boolean DEFAULT true,
	"notification_settings" jsonb DEFAULT '{"expenseAdded":true,"reimbursementDue":true,"goalMilestone":true,"monthlySummary":true}'::jsonb,
	"privacy_settings" jsonb DEFAULT '{"shareExpenses":"family","shareGoals":"family","shareHealthScore":"family"}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "family_settings_vault_id_unique" UNIQUE("vault_id")
);
--> statement-breakpoint
CREATE TABLE "financial_health_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"overall_score" double precision NOT NULL,
	"rating" text NOT NULL,
	"dti_score" double precision NOT NULL,
	"savings_rate_score" double precision NOT NULL,
	"volatility_score" double precision NOT NULL,
	"emergency_fund_score" double precision NOT NULL,
	"budget_adherence_score" double precision NOT NULL,
	"goal_progress_score" double precision NOT NULL,
	"metrics" jsonb NOT NULL,
	"recommendation" text NOT NULL,
	"insights" jsonb NOT NULL,
	"cash_flow_prediction" jsonb NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_amount" numeric(12, 2) NOT NULL,
	"current_amount" numeric(12, 2) DEFAULT '0',
	"deadline" timestamp,
	"is_completed" boolean DEFAULT false,
	"completed_date" timestamp,
	"order" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{"badgeEarned":false,"notificationSent":false}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" uuid NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(15, 6) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"fees" numeric(10, 2) DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"exchange_rate" double precision DEFAULT 1,
	"date" timestamp DEFAULT now() NOT NULL,
	"broker" text,
	"order_id" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{"settlementDate":null,"commission":0,"taxes":0}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"asset_class" text DEFAULT 'equity',
	"sector" text,
	"country" text DEFAULT 'US',
	"currency" text DEFAULT 'USD',
	"quantity" numeric(15, 6) NOT NULL,
	"average_cost" numeric(12, 4) NOT NULL,
	"current_price" numeric(12, 4),
	"market_value" numeric(15, 2),
	"total_cost" numeric(15, 2),
	"unrealized_gain_loss" numeric(15, 2),
	"unrealized_gain_loss_percent" double precision,
	"dividend_yield" double precision,
	"pe_ratio" double precision,
	"market_cap" numeric(18, 2),
	"last_price_update" timestamp,
	"is_active" boolean DEFAULT true,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"metadata" jsonb DEFAULT '{"exchange":null,"cusip":null,"isin":null,"lastDividend":null,"dividendFrequency":null}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"currency" text DEFAULT 'USD',
	"total_value" numeric(15, 2) DEFAULT '0',
	"total_cost" numeric(15, 2) DEFAULT '0',
	"total_gain_loss" numeric(15, 2) DEFAULT '0',
	"total_gain_loss_percent" double precision DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"risk_tolerance" text DEFAULT 'moderate',
	"investment_strategy" text,
	"target_allocation" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{"lastUpdated":null,"performanceHistory":[],"rebalancingNeeded":false}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"date" timestamp NOT NULL,
	"open" numeric(12, 4),
	"high" numeric(12, 4),
	"low" numeric(12, 4),
	"close" numeric(12, 4) NOT NULL,
	"volume" integer,
	"adjusted_close" numeric(12, 4),
	"dividend" numeric(10, 4) DEFAULT '0',
	"split_ratio" double precision DEFAULT 1,
	"currency" text DEFAULT 'USD',
	"source" text DEFAULT 'yahoo',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"next_due_date" timestamp NOT NULL,
	"last_generated_date" timestamp,
	"is_active" boolean DEFAULT true,
	"is_paused" boolean DEFAULT false,
	"payment_method" text DEFAULT 'other',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"metadata" jsonb DEFAULT '{"totalGenerated":0,"lastAmount":0,"createdBy":"user"}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reimbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"description" text NOT NULL,
	"status" text DEFAULT 'pending',
	"expense_id" uuid,
	"completed_at" timestamp,
	"due_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vault_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"format" text NOT NULL,
	"url" text NOT NULL,
	"period" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"location" jsonb,
	"device_info" jsonb,
	"status" text DEFAULT 'info',
	"details" jsonb DEFAULT '{}'::jsonb,
	"notified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"service_name" text NOT NULL,
	"description" text,
	"cost" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"frequency" text NOT NULL,
	"renewal_date" timestamp NOT NULL,
	"auto_renewal" boolean DEFAULT true,
	"status" text DEFAULT 'active',
	"payment_method" text DEFAULT 'credit_card',
	"website" text,
	"login_credentials" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"cancellation_date" timestamp,
	"last_charged_date" timestamp,
	"next_charge_date" timestamp,
	"trial_end_date" timestamp,
	"is_trial" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{"detectedFromExpense":false,"expenseId":null,"annualCost":0,"costTrend":[],"lastReminderSent":null}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_blacklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"token_type" text NOT NULL,
	"user_id" uuid,
	"reason" text DEFAULT 'logout',
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "token_blacklist_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "vault_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"inviter_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'member',
	"status" text DEFAULT 'pending',
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "vault_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "vault_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" uuid NOT NULL,
	"currency" text DEFAULT 'USD',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "metadata" SET DEFAULT '{"createdBy":"system","lastModified":null,"version":1,"flags":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vault_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "next_execution_date" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "last_executed_date" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "recurring_source_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "vault_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_recovery_codes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_backup_codes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_rules" ADD CONSTRAINT "budget_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_rules" ADD CONSTRAINT "budget_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_settings" ADD CONSTRAINT "family_settings_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_health_scores" ADD CONSTRAINT "financial_health_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "token_blacklist" ADD CONSTRAINT "token_blacklist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_invites" ADD CONSTRAINT "vault_invites_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_invites" ADD CONSTRAINT "vault_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE cascade;