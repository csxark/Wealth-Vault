import db from '../config/db.js';
import { goals, expenses, users } from '../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

/**
 * Goal Prioritization Service
 * Calculates priority scores for savings goals based on multiple factors
 * Issue #640: Intelligent Savings Goals with Auto-Allocation
 */
class GoalPrioritizationService {
    constructor() {
        // Weight factors for priority calculation
        this.WEIGHTS = {
            urgency: 0.4,      // How soon is the deadline
            importance: 0.3,   // User-defined importance
            progress: 0.2,     // Current completion percentage
            impact: 0.1        // Financial impact
        };

        this.CACHE_DURATION_MS = 3600000; // 1 hour
    }

    /**
     * Calculate priority score for a single goal
     * Returns score between 0-100
     */
    async calculateGoalPriority(goalId, userId) {
        try {
            const goal = await db.query.goals.findFirst({
                where: and(
                    eq(goals.id, goalId),
                    eq(goals.userId, userId)
                )
            });

            if (!goal) {
                throw new Error(`Goal ${goalId} not found`);
            }

            // Calculate individual scores
            const urgencyScore = this.calculateUrgencyScore(goal);
            const importanceScore = this.normalizeImportanceScore(goal.importanceScore || 5);
            const progressScore = this.calculateProgressScore(goal);
            const impactScore = await this.calculateImpactScore(goal, userId);

            // Calculate weighted priority score
            const priorityScore = (
                (urgencyScore * this.WEIGHTS.urgency) +
                (importanceScore * this.WEIGHTS.importance) +
                (progressScore * this.WEIGHTS.progress) +
                (impactScore * this.WEIGHTS.impact)
            );

            // Store calculation result
            await this.storePriorityCalculation(goalId, userId, {
                priorityScore,
                urgencyScore,
                importanceScore,
                progressScore,
                impactScore
            });

            // Update goal with priority scores
            await db.execute(sql`
                UPDATE goals
                SET priority_score = ${priorityScore},
                    urgency_rating = ${urgencyScore / 100},
                    last_priority_calculated_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${goalId}
            `);

            return {
                goalId,
                priorityScore: Math.round(priorityScore * 100) / 100,
                breakdown: {
                    urgency: Math.round(urgencyScore * 100) / 100,
                    importance: Math.round(importanceScore * 100) / 100,
                    progress: Math.round(progressScore * 100) / 100,
                    impact: Math.round(impactScore * 100) / 100
                }
            };
        } catch (error) {
            console.error('Error calculating goal priority:', error);
            throw error;
        }
    }

    /**
     * Calculate urgency score based on deadline proximity
     * Returns 0-100, higher = more urgent
     */
    calculateUrgencyScore(goal) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const startDate = new Date(goal.startDate);

        // Days until deadline
        const daysUntilDeadline = Math.max(0, Math.floor((deadline - now) / (1000 * 60 * 60 * 24)));
        const totalDays = Math.floor((deadline - startDate) / (1000 * 60 * 60 * 24));
        const elapsedDays = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

        // If deadline has passed, maximum urgency
        if (daysUntilDeadline === 0) {
            return 100;
        }

        // Calculate urgency based on time pressure
        const timeProgress = totalDays > 0 ? (elapsedDays / totalDays) : 0;
        const goalProgress = parseFloat(goal.currentAmount) / parseFloat(goal.targetAmount);

        // If we're behind schedule, urgency increases
        const urgencyMultiplier = timeProgress > goalProgress ? 1.5 : 1.0;

        // Base urgency on days remaining (exponential decay)
        let urgencyScore;
        if (daysUntilDeadline <= 7) {
            urgencyScore = 95; // 1 week or less
        } else if (daysUntilDeadline <= 30) {
            urgencyScore = 85; // 1 month or less
        } else if (daysUntilDeadline <= 90) {
            urgencyScore = 70; // 3 months or less
        } else if (daysUntilDeadline <= 180) {
            urgencyScore = 50; // 6 months or less
        } else if (daysUntilDeadline <= 365) {
            urgencyScore = 30; // 1 year or less
        } else {
            urgencyScore = 15; // More than 1 year
        }

        return Math.min(100, urgencyScore * urgencyMultiplier);
    }

    /**
     * Normalize user importance score (1-10) to 0-100
     */
    normalizeImportanceScore(importanceScore) {
        return (importanceScore / 10) * 100;
    }

    /**
     * Calculate progress score
     * Higher progress = higher priority (momentum effect)
     */
    calculateProgressScore(goal) {
        const currentAmount = parseFloat(goal.currentAmount) || 0;
        const targetAmount = parseFloat(goal.targetAmount) || 1;
        const progressPercentage = (currentAmount / targetAmount) * 100;

        // Bonus for goals that are close to completion (80%+)
        if (progressPercentage >= 80) {
            return Math.min(100, progressPercentage * 1.2);
        }

        // Regular progress score
        return progressPercentage;
    }

    /**
     * Calculate financial impact score
     * Based on goal amount relative to user's financial capacity
     */
    async calculateImpactScore(goal, userId) {
        try {
            // Get user's monthly income
            const user = await db.query.users.findFirst({
                where: eq(users.id, userId)
            });

            if (!user || !user.monthlyIncome) {
                return 50; // Default impact if no income data
            }

            const monthlyIncome = parseFloat(user.monthlyIncome);
            const targetAmount = parseFloat(goal.targetAmount);

            // Calculate impact as percentage of annual income
            const annualIncome = monthlyIncome * 12;
            const impactPercentage = (targetAmount / annualIncome) * 100;

            // Score based on impact
            if (impactPercentage > 200) {
                return 95; // Very high impact (>2 years income)
            } else if (impactPercentage > 100) {
                return 85; // High impact (>1 year income)
            } else if (impactPercentage > 50) {
                return 70; // Significant impact (>6 months income)
            } else if (impactPercentage > 25) {
                return 55; // Moderate impact (>3 months income)
            } else if (impactPercentage > 10) {
                return 40; // Low-moderate impact
            } else {
                return 25; // Low impact
            }
        } catch (error) {
            console.error('Error calculating impact score:', error);
            return 50; // Default on error
        }
    }

    /**
     * Store priority calculation in database
     */
    async storePriorityCalculation(goalId, userId, scores) {
        try {
            // Calculate ranking among user's goals
            const userGoals = await db.query.goals.findMany({
                where: and(
                    eq(goals.userId, userId),
                    eq(goals.status, 'active')
                ),
                orderBy: desc(goals.priorityScore)
            });

            const ranking = userGoals.findIndex(g => g.id === goalId) + 1;

            await db.execute(sql`
                INSERT INTO goal_priorities (
                    goal_id, user_id, priority_score, urgency_score, 
                    importance_score, progress_score, impact_score,
                    ranking, calculation_factors, expires_at
                )
                VALUES (
                    ${goalId}, ${userId}, ${scores.priorityScore}, ${scores.urgencyScore},
                    ${scores.importanceScore}, ${scores.progressScore}, ${scores.impactScore},
                    ${ranking}, ${JSON.stringify({ weights: this.WEIGHTS })},
                    NOW() + INTERVAL '1 hour'
                )
            `);
        } catch (error) {
            console.error('Error storing priority calculation:', error);
        }
    }

    /**
     * Calculate priorities for all user goals
     */
    async calculateAllGoalPriorities(userId) {
        try {
            const userGoals = await db.query.goals.findMany({
                where: and(
                    eq(goals.userId, userId),
                    eq(goals.status, 'active')
                )
            });

            const results = [];
            for (const goal of userGoals) {
                const priority = await this.calculateGoalPriority(goal.id, userId);
                results.push({
                    goalId: goal.id,
                    goalTitle: goal.title,
                    ...priority
                });
            }

            // Sort by priority score descending
            results.sort((a, b) => b.priorityScore - a.priorityScore);

            return {
                userId,
                totalGoals: results.length,
                priorities: results,
                calculatedAt: new Date()
            };
        } catch (error) {
            console.error('Error calculating all goal priorities:', error);
            throw error;
        }
    }

    /**
     * Get goal ranking among user's goals
     */
    async getGoalRanking(goalId, userId) {
        try {
            const userGoals = await db.query.goals.findMany({
                where: and(
                    eq(goals.userId, userId),
                    eq(goals.status, 'active')
                ),
                orderBy: desc(goals.priorityScore)
            });

            const ranking = userGoals.findIndex(g => g.id === goalId) + 1;
            const totalGoals = userGoals.length;
            const goal = userGoals.find(g => g.id === goalId);

            return {
                goalId,
                ranking,
                totalGoals,
                priorityScore: goal?.priorityScore || 0,
                percentile: totalGoals > 0 ? ((totalGoals - ranking + 1) / totalGoals * 100).toFixed(1) : 0
            };
        } catch (error) {
            console.error('Error getting goal ranking:', error);
            throw error;
        }
    }

    /**
     * Update importance score for a goal
     */
    async updateGoalImportance(goalId, userId, importanceScore) {
        if (importanceScore < 1 || importanceScore > 10) {
            throw new Error('Importance score must be between 1 and 10');
        }

        try {
            await db.execute(sql`
                UPDATE goals
                SET importance_score = ${importanceScore},
                    updated_at = NOW()
                WHERE id = ${goalId} AND user_id = ${userId}
            `);

            // Recalculate priority
            return await this.calculateGoalPriority(goalId, userId);
        } catch (error) {
            console.error('Error updating goal importance:', error);
            throw error;
        }
    }

    /**
     * Get priority explanation for a goal
     */
    async getPriorityExplanation(goalId, userId) {
        try {
            const priority = await this.calculateGoalPriority(goalId, userId);
            const ranking = await this.getGoalRanking(goalId, userId);

            const explanation = {
                summary: this.generatePrioritySummary(priority, ranking),
                ranking: ranking.ranking,
                totalGoals: ranking.totalGoals,
                factors: this.explainFactors(priority.breakdown),
                recommendations: this.generateRecommendations(priority, ranking)
            };

            return explanation;
        } catch (error) {
            console.error('Error getting priority explanation:', error);
            throw error;
        }
    }

    /**
     * Generate human-readable priority summary
     */
    generatePrioritySummary(priority, ranking) {
        const score = priority.priorityScore;

        if (score >= 80) {
            return `🔥 High Priority - This goal ranks #${ranking.ranking} and should be a top focus`;
        } else if (score >= 60) {
            return `⭐ Medium-High Priority - This goal ranks #${ranking.ranking} and deserves consistent attention`;
        } else if (score >= 40) {
            return `📊 Medium Priority - This goal ranks #${ranking.ranking} with steady progress needed`;
        } else {
            return `📅 Lower Priority - This goal ranks #${ranking.ranking} and can progress gradually`;
        }
    }

    /**
     * Explain priority factors in plain language
     */
    explainFactors(breakdown) {
        return {
            urgency: this.explainUrgency(breakdown.urgency),
            importance: this.explainImportance(breakdown.importance),
            progress: this.explainProgress(breakdown.progress),
            impact: this.explainImpact(breakdown.impact)
        };
    }

    explainUrgency(score) {
        if (score >= 90) return 'Deadline is very soon - immediate action needed';
        if (score >= 70) return 'Approaching deadline - consistent contributions important';
        if (score >= 50) return 'Moderate timeline - steady progress recommended';
        return 'Comfortable timeline - gradual contributions work well';
    }

    explainImportance(score) {
        if (score >= 80) return 'You marked this as very important';
        if (score >= 50) return 'Moderate importance to you';
        return 'Lower on your importance scale';
    }

    explainProgress(score) {
        if (score >= 80) return 'Nearly complete - great momentum!';
        if (score >= 50) return 'Good progress made so far';
        if (score >= 20) return 'Getting started - keep going!';
        return 'Early stages - consistency is key';
    }

    explainImpact(score) {
        if (score >= 80) return 'Major financial commitment';
        if (score >= 50) return 'Significant savings required';
        return 'Manageable savings target';
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(priority, ranking) {
        const recommendations = [];
        const score = priority.priorityScore;

        if (score >= 80) {
            recommendations.push('Consider increasing monthly contributions to this goal');
            recommendations.push('Set up automatic transfers on payday');
        }

        if (priority.breakdown.urgency >= 85) {
            recommendations.push('Deadline approaching - review if target amount is still realistic');
        }

        if (priority.breakdown.progress < 20 && priority.breakdown.urgency > 60) {
            recommendations.push('You may be behind schedule - consider adjusting timeline or amount');
        }

        if (ranking.ranking <= 3) {
            recommendations.push('This is a top priority - allocate maximum available funds');
        }

        return recommendations;
    }
}

export default new GoalPrioritizationService();
