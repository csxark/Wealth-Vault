/**
 * Goal Adjustment Explainability Service - Issue #715
 * 
 * Captures, analyzes, and stores detailed explanations for goal contribution
 * recommendation adjustments with factor-level attribution
 * 
 * @module services/goalAdjustmentExplainabilityService
 */

import { and, eq, desc, gte, lte, sql, asc } from 'drizzle-orm';
import db from '../config/db.js';
import {
    goalAdjustmentExplanations,
    goalAdjustmentAttributionDetails,
    goalAdjustmentTimeline,
    goalAdjustmentInsights,
    goalAdjustmentComparison,
    goalContributionRecommendations,
    goalCashflowHistory,
    goals,
    expenses,
} from '../db/schema.js';

class GoalAdjustmentExplainabilityService {
    /**
     * Log a goal adjustment event with detailed attribution
     * @param {Object} adjustmentData
     * @returns {Promise<Object>} Created explanation record
     */
    async logAdjustment(adjustmentData) {
        const {
            tenantId,
            userId,
            goalId,
            previousRecommendationId,
            newRecommendationId,
            previousAmount,
            newAmount,
            triggerSource,
            attributionFactors = [],
            incomeDelta = null,
            incomeDeltaPct = null,
            expenseDelta = null,
            expenseDeltaPct = null,
            daysToDeadline = null,
            deadlinePressureScore = null,
            priorityShift = null,
            goalProgressPct = null,
            goalRemainingDays = null,
            confidenceScore,
            confidenceLevel,
        } = adjustmentData;

        // Calculate change metrics
        const amountChange = newAmount - previousAmount;
        const amountChangePercentage = previousAmount !== 0 
            ? ((amountChange / previousAmount) * 100).toFixed(2)
            : 0;

        // Generate human-readable summary
        const summary = this.generateSummary({
            previousAmount,
            newAmount,
            amountChangePercentage,
            triggerSource,
            attributionFactors,
            incomeDelta,
            expenseDelta,
            deadlinePressureScore,
            priorityShift,
        });

        // Determine severity
        const severity = this.determineSeverity(Math.abs(amountChangePercentage), attributionFactors);

        // Create the explanation record
        const [explanation] = await db
            .insert(goalAdjustmentExplanations)
            .values({
                tenantId,
                userId,
                goalId,
                previousRecommendationId,
                newRecommendationId,
                previousAmount: parseFloat(previousAmount),
                newAmount: parseFloat(newAmount),
                amountChange: parseFloat(amountChange),
                amountChangePercentage: parseFloat(amountChangePercentage),
                attributionFactors,
                incomeDelta: incomeDelta ? parseFloat(incomeDelta) : null,
                incomeDeltaPct: incomeDeltaPct ? parseFloat(incomeDeltaPct) : null,
                expenseDelta: expenseDelta ? parseFloat(expenseDelta) : null,
                expenseDeltaPct: expenseDeltaPct ? parseFloat(expenseDeltaPct) : null,
                daysToDeadline,
                deadlinePressureScore: deadlinePressureScore ? parseFloat(deadlinePressureScore) : null,
                priorityShift,
                goalProgressPct: goalProgressPct ? parseFloat(goalProgressPct) : null,
                goalRemainingDays,
                confidenceScore: parseFloat(confidenceScore),
                confidenceLevel,
                summary,
                triggerSource,
                severity,
            })
            .returning();

        // Log attribution details
        if (attributionFactors && attributionFactors.length > 0) {
            const attributionRecords = attributionFactors.map(factor => ({
                explanationId: explanation.id,
                factorCategory: factor.category,
                factorName: factor.name,
                factorDescription: factor.description,
                impactPercentage: parseFloat(factor.impact_pct),
                impactAmount: factor.impact_amount ? parseFloat(factor.impact_amount) : null,
                confidenceScore: factor.confidence ? parseFloat(factor.confidence) : null,
                previousValue: factor.previous_value ? parseFloat(factor.previous_value) : null,
                currentValue: factor.current_value ? parseFloat(factor.current_value) : null,
                thresholdValue: factor.threshold_value ? parseFloat(factor.threshold_value) : null,
                comparisonText: factor.comparison_text,
                severityIndicator: factor.severity_indicator,
                metricSource: factor.metric_source,
                dataLookbackDays: factor.data_lookback_days,
            }));

            await db.insert(goalAdjustmentAttributionDetails).values(attributionRecords);
        }

        // Add to timeline immediately
        const [goal] = await db
            .select({ id: goals.id })
            .from(goals)
            .where(eq(goals.id, goalId))
            .limit(1);

        if (goal) {
            const eventSequence = await this.getNextSequenceNumber(userId, goalId);
            const primaryFactor = attributionFactors.length > 0 
                ? attributionFactors[0].name
                : 'unknown';

            await db.insert(goalAdjustmentTimeline).values({
                userId,
                goalId,
                eventDate: new Date(),
                eventSequence,
                explanationId: explanation.id,
                previousRecommendationAmount: parseFloat(previousAmount),
                newRecommendationAmount: parseFloat(newAmount),
                primaryDriverFactor: primaryFactor,
            });
        }

        return explanation;
    }

    /**
     * Get adjustment history for a goal with optional pagination
     * @param {string} userId
     * @param {string} goalId
     * @param {Object} options - { limit: 20, offset: 0, sortBy: 'date', sortOrder: 'desc' }
     * @returns {Promise<Array>}
     */
    async getAdjustmentHistory(userId, goalId, options = {}) {
        const { limit = 20, offset = 0, sortBy = 'date', sortOrder = 'desc' } = options;

        const conditions = [
            eq(goalAdjustmentExplanations.userId, userId),
            eq(goalAdjustmentExplanations.goalId, goalId),
        ];

        const orderFn = sortOrder === 'desc' ? desc : asc;
        let orderColumn = goalAdjustmentExplanations.createdAt;

        if (sortBy === 'amount_change') {
            orderColumn = goalAdjustmentExplanations.amountChange;
        } else if (sortBy === 'severity') {
            orderColumn = goalAdjustmentExplanations.severity;
        }

        const explanations = await db
            .select()
            .from(goalAdjustmentExplanations)
            .where(and(...conditions))
            .orderBy(orderFn(orderColumn))
            .limit(limit)
            .offset(offset);

        // Enrich with attribution details and timeline info
        const enriched = await Promise.all(
            explanations.map(async (exp) => {
                const attributions = await db
                    .select()
                    .from(goalAdjustmentAttributionDetails)
                    .where(eq(goalAdjustmentAttributionDetails.explanationId, exp.id));

                const timelineEntry = await db
                    .select()
                    .from(goalAdjustmentTimeline)
                    .where(eq(goalAdjustmentTimeline.explanationId, exp.id))
                    .limit(1);

                return {
                    ...exp,
                    attributionDetails: attributions,
                    timelineEntry: timelineEntry[0] || null,
                };
            })
        );

        return enriched;
    }

    /**
     * Get a single adjustment explanation with all details
     * @param {string} explanationId
     * @returns {Promise<Object>}
     */
    async getAdjustmentDetails(explanationId) {
        const [explanation] = await db
            .select()
            .from(goalAdjustmentExplanations)
            .where(eq(goalAdjustmentExplanations.id, explanationId));

        if (!explanation) {
            throw new Error(`Explanation not found: ${explanationId}`);
        }

        const attributions = await db
            .select()
            .from(goalAdjustmentAttributionDetails)
            .where(eq(goalAdjustmentAttributionDetails.explanationId, explanationId));

        const timelineEntry = await db
            .select()
            .from(goalAdjustmentTimeline)
            .where(eq(goalAdjustmentTimeline.explanationId, explanationId))
            .limit(1);

        const comparison = await db
            .select()
            .from(goalAdjustmentComparison)
            .where(eq(goalAdjustmentComparison.explanationId, explanationId))
            .limit(1);

        return {
            ...explanation,
            attributionDetails: attributions,
            timelineEntry: timelineEntry[0] || null,
            comparison: comparison[0] || null,
        };
    }

    /**
     * Mark adjustment as acknowledged by user
     * @param {string} explanationId
     * @param {Object} feedbackData
     * @returns {Promise<Object>} Updated explanation
     */
    async acknowledgeAdjustment(explanationId, feedbackData = {}) {
        const { userFeedback = null, userFeedbackType = null } = feedbackData;

        const [updated] = await db
            .update(goalAdjustmentExplanations)
            .set({
                userAcknowledged: true,
                acknowledgedAt: new Date(),
                userFeedback,
                userFeedbackType,
                updatedAt: new Date(),
            })
            .where(eq(goalAdjustmentExplanations.id, explanationId))
            .returning();

        // Update timeline entry
        await db
            .update(goalAdjustmentTimeline)
            .set({
                userInteracted: true,
                userInteractionType: 'acknowledged',
                userInteractionAt: new Date(),
                engagementScore: 10, // Points for acknowledging
            })
            .where(eq(goalAdjustmentTimeline.explanationId, explanationId));

        return updated;
    }

    /**
     * Log user viewing the adjustment
     * @param {string} explanationId
     * @returns {Promise<void>}
     */
    async markAdjustmentAsViewed(explanationId) {
        await db
            .update(goalAdjustmentTimeline)
            .set({
                userViewed: true,
                userViewedAt: new Date(),
                engagementScore: sql`${goalAdjustmentTimeline.engagementScore} + 5`,
            })
            .where(eq(goalAdjustmentTimeline.explanationId, explanationId));
    }

    /**
     * Calculate and update insights for a goal
     * @param {string} userId
     * @param {string} goalId
     * @returns {Promise<Object>} Updated insights
     */
    async updateInsights(userId, goalId) {
        // Get all adjustments for the past period
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const recentAdjustments = await db
            .select()
            .from(goalAdjustmentExplanations)
            .where(
                and(
                    eq(goalAdjustmentExplanations.userId, userId),
                    eq(goalAdjustmentExplanations.goalId, goalId),
                    gte(goalAdjustmentExplanations.createdAt, thirtyDaysAgo)
                )
            );

        // Analyze adjustment patterns
        const topFactors = this.analyzeTopFactors(recentAdjustments);
        const adjustmentFrequency = this.analyzeAdjustmentFrequency(recentAdjustments);
        const trend = this.analyzeTrend(recentAdjustments);
        const trustScore = this.calculateTrustScore(recentAdjustments);
        const clarityScore = this.calculateClarityScore(recentAdjustments);

        // Get or create insights record
        let insights = await db
            .select()
            .from(goalAdjustmentInsights)
            .where(
                and(
                    eq(goalAdjustmentInsights.userId, userId),
                    eq(goalAdjustmentInsights.goalId, goalId)
                )
            )
            .limit(1)
            .then(rows => rows[0]);

        if (!insights) {
            [insights] = await db
                .insert(goalAdjustmentInsights)
                .values({
                    userId,
                    goalId,
                    topFactors,
                    adjustmentFrequency,
                    adjustmentsLast30Days: recentAdjustments.length,
                    trend,
                    trendDirection: trend === 'increasing_recommendations' ? 1 : trend === 'decreasing_recommendations' ? -1 : 0,
                    userTrustScore: trustScore,
                    clarityScore: clarityScore,
                })
                .returning();
        } else {
            [insights] = await db
                .update(goalAdjustmentInsights)
                .set({
                    topFactors,
                    adjustmentFrequency,
                    adjustmentsLast30Days: recentAdjustments.length,
                    trend,
                    trendDirection: trend === 'increasing_recommendations' ? 1 : trend === 'decreasing_recommendations' ? -1 : 0,
                    userTrustScore: trustScore,
                    clarityScore: clarityScore,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(goalAdjustmentInsights.userId, userId),
                        eq(goalAdjustmentInsights.goalId, goalId)
                    )
                )
                .returning();
        }

        return insights;
    }

    /**
     * Generate human-readable summary of an adjustment
     * @private
     */
    generateSummary(data) {
        const {
            previousAmount,
            newAmount,
            amountChangePercentage,
            triggerSource,
            attributionFactors,
            incomeDelta,
            expenseDelta,
            deadlinePressureScore,
        } = data;

        let summary = '';

        if (newAmount > previousAmount) {
            summary += `Your recommended contribution increased by $${(newAmount - previousAmount).toFixed(2)} (${amountChangePercentage}%).`;
        } else {
            summary += `Your recommended contribution decreased by $${Math.abs(newAmount - previousAmount).toFixed(2)} (${Math.abs(amountChangePercentage)}%).`;
        }

        // Add reason
        if (triggerSource === 'cashflow_change') {
            if (incomeDelta > 0) {
                summary += ` Your income increased, allowing for higher goal contributions.`;
            } else if (incomeDelta < 0) {
                summary += ` Your income decreased, so we adjusted your goal contribution accordingly.`;
            }
        } else if (triggerSource === 'goal_progress_update') {
            summary += ` Based on your current goal progress and timeline, we've adjusted your contribution.`;
        } else if (triggerSource === 'priority_shift') {
            summary += ` Your goal priority has shifted, affecting the recommended contribution.`;
        } else if (triggerSource === 'deadline_pressure') {
            summary += ` As your goal deadline approaches, we've adjusted your contribution to help you reach your target.`;
        }

        return summary;
    }

    /**
     * Determine severity level of adjustment
     * @private
     */
    determineSeverity(changePercentage, attributionFactors) {
        const absChange = Math.abs(changePercentage);

        if (absChange > 50) return 'critical';
        if (absChange > 30) return 'high';
        if (absChange > 10) return 'normal';
        return 'minor';
    }

    /**
     * Get next sequence number for timeline
     * @private
     */
    async getNextSequenceNumber(userId, goalId) {
        const [result] = await db
            .select({
                maxSeq: sql`COALESCE(MAX(${goalAdjustmentTimeline.eventSequence}), 0)`,
            })
            .from(goalAdjustmentTimeline)
            .where(
                and(
                    eq(goalAdjustmentTimeline.userId, userId),
                    eq(goalAdjustmentTimeline.goalId, goalId)
                )
            );

        return (result?.maxSeq || 0) + 1;
    }

    /**
     * Analyze top contributing factors
     * @private
     */
    analyzeTopFactors(adjustments) {
        const factorMap = {};

        adjustments.forEach(adj => {
            if (adj.attributionFactors && Array.isArray(adj.attributionFactors)) {
                adj.attributionFactors.forEach(factor => {
                    if (!factorMap[factor.name]) {
                        factorMap[factor.name] = {
                            factor: factor.name,
                            count: 0,
                            total_impact: 0,
                        };
                    }
                    factorMap[factor.name].count++;
                    factorMap[factor.name].total_impact += factor.impact_pct || 0;
                });
            }
        });

        return Object.values(factorMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(f => ({
                factor: f.factor,
                count: f.count,
                avg_impact_pct: (f.total_impact / f.count).toFixed(2),
            }));
    }

    /**
     * Analyze adjustment frequency
     * @private
     */
    analyzeAdjustmentFrequency(adjustments) {
        const count = adjustments.length;

        if (count === 0) return 'very_stable';
        if (count <= 1) return 'stable';
        if (count <= 3) return 'volatile';
        return 'very_volatile';
    }

    /**
     * Analyze trend in recommendations
     * @private
     */
    analyzeTrend(adjustments) {
        if (adjustments.length < 2) return 'stable';

        let increasing = 0;
        let decreasing = 0;

        for (let i = 1; i < adjustments.length; i++) {
            if (adjustments[i].amountChange > 0) increasing++;
            else if (adjustments[i].amountChange < 0) decreasing++;
        }

        if (increasing > decreasing * 1.5) return 'increasing_recommendations';
        if (decreasing > increasing * 1.5) return 'decreasing_recommendations';
        return 'stable';
    }

    /**
     * Calculate user trust score based on feedback
     * @private
     */
    calculateTrustScore(adjustments) {
        if (adjustments.length === 0) return 0.5;

        let positiveCount = 0;
        let totalWithFeedback = 0;

        adjustments.forEach(adj => {
            if (adj.userFeedbackType) {
                totalWithFeedback++;
                if (['understood', 'satisfied'].includes(adj.userFeedbackType)) {
                    positiveCount++;
                }
            }
        });

        if (totalWithFeedback === 0) return 0.5;
        return (positiveCount / totalWithFeedback).toFixed(2);
    }

    /**
     * Calculate clarity score based on engagement
     * @private
     */
    calculateClarityScore(adjustments) {
        if (adjustments.length === 0) return 0.5;

        let engagedCount = 0;

        adjustments.forEach(adj => {
            if (adj.userAcknowledged || adj.detailedExplanation) {
                engagedCount++;
            }
        });

        return Math.min((engagedCount / adjustments.length).toFixed(2), 1).toFixed(2);
    }
}

export default new GoalAdjustmentExplainabilityService();
