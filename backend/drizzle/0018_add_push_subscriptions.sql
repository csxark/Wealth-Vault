-- Migration: Add Push Subscriptions Table
-- Issue #558: Push Notifications System
-- Description: Adds push_subscriptions table for storing browser push notification subscriptions
--              Enables real-time notifications for budget alerts, goals, and security events

-- =============================================================================
-- Table: push_subscriptions
-- Stores browser push notification subscriptions for users
-- Uses Web Push API VAPID keys for secure push messaging
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Web Push API subscription details
    endpoint TEXT NOT NULL, -- Push service endpoint URL
    p256dh TEXT NOT NULL, -- P-256 elliptic curve Diffie-Hellman public key (base64url encoded)
    auth TEXT NOT NULL, -- Authentication secret (base64url encoded)

    -- Browser/device metadata
    user_agent TEXT, -- Browser and device information

    -- Subscription status
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = TRUE;

-- Unique constraint to prevent duplicate subscriptions for same user/endpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint ON push_subscriptions(user_id, endpoint);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_push_subscription_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscription_updated_at();

-- Comments for documentation
COMMENT ON TABLE push_subscriptions IS 'Browser push notification subscriptions for real-time alerts';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL provided by browser';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'P-256 ECDH public key for encryption';
COMMENT ON COLUMN push_subscriptions.auth IS 'Authentication secret for push service';
COMMENT ON COLUMN push_subscriptions.user_agent IS 'Browser/device information for debugging';