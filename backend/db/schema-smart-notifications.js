/**
 * Smart Notifications & Recommendations Schema
 * Drizzle ORM schema definitions for Issue #626
 * Real-Time Budget Alerts & Smart Notifications feature
 */

import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users, categories, budgetAlerts } from './schema.js';

// Smart Alert Rules - Configurable multi-level budget alert thresholds
export const smartAlertRules = pgTable('smart_alert_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),

    // Rule configuration
    rulesName: text('rules_name').notNull(),
    ruleType: text('rule_type').notNull(), // 'percentage_based', 'absolute', 'trend_based'

    // Multi-level alert thresholds (e.g., 80%, 95%, 100%, 150%)
    alertThresholds: jsonb('alert_thresholds').default([
        { level: 1, percentage: 80, description: 'Warning - 80% of budget reached', severity: 'info' },
        { level: 2, percentage: 95, description: 'Alert - 95% of budget reached', severity: 'warning' },
        { level: 3, percentage: 100, description: 'Critical - Budget fully spent', severity: 'danger' },
        { level: 4, percentage: 150, description: 'Overspent - 50% over budget', severity: 'critical' }
    ]),

    // Period configuration
    period: text('period').default('monthly'),
    budgetAmount: numeric('budget_amount', { precision: 12, scale: 2 }).notNull(),

    // Smart notification settings
    notificationEnabled: boolean('notification_enabled').default(true),
    notificationChannels: jsonb('notification_channels').default(['in-app', 'email']),
    quietHours: jsonb('quiet_hours').default({
        enabled: false,
        start_hour: 20,
        end_hour: 8,
        timezone: 'UTC'
    }),
    maxNotificationsPerDay: integer('max_notifications_per_day').default(3),

    // Smart scheduling
    preferredNotificationTime: text('preferred_notification_time').default('09:00:00'),
    sendDailySummary: boolean('send_daily_summary').default(false),
    sendWeeklySummary: boolean('send_weekly_summary').default(false),

    // Flags
    isActive: boolean('is_active').default(true),
    isTemplate: boolean('is_template').default(false),

    // Tracking
    lastTriggeredAt: timestamp('last_triggered_at'),
    triggerCount: integer('trigger_count').default(0),
    metadata: jsonb('metadata').default({
        created_by: 'user',
        last_modified_by: null,
        notes: null
    }),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Smart Recommendations - AI-generated spending reduction recommendations
export const smartRecommendations = pgTable('smart_recommendations', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),

    // Recommendation metadata
    recommendationType: text('recommendation_type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),

    // Financial impact
    estimatedMonthlySavings: numeric('estimated_monthly_savings', { precision: 12, scale: 2 }).default('0'),
    savingsPercentage: numeric('savings_percentage', { precision: 5, scale: 2 }),
    savingsConfidenceScore: numeric('savings_confidence_score', { precision: 3, scale: 2 }).default(0.85),

    // Action items
    actionItems: jsonb('action_items').default([]),
    implementationDifficulty: text('implementation_difficulty'),
    timeToImplementDays: integer('time_to_implement_days'),

    // Supporting data
    supportingData: jsonb('supporting_data').default({}),
    benchmarkData: jsonb('benchmark_data').default({}),

    // Status tracking
    status: text('status').default('suggested'),
    userFeedback: text('user_feedback'),
    dismissedAt: timestamp('dismissed_at'),
    implementedAt: timestamp('implemented_at'),
    impactMeasuredAt: timestamp('impact_measured_at'),
    measuredSavings: numeric('measured_savings', { precision: 12, scale: 2 }),

    // Ranking
    priorityScore: numeric('priority_score', { precision: 3, scale: 2 }),
    relevanceScore: numeric('relevance_score', { precision: 3, scale: 2 }),

    // Metadata
    generatedBy: text('generated_by'),
    analysisVersion: text('analysis_version'),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata').default({}),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Spending Benchmarks - Compare user spending against peer groups
export const spendingBenchmarks = pgTable('spending_benchmarks', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),

    // Benchmark definition
    benchmarkName: text('benchmark_name').notNull(),
    benchmarkDescription: text('benchmark_description'),

    // Cohort information
    cohortSize: integer('cohort_size'),
    demographicCriteria: jsonb('demographic_criteria').default({}),

    // Statistics
    averageSpending: numeric('average_spending', { precision: 12, scale: 2 }).notNull(),
    medianSpending: numeric('median_spending', { precision: 12, scale: 2 }).notNull(),
    percentile10: numeric('percentile_10', { precision: 12, scale: 2 }),
    percentile25: numeric('percentile_25', { precision: 12, scale: 2 }),
    percentile75: numeric('percentile_75', { precision: 12, scale: 2 }),
    percentile90: numeric('percentile_90', { precision: 12, scale: 2 }),
    stdDeviation: numeric('std_deviation', { precision: 12, scale: 2 }),

    // Period information
    period: text('period').default('monthly'),
    benchmarkMonthYear: text('benchmark_month_year'),

    // Trend data
    trendDirection: text('trend_direction'),
    monthOverMonthChange: numeric('month_over_month_change', { precision: 5, scale: 2 }),
    yearOverYearChange: numeric('year_over_year_change', { precision: 5, scale: 2 }),

    // Metadata
    dataQualityScore: numeric('data_quality_score', { precision: 3, scale: 2 }).default(0.95),
    lastUpdatedAt: timestamp('last_updated_at'),
    metadata: jsonb('metadata').default({}),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User Spending Profile - Aggregated data for benchmarking
export const userSpendingProfiles = pgTable('user_spending_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),

    // Demographics (optional, for benchmarking)
    ageRange: text('age_range'),
    householdIncomeRange: text('household_income_range'),
    familyStatus: text('family_status'),
    location: text('location'),

    // Spending profile
    period: text('period').default('monthly'),
    averageMonthlySpendy: numeric('average_monthly_spending', { precision: 12, scale: 2 }).default('0'),
    averageTransactionSize: numeric('average_transaction_size', { precision: 12, scale: 2 }),
    transactionFrequency: integer('transaction_frequency'),

    // Trends
    spendingTrend: numeric('spending_trend', { precision: 5, scale: 2 }),
    volatility: numeric('volatility', { precision: 5, scale: 2 }),

    // Top merchants
    topMerchants: jsonb('top_merchants').default([]),
    topMerchantsPercentage: numeric('top_merchants_percentage', { precision: 5, scale: 2 }),

    // Comparison data
    benchmarkPercentile: numeric('benchmark_percentile', { precision: 5, scale: 2 }),
    isOutlier: boolean('is_outlier').default(false),

    // Metadata
    metadata: jsonb('metadata').default({}),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Merchant Consolidation Analysis - Identify consolidation opportunities
export const merchantConsolidationAnalysis = pgTable('merchant_consolidation_analysis', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),

    // Merchant information
    primaryMerchant: text('primary_merchant').notNull(),
    alternateMerchants: jsonb('alternate_merchants').default([]),

    // Consolidation analysis
    totalCurrentSpending: numeric('total_current_spending', { precision: 12, scale: 2 }).notNull(),
    consolidationTargetSpending: numeric('consolidation_target_spending', { precision: 12, scale: 2 }).notNull(),
    estimatedSavings: numeric('estimated_savings', { precision: 12, scale: 2 }).notNull().default('0'),
    savingsPercentage: numeric('savings_percentage', { precision: 5, scale: 2 }),

    // Supporting data
    merchantCounts: jsonb('merchant_counts').default({}),
    consolidationStrategy: jsonb('consolidation_strategy').default({}),

    // Implementation
    status: text('status').default('identified'),
    implementationDate: timestamp('implementation_date'),
    successDate: timestamp('success_date'),

    // Post-implementation
    actualSavings: numeric('actual_savings', { precision: 12, scale: 2 }),
    lessonsLearned: text('lessons_learned'),
    metadata: jsonb('metadata').default({}),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Notification History - Track all notifications sent to user
export const notificationHistory = pgTable('notification_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

    // Notification metadata
    notificationType: text('notification_type').notNull(),
    relatedAlertRuleId: uuid('related_alert_rule_id').references(() => smartAlertRules.id, { onDelete: 'set null' }),
    relatedBudgetAlertId: uuid('related_budget_alert_id').references(() => budgetAlerts.id, { onDelete: 'set null' }),
    relatedRecommendationId: uuid('related_recommendation_id').references(() => smartRecommendations.id, { onDelete: 'set null' }),

    // Content
    title: text('title').notNull(),
    message: text('message').notNull(),
    richContent: jsonb('rich_content').default({}),

    // Delivery
    channelsAttempted: jsonb('channels_attempted').default(['in-app']),
    channelsSucceeded: jsonb('channels_succeeded').default([]),

    // Performance
    sentAt: timestamp('sent_at').defaultNow(),
    deliveredAt: timestamp('delivered_at'),
    readAt: timestamp('read_at'),
    interactionData: jsonb('interaction_data').default({
        clicked: false,
        dismissed: false,
        action_taken: null
    }),

    // Status
    deliveryStatus: text('delivery_status').default('pending'),
    failureReason: text('failure_reason'),
    retryCount: integer('retry_count').default(0),

    // Metadata
    metadata: jsonb('metadata').default({}),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Daily Spending Summary - Pre-computed daily summaries for dashboard
export const dailySpendingSummary = pgTable('daily_spending_summary', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

    // Date information
    summaryDate: text('summary_date').notNull(),

    // Summary data
    totalSpendingToday: numeric('total_spending_today', { precision: 12, scale: 2 }).default('0'),
    transactionCount: integer('transaction_count').default(0),
    categoriesInvolved: jsonb('categories_involved').default([]),

    // Budget status
    budgetStatus: jsonb('budget_status').default({}),
    alertsTriggered: jsonb('alerts_triggered').default([]),

    // Top transactions
    topTransactions: jsonb('top_transactions').default([]),

    // Comparison
    vsYesterdayChange: numeric('vs_yesterday_change', { precision: 5, scale: 2 }),
    vsWeeklyAverageChange: numeric('vs_weekly_average_change', { precision: 5, scale: 2 }),
    vsMonthlyAverageChange: numeric('vs_monthly_average_change', { precision: 5, scale: 2 }),

    // Metadata
    computedAt: timestamp('computed_at').defaultNow(),
    metadata: jsonb('metadata').default({}),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const smartAlertRulesRelations = relations(smartAlertRules, ({ one }) => ({
    tenant: one(tenants, {
        fields: [smartAlertRules.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [smartAlertRules.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [smartAlertRules.categoryId],
        references: [categories.id],
    }),
}));

export const smartRecommendationsRelations = relations(smartRecommendations, ({ one }) => ({
    tenant: one(tenants, {
        fields: [smartRecommendations.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [smartRecommendations.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [smartRecommendations.categoryId],
        references: [categories.id],
    }),
}));

export const spendingBenchmarksRelations = relations(spendingBenchmarks, ({ one }) => ({
    tenant: one(tenants, {
        fields: [spendingBenchmarks.tenantId],
        references: [tenants.id],
    }),
    category: one(categories, {
        fields: [spendingBenchmarks.categoryId],
        references: [categories.id],
    }),
}));

export const userSpendingProfilesRelations = relations(userSpendingProfiles, ({ one }) => ({
    tenant: one(tenants, {
        fields: [userSpendingProfiles.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [userSpendingProfiles.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [userSpendingProfiles.categoryId],
        references: [categories.id],
    }),
}));

export const merchantConsolidationAnalysisRelations = relations(merchantConsolidationAnalysis, ({ one }) => ({
    tenant: one(tenants, {
        fields: [merchantConsolidationAnalysis.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [merchantConsolidationAnalysis.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [merchantConsolidationAnalysis.categoryId],
        references: [categories.id],
    }),
}));

export const notificationHistoryRelations = relations(notificationHistory, ({ one }) => ({
    tenant: one(tenants, {
        fields: [notificationHistory.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [notificationHistory.userId],
        references: [users.id],
    }),
    alertRule: one(smartAlertRules, {
        fields: [notificationHistory.relatedAlertRuleId],
        references: [smartAlertRules.id],
    }),
    budgetAlert: one(budgetAlerts, {
        fields: [notificationHistory.relatedBudgetAlertId],
        references: [budgetAlerts.id],
    }),
    recommendation: one(smartRecommendations, {
        fields: [notificationHistory.relatedRecommendationId],
        references: [smartRecommendations.id],
    }),
}));

export const dailySpendingSummaryRelations = relations(dailySpendingSummary, ({ one }) => ({
    tenant: one(tenants, {
        fields: [dailySpendingSummary.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [dailySpendingSummary.userId],
        references: [users.id],
    }),
}));
