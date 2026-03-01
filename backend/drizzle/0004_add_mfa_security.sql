-- Migration: Add Multi-Factor Authentication (MFA) support and Security Events
-- Description: Adds MFA fields to users table and creates security_events table for login tracking

-- Add MFA columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB DEFAULT '[]'::jsonb;

-- Create security_events table
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    location JSONB,
    device_info JSONB,
    status TEXT DEFAULT 'info',
    details JSONB DEFAULT '{}'::jsonb,
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON security_events(status);
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled);

-- Add comments to columns
COMMENT ON COLUMN users.mfa_enabled IS 'Whether MFA is enabled for this user';
COMMENT ON COLUMN users.mfa_secret IS 'Base32 encoded TOTP secret for MFA';
COMMENT ON COLUMN users.mfa_recovery_codes IS 'Array of hashed recovery codes for account recovery';
COMMENT ON TABLE security_events IS 'Stores security-related events like login attempts, MFA changes, and suspicious activity';
COMMENT ON COLUMN security_events.event_type IS 'Type of security event (login_success, login_failed, mfa_enabled, mfa_disabled, password_changed, suspicious_activity)';
COMMENT ON COLUMN security_events.status IS 'Severity level of event (info, warning, critical)';
