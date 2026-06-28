-- Migration: Multi-Goal Budget Guardrail Optimizer - Issue #714
-- Purpose: Enforce minimum essential expense coverage before goal allocations
-- Created: 2026-03-02
-- Description: Prevents over-allocation to goals by protecting essential spending categories

-- ============================================================================
-- GUARDRAIL POLICIES TABLE
-- ============================================================================
-- Define minimum essential expense coverage thresholds per user/vault
CREATE TABLE IF NOT EXISTS budget_guardrail_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    
    -- Policy Configuration
    policy_name TEXT NOT NULL,
    description TEXT,
    
    -- Essential Expense Definition
    protected_category_ids JSONB DEFAULT '[]', -- Category IDs that must be protected
    minimum_monthly_living_cost NUMERIC(12, 2) NOT NULL,
    living_cost_calculation_method TEXT DEFAULT 'manual' CHECK (living_cost_calculation_method IN ('manual', 'historical_average', 'percentile_based')),
    
    -- Historical calculation parameters
    historical_lookback_months INTEGER DEFAULT 6 CHECK (historical_lookback_months >= 1 AND historical_lookback_months <= 24),
    percentile_threshold NUMERIC(3, 2) DEFAULT 0.75 CHECK (percentile_threshold >= 0.5 AND percentile_threshold <= 1.0),
    
    -- Buffer & Safety Settings
    safety_buffer_percentage NUMERIC(5, 2) DEFAULT 15.00 CHECK (safety_buffer_percentage >= 0 AND safety_buffer_percentage <= 50),
    include_emergency_fund_contribution BOOLEAN DEFAULT TRUE,
    emergency_fund_target_months INTEGER DEFAULT 3 CHECK (emergency_fund_target_months >= 1 AND emergency_fund_target_months <= 12),
    
    -- Goal Allocation Caps
    max_goal_allocation_percentage NUMERIC(5, 2) DEFAULT 50.00 CHECK (max_goal_allocation_percentage >= 10 AND max_goal_allocation_percentage <= 90),
    priority_goal_ids JSONB DEFAULT '[]', -- Goals that should be prioritized
    
    -- Enforcement Flags
    is_active BOOLEAN DEFAULT TRUE,
    enforce_strictly BOOLEAN DEFAULT TRUE, -- If true, allocations must respect guardrail
    allow_override BOOLEAN DEFAULT FALSE,
    override_require_approval BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    last_calculated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, vault_id, policy_name)
);

CREATE INDEX idx_guardrail_policies_user ON budget_guardrail_policies(user_id);
CREATE INDEX idx_guardrail_policies_active ON budget_guardrail_policies(user_id, is_active);
CREATE INDEX idx_guardrail_policies_vault ON budget_guardrail_policies(vault_id, is_active);

-- ============================================================================
-- SAFE ALLOCATION CALCULATIONS TABLE
-- ============================================================================
-- Store calculated safe-to-allocate amounts with breakdown
CREATE TABLE IF NOT EXISTS safe_allocation_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES budget_guardrail_policies(id) ON DELETE CASCADE,
    
    -- Calculation Period
    calculation_date TIMESTAMP NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type TEXT DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
    
    -- Income & Essential Expenses Breakdown
    projected_income NUMERIC(15, 2) NOT NULL,
    projected_essential_expenses NUMERIC(12, 2) NOT NULL, -- Minimum living cost
    essential_expense_breakdown JSONB DEFAULT '{}', -- Breakdown by category
    
    -- Safety Considerations
    safety_buffer_amount NUMERIC(12, 2) NOT NULL,
    emergency_fund_contribution NUMERIC(12, 2) DEFAULT 0,
    discretionary_minimum NUMERIC(12, 2), -- Minimum for non-goal spending
    
    -- Allocation Limits
    safe_to_allocate_amount NUMERIC(12, 2) NOT NULL,
    safe_to_allocate_percentage NUMERIC(5, 2) NOT NULL,
    
    -- Goal Caps Per Goal
    goal_allocation_limits JSONB NOT NULL, -- { goalId: maxAmount, ... }
    
    -- Confidence & Coverage
    confidence_level TEXT CHECK (confidence_level IN ('very_low', 'low', 'moderate', 'high', 'very_high')),
    confidence_score NUMERIC(5, 2),
    coverage_status TEXT NOT NULL CHECK (coverage_status IN ('protected', 'marginal', 'risky', 'insufficient')),
    
    -- Recommendations
    recommendations JSONB DEFAULT '[]', -- Array of adjustment suggestions
    
    -- Metadata
    data_quality JSONB DEFAULT '{}',
    calculation_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_period CHECK (period_end > period_start),
    CONSTRAINT valid_allocation CHECK (safe_to_allocate_amount >= 0),
    CONSTRAINT positive_income CHECK (projected_income > 0),
    UNIQUE(user_id, vault_id, period_start, policy_id)
);

CREATE INDEX idx_safe_allocation_user_period ON safe_allocation_calculations(user_id, period_start DESC);
CREATE INDEX idx_safe_allocation_policy ON safe_allocation_calculations(policy_id, calculation_date DESC);
CREATE INDEX idx_safe_allocation_coverage ON safe_allocation_calculations(user_id, coverage_status);

-- ============================================================================
-- GUARDRAIL ALLOCATIONS TABLE
-- ============================================================================
-- Track allocations made with guardrail enforcement
CREATE TABLE IF NOT EXISTS guardrail_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES budget_guardrail_policies(id) ON DELETE CASCADE,
    calculation_id UUID NOT NULL REFERENCES safe_allocation_calculations(id) ON DELETE CASCADE,
    
    -- Goal Allocation
    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    
    -- Requested vs. Approved
    requested_amount NUMERIC(12, 2) NOT NULL,
    approved_amount NUMERIC(12, 2) NOT NULL,
    guardrail_reduced_amount NUMERIC(12, 2), -- Amount reduced due to guardrail
    reduction_reason TEXT,
    
    -- Allocation Details
    allocation_date TIMESTAMP NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    
    -- Status & Approval
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'partially_approved', 'overridden', 'implemented')),
    approval_status TEXT CHECK (approval_status IN ('automatic', 'manual_approved', 'manual_rejected', 'override_approved')),
    
    -- Override Information
    overridden BOOLEAN DEFAULT FALSE,
    override_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    override_approved_at TIMESTAMP,
    override_reason TEXT,
    
    -- Implementation
    allocated_at TIMESTAMP,
    actual_allocated_amount NUMERIC(12, 2),
    
    -- Metadata
    compliance_notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_allocation_period CHECK (period_end > period_start),
    CONSTRAINT approved_lte_requested CHECK (approved_amount <= requested_amount),
    UNIQUE(user_id, goal_id, allocation_date, policy_id)
);

CREATE INDEX idx_guardrail_allocations_goal ON guardrail_allocations(goal_id, allocation_date DESC);
CREATE INDEX idx_guardrail_allocations_user_date ON guardrail_allocations(user_id, allocation_date DESC);
CREATE INDEX idx_guardrail_allocations_status ON guardrail_allocations(status, approval_status);
CREATE INDEX idx_guardrail_allocations_pending ON guardrail_allocations(user_id, status) WHERE status IN ('pending', 'partially_approved');

-- ============================================================================
-- GUARDRAIL VIOLATIONS TABLE
-- ============================================================================
-- Track instances where allocations would violate guardrails
CREATE TABLE IF NOT EXISTS guardrail_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES budget_guardrail_policies(id) ON DELETE CASCADE,
    allocation_id UUID REFERENCES guardrail_allocations(id) ON DELETE SET NULL,
    
    -- Violation Details
    violation_type TEXT NOT NULL CHECK (violation_type IN (
        'insufficient_income',
        'insufficient_buffer',
        'essential_expense_shortfall',
        'emergency_fund_underfunded',
        'max_goal_allocation_exceeded',
        'cumulative_goal_overload'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('warning', 'caution', 'critical')),
    
    -- Calculation Details
    threshold_value NUMERIC(12, 2) NOT NULL,
    actual_value NUMERIC(12, 2) NOT NULL,
    shortfall_amount NUMERIC(12, 2),
    shortfall_percentage NUMERIC(5, 2),
    
    -- Detection
    detected_at TIMESTAMP NOT NULL,
    violation_date TIMESTAMP NOT NULL,
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolution_action TEXT,
    
    -- Context
    affected_categories JSONB DEFAULT '[]',
    affected_goals JSONB DEFAULT '[]',
    recommended_action TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_violations_user_unresolved ON guardrail_violations(user_id, resolved) WHERE NOT resolved;
CREATE INDEX idx_violations_severity ON guardrail_violations(severity, detected_at DESC);
CREATE INDEX idx_violations_policy ON guardrail_violations(policy_id, violation_type);

-- ============================================================================
-- GUARDRAIL COMPLIANCE SNAPSHOTS TABLE
-- ============================================================================
-- Track compliance over time
CREATE TABLE IF NOT EXISTS guardrail_compliance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES budget_guardrail_policies(id) ON DELETE CASCADE,
    
    -- Period
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type TEXT DEFAULT 'monthly',
    
    -- Compliance Status
    was_compliant BOOLEAN NOT NULL,
    compliance_percentage NUMERIC(5, 2),
    violations_count INTEGER DEFAULT 0,
    critical_violations_count INTEGER DEFAULT 0,
    
    -- Financial Summary
    actual_income NUMERIC(15, 2),
    actual_essential_expenses NUMERIC(12, 2),
    actual_goal_allocations NUMERIC(12, 2),
    actual_discretionary NUMERIC(12, 2),
    
    -- vs. Expected
    variance_from_expected JSONB DEFAULT '{}',
    
    -- Health Score
    guardrail_health_score NUMERIC(5, 2), -- 0-100
    trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),
    
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_compliance_snapshots_user_period ON guardrail_compliance_snapshots(user_id, period_start DESC);
CREATE INDEX idx_compliance_snapshots_compliance ON guardrail_compliance_snapshots(user_id, was_compliant, period_start DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active guardrail policies per user
CREATE OR REPLACE VIEW v_active_guardrail_policies AS
SELECT
    p.*,
    COALESCE(ARRAY_LENGTH(protected_category_ids::text[], 1), 0) as protected_category_count,
    COALESCE(ARRAY_LENGTH(priority_goal_ids::text[], 1), 0) as priority_goal_count
FROM budget_guardrail_policies p
WHERE is_active = TRUE;

-- View: Latest safe allocations per vault
CREATE OR REPLACE VIEW v_latest_safe_allocations AS
SELECT DISTINCT ON (user_id, vault_id, policy_id)
    s.*
FROM safe_allocation_calculations s
WHERE s.calculation_date <= NOW()
ORDER BY user_id, vault_id, policy_id, calculation_date DESC;

-- View: Unresolved violations per user
CREATE OR REPLACE VIEW v_unresolved_violations AS
SELECT
    user_id,
    vault_id,
    COUNT(*) as total_violations,
    SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
    AVG(shortfall_amount) as avg_shortfall,
    MAX(detected_at) as most_recent
FROM guardrail_violations
WHERE resolved = FALSE
GROUP BY user_id, vault_id;

-- View: Guardrail health summary
CREATE OR REPLACE VIEW v_guardrail_health_summary AS
SELECT
    user_id,
    vault_id,
    policy_id,
    COUNT(*) as allocation_count,
    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
    SUM(CASE WHEN overridden = TRUE THEN 1 ELSE 0 END) as override_count,
    AVG(CASE WHEN guardrail_reduced_amount > 0 THEN (guardrail_reduced_amount / requested_amount) * 100 ELSE 0 END) as avg_reduction_pct
FROM guardrail_allocations
WHERE allocation_date >= NOW() - INTERVAL '90 days'
GROUP BY user_id, vault_id, policy_id;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_guardrail_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_policy_timestamp
    BEFORE UPDATE ON budget_guardrail_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_guardrail_timestamp();

CREATE TRIGGER trg_update_allocation_timestamp
    BEFORE UPDATE ON guardrail_allocations
    FOR EACH ROW
    EXECUTE FUNCTION update_guardrail_timestamp();

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

-- Function to create default guardrail policy for a user
CREATE OR REPLACE FUNCTION create_default_guardrail_policy(
    p_user_id UUID,
    p_vault_id UUID DEFAULT NULL,
    p_minimum_living_cost NUMERIC DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
    v_policy_id UUID;
BEGIN
    INSERT INTO budget_guardrail_policies (
        user_id,
        vault_id,
        policy_name,
        minimum_monthly_living_cost,
        safety_buffer_percentage,
        max_goal_allocation_percentage,
        is_active
    ) VALUES (
        p_user_id,
        p_vault_id,
        CASE WHEN p_vault_id IS NULL THEN 'Default Policy' ELSE 'Vault Policy' END,
        COALESCE(p_minimum_living_cost, 2000.00), -- Default $2000/month
        15.00,
        50.00,
        TRUE
    )
    ON CONFLICT (user_id, vault_id, policy_name) DO NOTHING
    RETURNING id INTO v_policy_id;
    
    RETURN v_policy_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE budget_guardrail_policies IS 'Policies that enforce minimum essential expense coverage before goal allocations';
COMMENT ON TABLE safe_allocation_calculations IS 'Calculated safe-to-allocate amounts based on guardrail policies';
COMMENT ON TABLE guardrail_allocations IS 'Track goal allocations made under guardrail enforcement';
COMMENT ON TABLE guardrail_violations IS 'Instances where allocations would violate guardrails';
COMMENT ON TABLE guardrail_compliance_snapshots IS 'Historical compliance snapshots for trend analysis';

COMMENT ON COLUMN budget_guardrail_policies.minimum_monthly_living_cost IS 'Minimum amount needed to cover essential expenses before goal allocations';
COMMENT ON COLUMN budget_guardrail_policies.safety_buffer_percentage IS 'Extra buffer above minimum living cost for unexpected expenses';
COMMENT ON COLUMN safe_allocation_calculations.safe_to_allocate_amount IS 'Amount safe to allocate to goals after covering essentials and buffers';
COMMENT ON COLUMN guardrail_allocations.guardrail_reduced_amount IS 'Amount reduced from requested due to guardrail';
