-- Migration: Goal Progress Precision and Audit Line Items
-- Eliminates floating-point drift by storing contributions in integer cents

CREATE TABLE IF NOT EXISTS goal_contribution_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    amount_cents INTEGER NOT NULL,
    raw_amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',

    entry_type TEXT NOT NULL DEFAULT 'contribution', -- contribution, adjustment, reconciliation
    description TEXT,

    idempotency_key TEXT UNIQUE,
    source_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,

    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT amount_cents_non_zero CHECK (amount_cents <> 0),
    CONSTRAINT raw_amount_non_zero CHECK (raw_amount <> 0)
);

CREATE INDEX IF NOT EXISTS idx_goal_line_items_goal_id ON goal_contribution_line_items(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_line_items_user_id ON goal_contribution_line_items(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_line_items_tenant_id ON goal_contribution_line_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goal_line_items_created_at ON goal_contribution_line_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_line_items_entry_type ON goal_contribution_line_items(entry_type);

-- Backfill from existing goals.current_amount so legacy data remains consistent.
-- Creates a single baseline entry for goals that already have progress.
INSERT INTO goal_contribution_line_items (
    goal_id,
    tenant_id,
    user_id,
    amount_cents,
    raw_amount,
    currency,
    entry_type,
    description,
    metadata
)
SELECT
    g.id,
    g.tenant_id,
    g.user_id,
    ROUND((COALESCE(g.current_amount, 0)::numeric) * 100)::integer,
    COALESCE(g.current_amount, 0)::numeric(12,2),
    COALESCE(g.currency, 'USD'),
    'reconciliation',
    'Baseline import from goals.current_amount',
    jsonb_build_object('source', 'migration_0005_backfill')
FROM goals g
WHERE COALESCE(g.current_amount, 0)::numeric <> 0
AND NOT EXISTS (
    SELECT 1 FROM goal_contribution_line_items li WHERE li.goal_id = g.id
);
