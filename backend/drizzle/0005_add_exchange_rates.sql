-- Add exchange_rates table for multi-currency support
CREATE TABLE IF NOT EXISTS "exchange_rates" (
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_base_target" ON "exchange_rates" ("base_currency", "target_currency");
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_active" ON "exchange_rates" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_validity" ON "exchange_rates" ("valid_from", "valid_until");
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_updated" ON "exchange_rates" ("updated_at");
