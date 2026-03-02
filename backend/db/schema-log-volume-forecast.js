// backend/db/schema-log-volume-forecast.js
// Issue #649: Log Volume Forecasting Database Schema

import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './schema.js';

// Log Volume Forecasts - Predictive modeling for log growth and capacity planning
export const logVolumeForecasts = pgTable('log_volume_forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    modelType: text('model_type').default('ensemble'), // linear_trend, exponential_smoothing, moving_average, ensemble
    forecastHorizonDays: integer('forecast_horizon_days').default(30),
    historicalDays: integer('historical_days').default(90),
    confidenceLevel: doublePrecision('confidence_level').default(0.95),
    predictions: jsonb('predictions').notNull(), // Array of daily predictions with dates, volumes, growth rates
    capacityPlanning: jsonb('capacity_planning').notNull(), // Storage needs, scaling recommendations
    dashboard: jsonb('dashboard').notNull(), // Visualization data for frontend
    accuracy: jsonb('accuracy').default({}), // Model accuracy metrics (MAE, RMSE, etc.)
    alertsTriggered: jsonb('alerts_triggered').default([]), // List of alerts generated from this forecast
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').default(true),
    expiresAt: timestamp('expires_at'), // When this forecast should be refreshed
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Log Volume Metrics - Historical log volume data for forecasting
export const logVolumeMetrics = pgTable('log_volume_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').notNull(), // Date for the metric (truncated to day)
    totalRecords: integer('total_records').notNull(),
    totalSizeBytes: integer('total_size_bytes').notNull(),
    categories: jsonb('categories').default({}), // Breakdown by log category
    sources: jsonb('sources').default({}), // Breakdown by log source
    severityLevels: jsonb('severity_levels').default({}), // Breakdown by severity
    compressionRatio: doublePrecision('compression_ratio'), // Current compression effectiveness
    retentionDays: integer('retention_days'), // Current retention policy
    storageTier: text('storage_tier').default('hot'), // hot, warm, cold, archive
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Capacity Alerts - Automated alerts for storage capacity issues
export const capacityAlerts = pgTable('capacity_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    forecastId: uuid('forecast_id').references(() => logVolumeForecasts.id, { onDelete: 'set null' }),
    alertType: text('alert_type').notNull(), // storage_warning, storage_critical, growth_rate_warning, growth_rate_critical
    severity: text('severity').notNull(), // warning, critical
    message: text('message').notNull(),
    data: jsonb('data').default({}), // Additional alert data (thresholds, predictions, etc.)
    status: text('status').default('active'), // active, acknowledged, resolved
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: timestamp('acknowledged_at'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const logVolumeForecastsRelations = relations(logVolumeForecasts, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [logVolumeForecasts.tenantId],
        references: [tenants.id],
    }),
    generator: one(users, {
        fields: [logVolumeForecasts.generatedBy],
        references: [users.id],
    }),
    alerts: many(capacityAlerts),
}));

export const logVolumeMetricsRelations = relations(logVolumeMetrics, ({ one }) => ({
    tenant: one(tenants, {
        fields: [logVolumeMetrics.tenantId],
        references: [tenants.id],
    }),
}));

export const capacityAlertsRelations = relations(capacityAlerts, ({ one }) => ({
    tenant: one(tenants, {
        fields: [capacityAlerts.tenantId],
        references: [tenants.id],
    }),
    forecast: one(logVolumeForecasts, {
        fields: [capacityAlerts.forecastId],
        references: [logVolumeForecasts.id],
    }),
    acknowledger: one(users, {
        fields: [capacityAlerts.acknowledgedBy],
        references: [users.id],
    }),
}));