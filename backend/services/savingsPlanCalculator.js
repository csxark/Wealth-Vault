/**
 * Savings Plan Calculator Service - Issue #664
 * Calculates optimal savings plans including contribution amounts,
 * frequency mapping, and automatic adjustments
 * 
 * @module services/savingsPlanCalculator
 * @requires date-fns
 * @requires drizzle-orm
 * @requires ../db/schema
 */

import { differenceInMonths, differenceInDays, addMonths, addWeeks, format } from 'date-fns';
import { eq, and } from 'drizzle-orm';
import { savingsPlans, financialGoals } from '../db/schema.js';
import { db } from '../db/index.js';

/**
 * Savings Plan Calculator Service
 * Manages savings plan creation, calculations, and adjustments
 */
export class SavingsPlanCalculator {
    /**
     * Create a savings plan for a goal
     * @param {Object} planData - Plan creation data
     * @param {string} planData.goalId - Goal ID
     * @param {string} planData.userId - User ID
     * @param {string} planData.vaultId - Vault ID
     * @param {number} planData.startingAmount - Current amount already contributed
     * @param {string} planData.contributionFrequency - Frequency (monthly, weekly, biweekly, custom)
     * @param {number} planData.customFrequencyDays - Days for custom frequency
     * @param {number} planData.bufferPercentage - Safety margin percentage
     * @returns {Promise<Object>} Created savings plan
     */
    async createSavingsPlan(planData) {
        try {
            const {
                goalId,
                userId,
                vaultId,
                startingAmount = 0,
                contributionFrequency = 'monthly',
                customFrequencyDays = null,
                bufferPercentage = 10,
            } = planData;

            // Fetch the goal
            const goal = await db
                .select()
                .from(financialGoals)
                .where(eq(financialGoals.id, goalId))
                .limit(1);

            if (!goal || goal.length === 0) {
                throw new Error('Goal not found');
            }

            const goalData = goal[0];
            const targetAmount = parseFloat(goalData.targetAmount);
            const currentAmount = parseFloat(goalData.currentAmount) + startingAmount;
            const remainingAmount = targetAmount - currentAmount;

            // Calculate time to target
            const today = new Date();
            const timeToTargetMonths = differenceInMonths(new Date(goalData.targetDate), today);

            if (timeToTargetMonths <= 0) {
                throw new Error('Target date must be in the future');
            }

            // Calculate base monthly amount
            const baseMonthlyAmount = remainingAmount / timeToTargetMonths;

            // Calculate with buffer
            const bufferAmount = (baseMonthlyAmount * bufferPercentage) / 100;
            const adjustedMonthlyAmount = baseMonthlyAmount + bufferAmount;

            // Calculate frequency-based amounts
            const weeklyAmount = adjustedMonthlyAmount / 4.33; // Average weeks per month
            const biweeklyAmount = adjustedMonthlyAmount / 2.17; // Average biweeks per month

            // Validate contribution frequency
            const validFrequencies = ['monthly', 'weekly', 'biweekly', 'custom'];
            if (!validFrequencies.includes(contributionFrequency)) {
                throw new Error(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`);
            }

            // Create the savings plan
            const [plan] = await db
                .insert(savingsPlans)
                .values({
                    goalId,
                    userId,
                    vaultId,
                    startingAmount: startingAmount.toString(),
                    targetAmount: targetAmount.toString(),
                    currentAmount: currentAmount.toString(),
                    timeToTargetMonths,
                    baseMonthlyAmount: baseMonthlyAmount.toFixed(2),
                    weeklyAmount: weeklyAmount.toFixed(2),
                    biweeklyAmount: biweeklyAmount.toFixed(2),
                    requiredMonthlyAmount: baseMonthlyAmount.toFixed(2),
                    contributionFrequency,
                    customFrequencyDays,
                    bufferPercentage: bufferPercentage.toString(),
                    bufferAmount: bufferAmount.toFixed(2),
                    adjustedMonthlyAmount: adjustedMonthlyAmount.toFixed(2),
                    status: 'active',
                    lastAdjustedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();

            return plan;
        } catch (error) {
            throw new Error(`Failed to create savings plan: ${error.message}`);
        }
    }

    /**
     * Get savings plan for a goal
     * @param {string} goalId - Goal ID
     * @returns {Promise<Object>} Savings plan
     */
    async getPlanForGoal(goalId) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.goalId, goalId))
                .limit(1);

            return plan[0] || null;
        } catch (error) {
            throw new Error(`Failed to fetch savings plan: ${error.message}`);
        }
    }

    /**
     * Calculate contribution amount for a specific period
     * @param {string} planId - Plan ID
     * @param {string} periodType - Period (monthly, weekly, biweekly, custom)
     * @returns {Promise<number>} Contribution amount for the period
     */
    async calculateContributionAmount(planId, periodType = null) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            const period = periodType || planData.contributionFrequency;

            switch (period) {
                case 'monthly':
                    return parseFloat(planData.adjustedMonthlyAmount);
                case 'weekly':
                    return parseFloat(planData.weeklyAmount);
                case 'biweekly':
                    return parseFloat(planData.biweeklyAmount);
                case 'custom':
                    if (!planData.customFrequencyDays) {
                        throw new Error('Custom frequency days not specified');
                    }
                    // Calculate based on custom days (days / 30.44 * monthly amount)
                    return (
                        (parseFloat(planData.adjustedMonthlyAmount) * planData.customFrequencyDays) /
                        30.44
                    );
                default:
                    throw new Error('Invalid period type');
            }
        } catch (error) {
            throw new Error(`Failed to calculate contribution: ${error.message}`);
        }
    }

    /**
     * Calculate next contribution due date
     * @param {string} planId - Plan ID
     * @param {Date} lastContributionDate - Last contribution date (optional)
     * @returns {Promise<Date>} Next contribution due date
     */
    async calculateNextContributionDue(planId, lastContributionDate = null) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            const baseDate = lastContributionDate || new Date();

            switch (planData.contributionFrequency) {
                case 'monthly':
                    return addMonths(baseDate, 1);
                case 'weekly':
                    return addWeeks(baseDate, 1);
                case 'biweekly':
                    return addWeeks(baseDate, 2);
                case 'custom':
                    return new Date(
                        baseDate.getTime() +
                            (planData.customFrequencyDays || 30) * 24 * 60 * 60 * 1000
                    );
                default:
                    return addMonths(baseDate, 1);
            }
        } catch (error) {
            throw new Error(`Failed to calculate next due date: ${error.message}`);
        }
    }

    /**
     * Update savings plan with actual contributions
     * @param {string} planId - Plan ID
     * @param {number} contributedAmount - Amount contributed
     * @returns {Promise<Object>} Updated plan
     */
    async updatePlanProgress(planId, contributedAmount) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            const newCurrentAmount = parseFloat(planData.currentAmount) + contributedAmount;

            const [updated] = await db
                .update(savingsPlans)
                .set({
                    currentAmount: newCurrentAmount.toString(),
                    updatedAt: new Date(),
                })
                .where(eq(savingsPlans.id, planId))
                .returning();

            return updated;
        } catch (error) {
            throw new Error(`Failed to update plan progress: ${error.message}`);
        }
    }

    /**
     * Adjust savings plan based on changed circumstances
     * Can increase/decrease required amounts based on new constraints
     * @param {string} planId - Plan ID
     * @param {Object} adjustmentData - Adjustment parameters
     * @param {number} adjustmentData.newTargetDate - Updated target date
     * @param {number} adjustmentData.newBufferPercentage - Updated buffer percentage
     * @param {number} adjustmentData.newStartingAmount - Updated starting amount
     * @returns {Promise<Object>} Adjusted plan
     */
    async adjustPlan(planId, adjustmentData) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            const targetAmount = parseFloat(planData.targetAmount);
            const currentAmount = parseFloat(planData.currentAmount);

            // Determine new values
            const newTargetDate = adjustmentData.newTargetDate || planData.lastAdjustedAt;
            const newBufferPercentage = adjustmentData.newBufferPercentage || planData.bufferPercentage;
            const newStartingAmount = adjustmentData.newStartingAmount || planData.startingAmount;

            // Recalculate timespan
            const today = new Date();
            const newTimeToTargetMonths = differenceInMonths(
                new Date(adjustmentData.newTargetDate || planData.goal?.targetDate),
                today
            );

            if (newTimeToTargetMonths <= 0) {
                throw new Error('Target date must be in the future');
            }

            const remainingAmount = targetAmount - currentAmount;
            const newBaseMonthlyAmount = remainingAmount / newTimeToTargetMonths;
            const newBufferAmount = (newBaseMonthlyAmount * newBufferPercentage) / 100;
            const newAdjustedMonthlyAmount = newBaseMonthlyAmount + newBufferAmount;

            const [adjusted] = await db
                .update(savingsPlans)
                .set({
                    timeToTargetMonths: newTimeToTargetMonths,
                    baseMonthlyAmount: newBaseMonthlyAmount.toFixed(2),
                    bufferPercentage: newBufferPercentage.toString(),
                    bufferAmount: newBufferAmount.toFixed(2),
                    adjustedMonthlyAmount: newAdjustedMonthlyAmount.toFixed(2),
                    weeklyAmount: (newAdjustedMonthlyAmount / 4.33).toFixed(2),
                    biweeklyAmount: (newAdjustedMonthlyAmount / 2.17).toFixed(2),
                    adjustmentReason: adjustmentData.reason || 'User-initiated adjustment',
                    lastAdjustedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(savingsPlans.id, planId))
                .returning();

            return adjusted;
        } catch (error) {
            throw new Error(`Failed to adjust plan: ${error.message}`);
        }
    }

    /**
     * Set up auto-debit for savings plan
     * @param {string} planId - Plan ID
     * @param {Object} debitConfig - Auto-debit configuration
     * @param {number} debitConfig.autoDebitDate - Day of month for debit
     * @param {string} debitConfig.paymentMethod - Payment method
     * @param {string} debitConfig.targetAccountId - Target account ID
     * @returns {Promise<Object>} Updated plan with auto-debit
     */
    async setupAutoDebit(planId, debitConfig) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            // Validate auto-debit date
            const autoDebitDate = debitConfig.autoDebitDate;
            if (autoDebitDate < 1 || autoDebitDate > 31) {
                throw new Error('Auto-debit date must be between 1 and 31');
            }

            const [updated] = await db
                .update(savingsPlans)
                .set({
                    autoDebitEnabled: true,
                    autoDebitDate,
                    paymentMethod: debitConfig.paymentMethod,
                    targetAccountId: debitConfig.targetAccountId,
                    updatedAt: new Date(),
                })
                .where(eq(savingsPlans.id, planId))
                .returning();

            return updated;
        } catch (error) {
            throw new Error(`Failed to setup auto-debit: ${error.message}`);
        }
    }

    /**
     * Calculate success rate based on historical contributions
     * @param {string} planId - Plan ID
     * @param {Array} historicalContributions - Past contributions
     * @returns {Promise<number>} Success probability (0-100)
     */
    async calculateSuccessRate(planId, historicalContributions = []) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            
            // If no history, use moderate baseline
            if (historicalContributions.length === 0) {
                return 65;
            }

            const requiredMonthly = parseFloat(planData.adjustedMonthlyAmount);
            let onTimeCount = 0;
            let exceedsCount = 0;
            let missesCount = 0;

            historicalContributions.forEach((contribution) => {
                if (contribution >= requiredMonthly * 0.95) {
                    exceedsCount++;
                } else if (contribution >= requiredMonthly * 0.8) {
                    onTimeCount++;
                } else {
                    missesCount++;
                }
            });

            const totalContributions = historicalContributions.length;
            const successRate =
                ((exceedsCount * 1.0 + onTimeCount * 0.7 + missesCount * 0.2) / totalContributions) * 100;

            return Math.min(100, Math.max(0, Math.round(successRate)));
        } catch (error) {
            throw new Error(`Failed to calculate success rate: ${error.message}`);
        }
    }

    /**
     * Generate contribution schedule for next N periods
     * @param {string} planId - Plan ID
     * @param {number} numberOfPeriods - Number of periods to schedule
     * @returns {Promise<Array>} Contribution schedule
     */
    async generateContributionSchedule(planId, numberOfPeriods = 12) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            const schedule = [];
            let currentDate = new Date();
            let currentAmount = parseFloat(planData.currentAmount);

            for (let i = 0; i < numberOfPeriods; i++) {
                const contributionAmount = await this.calculateContributionAmount(
                    planId,
                    planData.contributionFrequency
                );
                currentAmount += contributionAmount;

                schedule.push({
                    period: i + 1,
                    dueDate: currentDate,
                    contributionAmount: parseFloat(contributionAmount.toFixed(2)),
                    projectedBalance: parseFloat(currentAmount.toFixed(2)),
                    status: 'pending',
                });

                currentDate = await this.calculateNextContributionDue(planId, currentDate);
            }

            return schedule;
        } catch (error) {
            throw new Error(`Failed to generate schedule: ${error.message}`);
        }
    }

    /**
     * Get plan summary
     * @param {string} planId - Plan ID
     * @returns {Promise<Object>} Plan summary
     */
    async getPlanSummary(planId) {
        try {
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.id, planId))
                .limit(1);

            if (!plan || plan.length === 0) {
                throw new Error('Plan not found');
            }

            const planData = plan[0];
            const remaining = parseFloat(planData.targetAmount) - parseFloat(planData.currentAmount);
            const progressPercentage = (
                (parseFloat(planData.currentAmount) / parseFloat(planData.targetAmount)) * 100
            ).toFixed(2);

            return {
                planId: planData.id,
                targetAmount: parseFloat(planData.targetAmount).toFixed(2),
                currentAmount: parseFloat(planData.currentAmount).toFixed(2),
                remainingAmount: remaining.toFixed(2),
                progressPercentage: parseFloat(progressPercentage),
                timeToTargetMonths: planData.timeToTargetMonths,
                requiredMonthlyAmount: parseFloat(planData.adjustedMonthlyAmount),
                supportedFrequencies: {
                    monthly: parseFloat(planData.baseMonthlyAmount),
                    weekly: parseFloat(planData.weeklyAmount),
                    biweekly: parseFloat(planData.biweeklyAmount),
                },
                autoDebitEnabled: planData.autoDebitEnabled,
                status: planData.status,
                lastAdjustedAt: planData.lastAdjustedAt,
            };
        } catch (error) {
            throw new Error(`Failed to get plan summary: ${error.message}`);
        }
    }
}

export default new SavingsPlanCalculator();
