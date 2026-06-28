-- Migration: Debt Management & Payoff Planning
-- Issue: #665
-- Implements debt inventory, payoff strategies, amortization schedules, and prepayment simulations

-- Debts Table - Core debt inventory
CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Debt basics
    name TEXT NOT NULL,
    description TEXT,
    debt_type TEXT NOT NULL, -- credit_card, personal_loan, mortgage, auto_loan, student_loan, medical, other
    creditor_name TEXT,
    account_number TEXT, -- Last 4 digits or masked
    
    -- Debt terms
    principal_amount NUMERIC(15, 2) NOT NULL,
    current_balance NUMERIC(15, 2) NOT NULL,
    annual_rate NUMERIC(5, 2) NOT NULL, -- APR as decimal (e.g., 5.5 for 5.5%)
    monthly_payment NUMERIC(15, 2) NOT NULL DEFAULT 0, -- Minimum payment
    
    -- Dates
    origination_date TIMESTAMP NOT NULL,
    payoff_date TIMESTAMP, -- Projected or actual
    last_payment_date TIMESTAMP,
    next_payment_date TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'active', -- active, paid_off, deferred, closed, charged_off
    
    -- Extra fields
    term_months INTEGER, -- Original term in months
    months_remaining INTEGER, -- Calculated
    minimum_payment NUMERIC(15, 2) DEFAULT 0,
    interest_paid_to_date NUMERIC(15, 2) DEFAULT 0,
    payment_frequency TEXT DEFAULT 'monthly', -- weekly, biweekly, monthly, quarterly, annual
    
    -- Collection
    is_in_collections BOOLEAN DEFAULT FALSE,
    collection_date TIMESTAMP,
    
    -- Metadata
    notes TEXT,
    tags JSONB DEFAULT '[]',
    custom_properties JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for debts
CREATE INDEX idx_debts_tenant_id ON debts(tenant_id);
CREATE INDEX idx_debts_user_id ON debts(user_id);
CREATE INDEX idx_debts_is_active ON debts(is_active);
CREATE INDEX idx_debts_status ON debts(status);
CREATE INDEX idx_debts_debt_type ON debts(debt_type);
CREATE INDEX idx_debts_payoff_date ON debts(payoff_date);
CREATE INDEX idx_debts_created ON debts(created_at DESC);

-- Debt Payments - Payment history and tracking
CREATE TABLE IF NOT EXISTS debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment details
    payment_amount NUMERIC(15, 2) NOT NULL,
    principal_amount NUMERIC(15, 2) NOT NULL,
    interest_amount NUMERIC(15, 2) NOT NULL,
    payment_date TIMESTAMP NOT NULL,
    
    -- Extra payment tracking
    is_extra_payment BOOLEAN DEFAULT FALSE,
    extra_amount NUMERIC(15, 2) DEFAULT 0,
    
    -- Status
    payment_method TEXT, -- online, check, auto_debit, phone, in_person, other
    confirmation_number TEXT,
    is_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX idx_debt_payments_debt_id ON debt_payments(debt_id);
CREATE INDEX idx_debt_payments_user_id ON debt_payments(user_id);
CREATE INDEX idx_debt_payments_payment_date ON debt_payments(payment_date DESC);
CREATE INDEX idx_debt_payments_is_extra ON debt_payments(is_extra_payment);
CREATE INDEX idx_debt_payments_tenant ON debt_payments(tenant_id);

-- Amortization Schedules - Computed payment schedules
CREATE TABLE IF NOT EXISTS amortization_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Schedule metadata
    schedule_type TEXT NOT NULL, -- standard, accelerated, custom
    total_months INTEGER NOT NULL,
    computed_at TIMESTAMP DEFAULT NOW(),
    is_current BOOLEAN DEFAULT TRUE,
    
    -- Rollup totals
    total_interest NUMERIC(15, 2),
    total_payments NUMERIC(15, 2),
    
    -- Schedule version
    version INTEGER DEFAULT 1,
    prev_schedule_id UUID REFERENCES amortization_schedules(id),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for schedules
CREATE INDEX idx_amortization_debt_id ON amortization_schedules(debt_id);
CREATE INDEX idx_amortization_user_id ON amortization_schedules(user_id);
CREATE INDEX idx_amortization_is_current ON amortization_schedules(is_current);
CREATE INDEX idx_amortization_tenant ON amortization_schedules(tenant_id);

-- Amortization Schedule Items - Individual payment line items
CREATE TABLE IF NOT EXISTS amortization_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES amortization_schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment sequence
    payment_number INTEGER NOT NULL,
    payment_date TIMESTAMP NOT NULL,
    
    -- Payment breakdown
    payment_amount NUMERIC(15, 2) NOT NULL,
    principal_amount NUMERIC(15, 2) NOT NULL,
    interest_amount NUMERIC(15, 2) NOT NULL,
    
    -- Balance tracking
    beginning_balance NUMERIC(15, 2) NOT NULL,
    ending_balance NUMERIC(15, 2) NOT NULL,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for items
CREATE INDEX idx_amortization_items_schedule ON amortization_items(schedule_id);
CREATE INDEX idx_amortization_items_payment_number ON amortization_items(payment_number);
CREATE INDEX idx_amortization_items_payment_date ON amortization_items(payment_date);
CREATE INDEX idx_amortization_items_tenant ON amortization_items(tenant_id);

-- Payoff Strategies - User's chosen payoff approach
CREATE TABLE IF NOT EXISTS payoff_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Strategy selection
    strategy_type TEXT NOT NULL, -- avalanche, snowball, custom
    name TEXT,
    description TEXT,
    
    -- Settings
    extra_monthly_payment NUMERIC(15, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    auto_apply BOOLEAN DEFAULT FALSE, -- Auto-apply to new debts
    
    -- Avalanche specific (highest APR first)
    target_apr_threshold NUMERIC(5, 2), -- Target high-rate debts first
    
    -- Snowball specific (smallest balance first)
    target_balance_threshold NUMERIC(15, 2),
    
    -- Custom priorities
    priority_order JSONB DEFAULT '[]', -- Array of debt IDs in priority order
    
    -- Projections
    projected_payoff_months INTEGER,
    projected_freedom_date TIMESTAMP,
    projected_interest_saved NUMERIC(15, 2) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP
);

-- Indexes for strategies
CREATE INDEX idx_strategies_user_id ON payoff_strategies(user_id);
CREATE INDEX idx_strategies_is_active ON payoff_strategies(is_active);
CREATE INDEX idx_strategies_strategy_type ON payoff_strategies(strategy_type);
CREATE INDEX idx_strategies_tenant ON payoff_strategies(tenant_id);

-- Payoff Simulations - Build-up of simulation results
CREATE TABLE IF NOT EXISTS payoff_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES payoff_strategies(id) ON DELETE CASCADE,
    
    -- Simulation parameters
    simulation_name TEXT,
    strategy_type TEXT NOT NULL, -- avalanche, snowball, custom
    extra_monthly_payment NUMERIC(15, 2),
    include_new_debts BOOLEAN DEFAULT FALSE,
    simulation_months INTEGER DEFAULT 360,
    
    -- Results
    total_months_to_payoff INTEGER,
    freedom_date TIMESTAMP,
    total_interest_paid NUMERIC(15, 2),
    total_paid NUMERIC(15, 2),
    interest_saved_vs_minimum NUMERIC(15, 2),
    
    -- Comparison
    compared_to_strategy_id UUID REFERENCES payoff_strategies(id),
    time_saved_months INTEGER,
    total_saved NUMERIC(15, 2),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    simulated_at TIMESTAMP,
    is_favorite BOOLEAN DEFAULT FALSE
);

-- Indexes for simulations
CREATE INDEX idx_simulations_user_id ON payoff_simulations(user_id);
CREATE INDEX idx_simulations_strategy_id ON payoff_simulations(strategy_id);
CREATE INDEX idx_simulations_freedom_date ON payoff_simulations(freedom_date);
CREATE INDEX idx_simulations_created ON payoff_simulations(created_at DESC);
CREATE INDEX idx_simulations_tenant ON payoff_simulations(tenant_id);

-- Payoff Simulation Items - Month-by-month simulation breakdown
CREATE TABLE IF NOT EXISTS payoff_simulation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    simulation_id UUID NOT NULL REFERENCES payoff_simulations(id) ON DELETE CASCADE,
    
    -- Month details
    month_number INTEGER NOT NULL,
    simulation_month_date TIMESTAMP,
    
    -- Payment breakdown
    total_minimum_payments NUMERIC(15, 2),
    total_extra_payments NUMERIC(15, 2),
    total_interest NUMERIC(15, 2),
    total_principal NUMERIC(15, 2),
    total_payment NUMERIC(15, 2),
    
    -- Debt status snapshot
    total_remaining_balance NUMERIC(15, 2),
    debts_paid_off_this_month INTEGER DEFAULT 0,
    debts_remaining INTEGER,
    
    -- Rollup
    cumulative_interest NUMERIC(15, 2),
    cumulative_paid NUMERIC(15, 2),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for simulation items
CREATE INDEX idx_sim_items_simulation_id ON payoff_simulation_items(simulation_id);
CREATE INDEX idx_sim_items_month ON payoff_simulation_items(month_number);
CREATE INDEX idx_sim_items_tenant ON payoff_simulation_items(tenant_id);

-- Prepayment Analysis - Track prepayment opportunities
CREATE TABLE IF NOT EXISTS prepayment_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Prepayment parameters
    extra_payment_amount NUMERIC(15, 2) NOT NULL,
    payment_frequency TEXT NOT NULL, -- one_time, monthly, quarterly, annual
    duration_months INTEGER, -- For recurring prepayments
    
    -- Results
    months_saved INTEGER,
    interest_saved NUMERIC(15, 2),
    new_payoff_date TIMESTAMP,
    payoff_date_before TIMESTAMP,
    
    -- ROI/Priority
    interest_rate_per_month NUMERIC(5, 2),
    opportunity_cost NUMERIC(15, 2), -- Interest lost on money if invested elsewhere
    recommendation TEXT, -- recommended, neutral, not_recommended
    
    -- Analysis date
    analyzed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for prepayment
CREATE INDEX idx_prepayment_user_id ON prepayment_analyses(user_id);
CREATE INDEX idx_prepayment_debt_id ON prepayment_analyses(debt_id);
CREATE INDEX idx_prepayment_analyzed ON prepayment_analyses(analyzed_at DESC);
CREATE INDEX idx_prepayment_tenant ON prepayment_analyses(tenant_id);

-- Debt Milestones - Track important debt events
CREATE TABLE IF NOT EXISTS debt_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Milestone definition
    milestone_type TEXT NOT NULL, -- debt_paid_off, interest_threshold_met, principal_threshold_met, payoff_date_met, strategy_milestone
    debt_id UUID REFERENCES debts(id) ON DELETE CASCADE,
    
    -- Milestone details
    milestone_name TEXT NOT NULL,
    description TEXT,
    target_value NUMERIC(15, 2),
    actual_value NUMERIC(15, 2),
    
    -- Status
    is_achieved BOOLEAN DEFAULT FALSE,
    achievement_date TIMESTAMP,
    
    -- Timing
    expected_date TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for milestones
CREATE INDEX idx_milestones_user_id ON debt_milestones(user_id);
CREATE INDEX idx_milestones_debt_id ON debt_milestones(debt_id);
CREATE INDEX idx_milestones_is_achieved ON debt_milestones(is_achieved);
CREATE INDEX idx_milestones_expected_date ON debt_milestones(expected_date);
CREATE INDEX idx_milestones_tenant ON debt_milestones(tenant_id);

-- Debt Summary View - Real-time debt health snapshot
CREATE OR REPLACE VIEW v_debt_summary AS
SELECT 
    d.user_id,
    d.tenant_id,
    COUNT(DISTINCT d.id) as total_debts,
    COUNT(DISTINCT CASE WHEN d.is_active THEN d.id END) as active_debts,
    COUNT(DISTINCT CASE WHEN d.debt_type = 'credit_card' THEN d.id END) as credit_cards,
    COUNT(DISTINCT CASE WHEN d.debt_type = 'personal_loan' THEN d.id END) as personal_loans,
    COUNT(DISTINCT CASE WHEN d.debt_type = 'mortgage' THEN d.id END) as mortgages,
    COUNT(DISTINCT CASE WHEN d.debt_type = 'auto_loan' THEN d.id END) as auto_loans,
    COUNT(DISTINCT CASE WHEN d.debt_type = 'student_loan' THEN d.id END) as student_loans,
    COALESCE(SUM(d.current_balance), 0) as total_balance,
    COALESCE(SUM(d.monthly_payment), 0) as total_minimum_payment,
    COALESCE(AVG(d.annual_rate), 0) as average_apr,
    MAX(d.annual_rate) as highest_apr,
    MIN(d.annual_rate) as lowest_apr,
    COUNT(DISTINCT CASE WHEN d.payoff_date IS NOT NULL THEN d.id END) as debts_with_payoff_dates,
    MIN(d.payoff_date) as earliest_payoff_date,
    MAX(d.payoff_date) as latest_payoff_date
FROM debts d
WHERE d.is_active = TRUE
GROUP BY d.user_id, d.tenant_id;

-- Debt Timeline View - Payoff projection
CREATE OR REPLACE VIEW v_debt_payoff_timeline AS
SELECT 
    ai.user_id,
    ai.tenant_id,
    d.id as debt_id,
    d.name as debt_name,
    d.debt_type,
    d.annual_rate,
    ai.payment_number,
    ai.payment_date,
    ai.principal_amount,
    ai.interest_amount,
    ai.payment_amount,
    ai.ending_balance,
    ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY ai.payment_date) as payment_sequence
FROM amortization_items ai
JOIN amortization_schedules asch ON asch.id = ai.schedule_id
JOIN debts d ON d.id = asch.debt_id
WHERE asch.is_current = TRUE
ORDER BY ai.payment_date;

-- Payoff Strategy View - Compare all active strategies
CREATE OR REPLACE VIEW v_payoff_comparison AS
SELECT 
    ps.user_id,
    ps.tenant_id,
    ps.strategy_type,
    ps.name,
    ps.extra_monthly_payment,
    ps.projected_months as payoff_months,
    ps.projected_freedom_date as freedom_date,
    ps.projected_interest_saved,
    COALESCE(SUM(d.current_balance), 0) as total_balance_covered,
    COUNT(d.id) as debts_in_strategy
FROM payoff_strategies ps
LEFT JOIN debts d ON d.user_id = ps.user_id AND d.is_active = TRUE
WHERE ps.is_active = TRUE
GROUP BY ps.id, ps.user_id, ps.tensor_id;

-- Helper function: Calculate payoff date
CREATE OR REPLACE FUNCTION calculate_payoff_date(
    p_balance NUMERIC,
    p_apr NUMERIC,
    p_payment NUMERIC
) RETURNS TIMESTAMP AS $$
DECLARE
    v_months INTEGER;
    v_monthly_rate NUMERIC;
BEGIN
    IF p_balance <= 0 THEN
        RETURN NOW();
    END IF;
    
    IF p_apr = 0 THEN
        v_months := CEIL(p_balance / p_payment);
    ELSE
        v_monthly_rate := p_apr / 12 / 100;
        IF p_balance * v_monthly_rate >= p_payment THEN
            RETURN NULL; -- Never pays off
        END IF;
        v_months := CEIL(-LN(1 - (v_monthly_rate * p_balance / p_payment)) / LN(1 + v_monthly_rate));
    END IF;
    
    RETURN NOW() + (v_months || ' months')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Generate amortization schedule
CREATE OR REPLACE FUNCTION generate_amortization_schedule(
    p_debt_id UUID,
    p_schedule_type TEXT DEFAULT 'standard'
) RETURNS TABLE(
    month_number INTEGER,
    payment_date TIMESTAMP,
    principal NUMERIC,
    interest NUMERIC,
    payment NUMERIC,
    balance NUMERIC
) AS $$
DECLARE
    v_debt RECORD;
    v_balance NUMERIC;
    v_monthly_rate NUMERIC;
    v_payment NUMERIC;
    v_month INTEGER := 0;
    v_date TIMESTAMP;
BEGIN
    -- Get debt details
    SELECT *INTO v_debt FROM debts WHERE id = p_debt_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Debt not found';
    END IF;
    
    v_balance := v_debt.current_balance;
    v_monthly_rate := v_debt.annual_rate / 100 / 12;
    v_payment := v_debt.monthly_payment;
    v_date := NOW();
    
    WHILE v_balance > 0 AND v_month < 600 LOOP
        v_month := v_month + 1;
        v_date := v_date + INTERVAL '1 month';
        
        DECLARE
            v_interest NUMERIC;
            v_principal NUMERIC;
        BEGIN
            v_interest := v_balance * v_monthly_rate;
            v_principal := LEAST(v_payment - v_interest, v_balance);
            v_balance := v_balance - v_principal;
            
            IF v_balance < 0 THEN
                v_balance := 0;
            END IF;
            
            RETURN QUERY SELECT 
                v_month,
                v_date,
                ROUND(v_principal, 2),
                ROUND(v_interest, 2),
                ROUND(v_principal + v_interest, 2),
                ROUND(v_balance, 2);
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grants
GRANT SELECT, INSERT, UPDATE ON debts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON debt_payments TO authenticated;
GRANT SELECT ON amortization_schedules TO authenticated;
GRANT SELECT ON amortization_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON payoff_strategies TO authenticated;
GRANT SELECT ON payoff_simulations TO authenticated;
GRANT SELECT ON payoff_simulation_items TO authenticated;
GRANT SELECT ON prepayment_analyses TO authenticated;
GRANT SELECT ON debt_milestones TO authenticated;
GRANT SELECT ON v_debt_summary TO authenticated;
GRANT SELECT ON v_debt_payoff_timeline TO authenticated;
GRANT SELECT ON v_payoff_comparison TO authenticated;

-- Comments
COMMENT ON TABLE debts IS 'Core debt inventory with balance and interest tracking';
COMMENT ON TABLE debt_payments IS 'Payment history and tracking with principal/interest breakdown';
COMMENT ON TABLE amortization_schedules IS 'Computed amortization schedules for debts';
COMMENT ON TABLE amortization_items IS 'Individual payment line items in amortization schedule';
COMMENT ON TABLE payoff_strategies IS 'User-defined payoff strategies (avalanche, snowball, custom)';
COMMENT ON TABLE payoff_simulations IS 'Simulation results comparing different payoff strategies';
COMMENT ON TABLE payoff_simulation_items IS 'Month-by-month breakdown of simulation results';
COMMENT ON TABLE prepayment_analyses IS 'Analysis of prepayment savings and opportunities';
COMMENT ON TABLE debt_milestones IS 'Important debt events and achievement tracking';
COMMENT ON FUNCTION calculate_payoff_date IS 'Calculate projected payoff date for a debt';
COMMENT ON FUNCTION generate_amortization_schedule IS 'Generate full amortization schedule for a debt';
