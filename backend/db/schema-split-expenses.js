// Split Expenses Schema Definitions
// Add these to schema.js before the Relations section

import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Import references (these will be merged into main schema.js)
// import { tenants, users, categories, expenses, sagaInstances, distributedTransactionLogs } from './schema'

// Shared Expenses Table
export const sharedExpenses = pgTable('shared_expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(), // Will reference tenants.id
    createdByUserId: uuid('created_by_user_id').notNull(), // Will reference users.id
    description: text('description').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD').notNull(),
    transactionDate: timestamp('transaction_date').defaultNow().notNull(),
    sagaInstanceId: uuid('saga_instance_id'), // Will reference sagaInstances.id
    distributedTxLogId: uuid('distributed_tx_log_id'), // Will reference distributedTransactionLogs.id
    idempotencyKey: text('idempotency_key').unique(),
    status: text('status').default('pending'),
    splitCount: integer('split_count').default(0),
    completedSplits: integer('completed_splits').default(0),
    failedSplits: integer('failed_splits').default(0),
    version: integer('version').default(1).notNull(),
    isConsistent: boolean('is_consistent').default(true),
    lastConsistencyCheck: timestamp('last_consistency_check'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Expense Splits Table
export const expenseSplits = pgTable('expense_splits', {
    id: uuid('id').defaultRandom().primaryKey(),
    sharedExpenseId: uuid('shared_expense_id').notNull(), // References sharedExpenses.id
    tenantId: uuid('tenant_id').notNull(), // References tenants.id
    userId: uuid('user_id').notNull(), // References users.id
    categoryId: uuid('category_id'), // References categories.id
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }),
    currency: text('currency').default('USD').notNull(),
    expenseId: uuid('expense_id').unique(), // References expenses.id
    operationKey: text('operation_key').unique(),
    distributedTxLogId: uuid('distributed_tx_log_id'), // References distributedTransactionLogs.id
    status: text('status').default('pending'),
    requiresCompensation: boolean('requires_compensation').default(false),
    compensatedAt: timestamp('compensated_at'),
    compensationReason: text('compensation_reason'),
    version: integer('version').default(1).notNull(),
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    lastError: text('last_error'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Category Locks Table
export const categoryLocks = pgTable('category_locks', {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id').notNull(), // References categories.id
    tenantId: uuid('tenant_id').notNull(), // References tenants.id
    lockKey: text('lock_key').notNull().unique(),
    operationType: text('operation_type').notNull(),
    acquiredBySessionId: text('acquired_by_session_id').notNull(),
    acquiredAt: timestamp('acquired_at').defaultNow(),
    timeoutAt: timestamp('timeout_at').notNull(),
    heartbeatAt: timestamp('heartbeat_at').defaultNow(),
    blockedByLockId: uuid('blocked_by_lock_id'), // References categoryLocks.id
    isDeadlockDetected: boolean('is_deadlock_detected').default(false),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Distributed Transaction Recovery Log
export const distributedTxRecoveryLog = pgTable('distributed_tx_recovery_log', {
    id: uuid('id').defaultRandom().primaryKey(),
    distributedTxLogId: uuid('distributed_tx_log_id').notNull(), // References distributedTransactionLogs.id
    attemptNumber: integer('attempt_number').notNull(),
    recoveryType: text('recovery_type').notNull(),
    recoveryStrategy: text('recovery_strategy').notNull(),
    status: text('status').default('pending'),
    errorMessage: text('error_message'),
    recoveryActionTaken: jsonb('recovery_action_taken'),
    initiatedAt: timestamp('initiated_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    nextRetryAt: timestamp('next_retry_at'),
    maxRetryAttempts: integer('max_retry_attempts').default(5),
    backoffMultiplier: numeric('backoff_multiplier', { precision: 3, scale: 2 }).default('2.0'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Consistency Checks Table
export const consistencyChecks = pgTable('consistency_checks', {
    id: uuid('id').defaultRandom().primaryKey(),
    checkType: text('check_type').notNull(),
    tenantId: uuid('tenant_id'),
    entityId: uuid('entity_id'),
    entityType: text('entity_type'),
    expectedState: jsonb('expected_state').notNull(),
    actualState: jsonb('actual_state').notNull(),
    mismatches: jsonb('mismatches').default([]),
    mismatchCount: integer('mismatch_count').default(0),
    status: text('status').default('detected'),
    resolutionStrategy: text('resolution_strategy'),
    resolvedAt: timestamp('resolved_at'),
    resolutionDetails: jsonb('resolution_details'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations (add to schema.js relations section)
export const sharedExpensesRelations = relations(sharedExpenses, ({ one, many }) => ({
    tenant: one(null, {
        fields: [sharedExpenses.tenantId],
        references: [null],
    }),
    createdBy: one(null, {
        fields: [sharedExpenses.createdByUserId],
        references: [null],
    }),
    sagaInstance: one(null, {
        fields: [sharedExpenses.sagaInstanceId],
        references: [null],
    }),
    distributedTxLog: one(null, {
        fields: [sharedExpenses.distributedTxLogId],
        references: [null],
    }),
    expenseSplits: many(null),
}));

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
    sharedExpense: one(null, {
        fields: [expenseSplits.sharedExpenseId],
        references: [null],
    }),
    tenant: one(null, {
        fields: [expenseSplits.tenantId],
        references: [null],
    }),
    user: one(null, {
        fields: [expenseSplits.userId],
        references: [null],
    }),
    category: one(null, {
        fields: [expenseSplits.categoryId],
        references: [null],
    }),
    expense: one(null, {
        fields: [expenseSplits.expenseId],
        references: [null],
    }),
    distributedTxLog: one(null, {
        fields: [expenseSplits.distributedTxLogId],
        references: [null],
    }),
}));

export const categoryLocksRelations = relations(categoryLocks, ({ one, many }) => ({
    category: one(null, {
        fields: [categoryLocks.categoryId],
        references: [null],
    }),
    tenant: one(null, {
        fields: [categoryLocks.tenantId],
        references: [null],
    }),
    blockedByLock: one(null, {
        fields: [categoryLocks.blockedByLockId],
        references: [null],
    }),
    blockingLocks: many(null),
}));

export const distributedTxRecoveryLogRelations = relations(distributedTxRecoveryLog, ({ one }) => ({
    distributedTxLog: one(null, {
        fields: [distributedTxRecoveryLog.distributedTxLogId],
        references: [null],
    }),
}));

export const consistencyChecksRelations = relations(consistencyChecks, ({ one }) => ({
    tenant: one(null, {
        fields: [consistencyChecks.tenantId],
        references: [null],
    }),
}));
