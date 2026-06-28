-- Add version field to categories for optimistic locking
ALTER TABLE categories ADD COLUMN version integer DEFAULT 1 NOT NULL;

-- Create budget_alerts table
CREATE TABLE budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  threshold numeric(12, 2) NOT NULL,
  threshold_percentage numeric(5, 2) DEFAULT 80,
  scope text DEFAULT 'monthly',
  is_active boolean DEFAULT true,
  notification_channels jsonb DEFAULT '["email", "in-app"]',
  metadata jsonb DEFAULT '{"lastTriggeredAt":null,"triggerCount":0,"createdReason":"user_configured"}',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create budget_aggregates table (materialized view)
CREATE TABLE budget_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period text NOT NULL,
  period_start timestamp NOT NULL,
  period_end timestamp NOT NULL,
  total_spent numeric(12, 2) DEFAULT 0 NOT NULL,
  total_count integer DEFAULT 0 NOT NULL,
  average_transaction numeric(12, 2) DEFAULT 0,
  max_transaction numeric(12, 2) DEFAULT 0,
  min_transaction numeric(12, 2) DEFAULT 0,
  version integer DEFAULT 1 NOT NULL,
  isolation_level text DEFAULT 'read_committed',
  computed_at timestamp DEFAULT now(),
  refreshed_at timestamp,
  next_refresh_at timestamp,
  is_stale boolean DEFAULT false,
  metadata jsonb DEFAULT '{"sourceCount":0,"lastEventId":null}',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create alert_deduplication table
CREATE TABLE alert_deduplication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  budget_alert_id uuid NOT NULL REFERENCES budget_alerts(id) ON DELETE CASCADE,
  deduplication_key text NOT NULL,
  last_fired_at timestamp,
  fire_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  deduplication_window_ms integer DEFAULT 3600000,
  expires_at timestamp NOT NULL,
  metadata jsonb DEFAULT '{"reason":null,"suppressedCount":0}',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_budget_alerts_user_id ON budget_alerts(user_id);
CREATE INDEX idx_budget_alerts_category_id ON budget_alerts(category_id);
CREATE INDEX idx_budget_alerts_tenant_id ON budget_alerts(tenant_id);
CREATE INDEX idx_budget_alerts_is_active ON budget_alerts(is_active);

CREATE INDEX idx_budget_aggregates_user_id ON budget_aggregates(user_id);
CREATE INDEX idx_budget_aggregates_category_id ON budget_aggregates(category_id);
CREATE INDEX idx_budget_aggregates_period ON budget_aggregates(period);
CREATE INDEX idx_budget_aggregates_is_stale ON budget_aggregates(is_stale);
CREATE INDEX idx_budget_aggregates_next_refresh ON budget_aggregates(next_refresh_at);
CREATE UNIQUE INDEX idx_budget_aggregates_unique ON budget_aggregates(user_id, category_id, period);

CREATE INDEX idx_alert_deduplication_alert_id ON alert_deduplication(budget_alert_id);
CREATE INDEX idx_alert_deduplication_expires ON alert_deduplication(expires_at);
CREATE UNIQUE INDEX idx_alert_dedup_key ON alert_deduplication(budget_alert_id, deduplication_key);

-- Create indexes for cache invalidation patterns
CREATE INDEX idx_categories_version ON categories(id, version);

-- Add function to automatically refresh next_refresh_at
CREATE OR REPLACE FUNCTION set_next_refresh_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.next_refresh_at := NEW.refreshed_at + INTERVAL '10 minutes';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_next_refresh_at
BEFORE UPDATE ON budget_aggregates
FOR EACH ROW
WHEN (OLD.is_stale IS DISTINCT FROM NEW.is_stale OR OLD.refreshed_at IS DISTINCT FROM NEW.refreshed_at)
EXECUTE FUNCTION set_next_refresh_at();

-- Add function to clean expired deduplication entries
CREATE OR REPLACE FUNCTION cleanup_expired_dedups()
RETURNS void AS $$
BEGIN
  DELETE FROM alert_deduplication
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Create index on expiry time for cleanup queries
CREATE INDEX idx_alert_deduplication_expires_at ON alert_deduplication(expires_at);
