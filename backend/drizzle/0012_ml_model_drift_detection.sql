-- Migration: Transaction Categorization ML Model Drift Detection
-- Issue: #610
-- Description: Implements model drift detection to monitor categorization accuracy and trigger retraining
-- Features: Confidence score tracking, drift metrics, automatic retraining, user feedback loop

-- Create model status enum
CREATE TYPE model_status AS ENUM ('active', 'training', 'deprecated', 'failed');

-- Create drift severity enum
CREATE TYPE drift_severity AS ENUM ('none', 'low', 'medium', 'high', 'critical');

-- Categorization Predictions table
-- Stores ML predictions with confidence scores for validation
CREATE TABLE categorization_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE,
  
  -- Transaction details
  description text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  
  -- ML prediction
  predicted_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  predicted_category_name text,
  confidence_score double precision NOT NULL,
  
  -- Top N predictions
  top_predictions jsonb DEFAULT '[]',
  
  -- Actual categorization (for validation)
  actual_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  actual_category_name text,
  
  -- User feedback
  was_correct boolean,
  user_corrected boolean DEFAULT false,
  corrected_at timestamp,
  
  -- Model information
  model_version text NOT NULL,
  model_type text DEFAULT 'gemini',
  
  -- Features used
  features jsonb DEFAULT '{"descriptionTokens":[],"amount":null}',
  
  -- Metadata
  metadata jsonb DEFAULT '{"processingTimeMs":0,"fallbackUsed":false}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Model Drift Metrics table
-- Tracks model performance over time to detect drift
CREATE TABLE model_drift_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  
  -- Time window
  period_start timestamp NOT NULL,
  period_end timestamp NOT NULL,
  period_type text DEFAULT 'daily' NOT NULL,
  
  -- Model version
  model_version text NOT NULL,
  model_type text NOT NULL,
  
  -- Performance metrics
  total_predictions integer DEFAULT 0 NOT NULL,
  correct_predictions integer DEFAULT 0 NOT NULL,
  incorrect_predictions integer DEFAULT 0 NOT NULL,
  user_corrected_count integer DEFAULT 0 NOT NULL,
  
  -- Accuracy metrics
  accuracy double precision,
  precision double precision,
  recall double precision,
  f1_score double precision,
  
  -- Confidence metrics
  avg_confidence_score double precision,
  avg_confidence_correct double precision,
  avg_confidence_incorrect double precision,
  
  -- Confidence distribution
  low_confidence_count integer DEFAULT 0,
  medium_confidence_count integer DEFAULT 0,
  high_confidence_count integer DEFAULT 0,
  
  -- Drift indicators
  drift_score double precision,
  drift_severity drift_severity DEFAULT 'none',
  
  -- Comparison to baseline
  baseline_accuracy double precision,
  accuracy_drift double precision,
  
  -- Category-specific performance
  category_performance jsonb DEFAULT '{}',
  worst_categories jsonb DEFAULT '[]',
  
  -- Statistical measures
  prediction_variance double precision,
  confidence_variance double precision,
  
  -- Metadata
  metadata jsonb DEFAULT '{"dataQuality":"good","missingLabels":0}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Model Training History table
-- Tracks retraining events and results
CREATE TABLE model_training_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  
  -- Model information
  model_version text NOT NULL,
  model_type text NOT NULL,
  previous_version text,
  
  -- Training trigger
  trigger_reason text NOT NULL,
  drift_score_trigger double precision,
  
  -- Training data
  training_data_count integer NOT NULL,
  validation_data_count integer,
  
  -- Training results
  training_accuracy double precision,
  validation_accuracy double precision,
  test_accuracy double precision,
  
  -- Performance comparison
  pre_training_accuracy double precision,
  post_training_accuracy double precision,
  accuracy_improvement double precision,
  
  -- Training metrics
  training_duration_ms integer,
  epochs integer,
  learning_rate double precision,
  
  -- Status
  status model_status DEFAULT 'training' NOT NULL,
  error_message text,
  
  -- Deployment
  deployed_at timestamp,
  is_current_model boolean DEFAULT false,
  
  -- Metadata
  hyperparameters jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{"categoryCount":0,"featureCount":0}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Categorization Feedback table
-- User feedback for model improvement
CREATE TABLE categorization_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prediction_id uuid NOT NULL REFERENCES categorization_predictions(id) ON DELETE CASCADE,
  
  -- Feedback type
  feedback_type text NOT NULL,
  
  -- Original vs corrected
  original_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  corrected_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  
  -- User input
  user_comment text,
  confidence_rating integer,
  
  -- Usage in training
  used_in_training boolean DEFAULT false,
  training_batch_id uuid,
  
  metadata jsonb DEFAULT '{}',
  
  created_at timestamp DEFAULT now()
);

-- Drift Detection Config table
-- Per-tenant drift detection settings
CREATE TABLE drift_detection_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  
  -- Thresholds
  drift_threshold double precision DEFAULT 0.15 NOT NULL,
  retrain_threshold double precision DEFAULT 0.20 NOT NULL,
  min_predictions_for_drift integer DEFAULT 50 NOT NULL,
  
  -- Monitoring windows
  monitoring_window_days integer DEFAULT 7 NOT NULL,
  comparison_baseline_days integer DEFAULT 30 NOT NULL,
  
  -- Confidence thresholds
  low_confidence_threshold double precision DEFAULT 0.5,
  high_confidence_threshold double precision DEFAULT 0.75,
  
  -- Auto-retraining
  auto_retrain_enabled boolean DEFAULT true,
  min_training_data_size integer DEFAULT 100,
  max_retraining_frequency_days integer DEFAULT 7,
  
  -- Notifications
  notify_on_drift boolean DEFAULT true,
  notify_on_retrain boolean DEFAULT true,
  notification_channels jsonb DEFAULT '["email","in-app"]',
  
  -- Advanced settings
  enable_category_specific_drift boolean DEFAULT true,
  enable_confidence_calibration boolean DEFAULT true,
  
  is_active boolean DEFAULT true,
  
  metadata jsonb DEFAULT '{}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Drift Alerts table
-- Notifications when drift is detected
CREATE TABLE drift_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  
  -- Alert details
  alert_type text NOT NULL,
  severity drift_severity NOT NULL,
  
  -- Metrics
  current_accuracy double precision,
  baseline_accuracy double precision,
  drift_score double precision,
  
  -- Model info
  model_version text,
  affected_categories jsonb DEFAULT '[]',
  
  -- Message
  message text,
  recommendation text,
  
  -- Action taken
  action_required text,
  action_taken text,
  action_taken_at timestamp,
  
  -- Status
  is_active boolean DEFAULT true,
  is_dismissed boolean DEFAULT false,
  dismissed_at timestamp,
  
  -- Notification
  notification_sent boolean DEFAULT false,
  sent_at timestamp,
  
  metadata jsonb DEFAULT '{}',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes for performance optimization

-- Categorization Predictions indexes
CREATE INDEX idx_predictions_tenant_user ON categorization_predictions(tenant_id, user_id);
CREATE INDEX idx_predictions_expense ON categorization_predictions(expense_id);
CREATE INDEX idx_predictions_model_version ON categorization_predictions(model_version);
CREATE INDEX idx_predictions_confidence ON categorization_predictions(confidence_score);
CREATE INDEX idx_predictions_corrected ON categorization_predictions(user_corrected) WHERE user_corrected = true;
CREATE INDEX idx_predictions_created ON categorization_predictions(created_at DESC);

-- Model Drift Metrics indexes
CREATE INDEX idx_drift_metrics_tenant ON model_drift_metrics(tenant_id);
CREATE INDEX idx_drift_metrics_period ON model_drift_metrics(period_start, period_end);
CREATE INDEX idx_drift_metrics_model ON model_drift_metrics(model_version);
CREATE INDEX idx_drift_metrics_severity ON model_drift_metrics(drift_severity) WHERE drift_severity != 'none';
CREATE INDEX idx_drift_metrics_accuracy ON model_drift_metrics(accuracy);

-- Model Training History indexes
CREATE INDEX idx_training_history_tenant ON model_training_history(tenant_id);
CREATE INDEX idx_training_history_model ON model_training_history(model_version);
CREATE INDEX idx_training_history_current ON model_training_history(is_current_model) WHERE is_current_model = true;
CREATE INDEX idx_training_history_status ON model_training_history(status);
CREATE INDEX idx_training_history_created ON model_training_history(created_at DESC);

-- Categorization Feedback indexes
CREATE INDEX idx_feedback_tenant_user ON categorization_feedback(tenant_id, user_id);
CREATE INDEX idx_feedback_prediction ON categorization_feedback(prediction_id);
CREATE INDEX idx_feedback_type ON categorization_feedback(feedback_type);
CREATE INDEX idx_feedback_training ON categorization_feedback(used_in_training);

-- Drift Detection Config indexes
CREATE INDEX idx_drift_config_tenant ON drift_detection_config(tenant_id);
CREATE INDEX idx_drift_config_active ON drift_detection_config(is_active) WHERE is_active = true;

-- Drift Alerts indexes
CREATE INDEX idx_drift_alerts_tenant_user ON drift_alerts(tenant_id, user_id);
CREATE INDEX idx_drift_alerts_severity ON drift_alerts(severity);
CREATE INDEX idx_drift_alerts_active ON drift_alerts(is_active) WHERE is_active = true AND is_dismissed = false;
CREATE INDEX idx_drift_alerts_type ON drift_alerts(alert_type);

-- Composite indexes for common queries
CREATE INDEX idx_predictions_validation ON categorization_predictions(tenant_id, model_version, was_correct, created_at DESC);
CREATE INDEX idx_drift_metrics_lookup ON model_drift_metrics(tenant_id, model_version, period_start DESC);

-- Add comments for documentation
COMMENT ON TABLE categorization_predictions IS 'ML model predictions with confidence scores for drift detection and validation';
COMMENT ON TABLE model_drift_metrics IS 'Time-series model performance metrics to detect accuracy degradation';
COMMENT ON TABLE model_training_history IS 'Retraining events and results for model versioning';
COMMENT ON TABLE categorization_feedback IS 'User corrections and feedback for continuous model improvement';
COMMENT ON TABLE drift_detection_config IS 'Per-tenant configuration for drift detection and auto-retraining';
COMMENT ON TABLE drift_alerts IS 'Alerts when model drift or accuracy degradation is detected';

-- Create function to calculate drift score
CREATE OR REPLACE FUNCTION calculate_drift_score(
  p_current_accuracy double precision,
  p_baseline_accuracy double precision,
  p_confidence_variance double precision,
  p_user_correction_rate double precision
)
RETURNS double precision AS $$
DECLARE
  v_accuracy_drift double precision;
  v_drift_score double precision;
BEGIN
  -- Calculate accuracy drift (normalized)
  v_accuracy_drift = GREATEST(0, (p_baseline_accuracy - p_current_accuracy) / NULLIF(p_baseline_accuracy, 0));
  
  -- Weighted drift score combining multiple factors
  v_drift_score = 
    (0.5 * v_accuracy_drift) +  -- 50% weight on accuracy drop
    (0.3 * LEAST(1.0, p_user_correction_rate)) +  -- 30% weight on user corrections
    (0.2 * LEAST(1.0, p_confidence_variance));  -- 20% weight on confidence variance
  
  RETURN v_drift_score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to determine drift severity
CREATE OR REPLACE FUNCTION determine_drift_severity(p_drift_score double precision)
RETURNS drift_severity AS $$
BEGIN
  IF p_drift_score >= 0.40 THEN
    RETURN 'critical';
  ELSIF p_drift_score >= 0.25 THEN
    RETURN 'high';
  ELSIF p_drift_score >= 0.15 THEN
    RETURN 'medium';
  ELSIF p_drift_score >= 0.05 THEN
    RETURN 'low';
  ELSE
    RETURN 'none';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to update prediction accuracy when user corrects
CREATE OR REPLACE FUNCTION update_prediction_accuracy()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark prediction as user-corrected
  UPDATE categorization_predictions
  SET 
    user_corrected = true,
    corrected_at = now(),
    actual_category_id = NEW.corrected_category_id,
    was_correct = (predicted_category_id = NEW.corrected_category_id),
    updated_at = now()
  WHERE id = NEW.prediction_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prediction_accuracy
AFTER INSERT ON categorization_feedback
FOR EACH ROW
WHEN (NEW.feedback_type = 'correction')
EXECUTE FUNCTION update_prediction_accuracy();

-- Create view for model performance summary
CREATE VIEW v_model_performance_summary AS
SELECT 
  tenant_id,
  model_version,
  model_type,
  COUNT(*) as total_predictions,
  SUM(CASE WHEN was_correct = true THEN 1 ELSE 0 END) as correct_predictions,
  ROUND(AVG(CASE WHEN was_correct = true THEN 1 ELSE 0 END)::numeric, 4) as accuracy,
  ROUND(AVG(confidence_score)::numeric, 4) as avg_confidence,
  ROUND(AVG(CASE WHEN was_correct = true THEN confidence_score END)::numeric, 4) as avg_confidence_correct,
  ROUND(AVG(CASE WHEN was_correct = false THEN confidence_score END)::numeric, 4) as avg_confidence_incorrect,
  SUM(CASE WHEN user_corrected = true THEN 1 ELSE 0 END) as user_corrections,
  MAX(created_at) as last_prediction_at
FROM categorization_predictions
WHERE was_correct IS NOT NULL
GROUP BY tenant_id, model_version, model_type;

-- Create view for drift detection dashboard
CREATE VIEW v_drift_detection_dashboard AS
SELECT 
  m.tenant_id,
  m.model_version,
  m.drift_severity,
  m.drift_score,
  m.accuracy as current_accuracy,
  m.baseline_accuracy,
  m.accuracy_drift,
  m.total_predictions,
  m.user_corrected_count,
  m.period_start,
  m.period_end,
  t.status as training_status,
  t.post_training_accuracy as latest_training_accuracy,
  COUNT(a.id) as active_alerts
FROM model_drift_metrics m
LEFT JOIN model_training_history t ON 
  t.tenant_id = m.tenant_id AND 
  t.model_version = m.model_version AND 
  t.is_current_model = true
LEFT JOIN drift_alerts a ON 
  a.tenant_id = m.tenant_id AND 
  a.is_active = true AND 
  a.is_dismissed = false
WHERE m.period_end >= NOW() - INTERVAL '7 days'
GROUP BY m.id, m.tenant_id, m.model_version, m.drift_severity, m.drift_score, 
         m.accuracy, m.baseline_accuracy, m.accuracy_drift, m.total_predictions,
         m.user_corrected_count, m.period_start, m.period_end, t.status, t.post_training_accuracy;

COMMENT ON FUNCTION calculate_drift_score IS 'Calculates weighted drift score from accuracy drop, corrections, and confidence variance';
COMMENT ON FUNCTION determine_drift_severity IS 'Maps drift score to severity level (none/low/medium/high/critical)';
COMMENT ON VIEW v_model_performance_summary IS 'Aggregated model performance metrics per version';
COMMENT ON VIEW v_drift_detection_dashboard IS 'Real-time dashboard of drift metrics and alerts';
