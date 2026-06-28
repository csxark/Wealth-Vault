/**
 * Goal Contribution Volatility Smoother Service - Issue #713
 * 
 * Limits abrupt contribution changes using rolling cashflow averages and guardrails
 * to prevent unstable savings behavior and help users meet their goals.
 * 
 * @module services/goalContributionSmoothingService
 */

import { and, eq, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import db from '../config/db.js';
import {
    goalContributionSmoothingConfigs,
    goalCashflowHistory,
    goalContributionRecommendations,
    goalCashflowEvents,
    goals,
    goalContributionLineItems,
    expenses
} from '../db/schema.js';

class GoalContributionSmoothingService {
    /**
     * Get or create smoothing configuration for a user/goal
     */
    async getOrCreateConfig(userId, goalId = null, vaultId = null) {
        let config;

        if (goalId) {
            [config] = await db
                .select()
                .from(goalContributionSmoothingConfigs)
                .where(
                    and(
                        eq(goalContributionSmoothingConfigs.userId, userId),
                        eq(goalContributionSmoothingConfigs.goalId, goalId)
                    )
                )
                .limit(1);
        } else {
            [config] = await db
                .select()
                .from(goalContributionSmoothingConfigs)
                .where(
                    and(
                        eq(goalContributionSmoothingConfigs.userId, userId),
                        sql`${goalContributionSmoothingConfigs.goalId} IS NULL`
                    )
                )
                .limit(1);
        }

        if (!config) {
            [config] = await db
                .insert(goalContributionSmoothingConfigs)
                .values({
                    userId,
                    goalId,
                    vaultId,
                    rollingWindowMonths: 3,
                    smoothingFactor: 0.70,
                    varianceThresholdPercentage: 25.00,
                    maxMonthOverMonthChangePct: 30.00,
                    enableSmoothing: true,
                    enableCashflowDetection: true,
                })
                .returning();
        }

        return config;
    }

    /**
     * Update smoothing configuration
     */
    async updateConfig(configId, updates) {
        const [updated] = await db
            .update(goalContributionSmoothingConfigs)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(goalContributionSmoothingConfigs.id, configId))
            .returning();

        return updated;
    }

    /**
     * Calculate and store cashflow history for a period
     */
    async calculateCashflowPeriod(userId, periodStart, periodEnd, vaultId = null, periodType = 'monthly') {
        const periodStartDate = new Date(periodStart);
        const periodEndDate = new Date(periodEnd);

        // Get income and expenses for the period
        const expenseQuery = db
            .select({
                amount: expenses.amount,
                date: expenses.date,
                categoryId: expenses.categoryId,
            })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, periodStartDate),
                    lte(expenses.date, periodEndDate),
                    vaultId ? eq(expenses.vaultId, vaultId) : sql`1=1`
                )
            );

        const expenseData = await expenseQuery;

        // Separate income (negative amounts) from expenses (positive amounts)
        const income = expenseData
            .filter(e => parseFloat(e.amount) < 0)
            .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount)), 0);

        const realExpenses = expenseData
            .filter(e => parseFloat(e.amount) > 0)
            .reduce((sum, e) => sum + parseFloat(e.amount), 0);

        const netCashflow = income - realExpenses;

        // Get goal contributions for the period
        const contributions = await db
            .select({
                amount: goalContributionLineItems.rawAmount,
            })
            .from(goalContributionLineItems)
            .where(
                and(
                    eq(goalContributionLineItems.userId, userId),
                    gte(goalContributionLineItems.createdAt, periodStartDate),
                    lte(goalContributionLineItems.createdAt, periodEndDate)
                )
            );

        const totalContributions = contributions.reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const contributionCount = contributions.length;

        // Calculate volatility (standard deviation)
        const expenseAmounts = expenseData.map(e => Math.abs(parseFloat(e.amount)));
        const expenseVolatility = this.calculateStandardDeviation(expenseAmounts);
        const cashflowVolatility = this.calculateStandardDeviation([netCashflow]);

        // Estimate discretionary cashflow (simplified - could be enhanced with category analysis)
        const discretionaryCashflow = netCashflow * 0.3; // Rough estimate - 30% of net cashflow

        // Check if record already exists
        const [existing] = await db
            .select()
            .from(goalCashflowHistory)
            .where(
                and(
                    eq(goalCashflowHistory.userId, userId),
                    eq(goalCashflowHistory.periodStart, periodStartDate),
                    eq(goalCashflowHistory.periodType, periodType),
                    vaultId ? eq(goalCashflowHistory.vaultId, vaultId) : sql`${goalCashflowHistory.vaultId} IS NULL`
                )
            )
            .limit(1);

        if (existing) {
            // Update existing record
            const [updated] = await db
                .update(goalCashflowHistory)
                .set({
                    totalIncome: income.toFixed(2),
                    totalExpenses: realExpenses.toFixed(2),
                    netCashflow: netCashflow.toFixed(2),
                    discretionaryCashflow: discretionaryCashflow.toFixed(2),
                    totalGoalContributions: totalContributions.toFixed(2),
                    contributionCount,
                    expenseVolatility: expenseVolatility.toFixed(2),
                    cashflowVolatility: cashflowVolatility.toFixed(2),
                    isComplete: true,
                })
                .where(eq(goalCashflowHistory.id, existing.id))
                .returning();

            return updated;
        } else {
            // Insert new record
            const [record] = await db
                .insert(goalCashflowHistory)
                .values({
                    userId,
                    vaultId,
                    periodStart: periodStartDate,
                    periodEnd: periodEndDate,
                    periodType,
                    totalIncome: income.toFixed(2),
                    totalExpenses: realExpenses.toFixed(2),
                    netCashflow: netCashflow.toFixed(2),
                    discretionaryCashflow: discretionaryCashflow.toFixed(2),
                    totalGoalContributions: totalContributions.toFixed(2),
                    contributionCount,
                    expenseVolatility: expenseVolatility.toFixed(2),
                    cashflowVolatility: cashflowVolatility.toFixed(2),
                    dataSource: 'calculated',
                    isComplete: true,
                })
                .returning();

            return record;
        }
    }

    /**
     * Calculate standard deviation for volatility metrics
     */
    calculateStandardDeviation(values) {
        if (!values || values.length === 0) return 0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
        return Math.sqrt(variance);
    }

    /**
     * Get rolling cashflow averages
     */
    async getRollingAverages(userId, windowMonths = 3, vaultId = null) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - windowMonths);

        const history = await db
            .select()
            .from(goalCashflowHistory)
            .where(
                and(
                    eq(goalCashflowHistory.userId, userId),
                    gte(goalCashflowHistory.periodStart, startDate),
                    eq(goalCashflowHistory.isComplete, true),
                    vaultId ? eq(goalCashflowHistory.vaultId, vaultId) : sql`1=1`
                )
            )
            .orderBy(desc(goalCashflowHistory.periodStart));

        if (history.length === 0) {
            return {
                avgNetCashflow: 0,
                avgDiscretionaryCashflow: 0,
                avgContributions: 0,
                avgVolatility: 0,
                periodCount: 0,
                trend: 'unknown',
            };
        }

        const avgNetCashflow = history.reduce((sum, h) => sum + parseFloat(h.netCashflow), 0) / history.length;
        const avgDiscretionaryCashflow = history.reduce((sum, h) => sum + parseFloat(h.discretionaryCashflow || 0), 0) / history.length;
        const avgContributions = history.reduce((sum, h) => sum + parseFloat(h.totalGoalContributions), 0) / history.length;
        const avgVolatility = history.reduce((sum, h) => sum + parseFloat(h.cashflowVolatility || 0), 0) / history.length;

        // Determine trend
        let trend = 'stable';
        if (history.length >= 2) {
            const recent = parseFloat(history[0].netCashflow);
            const older = parseFloat(history[history.length - 1].netCashflow);
            const change = ((recent - older) / Math.abs(older)) * 100;

            if (change > 15) trend = 'increasing';
            else if (change < -15) trend = 'decreasing';
            else if (avgVolatility > avgNetCashflow * 0.3) trend = 'volatile';
        }

        return {
            avgNetCashflow,
            avgDiscretionaryCashflow,
            avgContributions,
            avgVolatility,
            periodCount: history.length,
            trend,
        };
    }

    /**
     * Detect major cashflow shifts
     */
    async detectCashflowShift(userId, currentValue, vaultId = null) {
        const averages = await this.getRollingAverages(userId, 3, vaultId);

        if (averages.periodCount < 2) {
            return null; // Not enough data
        }

        const percentageChange = ((currentValue - averages.avgNetCashflow) / Math.abs(averages.avgNetCashflow)) * 100;
        const deviationFromNorm = averages.avgVolatility > 0 
            ? Math.abs(currentValue - averages.avgNetCashflow) / averages.avgVolatility 
            : 0;

        // Determine event type and severity
        let eventType = null;
        let severity = null;

        if (Math.abs(percentageChange) > 50) {
            severity = 'critical';
            eventType = percentageChange > 0 ? 'income_spike' : 'income_drop';
        } else if (Math.abs(percentageChange) > 30) {
            severity = 'major';
            eventType = percentageChange > 0 ? 'income_spike' : 'income_drop';
        } else if (Math.abs(percentageChange) > 15) {
            severity = 'moderate';
            eventType = 'pattern_change';
        } else if (deviationFromNorm > 2) {
            severity = 'moderate';
            eventType = 'pattern_change';
        }

        if (!eventType) {
            return null; // No significant shift
        }

        // Create cashflow event
        const [event] = await db
            .insert(goalCashflowEvents)
            .values({
                userId,
                vaultId,
                eventType,
                detectedAt: new Date(),
                eventDate: new Date(),
                severity,
                previousAvgValue: averages.avgNetCashflow.toFixed(2),
                newValue: currentValue.toFixed(2),
                percentageChange: percentageChange.toFixed(2),
                deviationFromNorm: deviationFromNorm.toFixed(2),
                requiresUserAction: severity === 'critical' || severity === 'major',
                description: `${eventType.replace('_', ' ')} detected: ${percentageChange.toFixed(1)}% change from rolling average`,
            })
            .returning();

        return event;
    }

    /**
     * Calculate smoothed contribution recommendation
     */
    async calculateSmoothedRecommendation(userId, goalId, vaultId = null) {
        // Get config
        const config = await this.getOrCreateConfig(userId, goalId, vaultId);

        if (!config.enableSmoothing) {
            return null; // Smoothing disabled
        }

        // Get goal details
        const [goal] = await db
            .select()
            .from(goals)
            .where(eq(goals.id, goalId))
            .limit(1);

        if (!goal) {
            throw new Error('Goal not found');
        }

        // Calculate raw required amount based on goal
        const targetAmount = parseFloat(goal.targetAmount);
        const currentAmount = parseFloat(goal.currentAmount || 0);
        const remaining = targetAmount - currentAmount;

        const targetDate = new Date(goal.targetDate);
        const now = new Date();
        const monthsRemaining = Math.max(1, (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));

        const rawCalculatedAmount = remaining / monthsRemaining;

        // Get rolling averages
        const averages = await this.getRollingAverages(userId, config.rollingWindowMonths, vaultId);

        // Get previous recommendation
        const [previousRec] = await db
            .select()
            .from(goalContributionRecommendations)
            .where(
                and(
                    eq(goalContributionRecommendations.goalId, goalId),
                    eq(goalContributionRecommendations.userId, userId)
                )
            )
            .orderBy(desc(goalContributionRecommendations.recommendationDate))
            .limit(1);

        const previousAmount = previousRec ? parseFloat(previousRec.smoothedAmount) : rawCalculatedAmount;

        // Apply exponential smoothing
        const smoothingFactor = parseFloat(config.smoothingFactor);
        let smoothedAmount = (smoothingFactor * rawCalculatedAmount) + ((1 - smoothingFactor) * previousAmount);

        // Apply guardrails
        const maxChange = parseFloat(config.maxMonthOverMonthChangePct) / 100;
        const maxAllowedChange = previousAmount * maxChange;

        if (Math.abs(smoothedAmount - previousAmount) > maxAllowedChange) {
            // Limit the change to max allowed
            if (smoothedAmount > previousAmount) {
                smoothedAmount = previousAmount + maxAllowedChange;
            } else {
                smoothedAmount = previousAmount - maxAllowedChange;
            }
        }

        // Apply min/max constraints
        if (config.minContributionAmount && smoothedAmount < parseFloat(config.minContributionAmount)) {
            smoothedAmount = parseFloat(config.minContributionAmount);
        }
        if (config.maxContributionAmount && smoothedAmount > parseFloat(config.maxContributionAmount)) {
            smoothedAmount = parseFloat(config.maxContributionAmount);
        }

        // Calculate variance band
        const variancePct = parseFloat(config.varianceThresholdPercentage) / 100;
        const varianceBandLower = smoothedAmount * (1 - variancePct);
        const varianceBandUpper = smoothedAmount * (1 + variancePct);

        // Calculate confidence score
        const confidenceScore = this.calculateConfidenceScore(averages, config);
        const confidenceLevel = this.getConfidenceLevel(confidenceScore);

        // Calculate stability index
        const stabilityIndex = averages.avgVolatility > 0
            ? Math.max(0, 100 - (averages.avgVolatility / averages.avgNetCashflow) * 100)
            : 50;

        // Detect major cashflow shift
        const majorShift = await this.detectCashflowShift(userId, averages.avgNetCashflow, vaultId);
        const majorCashflowShiftDetected = !!majorShift;

        // Calculate changes
        const amountChange = smoothedAmount - previousAmount;
        const amountChangePercentage = previousAmount !== 0 
            ? (amountChange / previousAmount) * 100 
            : 0;

        // Create recommendation
        const validFrom = new Date();
        const validUntil = new Date();
        validUntil.setMonth(validUntil.getMonth() + 1);

        const [recommendation] = await db
            .insert(goalContributionRecommendations)
            .values({
                userId,
                goalId,
                vaultId,
                configId: config.id,
                recommendationDate: new Date(),
                validFrom,
                validUntil,
                rawCalculatedAmount: rawCalculatedAmount.toFixed(2),
                smoothedAmount: smoothedAmount.toFixed(2),
                previousAmount: previousAmount.toFixed(2),
                amountChange: amountChange.toFixed(2),
                amountChangePercentage: amountChangePercentage.toFixed(2),
                varianceBandLower: varianceBandLower.toFixed(2),
                varianceBandUpper: varianceBandUpper.toFixed(2),
                varianceBandPercentage: config.varianceThresholdPercentage,
                confidenceScore: confidenceScore.toFixed(2),
                confidenceLevel,
                stabilityIndex: stabilityIndex.toFixed(2),
                rollingAvgCashflow: averages.avgNetCashflow.toFixed(2),
                rollingAvgContributions: averages.avgContributions.toFixed(2),
                cashflowTrend: averages.trend,
                majorCashflowShiftDetected,
                status: 'pending',
                algorithmVersion: 'v1.0',
                calculationMetadata: {
                    monthsRemaining: monthsRemaining.toFixed(1),
                    targetAmount,
                    currentAmount,
                    remaining,
                    smoothingFactor,
                    rollingWindowMonths: config.rollingWindowMonths,
                },
            })
            .returning();

        // Update config last calculated timestamp
        await db
            .update(goalContributionSmoothingConfigs)
            .set({ lastCalculatedAt: new Date() })
            .where(eq(goalContributionSmoothingConfigs.id, config.id));

        return recommendation;
    }

    /**
     * Calculate confidence score based on data quality and stability
     */
    calculateConfidenceScore(averages, config) {
        let score = 50; // Base score

        // More periods = higher confidence (up to +30 points)
        const periodBonus = Math.min(30, averages.periodCount * 10);
        score += periodBonus;

        // Lower volatility = higher confidence (up to +20 points)
        if (averages.avgNetCashflow > 0) {
            const volatilityRatio = averages.avgVolatility / averages.avgNetCashflow;
            const volatilityBonus = Math.max(0, 20 - (volatilityRatio * 100));
            score += volatilityBonus;
        }

        // Stable trend = higher confidence (+10 points)
        if (averages.trend === 'stable') {
            score += 10;
        } else if (averages.trend === 'volatile') {
            score -= 10;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get confidence level from score
     */
    getConfidenceLevel(score) {
        if (score >= 80) return 'very_high';
        if (score >= 65) return 'high';
        if (score >= 45) return 'moderate';
        if (score >= 25) return 'low';
        return 'very_low';
    }

    /**
     * Get latest recommendation for a goal
     */
    async getLatestRecommendation(userId, goalId) {
        const [recommendation] = await db
            .select()
            .from(goalContributionRecommendations)
            .where(
                and(
                    eq(goalContributionRecommendations.userId, userId),
                    eq(goalContributionRecommendations.goalId, goalId),
                    gte(goalContributionRecommendations.validUntil, new Date())
                )
            )
            .orderBy(desc(goalContributionRecommendations.recommendationDate))
            .limit(1);

        return recommendation;
    }

    /**
     * Accept a recommendation
     */
    async acceptRecommendation(recommendationId, userId) {
        const [updated] = await db
            .update(goalContributionRecommendations)
            .set({
                status: 'accepted',
                acceptedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(goalContributionRecommendations.id, recommendationId),
                    eq(goalContributionRecommendations.userId, userId)
                )
            )
            .returning();

        return updated;
    }

    /**
     * Reject or override a recommendation
     */
    async overrideRecommendation(recommendationId, userId, overrideAmount, reason, feedback = null) {
        const [updated] = await db
            .update(goalContributionRecommendations)
            .set({
                status: 'overridden',
                overrideAmount: overrideAmount.toFixed(2),
                overrideReason: reason,
                userFeedback: feedback,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(goalContributionRecommendations.id, recommendationId),
                    eq(goalContributionRecommendations.userId, userId)
                )
            )
            .returning();

        return updated;
    }

    /**
     * Get cashflow events for a user
     */
    async getCashflowEvents(userId, options = {}) {
        const { unacknowledgedOnly = false, limit = 10 } = options;

        const conditions = [eq(goalCashflowEvents.userId, userId)];

        if (unacknowledgedOnly) {
            conditions.push(eq(goalCashflowEvents.acknowledged, false));
        }

        const events = await db
            .select()
            .from(goalCashflowEvents)
            .where(and(...conditions))
            .orderBy(desc(goalCashflowEvents.detectedAt))
            .limit(limit);

        return events;
    }

    /**
     * Acknowledge a cashflow event
     */
    async acknowledgeCashflowEvent(eventId, userId) {
        const [updated] = await db
            .update(goalCashflowEvents)
            .set({
                acknowledged: true,
                acknowledgedAt: new Date(),
            })
            .where(
                and(
                    eq(goalCashflowEvents.id, eventId),
                    eq(goalCashflowEvents.userId, userId)
                )
            )
            .returning();

        return updated;
    }

    /**
     * Get recommendation history for a goal
     */
    async getRecommendationHistory(userId, goalId, limit = 12) {
        const history = await db
            .select()
            .from(goalContributionRecommendations)
            .where(
                and(
                    eq(goalContributionRecommendations.userId, userId),
                    eq(goalContributionRecommendations.goalId, goalId)
                )
            )
            .orderBy(desc(goalContributionRecommendations.recommendationDate))
            .limit(limit);

        return history;
    }

    /**
     * Bulk calculate recommendations for all active goals
     */
    async calculateAllRecommendations(userId, vaultId = null) {
        // Get all active goals for the user
        const userGoals = await db
            .select()
            .from(goals)
            .where(
                and(
                    eq(goals.userId, userId),
                    inArray(goals.status, ['active', 'planning', 'on_track', 'off_track']),
                    vaultId ? eq(goals.vaultId, vaultId) : sql`1=1`
                )
            );

        const recommendations = [];

        for (const goal of userGoals) {
            try {
                const recommendation = await this.calculateSmoothedRecommendation(userId, goal.id, vaultId);
                if (recommendation) {
                    recommendations.push(recommendation);
                }
            } catch (error) {
                console.error(`Error calculating recommendation for goal ${goal.id}:`, error);
            }
        }

        return recommendations;
    }
}

export default new GoalContributionSmoothingService();
