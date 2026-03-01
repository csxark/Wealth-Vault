-- Migration: Add Bill Negotiation Assistant
-- Created: 2026-02-18
-- Description: Creates bill_negotiation table for storing negotiation tips, strategies, and savings recommendations

-- Create bill_negotiation table
CREATE TABLE IF NOT EXISTS bill_negotiation (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    
    -- Negotiation Tips & Strategies
    category TEXT NOT NULL, -- 'utilities', 'insurance', 'internet', 'phone', 'subscription', 'loan', 'services', 'other'
    tips JSONB NOT NULL DEFAULT '[]', -- Array of negotiation tips
    strategies JSONB NOT NULL DEFAULT '[]', -- Array of strategies with difficulty levels
    
    -- Savings Analysis
    current_amount NUMERIC(12, 2) NOT NULL, -- Current bill amount
    estimated_savings NUMERIC(12, 2) DEFAULT '0', -- Estimated monthly savings
    estimated_savings_percentage NUMERIC(5, 2) DEFAULT '0', -- Percentage of savings
    annual_savings_potential NUMERIC(12, 2) DEFAULT '0', -- Annual savings if successful
    
    -- Negotiation Progress
    status TEXT DEFAULT 'pending', -- 'pending', 'attempted', 'successful', 'unsuccessful', 'no_action'
    attempt_count INTEGER DEFAULT 0,
    last_attempt_date TIMESTAMP,
    
    -- Negotiation Results
    new_amount NUMERIC(12, 2), -- New bill amount after negotiation
    savings_achieved NUMERIC(12, 2), -- Actual savings achieved
    negotiation_notes TEXT, -- Notes on negotiation attempts
    
    -- Comparable Data
    market_average NUMERIC(12, 2), -- Average price in market
    savings_potential JSONB DEFAULT '{
        "low": 0,
        "medium": 0,
        "high": 0
    }', -- Potential savings at different levels
    
    -- Metadata
    provider_info JSONB DEFAULT '{}', -- Provider contact info, loyalty programs, etc.
    success_tips JSONB DEFAULT '[]', -- Tips that worked, templates for calls
    confidence_score NUMERIC(3, 2) DEFAULT '0.5', -- 0-1 confidence score of savings potential
    
    metadata JSONB DEFAULT '{
        "lastRecommendedAt": null,
        "userEngaged": false,
        "tags": []
    }',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bill_negotiation_user_id ON bill_negotiation(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_negotiation_bill_id ON bill_negotiation(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_negotiation_status ON bill_negotiation(status);
CREATE INDEX IF NOT EXISTS idx_bill_negotiation_category ON bill_negotiation(category);
CREATE INDEX IF NOT EXISTS idx_bill_negotiation_created_at ON bill_negotiation(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_negotiation_user_status ON bill_negotiation(user_id, status);

-- Create negotiation_tips table for storing pre-defined tips by category
CREATE TABLE IF NOT EXISTS negotiation_tips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category TEXT NOT NULL, -- 'utilities', 'insurance', 'internet', 'phone', 'subscription', 'loan', 'services', 'other'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    strategy TEXT NOT NULL, -- The actual tip/strategy text
    difficulty TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
    estimated_savings NUMERIC(5, 2) DEFAULT '0', -- Estimated percentage of savings
    success_rate NUMERIC(3, 2) DEFAULT '0.5', -- 0-1 success rate
    implementation_time TEXT, -- 'minutes', 'hours', 'days'
    tags JSONB DEFAULT '[]',
    
    -- Contact templates
    script_template TEXT, -- Template for negotiation call/email
    best_time_to_negotiate TEXT, -- e.g., 'end_of_month', 'renewal_period'
    required_documents JSONB DEFAULT '[]', -- Documents needed
    
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for negotiation_tips
CREATE INDEX IF NOT EXISTS idx_negotiation_tips_category ON negotiation_tips(category);
CREATE INDEX IF NOT EXISTS idx_negotiation_tips_active ON negotiation_tips(is_active);
CREATE INDEX IF NOT EXISTS idx_negotiation_tips_difficulty ON negotiation_tips(difficulty);

-- Create negotiation_attempts table to track user negotiation attempts
CREATE TABLE IF NOT EXISTS negotiation_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_negotiation_id UUID NOT NULL REFERENCES bill_negotiation(id) ON DELETE CASCADE,
    
    -- Attempt Details
    attempt_number INTEGER NOT NULL,
    attempt_date TIMESTAMP DEFAULT NOW(),
    contact_method TEXT, -- 'phone', 'email', 'chat', 'in_person'
    
    -- Results
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'successful', 'unsuccessful', 'waiting'
    outcome_description TEXT,
    
    -- Financial Impact
    amount_before NUMERIC(12, 2),
    amount_after NUMERIC(12, 2),
    savings NUMERIC(12, 2),
    
    -- Follow-up
    follow_up_date TIMESTAMP,
    follow_up_notes TEXT,
    
    -- Additional Context
    tips_used JSONB DEFAULT '[]', -- Tip IDs used in this attempt
    notes TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for negotiation_attempts
CREATE INDEX IF NOT EXISTS idx_negotiation_attempts_user_id ON negotiation_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_attempts_bill_negotiation_id ON negotiation_attempts(bill_negotiation_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_attempts_status ON negotiation_attempts(status);
CREATE INDEX IF NOT EXISTS idx_negotiation_attempts_date ON negotiation_attempts(attempt_date DESC);

-- Add unique constraint to prevent duplicate negotiation records per bill
ALTER TABLE bill_negotiation
ADD CONSTRAINT unique_user_bill_negotiation UNIQUE(user_id, bill_id);
