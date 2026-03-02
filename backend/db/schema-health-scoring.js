import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, tenants } from './schema.js';

/**
 * Financial Health Scoring & Insights Schema
 * Issue #667
 * 
 * Provides holistic financial health tracking with:
 * - Wealth score (0-850 credit score style)
 * - Financial health dashboard
 * - Spending heatmaps
 * - Peer benchmarking
 * - Personalized recommendations
 * - Wellness trends over time
 */

// Enum for health score status
export const healthScoreStatusEnum = pgEnum('health_score_status', ['excellent', 'good', 'fair', 'poor', 'critical']);
export const recommendationPriorityEnum = pgEnum('recommendation_priority', ['critical', 'high', 'medium', 'low']);
export const recommendationStatusEnum = pgEnum('recommendation_status', ['pending', 'in_progress', 'completed', 'dismissed', 'expired']);

// Financial Health Scores - Main scoring table
export const financialHealthScores = pgTable('financial_health_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Overall wealth score (0-850, like credit score)
    wealthScore: integer('wealth_score').notNull(), // 0-850
    previousScore: integer('previous_score'), // For trend analysis
    scoreChange: integer('score_change'), // Change from previous calculation
    
    // Component scores (each 0-100)
    savingsScore: integer('savings_score').notNull().default(0), // Emergency fund, savings rate
    debtScore: integer('debt_score').notNull().default(0), // Debt-to-income, credit utilization
    spendingScore: integer('spending_score').notNull().default(0), // Budget adherence, spending patterns
    investmentScore: integer('investment_score').notNull().default(0), // Portfolio health, diversification
    incomeScore: integer('income_score').notNull().default(0), // Income stability, growth
    
    // Health status derived from score
    healthStatus: healthScoreStatusEnum('health_status').notNull(),
    
    // Key metrics used in calculation
    metrics: jsonb('metrics').notNull().default({
        // Savings metrics
        emergencyFundMonths: 0,
        savingsRate: 0,
        liquidAssets: 0,
        
        // Debt metrics
        debtToIncomeRatio: 0,
        creditUtilization: 0,
        totalDebt: 0,
        monthlyDebtPayments: 0,
        
        // Spending metrics
        budgetAdherence: 0,
        spendingVariability: 0,
        discretionarySpending: 0,
        essentialSpending: 0,
        
        // Investment metrics
        portfolioValue: 0,
        portfolioDiversification: 0,
        investmentReturns: 0,
        riskAdjustedReturns: 0,
        
        // Income metrics
        monthlyIncome: 0,
        incomeGrowthRate: 0,
        incomeStability: 0,
        multipleIncomeStreams: false
    }),
    
    // Benchmarking data
    peerComparison: jsonb('peer_comparison').default({
        percentile: 50, // User's percentile vs peers
        ageGroupAverage: 500,
        incomeGroupAverage: 500,
        regionAverage: 500
    }),
    
    // Calculation metadata
    calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
    calculationVersion: text('calculation_version').notNull().default('1.0'),
    dataQuality: integer('data_quality').notNull().default(100), // 0-100, completeness of data
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Health Score History - Track scores over time
export const healthScoreHistory = pgTable('health_score_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scoreId: uuid('score_id').references(() => financialHealthScores.id, { onDelete: 'cascade' }),
    
    // Historical snapshot
    wealthScore: integer('wealth_score').notNull(),
    savingsScore: integer('savings_score').notNull(),
    debtScore: integer('debt_score').notNull(),
    spendingScore: integer('spending_score').notNull(),
    investmentScore: integer('investment_score').notNull(),
    incomeScore: integer('income_score').notNull(),
    
    healthStatus: healthScoreStatusEnum('health_status').notNull(),
    
    // Snapshot date
    snapshotDate: timestamp('snapshot_date').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Spending Heatmaps - Analyze spending patterns by category, time, location
export const spendingHeatmaps = pgTable('spending_heatmaps', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Time period for this heatmap
    period: text('period').notNull(), // 'daily', 'weekly', 'monthly'
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    
    // Heatmap data structures
    categoryHeatmap: jsonb('category_heatmap').notNull().default({}), // { categoryId: { day: amount } }
    timeOfDayHeatmap: jsonb('time_of_day_heatmap').notNull().default({}), // { hour: amount }
    dayOfWeekHeatmap: jsonb('day_of_week_heatmap').notNull().default({}), // { dayName: amount }
    merchantHeatmap: jsonb('merchant_heatmap').notNull().default({}), // { merchantName: { count, amount } }
    
    // Insights derived from heatmap
    peakSpendingTimes: jsonb('peak_spending_times').default([]), // ['Saturday evenings', 'Weekday lunches']
    topCategories: jsonb('top_categories').default([]), // [{ categoryId, amount, percentage }]
    spendingPatterns: jsonb('spending_patterns').default([]), // ['Weekend spender', 'Online shopping heavy']
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Peer Benchmarks - Anonymized aggregated data for comparison
export const peerBenchmarks = pgTable('peer_benchmarks', {
    id: uuid('id').defaultRandom().primaryKey(),
    
    // Segment definition
    ageMin: integer('age_min'),
    ageMax: integer('age_max'),
    incomeMin: integer('income_min'),
    incomeMax: integer('income_max'),
    region: text('region'), // Country or region code
    
    // Aggregate statistics
    avgWealthScore: numeric('avg_wealth_score', { precision: 5, scale: 2 }),
    medianWealthScore: integer('median_wealth_score'),
    p25WealthScore: integer('p25_wealth_score'), // 25th percentile
    p75WealthScore: integer('p75_wealth_score'), // 75th percentile
    
    // Component averages
    avgSavingsScore: numeric('avg_savings_score', { precision: 5, scale: 2 }),
    avgDebtScore: numeric('avg_debt_score', { precision: 5, scale: 2 }),
    avgSpendingScore: numeric('avg_spending_score', { precision: 5, scale: 2 }),
    avgInvestmentScore: numeric('avg_investment_score', { precision: 5, scale: 2 }),
    avgIncomeScore: numeric('avg_income_score', { precision: 5, scale: 2 }),
    
    // Sample size and confidence
    sampleSize: integer('sample_size').notNull(),
    confidenceLevel: numeric('confidence_level', { precision: 4, scale: 2 }), // 95.00 for 95%
    
    // Calculation metadata
    calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
    validUntil: timestamp('valid_until').notNull(),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Personalized Recommendations - AI-driven financial advice
export const healthRecommendations = pgTable('health_recommendations', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scoreId: uuid('score_id').references(() => financialHealthScores.id, { onDelete: 'cascade' }),
    
    // Recommendation details
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(), // 'savings', 'debt', 'spending', 'investment', 'income'
    priority: recommendationPriorityEnum('priority').notNull(),
    status: recommendationStatusEnum('status').notNull().default('pending'),
    
    // Impact estimation
    estimatedScoreImpact: integer('estimated_score_impact'), // +10, +25, etc.
    estimatedDollarImpact: integer('estimated_dollar_impact'), // Annual dollar impact
    estimatedTimeframe: text('estimated_timeframe'), // '1 month', '3 months', '1 year'
    
    // Action items
    actionItems: jsonb('action_items').notNull().default([]), // [{ step, completed, link }]
    
    // Tracking
    viewedAt: timestamp('viewed_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    dismissedAt: timestamp('dismissed_at'),
    expiresAt: timestamp('expires_at'),
    
    // Recommendation metadata
    generatedBy: text('generated_by').notNull().default('system'), // 'system', 'ai', 'advisor'
    confidence: numeric('confidence', { precision: 4, scale: 2 }), // 0.00 - 1.00
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Wellness Trends - Track various wellness metrics over time
export const wellnessTrends = pgTable('wellness_trends', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Trend period
    trendDate: timestamp('trend_date').notNull(), // Date of this data point
    
    // Financial wellness metrics
    netWorth: integer('net_worth'),
    liquidNetWorth: integer('liquid_net_worth'),
    savingsRate: numeric('savings_rate', { precision: 5, scale: 2 }), // Percentage
    debtToIncomeRatio: numeric('debt_to_income_ratio', { precision: 5, scale: 2 }),
    
    // Behavioral metrics
    budgetAdherence: numeric('budget_adherence', { precision: 5, scale: 2 }),
    savingsGoalProgress: numeric('savings_goal_progress', { precision: 5, scale: 2 }),
    investmentGrowth: numeric('investment_growth', { precision: 5, scale: 2 }),
    
    // Stress indicators (derived from spending patterns)
    financialStressScore: integer('financial_stress_score'), // 0-100, higher = more stress
    spendingVolatility: numeric('spending_volatility', { precision: 5, scale: 2 }),
    emergencyFundCoverage: numeric('emergency_fund_coverage', { precision: 5, scale: 2 }), // Months
    
    // Metadata
    dataQuality: integer('data_quality').notNull().default(100),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Indexes for performance
// (These will be created in the migration SQL file)

// Relations
export const financialHealthScoresRelations = relations(financialHealthScores, ({ one, many }) => ({
    user: one(users, {
        fields: [financialHealthScores.userId],
        references: [users.id]
    }),
    tenant: one(tenants, {
        fields: [financialHealthScores.tenantId],
        references: [tenants.id]
    }),
    history: many(healthScoreHistory),
    recommendations: many(healthRecommendations)
}));

export const healthRecommendationsRelations = relations(healthRecommendations, ({ one }) => ({
    user: one(users, {
        fields: [healthRecommendations.userId],
        references: [users.id]
    }),
    tenant: one(tenants, {
        fields: [healthRecommendations.tenantId],
        references: [tenants.id]
    }),
    score: one(financialHealthScores, {
        fields: [healthRecommendations.scoreId],
        references: [financialHealthScores.id]
    })
}));

export const spendingHeatmapsRelations = relations(spendingHeatmaps, ({ one }) => ({
    user: one(users, {
        fields: [spendingHeatmaps.userId],
        references: [users.id]
    }),
    tenant: one(tenants, {
        fields: [spendingHeatmaps.tenantId],
        references: [tenants.id]
    })
}));

export const wellnessTrendsRelations = relations(wellnessTrends, ({ one }) => ({
    user: one(users, {
        fields: [wellnessTrends.userId],
        references: [users.id]
    }),
    tenant: one(tenants, {
        fields: [wellnessTrends.tenantId],
        references: [tenants.id]
    })
}));
