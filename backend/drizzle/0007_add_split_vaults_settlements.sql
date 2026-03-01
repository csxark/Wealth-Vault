-- Migration: Add settlements, balances, and debt transactions for collaborative vaults
-- Issue: #178 - Collaborative "Split-Vaults" & Automated Debt Settlement Ledger

-- Create vault_balances table
CREATE TABLE IF NOT EXISTS "vault_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD',
	"last_settlement_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create settlements table
CREATE TABLE IF NOT EXISTS "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"payee_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"description" text,
	"related_expense_id" uuid,
	"status" text DEFAULT 'pending',
	"confirmed_by_payer" boolean DEFAULT false,
	"confirmed_by_payee" boolean DEFAULT false,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create debt_transactions table
CREATE TABLE IF NOT EXISTS "debt_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"paid_by_id" uuid NOT NULL,
	"owed_by_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"split_type" text DEFAULT 'equal',
	"split_value" numeric(12, 2),
	"is_settled" boolean DEFAULT false,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints for vault_balances
DO $$ BEGIN
 ALTER TABLE "vault_balances" ADD CONSTRAINT "vault_balances_vault_id_vaults_id_fk" 
 FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "vault_balances" ADD CONSTRAINT "vault_balances_user_id_users_id_fk" 
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add foreign key constraints for settlements
DO $$ BEGIN
 ALTER TABLE "settlements" ADD CONSTRAINT "settlements_vault_id_vaults_id_fk" 
 FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payer_id_users_id_fk" 
 FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payee_id_users_id_fk" 
 FOREIGN KEY ("payee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "settlements" ADD CONSTRAINT "settlements_related_expense_id_expenses_id_fk" 
 FOREIGN KEY ("related_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add foreign key constraints for debt_transactions
DO $$ BEGIN
 ALTER TABLE "debt_transactions" ADD CONSTRAINT "debt_transactions_vault_id_vaults_id_fk" 
 FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "debt_transactions" ADD CONSTRAINT "debt_transactions_expense_id_expenses_id_fk" 
 FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "debt_transactions" ADD CONSTRAINT "debt_transactions_paid_by_id_users_id_fk" 
 FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "debt_transactions" ADD CONSTRAINT "debt_transactions_owed_by_id_users_id_fk" 
 FOREIGN KEY ("owed_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes for better query performance

-- Vault balances indexes
CREATE INDEX IF NOT EXISTS "vault_balances_vault_id_idx" ON "vault_balances" USING btree ("vault_id");
CREATE INDEX IF NOT EXISTS "vault_balances_user_id_idx" ON "vault_balances" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "vault_balances_vault_user_idx" ON "vault_balances" USING btree ("vault_id", "user_id");

-- Settlements indexes
CREATE INDEX IF NOT EXISTS "settlements_vault_id_idx" ON "settlements" USING btree ("vault_id");
CREATE INDEX IF NOT EXISTS "settlements_payer_id_idx" ON "settlements" USING btree ("payer_id");
CREATE INDEX IF NOT EXISTS "settlements_payee_id_idx" ON "settlements" USING btree ("payee_id");
CREATE INDEX IF NOT EXISTS "settlements_status_idx" ON "settlements" USING btree ("status");
CREATE INDEX IF NOT EXISTS "settlements_created_at_idx" ON "settlements" USING btree ("created_at" DESC);

-- Debt transactions indexes
CREATE INDEX IF NOT EXISTS "debt_transactions_vault_id_idx" ON "debt_transactions" USING btree ("vault_id");
CREATE INDEX IF NOT EXISTS "debt_transactions_expense_id_idx" ON "debt_transactions" USING btree ("expense_id");
CREATE INDEX IF NOT EXISTS "debt_transactions_paid_by_id_idx" ON "debt_transactions" USING btree ("paid_by_id");
CREATE INDEX IF NOT EXISTS "debt_transactions_owed_by_id_idx" ON "debt_transactions" USING btree ("owed_by_id");
CREATE INDEX IF NOT EXISTS "debt_transactions_is_settled_idx" ON "debt_transactions" USING btree ("is_settled");
CREATE INDEX IF NOT EXISTS "debt_transactions_vault_settled_idx" ON "debt_transactions" USING btree ("vault_id", "is_settled");
