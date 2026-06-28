// Glide Path Calculator - Automatic allocation adjustments over time
// Issue #654: AI-Powered Smart Asset Allocation Advisor

import { db } from '../db/index.js';
import { glidePaths, allocationRecommendations } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class GlidepathCalculator {
    constructor() {
        // Standard glide path templates by years to goal
        this.glidePathTemplates = {
            conservative: {
                '20_plus': { equities: 0.70, bonds: 0.25, cash: 0.05 },
                '15_20': { equities: 0.60, bonds: 0.35, cash: 0.05 },
                '10_15': { equities: 0.50, bonds: 0.45, cash: 0.05 },
                '5_10': { equities: 0.35, bonds: 0.60, cash: 0.05 },
                '2_5': { equities: 0.20, bonds: 0.75, cash: 0.05 },
                '1_2': { equities: 0.10, bonds: 0.85, cash: 0.05 },
                '0_1': { equities: 0.05, bonds: 0.90, cash: 0.05 },
            },
            moderate: {
                '20_plus': { equities: 0.85, bonds: 0.10, cash: 0.05 },
                '15_20': { equities: 0.75, bonds: 0.20, cash: 0.05 },
                '10_15': { equities: 0.65, bonds: 0.30, cash: 0.05 },
                '5_10': { equities: 0.50, bonds: 0.45, cash: 0.05 },
                '2_5': { equities: 0.35, bonds: 0.60, cash: 0.05 },
                '1_2': { equities: 0.20, bonds: 0.75, cash: 0.05 },
                '0_1': { equities: 0.10, bonds: 0.85, cash: 0.05 },
            },
            aggressive: {
                '20_plus': { equities: 0.90, bonds: 0.05, cash: 0.05 },
                '15_20': { equities: 0.85, bonds: 0.10, cash: 0.05 },
                '10_15': { equities: 0.75, bonds: 0.20, cash: 0.05 },
                '5_10': { equities: 0.60, bonds: 0.35, cash: 0.05 },
                '2_5': { equities: 0.45, bonds: 0.50, cash: 0.05 },
                '1_2': { equities: 0.30, bonds: 0.65, cash: 0.05 },
                '0_1': { equities: 0.15, bonds: 0.80, cash: 0.05 },
            },
        };

        // Adjustment frequency in days
        this.frequencyDays = {
            yearly: 365,
            quarterly: 92,
            monthly: 30,
        };
    }

    /**
     * Generate glide path for a goal
     * @param {string} userId - User ID
     * @param {string} goalId - Goal ID
     * @param {Date} startDate - Start date
     * @param {Date} targetDate - Goal target date
     * @param {object} startAllocation - Initial allocation
     * @param {string} strategy - 'conservative', 'moderate', 'aggressive'
     * @returns {object} Glide path configuration
     */
    async generateGlidePath(userId, goalId, startDate, targetDate, startAllocation, strategy = 'moderate') {
        try {
            const yearsToGoal = this.calculateYearsToGoal(startDate, targetDate);
            const endAllocation = this.calculateEndAllocation(yearsToGoal, strategy);

            // Create glide path record
            const [glidePath] = await db.insert(glidePaths).values({
                userId,
                goalId,
                startAllocation: JSON.stringify(startAllocation),
                endAllocation: JSON.stringify(endAllocation),
                startDate,
                targetDate,
                adjustmentFrequency: 'yearly',
                currentAllocation: JSON.stringify(startAllocation),
                nextAdjustmentDate: new Date(startDate.getTime() + (365 * 24 * 60 * 60 * 1000)),
                isActive: true,
            }).returning();

            // Generate yearly adjustments
            const adjustments = this.generateYearlyAdjustments(
                startAllocation,
                endAllocation,
                startDate,
                targetDate,
                yearsToGoal
            );

            return {
                success: true,
                glidePath,
                strategy,
                yearsToGoal,
                startAllocation,
                endAllocation,
                adjustments,
                totalAdjustments: adjustments.length,
            };

        } catch (error) {
            console.error('Error generating glide path:', error);
            throw error;
        }
    }

    /**
     * Calculate years to goal
     */
    calculateYearsToGoal(startDate, targetDate) {
        const now = new Date(startDate);
        const target = new Date(targetDate);
        const diffMs = target - now;
        return Math.round((diffMs / (1000 * 60 * 60 * 24)) / 365.25);
    }

    /**
     * Calculate end allocation based on years to goal
     */
    calculateEndAllocation(yearsToGoal, strategy = 'moderate') {
        // Very conservative near goal: all bonds
        if (yearsToGoal <= 1) {
            return { equities: 0.10, bonds: 0.85, cash: 0.05, alternatives: 0, real_estate: 0 };
        }

        // Select from template
        const strategyPath = this.glidePathTemplates[strategy] || this.glidePathTemplates.moderate;

        if (yearsToGoal > 20) return strategyPath['20_plus'];
        if (yearsToGoal > 15) return strategyPath['15_20'];
        if (yearsToGoal > 10) return strategyPath['10_15'];
        if (yearsToGoal > 5) return strategyPath['5_10'];
        if (yearsToGoal > 2) return strategyPath['2_5'];
        if (yearsToGoal > 1) return strategyPath['1_2'];
        return strategyPath['0_1'];
    }

    /**
     * Generate yearly adjustment schedule
     */
    generateYearlyAdjustments(startAllocation, endAllocation, startDate, targetDate, yearsToGoal) {
        const adjustments = [];

        for (let year = 1; year <= yearsToGoal; year++) {
            // Linear interpolation between start and end
            const progress = year / yearsToGoal;

            const adjustment = {};
            for (const [asset, endValue] of Object.entries(endAllocation)) {
                const startValue = startAllocation[asset] || 0;
                adjustment[asset] = startValue + (endValue - startValue) * progress;
            }

            const adjustmentDate = new Date(startDate);
            adjustmentDate.setFullYear(adjustmentDate.getFullYear() + year);

            adjustments.push({
                year,
                adjustmentDate,
                allocation: adjustment,
                changes: this.calculateChanges(
                    year === 1 ? startAllocation : adjustments[year - 2].allocation,
                    adjustment
                ),
            });
        }

        return adjustments;
    }

    /**
     * Calculate changes from previous allocation
     */
    calculateChanges(previousAllocation, newAllocation) {
        const changes = {};
        for (const [asset, newValue] of Object.entries(newAllocation)) {
            const oldValue = previousAllocation[asset] || 0;
            changes[asset] = {
                from: (oldValue * 100).toFixed(1) + '%',
                to: (newValue * 100).toFixed(1) + '%',
                change: ((newValue - oldValue) * 100).toFixed(1) + '%',
            };
        }
        return changes;
    }

    /**
     * Get current allocation based on glide path
     */
    async getCurrentAllocation(glidePathId) {
        const [glidePath] = await db.select()
            .from(glidePaths)
            .where(eq(glidePaths.id, glidePathId))
            .limit(1);

        if (!glidePath) {
            throw new Error('Glide path not found');
        }

        const now = new Date();
        const startDate = new Date(glidePath.startDate);
        const targetDate = new Date(glidePath.targetDate);

        if (now >= targetDate) {
            // Goal date reached, use end allocation
            return {
                allocation: JSON.parse(glidePath.endAllocation),
                status: 'goal_reached',
                message: 'Goal date reached, using conservative allocation',
            };
        }

        if (now < startDate) {
            // Before start, use start allocation
            return {
                allocation: JSON.parse(glidePath.startAllocation),
                status: 'not_started',
                message: 'Glide path not yet started',
            };
        }

        // Calculate current allocation based on linear progression
        const totalMs = targetDate.getTime() - startDate.getTime();
        const elapsedMs = now.getTime() - startDate.getTime();
        const progress = elapsedMs / totalMs;

        const startAllocation = JSON.parse(glidePath.startAllocation);
        const endAllocation = JSON.parse(glidePath.endAllocation);

        const currentAllocation = {};
        for (const [asset, endValue] of Object.entries(endAllocation)) {
            const startValue = startAllocation[asset] || 0;
            currentAllocation[asset] = startValue + (endValue - startValue) * progress;
        }

        return {
            allocation: currentAllocation,
            progress: (progress * 100).toFixed(1) + '%',
            yearsElapsed: Math.round(elapsedMs / (365.25 * 24 * 60 * 60 * 1000)),
            yearsRemaining: this.calculateYearsToGoal(now, targetDate),
            nextAdjustmentDate: new Date(glidePath.nextAdjustmentDate),
            status: 'in_progress',
        };
    }

    /**
     * Schedule auto-adjustments
     */
    async scheduleAutoAdjustments(glidePathId, frequency = 'yearly') {
        const [glidePath] = await db.select()
            .from(glidePaths)
            .where(eq(glidePaths.id, glidePathId))
            .limit(1);

        if (!glidePath) {
            throw new Error('Glide path not found');
        }

        const frequencyMs = this.frequencyDays[frequency] * 24 * 60 * 60 * 1000;
        const nextAdjustment = new Date(new Date().getTime() + frequencyMs);

        // Update next adjustment date
        await db.update(glidePaths)
            .set({ nextAdjustmentDate: nextAdjustment })
            .where(eq(glidePaths.id, glidePathId));

        return {
            success: true,
            glidePathId,
            frequency,
            nextAdjustmentDate: nextAdjustment,
            message: `Adjustments scheduled ${frequency}ly`,
        };
    }

    /**
     * Get allocation drift (current vs target)
     */
    async getAllocationDrift(glidePathId, currentAllocation) {
        const { allocation: targetAllocation } = await this.getCurrentAllocation(glidePathId);

        const drift = {};
        let totalDrift = 0;

        for (const [asset, currentValue] of Object.entries(currentAllocation)) {
            const targetValue = targetAllocation[asset] || 0;
            const difference = currentValue - targetValue;
            drift[asset] = {
                current: (currentValue * 100).toFixed(1) + '%',
                target: (targetValue * 100).toFixed(1) + '%',
                drift: (difference * 100).toFixed(1) + '%',
                needsRebalance: Math.abs(difference) > 0.05, // >5% drift
            };
            totalDrift += Math.abs(difference);
        }

        return {
            drift,
            totalDrift: (totalDrift * 100).toFixed(1) + '%',
            needsRebalance: totalDrift > 0.10, // >10% total drift
            rebalancingPriority: this.calculateRebalancingPriority(totalDrift),
        };
    }

    /**
     * Calculate rebalancing priority
     */
    calculateRebalancingPriority(totalDrift) {
        if (totalDrift < 0.05) return 'optional';
        if (totalDrift < 0.10) return 'low';
        if (totalDrift < 0.15) return 'medium';
        return 'high';
    }

    /**
     * Simulate glide path evolution
     */
    simulateGlidePath(startAllocation, endAllocation, yearsToGoal, annualReturn = 0.07) {
        const projections = [];
        let currentAllocation = startAllocation;

        for (let year = 0; year <= yearsToGoal; year++) {
            // Progress along glide path
            const progress = year / yearsToGoal;
            const allocation = {};

            for (const [asset, endValue] of Object.entries(endAllocation)) {
                const startValue = startAllocation[asset] || 0;
                allocation[asset] = startValue + (endValue - startValue) * progress;
            }

            // Project values (simplified)
            const projectedValue = 100000 * Math.pow(1 + annualReturn, year);

            projections.push({
                year,
                allocation,
                projectedPortfolioValue: projectValue,
                progress: (progress * 100).toFixed(1) + '%',
            });
        }

        return {
            projections,
            startAllocation,
            endAllocation,
            yearsToGoal,
            assumedAnnualReturn: (annualReturn * 100).toFixed(1) + '%',
        };
    }

    /**
     * Get glide path status
     */
    async getGlidePathStatus(userId) {
        const paths = await db.select()
            .from(glidePaths)
            .where(eq(glidePaths.userId, userId));

        const status = [];
        for (const path of paths) {
            const current = await this.getCurrentAllocation(path.id);
            status.push({
                glidePathId: path.id,
                goalId: path.goalId,
                ...current,
            });
        }

        return {
            success: true,
            glidePathCount: status.length,
            paths: status,
        };
    }

    /**
     * Calculate reverse glide path (for accumulation phases)
     */
    generateAccumulationGlidePath(startDate, targetDate, targetAllocation = null) {
        // Opposite of glide path: start conservative, become more aggressive
        const yearsToGoal = this.calculateYearsToGoal(startDate, targetDate);

        const startAllocation = { equities: 0.30, bonds: 0.60, cash: 0.10 };
        const endAllocation = targetAllocation || { equities: 0.70, bonds: 0.25, cash: 0.05 };

        return {
            strategy: 'accumulation',
            yearsToGoal,
            startAllocation,
            endAllocation,
            philosophy: 'Start conservative while building capital, become more aggressive as wealth accumulates',
        };
    }
}

export default new GlidepathCalculator();
