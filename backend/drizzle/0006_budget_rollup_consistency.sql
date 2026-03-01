-- Migration: Budget Rollup Consistency with Aggregate Snapshots
-- Issue: #569
-- Prevents parent-child budget drift through bottom-up rollup computation and versioned snapshots

-- Category Budget Aggregate Snapshots - Immutable historical snapshots of rollup state
CREATE TABLE IF NOT EXISTS category_budget_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Snapshot metadata
    snapshot_version INTEGER NOT NULL, -- Version counter for the category's aggregates
    is_leaf BOOLEAN NOT NULL DEFAULT FALSE, -- True if category has no children
    
    -- Aggregate values (from leaf transactions)
    total_spent_cents INTEGER NOT NULL DEFAULT 0, -- Sum of all descendant expenses
    total_budgeted_cents INTEGER NOT NULL DEFAULT 0, -- Sum of immediate children's budgets
    child_count INTEGER NOT NULL DEFAULT 0, -- Number of direct children
    descendant_count INTEGER NOT NULL DEFAULT 0, -- Number of all descendants
    
    -- Aggregation metadata
    last_transaction_at TIMESTAMPTZ, -- Last expense/goal-contribution within subtree
    transaction_count INTEGER NOT NULL DEFAULT 0, -- Total transactions in subtree
    
    -- Variance tracking for drift detection
    parent_expected_cents INTEGER, -- What parent thinks this category should contribute
    actual_sum_cents INTEGER NOT NULL, -- Sum of direct children's aggregates
    variance_cents INTEGER GENERATED ALWAYS AS (actual_sum_cents - total_spent_cents) STORED,
    variance_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN total_spent_cents = 0 THEN 0
            ELSE ROUND(((actual_sum_cents::NUMERIC - total_spent_cents::NUMERIC) / total_spent_cents::NUMERIC) * 100, 2)
        END
    ) STORED,
    
    -- Optimistic locking
    lock_version INTEGER NOT NULL DEFAULT 1,
    
    -- Reconciliation tracking
    last_reconciled_at TIMESTAMPTZ,
    is_dirty BOOLEAN NOT NULL DEFAULT TRUE, -- Needs recomputation
    
    -- Audit
    computed_by TEXT, -- 'system', 'scheduler', 'manual'
    computation_reason TEXT, -- 'leaf_update', 'scheduled_rollup', 'reconciliation_fix'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for budget aggregates
CREATE INDEX idx_aggregates_tenant ON category_budget_aggregates(tenant_id);
CREATE INDEX idx_aggregates_category ON category_budget_aggregates(category_id);
CREATE INDEX idx_aggregates_snapshot_version ON category_budget_aggregates(snapshot_version);
CREATE INDEX idx_aggregates_dirty ON category_budget_aggregates(is_dirty) WHERE is_dirty = TRUE;
CREATE INDEX idx_aggregates_variance ON category_budget_aggregates(variance_cents) WHERE variance_cents != 0;
CREATE INDEX idx_aggregates_leaf ON category_budget_aggregates(is_leaf);
CREATE INDEX idx_aggregates_last_reconciled ON category_budget_aggregates(last_reconciled_at);

-- Rollup Computation Queue - Track pending bottom-up rollups
CREATE TABLE IF NOT EXISTS budget_rollup_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Queue metadata
    trigger_type TEXT NOT NULL, -- 'expense_created', 'expense_updated', 'expense_deleted', 'manual_request', 'scheduled'
    trigger_context JSONB DEFAULT '{}'::jsonb, -- Details about what triggered the rollup
    
    -- Processing state
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    
    -- Error handling
    last_error TEXT,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    
    -- Computation chain
    parent_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    propagate_to_parent BOOLEAN NOT NULL DEFAULT TRUE, -- Continue rollup up the tree
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rollup queue
CREATE INDEX idx_rollup_queue_status ON budget_rollup_queue(status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_rollup_queue_tenant ON budget_rollup_queue(tenant_id);
CREATE INDEX idx_rollup_queue_category ON budget_rollup_queue(category_id);
CREATE INDEX idx_rollup_queue_next_retry ON budget_rollup_queue(next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_rollup_queue_trigger ON budget_rollup_queue(trigger_type);

-- Reconciliation Audit Trail - Track all reconciliation operations
CREATE TABLE IF NOT EXISTS budget_reconciliation_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Reconciliation details
    reconciliation_type TEXT NOT NULL, -- 'full_tree', 'single_category', 'variance_correction', 'parent_child_sync'
    source_system TEXT, -- 'scheduled_job', 'api_request', 'manual_admin'
    
    -- Before state
    previous_total_spent_cents INTEGER NOT NULL,
    previous_total_budgeted_cents INTEGER NOT NULL,
    previous_variance_cents INTEGER,
    
    -- After state
    new_total_spent_cents INTEGER NOT NULL,
    new_total_budgeted_cents INTEGER NOT NULL,
    new_variance_cents INTEGER,
    
    -- Actual leaf sum (source of truth)
    leaf_transaction_sum_cents INTEGER NOT NULL,
    leaf_transaction_count INTEGER NOT NULL,
    
    -- Correction applied
    correction_amount_cents INTEGER GENERATED ALWAYS AS (new_total_spent_cents - previous_total_spent_cents) STORED,
    correction_percentage NUMERIC(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN previous_total_spent_cents = 0 THEN 0
            ELSE ROUND(((new_total_spent_cents::NUMERIC - previous_total_spent_cents::NUMERIC) / previous_total_spent_cents::NUMERIC) * 100, 2)
        END
    ) STORED,
    
    -- Drift context
    root_cause TEXT, -- 'concurrent_update', 'missing_rollup', 'transaction_not_counted', 'version_conflict'
    affected_ancestor_count INTEGER DEFAULT 0, -- How many ancestors were updated
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for reconciliation audit
CREATE INDEX idx_reconciliation_tenant ON budget_reconciliation_audit(tenant_id);
CREATE INDEX idx_reconciliation_category ON budget_reconciliation_audit(category_id);
CREATE INDEX idx_reconciliation_type ON budget_reconciliation_audit(reconciliation_type);
CREATE INDEX idx_reconciliation_created ON budget_reconciliation_audit(created_at DESC);
CREATE INDEX idx_reconciliation_with_correction ON budget_reconciliation_audit(correction_amount_cents) WHERE correction_amount_cents != 0;

-- Category Tree Path Materialization - For efficient ancestor queries
CREATE TABLE IF NOT EXISTS category_tree_paths (
    ancestor_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    descendant_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    depth INTEGER NOT NULL DEFAULT 0, -- 0 = same node, 1 = parent, 2 = grandparent, etc.
    
    PRIMARY KEY (ancestor_id, descendant_id),
    CHECK (depth >= 0)
);

-- Indexes for tree paths
CREATE INDEX idx_tree_paths_descendant ON category_tree_paths(descendant_id);
CREATE INDEX idx_tree_paths_depth ON category_tree_paths(depth);

-- Helper function: Recompute category budget rollups bottom-up
CREATE OR REPLACE FUNCTION recompute_budget_rollups(
    p_category_id UUID,
    p_tenant_id UUID,
    p_reason TEXT DEFAULT 'manual'
) RETURNS TABLE(
    category_id UUID,
    computed_total_spent_cents INTEGER,
    computed_total_budgeted_cents INTEGER,
    parent_category_id UUID
) AS $$
DECLARE
    v_category RECORD;
    v_parent_id UUID;
    v_is_leaf BOOLEAN;
    v_child_spent INTEGER;
    v_child_budgeted INTEGER;
    v_descendant_count INTEGER;
    v_transaction_count INTEGER;
    v_last_transaction_at TIMESTAMPTZ;
BEGIN
    -- Get category details
    SELECT id, parent_category_id INTO v_category 
    FROM categories 
    WHERE id = p_category_id AND tenant_id = p_tenant_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Category % not found in tenant %', p_category_id, p_tenant_id;
    END IF;
    
    -- Determine if leaf (no children)
    v_is_leaf := NOT EXISTS(
        SELECT 1 FROM categories 
        WHERE parent_category_id = p_category_id AND tenant_id = p_tenant_id
    );
    
    -- Calculate totals based on leaf status
    IF v_is_leaf THEN
        -- Leaf node: sum transactions directly
        SELECT 
            COALESCE(SUM((amount * 100)::INTEGER), 0),
            MAX(date),
            COUNT(*)
        INTO v_child_spent, v_last_transaction_at, v_transaction_count
        FROM expenses 
        WHERE category_id = p_category_id AND tenant_id = p_tenant_id;
        
        v_child_budgeted := COALESCE(((categories.budget->>'monthly')::NUMERIC * 100)::INTEGER, 0)
            FROM categories WHERE id = p_category_id;
    ELSE
        -- Non-leaf: sum children's aggregates
        SELECT 
            COALESCE(SUM(total_spent_cents), 0),
            COALESCE(SUM(total_budgeted_cents), 0),
            MAX(last_transaction_at),
            COALESCE(SUM(transaction_count), 0),
            COUNT(*)
        INTO v_child_spent, v_child_budgeted, v_last_transaction_at, v_transaction_count, v_descendant_count
        FROM category_budget_aggregates
        WHERE category_id IN (
            SELECT id FROM categories 
            WHERE parent_category_id = p_category_id AND tenant_id = p_tenant_id
        );
    END IF;
    
    -- Update or insert aggregate snapshot
    INSERT INTO category_budget_aggregates (
        tenant_id, category_id, snapshot_version, is_leaf,
        total_spent_cents, total_budgeted_cents, child_count, descendant_count,
        last_transaction_at, transaction_count, computed_by, computation_reason,
        lock_version
    ) VALUES (
        p_tenant_id, p_category_id, 1, v_is_leaf,
        v_child_spent, v_child_budgeted, CASE WHEN v_is_leaf THEN 0 ELSE v_descendant_count END, v_descendant_count,
        v_last_transaction_at, v_transaction_count, 'system', p_reason,
        1
    )
    ON CONFLICT (category_id) DO UPDATE SET
        snapshot_version = category_budget_aggregates.snapshot_version + 1,
        total_spent_cents = EXCLUDED.total_spent_cents,
        total_budgeted_cents = EXCLUDED.total_budgeted_cents,
        child_count = EXCLUDED.child_count,
        descendant_count = EXCLUDED.descendant_count,
        last_transaction_at = EXCLUDED.last_transaction_at,
        transaction_count = EXCLUDED.transaction_count,
        lock_version = category_budget_aggregates.lock_version + 1,
        is_dirty = FALSE,
        updated_at = NOW()
    WHERE category_budget_aggregates.lock_version = (
        SELECT lock_version FROM category_budget_aggregates WHERE category_id = p_category_id
    );
    
    RETURN QUERY
    SELECT 
        p_category_id,
        v_child_spent,
        v_child_budgeted,
        v_category.parent_category_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Cascade rollup to ancestors
CREATE OR REPLACE FUNCTION cascade_budget_rollup_to_ancestors(
    p_category_id UUID,
    p_tenant_id UUID
) RETURNS INTEGER AS $$
DECLARE
    v_current_id UUID;
    v_ancestor_id UUID;
    v_updated_count INTEGER := 0;
    v_ancestor_cursor CURSOR FOR
        SELECT ancestor_id FROM category_tree_paths 
        WHERE descendant_id = p_category_id 
          AND depth > 0 
        ORDER BY depth DESC;
BEGIN
    OPEN v_ancestor_cursor;
    LOOP
        FETCH v_ancestor_cursor INTO v_ancestor_id;
        EXIT WHEN NOT FOUND;
        
        PERFORM recompute_budget_rollups(v_ancestor_id, p_tenant_id, 'cascaded_from_child');
        v_updated_count := v_updated_count + 1;
    END LOOP;
    CLOSE v_ancestor_cursor;
    
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Detect budget variance across tree
CREATE OR REPLACE FUNCTION detect_budget_variance(
    p_tenant_id UUID,
    p_variance_threshold_percent NUMERIC DEFAULT 5.0
) RETURNS TABLE(
    category_id UUID,
    category_name TEXT,
    variance_cents INTEGER,
    variance_percentage NUMERIC,
    severity TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cba.category_id,
        c.name,
        cba.variance_cents,
        cba.variance_percentage,
        CASE 
            WHEN ABS(cba.variance_percentage) >= 20 THEN 'critical'
            WHEN ABS(cba.variance_percentage) >= 10 THEN 'high'
            WHEN ABS(cba.variance_percentage) >= 5 THEN 'medium'
            ELSE 'low'
        END
    FROM category_budget_aggregates cba
    JOIN categories c ON c.id = cba.category_id
    WHERE cba.tenant_id = p_tenant_id
      AND ABS(cba.variance_percentage) >= p_variance_threshold_percent
    ORDER BY ABS(cba.variance_percentage) DESC;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Mark categories as dirty (need recomputation)
CREATE OR REPLACE FUNCTION mark_category_dirty(
    p_category_id UUID,
    p_tenant_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE category_budget_aggregates
    SET is_dirty = TRUE, updated_at = NOW()
    WHERE category_id = p_category_id AND tenant_id = p_tenant_id;
    
    -- Also mark ancestors as dirty
    UPDATE category_budget_aggregates
    SET is_dirty = TRUE, updated_at = NOW()
    WHERE category_id IN (
        SELECT ancestor_id FROM category_tree_paths
        WHERE descendant_id = p_category_id AND depth > 0
    ) AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: When expense changes, mark affected categories as dirty
CREATE OR REPLACE FUNCTION trigger_expense_change_mark_dirty() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
        PERFORM mark_category_dirty(
            COALESCE(NEW.category_id, OLD.category_id),
            COALESCE(NEW.tenant_id, OLD.tenant_id)
        );
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_expense_marks_category_dirty
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION trigger_expense_change_mark_dirty();

-- Views for monitoring
CREATE OR REPLACE VIEW v_budget_rollup_status AS
SELECT 
    cba.tenant_id,
    cba.category_id,
    c.name,
    cba.is_leaf,
    cba.total_spent_cents,
    cba.total_budgeted_cents,
    cba.variance_cents,
    cba.variance_percentage,
    cba.is_dirty,
    cba.last_reconciled_at,
    CASE 
        WHEN cba.variance_percentage = 0 THEN 'consistent'
        WHEN ABS(cba.variance_percentage) < 5 THEN 'minor_drift'
        WHEN ABS(cba.variance_percentage) < 20 THEN 'significant_drift'
        ELSE 'critical_drift'
    END AS drift_status,
    CASE 
        WHEN cba.is_dirty THEN 'pending'
        WHEN cba.last_reconciled_at < NOW() - INTERVAL '1 day' THEN 'stale'
        ELSE 'current'
    END AS freshness
FROM category_budget_aggregates cba
JOIN categories c ON c.id = cba.category_id
ORDER BY ABS(cba.variance_percentage) DESC;

CREATE OR REPLACE VIEW v_rollup_queue_backlog AS
SELECT 
    tenant_id,
    status,
    trigger_type,
    COUNT(*) AS pending_count,
    MAX(created_at) AS oldest_pending
FROM budget_rollup_queue
GROUP BY tenant_id, status, trigger_type
ORDER BY oldest_pending DESC;

-- Grants
GRANT SELECT, INSERT, UPDATE ON category_budget_aggregates TO authenticated;
GRANT SELECT ON budget_rollup_queue TO authenticated;
GRANT SELECT ON budget_reconciliation_audit TO authenticated;
GRANT SELECT ON category_tree_paths TO authenticated;
GRANT SELECT ON v_budget_rollup_status TO authenticated;
GRANT SELECT ON v_rollup_queue_backlog TO authenticated;

-- Comments
COMMENT ON TABLE category_budget_aggregates IS 'Immutable snapshots of budget rollup state with versioning and drift detection';
COMMENT ON TABLE budget_rollup_queue IS 'Queue for pending bottom-up budget rollup computations';
COMMENT ON TABLE budget_reconciliation_audit IS 'Audit trail for all budget reconciliation operations';
COMMENT ON TABLE category_tree_paths IS 'Materialized path for efficient ancestor/descendant queries';
COMMENT ON FUNCTION recompute_budget_rollups IS 'Bottom-up computation of budget aggregates from leaf transactions';
COMMENT ON FUNCTION cascade_budget_rollup_to_ancestors IS 'Cascade rollup updates up the tree to maintain consistency';
