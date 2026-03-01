-- Migration: Add Tax Categories and Tax-Related Fields
-- Created: 2024

-- Create tax_categories table for IRS category codes
CREATE TABLE IF NOT EXISTS tax_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category_type TEXT NOT NULL, -- 'deduction', 'credit', 'exemption'
    irs_reference TEXT,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{
        "examples": [],
        "documentationRequired": false,
        "limits": null
    }',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create tax_reports table for generated tax reports
CREATE TABLE IF NOT EXISTS tax_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    report_type TEXT NOT NULL, -- 'summary', 'detailed', 'schedule_c', 'schedule_a'
    format TEXT NOT NULL, -- 'pdf', 'excel', 'csv'
    url TEXT NOT NULL,
    total_deductions NUMERIC(15, 2) DEFAULT '0',
    total_credits NUMERIC(15, 2) DEFAULT '0',
    status TEXT DEFAULT 'generated', -- 'generated', 'downloaded', 'archived'
    metadata JSONB DEFAULT '{
        "expenseCount": 0,
        "categoriesIncluded": [],
        "generatedBy": "system"
    }',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add tax-related fields to expenses table
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS is_tax_deductible BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tax_category_id UUID REFERENCES tax_categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
ADD COLUMN IF NOT EXISTS tax_year INTEGER,
ADD COLUMN IF NOT EXISTS tax_notes TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_expenses_tax_deductible ON expenses(is_tax_deductible);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_category_id ON expenses(tax_category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_year ON expenses(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_categories_code ON tax_categories(code);
CREATE INDEX IF NOT EXISTS idx_tax_categories_type ON tax_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_tax_reports_user_id ON tax_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_reports_tax_year ON tax_reports(tax_year);

-- Insert default IRS tax categories
INSERT INTO tax_categories (code, name, description, category_type, irs_reference, metadata) VALUES
('DED_MEDICAL', 'Medical & Dental Expenses', 'Medical and dental expenses that exceed 7.5% of AGI', 'deduction', 'IRS Pub 502', 
 '{"examples": ["Doctor visits", "Prescriptions", "Medical equipment", "Dental work"], "documentationRequired": true, "limits": null}'),

('DED_CHARITY', 'Charitable Contributions', 'Donations to qualified charitable organizations', 'deduction', 'IRS Pub 526',
 '{"examples": ["Cash donations", "Property donations", "Mileage for charity work"], "documentationRequired": true, "limits": "60% of AGI for cash, 30% for property"}'),

('DED_STATE_TAX', 'State and Local Taxes', 'State and local income, sales, and property taxes', 'deduction', 'IRS Pub 600',
 '{"examples": ["State income tax", "Property tax", "Sales tax"], "documentationRequired": true, "limits": "$10,000 per year ($5,000 if married filing separately)"}'),

('DED_MORTGAGE', 'Home Mortgage Interest', 'Interest on mortgage for primary or secondary residence', 'deduction', 'IRS Pub 936',
 '{"examples": ["Mortgage interest", "Points paid", "Late payment charges"], "documentationRequired": true, "limits": "Interest on up to $750,000 of mortgage debt"}'),

('DED_STUDENT_LOAN', 'Student Loan Interest', 'Interest paid on qualified student loans', 'deduction', 'IRS Pub 970',
 '{"examples": ["Student loan interest payments"], "documentationRequired": true, "limits": "$2,500 per year, phases out at higher incomes"}'),

('DED_EDUCATION', 'Educational Expenses', 'Qualified education expenses and tuition', 'deduction', 'IRS Pub 970',
 '{"examples": ["Tuition and fees", "Required course materials"], "documentationRequired": true, "limits": "$4,000 deduction, phases out at higher incomes"}'),

('DED_BUSINESS', 'Business Expenses', 'Ordinary and necessary business expenses', 'deduction', 'IRS Pub 535',
 '{"examples": ["Office supplies", "Business travel", "Professional development", "Home office"], "documentationRequired": true, "limits": null}'),

('DED_INVESTMENT', 'Investment Expenses', 'Investment interest and other investment-related expenses', 'deduction', 'IRS Pub 550',
 '{"examples": ["Investment interest", "Investment management fees", "Safe deposit box rental"], "documentationRequired": true, "limits": "Investment interest limited to net investment income"}'),

('DED_CASUALTY', 'Casualty and Theft Losses', 'Losses from federally declared disasters', 'deduction', 'IRS Pub 547',
 '{"examples": ["Property damage from disasters", "Theft losses"], "documentationRequired": true, "limits": "Losses must exceed $100 per event and 10% of AGI"}'),

('DED_MOVING', 'Moving Expenses', 'Moving expenses for active duty military', 'deduction', 'IRS Pub 521',
 '{"examples": ["Moving costs", "Storage expenses", "Travel to new home"], "documentationRequired": true, "limits": "Only for active duty military moving on orders"}'),

('DED_IRA', 'IRA Contributions', 'Contributions to traditional IRAs', 'deduction', 'IRS Pub 590-A',
 '{"examples": ["Traditional IRA contributions"], "documentationRequired": true, "limits": "$6,500 ($7,500 if age 50+), phases out at higher incomes"}'),

('DED_HSA', 'Health Savings Account', 'Contributions to Health Savings Accounts', 'deduction', 'IRS Pub 969',
 '{"examples": ["HSA contributions"], "documentationRequired": true, "limits": "$3,850 individual, $7,750 family ($1,000 additional if age 55+)"}'),

('DED_SELF_EMPLOYMENT', 'Self-Employment Tax', 'Deductible portion of self-employment tax', 'deduction', 'IRS Pub 334',
 '{"examples": ["50% of self-employment tax"], "documentationRequired": false, "limits": null}'),

('DED_SELF_EMPLOYMENT_HEALTH', 'Self-Employed Health Insurance', 'Health insurance premiums for self-employed', 'deduction', 'IRS Pub 535',
 '{"examples": ["Health insurance premiums", "Dental insurance", "Long-term care insurance"], "documentationRequired": true, "limits": "Cannot exceed net self-employment income"}'),

('DED_ALIMONY', 'Alimony Paid', 'Alimony payments under pre-2019 divorce agreements', 'deduction', 'IRS Pub 504',
 '{"examples": ["Court-ordered alimony payments"], "documentationRequired": true, "limits": null}'),

('CREDIT_CHILD', 'Child Tax Credit', 'Credit for qualifying children under age 17', 'credit', 'IRS Pub 972',
 '{"examples": ["Child tax credit per qualifying child"], "documentationRequired": false, "limits": "$2,000 per child, phases out at higher incomes"}'),

('CREDIT_EARNED_INCOME', 'Earned Income Credit', 'Credit for low to moderate income workers', 'credit', 'IRS Pub 596',
 '{"examples": ["Earned income tax credit"], "documentationRequired": false, "limits": "Varies by filing status and number of children"}'),

('CREDIT_EDUCATION', 'Education Credits', 'American Opportunity and Lifetime Learning credits', 'credit', 'IRS Pub 970',
 '{"examples": ["American Opportunity Credit", "Lifetime Learning Credit"], "documentationRequired": true, "limits": "AOTC: $2,500 per student, LLC: $2,000 per return"}'),

('CREDIT_CHILD_CARE', 'Child and Dependent Care Credit', 'Credit for child and dependent care expenses', 'credit', 'IRS Pub 503',
 '{"examples": ["Daycare expenses", "After-school care", "Summer camp"], "documentationRequired": true, "limits": "Up to $3,000 for one child, $6,000 for two or more"}'),

('CREDIT_SAVER', 'Retirement Savings Contributions Credit', 'Credit for retirement contributions', 'credit', 'IRS Pub 590-A',
 '{"examples": ["IRA contributions", "401(k) contributions"], "documentationRequired": false, "limits": "Up to $1,000 ($2,000 if married filing jointly)"}'),

('CREDIT_ENERGY', 'Residential Energy Credits', 'Credits for energy-efficient home improvements', 'credit', 'IRS Pub 530',
 '{"examples": ["Solar panels", "Energy-efficient windows", "Heat pumps"], "documentationRequired": true, "limits": "30% of costs, varies by improvement type"}'),

('CREDIT_FOREIGN_TAX', 'Foreign Tax Credit', 'Credit for taxes paid to foreign countries', 'credit', 'IRS Pub 514',
 '{"examples": ["Foreign income taxes paid"], "documentationRequired": true, "limits": "Cannot exceed U.S. tax liability on foreign income"}'),

('CREDIT_ADOPTION', 'Adoption Credit', 'Credit for qualified adoption expenses', 'credit', 'IRS Pub 968',
 '{"examples": ["Adoption fees", "Court costs", "Travel expenses"], "documentationRequired": true, "limits": "$15,950 per child (2023), phases out at higher incomes"}'),

('EXEMPTION_PERSONAL', 'Personal Exemption', 'Exemption for taxpayer and dependents', 'exemption', 'IRS Pub 501',
 '{"examples": ["Personal exemption", "Dependent exemptions"], "documentationRequired": false, "limits": "Suspended through 2025 under TCJA"}');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tax_categories
DROP TRIGGER IF EXISTS update_tax_categories_updated_at ON tax_categories;
CREATE TRIGGER update_tax_categories_updated_at
    BEFORE UPDATE ON tax_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to tax_reports
DROP TRIGGER IF EXISTS update_tax_reports_updated_at ON tax_reports;
CREATE TRIGGER update_tax_reports_updated_at
    BEFORE UPDATE ON tax_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
