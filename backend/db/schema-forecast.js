/**
 * Forecast Schema
 * 
 * Database schema for category budget forecasting with confidence intervals
 * Implements time-series forecasting using historical spending patterns
 */

import { pgTable, uuid, text, numeric, timestamp, jsonb, integer, doublePrecision, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users, categories } from './schema.js';

// Enum for forecast model types
export const forecastModelEnum = pgEnum('forecast_model_type', ['moving_average', 'exponential_smoothing', 'arima', 'prophet', 'ensemble']);

// Enum for forecast status
export const forecastStatusEnum = pgEnum('forecast_status', ['pending', 'processing', 'completed', 'failed', 'stale']);

// Category Forecast History - Stores historical spending data for forecasting
export const categoryForecastHistory = pgTable('category_forecast_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Time period
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').default('daily').notNull(), // daily, weekly, monthly
    
    // Historical metrics
    actualSpent: numeric('actual_spent', { precision: 12, scale: 2 }).notNull(),
    transactionCount: integer('transaction_count').default(0).notNull(),
    
    // Moving averages
    ma7: numeric('ma_7', { precision: 12, scale: 2 }), // 7-period moving average
    ma30: numeric('ma_30', { precision: 12, scale: 2 }), // 30-period moving average
    ma90: numeric('ma_90', { precision: 12, scale: 2 }), // 90-period moving average
    
    // Exponential moving averages
    ema7: numeric('ema_7', { precision: 12, scale: 2 }),
    ema30: numeric('ema_30', { precision: 12, scale: 2 }),
    
    // Statistical measures
    standardDeviation: numeric('standard_deviation', { precision: 12, scale: 2 }),
    variance: numeric('variance', { precision: 12, scale: 2 }),
    
    // Seasonality detection
    seasonalityIndex: doublePrecision('seasonality_index'),
    isAnomaly: boolean('is_anomaly').default(false),
    anomalyScore: doublePrecision('anomaly_score'),
    
    // Metadata
    metadata: jsonb('metadata').default({
        dataQuality: 'good',
        missingDays: 0,
        outlierCount: 0
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Category Forecasts - Stores forecast predictions with confidence intervals
export const categoryForecasts = pgTable('category_forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Forecast period
    forecastStart: timestamp('forecast_start').notNull(),
    forecastEnd: timestamp('forecast_end').notNull(),
    periodType: text('period_type').default('monthly').notNull(),
    
    // Forecast predictions
    predictedSpent: numeric('predicted_spent', { precision: 12, scale: 2 }).notNull(),
    
    // Confidence intervals (95% by default)
    confidenceLower: numeric('confidence_lower', { precision: 12, scale: 2 }).notNull(),
    confidenceUpper: numeric('confidence_upper', { precision: 12, scale: 2 }).notNull(),
    confidenceLevel: doublePrecision('confidence_level').default(0.95).notNull(),
    
    // Additional statistical intervals
    lowerBound80: numeric('lower_bound_80', { precision: 12, scale: 2 }),
    upperBound80: numeric('upper_bound_80', { precision: 12, scale: 2 }),
    
    // Model information
    modelType: forecastModelEnum('model_type').default('moving_average').notNull(),
    modelVersion: text('model_version').default('1.0'),
    
    // Trend analysis
    trendDirection: text('trend_direction').default('stable'), // increasing, decreasing, stable, volatile
    trendStrength: doublePrecision('trend_strength'),
    
    // Seasonality
    hasSeasonality: boolean('has_seasonality').default(false),
    seasonalPeakPeriod: text('seasonal_peak_period'),
    
    // Model performance
    accuracy: doublePrecision('accuracy'), // Percentage accuracy on validation set
    mape: doublePrecision('mape'), // Mean Absolute Percentage Error
    rmse: doublePrecision('rmse'), // Root Mean Square Error
    
    // Status
    status: forecastStatusEnum('status').default('pending').notNull(),
    isActive: boolean('is_active').default(true),
    
    // Alert thresholds
    warningThreshold: numeric('warning_threshold', { precision: 12, scale: 2 }),
    criticalThreshold: numeric('critical_threshold', { precision: 12, scale: 2 }),
    
    // Metadata and features
    features: jsonb('features').default({
        dayOfWeek: [],
        dayOfMonth: [],
        monthOfYear: [],
        holidays: [],
        customEvents: []
    }),
    
    metadata: jsonb('metadata').default({
        historicalPeriods: 0,
        computeTimeMs: 0,
        dataPoints: 0,
        anomaliesDetected: 0
    }),
    
    // Timestamps
    computedAt: timestamp('computed_at').defaultNow(),
    validUntil: timestamp('valid_until'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecast Accuracy Metrics - Tracks model performance over time
export const forecastAccuracyMetrics = pgTable('forecast_accuracy_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    forecastId: uuid('forecast_id').references(() => categoryForecasts.id, { onDelete: 'cascade' }),
    
    // Evaluation period
    evaluationDate: timestamp('evaluation_date').notNull(),
    periodType: text('period_type').notNull(),
    
    // Actual vs Predicted
    actualSpent: numeric('actual_spent', { precision: 12, scale: 2 }).notNull(),
    predictedSpent: numeric('predicted_spent', { precision: 12, scale: 2 }).notNull(),
    
    // Error metrics
    absoluteError: numeric('absolute_error', { precision: 12, scale: 2 }),
    percentageError: doublePrecision('percentage_error'),
    squaredError: numeric('squared_error', { precision: 12, scale: 2 }),
    
    // Confidence interval validation
    withinConfidenceInterval: boolean('within_confidence_interval'),
    confidenceLevel: doublePrecision('confidence_level'),
    
    // Model details
    modelType: forecastModelEnum('model_type').notNull(),
    modelVersion: text('model_version'),
    
    // Aggregated metrics (rolling windows)
    mape7d: doublePrecision('mape_7d'), // 7-day MAPE
    mape30d: doublePrecision('mape_30d'), // 30-day MAPE
    rmse7d: doublePrecision('rmse_7d'),
    rmse30d: doublePrecision('rmse_30d'),
    
    // Model health indicators
    modelHealth: text('model_health').default('good'), // excellent, good, fair, poor
    needsRetraining: boolean('needs_retraining').default(false),
    
    // Metadata
    metadata: jsonb('metadata').default({
        outlierAdjusted: false,
        seasonalityFactorApplied: false,
        customAdjustments: []
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecast Alerts - Predictive alerts based on forecasts
export const forecastAlerts = pgTable('forecast_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    forecastId: uuid('forecast_id').references(() => categoryForecasts.id, { onDelete: 'cascade' }).notNull(),
    
    // Alert configuration
    alertType: text('alert_type').notNull(), // predictive_overspend, trend_alert, anomaly_forecast
    severity: text('severity').default('warning'), // info, warning, critical
    
    // Prediction details
    projectedSpent: numeric('projected_spent', { precision: 12, scale: 2 }).notNull(),
    budgetLimit: numeric('budget_limit', { precision: 12, scale: 2 }),
    projectedOverage: numeric('projected_overage', { precision: 12, scale: 2 }),
    daysUntilOverage: integer('days_until_overage'),
    
    // Confidence
    confidence: doublePrecision('confidence').notNull(),
    
    // Alert message
    message: text('message'),
    recommendation: text('recommendation'),
    
    // Status
    isActive: boolean('is_active').default(true),
    isDismissed: boolean('is_dismissed').default(false),
    dismissedAt: timestamp('dismissed_at'),
    
    // Notification
    notificationSent: boolean('notification_sent').default(false),
    notificationChannels: jsonb('notification_channels').default(['email', 'in-app']),
    sentAt: timestamp('sent_at'),
    
    // Metadata
    metadata: jsonb('metadata').default({
        triggerCondition: null,
        historicalContext: null,
        actionsTaken: []
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecast Model Config - Stores model hyperparameters and configurations
export const forecastModelConfig = pgTable('forecast_model_config', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    
    // Model selection
    modelType: forecastModelEnum('model_type').notNull(),
    isDefault: boolean('is_default').default(false),
    
    // Hyperparameters
    hyperparameters: jsonb('hyperparameters').default({
        movingAveragePeriod: 30,
        smoothingFactor: 0.3,
        arimaOrder: [1, 1, 1],
        seasonalPeriod: 7,
        confidenceLevel: 0.95
    }),
    
    // Feature engineering
    features: jsonb('features').default({
        includeSeasonality: true,
        includeTrend: true,
        includeHolidays: false,
        customFeatures: []
    }),
    
    // Training configuration
    minHistoricalPeriods: integer('min_historical_periods').default(30),
    retrainFrequency: text('retrain_frequency').default('weekly'), // daily, weekly, monthly
    
    // Performance thresholds
    minAccuracy: doublePrecision('min_accuracy').default(0.7),
    maxMape: doublePrecision('max_mape').default(0.3),
    
    // Status
    isActive: boolean('is_active').default(true),
    
    metadata: jsonb('metadata').default({
        createdBy: 'system',
        lastOptimized: null
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
