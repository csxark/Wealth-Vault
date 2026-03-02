-- Migration: Category Budget Forecasting with Confidence Intervals
-- Issue: #609
-- Description: Implements time-series forecasting with confidence intervals for category budgets
-- Features: Moving averages, trend detection, anomaly handling, forecast accuracy tracking

-- Create forecast model type enum
CREATE TYPE forecast_model_type AS ENUM ('moving_average', 'exponential_smoothing', 'arima', 'prophet', 'ensemble');

-- Create forecast status enum
CREATE TYPE forecast_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'stale');

-- Category Forecast History table
-- Stores historical spending data with moving averages and statistical measures
CREATE TABLE category_forecast_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Time period
  period_start timestamp NOT NULL,
  period_end timestamp NOT NULL,
  period_type text DEFAULT 'daily' NOT NULL,
  
  -- Historical metrics
  actual_spent numeric(12, 2) NOT NULL,
  transaction_count integer DEFAULT 0 NOT NULL,
  
  -- Moving averages
  ma_7 numeric(12, 2),
  ma_30 numeric(12, 2),
  ma_90 numeric(12, 2),
  
  -- Exponential moving averages
  ema_7 numeric(12, 2),
  ema_30 numeric(12, 2),
  
  -- Statistical measures
  standard_deviation numeric(12, 2),
  variance numeric(12, 2),
  
  -- Seasonality detection
  seasonality_index double precision,
  is_anomaly boolean DEFAULT false,
  anomaly_score double precision,
  
  -- Metadata
  metadata jsonb DEFAULT '{"dataQuality":"good","missingDays":0,"outlierCount":0}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Category Forecasts table
-- Stores forecast predictions with 95% confidence intervals
CREATE TABLE category_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Forecast period
  forecast_start timestamp NOT NULL,
  forecast_end timestamp NOT NULL,
  period_type text DEFAULT 'monthly' NOT NULL,
  
  -- Forecast predictions
  predicted_spent numeric(12, 2) NOT NULL,
  
  -- Confidence intervals (95% by default)
  confidence_lower numeric(12, 2) NOT NULL,
  confidence_upper numeric(12, 2) NOT NULL,
  confidence_level double precision DEFAULT 0.95 NOT NULL,
  
  -- Additional statistical intervals
  lower_bound_80 numeric(12, 2),
  upper_bound_80 numeric(12, 2),
  
  -- Model information
  model_type forecast_model_type DEFAULT 'moving_average' NOT NULL,
  model_version text DEFAULT '1.0',
  
  -- Trend analysis
  trend_direction text DEFAULT 'stable',
  trend_strength double precision,
  
  -- Seasonality
  has_seasonality boolean DEFAULT false,
  seasonal_peak_period text,
  
  -- Model performance
  accuracy double precision,
  mape double precision,
  rmse double precision,
  
  -- Status
  status forecast_status DEFAULT 'pending' NOT NULL,
  is_active boolean DEFAULT true,
  
  -- Alert thresholds
  warning_threshold numeric(12, 2),
  critical_threshold numeric(12, 2),
  
  -- Metadata and features
  features jsonb DEFAULT '{"dayOfWeek":[],"dayOfMonth":[],"monthOfYear":[],"holidays":[],"customEvents":[]}',
  metadata jsonb DEFAULT '{"historicalPeriods":0,"computeTimeMs":0,"dataPoints":0,"anomaliesDetected":0}',
  
  -- Timestamps
  computed_at timestamp DEFAULT now(),
  valid_until timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Forecast Accuracy Metrics table
-- Tracks model performance over time for validation and retraining decisions
CREATE TABLE forecast_accuracy_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  forecast_id uuid REFERENCES category_forecasts(id) ON DELETE CASCADE,
  
  -- Evaluation period
  evaluation_date timestamp NOT NULL,
  period_type text NOT NULL,
  
  -- Actual vs Predicted
  actual_spent numeric(12, 2) NOT NULL,
  predicted_spent numeric(12, 2) NOT NULL,
  
  -- Error metrics
  absolute_error numeric(12, 2),
  percentage_error double precision,
  squared_error numeric(12, 2),
  
  -- Confidence interval validation
  within_confidence_interval boolean,
  confidence_level double precision,
  
  -- Model details
  model_type forecast_model_type NOT NULL,
  model_version text,
  
  -- Aggregated metrics (rolling windows)
  mape_7d double precision,
  mape_30d double precision,
  rmse_7d double precision,
  rmse_30d double precision,
  
  -- Model health indicators
  model_health text DEFAULT 'good',
  needs_retraining boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{"outlierAdjusted":false,"seasonalityFactorApplied":false,"customAdjustments":[]}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Forecast Alerts table
-- Predictive alerts based on forecasts to prevent overspending
CREATE TABLE forecast_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  forecast_id uuid NOT NULL REFERENCES category_forecasts(id) ON DELETE CASCADE,
  
  -- Alert configuration
  alert_type text NOT NULL,
  severity text DEFAULT 'warning',
  
  -- Prediction details
  projected_spent numeric(12, 2) NOT NULL,
  budget_limit numeric(12, 2),
  projected_overage numeric(12, 2),
  days_until_overage integer,
  
  -- Confidence
  confidence double precision NOT NULL,
  
  -- Alert message
  message text,
  recommendation text,
  
  -- Status
  is_active boolean DEFAULT true,
  is_dismissed boolean DEFAULT false,
  dismissed_at timestamp,
  
  -- Notification
  notification_sent boolean DEFAULT false,
  notification_channels jsonb DEFAULT '["email","in-app"]',
  sent_at timestamp,
  
  -- Metadata
  metadata jsonb DEFAULT '{"triggerCondition":null,"historicalContext":null,"actionsTaken":[]}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Forecast Model Config table
-- Stores model hyperparameters and configurations per tenant/category
CREATE TABLE forecast_model_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Model selection
  model_type forecast_model_type NOT NULL,
  is_default boolean DEFAULT false,
  
  -- Hyperparameters
  hyperparameters jsonb DEFAULT '{"movingAveragePeriod":30,"smoothingFactor":0.3,"arimaOrder":[1,1,1],"seasonalPeriod":7,"confidenceLevel":0.95}',
  
  -- Feature engineering
  features jsonb DEFAULT '{"includeSeasonality":true,"includeTrend":true,"includeHolidays":false,"customFeatures":[]}',
  
  -- Training configuration
  min_historical_periods integer DEFAULT 30,
  retrain_frequency text DEFAULT 'weekly',
  
  -- Performance thresholds
  min_accuracy double precision DEFAULT 0.7,
  max_mape double precision DEFAULT 0.3,
  
  -- Status
  is_active boolean DEFAULT true,
  
  metadata jsonb DEFAULT '{"createdBy":"system","lastOptimized":null}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes for performance optimization

-- Category Forecast History indexes
CREATE INDEX idx_forecast_history_tenant_user ON category_forecast_history(tenant_id, user_id);
CREATE INDEX idx_forecast_history_category ON category_forecast_history(category_id);
CREATE INDEX idx_forecast_history_period ON category_forecast_history(period_start, period_end);
CREATE INDEX idx_forecast_history_anomaly ON category_forecast_history(is_anomaly) WHERE is_anomaly = true;

-- Category Forecasts indexes
CREATE INDEX idx_forecasts_tenant_user ON category_forecasts(tenant_id, user_id);
CREATE INDEX idx_forecasts_category ON category_forecasts(category_id);
CREATE INDEX idx_forecasts_period ON category_forecasts(forecast_start, forecast_end);
CREATE INDEX idx_forecasts_status ON category_forecasts(status) WHERE status != 'completed';
CREATE INDEX idx_forecasts_active ON category_forecasts(is_active) WHERE is_active = true;
CREATE INDEX idx_forecasts_valid_until ON category_forecasts(valid_until) WHERE valid_until IS NOT NULL;

-- Forecast Accuracy Metrics indexes
CREATE INDEX idx_accuracy_metrics_category ON forecast_accuracy_metrics(category_id);
CREATE INDEX idx_accuracy_metrics_forecast ON forecast_accuracy_metrics(forecast_id);
CREATE INDEX idx_accuracy_metrics_evaluation ON forecast_accuracy_metrics(evaluation_date);
CREATE INDEX idx_accuracy_metrics_health ON forecast_accuracy_metrics(model_health, needs_retraining);

-- Forecast Alerts indexes
CREATE INDEX idx_forecast_alerts_tenant_user ON forecast_alerts(tenant_id, user_id);
CREATE INDEX idx_forecast_alerts_category ON forecast_alerts(category_id);
CREATE INDEX idx_forecast_alerts_forecast ON forecast_alerts(forecast_id);
CREATE INDEX idx_forecast_alerts_active ON forecast_alerts(is_active) WHERE is_active = true AND is_dismissed = false;
CREATE INDEX idx_forecast_alerts_severity ON forecast_alerts(severity);

-- Forecast Model Config indexes
CREATE INDEX idx_model_config_tenant ON forecast_model_config(tenant_id);
CREATE INDEX idx_model_config_category ON forecast_model_config(category_id);
CREATE INDEX idx_model_config_default ON forecast_model_config(is_default) WHERE is_default = true;

-- Create composite indexes for common query patterns
CREATE INDEX idx_forecast_history_lookup ON category_forecast_history(tenant_id, category_id, period_start DESC);
CREATE INDEX idx_forecasts_lookup ON category_forecasts(tenant_id, category_id, forecast_start DESC, is_active);
CREATE INDEX idx_accuracy_metrics_lookup ON forecast_accuracy_metrics(category_id, evaluation_date DESC);

-- Add comments for documentation
COMMENT ON TABLE category_forecast_history IS 'Historical spending data with moving averages for time-series forecasting';
COMMENT ON TABLE category_forecasts IS 'Budget forecasts with 95% confidence intervals for predictive overspending prevention';
COMMENT ON TABLE forecast_accuracy_metrics IS 'Model performance tracking for validation and retraining decisions';
COMMENT ON TABLE forecast_alerts IS 'Predictive alerts based on forecast data to prevent month-end overspending';
COMMENT ON TABLE forecast_model_config IS 'Model hyperparameters and configurations per tenant/category';

-- Create function to update moving averages automatically
CREATE OR REPLACE FUNCTION calculate_moving_averages(p_category_id uuid, p_tenant_id uuid, p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Calculate 7-day moving average
  FOR v_record IN 
    SELECT 
      id,
      AVG(actual_spent) OVER (
        ORDER BY period_start 
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      ) as ma7,
      AVG(actual_spent) OVER (
        ORDER BY period_start 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
      ) as ma30,
      AVG(actual_spent) OVER (
        ORDER BY period_start 
        ROWS BETWEEN 89 PRECEDING AND CURRENT ROW
      ) as ma90
    FROM category_forecast_history
    WHERE category_id = p_category_id 
      AND tenant_id = p_tenant_id
      AND user_id = p_user_id
    ORDER BY period_start
  LOOP
    UPDATE category_forecast_history
    SET 
      ma_7 = v_record.ma7,
      ma_30 = v_record.ma30,
      ma_90 = v_record.ma90,
      updated_at = now()
    WHERE id = v_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to detect anomalies using Z-score
CREATE OR REPLACE FUNCTION detect_spending_anomalies(p_category_id uuid, p_tenant_id uuid, p_user_id uuid, p_threshold double precision DEFAULT 2.5)
RETURNS void AS $$
DECLARE
  v_mean numeric;
  v_stddev numeric;
BEGIN
  -- Calculate mean and standard deviation
  SELECT 
    AVG(actual_spent),
    STDDEV(actual_spent)
  INTO v_mean, v_stddev
  FROM category_forecast_history
  WHERE category_id = p_category_id 
    AND tenant_id = p_tenant_id
    AND user_id = p_user_id
    AND period_start >= NOW() - INTERVAL '90 days';
  
  -- Mark anomalies based on Z-score
  UPDATE category_forecast_history
  SET 
    is_anomaly = (ABS(actual_spent - v_mean) / NULLIF(v_stddev, 0)) > p_threshold,
    anomaly_score = (ABS(actual_spent - v_mean) / NULLIF(v_stddev, 0)),
    updated_at = now()
  WHERE category_id = p_category_id 
    AND tenant_id = p_tenant_id
    AND user_id = p_user_id
    AND period_start >= NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create trigger to mark forecasts as stale when new data arrives
CREATE OR REPLACE FUNCTION mark_forecasts_stale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE category_forecasts
  SET 
    status = 'stale',
    updated_at = now()
  WHERE category_id = NEW.category_id
    AND tenant_id = NEW.tenant_id
    AND user_id = NEW.user_id
    AND status = 'completed'
    AND forecast_start <= NEW.period_end;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_forecasts_stale
AFTER INSERT ON category_forecast_history
FOR EACH ROW
EXECUTE FUNCTION mark_forecasts_stale();

-- Create view for latest forecasts per category
CREATE VIEW v_latest_category_forecasts AS
SELECT DISTINCT ON (tenant_id, category_id)
  id,
  tenant_id,
  user_id,
  category_id,
  forecast_start,
  forecast_end,
  predicted_spent,
  confidence_lower,
  confidence_upper,
  confidence_level,
  trend_direction,
  trend_strength,
  model_type,
  accuracy,
  mape,
  status,
  computed_at
FROM category_forecasts
WHERE is_active = true AND status = 'completed'
ORDER BY tenant_id, category_id, computed_at DESC;

-- Create view for forecast accuracy summary
CREATE VIEW v_forecast_accuracy_summary AS
SELECT 
  category_id,
  tenant_id,
  model_type,
  COUNT(*) as total_forecasts,
  AVG(percentage_error) as avg_error_pct,
  AVG(CASE WHEN within_confidence_interval THEN 1 ELSE 0 END) as confidence_hit_rate,
  SUM(CASE WHEN needs_retraining THEN 1 ELSE 0 END) as retraining_needed_count,
  MAX(evaluation_date) as last_evaluation
FROM forecast_accuracy_metrics
WHERE evaluation_date >= NOW() - INTERVAL '30 days'
GROUP BY category_id, tenant_id, model_type;

-- Grant permissions (adjust based on your RBAC setup)
COMMENT ON FUNCTION calculate_moving_averages IS 'Automatically calculates 7, 30, and 90-day moving averages for historical data';
COMMENT ON FUNCTION detect_spending_anomalies IS 'Detects spending anomalies using Z-score method with configurable threshold';
COMMENT ON VIEW v_latest_category_forecasts IS 'Latest active forecast per category for quick lookups';
COMMENT ON VIEW v_forecast_accuracy_summary IS 'Summarizes forecast accuracy metrics over the last 30 days';
