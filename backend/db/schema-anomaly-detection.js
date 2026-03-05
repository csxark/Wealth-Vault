/**
 * Expense Anomaly Detection Schema
 * 
 * Database schema for real-time anomaly detection using isolation forest models.
 * Detects unusual spending patterns (fraud, mistakes) at transaction creation time.
 * 
 * Issue #612: Expense Anomaly Detection using Time Series Analysis
 */

import { pgTable, uuid, text, timestamp, jsonb, boolean, numeric, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users, categories, expenses } from './schema.js';

// Enum for anomaly severity
export const anomalySeverityEnum = pgEnum('anomaly_severity', ['low', 'medium', 'high', 'critical']);

// Enum for anomaly status
export const anomalyStatusEnum = pgEnum('anomaly_status', ['detected', 'reviewed', 'confirmed', 'false_positive', 'blocked']);

// Anomaly Models - Isolation forest models per category/user
export const anomalyModels = pgTable('anomaly_models', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Model metadata
    modelType: text('model_type').default('isolation_forest').notNull(),
    modelVersion: text('model_version').notNull(),
    
    // Training data
    trainingDataPoints: integer('training_data_points').default(0),
    trainingStartDate: timestamp('training_start_date'),
    trainingEndDate: timestamp('training_end_date'),
    lastTrainedAt: timestamp('last_trained_at'),
    nextTrainingDue: timestamp('next_training_due'),
    
    // Model performance
    accuracy: numeric('accuracy', { precision: 5, scale: 4 }),
    precision: numeric('precision', { precision: 5, scale: 4 }),
    recall: numeric('recall', { precision: 5, scale: 4 }),
    f1Score: numeric('f1_score', { precision: 5, scale: 4 }),
    
    // Model characteristics
    anomalyRatio: numeric('anomaly_ratio', { precision: 5, scale: 4 }).default('0.05'), // 5% default
    contaminationFactor: numeric('contamination_factor', { precision: 5, scale: 4 }).default('0.1'),
    
    // Feature configuration
    features: jsonb('features').default({
        amount: true,
        dayOfWeek: true,
        hourOfDay: true,
        isWeekend: true,
        daysFromLastTransaction: true,
        amountDeviation: true,
        frequencyDeviation: true,
        timeOfDayPattern: true,
        categoryTrend: true
    }).notNull(),
    
    // Model state
    isActive: boolean('is_active').default(true).notNull(),
    needsRetraining: boolean('needs_retraining').default(false).notNull(),
    
    // Model parameters
    parameters: jsonb('parameters').default({
        nEstimators: 100,
        maxSamples: 256,
        randomState: 42,
        contamination: 0.05,
        jobsPerCategory: 4
    }),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Anomaly Detections - Detected anomalies
export const anomalyDetections = pgTable('anomaly_detections', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    
    // Anomaly details
    anomalyScore: numeric('anomaly_score', { precision: 5, scale: 4 }).notNull(),
    severity: anomalySeverityEnum('severity').notNull(),
    status: anomalyStatusEnum('status').default('detected').notNull(),
    
    // Transaction features
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description'),
    transactionDate: timestamp('transaction_date').notNull(),
    
    // Anomaly indicators
    zScore: numeric('z_score', { precision: 8, scale: 4 }),
    expectedAmount: numeric('expected_amount', { precision: 12, scale: 2 }),
    amountDeviation: numeric('amount_deviation', { precision: 8, scale: 4 }),
    frequencyDeviation: numeric('frequency_deviation', { precision: 8, scale: 4 }),
    
    // Related model
    modelId: uuid('model_id').references(() => anomalyModels.id, { onDelete: 'set null' }),
    modelVersion: text('model_version'),
    
    // Detection context
    features: jsonb('features').default({
        amount: null,
        dayOfWeek: null,
        hourOfDay: null,
        isWeekend: false,
        daysFromLastTransaction: null,
        amountDeviation: null,
        frequencyDeviation: null,
        lastTransactionAmount: null,
        avgTransactionAmount: null,
        stdDeviation: null
    }).notNull(),
    
    // User action
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),
    
    // Action taken
    actionTaken: text('action_taken'), // pending, reviewed, blocked, allowed, verified_legitimate
    actionTakenAt: timestamp('action_taken_at'),
    actionTakenBy: uuid('action_taken_by').references(() => users.id, { onDelete: 'set null' }),
    
    metadata: jsonb('metadata').default({
        modelConfidence: null,
        topAnomalyFeatures: [],
        similarTransactions: []
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Anomaly Training Data - Store training data for model retraining
export const anomalyTrainingData = pgTable('anomaly_training_data', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Training point reference
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    
    // Feature values
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    dayOfWeek: integer('day_of_week'), // 0-6
    hourOfDay: integer('hour_of_day'), // 0-23
    isWeekend: boolean('is_weekend'),
    daysFromLastTransaction: integer('days_from_last_transaction'),
    amountDeviation: numeric('amount_deviation', { precision: 8, scale: 4 }),
    frequencyDeviation: numeric('frequency_deviation', { precision: 8, scale: 4 }),
    
    // Labels
    isAnomaly: boolean('is_anomaly').default(false).notNull(),
    userConfirmed: boolean('user_confirmed').default(false),
    confirmationLabel: text('confirmation_label'), // legitimate, fraud, mistake
    
    // Metadata
    features: jsonb('features').default({}),
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Anomaly Rules - Custom rules for specific patterns
export const anomalyRules = pgTable('anomaly_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    
    // Rule details
    ruleName: text('rule_name').notNull(),
    description: text('description'),
    ruleType: text('rule_type').notNull(), // threshold, pattern, ratio
    
    // Conditions
    condition: jsonb('condition').notNull(), // { type, field, operator, value }
    
    // Actions
    action: text('action').notNull(), // flag, block, alert, review
    severity: anomalySeverityEnum('severity').default('medium').notNull(),
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    priority: integer('priority').default(0),
    
    // Tracking
    timesTriggered: integer('times_triggered').default(0),
    lastTriggeredAt: timestamp('last_triggered_at'),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Anomaly Statistics - Summary stats per category/user
export const anomalyStatistics = pgTable('anomaly_statistics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    
    // Time period
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').default('daily').notNull(), // daily, weekly, monthly
    
    // Statistics
    totalTransactions: integer('total_transactions').default(0),
    anomalousTransactions: integer('anomalous_transactions').default(0),
    anomalyPercentage: numeric('anomaly_percentage', { precision: 5, scale: 2 }),
    
    // Amount statistics
    avgAmount: numeric('avg_amount', { precision: 12, scale: 2 }),
    stdDevAmount: numeric('std_dev_amount', { precision: 12, scale: 2 }),
    minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
    maxAmount: numeric('max_amount', { precision: 12, scale: 2 }),
    
    // Severity distribution
    lowSeverityCount: integer('low_severity_count').default(0),
    mediumSeverityCount: integer('medium_severity_count').default(0),
    highSeverityCount: integer('high_severity_count').default(0),
    criticalSeverityCount: integer('critical_severity_count').default(0),
    
    // Trends
    anomalyTrend: numeric('anomaly_trend', { precision: 5, scale: 4 }), // slope of anomaly count over time
    trendDirection: text('trend_direction'), // increasing, decreasing, stable
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ========================================
// Relations
// ========================================

export const anomalyModelsRelations = relations(anomalyModels, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [anomalyModels.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [anomalyModels.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [anomalyModels.categoryId],
        references: [categories.id],
    }),
    detections: many(anomalyDetections),
    trainingData: many(anomalyTrainingData),
}));

export const anomalyDetectionsRelations = relations(anomalyDetections, ({ one }) => ({
    tenant: one(tenants, {
        fields: [anomalyDetections.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [anomalyDetections.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [anomalyDetections.categoryId],
        references: [categories.id],
    }),
    expense: one(expenses, {
        fields: [anomalyDetections.expenseId],
        references: [expenses.id],
    }),
    model: one(anomalyModels, {
        fields: [anomalyDetections.modelId],
        references: [anomalyModels.id],
    }),
    reviewedByUser: one(users, {
        fields: [anomalyDetections.reviewedBy],
        references: [users.id],
    }),
    actionTakenByUser: one(users, {
        fields: [anomalyDetections.actionTakenBy],
        references: [users.id],
    }),
}));

export const anomalyTrainingDataRelations = relations(anomalyTrainingData, ({ one }) => ({
    tenant: one(tenants, {
        fields: [anomalyTrainingData.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [anomalyTrainingData.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [anomalyTrainingData.categoryId],
        references: [categories.id],
    }),
    expense: one(expenses, {
        fields: [anomalyTrainingData.expenseId],
        references: [expenses.id],
    }),
}));

export const anomalyRulesRelations = relations(anomalyRules, ({ one }) => ({
    tenant: one(tenants, {
        fields: [anomalyRules.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [anomalyRules.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [anomalyRules.categoryId],
        references: [categories.id],
    }),
}));

export const anomalyStatisticsRelations = relations(anomalyStatistics, ({ one }) => ({
    tenant: one(tenants, {
        fields: [anomalyStatistics.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [anomalyStatistics.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [anomalyStatistics.categoryId],
        references: [categories.id],
    }),
}));
