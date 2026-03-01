// Schema definitions for Budget Rollup Consistency (Issue #569)
import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, numeric } from 'drizzle-orm/pg-core';
import { tenants, categories } from './schema.js';

// Category Budget Aggregates - Immutable snapshots of rollup state
export const categoryBudgetAggregates = pgTable('category_budget_aggregates', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Snapshot metadata
    snapshotVersion: integer('snapshot_version').notNull(),
    isLeaf: boolean('is_leaf').notNull().default(false),
    
    // Aggregate values
    totalSpentCents: integer('total_spent_cents').notNull().default(0),
    totalBudgetedCents: integer('total_budgeted_cents').notNull().default(0),
    childCount: integer('child_count').notNull().default(0),
    descendantCount: integer('descendant_count').notNull().default(0),
    
    // Aggregation metadata
    lastTransactionAt: timestamp('last_transaction_at'),
    transactionCount: integer('transaction_count').notNull().default(0),
    
    // Variance tracking
    parentExpectedCents: integer('parent_expected_cents'),
    actualSumCents: integer('actual_sum_cents').notNull(),
    varianceCents: integer('variance_cents'),
    variancePercentage: numeric('variance_percentage', { precision: 5, scale: 2 }),
    
    // Optimistic locking
    lockVersion: integer('lock_version').notNull().default(1),
    
    // Reconciliation tracking
    lastReconciledAt: timestamp('last_reconciled_at'),
    isDirty: boolean('is_dirty').notNull().default(true),
    
    // Audit
    computedBy: text('computed_by'),
    computationReason: text('computation_reason'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Budget Rollup Queue - Track pending rollups
export const budgetRollupQueue = pgTable('budget_rollup_queue', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Queue metadata
    triggerType: text('trigger_type').notNull(),
    triggerContext: jsonb('trigger_context').default({}),
    
    // Processing state
    status: text('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    
    // Error handling
    lastError: text('last_error'),
    processingStartedAt: timestamp('processing_started_at'),
    processingCompletedAt: timestamp('processing_completed_at'),
    nextRetryAt: timestamp('next_retry_at'),
    
    // Computation chain
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'set null' }),
    propagateToParent: boolean('propagate_to_parent').notNull().default(true),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Reconciliation Audit Trail
export const budgetReconciliationAudit = pgTable('budget_reconciliation_audit', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Reconciliation details
    reconciliationType: text('reconciliation_type').notNull(),
    sourceSystem: text('source_system'),
    
    // Before state
    previousTotalSpentCents: integer('previous_total_spent_cents').notNull(),
    previousTotalBudgetedCents: integer('previous_total_budgeted_cents').notNull(),
    previousVarianceCents: integer('previous_variance_cents'),
    
    // After state
    newTotalSpentCents: integer('new_total_spent_cents').notNull(),
    newTotalBudgetedCents: integer('new_total_budgeted_cents').notNull(),
    newVarianceCents: integer('new_variance_cents'),
    
    // Source of truth
    leafTransactionSumCents: integer('leaf_transaction_sum_cents').notNull(),
    leafTransactionCount: integer('leaf_transaction_count').notNull(),
    
    // Correction applied
    correctionAmountCents: integer('correction_amount_cents'),
    
    // Drift context
    rootCause: text('root_cause'),
    affectedAncestorCount: integer('affected_ancestor_count').default(0),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Category Tree Paths - Materialized path for efficient queries
export const categoryTreePaths = pgTable('category_tree_paths', {
    ancestorId: uuid('ancestor_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    descendantId: uuid('descendant_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    depth: integer('depth').notNull().default(0),
    
    primaryKey: (table) => [table.ancestorId, table.descendantId],
});
