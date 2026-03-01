import db from '../config/db.js';
import { emergencyFundGoals, users, expenses } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import notificationService from './notificationService.js';

class EmergencyFundService {
    /**
     * Calculate recommended emergency fund target based on monthly expenses
     * @param {string} userId - User ID
     * @param {number} targetMonths - Number of months (3-6)
     * @returns {Promise<Object>} Calculation result
     */
    async calculateTargetAmount(userId, targetMonths = 3) {
        try {
            // Get user's monthly expenses from the last 3 months
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            const expenseData = await db
                .select({
                    totalAmount: sql`SUM(${expenses.amount})`,
                    count: sql`COUNT(*)`,
                })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        sql`${expenses.date} >= ${threeMonthsAgo}`
                    )
                );

            const totalExpenses = parseFloat(expenseData[0]?.totalAmount || 0);
            const expenseCount = parseInt(expenseData[0]?.count || 0);

            // Calculate average monthly expenses
            const monthlyExpenses = expenseCount > 0 ? totalExpenses / 3 : 0;

            // Calculate target amount
            const targetAmount = monthlyExpenses * targetMonths;

            return {
                monthlyExpenses: monthlyExpenses.toFixed(2),
                targetMonths,
                targetAmount: targetAmount.toFixed(2),
                basedOnMonths: 3,
                expenseCount
            };
        } catch (error) {
            console.error('Error calculating emergency fund target:', error);
            throw error;
        }
    }

    /**
     * Get or create emergency fund goal for user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Emergency fund goal
     */
    async getOrCreateGoal(userId) {
        try {
            // Check if user already has an active goal
            const existingGoals = await db
                .select()
                .from(emergencyFundGoals)
                .where(
                    and(
                        eq(emergencyFundGoals.userId, userId),
                        eq(emergencyFundGoals.status, 'active')
                    )
                )
                .orderBy(desc(emergencyFundGoals.createdAt))
                .limit(1);

            if (existingGoals.length > 0) {
                return existingGoals[0];
            }

            // Create new goal with default values
            const calculation = await this.calculateTargetAmount(userId, 3);

            const [newGoal] = await db
                .insert(emergencyFundGoals)
                .values({
                    userId,
                    targetMonths: 3,
                    targetAmount: calculation.targetAmount,
                    currentSavings: '0',
                    monthlyExpenses: calculation.monthlyExpenses,
                    status: 'active',
                    currency: 'USD',
                    metadata: {
                        lastContribution: null,
                        totalContributions: 0,
                        contributionHistory: []
                    }
                })
                .returning();

            return newGoal;
        } catch (error) {
            console.error('Error getting or creating emergency fund goal:', error);
            throw error;
        }
    }

    /**
     * Get emergency fund goal by ID
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID for verification
     * @returns {Promise<Object>} Emergency fund goal
     */
    async getGoalById(goalId, userId) {
        try {
            const goals = await db
                .select()
                .from(emergencyFundGoals)
                .where(
                    and(
                        eq(emergencyFundGoals.id, goalId),
                        eq(emergencyFundGoals.userId, userId)
                    )
                )
                .limit(1);

            if (goals.length === 0) {
                throw new Error('Emergency fund goal not found');
            }

            return goals[0];
        } catch (error) {
            console.error('Error getting emergency fund goal:', error);
            throw error;
        }
    }

    /**
     * Update emergency fund goal
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated goal
     */
    async updateGoal(goalId, userId, updates) {
        try {
            // Verify ownership
            await this.getGoalById(goalId, userId);

            const allowedUpdates = [
                'targetMonths',
                'targetAmount',
                'currentSavings',
                'status',
                'monthlyExpenses',
                'notes',
                'metadata'
            ];

            const updateData = {};
            for (const key of allowedUpdates) {
                if (updates[key] !== undefined) {
                    updateData[key] = updates[key];
                }
            }

            updateData.updatedAt = new Date();

            const [updatedGoal] = await db
                .update(emergencyFundGoals)
                .set(updateData)
                .where(
                    and(
                        eq(emergencyFundGoals.id, goalId),
                        eq(emergencyFundGoals.userId, userId)
                    )
                )
                .returning();

            return updatedGoal;
        } catch (error) {
            console.error('Error updating emergency fund goal:', error);
            throw error;
        }
    }

    /**
     * Add savings to emergency fund
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @param {number} amount - Amount to add
     * @returns {Promise<Object>} Updated goal with progress
     */
    async addSavings(goalId, userId, amount) {
        try {
            const goal = await this.getGoalById(goalId, userId);

            const currentSavings = parseFloat(goal.currentSavings || 0);
            const newSavings = currentSavings + parseFloat(amount);
            const targetAmount = parseFloat(goal.targetAmount);

            // Update metadata
            const metadata = goal.metadata || {};
            const contributionHistory = metadata.contributionHistory || [];
            
            contributionHistory.push({
                amount: parseFloat(amount),
                date: new Date().toISOString(),
                previousTotal: currentSavings,
                newTotal: newSavings
            });

            const updates = {
                currentSavings: newSavings.toFixed(2),
                metadata: {
                    ...metadata,
                    lastContribution: new Date().toISOString(),
                    totalContributions: (metadata.totalContributions || 0) + 1,
                    contributionHistory: contributionHistory.slice(-50) // Keep last 50 contributions
                }
            };

            // Check if goal is completed
            if (newSavings >= targetAmount && goal.status !== 'completed') {
                updates.status = 'completed';
                
                // Send notification
                await notificationService.createNotification(userId, {
                    type: 'emergency_fund_completed',
                    title: '🎉 Emergency Fund Goal Reached!',
                    message: `Congratulations! You've reached your emergency fund goal of ${targetAmount}.`,
                    data: { goalId, targetAmount, currentSavings: newSavings }
                });
            }

            const [updatedGoal] = await db
                .update(emergencyFundGoals)
                .set(updates)
                .where(eq(emergencyFundGoals.id, goalId))
                .returning();

            return {
                ...updatedGoal,
                progress: this.calculateProgress(updatedGoal)
            };
        } catch (error) {
            console.error('Error adding savings to emergency fund:', error);
            throw error;
        }
    }

    /**
     * Calculate progress percentage and metrics
     * @param {Object} goal - Emergency fund goal
     * @returns {Object} Progress metrics
     */
    calculateProgress(goal) {
        const currentSavings = parseFloat(goal.currentSavings || 0);
        const targetAmount = parseFloat(goal.targetAmount || 0);
        const monthlyExpenses = parseFloat(goal.monthlyExpenses || 0);

        const percentage = targetAmount > 0 ? (currentSavings / targetAmount) * 100 : 0;
        const monthsCovered = monthlyExpenses > 0 ? currentSavings / monthlyExpenses : 0;

        return {
            percentage: Math.min(percentage, 100).toFixed(2),
            currentSavings: currentSavings.toFixed(2),
            targetAmount: targetAmount.toFixed(2),
            remainingAmount: Math.max(targetAmount - currentSavings, 0).toFixed(2),
            monthsCovered: monthsCovered.toFixed(2),
            isCompleted: currentSavings >= targetAmount,
            status: goal.status
        };
    }

    /**
     * Get emergency fund summary for user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Summary with goal and progress
     */
    async getSummary(userId) {
        try {
            const goal = await this.getOrCreateGoal(userId);
            const progress = this.calculateProgress(goal);

            // Get recommendation
            const recommendation = this.getRecommendation(progress, goal);

            return {
                goal,
                progress,
                recommendation,
                lastUpdated: goal.updatedAt
            };
        } catch (error) {
            console.error('Error getting emergency fund summary:', error);
            throw error;
        }
    }

    /**
     * Get recommendation based on progress
     * @param {Object} progress - Progress metrics
     * @param {Object} goal - Goal data
     * @returns {Object} Recommendation
     */
    getRecommendation(progress, goal) {
        const percentage = parseFloat(progress.percentage);
        const monthsCovered = parseFloat(progress.monthsCovered);
        const targetMonths = goal.targetMonths;

        if (percentage >= 100) {
            return {
                type: 'completed',
                message: 'Great job! You have reached your emergency fund goal. Consider increasing your target for extra security.',
                priority: 'low',
                action: 'increase_target'
            };
        } else if (percentage >= 75) {
            return {
                type: 'almost_there',
                message: `You're almost there! Just ${progress.remainingAmount} more to reach your goal.`,
                priority: 'medium',
                action: 'continue_saving'
            };
        } else if (percentage >= 50) {
            return {
                type: 'halfway',
                message: 'You\'re halfway to your goal. Keep up the good work!',
                priority: 'medium',
                action: 'continue_saving'
            };
        } else if (monthsCovered < 1) {
            return {
                type: 'critical',
                message: 'You have less than 1 month of expenses saved. Prioritize building your emergency fund.',
                priority: 'high',
                action: 'increase_savings'
            };
        } else {
            return {
                type: 'building',
                message: `You have ${monthsCovered.toFixed(1)} months of expenses saved. Keep building your fund.`,
                priority: 'medium',
                action: 'continue_saving'
            };
        }
    }

    /**
     * Recalculate target amount based on updated monthly expenses
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Updated goal
     */
    async recalculateTarget(goalId, userId) {
        try {
            const goal = await this.getGoalById(goalId, userId);
            const calculation = await this.calculateTargetAmount(userId, goal.targetMonths);

            const [updatedGoal] = await db
                .update(emergencyFundGoals)
                .set({
                    targetAmount: calculation.targetAmount,
                    monthlyExpenses: calculation.monthlyExpenses,
                    updatedAt: new Date()
                })
                .where(eq(emergencyFundGoals.id, goalId))
                .returning();

            return updatedGoal;
        } catch (error) {
            console.error('Error recalculating emergency fund target:', error);
            throw error;
        }
    }

    /**
     * Get all emergency fund goals for user
     * @param {string} userId - User ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} List of goals
     */
    async getAllGoals(userId, filters = {}) {
        try {
            let conditions = [eq(emergencyFundGoals.userId, userId)];

            if (filters.status) {
                conditions.push(eq(emergencyFundGoals.status, filters.status));
            }

            const goals = await db
                .select()
                .from(emergencyFundGoals)
                .where(and(...conditions))
                .orderBy(desc(emergencyFundGoals.createdAt));

            return goals.map(goal => ({
                ...goal,
                progress: this.calculateProgress(goal)
            }));
        } catch (error) {
            console.error('Error getting all emergency fund goals:', error);
            throw error;
        }
    }

    /**
     * Delete emergency fund goal
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteGoal(goalId, userId) {
        try {
            await this.getGoalById(goalId, userId);

            await db
                .delete(emergencyFundGoals)
                .where(
                    and(
                        eq(emergencyFundGoals.id, goalId),
                        eq(emergencyFundGoals.userId, userId)
                    )
                );

            return true;
        } catch (error) {
            console.error('Error deleting emergency fund goal:', error);
            throw error;
        }
    }
}

export default new EmergencyFundService();
