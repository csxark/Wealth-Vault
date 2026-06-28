-- Migration: Split Expenses with Distributed Transaction Support
-- Purpose: Handle shared/split expenses across multiple categories and tenants
--          with distributed transaction consistency and deadlock recovery

-- Shared Expenses Table
-- Represents an expense that needs to be split across multiple categories/users
CREATE TABLE IF NOT EXISTS shared_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Core shared expense metadata
    description TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency TEXT DEFAULT 'USD' NOT NULL,
    transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Distributed transaction tracking
    saga_instance_id UUID REFERENCES saga_instances(id) ON DELETE SET NULL,
    distributed_tx_log_id UUID REFERENCES distributed_transaction_logs(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE, -- For idempotent creation
    
    -- Status tracking
    status TEXT DEFAULT 'pending' NOT NULL,
    -- pending: awaiting split confirmation
    -- processing: splits being created
    -- completed: all splits created successfully
    -- failed: transaction failed, awaiting recovery
    -- compensated: rolled back due to error
    
    -- Split handling
    split_count INTEGER DEFAULT 0,
    completed_splits INTEGER DEFAULT 0,
    failed_splits INTEGER DEFAULT 0,
    
    -- Consistency tracking
    version INTEGER DEFAULT 1 NOT NULL, -- Optimistic locking
    is_consistent BOOLEAN DEFAULT TRUE,
    last_consistency_check TIMESTAMP,
    
    -- Financial metadata
    metadata JSONB DEFAULT '{
        "createdBy": "system",
        "participants": [],
        "notes": null,
        "tags": [],
        "attachments": []
    }',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_total_amount_positive CHECK (total_amount > 0),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'compensated'))
);

-- Expense Splits Table
-- Individual split entries for each category/user in a shared expense
CREATE TABLE IF NOT EXISTS expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_expense_id UUID NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- The user responsible for this split
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    
    -- Split amount calculation
    amount NUMERIC(12, 2) NOT NULL,
    percentage NUMERIC(5, 2), -- Alternative: percentage-based split
    currency TEXT DEFAULT 'USD' NOT NULL,
    
    -- The actual expense record created for this split
    expense_id UUID UNIQUE REFERENCES expenses(id) ON DELETE SET NULL,
    
    -- Distributed transaction tracking per split
    operation_key TEXT UNIQUE, -- Unique key for this split operation
    distributed_tx_log_id UUID REFERENCES distributed_transaction_logs(id) ON DELETE SET NULL,
    
    -- Status tracking
    status TEXT DEFAULT 'pending' NOT NULL,
    -- pending: waiting to be processed
    -- processing: expense creation in progress
    -- completed: expense created successfully
    -- failed: creation failed
    -- compensated: rolled back
    
    -- Compensation tracking (for saga rollback)
    requires_compensation BOOLEAN DEFAULT FALSE,
    compensated_at TIMESTAMP,
    compensation_reason TEXT,
    
    -- Consistency and recovery
    version INTEGER DEFAULT 1 NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_amount_positive CHECK (amount > 0),
    CONSTRAINT valid_split_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'compensated')),
    CONSTRAINT valid_percentage CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100))
);

-- Category Lock Registry Table
-- Track locks on category hierarchies during concurrent operations
CREATE TABLE IF NOT EXISTS category_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Lock information
    lock_key TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL,
    -- operation_type: 'read', 'write', 'hierarchy_update'
    
    -- Lock holder
    acquired_by_session_id TEXT NOT NULL,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Lock timeout
    timeout_at TIMESTAMP NOT NULL,
    heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Deadlock tracking
    blocked_by_lock_id UUID REFERENCES category_locks(id) ON DELETE SET NULL,
    is_deadlock_detected BOOLEAN DEFAULT FALSE,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Distributed Transaction Recovery Log Table
-- Track recovery attempts for failed distributed transactions
CREATE TABLE IF NOT EXISTS distributed_tx_recovery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributed_tx_log_id UUID NOT NULL REFERENCES distributed_transaction_logs(id) ON DELETE CASCADE,
    
    -- Recovery attempt details
    attempt_number INTEGER NOT NULL,
    recovery_type TEXT NOT NULL,
    -- recovery_type: 'automatic', 'manual', 'timeout_based'
    
    recovery_strategy TEXT NOT NULL,
    -- recovery_strategy: 'retry', 'compensate', 'ignore', 'escalate'
    
    status TEXT DEFAULT 'pending',
    -- pending: queued for recovery
    -- processing: recovery in progress
    -- succeeded: recovery was successful
    -- failed: recovery attempt failed
    
    error_message TEXT,
    recovery_action_taken JSONB,
    
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    next_retry_at TIMESTAMP,
    max_retry_attempts INTEGER DEFAULT 5,
    backoff_multiplier NUMERIC(3, 2) DEFAULT 2.0,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Eventual Consistency Checker Table
-- Track consistency checks and mismatches
CREATE TABLE IF NOT EXISTS consistency_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_type TEXT NOT NULL,
    -- check_type: 'shared_expense_totals', 'category_hierarchy', 'split_status_consistency'
    
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id UUID, -- The entity being checked (shared_expense_id, category_id, etc.)
    entity_type TEXT, -- Type of entity: 'shared_expense', 'category', 'expense_split'
    
    -- Expected vs actual state
    expected_state JSONB NOT NULL,
    actual_state JSONB NOT NULL,
    
    -- Mismatch details
    mismatches JSONB DEFAULT '[]',
    mismatch_count INTEGER DEFAULT 0,
    
    status TEXT DEFAULT 'detected',
    -- detected: inconsistency found
    -- investigating: being investigated
    -- resolved: corrected or explained
    -- unresolved: cannot be auto-resolved
    
    resolution_strategy TEXT,
    resolved_at TIMESTAMP,
    resolution_details JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_shared_expenses_tenant_id ON shared_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_status ON shared_expenses(status);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_saga_instance_id ON shared_expenses(saga_instance_id);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_created_by ON shared_expenses(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_idempotency_key ON shared_expenses(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_expense_splits_shared_expense_id ON expense_splits(shared_expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_id ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_status ON expense_splits(status);
CREATE INDEX IF NOT EXISTS idx_expense_splits_operation_key ON expense_splits(operation_key);
CREATE INDEX IF NOT EXISTS idx_expense_splits_category_id ON expense_splits(category_id);

CREATE INDEX IF NOT EXISTS idx_category_locks_category_id ON category_locks(category_id);
CREATE INDEX IF NOT EXISTS idx_category_locks_lock_key ON category_locks(lock_key);
CREATE INDEX IF NOT EXISTS idx_category_locks_timeout_at ON category_locks(timeout_at);
CREATE INDEX IF NOT EXISTS idx_category_locks_is_deadlock ON category_locks(is_deadlock_detected);

CREATE INDEX IF NOT EXISTS idx_recovery_log_tx_id ON distributed_tx_recovery_log(distributed_tx_log_id);
CREATE INDEX IF NOT EXISTS idx_recovery_log_status ON distributed_tx_recovery_log(status);
CREATE INDEX IF NOT EXISTS idx_recovery_log_created_at ON distributed_tx_recovery_log(created_at);

CREATE INDEX IF NOT EXISTS idx_consistency_checks_type ON consistency_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_consistency_checks_entity ON consistency_checks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_consistency_checks_status ON consistency_checks(status);
CREATE INDEX IF NOT EXISTS idx_consistency_checks_created_at ON consistency_checks(created_at DESC);

-- Constraint triggers for consistency (PostgreSQL specific)
-- Lock acquisition exclusivity - prevent conflicting locks
CREATE UNIQUE INDEX IF NOT EXISTS idx_exclusive_write_lock 
ON category_locks(category_id) 
WHERE operation_type = 'write' AND timeout_at > CURRENT_TIMESTAMP;

-- Function to clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM category_locks 
    WHERE timeout_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to detect deadlocks
CREATE OR REPLACE FUNCTION detect_deadlock(lock_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    visited_locks UUID[] := ARRAY[lock_id];
    current_lock UUID := lock_id;
    blocking_lock UUID;
BEGIN
    WHILE TRUE LOOP
        SELECT blocked_by_lock_id INTO blocking_lock
        FROM category_locks
        WHERE id = current_lock;
        
        IF blocking_lock IS NULL THEN
            RETURN FALSE;
        END IF;
        
        IF blocking_lock = ANY(visited_locks) THEN
            RETURN TRUE; -- Deadlock detected
        END IF;
        
        visited_locks := array_append(visited_locks, blocking_lock);
        current_lock := blocking_lock;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
