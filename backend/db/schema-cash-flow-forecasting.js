import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, tenants, expenses, budgets } from './schema.js';

/**
 * Cash Flow Forecasting & Budget Intelligence Schema
 * Issue #668
 * 
 * Provides predictive cash flow analysis with:
 * - 30/60/90-day forecasts
 * - Seasonal pattern detection
 * - Budget variance analysis
 * - Spending predictions
 * - Irregular expense alerts
 * - Sensitivity analysis
 */

export const forecastTypeEnum = pgEnum('forecast_type', ['income', 'expense', 'net_cash_flow']);
export const forecastPeriodEnum = pgEnum('forecast_period', ['30_days', '60_days', '90_days']);
export const seasonalityTypeEnum = pgEnum('seasonality_type', ['monthly', 'quarterly', 'yearly']);
export const varianceStatusEnum = pgEnum('variance_status', ['on_track', 'slight_overage', 'significant_overage', 'underspend']);
export const irregularExpenseStatusEnum = pgEnum('irregular_expense_status', ['predicted', 'upcoming', 'overdue', 'completed']);

// Cash Flow Forecasts - Main forecast table
export const cashFlowForecasts = pgTable('cash_flow_forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Forecast period
    forecastPeriod: forecastPeriodEnum('forecast_period').notNull(), // 30/60/90 days
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    
    // Forecasted values
    projectedIncome: numeric('projected_income', { precision: 15, scale: 2 }).notNull(),
    projectedExpenses: numeric('projected_expenses', { precision: 15, scale: 2 }).notNull(),
    projectedNetCashFlow: numeric('projected_net_cash_flow', { precision: 15, scale: 2 }).notNull(),
    
    // Actual values (populated as time progresses)
    actualIncome: numeric('actual_income', { precision: 15, scale: 2 }),
    actualExpenses: numeric('actual_expenses', { precision: 15, scale: 2 }),
    actualNetCashFlow: numeric('actual_net_cash_flow', { precision: 15, scale: 2 }),
    
    // Accuracy metrics
    accuracy: numeric('accuracy', { precision: 5, scale: 2 }), // 0-100, filled after period ends
    varianceAmount: numeric('variance_amount', { precision: 15, scale: 2 }),
    variancePercent: numeric('variance_percent', { precision: 8, scale: 2 }),
    
    // Confidence metrics
    confidence: numeric('confidence', { precision: 5, scale: 2 }).default('85'), // 0-100
    modelType: text('model_type').default('arima'), // arima, linear_regression, exponential_smoothing
    
    // Forecast breakdown
    dailyProjections: jsonb('daily_projections').default([]), // [{date, income, expense, balance}]
    riskFactors: jsonb('risk_factors').default([]), // [{factor, impact, probability}]
    opportunityFactors: jsonb('opportunity_factors').default([]), // [{factor, impact, probability}]
    
    // Status
    isActive: boolean('is_active').default(true),
    status: text('status').default('draft'), // draft, active, completed, archived
    
    // Metadata
    calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
    generatedFrom: text('generated_from').default('historical_data'), // historical_data, user_input, ai_analysis
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Seasonal Patterns - Detected spending/income seasonality
export const seasonalPatterns = pgTable('seasonal_patterns', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Pattern details
    seasonalityType: seasonalityTypeEnum('seasonality_type').notNull(), // monthly, quarterly, yearly
    category: text('category'), // Optional: specific expense category
    
    // Pattern data
    baseLine: numeric('base_line', { precision: 15, scale: 2 }).notNull(), // Average value
    seasonalFactors: jsonb('seasonal_factors').notNull(), // {jan: 1.2, feb: 0.8, ...} or {q1: 1.1, q2: 0.9, ...}
    confidence: numeric('confidence', { precision: 5, scale: 2 }).default('75'), // 0-100
    
    // Historical stats
    dataPoints: integer('data_points').default(0), // Number of observations used
    deviationStdDev: numeric('deviation_std_dev', { precision: 8, scale: 4 }).default('0'),
    lastUpdatedAt: timestamp('last_updated_at').notNull().defaultNow(),
    
    // Pattern characteristics
    isPeakSeason: boolean('is_peak_season').default(false),
    peakMultiplier: numeric('peak_multiplier', { precision: 5, scale: 2 }), // How much higher than baseline
    lowMultiplier: numeric('low_multiplier', { precision: 5, scale: 2 }), // How much lower than baseline
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Budget Variance Analysis - Track budget vs actual
export const budgetVarianceAnalysis = pgTable('budget_variance_analysis', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    budgetId: uuid('budget_id').references(() => budgets.id, { onDelete: 'cascade' }),
    
    // Period
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').notNull(), // daily, weekly, monthly, yearly
    
    // Budget values
    budgetAmount: numeric('budget_amount', { precision: 15, scale: 2 }).notNull(),
    actualAmount: numeric('actual_amount', { precision: 15, scale: 2 }).notNull(),
    
    // Variance metrics
    varianceAmount: numeric('variance_amount', { precision: 15, scale: 2 }).notNull(),
    variancePercent: numeric('variance_percent', { precision: 8, scale: 2 }).notNull(),
    varianceStatus: varianceStatusEnum('variance_status').notNull(), // on_track, slight_overage, significant_overage, underspend
    
    // Trend analysis
    trendDirection: text('trend_direction'), // improving, stable, declining
    projectedMonthEnd: numeric('projected_month_end', { precision: 15, scale: 2 }), // If trend continues
    
    // Category breakdown
    categoryVariances: jsonb('category_variances').default([]), // [{category, budget, actual, variance}]
    topVarianceCauses: jsonb('top_variance_causes').default([]), // [{category, amount, percent, reason}]
    
    // Issues
    hasIssues: boolean('has_issues').default(false),
    issues: jsonb('issues').default([]), // [{severity, category, description, recommendation}]
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Spending Predictions - ML-based spending forecasts
export const spendingPredictions = pgTable('spending_predictions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Category & timeframe
    category: text('category').notNull(),
    predictionDate: timestamp('prediction_date').notNull(),
    predictionHorizon: integer('prediction_horizon').notNull(), // days ahead
    
    // Prediction values
    predictedAmount: numeric('predicted_amount', { precision: 15, scale: 2 }).notNull(),
    confidenceInterval95Low: numeric('confidence_interval_95_low', { precision: 15, scale: 2 }).notNull(),
    confidenceInterval95High: numeric('confidence_interval_95_high', { precision: 15, scale: 2 }).notNull(),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }).notNull(), // 0-100
    
    // Actual value (filled after date passes)
    actualAmount: numeric('actual_amount', { precision: 15, scale: 2 }),
    predictionAccuracy: numeric('prediction_accuracy', { precision: 5, scale: 2 }), // 0-100
    
    // Reasoning
    factors: jsonb('factors').default([]), // [{factor, impact, weight}]
    seasonalAdjustment: numeric('seasonal_adjustment', { precision: 5, scale: 2 }).default('1.0'),
    trendAdjustment: numeric('trend_adjustment', { precision: 5, scale: 2 }).default('1.0'),
    
    // Model info
    modelVersion: text('model_version').default('1.0'),
    trainingDataPoints: integer('training_data_points').default(0),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Irregular Expense Tracking - Predict and track non-recurring expenses
export const irregularExpenses = pgTable('irregular_expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Expense details
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    estimatedAmount: numeric('estimated_amount', { precision: 15, scale: 2 }).notNull(),
    actualAmount: numeric('actual_amount', { precision: 15, scale: 2 }),
    
    // Timing
    expectedDate: timestamp('expected_date'),
    actualDate: timestamp('actual_date'),
    frequency: text('frequency'), // one_time, annual, biennial, etc
    lastOccurrence: timestamp('last_occurrence'),
    nextExpectedOccurrence: timestamp('next_expected_occurrence'),
    
    // Tracking
    status: irregularExpenseStatusEnum('status').default('predicted'),
    isPrepared: boolean('is_prepared').default(false),
    fundingSource: text('funding_source'), // emergency_fund, savings, paycheck
    
    // Prediction confidence
    confidencePercent: numeric('confidence_percent', { precision: 5, scale: 2 }).default('70'),
    
    // Notes
    notes: text('notes'),
    relatedExpenseIds: jsonb('related_expense_ids').default([]),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Sensitivity Analysis - What-if scenario modeling
export const sensitivityAnalysis = pgTable('sensitivity_analysis', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Scenario
    scenarioName: text('scenario_name').notNull(),
    description: text('description'),
    scenarioType: text('scenario_type').notNull(), // income_change, expense_change, job_loss, bonus, emergency
    
    // Base case
    baseCaseIncome: numeric('base_case_income', { precision: 15, scale: 2 }).notNull(),
    baseCaseExpenses: numeric('base_case_expenses', { precision: 15, scale: 2 }).notNull(),
    baseCaseBalance: numeric('base_case_balance', { precision: 15, scale: 2 }).notNull(),
    
    // Scenario parameters
    parameters: jsonb('parameters').notNull(), // {incomeChange: -0.20, expenseMultiplier: 1.1, ...}
    
    // Results
    scenarioIncome: numeric('scenario_income', { precision: 15, scale: 2 }).notNull(),
    scenarioExpenses: numeric('scenario_expenses', { precision: 15, scale: 2 }).notNull(),
    scenarioBalance: numeric('scenario_balance', { precision: 15, scale: 2 }).notNull(),
    
    // Impact analysis
    impactAmount: numeric('impact_amount', { precision: 15, scale: 2 }).notNull(),
    impactPercent: numeric('impact_percent', { precision: 8, scale: 2 }).notNull(),
    daysToDepletion: integer('days_to_depletion'), // If balance goes negative
    recoveryMonths: integer('recovery_months'), // Months to recover to base case
    
    // Risk assessment
    riskLevel: text('risk_level'), // low, medium, high, critical
    sustainability: numeric('sustainability', { precision: 5, scale: 2 }), // 0-100, how sustainable is scenario
    
    // Recommendations
    recommendations: jsonb('recommendations').default([]),
    
    // Status
    isFavorite: boolean('is_favorite').default(false),
    isDefault: boolean('is_default').default(false),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecast Alerts - Notifications for forecast events
export const forecastAlerts = pgTable('forecast_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Alert details
    alertType: text('alert_type').notNull(), // cash_flow_warning, large_expense_coming, budget_overage, seasonal_peak
    severity: text('severity').notNull(), // low, medium, high, critical
    
    // Related items
    forecastId: uuid('forecast_id').references(() => cashFlowForecasts.id, { onDelete: 'cascade' }),
    irregularExpenseId: uuid('irregular_expense_id').references(() => irregularExpenses.id, { onDelete: 'cascade' }),
    
    // Alert content
    title: text('title').notNull(),
    description: text('description').notNull(),
    projectedImpact: numeric('projected_impact', { precision: 15, scale: 2 }),
    
    // Actionable recommendations
    recommendations: jsonb('recommendations').default([]),
    
    // Status
    isActive: boolean('is_active').default(true),
    isAcknowledged: boolean('is_acknowledged').default(false),
    acknowledgmentDate: timestamp('acknowledgment_date'),
    actionTaken: text('action_taken'),
    
    // Trigger details
    triggerDate: timestamp('trigger_date').notNull(),
    targetDate: timestamp('target_date'), // When the alert matters
    notificationSent: boolean('notification_sent').default(false),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecast Accuracy Metrics - Track and improve model accuracy
export const forecastAccuracyMetrics = pgTable('forecast_accuracy_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Period
    metricsDate: timestamp('metrics_date').notNull(),
    measurementPeriod: text('measurement_period').notNull(), // 30_days, 60_days, 90_days
    
    // Accuracy metrics
    meanAbsoluteError: numeric('mean_absolute_error', { precision: 15, scale: 2 }),
    meanAbsolutePercentError: numeric('mean_absolute_percent_error', { precision: 8, scale: 2 }),
    rootMeanSquaredError: numeric('root_mean_squared_error', { precision: 15, scale: 2 }),
    
    // Directional accuracy
    directionalAccuracy: numeric('directional_accuracy', { precision: 5, scale: 2 }), // % correct direction
    withinConfidenceInterval: numeric('within_confidence_interval', { precision: 5, scale: 2 }), // % within 95% CI
    
    // By category breakdown
    categoryMetrics: jsonb('category_metrics').default([]), // [{category, mae, mape, accuracy}]
    
    // Trends
    improvementTrend: text('improvement_trend'), // improving, stable, declining
    
    // Model performance
    bestPerformingModel: text('best_performing_model'),
    modelComparison: jsonb('model_comparison').default([]), // [{model, error, accuracy}]
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Cash Flow Tracker - Real-time cash position tracking
export const cashFlowTracker = pgTable('cash_flow_tracker', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Current status
    trackingDate: timestamp('tracking_date').notNull(),
    currentBalance: numeric('current_balance', { precision: 15, scale: 2 }).notNull(),
    
    // Today's activity
    incomingToday: numeric('incoming_today', { precision: 15, scale: 2 }).default('0'),
    outgoingToday: numeric('outgoing_today', { precision: 15, scale: 2 }).default('0'),
    netToday: numeric('net_today', { precision: 15, scale: 2 }).default('0'),
    
    // Upcoming (next 7 days)
    incomingNext7Days: numeric('incoming_next_7_days', { precision: 15, scale: 2 }).default('0'),
    outgoingNext7Days: numeric('outgoing_next_7_days', { precision: 15, scale: 2 }).default('0'),
    netNext7Days: numeric('net_next_7_days', { precision: 15, scale: 2 }).default('0'),
    
    // Forecast alignment
    forecastedBalance: numeric('forecasted_balance', { precision: 15, scale: 2 }),
    varianceFromForecast: numeric('variance_from_forecast', { precision: 15, scale: 2 }),
    
    // Health indicators
    isHealthy: boolean('is_healthy').default(true),
    healthScore: integer('health_score').default(100), // 0-100
    warnings: jsonb('warnings').default([]),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const cashFlowForecastsRelations = relations(cashFlowForecasts, ({ one }) => ({
    user: one(users, { fields: [cashFlowForecasts.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [cashFlowForecasts.tenantId], references: [tenants.id] }),
}));

export const seasonalPatternsRelations = relations(seasonalPatterns, ({ one }) => ({
    user: one(users, { fields: [seasonalPatterns.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [seasonalPatterns.tenantId], references: [tenants.id] }),
}));

export const budgetVarianceAnalysisRelations = relations(budgetVarianceAnalysis, ({ one }) => ({
    user: one(users, { fields: [budgetVarianceAnalysis.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [budgetVarianceAnalysis.tenantId], references: [tenants.id] }),
    budget: one(budgets, { fields: [budgetVarianceAnalysis.budgetId], references: [budgets.id] }),
}));

export const spendingPredictionsRelations = relations(spendingPredictions, ({ one }) => ({
    user: one(users, { fields: [spendingPredictions.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [spendingPredictions.tenantId], references: [tenants.id] }),
}));

export const irregularExpensesRelations = relations(irregularExpenses, ({ one }) => ({
    user: one(users, { fields: [irregularExpenses.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [irregularExpenses.tenantId], references: [tenants.id] }),
}));

export const sensitivityAnalysisRelations = relations(sensitivityAnalysis, ({ one }) => ({
    user: one(users, { fields: [sensitivityAnalysis.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [sensitivityAnalysis.tenantId], references: [tenants.id] }),
}));

export const forecastAlertsRelations = relations(forecastAlerts, ({ one }) => ({
    user: one(users, { fields: [forecastAlerts.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [forecastAlerts.tenantId], references: [tenants.id] }),
    forecast: one(cashFlowForecasts, { fields: [forecastAlerts.forecastId], references: [cashFlowForecasts.id] }),
    irregularExpense: one(irregularExpenses, { fields: [forecastAlerts.irregularExpenseId], references: [irregularExpenses.id] }),
}));

export const forecastAccuracyMetricsRelations = relations(forecastAccuracyMetrics, ({ one }) => ({
    user: one(users, { fields: [forecastAccuracyMetrics.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [forecastAccuracyMetrics.tenantId], references: [tenants.id] }),
}));

export const cashFlowTrackerRelations = relations(cashFlowTracker, ({ one }) => ({
    user: one(users, { fields: [cashFlowTracker.userId], references: [users.id] }),
    tenant: one(tenants, { fields: [cashFlowTracker.tenantId], references: [tenants.id] }),
}));
