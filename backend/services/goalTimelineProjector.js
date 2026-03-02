/**
 * Goal Timeline Projector Service - Issue #664
 * Handles Monte Carlo simulations for timeline and achievability projections
 * Provides confidence levels and probability estimates
 * 
 * @module services/goalTimelineProjector
 * @requires date-fns
 * @requires drizzle-orm
 * @requires ../db/schema
 */

import { eq, and, desc } from 'drizzle-orm';
import {
    differenceInMonths,
    addMonths,
    addDays,
    getTime,
    isAfter,
} from 'date-fns';
import {
    financialGoals,
    goalTimelineProjections,
    goalProgressSnapshots,
    savingsPlans,
} from '../db/schema.js';
import { db } from '../db/index.js';

/**
 * Goal Timeline Projector Service
 * Runs Monte Carlo simulations to project goal completion timelines
 */
export class GoalTimelineProjector {
    /**
     * Default simulation parameters
     */
    static SIMULATION_COUNT = 1000;
    static MARKET_RETURN_MEAN = 0.07; // 7% annual return
    static MARKET_RETURN_VOLATILITY = 0.12; // 12% volatility
    static INCOME_VARIANCE = 0.15; // 15% income fluctuation
    static CONFIDENCE_LEVELS = [0.1, 0.25, 0.5, 0.75, 0.9]; // Percentiles to calculate

    /**
     * Generate timeline projection for a goal using Monte Carlo simulation
     * @param {string} goalId - Goal ID
     * @param {string} userId - User ID
     * @param {Object} options - Simulation options
     * @param {number} options.simulationCount - Number of simulations (default 1000)
     * @param {string} options.projectionType - Type: 'deterministic' or 'stochastic'
     * @param {number} options.marketReturnMean - Expected annual return
     * @param {number} options.marketReturnVolatility - Return volatility
     * @returns {Promise<Object>} Projection results
     */
    async generateProjection(goalId, userId, options = {}) {
        try {
            const {
                simulationCount = GoalTimelineProjector.SIMULATION_COUNT,
                projectionType = 'stochastic',
                marketReturnMean = GoalTimelineProjector.MARKET_RETURN_MEAN,
                marketReturnVolatility = GoalTimelineProjector.MARKET_RETURN_VOLATILITY,
            } = options;

            // Fetch goal details
            const goal = await db
                .select()
                .from(financialGoals)
                .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, userId)))
                .limit(1);

            if (!goal || goal.length === 0) {
                throw new Error('Goal not found');
            }

            const goalData = goal[0];

            // Fetch savings plan
            const plan = await db
                .select()
                .from(savingsPlans)
                .where(eq(savingsPlans.goalId, goalId))
                .limit(1);

            const planData = plan?.[0];
            if (!planData) {
                throw new Error('No savings plan found for this goal');
            }

            // Get recent progress snapshots for historical data
            const snapshots = await db
                .select()
                .from(goalProgressSnapshots)
                .where(eq(goalProgressSnapshots.goalId, goalId))
                .orderBy(desc(goalProgressSnapshots.createdAt))
                .limit(12); // Last 12 snapshots (monthly)

            let projectionResults;

            if (projectionType === 'deterministic') {
                projectionResults = this.runDeterministicProjection(goalData, planData);
            } else {
                projectionResults = this.runMonteCarloSimulation(
                    goalData,
                    planData,
                    snapshots,
                    simulationCount,
                    marketReturnMean,
                    marketReturnVolatility
                );
            }

            // Store projection
            const [projection] = await db
                .insert(goalTimelineProjections)
                .values({
                    goalId,
                    userId,
                    vaultId: goalData.vaultId,
                    projectionType,
                    simulationCount,
                    successProbability: projectionResults.successProbability,
                    confidenceLevel: projectionResults.confidenceLevel,
                    projectedCompletionDate: projectionResults.mostLikelyDate,
                    medianCompletionDate: projectionResults.medianDate,
                    earliestCompletionDate: projectionResults.earliestDate,
                    latestCompletionDate: projectionResults.latestDate,
                    currentAmount: parseFloat(goalData.currentAmount),
                    targetAmount: parseFloat(goalData.targetAmount),
                    bestCaseAmount: projectionResults.bestCaseAmount,
                    worstCaseAmount: projectionResults.worstCaseAmount,
                    mostLikelyAmount: projectionResults.mostLikelyAmount,
                    monthlyVariance: projectionResults.monthlyVariance,
                    returnVariance: projectionResults.returnVariance,
                    percentiles: JSON.stringify(projectionResults.percentiles),
                    scenarioResults: JSON.stringify(projectionResults.scenarioResults),
                    generatedAt: new Date(),
                    validUntil: addDays(new Date(), 7), // Valid for 7 days
                    createdAt: new Date(),
                })
                .returning();

            return projection;
        } catch (error) {
            throw new Error(`Failed to generate projection: ${error.message}`);
        }
    }

    /**
     * Run deterministic projection with linear contributions
     * @private
     */
    runDeterministicProjection(goal, plan) {
        const currentAmount = parseFloat(goal.currentAmount);
        const targetAmount = parseFloat(goal.targetAmount);
        const monthlyAmount = parseFloat(plan.adjustedMonthlyAmount);
        const targetDate = new Date(goal.targetDate);
        const today = new Date();

        // Calculate months remaining
        const monthsRemaining = differenceInMonths(targetDate, today);

        // Project completion date
        if (monthlyAmount <= 0) {
            return {
                successProbability: 0,
                confidenceLevel: 'very_low',
                mostLikelyDate: null,
                medianDate: null,
                earliestDate: null,
                latestDate: null,
                bestCaseAmount: currentAmount,
                worstCaseAmount: currentAmount,
                mostLikelyAmount: currentAmount,
                monthlyVariance: 0,
                returnVariance: 0,
                percentiles: {},
                scenarioResults: {
                    deterministic: {
                        completionDate: null,
                        finalAmount: currentAmount,
                        monthsNeeded: Infinity,
                    },
                },
            };
        }

        const monthsNeeded = Math.ceil((targetAmount - currentAmount) / monthlyAmount);
        const projectedCompletionDate = addMonths(today, monthsNeeded);

        // Determine success probability
        let successProbability = 100;
        if (monthsNeeded > monthsRemaining) {
            successProbability = Math.max(0, 100 - ((monthsNeeded - monthsRemaining) / monthsRemaining) * 50);
        }

        return {
            successProbability: Math.round(successProbability),
            confidenceLevel: this.getConfidenceLevel(successProbability),
            mostLikelyDate: projectedCompletionDate,
            medianDate: projectedCompletionDate,
            earliestDate: projectedCompletionDate,
            latestDate: projectedCompletionDate,
            bestCaseAmount: targetAmount,
            worstCaseAmount: currentAmount,
            mostLikelyAmount: targetAmount,
            monthlyVariance: 0,
            returnVariance: 0,
            percentiles: {
                p10: monthsNeeded,
                p25: monthsNeeded,
                p50: monthsNeeded,
                p75: monthsNeeded,
                p90: monthsNeeded,
            },
            scenarioResults: {
                deterministic: {
                    completionDate: projectedCompletionDate,
                    finalAmount: targetAmount,
                    monthsNeeded,
                },
            },
        };
    }

    /**
     * Run Monte Carlo simulation
     * @private
     */
    runMonteCarloSimulation(
        goal,
        plan,
        snapshots,
        simulationCount,
        marketReturnMean,
        marketReturnVolatility
    ) {
        const currentAmount = parseFloat(goal.currentAmount);
        const targetAmount = parseFloat(goal.targetAmount);
        const monthlyAmount = parseFloat(plan.adjustedMonthlyAmount);
        const targetDate = new Date(goal.targetDate);
        const today = new Date();

        const monthsRemaining = differenceInMonths(targetDate, today);

        if (monthsRemaining <= 0) {
            return {
                successProbability: goal.status === 'achieved' ? 100 : 0,
                confidenceLevel: goal.status === 'achieved' ? 'very_high' : 'very_low',
                mostLikelyDate: today,
                medianDate: today,
                earliestDate: today,
                latestDate: today,
                bestCaseAmount: currentAmount,
                worstCaseAmount: currentAmount,
                mostLikelyAmount: currentAmount,
                monthlyVariance: 0,
                returnVariance: 0,
                percentiles: {},
                scenarioResults: {},
            };
        }

        // Calculate historical contribution variance
        const historicalMonthlyContributions = this.extractMonthlyContributions(snapshots);
        const { mean: avgContribution, stdDev: contributionStdDev } = 
            this.calculateStats(historicalMonthlyContributions);

        const effectiveMonthlyAmount = avgContribution > 0 ? avgContribution : monthlyAmount;
        const contributionVariance = contributionStdDev / (effectiveMonthlyAmount || 1);

        // Run simulations
        const completionDates = [];
        const finalAmounts = [];

        for (let i = 0; i < simulationCount; i++) {
            const result = this.simulateGoalPath(
                currentAmount,
                targetAmount,
                effectiveMonthlyAmount,
                monthsRemaining,
                marketReturnMean,
                marketReturnVolatility,
                contributionVariance,
                targetDate
            );

            completionDates.push(result.completionDate);
            finalAmounts.push(result.finalAmount);
        }

        // Calculate statistics
        completionDates.sort((a, b) => getTime(a) - getTime(b));
        finalAmounts.sort((a, b) => a - b);

        const medianIndex = Math.floor(simulationCount / 2);
        const medianDate = completionDates[medianIndex];
        const earliestDate = completionDates[0];
        const latestDate = completionDates[simulationCount - 1];

        // Calculate success probability (reached target by target date)
        const successCount = finalAmounts.filter((amount) => amount >= targetAmount).length;
        const successProbability = Math.round((successCount / simulationCount) * 100);

        // Calculate percentiles
        const percentiles = {};
        for (const p of GoalTimelineProjector.CONFIDENCE_LEVELS) {
            const index = Math.floor(simulationCount * p);
            percentiles[`p${Math.round(p * 100)}`] = finalAmounts[index];
        }

        const { mean: avgFinal, stdDev: stdDevFinal } = this.calculateStats(finalAmounts);

        return {
            successProbability,
            confidenceLevel: this.getConfidenceLevel(successProbability),
            mostLikelyDate: medianDate,
            medianDate,
            earliestDate,
            latestDate,
            bestCaseAmount: finalAmounts[simulationCount - 1],
            worstCaseAmount: finalAmounts[0],
            mostLikelyAmount: avgFinal,
            monthlyVariance: stdDevFinal / (avgFinal || 1),
            returnVariance: marketReturnVolatility,
            percentiles,
            scenarioResults: {
                optimistic: {
                    probability: 0.1,
                    finalAmount: finalAmounts[Math.floor(simulationCount * 0.9)],
                    completionDate: completionDates[Math.floor(simulationCount * 0.1)],
                },
                realistic: {
                    probability: 0.5,
                    finalAmount: finalAmounts[medianIndex],
                    completionDate: medianDate,
                },
                pessimistic: {
                    probability: 0.9,
                    finalAmount: finalAmounts[Math.floor(simulationCount * 0.1)],
                    completionDate: completionDates[Math.floor(simulationCount * 0.9)],
                },
            },
        };
    }

    /**
     * Simulate a single goal completion path
     * @private
     */
    simulateGoalPath(
        startAmount,
        targetAmount,
        monthlyAmount,
        monthsAvailable,
        returnMean,
        returnVolatility,
        contributionVariance,
        targetDate
    ) {
        let currentAmount = startAmount;
        let months = 0;
        let completionDate = null;

        for (let month = 0; month < monthsAvailable && currentAmount < targetAmount; month++) {
            // Random monthly contribution (normally distributed around monthly amount)
            const monthlyReturn = this.sampleNormal(returnMean / 12, returnVolatility / Math.sqrt(12));
            const investmentGain = currentAmount * monthlyReturn;
            
            const contributionAmount = monthlyAmount * (1 + this.sampleNormal(0, contributionVariance));
            
            currentAmount += contributionAmount + investmentGain;
            months++;

            if (currentAmount >= targetAmount && !completionDate) {
                completionDate = addMonths(new Date(), months);
            }
        }

        // If goal not reached, use target date as completion date
        if (!completionDate) {
            completionDate = targetDate;
        }

        return {
            finalAmount: currentAmount,
            completionDate,
            monthsToCompletion: months,
        };
    }

    /**
     * Extract monthly contributions from snapshots
     * @private
     */
    extractMonthlyContributions(snapshots) {
        if (!snapshots || snapshots.length < 2) {
            return [];
        }

        const contributions = [];
        for (let i = 0; i < snapshots.length - 1; i++) {
            const current = parseFloat(snapshots[i].contributedAmount || 0);
            const previous = parseFloat(snapshots[i + 1].contributedAmount || 0);
            const contribution = Math.max(0, current - previous);
            if (contribution > 0) {
                contributions.push(contribution);
            }
        }

        return contributions;
    }

    /**
     * Calculate mean and standard deviation
     * @private
     */
    calculateStats(values) {
        if (!values || values.length === 0) {
            return { mean: 0, stdDev: 0 };
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        return { mean, stdDev };
    }

    /**
     * Sample from normal distribution using Box-Muller transform
     * @private
     */
    sampleNormal(mean = 0, stdDev = 1) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stdDev;
    }

    /**
     * Determine confidence level based on success probability
     * @private
     */
    getConfidenceLevel(probability) {
        if (probability >= 90) return 'very_high';
        if (probability >= 70) return 'high';
        if (probability >= 50) return 'moderate';
        if (probability >= 30) return 'low';
        return 'very_low';
    }

    /**
     * Get latest projection for a goal
     * @param {string} goalId - Goal ID
     * @returns {Promise<Object|null>} Latest projection or null
     */
    async getLatestProjection(goalId) {
        try {
            const projection = await db
                .select()
                .from(goalTimelineProjections)
                .where(eq(goalTimelineProjections.goalId, goalId))
                .orderBy(desc(goalTimelineProjections.generatedAt))
                .limit(1);

            return projection[0] || null;
        } catch (error) {
            throw new Error(`Failed to fetch projection: ${error.message}`);
        }
    }

    /**
     * Get all projections for a goal
     * @param {string} goalId - Goal ID
     * @param {number} limit - Maximum results
     * @returns {Promise<Array>} Array of projections
     */
    async getProjectionHistory(goalId, limit = 10) {
        try {
            const projections = await db
                .select()
                .from(goalTimelineProjections)
                .where(eq(goalTimelineProjections.goalId, goalId))
                .orderBy(desc(goalTimelineProjections.generatedAt))
                .limit(limit);

            return projections;
        } catch (error) {
            throw new Error(`Failed to fetch projection history: ${error.message}`);
        }
    }

    /**
     * Update success probability based on recent progress
     * @param {string} goalId - Goal ID
     * @param {number} currentProgress - Current amount
     * @returns {Promise<void>}
     */
    async recalculateProjectionImpact(goalId, currentProgress) {
        try {
            const projection = await this.getLatestProjection(goalId);
            if (!projection) return;

            // If current progress is significantly ahead/behind, invalidate projection
            const currentAsPercentage = (currentProgress / projection.targetAmount) * 100;
            const originalProgress = (projection.currentAmount / projection.targetAmount) * 100;

            if (Math.abs(currentAsPercentage - originalProgress) > 10) {
                // Mark as needing recalculation
                await db
                    .update(goalTimelineProjections)
                    .set({
                        validUntil: new Date(), // Mark as expired
                    })
                    .where(eq(goalTimelineProjections.id, projection.id));
            }
        } catch (error) {
            // Non-critical failure, just log
            console.error('Error recalculating projection impact:', error);
        }
    }
}

export default new GoalTimelineProjector();
