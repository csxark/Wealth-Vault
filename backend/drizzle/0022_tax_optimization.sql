-- Migration: Tax Optimization & Deduction Tracking
-- Issue #641: Real-Time Tax Optimization & Deduction Tracking
-- Description: Add tables for tax profiles, deductions, estimates, optimization suggestions, quarterly payments, and tax documents

-- Tax Profiles: User tax filing status and configuration
CREATE TABLE IF NOT EXISTS tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filing_status VARCHAR(50) NOT NULL DEFAULT 'single', -- single, married_joint, married_separate, head_of_household
    state VARCHAR(2), -- State for state tax calculations
    is_self_employed BOOLEAN DEFAULT FALSE,
    has_dependents BOOLEAN DEFAULT FALSE,
    dependent_count INTEGER DEFAULT 0,
    tax_year INTEGER NOT NULL,
    standard_deduction DECIMAL(12,2),
    uses_itemized_deductions BOOLEAN DEFAULT FALSE,
    estimated_annual_income DECIMAL(12,2),
    withholding_ytd DECIMAL(12,2) DEFAULT 0,
    w2_jobs_count INTEGER DEFAULT 0,
    has_investment_income BOOLEAN DEFAULT FALSE,
    has_rental_income BOOLEAN DEFAULT FALSE,
    qbi_eligible BOOLEAN DEFAULT FALSE, -- Qualified Business Income deduction
    preferences JSONB DEFAULT '{}'::jsonb, -- Tax preferences and settings
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, tax_year)
);

-- Tax Deductions: Tracked deductible expenses
CREATE TABLE IF NOT EXISTS tax_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    deduction_category VARCHAR(100) NOT NULL, -- business_expense, home_office, vehicle, medical, charitable, education, state_tax, etc.
    deduction_type VARCHAR(50) NOT NULL, -- itemized, above_the_line, business
    amount DECIMAL(12,2) NOT NULL,
    deduction_date DATE NOT NULL,
    tax_year INTEGER NOT NULL,
    description TEXT,
    notes TEXT,
    vendor VARCHAR(255),
    receipt_url TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    is_auto_detected BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(5,2), -- 0-100 for auto-detected deductions
    proof_documents JSONB DEFAULT '[]'::jsonb, -- Array of document IDs
    irs_form VARCHAR(50), -- 1040 Schedule A, Schedule C, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tax Estimates: Real-time tax liability calculations
CREATE TABLE IF NOT EXISTS tax_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    gross_income DECIMAL(12,2) NOT NULL,
    adjusted_gross_income DECIMAL(12,2) NOT NULL,
    taxable_income DECIMAL(12,2) NOT NULL,
    total_deductions DECIMAL(12,2) DEFAULT 0,
    federal_tax DECIMAL(12,2) NOT NULL,
    state_tax DECIMAL(12,2) DEFAULT 0,
    self_employment_tax DECIMAL(12,2) DEFAULT 0,
    total_tax DECIMAL(12,2) NOT NULL,
    withholding_ytd DECIMAL(12,2) DEFAULT 0,
    estimated_payments_ytd DECIMAL(12,2) DEFAULT 0,
    amount_owed DECIMAL(12,2),
    refund_amount DECIMAL(12,2),
    effective_tax_rate DECIMAL(5,2), -- Percentage
    marginal_tax_rate DECIMAL(5,2), -- Percentage
    next_tax_bracket_threshold DECIMAL(12,2),
    scenario_name VARCHAR(100), -- For "what if" scenarios
    is_projection BOOLEAN DEFAULT FALSE,
    calculation_details JSONB DEFAULT '{}'::jsonb, -- Breakdown of calculations
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tax Optimization Suggestions: AI-generated tax strategies
CREATE TABLE IF NOT EXISTS tax_optimization_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggestion_type VARCHAR(100) NOT NULL, -- contribution_increase, deduction_timing, income_deferral, tax_loss_harvest, etc.
    category VARCHAR(50) NOT NULL, -- retirement, deduction, timing, tax_advantaged
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    potential_savings DECIMAL(12,2), -- Estimated tax savings
    priority_score INTEGER DEFAULT 50, -- 0-100
    action_required TEXT,
    deadline DATE,
    tax_year INTEGER NOT NULL,
    is_time_sensitive BOOLEAN DEFAULT FALSE,
    complexity_level VARCHAR(20) DEFAULT 'medium', -- easy, medium, hard
    requires_professional BOOLEAN DEFAULT FALSE,
    related_account_type VARCHAR(50), -- 401k, IRA, HSA, etc.
    suggested_amount DECIMAL(12,2),
    details JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, dismissed, completed
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Quarterly Tax Payments: Estimated tax payment tracking
CREATE TABLE IF NOT EXISTS quarterly_tax_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    due_date DATE NOT NULL,
    estimated_amount DECIMAL(12,2) NOT NULL,
    safe_harbor_amount DECIMAL(12,2), -- 100% or 110% of prior year
    recommended_amount DECIMAL(12,2),
    actual_amount_paid DECIMAL(12,2),
    payment_date DATE,
    payment_method VARCHAR(50),
    confirmation_number VARCHAR(100),
    is_paid BOOLEAN DEFAULT FALSE,
    reminder_sent BOOLEAN DEFAULT FALSE,
    penalty_risk VARCHAR(20) DEFAULT 'low', -- low, medium, high
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, tax_year, quarter)
);

-- Tax Deadlines: Important tax dates and reminders
CREATE TABLE IF NOT EXISTS tax_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for universal deadlines
    deadline_type VARCHAR(100) NOT NULL, -- filing, estimated_payment, ira_contribution, extension, etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    tax_year INTEGER NOT NULL,
    is_universal BOOLEAN DEFAULT TRUE, -- Applies to all users
    filing_status VARCHAR(50), -- If specific to filing status
    is_completed BOOLEAN DEFAULT FALSE,
    reminder_days_before INTEGER DEFAULT 14,
    reminder_sent BOOLEAN DEFAULT FALSE,
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    related_form VARCHAR(50), -- 1040, 1099, W-2, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tax Advantaged Accounts: 401k, IRA, HSA tracking
CREATE TABLE IF NOT EXISTS tax_advantaged_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_type VARCHAR(50) NOT NULL, -- 401k, roth_401k, traditional_ira, roth_ira, hsa, fsa, 529
    account_name VARCHAR(255),
    employer_offered BOOLEAN DEFAULT FALSE,
    contribution_limit DECIMAL(12,2) NOT NULL,
    catch_up_limit DECIMAL(12,2), -- For age 50+
    ytd_contributions DECIMAL(12,2) DEFAULT 0,
    employer_match_rate DECIMAL(5,2), -- Percentage
    employer_match_limit DECIMAL(12,2),
    ytd_employer_contributions DECIMAL(12,2) DEFAULT 0,
    remaining_contribution_space DECIMAL(12,2),
    recommended_contribution DECIMAL(12,2),
    tax_year INTEGER NOT NULL,
    account_status VARCHAR(20) DEFAULT 'active', -- active, inactive, closed
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tax Scenarios: "What if" tax planning simulations
CREATE TABLE IF NOT EXISTS tax_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_name VARCHAR(255) NOT NULL,
    description TEXT,
    tax_year INTEGER NOT NULL,
    base_estimate_id UUID REFERENCES tax_estimates(id) ON DELETE SET NULL,
    scenario_estimate_id UUID REFERENCES tax_estimates(id) ON DELETE SET NULL,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb, -- What changed from baseline
    tax_impact DECIMAL(12,2), -- Positive = savings, Negative = additional tax
    is_favorable BOOLEAN,
    assumptions TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tax Documents: Receipt and document vault for audit proof
CREATE TABLE IF NOT EXISTS tax_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deduction_id UUID REFERENCES tax_deductions(id) ON DELETE SET NULL,
    document_type VARCHAR(100) NOT NULL, -- receipt, invoice, w2, 1099, 1040, statement, etc.
    document_category VARCHAR(50) NOT NULL, -- income, deduction, payment, filing
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER, -- bytes
    mime_type VARCHAR(100),
    tax_year INTEGER NOT NULL,
    document_date DATE,
    vendor_name VARCHAR(255),
    amount DECIMAL(12,2),
    ocr_data JSONB, -- Extracted text and structured data
    is_ocr_processed BOOLEAN DEFAULT FALSE,
    tags TEXT[], -- Array of tags for searching
    notes TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tax Brackets: Federal and state tax bracket data
CREATE TABLE IF NOT EXISTS tax_brackets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction VARCHAR(50) NOT NULL, -- federal, state code (e.g., CA, NY)
    tax_year INTEGER NOT NULL,
    filing_status VARCHAR(50) NOT NULL,
    bracket_number INTEGER NOT NULL,
    income_floor DECIMAL(12,2) NOT NULL,
    income_ceiling DECIMAL(12,2), -- NULL for top bracket
    tax_rate DECIMAL(5,2) NOT NULL, -- Percentage
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(jurisdiction, tax_year, filing_status, bracket_number)
);

-- Indexes for performance
CREATE INDEX idx_tax_profiles_user_year ON tax_profiles(user_id, tax_year);
CREATE INDEX idx_tax_deductions_user_year ON tax_deductions(user_id, tax_year);
CREATE INDEX idx_tax_deductions_expense ON tax_deductions(expense_id);
CREATE INDEX idx_tax_deductions_category ON tax_deductions(deduction_category);
CREATE INDEX idx_tax_estimates_user_year ON tax_estimates(user_id, tax_year);
CREATE INDEX idx_tax_optimization_user_status ON tax_optimization_suggestions(user_id, status);
CREATE INDEX idx_quarterly_payments_user_year ON quarterly_tax_payments(user_id, tax_year);
CREATE INDEX idx_quarterly_payments_due ON quarterly_tax_payments(due_date, is_paid);
CREATE INDEX idx_tax_deadlines_user_date ON tax_deadlines(user_id, due_date);
CREATE INDEX idx_tax_deadlines_universal ON tax_deadlines(is_universal, due_date);
CREATE INDEX idx_tax_advantaged_user_year ON tax_advantaged_accounts(user_id, tax_year);
CREATE INDEX idx_tax_scenarios_user ON tax_scenarios(user_id, tax_year);
CREATE INDEX idx_tax_documents_user_year ON tax_documents(user_id, tax_year);
CREATE INDEX idx_tax_documents_deduction ON tax_documents(deduction_id);
CREATE INDEX idx_tax_brackets_lookup ON tax_brackets(jurisdiction, tax_year, filing_status);

-- Insert 2026 Federal Tax Brackets (Single Filers)
INSERT INTO tax_brackets (jurisdiction, tax_year, filing_status, bracket_number, income_floor, income_ceiling, tax_rate) VALUES
('federal', 2026, 'single', 1, 0, 11600, 10.00),
('federal', 2026, 'single', 2, 11601, 47150, 12.00),
('federal', 2026, 'single', 3, 47151, 100525, 22.00),
('federal', 2026, 'single', 4, 100526, 191950, 24.00),
('federal', 2026, 'single', 5, 191951, 243725, 32.00),
('federal', 2026, 'single', 6, 243726, 609350, 35.00),
('federal', 2026, 'single', 7, 609351, NULL, 37.00);

-- Insert 2026 Federal Tax Brackets (Married Filing Jointly)
INSERT INTO tax_brackets (jurisdiction, tax_year, filing_status, bracket_number, income_floor, income_ceiling, tax_rate) VALUES
('federal', 2026, 'married_joint', 1, 0, 23200, 10.00),
('federal', 2026, 'married_joint', 2, 23201, 94300, 12.00),
('federal', 2026, 'married_joint', 3, 94301, 201050, 22.00),
('federal', 2026, 'married_joint', 4, 201051, 383900, 24.00),
('federal', 2026, 'married_joint', 5, 383901, 487450, 32.00),
('federal', 2026, 'married_joint', 6, 487451, 731200, 35.00),
('federal', 2026, 'married_joint', 7, 731201, NULL, 37.00);

-- Insert 2026 Federal Tax Brackets (Head of Household)
INSERT INTO tax_brackets (jurisdiction, tax_year, filing_status, bracket_number, income_floor, income_ceiling, tax_rate) VALUES
('federal', 2026, 'head_of_household', 1, 0, 16550, 10.00),
('federal', 2026, 'head_of_household', 2, 16551, 63100, 12.00),
('federal', 2026, 'head_of_household', 3, 63101, 100500, 22.00),
('federal', 2026, 'head_of_household', 4, 100501, 191950, 24.00),
('federal', 2026, 'head_of_household', 5, 191951, 243700, 32.00),
('federal', 2026, 'head_of_household', 6, 243701, 609350, 35.00),
('federal', 2026, 'head_of_household', 7, 609351, NULL, 37.00);

-- Insert Universal Tax Deadlines for 2026
INSERT INTO tax_deadlines (deadline_type, title, description, due_date, tax_year, is_universal, priority) VALUES
('filing', '2025 Tax Return Filing Deadline', 'File Form 1040 for 2025 tax year', '2026-04-15', 2025, TRUE, 'critical'),
('estimated_payment', 'Q1 2026 Estimated Tax Payment', 'First quarter estimated tax payment for 2026', '2026-04-15', 2026, TRUE, 'high'),
('estimated_payment', 'Q2 2026 Estimated Tax Payment', 'Second quarter estimated tax payment for 2026', '2026-06-15', 2026, TRUE, 'high'),
('estimated_payment', 'Q3 2026 Estimated Tax Payment', 'Third quarter estimated tax payment for 2026', '2026-09-15', 2026, TRUE, 'high'),
('estimated_payment', 'Q4 2026 Estimated Tax Payment', 'Fourth quarter estimated tax payment for 2026', '2027-01-15', 2026, TRUE, 'high'),
('contribution', 'IRA Contribution Deadline for 2025', 'Last day to make Traditional/Roth IRA contributions for 2025', '2026-04-15', 2025, TRUE, 'high'),
('contribution', 'HSA Contribution Deadline for 2025', 'Last day to contribute to HSA for 2025 tax year', '2026-04-15', 2025, TRUE, 'high'),
('extension', 'Tax Extension Filing Deadline', 'File Form 4868 for automatic 6-month extension', '2026-04-15', 2025, TRUE, 'medium'),
('extended_filing', 'Extended Filing Deadline', 'Final deadline to file with extension', '2026-10-15', 2025, TRUE, 'critical');

-- Add columns to expenses table for tax tracking
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_deductible BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deduction_category VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_purpose TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS mileage_driven DECIMAL(10,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deduction_confidence DECIMAL(5,2);

-- Comments
COMMENT ON TABLE tax_profiles IS 'User tax filing status and configuration for tax calculations';
COMMENT ON TABLE tax_deductions IS 'Tracked deductible expenses with proof and categorization';
COMMENT ON TABLE tax_estimates IS 'Real-time tax liability calculations and projections';
COMMENT ON TABLE tax_optimization_suggestions IS 'AI-generated tax optimization strategies';
COMMENT ON TABLE quarterly_tax_payments IS 'Estimated quarterly tax payment tracking for self-employed';
COMMENT ON TABLE tax_deadlines IS 'Important tax dates and deadline reminders';
COMMENT ON TABLE tax_advantaged_accounts IS '401k, IRA, HSA, and other tax-advantaged account tracking';
COMMENT ON TABLE tax_scenarios IS 'What-if tax planning scenario simulations';
COMMENT ON TABLE tax_documents IS 'Tax document vault with OCR for audit proof';
COMMENT ON TABLE tax_brackets IS 'Federal and state tax bracket data by year';
