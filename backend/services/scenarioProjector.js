// Scenario Projector Service - Monte Carlo portfolio projections
// Issue #654: AI-Powered Smart Asset Allocation Advisor

import { db } from '../db/index.js';
import { scenarioProjections } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class ScenarioProjector {
    constructor() {
        // Historical return assumptions
        this.assetReturns = {
            equities: { mean: 0.09, std: 0.16 },
            bonds: { mean: 0.04, std: 0.04 },
            cash: { mean: 0.045, std: 0.001 },
            alternatives: { mean: 0.07, std: 0.12 },
            real_estate: { mean: 0.08, std: 0.10 },
            commodities: { mean: 0.05, std: 0.18 },
        };

        // Scenario multipliers
        this.scenarios = {
            base: { equityMult: 1.0, volatilityMult: 1.0, label: 'Base Case (50th percentile)' },
            optimistic: { equityMult: 1.3, volatilityMult: 0.8, label: 'Bull Market (90th percentile)' },
            pessimistic: { equityMult: 0.7, volatilityMult: 1.3, label: 'Bear Market (10th percentile)' },
            crash: { equityMult: -0.20, volatilityMult: 2.0, label: 'Market Crash' },
            reverse_sequence: { equityMult: 1.0, volatilityMult: 1.0, label: 'Poor Sequence of Returns' },
        };
    }

    /**
     * Run Monte Carlo simulation for portfolio
     * @param {string} userId - User ID
     * @param {object} allocation - Asset allocation
     * @param {number} initialValue - Starting portfolio value
     * @param {number} yearsToProject - Years to project
     * @param {number} iterations - Number of Monte Carlo iterations
     * @returns {object} Projection results
     */
    async runMonteCarloSimulation(userId, vaultId, allocation, initialValue, yearsToProject = 20, iterations = 1000) {
        try {
            const projections = {
                base: this.simulateScenario(allocation, initialValue, yearsToProject, iterations, 'base'),
                optimistic: this.simulateScenario(allocation, initialValue, yearsToProject, iterations, 'optimistic'),
                pessimistic: this.simulateScenario(allocation, initialValue, yearsToProject, iterations, 'pessimistic'),
                crash: this.simulateScenario(allocation, initialValue, yearsToProject, iterations, 'crash'),
            };

            // Store results
            const periodStart = new Date();
            const periodEnd = new Date(periodStart.getTime() + yearsToProject * 365.25 * 24 * 60 * 60 * 1000);

            for (const [scenarioType, results] of Object.entries(projections)) {
                await db.insert(scenarioProjections).values({
                    userId,
                    vaultId,
                    scenarioType,
                    periodStart,
                    periodEnd,
                    projections: JSON.stringify(results.yearlyProjections),
                    successProbability: (results.successProbability * 100).toString(),
                    endingValue: results.endingValue.toString(),
                    volatility: (results.volatility * 100).toString(),
                    maxDrawdown: (results.maxDrawdown * 100).toString(),
                    monteCarloIterations: iterations,
                }).returning();
            }

            return {
                success: true,
                initialValue,
                yearsToProject,
                iterations,
                allocation,
                scenarios: projections,
                summary: this.generateSummary(projections),
            };

        } catch (error) {
            console.error('Error running Monte Carlo simulation:', error);
            throw error;
        }
    }

    /**
     * Simulate specific scenario
     */
    simulateScenario(allocation, initialValue, yearsToProject, iterations, scenarioType) {
        const paths = [];
        let successCount = 0;
        let maxDrawdowns = [];

        const scenario = this.scenarios[scenarioType];

        for (let i = 0; i < iterations; i++) {
            const path = this.simulatePath(allocation, initialValue, yearsToProject, scenario);
            paths.push(path);

            // Track success (not negative at end)
            if (path[path.length - 1] >= initialValue) {
                successCount++;
            }

            // Track max drawdown
            let peak = initialValue;
            let maxDrawdown = 0;
            for (const value of path) {
                if (value > peak) peak = value;
                const drawdown = (peak - value) / peak;
                if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            }
            maxDrawdowns.push(maxDrawdown);
        }

        // Calculate percentiles
        const endingValues = paths.map(p => p[p.length - 1]).sort((a, b) => a - b);
        const percentile10 = endingValues[Math.floor(iterations * 0.10)];
        const percentile50 = endingValues[Math.floor(iterations * 0.50)];
        const percentile90 = endingValues[Math.floor(iterations * 0.90)];

        // Calculate statistics
        const allValues = endingValues.flat();
        const mean = allValues.reduce((a, b) => a + b) / allValues.length;
        const variance = allValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / allValues.length;
        const volatility = Math.sqrt(variance) / initialValue;

        // Yearly aggregates
        const yearlyProjections = this.aggregateByYear(paths);

        return {
            scenarioType,
            successProbability: successCount / iterations,
            endingValue: percentile50,
            percentile10,
            percentile50,
            percentile90,
            volatility,
            maxDrawdown: Math.max(...maxDrawdowns),
            avgMaxDrawdown: maxDrawdowns.reduce((a, b) => a + b) / maxDrawdowns.length,
            yearlyProjections,
            trajectories: paths.slice(0, 100), // Sample of paths for visualization
        };
    }

    /**
     * Simulate single portfolio path
     */
    simulatePath(allocation, initialValue, yearsToProject, scenario) {
        const path = [initialValue];
        let currentValue = initialValue;

        for (let year = 1; year <= yearsToProject; year++) {
            // Calculate annual return as weighted average of asset returns
            let annualReturn = 0;

            for (const [asset, weight] of Object.entries(allocation)) {
                const assetData = this.assetReturns[asset.replace('_', '_')] || { mean: 0.05, std: 0.10 };

                // Apply scenario multipliers
                const mean = assetData.mean * scenario.equityMult;
                const std = assetData.std * scenario.volatilityMult;

                // Generate random normal return
                const zScore = this.randomNormal();
                const assetReturn = mean + std * zScore;

                annualReturn += weight * assetReturn;
            }

            currentValue = currentValue * (1 + annualReturn);
            path.push(currentValue);
        }

        return path;
    }

    /**
     * Generate random number from normal distribution (Box-Muller)
     */
    randomNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    /**
     * Aggregate simulated paths by year
     */
    aggregateByYear(paths) {
        const iterations = paths.length;
        const yearsCount = paths[0].length - 1;
        const yearly = [];

        for (let year = 1; year <= yearsCount; year++) {
            const yearValues = paths.map(p => p[year]).sort((a, b) => a - b);

            yearly.push({
                year,
                percentile10: yearValues[Math.floor(iterations * 0.10)],
                percentile25: yearValues[Math.floor(iterations * 0.25)],
                percentile50: yearValues[Math.floor(iterations * 0.50)],
                percentile75: yearValues[Math.floor(iterations * 0.75)],
                percentile90: yearValues[Math.floor(iterations * 0.90)],
                min: yearValues[0],
                max: yearValues[iterations - 1],
            });
        }

        return yearly;
    }

    /**
     * Calculate success probability for target value
     */
    calculateSuccessProbability(allocation, initialValue, targetValue, yearsToProject, iterations = 1000) {
        const scenario = this.scenarios.base;
        const paths = [];

        for (let i = 0; i < iterations; i++) {
            const path = this.simulatePath(allocation, initialValue, yearsToProject, scenario);
            paths.push(path[path.length - 1] >= targetValue);
        }

        const successCount = paths.filter(p => p).length;

        return {
            targetValue,
            successProbability: successCount / iterations,
            percentSuccessful: (successCount / iterations * 100).toFixed(1) + '%',
            iterationsRun: iterations,
        };
    }

    /**
     * Run reverse sequence of returns risk simulation
     */
    simulateReverseSequenceRisk(allocation, initialValue, yearsToProject, historicalReturns) {
        // Apply historical returns in reverse order
        const reverseReturns = [...historicalReturns].reverse();
        
        let portfolioValue = initialValue;
        const path = [portfolioValue];

        for (let i = 0; i < yearsToProject && i < reverseReturns.length; i++) {
            const yearReturn = reverseReturns[i];
            portfolioValue = portfolioValue * (1 + yearReturn);
            path.push(portfolioValue);
        }

        const endingValue = portfolioValue;
        const totalReturn = (endingValue - initialValue) / initialValue;

        return {
            scenarioType: 'reverse_sequence',
            endingValue,
            totalReturn,
            path,
            interpretation: 'Poor sequence of returns risk: portfolio value depends heavily on timing of returns',
        };
    }

    /**
     * Analyze sequence of returns risk
     */
    analyzeSequenceOfReturnsRisk(allocation, initialValue, annualReturn, volatility, yearsToProject) {
        const bestScenario = { label: '', endingValue: 0 };
        const worstScenario = { label: '', endingValue: Infinity };

        // Test different return sequences
        for (let sequence = 0; sequence < 3; sequence++) {
            let value = initialValue;
            let label = '';

            if (sequence === 0) {
                // Returns front-loaded (best case)
                for (let year = 0; year < yearsToProject; year++) {
                    const boost = (year < yearsToProject / 2) ? volatility : -volatility * 0.5;
                    value *= (1 + annualReturn + boost);
                }
                label = 'Front-loaded returns (Best case)';
            } else if (sequence === 1) {
                // Returns back-loaded (worst case)
                for (let year = 0; year < yearsToProject; year++) {
                    const reduction = (year < yearsToProject / 2) ? -volatility * 0.5 : volatility;
                    value *= (1 + annualReturn + reduction);
                }
                label = 'Back-loaded returns (Worst case)';
            } else {
                // Moderate sequence
                for (let year = 0; year < yearsToProject; year++) {
                    value *= (1 + annualReturn);
                }
                label = 'Consistent returns (Base case)';
            }

            if (value > bestScenario.endingValue) {
                bestScenario.label = label;
                bestScenario.endingValue = value;
            }

            if (value < worstScenario.endingValue) {
                worstScenario.label = label;
                worstScenario.endingValue = value;
            }
        }

        return {
            bestScenario,
            worstScenario,
            difference: bestScenario.endingValue - worstScenario.endingValue,
            percentDifference: ((bestScenario.endingValue - worstScenario.endingValue) / worstScenario.endingValue * 100).toFixed(1) + '%',
            lesson: 'Sequence of returns risk can significantly impact  retirement portfolio outcomes',
        };
    }

    /**
     * Generate scenario summary
     */
    generateSummary(projections) {
        return {
            baseCase: {
                endingValue: projections.base.endingValue,
                successProbability: (projections.base.successProbability * 100).toFixed(1) + '%',
                percentile10: projections.base.percentile10,
                percentile90: projections.base.percentile90,
            },
            optimisticCase: {
                endingValue: projections.optimistic.endingValue,
                upside: (projections.optimistic.endingValue - projections.base.endingValue).toFixed(0),
            },
            pessimisticCase: {
                endingValue: projections.pessimistic.endingValue,
                downside: (projections.pessimistic.endingValue - projections.base.endingValue).toFixed(0),
            },
            crashCase: {
                endingValue: projections.crash.endingValue,
                recoveryYears: this.estimateRecoveryYears(projections.crash.yearlyProjections),
            },
        };
    }

    /**
     * Estimate recovery years from crash
     */
    estimateRecoveryYears(yearlyProjections) {
        const minYear = yearlyProjections.reduce((min, year, idx) => 
            year.percentile50 < yearlyProjections[min].percentile50 ? idx : min, 0
        );

        if (minYear === yearlyProjections.length - 1) {
            return 'Not recovered within projection period';
        }

        for (let i = minYear + 1; i < yearlyProjections.length; i++) {
            if (yearlyProjections[i].percentile50 >= yearlyProjections[0].percentile50) {
                return (i - minYear) + ' years';
            }
        }

        return 'Not recovered within projection period';
    }

    /**
     * Get scenario projection
     */
    async getScenarioProjection(userId, scenarioType) {
        const projections = await db.select()
            .from(scenarioProjections)
            .where(eq(scenarioProjections.userId, userId))
            .where(eq(scenarioProjections.scenarioType, scenarioType))
            .orderBy((table) => table.createdAt)
            .limit(1);

        if (projections.length === 0) {
            return { success: false, message: 'Projection not found' };
        }

        return {
            success: true,
            projection: projections[0],
            yearlyData: JSON.parse(projections[0].projections),
        };
    }
}

export default new ScenarioProjector();
