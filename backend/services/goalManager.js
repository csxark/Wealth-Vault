/**
 * Goal Manager Service - Issue #664
 * Handles all core financial goal operations including CRUD, state transitions,
 * priority calculation, and goal lifecycle management
 * 
 * @module services/goalManager
 * @requires drizzle-orm
 * @requires date-fns
 * @requires ../db/schema
 */

import { eq, and, desc, inArray } from 'drizzle-orm';
import { differenceInDays, isPast, isFuture, format } from 'date-fns';
import { financialGoals, goalProgressSnapshots, goalMilestones, goalTransactionsLink } from '../db/schema.js';
import { db } from '../db/index.js';

/**
 * Goal Manager Service
 * Manages financial goal lifecycle and operations
 */
export class GoalManager {
    /**
     * Create a new financial goal
     * @param {Object} goalData - Goal creation data
     * @param {string} goalData.userId - User ID
     * @param {string} goalData.vaultId - Vault ID
     * @param {string} goalData.goalName - Goal name
     * @param {string} goalData.goalType - Goal type (savings, investment, debt_reduction, milestone, habit)
     * @param {string} goalData.category - Goal category
     * @param {number} goalData.targetAmount - Target amount
     * @param {Date} goalData.targetDate - Target completion date
     * @param {number} goalData.importance - Importance level (0-100)
     * @param {string} goalData.riskTolerance - Risk tolerance level
     * @param {string} goalData.description - Goal description
     * @returns {Promise<Object>} Created goal
     * @throws {Error} If goal creation fails
     */
    async createGoal(goalData) {
        try {
            const {
                userId,
                vaultId,
                goalName,
                goalType,
                category,
                targetAmount,
                targetDate,
                importance = 50,
                riskTolerance = 'moderate',
                description = null,
                tags = [],
                notes = null,
            } = goalData;

            // Validate required fields
            if (!userId || !vaultId || !goalName || !goalType || !targetAmount || !targetDate) {
                throw new Error('Missing required goal fields');
            }

            // Validate goal type
            const validGoalTypes = ['savings', 'investment', 'debt_reduction', 'milestone', 'habit'];
            if (!validGoalTypes.includes(goalType)) {
                throw new Error(`Invalid goal type. Must be one of: ${validGoalTypes.join(', ')}`);
            }

            // Validate target date
            if (!isFuture(new Date(targetDate))) {
                throw new Error('Target date must be in the future');
            }

            // Create the goal
            const [newGoal] = await db
                .insert(financialGoals)
                .values({
                    userId,
                    vaultId,
                    goalName,
                    description,
                    goalType,
                    category,
                    targetAmount: targetAmount.toString(),
                    currentAmount: '0',
                    currency: 'USD',
                    targetDate: new Date(targetDate),
                    priority: this.calculateInitialPriority(importance, targetDate),
                    importance,
                    riskTolerance,
                    status: 'planning',
                    progressPercentage: '0',
                    isAutoTracked: false,
                    autoCalculateSavings: true,
                    tags,
                    notes,
                    customProperties: {},
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();

            return newGoal;
        } catch (error) {
            throw new Error(`Failed to create goal: ${error.message}`);
        }
    }

    /**
     * Get goal by ID
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID for authorization
     * @returns {Promise<Object>} Goal object
     */
    async getGoalById(goalId, userId) {
        try {
            const goal = await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, userId)))
                .limit(1);

            return goal[0] || null;
        } catch (error) {
            throw new Error(`Failed to fetch goal: ${error.message}`);
        }
    }

    /**
     * Get all goals for a user
     * @param {string} userId - User ID
     * @param {Object} filters - Optional filters
     * @param {string} filters.status - Filter by status
     * @param {string} filters.category - Filter by category
     * @param {string} filters.vaultId - Filter by vault
     * @returns {Promise<Array>} Array of goals
     */
    async getUserGoals(userId, filters = {}) {
        try {
            let query = db
                .select()
                .from(financialGoals)
                .where(eq(financialGoals.userId, userId));

            if (filters.status) {
                query = query.where(eq(financialGoals.status, filters.status));
            }
            if (filters.category) {
                query = query.where(eq(financialGoals.category, filters.category));
            }
            if (filters.vaultId) {
                query = query.where(eq(financialGoals.vaultId, filters.vaultId));
            }

            const goals = await query.orderBy(desc(financialGoals.priority));
            return goals;
        } catch (error) {
            throw new Error(`Failed to fetch user goals: ${error.message}`);
        }
    }

    /**
     * Update goal details
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID for authorization
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated goal
     */
    async updateGoal(goalId, userId, updates) {
        try {
            // Verify goal belongs to user
            const goal = await this.getGoalById(goalId, userId);
            if (!goal) {
                throw new Error('Goal not found or unauthorized');
            }

            // Handle priority recalculation if importance changed
            let updateData = { ...updates };
            if (updates.importance !== undefined && updates.importance !== goal.importance) {
                updateData.priority = this.calculateInitialPriority(
                    updates.importance,
                    updates.targetDate || goal.targetDate
                );
            }

            updateData.updatedAt = new Date();

            const [updated] = await db
                .update(financialGoals)
                .set(updateData)
                .where(eq(financialGoals.id, goalId))
                .returning();

            return updated;
        } catch (error) {
            throw new Error(`Failed to update goal: ${error.message}`);
        }
    }

    /**
     * Update goal status (planning -> active -> achieved/abandoned)
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @param {string} newStatus - New status
     * @param {string} reason - Reason for status change
     * @returns {Promise<Object>} Updated goal
     */
    async updateGoalStatus(goalId, userId, newStatus, reason = null) {
        try {
            const validStatuses = ['planning', 'active', 'achieved', 'abandoned', 'on_hold'];
            if (!validStatuses.includes(newStatus)) {
                throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
            }

            const goal = await this.getGoalById(goalId, userId);
            if (!goal) {
                throw new Error('Goal not found or unauthorized');
            }

            let updates = {
                status: newStatus,
                updatedAt: new Date(),
            };

            // Set appropriate timestamps based on status change
            if (newStatus === 'active' && goal.status === 'planning') {
                updates.startedAt = new Date();
            } else if (newStatus === 'achieved') {
                updates.achievedAt = new Date();
                updates.progressPercentage = '100';
            } else if (newStatus === 'abandoned') {
                updates.abandonedAt = new Date();
            }

            const [updated] = await db
                .update(financialGoals)
                .set(updates)
                .where(eq(financialGoals.id, goalId))
                .returning();

            return updated;
        } catch (error) {
            throw new Error(`Failed to update goal status: ${error.message}`);
        }
    }

    /**
     * Delete a goal
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID for authorization
     * @returns {Promise<boolean>} Deletion success
     */
    async deleteGoal(goalId, userId) {
        try {
            const goal = await this.getGoalById(goalId, userId);
            if (!goal) {
                throw new Error('Goal not found or unauthorized');
            }

            await db.delete(financialGoals).where(eq(financialGoals.id, goalId));
            return true;
        } catch (error) {
            throw new Error(`Failed to delete goal: ${error.message}`);
        }
    }

    /**
     * Update current progress amount
     * @param {string} goalId - Goal ID
     * @param {number} amount - Amount contributed
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Updated goal with progress
     */
    async updateProgress(goalId, amount, userId) {
        try {
            const goal = await this.getGoalById(goalId, userId);
            if (!goal) {
                throw new Error('Goal not found or unauthorized');
            }

            const newCurrentAmount = (parseFloat(goal.currentAmount) + parseFloat(amount)).toString();
            const progressPercentage = (
                (parseFloat(newCurrentAmount) / parseFloat(goal.targetAmount)) * 100
            ).toFixed(2);

            const [updated] = await db
                .update(financialGoals)
                .set({
                    currentAmount: newCurrentAmount,
                    progressPercentage,
                    updatedAt: new Date(),
                })
                .where(eq(financialGoals.id, goalId))
                .returning();

            return updated;
        } catch (error) {
            throw new Error(`Failed to update progress: ${error.message}`);
        }
    }

    /**
     * Calculate initial priority score for a goal
     * Priority = (Urgency: 40% * days_remaining_ratio) + (Importance: 30%) + 
     *            (Achievability: 20%, inverse of target amount) + (Impact: 10%, category weight)
     * @param {number} importance - Importance level (0-100)
     * @param {Date} targetDate - Target completion date
     * @returns {number} Priority score
     */
    calculateInitialPriority(importance, targetDate) {
        const today = new Date();
        const daysRemaining = differenceInDays(new Date(targetDate), today);
        const maxDays = 365 * 2; // 2-year reference period

        // Urgency: 40% weight (inverse relationship - sooner is more urgent)
        const urgencyScore = Math.min(100, (daysRemaining <= 0 ? 100 : (1 - daysRemaining / maxDays) * 100));

        // Importance: 30% weight
        const importanceScore = Math.min(100, importance || 50);

        // Achievability: 20% weight (assume medium achievability = 50)
        const achievabilityScore = 50;

        // Impact: 10% weight (baseline)
        const impactScore = 50;

        const priority = Math.round(
            (urgencyScore * 0.4) +
            (importanceScore * 0.3) +
            (achievabilityScore * 0.2) +
            (impactScore * 0.1)
        );

        return Math.max(0, Math.min(100, priority));
    }

    /**
     * Re-rank goals based on current context
     * @param {string} userId - User ID
     * @param {string} vaultId - Vault ID
     * @returns {Promise<Array>} Re-ranked goals
     */
    async recalculateAllPriorities(userId, vaultId) {
        try {
            const goals = await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.userId, userId), eq(financialGoals.vaultId, vaultId)));

            const updates = goals.map((goal) => {
                const newPriority = this.calculateInitialPriority(goal.importance, goal.targetDate);
                return db
                    .update(financialGoals)
                    .set({ priority: newPriority, updatedAt: new Date() })
                    .where(eq(financialGoals.id, goal.id));
            });

            await Promise.all(updates);

            return await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.userId, userId), eq(financialGoals.vaultId, vaultId)))
                .orderBy(desc(financialGoals.priority));
        } catch (error) {
            throw new Error(`Failed to recalculate priorities: ${error.message}`);
        }
    }

    /**
     * Get goal summary for dashboard
     * @param {string} userId - User ID
     * @param {string} vaultId - Vault ID
     * @returns {Promise<Object>} Goal summary statistics
     */
    async getGoalSummary(userId, vaultId) {
        try {
            const goals = await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.userId, userId), eq(financialGoals.vaultId, vaultId)));

            const summary = {
                totalGoals: goals.length,
                activeGoals: goals.filter((g) => g.status === 'active').length,
                achievedGoals: goals.filter((g) => g.status === 'achieved').length,
                abandonedGoals: goals.filter((g) => g.status === 'abandoned').length,
                totalTargetAmount: goals.reduce((sum, g) => sum + parseFloat(g.targetAmount), 0),
                totalCurrentAmount: goals.reduce((sum, g) => sum + parseFloat(g.currentAmount), 0),
                overallProgress: 0,
                topPriority: goals.length > 0 ? goals[0] : null,
                goalsByType: {
                    savings: goals.filter((g) => g.goalType === 'savings').length,
                    investment: goals.filter((g) => g.goalType === 'investment').length,
                    debt_reduction: goals.filter((g) => g.goalType === 'debt_reduction').length,
                    milestone: goals.filter((g) => g.goalType === 'milestone').length,
                    habit: goals.filter((g) => g.goalType === 'habit').length,
                },
                goalsByCategory: {},
            };

            // Calculate overall progress
            if (summary.totalTargetAmount > 0) {
                summary.overallProgress = parseFloat(
                    ((summary.totalCurrentAmount / summary.totalTargetAmount) * 100).toFixed(2)
                );
            }

            // Group by category
            goals.forEach((goal) => {
                if (!summary.goalsByCategory[goal.category]) {
                    summary.goalsByCategory[goal.category] = 0;
                }
                summary.goalsByCategory[goal.category]++;
            });

            return summary;
        } catch (error) {
            throw new Error(`Failed to get goal summary: ${error.message}`);
        }
    }

    /**
     * Get goals needing attention (off-track or at-risk)
     * @param {string} userId - User ID
     * @param {string} vaultId - Vault ID
     * @returns {Promise<Array>} Goals needing attention
     */
    async getGoalsNeedingAttention(userId, vaultId) {
        try {
            const goals = await db
                .select()
                .from(financialGoals)
                .where(
                    and(
                        eq(financialGoals.userId, userId),
                        eq(financialGoals.vaultId, vaultId),
                        eq(financialGoals.status, 'active')
                    )
                );

            // Get progress snapshots to determine status
            const needingAttention = [];
            for (const goal of goals) {
                const snapshots = await db
                    .select()
                    .from(goalProgressSnapshots)
                    .where(eq(goalProgressSnapshots.goalId, goal.id))
                    .orderBy(desc(goalProgressSnapshots.createdAt))
                    .limit(1);

                if (snapshots.length > 0) {
                    if (
                        snapshots[0].status === 'off_track' ||
                        snapshots[0].status === 'at_risk'
                    ) {
                        needingAttention.push({
                            goal,
                            latestSnapshot: snapshots[0],
                        });
                    }
                }
            }

            return needingAttention.sort((a, b) => b.goal.priority - a.goal.priority);
        } catch (error) {
            throw new Error(`Failed to get goals needing attention: ${error.message}`);
        }
    }
}

export default new GoalManager();
