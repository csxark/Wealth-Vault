-- Monte Carlo Burn-Rate Simulator & Cashflow Forecasting
-- Implements 10,000+ simulation iterations with probabilistic modeling
-- Provides P10/P50/P90 confidence intervals for financial runway predictions

-- ==========================================
-- FORECAST SCENARIOS TABLE
-- ==========================================
-- Stores configurable simulation scenarios with revenue/expense parameters

CREATE TABLE IF NOT EXISTS forecast_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Scenario Configuration
    scenario_name VARCHAR(100) NOT NULL,
    scenario_type VARCHAR(20) NOT NULL DEFAULT 'baseline', -- baseline, optimistic, pessimistic, custom
    description TEXT,
    
    -- Simulation Parameters
    simulation_count INTEGER NOT NULL DEFAULT 10000, -- Number of Monte Carlo iterations
    forecast_horizon_days INTEGER NOT NULL DEFAULT 365, -- Days to simulate forward
    confidence_level NUMERIC(4, 2) DEFAULT 0.90, -- Confidence interval (0.90 = 90%)
    
    -- Revenue Parameters (JSONB)
    -- {meanMonthly, stdDeviation, distribution: 'normal'|'lognormal'|'uniform', growthRate, seasonality: [12 monthly factors]}
    revenue_params JSONB NOT NULL DEFAULT '{
        "meanMonthly": 50000,
        "stdDeviation": 5000,
        "distribution": "lognormal",
        "growthRate": 0.0,
        "seasonality":[1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0]
    }',
    
    -- Expense Parameters (JSONB)
    -- {fixedCosts, variableCostsMean, variableCostsStdDev, shockProbability, shockMagnitude}
    expense_params JSONB NOT NULL DEFAULT '{
        "fixedCosts": 30000,
        "variableCostsMean": 15000,
        "variableCostsStdDev": 3000,
        "shockProbability": 0.05,
        "shockMagnitude": 1.5
    }',
    
    -- Economic Factors (JSONB)
    -- {inflationRate, interestRate, marketVolatility, unemploymentRate}
    economic_factors JSONB DEFAULT '{
        "inflationRate": 0.03,
        "interestRate": 0.05,
        "marketVolatility": 0.15,
        "unemploymentRate": 0.04
    }',
    
    -- Initial Conditions
    initial_cash_balance NUMERIC(15, 2) NOT NULL DEFAULT '100000',
    minimum_cash_reserve NUMERIC(15, 2) NOT NULL DEFAULT '10000', -- Depletion threshold
    
    -- Cached Results
    last_simulation_results JSONB, -- {batchId, p10, p50, p90}
    last_run_at TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_locked BOOLEAN DEFAULT false, -- Prevents concurrent simulations
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_user_id ON forecast_scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_active ON forecast_scenarios(is_active);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_type ON forecast_scenarios(scenario_type);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_user_active ON forecast_scenarios(user_id, is_active);

COMMENT ON TABLE forecast_scenarios IS 'Monte Carlo simulation scenarios with configurable revenue/expense distributions';
COMMENT ON COLUMN forecast_scenarios.simulation_count IS 'Number of Monte Carlo iterations (default 10,000)';
COMMENT ON COLUMN forecast_scenarios.revenue_params IS 'JSONB: meanMonthly, stdDeviation, distribution, growthRate, seasonality';
COMMENT ON COLUMN forecast_scenarios.expense_params IS 'JSONB: fixedCosts, variableCostsMean, shockProbability, shockMagnitude';

-- ==========================================
-- FORECAST SIMULATION RESULTS TABLE
-- ==========================================
-- Stores individual simulation run data (10,000+ rows per batch)

CREATE TABLE IF NOT EXISTS forecast_simulation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES forecast_scenarios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id VARCHAR(100) NOT NULL, -- Groups simulations from same run
    simulation_number INTEGER NOT NULL,
    
    -- Cashflow Timeline (JSONB array)
    -- [{day, balance, revenue, expenses, netCashFlow}, ...]
    -- Sampled every 7 days to reduce data size
    cashflow_timeline JSONB NOT NULL,
    
    -- Summary Metrics
    final_cash_balance NUMERIC(15, 2) NOT NULL,
    min_cash_balance NUMERIC(15, 2) NOT NULL,
    max_cash_balance NUMERIC(15, 2) NOT NULL,
    day_of_min_balance INTEGER,
    days_to_cash_depletion INTEGER, -- NULL if never depleted
    
    -- Aggregate Metrics
    total_revenue NUMERIC(15, 2) NOT NULL,
    total_expenses NUMERIC(15, 2) NOT NULL,
    net_cash_flow NUMERIC(15, 2) NOT NULL,
    volatility_score NUMERIC(10, 4), -- Std deviation of daily balance changes
    
    -- Event Counters
    expense_shock_count INTEGER DEFAULT 0,
    revenue_drought_days INTEGER DEFAULT 0, -- Days with revenue < 70% of mean
    
    -- Execution Metrics
    execution_time_ms INTEGER,
    seed_value BIGINT, -- Random seed for reproducibility
    
    -- Timestamps
    computed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_simulation_results_scenario_id ON forecast_simulation_results(scenario_id);
CREATE INDEX IF NOT EXISTS idx_forecast_simulation_results_batch_id ON forecast_simulation_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_forecast_simulation_results_user_id ON forecast_simulation_results(user_id);
CREATE INDEX IF NOT EXISTS idx_forecast_simulation_results_depletion ON forecast_simulation_results(days_to_cash_depletion);
CREATE INDEX IF NOT EXISTS idx_forecast_simulation_results_final_balance ON forecast_simulation_results(final_cash_balance);

COMMENT ON TABLE forecast_simulation_results IS 'Individual Monte Carlo simulation results (10,000+ per batch)';
COMMENT ON COLUMN forecast_simulation_results.cashflow_timeline IS 'JSONB array of daily cashflow snapshots (sampled every 7 days)';
COMMENT ON COLUMN forecast_simulation_results.days_to_cash_depletion IS 'Number of days until balance <= minimum reserve (NULL if never depleted)';

-- ==========================================
-- FORECAST AGGREGATES TABLE
-- ==========================================
-- Stores statistical aggregates across all simulations in a batch

CREATE TABLE IF NOT EXISTS forecast_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL UNIQUE REFERENCES forecast_scenarios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id VARCHAR(100) NOT NULL UNIQUE,
    
    -- Confidence Intervals: Final Balance
    p10_final_balance NUMERIC(15, 2) NOT NULL, -- Pessimistic (10th percentile)
    p50_final_balance NUMERIC(15, 2) NOT NULL, -- Median (50th percentile)
    p90_final_balance NUMERIC(15, 2) NOT NULL, -- Optimistic (90th percentile)
    
    -- Confidence Intervals: Runway Duration
    p10_days_to_depletion INTEGER, -- Pessimistic runway
    p50_days_to_depletion INTEGER, -- Median runway
    p90_days_to_depletion INTEGER, -- Optimistic runway
    depletion_probability NUMERIC(5, 4) NOT NULL DEFAULT 0, -- % of simulations that depleted
    
    -- Daily Percentile Bands (JSONB for fan charts)
    -- [{day, p10, p25, p50, p75, p90, mean}, ...]
    -- Sampled every 7 days for visualization
    daily_percentiles JSONB,
    
    -- Distribution Histograms (JSONB)
    final_balance_distribution JSONB, -- 50 bins: [{binStart, binEnd, binMid, count, frequency}, ...]
    daily_volatility_distribution JSONB, -- 30 bins
    
    -- Summary Statistics
    mean_final_balance NUMERIC(15, 2) NOT NULL,
    std_dev_final_balance NUMERIC(15, 2) NOT NULL,
    skewness NUMERIC(10, 6), -- Asymmetry measure
    kurtosis NUMERIC(10, 6), -- Tail risk measure (excess kurtosis)
    
    -- Risk Metrics
    value_at_risk_95 NUMERIC(15, 2), -- VaR 95%: worst case at 95% confidence
    conditional_var_95 NUMERIC(15, 2), -- CVaR 95%: expected shortfall beyond VaR
    max_drawdown NUMERIC(15, 2), -- Largest peak-to-trough decline
    
    -- Simulation Metadata
    total_simulations INTEGER NOT NULL,
    successful_simulations INTEGER NOT NULL,
    failed_simulations INTEGER DEFAULT 0,
    total_execution_time_ms INTEGER,
    
    -- Timestamps
    computed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_aggregates_user_id ON forecast_aggregates(user_id);
CREATE INDEX IF NOT EXISTS idx_forecast_aggregates_depletion_prob ON forecast_aggregates(depletion_probability);
CREATE INDEX IF NOT EXISTS idx_forecast_aggregates_computed_at ON forecast_aggregates(computed_at);

COMMENT ON TABLE forecast_aggregates IS 'Statistical aggregates across all Monte Carlo simulations';
COMMENT ON COLUMN forecast_aggregates.p10_final_balance IS 'Pessimistic case: 10th percentile final balance';
COMMENT ON COLUMN forecast_aggregates.p50_final_balance IS 'Median case: 50th percentile final balance';
COMMENT ON COLUMN forecast_aggregates.p90_final_balance IS 'Optimistic case: 90th percentile final balance';
COMMENT ON COLUMN forecast_aggregates.depletion_probability IS 'Percentage of simulations that depleted cash reserves';
COMMENT ON COLUMN forecast_aggregates.daily_percentiles IS 'JSONB array of daily percentile bands for fan chart visualization';

-- ==========================================
-- RUNWAY ALERT THRESHOLDS TABLE
-- ==========================================
-- User-configurable thresholds for proactive runway alerts & circuit breakers

CREATE TABLE IF NOT EXISTS runway_alert_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Alert Thresholds
    min_days_runway_p50 INTEGER NOT NULL DEFAULT 90, -- Minimum median runway days
    max_depletion_probability NUMERIC(5, 4) NOT NULL DEFAULT 0.20, -- Max acceptable depletion risk (20%)
    min_cash_reserve_p10 NUMERIC(15, 2) NOT NULL DEFAULT '5000', -- Minimum P10 final balance
    
    -- Notification Configuration
    notification_channels JSONB DEFAULT '{"email": true, "push": true, "sms": false, "inApp": true}',
    
    -- Circuit Breaker Settings
    enable_circuit_breaker BOOLEAN DEFAULT false, -- Blocks risky expenses when depletion > threshold
    circuit_breaker_threshold NUMERIC(5, 4) DEFAULT 0.30, -- Block if depletion_probability >= 30%
    
    -- Alert History
    last_triggered_at TIMESTAMP,
    alert_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runway_alert_thresholds_user_id ON runway_alert_thresholds(user_id);
CREATE INDEX IF NOT EXISTS idx_runway_alert_thresholds_circuit_breaker ON runway_alert_thresholds(enable_circuit_breaker, is_active);

COMMENT ON TABLE runway_alert_thresholds IS 'User-configurable thresholds for runway alerts and expense circuit breakers';
COMMENT ON COLUMN runway_alert_thresholds.min_days_runway_p50 IS 'Alert if median runway < this many days (default 90)';
COMMENT ON COLUMN runway_alert_thresholds.max_depletion_probability IS 'Alert if depletion risk > this threshold (default 0.20 = 20%)';
COMMENT ON COLUMN runway_alert_thresholds.circuit_breaker_threshold IS 'Block expenses if depletion risk >= this (default 0.30 = 30%)';
