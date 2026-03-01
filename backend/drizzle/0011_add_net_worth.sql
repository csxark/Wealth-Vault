-- Migration: Add Net Worth Tracker
-- Created: 2026-02-18
-- Description: Creates net_worth table for tracking user assets and liabilities to calculate total net worth

-- Create net_worth table
CREATE TABLE IF NOT EXISTS net_worth (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Assets
    cash NUMERIC(15, 2) DEFAULT '0',
    savings_account NUMERIC(15, 2) DEFAULT '0',
    checking_account NUMERIC(15, 2) DEFAULT '0',
    emergency_fund NUMERIC(15, 2) DEFAULT '0',
    investments NUMERIC(15, 2) DEFAULT '0',
    retirement_accounts NUMERIC(15, 2) DEFAULT '0',
    real_estate NUMERIC(15, 2) DEFAULT '0',
    vehicles NUMERIC(15, 2) DEFAULT '0',
    other_assets NUMERIC(15, 2) DEFAULT '0',
    
    -- Total Assets
    total_assets NUMERIC(15, 2) DEFAULT '0',
    
    -- Liabilities
    credit_card_debt NUMERIC(15, 2) DEFAULT '0',
    auto_loans NUMERIC(15, 2) DEFAULT '0',
    student_loans NUMERIC(15, 2) DEFAULT '0',
    mortgage NUMERIC(15, 2) DEFAULT '0',
    personal_loans NUMERIC(15, 2) DEFAULT '0',
    other_liabilities NUMERIC(15, 2) DEFAULT '0',
    
    -- Total Liabilities
    total_liabilities NUMERIC(15, 2) DEFAULT '0',
    
    -- Net Worth (Assets - Liabilities)
    net_worth NUMERIC(15, 2) DEFAULT '0',
    
    -- Currency and metadata
    currency TEXT DEFAULT 'USD',
    notes TEXT,
    metadata JSONB DEFAULT '{
        "previousNetWorth": null,
        "changes": [],
        "breakdown": {}
    }',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_net_worth_user_id ON net_worth(user_id);
CREATE INDEX IF NOT EXISTS idx_net_worth_created_at ON net_worth(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_net_worth_updated_at ON net_worth(updated_at DESC);

-- Add constraint to ensure non-negative values
ALTER TABLE net_worth
ADD CONSTRAINT positive_assets CHECK (
    cash >= 0 AND
    savings_account >= 0 AND
    checking_account >= 0 AND
    emergency_fund >= 0 AND
    investments >= 0 AND
    retirement_accounts >= 0 AND
    real_estate >= 0 AND
    vehicles >= 0 AND
    other_assets >= 0 AND
    total_assets >= 0
);

ALTER TABLE net_worth
ADD CONSTRAINT positive_liabilities CHECK (
    credit_card_debt >= 0 AND
    auto_loans >= 0 AND
    student_loans >= 0 AND
    mortgage >= 0 AND
    personal_loans >= 0 AND
    other_liabilities >= 0 AND
    total_liabilities >= 0
);
