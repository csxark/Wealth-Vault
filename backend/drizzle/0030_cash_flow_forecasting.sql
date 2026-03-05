-- Cash Flow Forecasting & Budget Intelligence Migration
-- Issue #668

-- Create enums
CREATE TYPE forecast_type AS ENUM ('income', 'expense', 'net_cash_flow');
CREATE TYPE forecast_period AS ENUM ('30_days', '60_days', '90_days');
CREATE TYPE seasonality_type AS ENUM ('monthly', 'quarterly', 'yearly');
CREATE TYPE variance_status AS ENUM ('on_track', 'slight_overage', 'significant_overage', 'underspend');
CREATE TYPE irregular_expense_status AS ENUM ('predicted', 'upcoming', 'overdue', 'completed');

-- Cash Flow Forecasts table
CREATE TABLE cash_flow_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    forecast_period forecast_period NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    
    projected_income NUMERIC(15, 2) NOT NULL,
    projected_expenses NUMERIC(15, 2) NOT NULL,
    projected_net_cash_flow NUMERIC(15, 2) NOT NULL,
    
    actual_income NUMERIC(15, 2),
    actual_expenses NUMERIC(15, 2),
    actual_net_cash_flow NUMERIC(15, 2),
    
    accuracy NUMERIC(5, 2),
    variance_amount NUMERIC(15, 2),
    variance_percent NUMERIC(8, 2),
    
    confidence NUMERIC(5, 2) DEFAULT 85,
    model_type TEXT DEFAULT 'arima',
    
    daily_projections JSONB DEFAULT '[]'::jsonb,
    risk_factors JSONB DEFAULT '[]'::jsonb,
    opportunity_factors JSONB DEFAULT '[]'::jsonb,
    
    is_active BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'draft',
    
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    generated_from TEXT DEFAULT 'historical_data',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT forecast_period_check CHECK (end_date > start_date),
    CONSTRAINT confidence_check CHECK (confidence >= 0 AND confidence <= 100),
    COMMENT ON COLUMN cash_flow_forecasts.confidence IS 'Forecast confidence level 0-100'
);

CREATE INDEX idx_cash_flow_forecasts_user ON cash_flow_forecasts(user_id);
CREATE INDEX idx_cash_flow_forecasts_user_period ON cash_flow_forecasts(user_id, forecast_period);
CREATE INDEX idx_cash_flow_forecasts_date_range ON cash_flow_forecasts(start_date, end_date);
CREATE INDEX idx_cash_flow_forecasts_status ON cash_flow_forecasts(status);

-- Seasonal Patterns table
CREATE TABLE seasonal_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    seasonality_type seasonality_type NOT NULL,
    category TEXT,
    
    base_line NUMERIC(15, 2) NOT NULL,
    seasonal_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence NUMERIC(5, 2) DEFAULT 75,
    
    data_points INTEGER DEFAULT 0,
    deviation_std_dev NUMERIC(8, 4) DEFAULT 0,
    last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    is_peak_season BOOLEAN DEFAULT FALSE,
    peak_multiplier NUMERIC(5, 2),
    low_multiplier NUMERIC(5, 2),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT confidence_range CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE INDEX idx_seasonal_patterns_user ON seasonal_patterns(user_id);
CREATE INDEX idx_seasonal_patterns_type_category ON seasonal_patterns(seasonality_type, category);
CREATE INDEX idx_seasonal_patterns_updated ON seasonal_patterns(last_updated_at);

-- Budget Variance Analysis table
CREATE TABLE budget_variance_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE,
    
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type TEXT NOT NULL,
    
    budget_amount NUMERIC(15, 2) NOT NULL,
    actual_amount NUMERIC(15, 2) NOT NULL,
    
    variance_amount NUMERIC(15, 2) NOT NULL,
    variance_percent NUMERIC(8, 2) NOT NULL,
    variance_status variance_status NOT NULL,
    
    trend_direction TEXT,
    projected_month_end NUMERIC(15, 2),
    
    category_variances JSONB DEFAULT '[]'::jsonb,
    top_variance_causes JSONB DEFAULT '[]'::jsonb,
    
    has_issues BOOLEAN DEFAULT FALSE,
    issues JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT period_check CHECK (period_end > period_start)
);

CREATE INDEX idx_budget_variance_user ON budget_variance_analysis(user_id);
CREATE INDEX idx_budget_variance_period ON budget_variance_analysis(period_start, period_end);
CREATE INDEX idx_budget_variance_status ON budget_variance_analysis(variance_status);

-- Spending Predictions table
CREATE TABLE spending_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    category TEXT NOT NULL,
    prediction_date TIMESTAMP NOT NULL,
    prediction_horizon INTEGER NOT NULL,
    
    predicted_amount NUMERIC(15, 2) NOT NULL,
    confidence_interval_95_low NUMERIC(15, 2) NOT NULL,
    confidence_interval_95_high NUMERIC(15, 2) NOT NULL,
    confidence_score NUMERIC(5, 2) NOT NULL,
    
    actual_amount NUMERIC(15, 2),
    prediction_accuracy NUMERIC(5, 2),
    
    factors JSONB DEFAULT '[]'::jsonb,
    seasonal_adjustment NUMERIC(5, 2) DEFAULT 1.0,
    trend_adjustment NUMERIC(5, 2) DEFAULT 1.0,
    
    model_version TEXT DEFAULT '1.0',
    training_data_points INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT confidence_check CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX idx_spending_predictions_user ON spending_predictions(user_id);
CREATE INDEX idx_spending_predictions_category ON spending_predictions(category);
CREATE INDEX idx_spending_predictions_date ON spending_predictions(prediction_date);
CREATE INDEX idx_spending_predictions_horizon ON spending_predictions(prediction_horizon);

-- Irregular Expenses table
CREATE TABLE irregular_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    estimated_amount NUMERIC(15, 2) NOT NULL,
    actual_amount NUMERIC(15, 2),
    
    expected_date TIMESTAMP,
    actual_date TIMESTAMP,
    frequency TEXT,
    last_occurrence TIMESTAMP,
    next_expected_occurrence TIMESTAMP,
    
    status irregular_expense_status DEFAULT 'predicted',
    is_prepared BOOLEAN DEFAULT FALSE,
    funding_source TEXT,
    
    confidence_percent NUMERIC(5, 2) DEFAULT 70,
    
    notes TEXT,
    related_expense_ids JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_irregular_expenses_user ON irregular_expenses(user_id);
CREATE INDEX idx_irregular_expenses_status ON irregular_expenses(status);
CREATE INDEX idx_irregular_expenses_expected_date ON irregular_expenses(expected_date);
CREATE INDEX idx_irregular_expenses_next_occurrence ON irregular_expenses(next_expected_occurrence);

-- Sensitivity Analysis table
CREATE TABLE sensitivity_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    scenario_name TEXT NOT NULL,
    description TEXT,
    scenario_type TEXT NOT NULL,
    
    base_case_income NUMERIC(15, 2) NOT NULL,
    base_case_expenses NUMERIC(15, 2) NOT NULL,
    base_case_balance NUMERIC(15, 2) NOT NULL,
    
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    scenario_income NUMERIC(15, 2) NOT NULL,
    scenario_expenses NUMERIC(15, 2) NOT NULL,
    scenario_balance NUMERIC(15, 2) NOT NULL,
    
    impact_amount NUMERIC(15, 2) NOT NULL,
    impact_percent NUMERIC(8, 2) NOT NULL,
    days_to_depletion INTEGER,
    recovery_months INTEGER,
    
    risk_level TEXT,
    sustainability NUMERIC(5, 2),
    
    recommendations JSONB DEFAULT '[]'::jsonb,
    
    is_favorite BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sensitivity_analysis_user ON sensitivity_analysis(user_id);
CREATE INDEX idx_sensitivity_analysis_scenario_type ON sensitivity_analysis(scenario_type);
CREATE INDEX idx_sensitivity_analysis_risk ON sensitivity_analysis(risk_level);

-- Forecast Alerts table
CREATE TABLE forecast_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    
    forecast_id UUID REFERENCES cash_flow_forecasts(id) ON DELETE CASCADE,
    irregular_expense_id UUID REFERENCES irregular_expenses(id) ON DELETE CASCADE,
    
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    projected_impact NUMERIC(15, 2),
    
    recommendations JSONB DEFAULT '[]'::jsonb,
    
    is_active BOOLEAN DEFAULT TRUE,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledgment_date TIMESTAMP,
    action_taken TEXT,
    
    trigger_date TIMESTAMP NOT NULL,
    target_date TIMESTAMP,
    notification_sent BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_forecast_alerts_user ON forecast_alerts(user_id);
CREATE INDEX idx_forecast_alerts_severity ON forecast_alerts(severity);
CREATE INDEX idx_forecast_alerts_active ON forecast_alerts(is_active);
CREATE INDEX idx_forecast_alerts_trigger_date ON forecast_alerts(trigger_date);

-- Forecast Accuracy Metrics table
CREATE TABLE forecast_accuracy_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    metrics_date TIMESTAMP NOT NULL,
    measurement_period TEXT NOT NULL,
    
    mean_absolute_error NUMERIC(15, 2),
    mean_absolute_percent_error NUMERIC(8, 2),
    root_mean_squared_error NUMERIC(15, 2),
    
    directional_accuracy NUMERIC(5, 2),
    within_confidence_interval NUMERIC(5, 2),
    
    category_metrics JSONB DEFAULT '[]'::jsonb,
    
    improvement_trend TEXT,
    
    best_performing_model TEXT,
    model_comparison JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_forecast_accuracy_user ON forecast_accuracy_metrics(user_id);
CREATE INDEX idx_forecast_accuracy_date ON forecast_accuracy_metrics(metrics_date);
CREATE INDEX idx_forecast_accuracy_period ON forecast_accuracy_metrics(measurement_period);

-- Cash Flow Tracker table
CREATE TABLE cash_flow_tracker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    tracking_date TIMESTAMP NOT NULL,
    current_balance NUMERIC(15, 2) NOT NULL,
    
    incoming_today NUMERIC(15, 2) DEFAULT 0,
    outgoing_today NUMERIC(15, 2) DEFAULT 0,
    net_today NUMERIC(15, 2) DEFAULT 0,
    
    incoming_next_7_days NUMERIC(15, 2) DEFAULT 0,
    outgoing_next_7_days NUMERIC(15, 2) DEFAULT 0,
    net_next_7_days NUMERIC(15, 2) DEFAULT 0,
    
    forecasted_balance NUMERIC(15, 2),
    variance_from_forecast NUMERIC(15, 2),
    
    is_healthy BOOLEAN DEFAULT TRUE,
    health_score INTEGER DEFAULT 100,
    warnings JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cash_flow_tracker_user ON cash_flow_tracker(user_id);
CREATE INDEX idx_cash_flow_tracker_date ON cash_flow_tracker(tracking_date);
CREATE INDEX idx_cash_flow_tracker_user_date ON cash_flow_tracker(user_id, tracking_date DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_cash_flow_forecasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_flow_forecasts_updated_at_trigger
BEFORE UPDATE ON cash_flow_forecasts
FOR EACH ROW
EXECUTE FUNCTION update_cash_flow_forecasts_updated_at();

-- Similar triggers for other tables
CREATE OR REPLACE FUNCTION update_seasonal_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seasonal_patterns_updated_at_trigger
BEFORE UPDATE ON seasonal_patterns
FOR EACH ROW
EXECUTE FUNCTION update_seasonal_patterns_updated_at();

CREATE OR REPLACE FUNCTION update_irregular_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER irregular_expenses_updated_at_trigger
BEFORE UPDATE ON irregular_expenses
FOR EACH ROW
EXECUTE FUNCTION update_irregular_expenses_updated_at();

CREATE OR REPLACE FUNCTION update_sensitivity_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sensitivity_analysis_updated_at_trigger
BEFORE UPDATE ON sensitivity_analysis
FOR EACH ROW
EXECUTE FUNCTION update_sensitivity_analysis_updated_at();

CREATE OR REPLACE FUNCTION update_forecast_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER forecast_alerts_updated_at_trigger
BEFORE UPDATE ON forecast_alerts
FOR EACH ROW
EXECUTE FUNCTION update_forecast_alerts_updated_at();
