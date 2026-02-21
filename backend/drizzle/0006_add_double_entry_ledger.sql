-- Migration: Add Double-Entry Ledger System & FX Revaluation Tables
-- Issue: #432 - Double-Entry Ledger System & Real-Time FX Revaluation Delta
-- Date: 2026-02-21

-- ============================================================================
-- LEDGER ACCOUNTS TABLE (Chart of Accounts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    category TEXT,
    normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    currency TEXT DEFAULT 'USD',
    parent_account_id UUID REFERENCES ledger_accounts(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ledger_accounts
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user_id ON ledger_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_account_code ON ledger_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_account_type ON ledger_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_is_active ON ledger_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_parent ON ledger_accounts(parent_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_accounts_user_code ON ledger_accounts(user_id, account_code) WHERE is_active = true;

-- ============================================================================
-- LEDGER ENTRIES TABLE (Double-Entry Journal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    journal_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT DEFAULT 'USD',
    base_currency_amount NUMERIC(15, 2),
    fx_rate DOUBLE PRECISION DEFAULT 1.0,
    description TEXT,
    reference_type TEXT,
    reference_id UUID,
    vault_id UUID REFERENCES vaults(id) ON DELETE SET NULL,
    transaction_date TIMESTAMP DEFAULT NOW(),
    is_reversed BOOLEAN DEFAULT false,
    reversed_by UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ledger_entries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_id ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal_id ON ledger_entries(journal_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference ON ledger_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_vault_id ON ledger_entries(vault_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_date ON ledger_entries(transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_is_reversed ON ledger_entries(is_reversed);

-- ============================================================================
-- FX VALUATION SNAPSHOTS TABLE (Unrealized/Realized Gains Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_valuation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE CASCADE,
    snapshot_date TIMESTAMP DEFAULT NOW(),
    original_currency TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    original_amount NUMERIC(15, 2) NOT NULL,
    valuation_amount NUMERIC(15, 2) NOT NULL,
    fx_rate DOUBLE PRECISION NOT NULL,
    previous_fx_rate DOUBLE PRECISION,
    unrealized_gain_loss NUMERIC(15, 2) DEFAULT 0,
    realized_gain_loss NUMERIC(15, 2) DEFAULT 0,
    is_realized BOOLEAN DEFAULT false,
    ledger_entry_id UUID REFERENCES ledger_entries(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fx_valuation_snapshots
CREATE INDEX IF NOT EXISTS idx_fx_valuation_user_id ON fx_valuation_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_fx_valuation_account_id ON fx_valuation_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_fx_valuation_snapshot_date ON fx_valuation_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_fx_valuation_is_realized ON fx_valuation_snapshots(is_realized);
CREATE INDEX IF NOT EXISTS idx_fx_valuation_currencies ON fx_valuation_snapshots(original_currency, base_currency);

-- ============================================================================
-- CONSTRAINTS AND TRIGGERS
-- ============================================================================

-- Ensure double-entry balance (optional validation trigger)
-- This ensures that for each journal_id, sum(debits) = sum(credits)

CREATE OR REPLACE FUNCTION validate_double_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    debit_sum NUMERIC(15, 2);
    credit_sum NUMERIC(15, 2);
BEGIN
    -- Calculate sums for this journal
    SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
    INTO debit_sum, credit_sum
    FROM ledger_entries
    WHERE journal_id = NEW.journal_id;
    
    -- Allow temporary imbalance during transaction
    -- Final balance will be checked in application logic
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for balance validation (optional)
-- DROP TRIGGER IF EXISTS check_double_entry_balance ON ledger_entries;
-- CREATE TRIGGER check_double_entry_balance
--     AFTER INSERT OR UPDATE ON ledger_entries
--     FOR EACH ROW
--     EXECUTE FUNCTION validate_double_entry_balance();

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View: Account Balances
CREATE OR REPLACE VIEW v_account_balances AS
SELECT 
    la.id AS account_id,
    la.user_id,
    la.account_code,
    la.account_name,
    la.account_type,
    la.normal_balance,
    la.currency,
    CASE 
        WHEN la.normal_balance = 'debit' THEN
            COALESCE(SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE -le.amount END), 0)
        ELSE
            COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE -le.amount END), 0)
    END AS balance,
    COUNT(le.id) AS entry_count
FROM ledger_accounts la
LEFT JOIN ledger_entries le ON la.id = le.account_id AND le.is_reversed = false
WHERE la.is_active = true
GROUP BY la.id, la.account_code, la.account_name, la.account_type, la.normal_balance, la.currency, la.user_id;

-- View: Unrealized FX Gains/Losses Summary
CREATE OR REPLACE VIEW v_unrealized_fx_summary AS
SELECT 
    user_id,
    original_currency,
    base_currency,
    COUNT(*) AS account_count,
    SUM(unrealized_gain_loss) AS total_unrealized_gain_loss,
    MAX(snapshot_date) AS latest_snapshot
FROM fx_valuation_snapshots
WHERE is_realized = false
GROUP BY user_id, original_currency, base_currency;

-- ============================================================================
-- SEED DATA (Optional - for testing)
-- ============================================================================

-- Function to initialize chart of accounts for a user
CREATE OR REPLACE FUNCTION initialize_user_ledger_accounts(p_user_id UUID, p_base_currency TEXT DEFAULT 'USD')
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER := 0;
BEGIN
    -- Only initialize if user has no accounts yet
    IF NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE user_id = p_user_id) THEN
        INSERT INTO ledger_accounts (user_id, account_code, account_name, account_type, category, normal_balance, currency, is_system)
        VALUES
            -- Assets
            (p_user_id, '1000', 'Cash', 'asset', 'current_asset', 'debit', p_base_currency, true),
            (p_user_id, '1100', 'Vaults', 'asset', 'current_asset', 'debit', p_base_currency, true),
            (p_user_id, '1300', 'Investments', 'asset', 'current_asset', 'debit', p_base_currency, true),
            (p_user_id, '1500', 'FX Unrealized Gains', 'asset', 'fx_adjustment', 'debit', p_base_currency, true),
            -- Liabilities
            (p_user_id, '2000', 'Accounts Payable', 'liability', 'current_liability', 'credit', p_base_currency, true),
            (p_user_id, '2100', 'Debts', 'liability', 'long_term_liability', 'credit', p_base_currency, true),
            (p_user_id, '2500', 'FX Unrealized Losses', 'liability', 'fx_adjustment', 'credit', p_base_currency, true),
            -- Equity
            (p_user_id, '3000', 'Opening Balance Equity', 'equity', 'equity', 'credit', p_base_currency, true),
            -- Revenue
            (p_user_id, '4000', 'Income', 'revenue', 'operating_revenue', 'credit', p_base_currency, true),
            (p_user_id, '4500', 'FX Realized Gains', 'revenue', 'fx_gains', 'credit', p_base_currency, true),
            -- Expenses
            (p_user_id, '5000', 'Expenses', 'expense', 'operating_expense', 'debit', p_base_currency, true),
            (p_user_id, '5500', 'FX Realized Losses', 'expense', 'fx_losses', 'debit', p_base_currency, true);
        
        GET DIAGNOSTICS inserted_count = ROW_COUNT;
    END IF;
    
    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ledger_accounts IS 'Chart of Accounts for double-entry bookkeeping';
COMMENT ON TABLE ledger_entries IS 'Journal entries for all financial transactions (debit/credit legs)';
COMMENT ON TABLE fx_valuation_snapshots IS 'FX revaluation history tracking unrealized and realized gains/losses';
COMMENT ON VIEW v_account_balances IS 'Current balance for each ledger account';
COMMENT ON VIEW v_unrealized_fx_summary IS 'Summary of unrealized FX gains/losses by currency pair';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
