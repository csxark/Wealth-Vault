-- Migration: Add Smart Tax Optimization & Regulatory Compliance
-- Issue: #193
-- Description: Adds comprehensive tax optimization system with AI-powered deduction detection, 
--              tax profile management, quarterly reminders, and annual reporting

-- Tax Categories Table
-- Defines tax deduction categories with IRS compliance rules
CREATE TABLE IF NOT EXISTS tax_categories (
    id SERIAL PRIMARY KEY,
    
    -- Category identity
    category_name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    
    -- Deductibility rules
    deductibility_type VARCHAR(50) NOT NULL CHECK (deductibility_type IN ('fully_deductible', 'partially_deductible', 'non_deductible')),
    deductibility_rate DECIMAL(3, 2) DEFAULT 1.00 CHECK (deductibility_rate >= 0 AND deductibility_rate <= 1),
    
    -- Regulatory compliance
    tax_jurisdiction VARCHAR(100) DEFAULT 'US_Federal',
    irs_code VARCHAR(100), -- e.g., Section 162, Section 170
    conditions_for_deductibility JSONB DEFAULT '{}'::jsonb,
    
    -- Limits and thresholds
    max_deduction_limit DECIMAL(15, 2), -- Annual maximum deduction amount
    percentage_agi_limit DECIMAL(5, 2), -- Percentage of AGI limit (e.g., 60% for charitable)
    
    -- Categorization assistance
    applicable_expense_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
    example_expenses TEXT[] DEFAULT ARRAY[]::TEXT[],
    required_documentation TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    priority_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User Tax Profiles Table
-- Stores comprehensive tax information and preferences for each user
CREATE TABLE IF NOT EXISTS user_tax_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Filing status and basic info
    filing_status VARCHAR(50) NOT NULL DEFAULT 'single' CHECK (filing_status IN ('single', 'married_jointly', 'married_separately', 'head_of_household')),
    annual_income DECIMAL(15, 2) DEFAULT 0,
    estimated_tax_bracket VARCHAR(20), -- e.g., 22%, 24%, 32%
    standard_deduction DECIMAL(15, 2) DEFAULT 14600.00, -- 2026 standard deduction for single filers
    
    -- Taxpayer classification
    dependents INTEGER DEFAULT 0 CHECK (dependents >= 0),
    self_employed BOOLEAN DEFAULT FALSE,
    business_owner BOOLEAN DEFAULT FALSE,
    quarterly_tax_payer BOOLEAN DEFAULT FALSE,
    
    -- Filing dates
    last_filing_date DATE,
    next_filing_deadline DATE,
    
    -- Tax preferences
    tax_preferences JSONB DEFAULT '{}'::jsonb,
    itemize_deductions BOOLEAN DEFAULT FALSE,
    
    -- Year-to-date tracking
    ytd_tax_paid DECIMAL(15, 2) DEFAULT 0,
    ytd_taxable_income DECIMAL(15, 2) DEFAULT 0,
    ytd_deductions DECIMAL(15, 2) DEFAULT 0,
    estimated_quarterly_payments DECIMAL(15, 2) DEFAULT 0,
    
    -- AI optimization
    ai_tax_advice JSONB DEFAULT '{}'::jsonb,
    last_ai_analysis_date TIMESTAMP,
    optimization_preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Reminders and notifications
    reminder_preferences JSONB DEFAULT '{"quarterly": true, "annual": true, "threshold_alerts": true}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Alter Expenses Table to Add Tax Tracking Fields
-- Enables expense-level tax deduction tracking and categorization
ALTER TABLE expenses 
    ADD COLUMN IF NOT EXISTS is_tax_deductible BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tax_category_id INTEGER REFERENCES tax_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tax_deductibility_confidence DECIMAL(3, 2) CHECK (tax_deductibility_confidence >= 0 AND tax_deductibility_confidence <= 1),
    ADD COLUMN IF NOT EXISTS tax_notes TEXT,
    ADD COLUMN IF NOT EXISTS tax_year INTEGER;

-- Indexes for performance optimization

-- Tax Categories indexes
CREATE INDEX IF NOT EXISTS idx_tax_categories_category_name ON tax_categories(category_name);
CREATE INDEX IF NOT EXISTS idx_tax_categories_deductibility_type ON tax_categories(deductibility_type);
CREATE INDEX IF NOT EXISTS idx_tax_categories_is_active ON tax_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_tax_categories_jurisdiction ON tax_categories(tax_jurisdiction);
CREATE INDEX IF NOT EXISTS idx_tax_categories_priority ON tax_categories(priority_order);

-- User Tax Profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_user_id ON user_tax_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_filing_status ON user_tax_profiles(filing_status);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_quarterly_payer ON user_tax_profiles(quarterly_tax_payer);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_next_deadline ON user_tax_profiles(next_filing_deadline);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_self_employed ON user_tax_profiles(self_employed);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_last_analysis ON user_tax_profiles(last_ai_analysis_date);

-- Expenses tax tracking indexes
CREATE INDEX IF NOT EXISTS idx_expenses_is_tax_deductible ON expenses(is_tax_deductible);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_category_id ON expenses(tax_category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_year ON expenses(tax_year);
CREATE INDEX IF NOT EXISTS idx_expenses_user_tax_year ON expenses(user_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_expenses_user_deductible ON expenses(user_id, is_tax_deductible);
CREATE INDEX IF NOT EXISTS idx_expenses_deductible_year ON expenses(is_tax_deductible, tax_year);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_tax_full ON expenses(user_id, tax_year, is_tax_deductible, tax_category_id);
CREATE INDEX IF NOT EXISTS idx_user_tax_quarterly_deadline ON user_tax_profiles(quarterly_tax_payer, next_filing_deadline);

-- Comments for documentation
COMMENT ON TABLE tax_categories IS 'Defines IRS-compliant tax deduction categories with rules and requirements';
COMMENT ON TABLE user_tax_profiles IS 'Stores comprehensive tax information and AI-generated optimization advice for users';

COMMENT ON COLUMN tax_categories.deductibility_rate IS 'Percentage of expense that is deductible (0.0 = 0%, 1.0 = 100%)';
COMMENT ON COLUMN tax_categories.irs_code IS 'IRS tax code section reference (e.g., Section 162 for business expenses)';
COMMENT ON COLUMN tax_categories.conditions_for_deductibility IS 'JSON object defining rules and conditions for deduction qualification';
COMMENT ON COLUMN tax_categories.max_deduction_limit IS 'Annual maximum deduction amount for this category (NULL = no limit)';
COMMENT ON COLUMN tax_categories.percentage_agi_limit IS 'Maximum deduction as percentage of Adjusted Gross Income';
COMMENT ON COLUMN tax_categories.example_expenses IS 'Array of example expenses that qualify for this category';
COMMENT ON COLUMN tax_categories.required_documentation IS 'Array of documents required to claim this deduction';

COMMENT ON COLUMN user_tax_profiles.filing_status IS 'Tax filing status: single, married_jointly, married_separately, head_of_household';
COMMENT ON COLUMN user_tax_profiles.estimated_tax_bracket IS 'Estimated marginal tax bracket based on income (e.g., 22%, 24%)';
COMMENT ON COLUMN user_tax_profiles.standard_deduction IS 'Standard deduction amount for filing status (2026 amounts)';
COMMENT ON COLUMN user_tax_profiles.quarterly_tax_payer IS 'TRUE if user makes estimated quarterly tax payments';
COMMENT ON COLUMN user_tax_profiles.ytd_tax_paid IS 'Year-to-date taxes paid including withholding and estimated payments';
COMMENT ON COLUMN user_tax_profiles.ytd_deductions IS 'Year-to-date total deductions claimed';
COMMENT ON COLUMN user_tax_profiles.ai_tax_advice IS 'JSON object with AI-generated tax optimization recommendations';
COMMENT ON COLUMN user_tax_profiles.last_ai_analysis_date IS 'Timestamp of most recent AI tax analysis';
COMMENT ON COLUMN user_tax_profiles.reminder_preferences IS 'JSON object with notification preferences for quarterly/annual reminders';

COMMENT ON COLUMN expenses.is_tax_deductible IS 'TRUE if expense qualifies as tax deductible';
COMMENT ON COLUMN expenses.tax_category_id IS 'Foreign key to tax_categories table';
COMMENT ON COLUMN expenses.tax_deductibility_confidence IS 'AI confidence score for tax deduction classification (0.0-1.0)';
COMMENT ON COLUMN expenses.tax_notes IS 'Additional notes about tax treatment or documentation requirements';
COMMENT ON COLUMN expenses.tax_year IS 'Tax year for which this expense is claimed (typically YEAR(expense_date))';

