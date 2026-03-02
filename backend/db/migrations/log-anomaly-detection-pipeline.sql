-- Log Anomaly Detection Pipeline Migration (#630)
-- Creates tables and functions for real-time anomaly detection in audit logs

-- Anomaly Baselines Table
-- Stores statistical baselines for normal audit log behavior patterns
CREATE TABLE IF NOT EXISTS anomaly_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    baseline_data JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(tenant_id, is_active)
);

-- Anomaly Rules Table
-- Stores rule definitions for triggering on suspicious activities
CREATE TABLE IF NOT EXISTS anomaly_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('frequency', 'velocity', 'unusual_timing', 'geographic_anomaly', 'rare_action', 'session_anomaly', 'ip_anomaly', 'user_behavior')),
    conditions JSONB NOT NULL DEFAULT '{}',
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    threshold DECIMAL(10,4) NOT NULL,
    time_window INTEGER NOT NULL DEFAULT 300, -- seconds
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Anomaly Scores Table
-- Stores calculated anomaly scores for audit logs
CREATE TABLE IF NOT EXISTS anomaly_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    log_id UUID NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
    score DECIMAL(3,4) NOT NULL CHECK (score >= 0 AND score <= 1),
    confidence DECIMAL(3,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    algorithm_scores JSONB NOT NULL DEFAULT '{}',
    features JSONB NOT NULL DEFAULT '{}',
    triggered_rules INTEGER NOT NULL DEFAULT 0,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(log_id)
);

-- Anomaly Alerts Table
-- Stores generated alerts for detected anomalies
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    log_id UUID NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES anomaly_rules(id) ON DELETE SET NULL,
    score DECIMAL(3,4),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'resolved', 'dismissed')) DEFAULT 'active',
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Alert Channels Table
-- Stores alert delivery channel configurations
CREATE TABLE IF NOT EXISTS alert_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'slack', 'webhook', 'sms', 'database')),
    config JSONB NOT NULL DEFAULT '{}',
    severity_threshold VARCHAR(20) NOT NULL CHECK (severity_threshold IN ('low', 'medium', 'high', 'critical')) DEFAULT 'high',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Alert Escalations Table
-- Stores escalation rules for alerts
CREATE TABLE IF NOT EXISTS alert_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    escalation_delay INTEGER NOT NULL DEFAULT 3600, -- seconds
    max_escalations INTEGER NOT NULL DEFAULT 3,
    channels UUID[] NOT NULL DEFAULT '{}', -- Array of alert_channel IDs
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(severity)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_anomaly_baselines_tenant_active ON anomaly_baselines(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_anomaly_baselines_last_updated ON anomaly_baselines(last_updated);

CREATE INDEX IF NOT EXISTS idx_anomaly_rules_tenant_active ON anomaly_rules(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_anomaly_rules_type ON anomaly_rules(rule_type);

CREATE INDEX IF NOT EXISTS idx_anomaly_scores_tenant_log ON anomaly_scores(tenant_id, log_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_score ON anomaly_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_detected_at ON anomaly_scores(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_tenant_status ON anomaly_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_severity ON anomaly_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_created_at ON anomaly_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_log ON anomaly_alerts(log_id);

CREATE INDEX IF NOT EXISTS idx_alert_channels_type_active ON alert_channels(type, is_active);

-- Row Level Security Policies
ALTER TABLE anomaly_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation
CREATE POLICY anomaly_baselines_tenant_isolation ON anomaly_baselines
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

CREATE POLICY anomaly_rules_tenant_isolation ON anomaly_rules
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

CREATE POLICY anomaly_scores_tenant_isolation ON anomaly_scores
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

CREATE POLICY anomaly_alerts_tenant_isolation ON anomaly_alerts
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );

-- Functions for anomaly detection

-- Function to calculate anomaly score for a log entry
CREATE OR REPLACE FUNCTION calculate_anomaly_score(
    p_log_id UUID,
    p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE(
    score DECIMAL(3,4),
    confidence DECIMAL(3,4),
    severity VARCHAR(20)
) AS $$
DECLARE
    v_score DECIMAL(3,4) := 0.5;
    v_confidence DECIMAL(3,4) := 0.5;
    v_severity VARCHAR(20) := 'low';
BEGIN
    -- This is a placeholder - actual scoring is done by the AnomalyScoringEngine
    -- Return neutral values for now
    RETURN QUERY SELECT v_score, v_confidence, v_severity;
END;
$$ LANGUAGE plpgsql;

-- Function to check if log triggers any rules
CREATE OR REPLACE FUNCTION check_anomaly_rules(
    p_log_id UUID,
    p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE(
    rule_id UUID,
    rule_name VARCHAR(255),
    severity VARCHAR(20),
    triggered BOOLEAN
) AS $$
DECLARE
    v_rule RECORD;
BEGIN
    -- This is a placeholder - actual rule checking is done by the RuleBasedTriggerEngine
    FOR v_rule IN
        SELECT id, name, severity
        FROM anomaly_rules
        WHERE (tenant_id = p_tenant_id OR tenant_id IS NULL)
        AND is_active = true
    LOOP
        -- Placeholder logic - return false for all rules
        RETURN QUERY SELECT v_rule.id, v_rule.name, v_rule.severity, false::BOOLEAN;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get tenant anomaly statistics
CREATE OR REPLACE FUNCTION get_tenant_anomaly_stats(
    p_tenant_id UUID DEFAULT NULL,
    p_hours INTEGER DEFAULT 24
) RETURNS TABLE(
    total_logs BIGINT,
    anomalous_logs BIGINT,
    alerts_generated BIGINT,
    avg_score DECIMAL(5,4),
    max_score DECIMAL(3,4)
) AS $$
DECLARE
    v_start_time TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_time := NOW() - INTERVAL '1 hour' * p_hours;

    RETURN QUERY
    SELECT
        COUNT(DISTINCT al.id) as total_logs,
        COUNT(DISTINCT CASE WHEN ascore.score > 0.5 THEN ascore.log_id END) as anomalous_logs,
        COUNT(DISTINCT aa.id) as alerts_generated,
        ROUND(AVG(ascore.score)::DECIMAL, 4) as avg_score,
        MAX(ascore.score) as max_score
    FROM audit_logs al
    LEFT JOIN anomaly_scores ascore ON al.id = ascore.log_id
    LEFT JOIN anomaly_alerts aa ON al.id = aa.log_id
    WHERE (al.tenant_id = p_tenant_id OR (p_tenant_id IS NULL AND al.tenant_id IS NULL))
    AND al.created_at >= v_start_time;
END;
$$ LANGUAGE plpgsql;

-- Insert default anomaly rules
INSERT INTO anomaly_rules (name, description, rule_type, conditions, severity, threshold, time_window) VALUES
('High Frequency Actions', 'Detects unusually high frequency of the same action', 'frequency', '{"action": "*"}', 'high', 10, 300),
('Velocity Spike', 'Detects sudden spikes in user activity', 'velocity', '{"user_id": "*"}', 'high', 5, 60),
('Unusual Timing', 'Detects actions at unusual hours', 'unusual_timing', '{"hour_start": 2, "hour_end": 6}', 'medium', 0.1, 3600),
('Rare Actions', 'Detects very rare or unusual actions', 'rare_action', '{"min_frequency": 0.01}', 'medium', 0.01, 86400),
('New IP Address', 'Detects actions from previously unseen IP addresses', 'ip_anomaly', '{}', 'low', 1, 86400),
('Session Anomalies', 'Detects unusual session behavior', 'session_anomaly', '{"max_actions_per_minute": 10}', 'medium', 10, 300),
('Geographic Anomalies', 'Detects actions from unusual geographic locations', 'geographic_anomaly', '{}', 'medium', 1, 86400),
('User Behavior Changes', 'Detects significant changes in user behavior patterns', 'user_behavior', '{}', 'low', 0.1, 604800);

-- Insert default alert channels
INSERT INTO alert_channels (name, type, config, severity_threshold) VALUES
('Database Alerts', 'database', '{}', 'low'),
('Email Notifications', 'email', '{"recipients": ["security@wealthvault.com"]}', 'high'),
('Slack Security Channel', 'slack', '{"webhook_url": "https://hooks.slack.com/..."}', 'high'),
('Security Webhook', 'webhook', '{"url": "https://api.security.com/webhook"}', 'critical');

-- Insert default escalation rules
INSERT INTO alert_escalations (severity, escalation_delay, max_escalations, channels) VALUES
('low', 7200, 1, (SELECT array_agg(id) FROM alert_channels WHERE type IN ('database'))),
('medium', 3600, 2, (SELECT array_agg(id) FROM alert_channels WHERE type IN ('database', 'email'))),
('high', 1800, 3, (SELECT array_agg(id) FROM alert_channels WHERE type IN ('database', 'email', 'slack'))),
('critical', 300, 5, (SELECT array_agg(id) FROM alert_channels WHERE type IN ('database', 'email', 'slack', 'webhook')));

-- Create trigger to automatically publish audit logs to Redis for anomaly detection
CREATE OR REPLACE FUNCTION publish_audit_log_for_anomaly_detection()
RETURNS TRIGGER AS $$
BEGIN
    -- Publish to Redis channel for real-time processing
    -- Note: This requires the Redis pub/sub to be set up in the application
    -- The actual publishing is handled by the audit service

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on audit_logs table
DROP TRIGGER IF EXISTS audit_log_anomaly_trigger ON audit_logs;
CREATE TRIGGER audit_log_anomaly_trigger
    AFTER INSERT ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION publish_audit_log_for_anomaly_detection();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON anomaly_baselines TO wealthvault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON anomaly_rules TO wealthvault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON anomaly_scores TO wealthvault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON anomaly_alerts TO wealthvault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_channels TO wealthvault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_escalations TO wealthvault_app;

GRANT EXECUTE ON FUNCTION calculate_anomaly_score(UUID, UUID) TO wealthvault_app;
GRANT EXECUTE ON FUNCTION check_anomaly_rules(UUID, UUID) TO wealthvault_app;
GRANT EXECUTE ON FUNCTION get_tenant_anomaly_stats(UUID, INTEGER) TO wealthvault_app;</content>
<parameter name="filePath">c:\Users\Gupta\Downloads\Wealth-Vault\backend\db\migrations\log-anomaly-detection-pipeline.sql