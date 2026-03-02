// backend/db/schema-log-ingestion.js
// Issue #651: Log Ingestion Database Schema

import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './schema.js';

// Ingestion Performance Metrics - Track ingestion performance over time
export const ingestionMetrics = pgTable('ingestion_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    metricType: text('metric_type').notNull(), // queue_depth, processing_time, error_rate, throughput
    value: doublePrecision('value').notNull(),
    unit: text('unit').notNull(), // count, milliseconds, percentage, per_second
    timeBucket: timestamp('time_bucket').notNull(), // 5-minute buckets
    metadata: jsonb('metadata').default({}), // Additional context
    createdAt: timestamp('created_at').defaultNow(),
});

// Ingestion Alerts - System-generated alerts for ingestion issues
export const ingestionAlerts = pgTable('ingestion_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    alertType: text('alert_type').notNull(), // backpressure_activated, circuit_breaker_tripped, high_error_rate, queue_overflow
    severity: text('severity').notNull(), // low, medium, high, critical
    message: text('message').notNull(),
    data: jsonb('data').default({}), // Alert-specific data
    status: text('status').default('active'), // active, acknowledged, resolved
    acknowledgedBy: uuid('acknowledged_by'), // References users(id)
    acknowledgedAt: timestamp('acknowledged_at'),
    resolvedAt: timestamp('resolved_at'),
    autoResolve: boolean('auto_resolve').default(false), // Whether alert can auto-resolve
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Ingestion Configuration - Tenant-specific ingestion settings
export const ingestionConfigs = pgTable('ingestion_configs', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    configKey: text('config_key').notNull(), // rate_limit, batch_size, queue_size, etc.
    configValue: jsonb('config_value').notNull(),
    isActive: boolean('is_active').default(true),
    description: text('description'),
    createdBy: uuid('created_by'), // References users(id)
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Dead Letter Queue Items - Failed ingestion items for retry/analysis
export const deadLetterQueue = pgTable('dead_letter_queue', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    originalQueueItemId: text('original_queue_item_id'),
    logData: jsonb('log_data').notNull(),
    failureReason: text('failure_reason').notNull(),
    failureCode: text('failure_code'), // validation_error, db_error, timeout, etc.
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    nextRetryAt: timestamp('next_retry_at'),
    expiresAt: timestamp('expires_at'), // When to delete from DLQ
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const ingestionMetricsRelations = relations(ingestionMetrics, ({ one }) => ({
    tenant: one(tenants, {
        fields: [ingestionMetrics.tenantId],
        references: [tenants.id],
    }),
}));

export const ingestionAlertsRelations = relations(ingestionAlerts, ({ one }) => ({
    tenant: one(tenants, {
        fields: [ingestionAlerts.tenantId],
        references: [tenants.id],
    }),
    acknowledger: one(tenants, { // This should reference users, but using tenants for now
        fields: [ingestionAlerts.acknowledgedBy],
        references: [tenants.id],
    }),
}));

export const ingestionConfigsRelations = relations(ingestionConfigs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [ingestionConfigs.tenantId],
        references: [tenants.id],
    }),
    creator: one(tenants, { // This should reference users, but using tenants for now
        fields: [ingestionConfigs.createdBy],
        references: [tenants.id],
    }),
}));

export const deadLetterQueueRelations = relations(deadLetterQueue, ({ one }) => ({
    tenant: one(tenants, {
        fields: [deadLetterQueue.tenantId],
        references: [tenants.id],
    }),
}));