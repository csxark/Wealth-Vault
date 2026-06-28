-- Migration: Add Bills Table for Automated Bill Payment Reminders
-- Created: 2024

-- Create bills table
CREATE TABLE IF NOT EXISTS bills (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    frequency TEXT NOT NULL, -- 'weekly', 'monthly', 'quarterly', 'yearly', 'one_time'
    due_date TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'scheduled', 'cancelled'
    auto_pay BOOLEAN DEFAULT FALSE,
    payment_method TEXT DEFAULT 'other', -- 'credit_card', 'debit_card', 'bank_transfer', 'check', 'cash', 'other'
    reminder_days INTEGER DEFAULT 3,
    smart_schedule_enabled BOOLEAN DEFAULT FALSE,
    optimal_payment_date TIMESTAMP,
    scheduled_payment_date TIMESTAMP,
    last_paid_date TIMESTAMP,
    payee TEXT,
    payee_account TEXT,
    is_recurring BOOLEAN DEFAULT TRUE,
    end_date TIMESTAMP,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    detected_from_expense BOOLEAN DEFAULT FALSE,
    detection_confidence INTEGER DEFAULT 0,
    source_expense_ids JSONB DEFAULT '[]',
    cash_flow_analysis JSONB DEFAULT '{"suggestedDate": null, "confidence": 0, "reason": null}',
    metadata JSONB DEFAULT '{"lastReminderSent": null, "reminderCount": 0, "paymentHistory": [], "lateFeeAmount": 0, "gracePeriodDays": 0}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_category_id ON bills(category_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_status ON bills(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bills_user_due_date ON bills(user_id, due_date);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bills_updated_at
    BEFORE UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION update_bills_updated_at();

-- Add comment for documentation
COMMENT ON TABLE bills IS 'Stores bill payment information with smart scheduling and reminder capabilities';
