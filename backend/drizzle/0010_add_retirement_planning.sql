-- Migration: Add Retirement Planning Calculator
-- Created: 2026-02-18
-- Description: Creates retirement_planning table for users to track retirement savings goals and calculate monthly contributions needed

-- Create retirement_planning table
CREATE TABLE IF NOT EXISTS retirement_planning (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_age INTEGER NOT NULL,
    retirement_age INTEGER NOT NULL,
    current_savings NUMERIC(15, 2) NOT NULL DEFAULT '0',
    desired_retirement_savings NUMERIC(15, 2) NOT NULL,
    expected_annual_return DOUBLE PRECISION DEFAULT 0.07,
    years_to_retirement INTEGER NOT NULL,
    monthly_contribution NUMERIC(12, 2) DEFAULT '0',
    total_amount_needed NUMERIC(15, 2) NOT NULL,
    inflation_rate DOUBLE PRECISION DEFAULT 0.03,
    currency TEXT DEFAULT 'USD',
    
    -- Calculation results
    calculated_monthly_contribution NUMERIC(12, 2) DEFAULT '0',
    projected_retirement_amount NUMERIC(15, 2) DEFAULT '0',
    retirement_goal_met BOOLEAN DEFAULT false,
    shortfall_amount NUMERIC(15, 2) DEFAULT '0',
    
    -- Analysis
    status TEXT DEFAULT 'active', -- 'active', 'on_track', 'off_track', 'ahead'
    last_calculated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{
        "assumptions": {},
        "scenarioAnalysis": [],
        "milestones": []
    }',
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_retirement_planning_user_id ON retirement_planning(user_id);
CREATE INDEX IF NOT EXISTS idx_retirement_planning_status ON retirement_planning(status);
CREATE INDEX IF NOT EXISTS idx_retirement_planning_created_at ON retirement_planning(created_at DESC);

-- Add constraint to ensure retirement age is greater than current age
ALTER TABLE retirement_planning
ADD CONSTRAINT retirement_age_greater_than_current_age
CHECK (retirement_age > current_age);

-- Add constraint to ensure desired retirement savings is positive
ALTER TABLE retirement_planning
ADD CONSTRAINT desired_retirement_savings_positive
CHECK (desired_retirement_savings > 0);
