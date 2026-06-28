-- Migration: Log Redaction Rules
-- Issue #650: Fine-Grained Log Redaction Engine
-- Description: Add table for configurable field-level redaction rules for PII protection

-- Log Redaction Rules: Configurable field-level redaction for PII protection
CREATE TABLE IF NOT EXISTS log_redaction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    field_path TEXT NOT NULL, -- JSON path to the field (e.g., 'user.email', 'request.headers.authorization')
    redaction_type TEXT NOT NULL CHECK (redaction_type IN ('mask', 'hash', 'tokenize', 'remove')),
    field_type TEXT CHECK (field_type IN ('email', 'phone', 'ssn', 'credit_card', 'ip_address', 'name', 'address', 'custom')),
    pattern TEXT, -- Optional regex pattern for custom field detection
    priority INTEGER DEFAULT 50 CHECK (priority >= 0 AND priority <= 100), -- 0-100, higher priority rules are applied first
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_log_redaction_rules_tenant_id ON log_redaction_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_log_redaction_rules_field_path ON log_redaction_rules(field_path);
CREATE INDEX IF NOT EXISTS idx_log_redaction_rules_priority ON log_redaction_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_log_redaction_rules_active ON log_redaction_rules(is_active) WHERE is_active = TRUE;

-- Insert default redaction rules for common PII fields
INSERT INTO log_redaction_rules (tenant_id, field_path, redaction_type, field_type, priority, description, is_active)
SELECT
    t.id as tenant_id,
    unnest(ARRAY[
        'user.email',
        'user.phone',
        'user.ssn',
        'user.socialSecurityNumber',
        'user.creditCard',
        'user.cardNumber',
        'request.headers.authorization',
        'request.headers.x-api-key',
        'request.body.password',
        'request.body.token',
        'request.body.apiKey',
        'response.body.accessToken',
        'response.body.refreshToken'
    ]) as field_path,
    CASE
        WHEN field_path LIKE '%email%' THEN 'mask'
        WHEN field_path LIKE '%phone%' THEN 'mask'
        WHEN field_path LIKE '%ssn%' OR field_path LIKE '%socialSecurity%' THEN 'hash'
        WHEN field_path LIKE '%credit%' OR field_path LIKE '%card%' THEN 'tokenize'
        WHEN field_path LIKE '%password%' OR field_path LIKE '%token%' OR field_path LIKE '%key%' THEN 'remove'
        ELSE 'mask'
    END as redaction_type,
    CASE
        WHEN field_path LIKE '%email%' THEN 'email'
        WHEN field_path LIKE '%phone%' THEN 'phone'
        WHEN field_path LIKE '%ssn%' OR field_path LIKE '%socialSecurity%' THEN 'ssn'
        WHEN field_path LIKE '%credit%' OR field_path LIKE '%card%' THEN 'credit_card'
        WHEN field_path LIKE '%password%' THEN 'custom'
        WHEN field_path LIKE '%token%' OR field_path LIKE '%key%' THEN 'custom'
        ELSE 'custom'
    END as field_type,
    CASE
        WHEN field_path LIKE '%password%' OR field_path LIKE '%token%' OR field_path LIKE '%key%' THEN 90
        WHEN field_path LIKE '%ssn%' OR field_path LIKE '%socialSecurity%' THEN 85
        WHEN field_path LIKE '%credit%' OR field_path LIKE '%card%' THEN 80
        ELSE 50
    END as priority,
    CASE
        WHEN field_path LIKE '%email%' THEN 'Mask user email addresses'
        WHEN field_path LIKE '%phone%' THEN 'Mask user phone numbers'
        WHEN field_path LIKE '%ssn%' OR field_path LIKE '%socialSecurity%' THEN 'Hash Social Security Numbers'
        WHEN field_path LIKE '%credit%' OR field_path LIKE '%card%' THEN 'Tokenize credit card information'
        WHEN field_path LIKE '%password%' THEN 'Remove password fields'
        WHEN field_path LIKE '%token%' OR field_path LIKE '%key%' THEN 'Remove authentication tokens and API keys'
        ELSE 'General PII protection'
    END as description,
    TRUE as is_active
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT DO NOTHING;