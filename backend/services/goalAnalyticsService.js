/**
 * Goal Analytics Snapshot Service - Issue #664
 * Generates comprehensive analytics and insights for financial goals
 * Tracks health scores, risk levels, trends, and actionable recommendations
 * 
 * @module services/goalAnalyticsService
 * @requires drizzle-orm
 * @requires date-fns
 * @requires ../db/schema
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import {
    differenceInDays,
    differenceInMonths,
    format,
    subMonths,
    startOfMonth,
} from 'date-fns';
import {
    financialGoals,
    goalAnalyticsSnapshots,
    goalProgressSnapshots,
    goalMilestones,
    savingsPlans,
} from '../db/schema.js';
import { db } from '../db/index.js';

/**
 * Goal Analytics Service
 * Generates comprehensive analytics and insights for goals
 */
export class GoalAnalyticsService {
    /**
     * Health score thresholds
     */
    static HEALTH_SCORE_THRESHOLDS = {
        excellent: 80,
        good: 60,
        fair: 40,
        poor: 20,
        critical: 0,
    };

    /**
     * Generate comprehensive analytics for a goal
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Analytics snapshot
     */
    async generateAnalytics(goalId, userId) {
        try {
            // Fetch goal and related data
            const goal = await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, userId)))
                .limit(1);

            if (!goal || goal.length === 0) {
                throw new Error('Goal not found');
            }

            const goalData = goal[0];

            // Get progress history
            const progressHistory = await db
                .select()
                .from(goalProgressSnapshots)
                .where(eq(goalProgressSnapshots.goalId, goalId))
                .orderBy(desc(goalProgressSnapshots.createdAt))
                .limit(12); // Last 12 snapshots

            // Get savings plan
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.goalId, goalId))
                .limit(1);

            // Get milestone progress
            const milestones = await db
                .select()
                .from(goalMilestones)
                .where(eq(goalMilestones.goalId, goalId));

            // Calculate analytics metrics
            const metrics = this.calculateMetrics(goalData, progressHistory, plan?.[0]);
            const healthScore = this.calculateHealthScore(goalData, metrics, progressHistory);
            const riskLevel = this.determineRiskLevel(healthScore, metrics);
            const priorityScore = this.calculatePriorityScore(goalData, metrics, progressHistory);
            const achievabilityScore = this.calculateAchievabilityScore(goalData, metrics);
            const trends = this.analyzeTrends(progressHistory);
            const recommendations = this.generateRecommendations(
                goalData,
                metrics,
                healthScore,
                riskLevel,
                trends
            );

            const snapshotMonth = format(new Date(), 'yyyy-MM');

            // Store analytics snapshot
            const [snapshot] = await db
                .insert(goalAnalyticsSnapshots)
                .values({
                    goalId,
                    userId,
                    vaultId: goalData.vaultId,
                    snapshotMonth,
                    healthScore: Math.round(healthScore),
                    healthStatus: this.getHealthStatus(healthScore),
                    riskLevel,
                    priorityScore: Math.round(priorityScore),
                    achievabilityScore: Math.round(achievabilityScore),
                    progressVelocity: metrics.monthlyVelocity,
                    trendDirection: trends.direction,
                    trendStrength: trends.strength,
                    momentum: metrics.momentum,
                    recommendedAction: recommendations.primaryAction,
                    insightMessages: JSON.stringify(recommendations.insights),
                    alerts: JSON.stringify(recommendations.alerts),
                    metrics: JSON.stringify(metrics),
                    analysisData: JSON.stringify({
                        progressHistory: progressHistory.slice(0, 6),
                        milestoneProgress: this.calculateMilestoneProgress(milestones, goalData),
                        projectedCompletionData: metrics.projectedCompletion,
                    }),
                    createdAt: new Date(),
                })
                .returning();

            return snapshot;
        } catch (error) {
            throw new Error(`Failed to generate analytics: ${error.message}`);
        }
    }

    /**
     * Calculate comprehensive metrics for a goal
     * @private
     */
    calculateMetrics(goal, progressHistory, plan) {
        const currentAmount = parseFloat(goal.currentAmount);
        const targetAmount = parseFloat(goal.targetAmount);
        const progressPercentage = (currentAmount / targetAmount) * 100;

        const today = new Date();
        const targetDate = new Date(goal.targetDate);
        const daysRemaining = differenceInDays(targetDate, today);
        const monthsRemaining = differenceInMonths(targetDate, today);
        const totalDays = differenceInDays(targetDate, new Date(goal.createdAt));

        // Calculate velocity
        let monthlyVelocity = 0;
        if (progressHistory.length > 1) {
            const recent = parseFloat(progressHistory[0].contributedAmount || 0);
            const previous = parseFloat(progressHistory[Math.min(1, progressHistory.length - 1)].contributedAmount || 0);
            monthlyVelocity = Math.abs(recent - previous);
        } else if (plan) {
            monthlyVelocity = parseFloat(plan.adjustedMonthlyAmount || 0);
        }

        // Calculate pace
        const paceRatio = progressPercentage / (100 - ((daysRemaining / totalDays) * 100));
        const isOnPace = progressPercentage >= (100 - ((daysRemaining / totalDays) * 100));

        // Calculate momentum
        let momentum = 0;
        if (progressHistory.length > 2) {
            const recent = parseFloat(progressHistory[0].contributedAmount || 0);
            const mid = parseFloat(progressHistory[1].contributedAmount || 0);
            const older = parseFloat(progressHistory[2].contributedAmount || 0);
            const recentGrowth = recent - mid;
            const priorGrowth = mid - older;
            momentum = (recentGrowth - priorGrowth) / Math.max(priorGrowth, 1);
        }

        return {
            currentAmount,
            targetAmount,
            progressPercentage,
            remainingAmount: targetAmount - currentAmount,
            daysRemaining,
            monthsRemaining,
            totalDays,
            monthlyVelocity,
            paceRatio: Math.round(paceRatio * 100) / 100,
            isOnPace,
            momentum: Math.round(momentum * 100) / 100,
            averageMonthlyContribution: this.calculateAverageContribution(progressHistory),
            projectedCompletion: this.projectCompletion(
                currentAmount,
                targetAmount,
                progressHistory,
                plan,
                targetDate
            ),
        };
    }

    /**
     * Project completion date based on current pace
     * @private
     */
    projectCompletion(currentAmount, targetAmount, history, plan, targetDate) {
        const remaining = targetAmount - currentAmount;
        const monthlyRate = this.calculateAverageContribution(history);

        if (monthlyRate <= 0) {
            return {
                estimatedDate: null,
                daysToCompletion: null,
                achievable: false,
            };
        }

        const monthsNeeded = remaining / monthlyRate;
        const today = new Date();
        const estimatedDate = new Date(today.getTime() + monthsNeeded * 30.44 * 24 * 60 * 60 * 1000);

        return {
            estimatedDate,
            daysToCompletion: Math.ceil(monthsNeeded * 30.44),
            achievable: estimatedDate <= targetDate,
        };
    }

    /**
     * Calculate average monthly contribution
     * @private
     */
    calculateAverageContribution(history) {
        if (!history || history.length === 0) return 0;

        const contributions = history.map((h) => parseFloat(h.contributedAmount || 0));
        return contributions.reduce((a, b) => a + b, 0) / contributions.length;
    }

    /**
     * Calculate overall health score (0-100)
     * @private
     */
    calculateHealthScore(goal, metrics, history) {
        let score = 50; // Base score

        // Progress towards target (30% weight)
        const progressScore = Math.min(100, metrics.progressPercentage);
        score += progressScore * 0.3 - 15; // Adjusted contribution

        // Pace relative to time (40% weight)
        const timePassedPercentage = 100 - ((metrics.daysRemaining / metrics.totalDays) * 100);
        const paceScore = Math.min(100, (metrics.progressPercentage / Math.max(timePassedPercentage, 1)) * 100);
        score += Math.min(paceScore * 0.4, 40) - 20;

        // Status (20% weight)
        const statusScores = {
            active: 20,
            achieved: 40,
            on_track: 15,
            off_track: -20,
            abandoned: -50,
            planning: 5,
        };
        score += statusScores[goal.status] || 0;

        // Milestone progress (10% weight)
        const milestoneBonus = Math.min(metrics.progressPercentage / 10, 10);
        score += milestoneBonus;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Determine risk level based on health and metrics
     * @private
     */
    determineRiskLevel(healthScore, metrics) {
        if (healthScore >= 80) return 'low';
        if (healthScore >= 60 && metrics.isOnPace) return 'low';
        if (healthScore >= 40) return 'medium';
        if (healthScore >= 20 || !metrics.projectedCompletion.achievable) return 'high';
        return 'critical';
    }

    /**
     * Calculate priority score (0-100) using weighted factors
     * @private
     */
    calculatePriorityScore(goal, metrics, history) {
        // Urgency: 40% (how soon is the deadline)
        const urgencyScore = Math.max(0, 100 - (metrics.daysRemaining / metrics.totalDays) * 100);

        // Importance: 30% (user-defined importance)
        const importanceScore = goal.importance || 50;

        // Achievement progress: 20% (completion percentage)
        const achievementScore = metrics.progressPercentage;

        // Risk mitigation: 10% (inverse of risk - higher risk = higher priority)
        const riskFactors = {
            critical: 100,
            high: 75,
            medium: 50,
            low: 25,
        };
        const riskScore = riskFactors['medium'] || 50; // Will be set based on actual risk

        const priority =
            urgencyScore * 0.4 +
            importanceScore * 0.3 +
            achievementScore * 0.2 +
            riskScore * 0.1;

        return Math.min(100, Math.max(0, priority));
    }

    /**
     * Calculate achievability score
     * @private
     */
    calculateAchievabilityScore(goal, metrics) {
        let score = 50; // Base

        // If on pace, high achievability
        if (metrics.isOnPace) {
            score += 30;
        } else if (metrics.projectedCompletion.achievable) {
            score += 15;
        } else {
            score -= 30;
        }

        // Positive momentum increases achievability
        if (metrics.momentum > 0.1) {
            score += 20;
        } else if (metrics.momentum < -0.1) {
            score -= 15;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Analyze trends in goal progress
     * @private
     */
    analyzeTrends(history) {
        if (!history || history.length < 2) {
            return {
                direction: 'stable',
                strength: 'unknown',
                changePercentage: 0,
            };
        }

        const recent = parseFloat(history[0].contributedAmount || 0);
        const previous = parseFloat(history[1].contributedAmount || 0);
        const changePercentage = ((recent - previous) / Math.max(previous, 1)) * 100;

        let direction = 'stable';
        let strength = 'weak';

        if (changePercentage > 10) {
            direction = 'improving';
            strength = Math.abs(changePercentage) > 25 ? 'strong' : 'moderate';
        } else if (changePercentage < -10) {
            direction = 'declining';
            strength = Math.abs(changePercentage) > 25 ? 'strong' : 'moderate';
        }

        return {
            direction,
            strength,
            changePercentage: Math.round(changePercentage),
        };
    }

    /**
     * Generate actionable recommendations
     * @private
     */
    generateRecommendations(goal, metrics, healthScore, riskLevel, trends) {
        const insights = [];
        const alerts = [];
        let primaryAction = 'Continue current pace';

        if (goal.status === 'achieved') {
            insights.push('Congratulations! You\'ve reached your goal!');
            primaryAction = 'Goal achieved';
        } else if (goal.status === 'abandoned') {
            insights.push('This goal has been abandoned.');
            primaryAction = 'Consider reactivating';
        } else {
            // Progress insights
            if (metrics.progressPercentage > 75) {
                insights.push('You\'re in the final stretch! Keep up the momentum.');
            } else if (metrics.progressPercentage > 50) {
                insights.push('You\'re halfway there! Maintain your current pace.');
            } else if (metrics.progressPercentage > 25) {
                insights.push('Good progress! You\'re a quarter of the way there.');
            }

            // Pace insights
            if (!metrics.isOnPace && metrics.monthsRemaining > 0) {
                const additionalNeeded = parseFloat(
                    (metrics.remainingAmount / metrics.monthsRemaining).toFixed(2)
                );
                const currentMonthly = metrics.monthlyVelocity;
                const increase = parseFloat((additionalNeeded - currentMonthly).toFixed(2));
                
                if (increase > 0) {
                    insights.push(
                        `To stay on track, increase your monthly contribution by $${increase.toFixed(2)}.`
                    );
                    alerts.push({
                        type: 'behind_pace',
                        severity: 'high',
                        message: `You need $${increase.toFixed(2)} more per month to reach your goal on time.`,
                    });
                    primaryAction = `Increase contributions by $${increase.toFixed(2)}/month`;
                }
            } else if (metrics.isOnPace) {
                insights.push('You\'re on track to reach your goal on time!');
            }

            // Momentum insights
            if (trends.direction === 'improving' && trends.strength === 'strong') {
                insights.push('Excellent! Your progress velocity is accelerating.');
            } else if (trends.direction === 'declining' && trends.strength === 'strong') {
                alerts.push({
                    type: 'declining_progress',
                    severity: 'medium',
                    message: 'Your contribution rate is declining. Consider recommitting to your goal.',
                });
            }

            // Risk insights
            if (riskLevel === 'critical') {
                alerts.push({
                    type: 'critical_risk',
                    severity: 'critical',
                    message: 'This goal is at critical risk. Immediate action is needed.',
                });
                primaryAction = 'Review and adjust goal timeline or contribution plan';
            } else if (riskLevel === 'high') {
                alerts.push({
                    type: 'high_risk',
                    severity: 'high',
                    message: 'This goal is at high risk of not being achieved.',
                });
            }

            // Time-based insights
            if (metrics.daysRemaining < 30 && !metrics.projectedCompletion.achievable) {
                alerts.push({
                    type: 'deadline_approaching',
                    severity: 'high',
                    message: 'Your goal deadline is approaching and current pace suggests you may not achieve it.',
                });
            }
        }

        return {
            insights,
            alerts,
            primaryAction,
        };
    }

    /**
     * Calculate milestone progress
     * @private
     */
    calculateMilestoneProgress(milestones, goal) {
        return {
            total: milestones.length,
            completed: milestones.filter((m) => m.status === 'achieved').length,
            pending: milestones.filter((m) => m.status === 'pending').length,
            inProgress: milestones.filter((m) => m.status === 'in_progress').length,
        };
    }

    /**
     * Get health status label
     * @private
     */
    getHealthStatus(healthScore) {
        const { excellent, good, fair, poor } = GoalAnalyticsService.HEALTH_SCORE_THRESHOLDS;

        if (healthScore >= excellent) return 'excellent';
        if (healthScore >= good) return 'good';
        if (healthScore >= fair) return 'fair';
        if (healthScore >= poor) return 'poor';
        return 'critical';
    }

    /**
     * Get latest analytics for a goal
     * @param {string} goalId - Goal ID
     * @returns {Promise<Object|null>} Latest analytics or null
     */
    async getLatestAnalytics(goalId) {
        try {
            const analytics = await db
                .select()
                .from(goalAnalyticsSnapshots)
                .where(eq(goalAnalyticsSnapshots.goalId, goalId))
                .orderBy(desc(goalAnalyticsSnapshots.createdAt))
                .limit(1);

            return analytics[0] || null;
        } catch (error) {
            throw new Error(`Failed to fetch analytics: ${error.message}`);
        }
    }

    /**
     * Get monthly analytics history for a goal
     * @param {string} goalId - Goal ID
     * @param {number} months - Number of months to retrieve
     * @returns {Promise<Array>} Analytics history
     */
    async getAnalyticsHistory(goalId, months = 12) {
        try {
            const analytics = await db
                .select()
                .from(goalAnalyticsSnapshots)
                .where(eq(goalAnalyticsSnapshots.goalId, goalId))
                .orderBy(desc(goalAnalyticsSnapshots.createdAt))
                .limit(months);

            return analytics.reverse();
        } catch (error) {
            throw new Error(`Failed to fetch analytics history: ${error.message}`);
        }
    }

    /**
     * Get portfolio-level analytics for all goals
     * @param {string} userId - User ID
     * @param {string} vaultId - Vault ID
     * @returns {Promise<Object>} Portfolio analytics
     */
    async getPortfolioAnalytics(userId, vaultId) {
        try {
            const goals = await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.userId, userId), eq(financialGoals.vaultId, vaultId)));

            const latestAnalytics = await Promise.all(
                goals.map((g) => this.getLatestAnalytics(g.id))
            );

            const validAnalytics = latestAnalytics.filter((a) => a !== null);

            const portfolioMetrics = {
                totalGoals: goals.length,
                achievedGoals: goals.filter((g) => g.status === 'achieved').length,
                activeGoals: goals.filter((g) => g.status === 'active').length,
                averageHealthScore: validAnalytics.length > 0
                    ? validAnalytics.reduce((sum, a) => sum + a.healthScore, 0) / validAnalytics.length
                    : 0,
                averagePriorityScore: validAnalytics.length > 0
                    ? validAnalytics.reduce((sum, a) => sum + a.priorityScore, 0) / validAnalytics.length
                    : 0,
                criticalRiskGoals: validAnalytics.filter((a) => a.riskLevel === 'critical').length,
                highRiskGoals: validAnalytics.filter((a) => a.riskLevel === 'high').length,
                overallHealthStatus: this.getPortfolioHealthStatus(validAnalytics),
            };

            return portfolioMetrics;
        } catch (error) {
            throw new Error(`Failed to fetch portfolio analytics: ${error.message}`);
        }
    }

    /**
     * Determine portfolio health status
     * @private
     */
    getPortfolioHealthStatus(analytics) {
        if (analytics.length === 0) return 'no_data';

        const criticalCount = analytics.filter((a) => a.healthStatus === 'critical').length;
        const poorCount = analytics.filter((a) => a.healthStatus === 'poor').length;

        if (criticalCount > 0 || poorCount > 2) return 'critical';
        if (poorCount > 0) return 'fair';
        if (analytics.some((a) => a.healthStatus === 'good')) return 'good';
        return 'excellent';
    }
}

export default new GoalAnalyticsService();
