// Schema definitions for Recurring Payment Idempotency (Issue #568)
import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { tenants, goals, users } from './schema.js';

// Recurring Payment Executions - Deduplication table
export const recurringPaymentExecutions = pgTable('recurring_payment_executions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Billing Window - Defines unique execution period
    billingWindowStart: timestamp('billing_window_start').notNull(),
    billingWindowEnd: timestamp('billing_window_end').notNull(),
    
    // Source Event Tracking
    sourceEventId: uuid('source_event_id'),
    sourceEventType: text('source_event_type'), // 'scheduler', 'api_trigger', 'webhook', 'manual'
    
    // Execution Fingerprint - SHA-256 hash for replay detection
    executionFingerprint: text('execution_fingerprint').notNull(),
    
    // Execution Status
    status: text('status').notNull().default('pending'), // pending, executing, completed, failed, dead_letter
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    
    // Contribution Details
    contributionAmountCents: integer('contribution_amount_cents').notNull(),
    contributionCurrency: text('contribution_currency').notNull().default('USD'),
    contributionLineItemId: uuid('contribution_line_item_id'),
    
    // Replay-safe Response Storage
    responseCode: integer('response_code'),
    responseBody: jsonb('response_body'),
    
    // Scheduling Metadata
    scheduledAt: timestamp('scheduled_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    failedAt: timestamp('failed_at'),
    nextRetryAt: timestamp('next_retry_at'),
    
    // Error Tracking
    lastError: text('last_error'),
    errorStacktrace: text('error_stacktrace'),
    failureReason: text('failure_reason'),
    
    // Dead-letter Handling
    movedToDlqAt: timestamp('moved_to_dlq_at'),
    dlqReason: text('dlq_reason'),
    dlqMetadata: jsonb('dlq_metadata').default({}),
    
    // Audit Trail
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Dead Letter Queue - Permanently failed payments
export const recurringPaymentDeadLetters = pgTable('recurring_payment_dead_letters', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    executionId: uuid('execution_id').references(() => recurringPaymentExecutions.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Failure Classification
    failureCategory: text('failure_category').notNull(), // 'transient_exhausted', 'permanent_error', 'validation_failed', 'business_logic_error'
    failureSeverity: text('failure_severity').notNull().default('medium'), // low, medium, high, critical
    
    // Failure Details
    totalRetryAttempts: integer('total_retry_attempts').notNull(),
    firstFailureAt: timestamp('first_failure_at').notNull(),
    lastFailureAt: timestamp('last_failure_at').notNull(),
    errorSummary: text('error_summary'),
    fullErrorLog: text('full_error_log'),
    
    // Context Snapshot for Replay
    originalPayload: jsonb('original_payload').notNull(),
    executionContext: jsonb('execution_context').default({}),
    
    // Resolution Tracking
    status: text('status').notNull().default('pending_review'), // pending_review, investigating, resolved, ignored
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNotes: text('resolution_notes'),
    resolvedAt: timestamp('resolved_at'),
    
    // Replay Tracking
    replayAttemptedAt: timestamp('replay_attempted_at'),
    replayCount: integer('replay_count').default(0),
    replaySuccess: boolean('replay_success'),
    
    // Alerting
    alertSent: boolean('alert_sent').default(false),
    alertSentAt: timestamp('alert_sent_at'),
    alertRecipients: jsonb('alert_recipients').default([]),
    
    // Audit
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Execution Fingerprint Cache - Fast replay detection
export const recurringPaymentFingerprints = pgTable('recurring_payment_fingerprints', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    
    // Fingerprint Details
    fingerprint: text('fingerprint').notNull().unique(),
    executionId: uuid('execution_id').references(() => recurringPaymentExecutions.id, { onDelete: 'cascade' }).notNull(),
    
    // Fast Response Replay
    cachedResponseCode: integer('cached_response_code'),
    cachedResponseBody: jsonb('cached_response_body'),
    
    // TTL Management
    createdAt: timestamp('created_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    hitCount: integer('hit_count').default(0),
    lastHitAt: timestamp('last_hit_at'),
});

// Scheduler Coordination Locks - Prevent duplicate scheduler runs
export const schedulerCoordinationLocks = pgTable('scheduler_coordination_locks', {
    lockName: text('lock_name').primaryKey(),
    holderInstanceId: text('holder_instance_id').notNull(),
    acquiredAt: timestamp('acquired_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    heartbeatAt: timestamp('heartbeat_at').notNull().defaultNow(),
    metadata: jsonb('metadata').default({}),
});
