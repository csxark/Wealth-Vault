-- Migration: Add Bayesian Private Debt Predictor Tables
-- Issue #496: AI-Driven Bayesian Private Debt Default Predictor & Yield-at-Risk (YaR) Engine
-- Description: Adds debtBayesianParams, loanCollateralMetadata, and defaultSimulations tables
--              for Bayesian inference, collateral monitoring, and Monte Carlo YaR simulations

-- =============================================================================
-- Table 1: debtBayesianParams
-- Stores Bayesian inference parameters for private debt default prediction
-- Uses Beta-Binomial conjugate prior updated with payment evidence
-- =============================================================================

CREATE TABLE IF NOT EXISTS debt_bayesian_params (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    
    -- Bayesian Beta Distribution Parameters (Conjugate Prior)
    prior_alpha DECIMAL(12, 4) DEFAULT 1.0000 NOT NULL,
    prior_beta DECIMAL(12, 4) DEFAULT 99.0000 NOT NULL,
    posterior_alpha DECIMAL(12, 4) DEFAULT 1.0000 NOT NULL,
    posterior_beta DECIMAL(12, 4) DEFAULT 99.0000 NOT NULL,
    
    -- Current Probability Estimates
    subjective_probability_of_default DECIMAL(8, 6) DEFAULT 0.010000 NOT NULL,
    credible_interval_95_low DECIMAL(8, 6),
    credible_interval_95_high DECIMAL(8, 6),
    
    -- Historical Evidence (Payment Events)
    on_time_payments INTEGER DEFAULT 0 NOT NULL,
    late_payments INTEGER DEFAULT 0 NOT NULL,
    missed_payments INTEGER DEFAULT 0 NOT NULL,
    
    -- Payment Velocity Metrics
    avg_payment_velocity DECIMAL(6, 4) DEFAULT 1.0000,
    payment_velocity_std_dev DECIMAL(6, 4),
    
    -- Borrower Credit Metrics
    borrower_credit_spread DECIMAL(8, 2) DEFAULT 200.00,
    borrower_leverage_ratio DECIMAL(6, 2) DEFAULT 3.00,
    borrower_interest_coverage_ratio DECIMAL(8, 2) DEFAULT 5.00,
    
    -- Macro Sensitivity Parameters
    base_rate_sensitivity DECIMAL(6, 4) DEFAULT 0.1000,
    gdp_growth_sensitivity DECIMAL(6, 4) DEFAULT -0.0500,
    
    -- Risk Classification
    risk_tier VARCHAR(20) DEFAULT 'high_yield' CHECK (risk_tier IN ('investment_grade', 'high_yield', 'distressed', 'default')),
    confidence_score DECIMAL(4, 3) DEFAULT 0.500,
    
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    UNIQUE(user_id, debt_id)
);

-- Indexes for performance
CREATE INDEX idx_debt_bayesian_params_user_id ON debt_bayesian_params(user_id);
CREATE INDEX idx_debt_bayesian_params_debt_id ON debt_bayesian_params(debt_id);
CREATE INDEX idx_debt_bayesian_params_risk_tier ON debt_bayesian_params(risk_tier);
CREATE INDEX idx_debt_bayesian_params_last_updated ON debt_bayesian_params(last_updated);

-- Comments
COMMENT ON TABLE debt_bayesian_params IS 'Bayesian inference parameters for private debt default prediction using Beta-Binomial conjugate priors';
COMMENT ON COLUMN debt_bayesian_params.prior_alpha IS 'Beta distribution alpha parameter for prior (successes + 1)';
COMMENT ON COLUMN debt_bayesian_params.prior_beta IS 'Beta distribution beta parameter for prior (failures + 1)';
COMMENT ON COLUMN debt_bayesian_params.posterior_alpha IS 'Updated alpha after observing payment events';
COMMENT ON COLUMN debt_bayesian_params.posterior_beta IS 'Updated beta after observing payment events';
COMMENT ON COLUMN debt_bayesian_params.subjective_probability_of_default IS 'Current default probability estimate (mean of Beta distribution)';
COMMENT ON COLUMN debt_bayesian_params.credible_interval_95_low IS '95% Bayesian credible interval lower bound';
COMMENT ON COLUMN debt_bayesian_params.credible_interval_95_high IS '95% Bayesian credible interval upper bound';
COMMENT ON COLUMN debt_bayesian_params.on_time_payments IS 'Count of on-time payments (velocity <= 1.05)';
COMMENT ON COLUMN debt_bayesian_params.late_payments IS 'Count of late payments (1.05 < velocity <= 1.30)';
COMMENT ON COLUMN debt_bayesian_params.missed_payments IS 'Count of missed payments (weighted 2x in Bayesian update)';
COMMENT ON COLUMN debt_bayesian_params.avg_payment_velocity IS 'Average payment velocity (actualDays / expectedDays, 1.0 = on time)';
COMMENT ON COLUMN debt_bayesian_params.borrower_credit_spread IS 'Credit spread over risk-free rate in basis points';
COMMENT ON COLUMN debt_bayesian_params.borrower_leverage_ratio IS 'Debt-to-EBITDA leverage ratio';
COMMENT ON COLUMN debt_bayesian_params.borrower_interest_coverage_ratio IS 'EBITDA / Interest Expense coverage ratio';
COMMENT ON COLUMN debt_bayesian_params.base_rate_sensitivity IS 'Sensitivity to Fed funds rate changes (0.10 = +10% default per 1% rate increase)';
COMMENT ON COLUMN debt_bayesian_params.gdp_growth_sensitivity IS 'Sensitivity to GDP growth (-0.05 = -5% default per 1% GDP growth)';
COMMENT ON COLUMN debt_bayesian_params.risk_tier IS 'Risk classification: investment_grade (<1% PD), high_yield (<5%), distressed (<20%), default (>=20%)';
COMMENT ON COLUMN debt_bayesian_params.confidence_score IS 'Confidence in probability estimate (0-1, increases with more payment observations)';

-- =============================================================================
-- Table 2: loanCollateralMetadata
-- Stores collateral metadata for private debt positions with LTV monitoring
-- Supports automated margin call triggers based on maintenance thresholds
-- =============================================================================

CREATE TABLE IF NOT EXISTS loan_collateral_metadata (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    
    -- Collateral Identification
    collateral_type VARCHAR(50) NOT NULL CHECK (collateral_type IN ('real_estate', 'securities', 'cash', 'equipment', 'inventory', 'ip', 'receivables')),
    collateral_description TEXT,
    
    -- Valuation
    initial_value DECIMAL(18, 2) NOT NULL,
    current_value DECIMAL(18, 2) NOT NULL,
    last_valuation_date DATE NOT NULL,
    valuation_source VARCHAR(50) DEFAULT 'appraisal' CHECK (valuation_source IN ('appraisal', 'market', 'self_reported', 'model')),
    
    -- LTV (Loan-to-Value) Metrics
    loan_amount DECIMAL(18, 2) NOT NULL,
    current_ltv DECIMAL(6, 4) NOT NULL,
    initial_ltv DECIMAL(6, 4) NOT NULL,
    maintenance_ltv DECIMAL(6, 4) DEFAULT 0.8000 NOT NULL,
    liquidation_ltv DECIMAL(6, 4) DEFAULT 0.9000 NOT NULL,
    
    -- Margin Call Tracking
    margin_call_required BOOLEAN DEFAULT FALSE,
    margin_call_date DATE,
    margin_call_amount DECIMAL(18, 2),
    margin_call_status VARCHAR(20) DEFAULT 'none' CHECK (margin_call_status IN ('none', 'pending', 'satisfied', 'defaulted')),
    margin_call_due_date DATE,
    
    -- Collateral Quality Indicators
    liquidity_score DECIMAL(4, 3),
    volatility_score DECIMAL(4, 3),
    junior_lien_exists BOOLEAN DEFAULT FALSE,
    junior_lien_amount DECIMAL(18, 2),
    
    -- Insurance
    is_insured BOOLEAN DEFAULT FALSE,
    insurance_value DECIMAL(18, 2),
    insurance_expiry_date DATE,
    
    -- Monitoring Parameters
    revaluation_frequency_days INTEGER DEFAULT 90,
    next_revaluation_date DATE,
    alert_threshold DECIMAL(6, 4) DEFAULT 0.7500,
    
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    UNIQUE(user_id, debt_id)
);

-- Indexes for performance
CREATE INDEX idx_loan_collateral_user_id ON loan_collateral_metadata(user_id);
CREATE INDEX idx_loan_collateral_debt_id ON loan_collateral_metadata(debt_id);
CREATE INDEX idx_loan_collateral_current_ltv ON loan_collateral_metadata(current_ltv);
CREATE INDEX idx_loan_collateral_margin_call ON loan_collateral_metadata(margin_call_required);
CREATE INDEX idx_loan_collateral_type ON loan_collateral_metadata(collateral_type);

-- Comments
COMMENT ON TABLE loan_collateral_metadata IS 'Collateral metadata for private debt with LTV monitoring and automated margin call triggers';
COMMENT ON COLUMN loan_collateral_metadata.collateral_type IS 'Type of collateral: real_estate, securities, cash, equipment, inventory, ip, receivables';
COMMENT ON COLUMN loan_collateral_metadata.current_value IS 'Current market value of collateral';
COMMENT ON COLUMN loan_collateral_metadata.current_ltv IS 'Current Loan-to-Value ratio (loanAmount / currentValue)';
COMMENT ON COLUMN loan_collateral_metadata.maintenance_ltv IS 'LTV threshold triggering margin call (default 0.80)';
COMMENT ON COLUMN loan_collateral_metadata.liquidation_ltv IS 'LTV threshold triggering forced liquidation (default 0.90)';
COMMENT ON COLUMN loan_collateral_metadata.margin_call_required IS 'Whether margin call is currently active';
COMMENT ON COLUMN loan_collateral_metadata.margin_call_amount IS 'Additional collateral or principal reduction required';
COMMENT ON COLUMN loan_collateral_metadata.margin_call_status IS 'Status: none, pending (active), satisfied (met), defaulted (missed)';
COMMENT ON COLUMN loan_collateral_metadata.liquidity_score IS 'How quickly collateral can be sold (0-1, higher = more liquid)';
COMMENT ON COLUMN loan_collateral_metadata.volatility_score IS 'Price stability of collateral (0-1, higher = more volatile)';
COMMENT ON COLUMN loan_collateral_metadata.junior_lien_exists IS 'Whether junior liens exist (reduces recovery in default)';
COMMENT ON COLUMN loan_collateral_metadata.alert_threshold IS 'LTV threshold for warning alerts (default 0.75)';
COMMENT ON COLUMN loan_collateral_metadata.metadata IS 'JSONB for valuation history, margin call history, liquidation details';

-- =============================================================================
-- Table 3: defaultSimulations
-- Stores Monte Carlo simulation results for Yield-at-Risk (YaR) calculation
-- Portfolio-wide stress testing across macro scenarios
-- =============================================================================

CREATE TABLE IF NOT EXISTS default_simulations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Simulation Configuration
    simulation_name VARCHAR(255),
    simulation_type VARCHAR(50) NOT NULL CHECK (simulation_type IN ('portfolio_yar', 'single_loan', 'stress_test')),
    debt_ids JSONB NOT NULL,
    horizon_months INTEGER DEFAULT 12 NOT NULL,
    iteration_count INTEGER DEFAULT 10000 NOT NULL,
    
    -- Yield-at-Risk Results
    expected_yield DECIMAL(10, 4),
    yield_at_risk_99 DECIMAL(10, 4),
    yield_at_risk_95 DECIMAL(10, 4),
    yield_at_risk_90 DECIMAL(10, 4),
    
    -- Portfolio Risk Statistics
    portfolio_default_prob DECIMAL(8, 6),
    expected_loss DECIMAL(18, 2),
    unexpected_loss DECIMAL(18, 2),
    
    -- Value-at-Risk Metrics
    var_99 DECIMAL(18, 2),
    var_95 DECIMAL(18, 2),
    cvar_99 DECIMAL(18, 2),
    
    -- Distribution Metrics
    loss_distribution_mean DECIMAL(18, 2),
    loss_distribution_std_dev DECIMAL(18, 2),
    loss_distribution_skewness DECIMAL(8, 4),
    loss_distribution_kurtosis DECIMAL(8, 4),
    
    -- Macro Scenario
    macro_scenario VARCHAR(50) DEFAULT 'base_case' CHECK (macro_scenario IN ('base_case', 'recession', 'boom', 'stress')),
    base_rate_assumption DECIMAL(6, 4),
    gdp_growth_assumption DECIMAL(6, 4),
    credit_spread_assumption DECIMAL(8, 2),
    
    -- Detailed Simulation Results (JSONB)
    path_distribution JSONB,
    worst_case_scenarios JSONB,
    
    -- Execution Metadata
    execution_time_ms INTEGER,
    convergence_achieved BOOLEAN DEFAULT TRUE,
    random_seed INTEGER,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_default_simulations_user_id ON default_simulations(user_id);
CREATE INDEX idx_default_simulations_type ON default_simulations(simulation_type);
CREATE INDEX idx_default_simulations_status ON default_simulations(status);
CREATE INDEX idx_default_simulations_created_at ON default_simulations(created_at);

-- Comments
COMMENT ON TABLE default_simulations IS 'Monte Carlo simulation results for portfolio Yield-at-Risk (YaR) and stress testing';
COMMENT ON COLUMN default_simulations.simulation_type IS 'Type: portfolio_yar (multi-debt YaR), single_loan (single debt), stress_test (4 scenarios)';
COMMENT ON COLUMN default_simulations.debt_ids IS 'JSONB array of debt IDs included in simulation';
COMMENT ON COLUMN default_simulations.horizon_months IS 'Simulation time horizon in months (default 12)';
COMMENT ON COLUMN default_simulations.iteration_count IS 'Number of Monte Carlo iterations (default 10,000)';
COMMENT ON COLUMN default_simulations.expected_yield IS 'Expected portfolio yield percentage';
COMMENT ON COLUMN default_simulations.yield_at_risk_99 IS 'Yield at 99% confidence level (worst 1% of outcomes)';
COMMENT ON COLUMN default_simulations.yield_at_risk_95 IS 'Yield at 95% confidence level';
COMMENT ON COLUMN default_simulations.yield_at_risk_90 IS 'Yield at 90% confidence level';
COMMENT ON COLUMN default_simulations.portfolio_default_prob IS 'Probability of at least one default in portfolio (1 - product(1 - p_i))';
COMMENT ON COLUMN default_simulations.expected_loss IS 'Expected dollar loss from defaults';
COMMENT ON COLUMN default_simulations.unexpected_loss IS 'Volatility of dollar losses (standard deviation)';
COMMENT ON COLUMN default_simulations.var_99 IS 'Value-at-Risk at 99% (dollar loss at 99th percentile)';
COMMENT ON COLUMN default_simulations.cvar_99 IS 'Conditional VaR / Expected Shortfall (average loss beyond VaR99)';
COMMENT ON COLUMN default_simulations.loss_distribution_skewness IS 'Skewness of loss distribution (asymmetry)';
COMMENT ON COLUMN default_simulations.loss_distribution_kurtosis IS 'Excess kurtosis (tail risk / fat tails)';
COMMENT ON COLUMN default_simulations.macro_scenario IS 'Scenario: base_case (1.0x), recession (2.5x), boom (0.6x), stress (4.0x default rates)';
COMMENT ON COLUMN default_simulations.base_rate_assumption IS 'Fed funds rate assumption for scenario';
COMMENT ON COLUMN default_simulations.gdp_growth_assumption IS 'GDP growth rate assumption for scenario';
COMMENT ON COLUMN default_simulations.path_distribution IS 'JSONB with percentiles [1, 5, 10, 25, 50, 75, 90, 95, 99] of simulation results';
COMMENT ON COLUMN default_simulations.worst_case_scenarios IS 'JSONB with top 10 worst simulation paths and defaulted debt IDs';
COMMENT ON COLUMN default_simulations.execution_time_ms IS 'Simulation execution time in milliseconds';
COMMENT ON COLUMN default_simulations.random_seed IS 'Random seed for reproducibility';

-- =============================================================================
-- End of Migration
-- =============================================================================
