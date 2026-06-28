-- Migration: Expense Anomaly Detection using Time Series Analysis
-- Issue: #612
-- Description: Implements real-time ML anomaly detection for spending patterns using isolation forest
-- Features: Per-category/user models, rule-based detection, training data tracking, statistics

-- Create anomaly severity enum
CREATE TYPE anomaly_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Create anomaly status enum
CREATE TYPE anomaly_status AS ENUM ('detected', 'reviewed', 'confirmed', 'false_positive', 'blocked');

-- ========================================
-- Create Tables
-- ========================================

-- Anomaly Models table
-- Isolation forest models per category/user for detecting spending outliers
CREATE TABLE anomaly_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Model metadata
  model_type text DEFAULT 'isolation_forest' NOT NULL,
  model_version text NOT NULL,
  
  -- Training data
  training_data_points integer DEFAULT 0,
  training_start_date timestamp,
  training_end_date timestamp,
  last_trained_at timestamp,
  next_training_due timestamp,
  
  -- Model performance
  accuracy numeric(5, 4),
  precision numeric(5, 4),
  recall numeric(5, 4),
  f1_score numeric(5, 4),
  
  -- Model characteristics
  anomaly_ratio numeric(5, 4) DEFAULT 0.05,
  contamination_factor numeric(5, 4) DEFAULT 0.1,
  
  -- Feature configuration
  features jsonb DEFAULT '{
    "amount": true,
    "dayOfWeek": true,
    "hourOfDay": true,
    "isWeekend": true,
    "daysFromLastTransaction": true,
    "amountDeviation": true,
    "frequencyDeviation": true,
    "timeOfDayPattern": true,
    "categoryTrend": true
  }'::jsonb NOT NULL,
  
  -- Model state
  is_active boolean DEFAULT true NOT NULL,
  needs_retraining boolean DEFAULT false NOT NULL,
  
  -- Model parameters
  parameters jsonb DEFAULT '{
    "nEstimators": 100,
    "maxSamples": 256,
    "randomState": 42,
    "contamination": 0.05,
    "jobsPerCategory": 4
  }'::jsonb,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Anomaly Detections table
-- Stores all detected anomalies with scores and actions
CREATE TABLE anomaly_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  
  -- Anomaly details
  anomaly_score numeric(5, 4) NOT NULL,
  severity anomaly_severity NOT NULL,
  status anomaly_status DEFAULT 'detected' NOT NULL,
  
  -- Transaction features
  amount numeric(12, 2) NOT NULL,
  description text,
  transaction_date timestamp NOT NULL,
  
  -- Anomaly indicators
  z_score numeric(8, 4),
  expected_amount numeric(12, 2),
  amount_deviation numeric(8, 4),
  frequency_deviation numeric(8, 4),
  
  -- Related model
  model_id uuid REFERENCES anomaly_models(id) ON DELETE SET NULL,
  model_version text,
  
  -- Detection context
  features jsonb DEFAULT '{
    "amount": null,
    "dayOfWeek": null,
    "hourOfDay": null,
    "isWeekend": false,
    "daysFromLastTransaction": null,
    "amountDeviation": null,
    "frequencyDeviation": null,
    "lastTransactionAmount": null,
    "avgTransactionAmount": null,
    "stdDeviation": null
  }'::jsonb NOT NULL,
  
  -- User action
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  review_notes text,
  
  -- Action taken
  action_taken text,
  action_taken_at timestamp,
  action_taken_by uuid REFERENCES users(id) ON DELETE SET NULL,
  
  metadata jsonb DEFAULT '{
    "modelConfidence": null,
    "topAnomalyFeatures": [],
    "similarTransactions": []
  }'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Anomaly Training Data table
-- Stores transaction data for model training
CREATE TABLE anomaly_training_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Training point reference
  expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  
  -- Feature values
  amount numeric(12, 2) NOT NULL,
  day_of_week integer,
  hour_of_day integer,
  is_weekend boolean,
  days_from_last_transaction integer,
  amount_deviation numeric(8, 4),
  frequency_deviation numeric(8, 4),
  
  -- Labels
  is_anomaly boolean DEFAULT false NOT NULL,
  user_confirmed boolean DEFAULT false,
  confirmation_label text,
  
  -- Metadata
  features jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now()
);

-- Anomaly Rules table
-- Custom rules for specific spending patterns
CREATE TABLE anomaly_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Rule details
  rule_name text NOT NULL,
  description text,
  rule_type text NOT NULL,
  
  -- Conditions
  condition jsonb NOT NULL,
  
  -- Actions
  action text NOT NULL,
  severity anomaly_severity DEFAULT 'medium' NOT NULL,
  
  -- Status
  is_active boolean DEFAULT true NOT NULL,
  priority integer DEFAULT 0,
  
  -- Tracking
  times_triggered integer DEFAULT 0,
  last_triggered_at timestamp,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Anomaly Statistics table
-- Summary statistics per category/user/period
CREATE TABLE anomaly_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  
  -- Time period
  period_start timestamp NOT NULL,
  period_end timestamp NOT NULL,
  period_type text DEFAULT 'daily' NOT NULL,
  
  -- Statistics
  total_transactions integer DEFAULT 0,
  anomalous_transactions integer DEFAULT 0,
  anomaly_percentage numeric(5, 2),
  
  -- Amount statistics
  avg_amount numeric(12, 2),
  std_dev_amount numeric(12, 2),
  min_amount numeric(12, 2),
  max_amount numeric(12, 2),
  
  -- Severity distribution
  low_severity_count integer DEFAULT 0,
  medium_severity_count integer DEFAULT 0,
  high_severity_count integer DEFAULT 0,
  critical_severity_count integer DEFAULT 0,
  
  -- Trends
  anomaly_trend numeric(5, 4),
  trend_direction text,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ========================================
-- Create Indexes
-- ========================================

-- Anomaly Models indexes
CREATE INDEX idx_anomaly_models_tenant_id ON anomaly_models(tenant_id);
CREATE INDEX idx_anomaly_models_user_id ON anomaly_models(user_id);
CREATE INDEX idx_anomaly_models_category_id ON anomaly_models(category_id);
CREATE INDEX idx_anomaly_models_active ON anomaly_models(is_active);
CREATE INDEX idx_anomaly_models_needs_retraining ON anomaly_models(needs_retraining);
CREATE INDEX idx_anomaly_models_next_training ON anomaly_models(next_training_due);

-- Anomaly Detections indexes
CREATE INDEX idx_anomaly_detections_tenant_id ON anomaly_detections(tenant_id);
CREATE INDEX idx_anomaly_detections_user_id ON anomaly_detections(user_id);
CREATE INDEX idx_anomaly_detections_category_id ON anomaly_detections(category_id);
CREATE INDEX idx_anomaly_detections_expense_id ON anomaly_detections(expense_id);
CREATE INDEX idx_anomaly_detections_status ON anomaly_detections(status);
CREATE INDEX idx_anomaly_detections_severity ON anomaly_detections(severity);
CREATE INDEX idx_anomaly_detections_created_at ON anomaly_detections(created_at DESC);
CREATE INDEX idx_anomaly_detections_model_id ON anomaly_detections(model_id);
CREATE INDEX idx_anomaly_detections_score ON anomaly_detections(anomaly_score DESC);

-- Anomaly Training Data indexes
CREATE INDEX idx_anomaly_training_data_tenant_id ON anomaly_training_data(tenant_id);
CREATE INDEX idx_anomaly_training_data_user_id ON anomaly_training_data(user_id);
CREATE INDEX idx_anomaly_training_data_category_id ON anomaly_training_data(category_id);
CREATE INDEX idx_anomaly_training_data_is_anomaly ON anomaly_training_data(is_anomaly);
CREATE INDEX idx_anomaly_training_data_user_confirmed ON anomaly_training_data(user_confirmed);

-- Anomaly Rules indexes
CREATE INDEX idx_anomaly_rules_tenant_id ON anomaly_rules(tenant_id);
CREATE INDEX idx_anomaly_rules_user_id ON anomaly_rules(user_id);
CREATE INDEX idx_anomaly_rules_category_id ON anomaly_rules(category_id);
CREATE INDEX idx_anomaly_rules_is_active ON anomaly_rules(is_active);
CREATE INDEX idx_anomaly_rules_priority ON anomaly_rules(priority DESC);

-- Anomaly Statistics indexes
CREATE INDEX idx_anomaly_statistics_tenant_id ON anomaly_statistics(tenant_id);
CREATE INDEX idx_anomaly_statistics_user_id ON anomaly_statistics(user_id);
CREATE INDEX idx_anomaly_statistics_category_id ON anomaly_statistics(category_id);
CREATE INDEX idx_anomaly_statistics_period ON anomaly_statistics(period_start, period_end);
CREATE INDEX idx_anomaly_statistics_period_type ON anomaly_statistics(period_type);

-- ========================================
-- Create Functions
-- ========================================

-- Function to calculate anomaly severity based on score
CREATE OR REPLACE FUNCTION calculate_anomaly_severity(score numeric)
RETURNS anomaly_severity AS $$
BEGIN
  IF score >= 0.8 THEN
    RETURN 'critical'::anomaly_severity;
  ELSIF score >= 0.6 THEN
    RETURN 'high'::anomaly_severity;
  ELSIF score >= 0.4 THEN
    RETURN 'medium'::anomaly_severity;
  ELSE
    RETURN 'low'::anomaly_severity;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update anomaly statistics
CREATE OR REPLACE FUNCTION update_anomaly_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update statistics for the detection's period
  UPDATE anomaly_statistics
  SET 
    anomalous_transactions = anomalous_transactions + 1,
    (CASE NEW.severity
      WHEN 'low' THEN low_severity_count = low_severity_count + 1
      WHEN 'medium' THEN medium_severity_count = medium_severity_count + 1
      WHEN 'high' THEN high_severity_count = high_severity_count + 1
      WHEN 'critical' THEN critical_severity_count = critical_severity_count + 1
      ELSE 0
    END)
  WHERE 
    tenant_id = NEW.tenant_id
    AND user_id = NEW.user_id
    AND category_id = NEW.category_id
    AND DATE(period_start) = DATE(NEW.created_at)
    AND period_type = 'daily';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to mark model for retraining if anomalies exceed threshold
CREATE OR REPLACE FUNCTION check_retraining_needed()
RETURNS TRIGGER AS $$
DECLARE
  recent_anomaly_count integer;
  total_recent_count integer;
  anomaly_rate numeric;
BEGIN
  -- Count anomalies in last 7 days
  SELECT COUNT(*) INTO recent_anomaly_count
  FROM anomaly_detections
  WHERE 
    model_id = NEW.model_id
    AND created_at >= NOW() - INTERVAL '7 days';
  
  -- Count total transactions in last 7 days
  SELECT COUNT(*) INTO total_recent_count
  FROM expenses
  WHERE 
    user_id = NEW.user_id
    AND category_id = NEW.category_id
    AND created_at >= NOW() - INTERVAL '7 days';
  
  -- If anomaly rate exceeds 15%, mark for retraining
  IF total_recent_count > 0 THEN
    anomaly_rate = recent_anomaly_count::numeric / total_recent_count::numeric;
    IF anomaly_rate > 0.15 THEN
      UPDATE anomaly_models
      SET needs_retraining = true
      WHERE id = NEW.model_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Create Triggers
-- ========================================

-- Trigger on anomaly detection to update statistics
CREATE TRIGGER update_anomaly_stats_trigger
  AFTER INSERT ON anomaly_detections
  FOR EACH ROW
  EXECUTE FUNCTION update_anomaly_statistics();

-- Trigger to check if model needs retraining
CREATE TRIGGER check_retraining_trigger
  AFTER INSERT ON anomaly_detections
  FOR EACH ROW
  EXECUTE FUNCTION check_retraining_needed();

-- ========================================
-- Create Views
-- ========================================

-- View: Recent anomalies per user
CREATE OR REPLACE VIEW v_recent_anomalies AS
SELECT 
  ad.id AS anomaly_id,
  ad.tenant_id,
  ad.user_id,
  u.full_name AS user_name,
  u.email AS user_email,
  ad.category_id,
  c.name AS category_name,
  ad.expense_id,
  ad.amount,
  ad.anomaly_score,
  ad.severity,
  ad.status,
  ad.transaction_date,
  ad.created_at,
  am.model_version
FROM anomaly_detections ad
JOIN users u ON ad.user_id = u.id
JOIN categories c ON ad.category_id = c.id
LEFT JOIN anomaly_models am ON ad.model_id = am.id
WHERE ad.created_at >= NOW() - INTERVAL '7 days'
ORDER BY ad.anomaly_score DESC;

-- View: Models needing retraining
CREATE OR REPLACE VIEW v_models_needing_retraining AS
SELECT 
  am.id,
  am.tenant_id,
  am.user_id,
  u.full_name AS user_name,
  am.category_id,
  c.name AS category_name,
  am.last_trained_at,
  am.needs_retraining,
  COUNT(ad.id) AS recent_anomalies,
  am.training_data_points
FROM anomaly_models am
JOIN users u ON am.user_id = u.id
JOIN categories c ON am.category_id = c.id
LEFT JOIN anomaly_detections ad ON am.id = ad.model_id 
  AND ad.created_at >= NOW() - INTERVAL '7 days'
WHERE am.needs_retraining = true
  OR am.last_trained_at IS NULL
GROUP BY am.id, am.tenant_id, am.user_id, u.full_name, am.category_id, c.name, 
         am.last_trained_at, am.needs_retraining, am.training_data_points;

-- View: Anomaly rules effectiveness
CREATE OR REPLACE VIEW v_rule_effectiveness AS
SELECT 
  ar.id,
  ar.tenant_id,
  ar.rule_name,
  ar.rule_type,
  ar.severity,
  ar.is_active,
  ar.times_triggered,
  ar.last_triggered_at,
  CASE 
    WHEN ar.times_triggered = 0 THEN 0
    ELSE ROUND(100.0 * ar.times_triggered / 
      (SELECT COUNT(*) FROM anomaly_detections 
       WHERE created_at >= NOW() - INTERVAL '30 days'
       AND tenant_id = ar.tenant_id), 2)
  END AS effectiveness_percentage
FROM anomaly_rules ar
WHERE ar.is_active = true;

-- ========================================
-- Comments
-- ========================================

COMMENT ON TABLE anomaly_models IS 'Isolation forest models for per-category/user anomaly detection';
COMMENT ON TABLE anomaly_detections IS 'Detected spending anomalies with scores and user actions';
COMMENT ON TABLE anomaly_training_data IS 'Training dataset for model retraining and improvement';
COMMENT ON TABLE anomaly_rules IS 'Custom rules for pattern-based anomaly detection';
COMMENT ON TABLE anomaly_statistics IS 'Aggregated anomaly statistics by period';

COMMENT ON COLUMN anomaly_detections.anomaly_score IS 'Isolation forest anomaly score (0-1, higher = more anomalous)';
COMMENT ON COLUMN anomaly_detections.severity IS 'Alert severity: low (0-0.4), medium (0.4-0.6), high (0.6-0.8), critical (0.8+)';
COMMENT ON COLUMN anomaly_models.contamination_factor IS 'Expected percentage of anomalies in training data (0.05 = 5%)';
