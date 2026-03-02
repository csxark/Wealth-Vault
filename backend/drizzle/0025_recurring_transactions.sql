-- Issue #663: Recurring Transactions & Bill Tracking
-- Database Schema Migration

-- Create recurring_transactions table
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    merchant_id UUID,
    transaction_name TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    category TEXT,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom')),
    custom_frequency_days INTEGER,
    custom_frequency_count INTEGER DEFAULT 1,
    next_due_date TIMESTAMP,
    last_payment_date TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    detection_method TEXT DEFAULT 'manual' CHECK (detection_method IN ('auto_detected', 'manual', 'imported')),
    confidence_score DECIMAL(5, 2) DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    notes TEXT,
    auto_detected_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_transactions_user_id ON recurring_transactions(user_id);
CREATE INDEX idx_recurring_transactions_vault_id ON recurring_transactions(vault_id);
CREATE INDEX idx_recurring_transactions_status ON recurring_transactions(status);
CREATE INDEX idx_recurring_transactions_next_due ON recurring_transactions(next_due_date);

-- Create bill_payments table
CREATE TABLE IF NOT EXISTS bill_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    bill_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'due', 'overdue', 'paid', 'skipped', 'failed')),
    amount DECIMAL(15, 2) NOT NULL,
    actual_amount DECIMAL(15, 2),
    payment_date TIMESTAMP,
    payment_method TEXT,
    notes TEXT,
    related_transaction_id UUID REFERENCES transactions(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_payments_user_id ON bill_payments(user_id);
CREATE INDEX idx_bill_payments_recurring_id ON bill_payments(recurring_transaction_id);
CREATE INDEX idx_bill_payments_status ON bill_payments(status);
CREATE INDEX idx_bill_payments_due_date ON bill_payments(due_date);

-- Create subscription_metadata table
CREATE TABLE IF NOT EXISTS subscription_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_transaction_id UUID NOT NULL UNIQUE REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    subscription_type TEXT CHECK (subscription_type IN ('software', 'streaming', 'utilities', 'insurance', 'memberships', 'fitness', 'finance', 'education', 'shopping', 'other')),
    account_id TEXT,
    account_email TEXT,
    service_provider TEXT,
    business_name TEXT,
    cancellation_url TEXT,
    contact_info TEXT,
    auto_renewal BOOLEAN DEFAULT true,
    renewal_date TIMESTAMP,
    estimated_yearly_value DECIMAL(15, 2),
    features JSONB DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_metadata_recurring_id ON subscription_metadata(recurring_transaction_id);

-- Create duplicate_subscriptions table
CREATE TABLE IF NOT EXISTS duplicate_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    primary_recurring_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    duplicate_recurring_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    confidence_score DECIMAL(5, 2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'confirmed_duplicate', 'false_alarm')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_duplicate_subscriptions_user_id ON duplicate_subscriptions(user_id);
CREATE INDEX idx_duplicate_subscriptions_primary_id ON duplicate_subscriptions(primary_recurring_id);

-- Create recurring_alerts table
CREATE TABLE IF NOT EXISTS recurring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('upcoming', 'overdue', 'duplicate', 'payment_failed', 'auto_detected')),
    alert_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_read BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX idx_recurring_alerts_user_id ON recurring_alerts(user_id);
CREATE INDEX idx_recurring_alerts_type ON recurring_alerts(alert_type);
CREATE INDEX idx_recurring_alerts_is_read ON recurring_alerts(is_read);

-- Create bill_categories table
CREATE TABLE IF NOT EXISTS bill_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_name TEXT NOT NULL,
    category_type TEXT NOT NULL,
    budget_limit DECIMAL(15, 2),
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    icon TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_categories_user_id ON bill_categories(user_id);
CREATE UNIQUE INDEX idx_bill_categories_unique ON bill_categories(user_id, category_name);

-- Create payment_reminders table
CREATE TABLE IF NOT EXISTS payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    reminder_days INTEGER NOT NULL DEFAULT 7 CHECK (reminder_days IN (1, 3, 7, 14)),
    last_reminder_date TIMESTAMP,
    next_reminder_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    reminder_channels JSONB DEFAULT '["email"]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_reminders_user_id ON payment_reminders(user_id);
CREATE INDEX idx_payment_reminders_next_reminder ON payment_reminders(next_reminder_date);

-- Create recurring_transaction_history table
CREATE TABLE IF NOT EXISTS recurring_transaction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    previous_amount DECIMAL(15, 2),
    new_amount DECIMAL(15, 2),
    previous_frequency TEXT,
    new_frequency TEXT,
    previous_status TEXT,
    new_status TEXT,
    change_type TEXT NOT NULL,
    reason TEXT,
    changed_date TIMESTAMP NOT NULL DEFAULT NOW(),
    changed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_recurring_transaction_history_recurring_id ON recurring_transaction_history(recurring_transaction_id);
CREATE INDEX idx_recurring_transaction_history_user_id ON recurring_transaction_history(user_id);

-- Create merchant_info table
CREATE TABLE IF NOT EXISTS merchant_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    logo_url TEXT,
    website_url TEXT,
    industry TEXT,
    category TEXT,
    subscription_type TEXT,
    common_frequency TEXT,
    is_known_subscription BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchant_info_name ON merchant_info(merchant_name);
CREATE INDEX idx_merchant_info_category ON merchant_info(category);

-- Pre-populate common merchants
INSERT INTO merchant_info (merchant_name, display_name, category, subscription_type, common_frequency, is_known_subscription) VALUES
('NETFLIX', 'Netflix', 'Entertainment', 'streaming', 'monthly', true),
('SPOTIFY', 'Spotify', 'Entertainment', 'streaming', 'monthly', true),
('HULU', 'Hulu', 'Entertainment', 'streaming', 'monthly', true),
('DISNEY', 'Disney+', 'Entertainment', 'streaming', 'monthly', true),
('AMAZON PRIME', 'Amazon Prime', 'Shopping', 'memberships', 'yearly', true),
('ADOBE CREATIVE', 'Adobe Creative Cloud', 'Software', 'software', 'monthly', true),
('MICROSOFT OFFICE', 'Microsoft 365', 'Software', 'software', 'monthly', true),
('SLACK', 'Slack', 'Software', 'software', 'monthly', true),
('GITHUB', 'GitHub Pro', 'Software', 'software', 'monthly', true),
('DROPBOX', 'Dropbox Plus', 'Software', 'software', 'monthly', true),
('PLANET FITNESS', 'Planet Fitness', 'Fitness', 'memberships', 'monthly', true),
('APPLE ICLOUD', 'iCloud Storage', 'Software', 'software', 'monthly', true),
('GOOGLE ONE', 'Google One', 'Software', 'software', 'monthly', true),
('AUDIBLE', 'Audible', 'Entertainment', 'streaming', 'monthly', true),
('DUOLINGO', 'Duolingo Plus', 'Education', 'software', 'monthly', true),
('CANVA', 'Canva Pro', 'Software', 'software', 'yearly', true),
('GRAMMARLY', 'Grammarly Premium', 'Software', 'software', 'monthly', true),
('LASTPASS', 'LastPass Premium', 'Software', 'software', 'yearly', true)
ON CONFLICT DO NOTHING;

-- Create bill_reports table
CREATE TABLE IF NOT EXISTS bill_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    report_month TEXT NOT NULL, -- YYYY-MM format
    total_recurring DECIMAL(15, 2),
    total_paid DECIMAL(15, 2),
    bill_count INTEGER DEFAULT 0,
    paid_count INTEGER DEFAULT 0,
    overdue_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    category_breakdown JSONB DEFAULT '{}',
    generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_reports_user_id ON bill_reports(user_id);
CREATE INDEX idx_bill_reports_month ON bill_reports(report_month);
CREATE UNIQUE INDEX idx_bill_reports_unique ON bill_reports(user_id, vault_id, report_month);

-- Trigger to update recurring_transactions updated_at
CREATE OR REPLACE FUNCTION update_recurring_transactions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recurring_transactions_updated
BEFORE UPDATE ON recurring_transactions
FOR EACH ROW
EXECUTE FUNCTION update_recurring_transactions_timestamp();

-- Trigger to update subscription_metadata updated_at
CREATE OR REPLACE FUNCTION update_subscription_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscription_metadata_updated
BEFORE UPDATE ON subscription_metadata
FOR EACH ROW
EXECUTE FUNCTION update_subscription_metadata_timestamp();
