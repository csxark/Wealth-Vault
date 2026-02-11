import db from '../config/db.js';
import { simulationResults, expenses, fixedAssets } from '../db/schema.js';
import { eq, gte, sql } from 'drizzle-orm';
import assetService from './assetService.js';

class ProjectionEngine {
    /**
     * Run Monte Carlo simulation for net worth projection
     */
    async runSimulation(userId, config) {
        const {
            timeHorizon = 30, // years
            iterations = 1000,
            inflationRate = 2.5, // %
            investmentReturn = 7, // %
            returnVolatility = 15, // %
            monthlyContribution = 0,
            includeAssets = true
        } = config;

        console.log(`[Projection Engine] Running ${iterations} Monte Carlo iterations for ${timeHorizon} years...`);

        // Get current financial state
        const currentState = await this.getCurrentFinancialState(userId, includeAssets);

        // Run simulations
        const results = [];
        for (let i = 0; i < iterations; i++) {
            const projection = this.simulatePath(currentState, {
                timeHorizon,
                inflationRate,
                investmentReturn,
                returnVolatility,
                monthlyContribution
            });
            results.push(projection);
        }

        // Calculate percentiles
        const analysis = this.analyzeResults(results, timeHorizon);

        // Store results
        const [saved] = await db.insert(simulationResults).values({
            userId,
            scenarioName: `${timeHorizon}Y Projection`,
            configurations: config,
            results: analysis
        }).returning();

        return {
            ...saved,
            currentState
        };
    }

    /**
     * Get user's current financial state
     */
    async getCurrentFinancialState(userId, includeAssets = true) {
        // Get monthly income/expenses average (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const expenseData = await db.select({
            total: sql`SUM(CAST(${expenses.amount} AS NUMERIC))`,
            count: sql`COUNT(*)`
        })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, sixMonthsAgo)
                )
            );

        const avgMonthlyExpense = expenseData[0]?.total ? parseFloat(expenseData[0].total) / 6 : 0;

        // Get asset portfolio value
        let assetValue = 0;
        if (includeAssets) {
            const portfolio = await assetService.getPortfolioValue(userId);
            assetValue = portfolio.totalValue;
        }

        // Get user profile
        const [user] = await db.select().from(db.schema.users).where(eq(db.schema.users.id, userId));

        const monthlyIncome = user?.monthlyIncome ? parseFloat(user.monthlyIncome) : 0;
        const emergencyFund = user?.emergencyFund ? parseFloat(user.emergencyFund) : 0;

        return {
            netWorth: assetValue + emergencyFund,
            monthlyIncome,
            monthlyExpense: avgMonthlyExpense,
            monthlySavings: monthlyIncome - avgMonthlyExpense,
            assetValue,
            liquidCash: emergencyFund
        };
    }

    /**
     * Simulate a single path using stochastic returns
     */
    simulatePath(currentState, config) {
        const { timeHorizon, inflationRate, investmentReturn, returnVolatility, monthlyContribution } = config;

        let wealth = currentState.netWorth;
        const yearlyValues = [wealth];

        for (let year = 1; year <= timeHorizon; year++) {
            // Generate random annual return (normal distribution approximation)
            const randomReturn = this.normalRandom(investmentReturn, returnVolatility);

            // Apply return
            wealth *= (1 + randomReturn / 100);

            // Add contributions (adjusted for inflation)
            const inflationAdjustedContribution = monthlyContribution * 12 * Math.pow(1 - inflationRate / 100, year);
            wealth += inflationAdjustedContribution;

            // Subtract expenses growth (assume 3% annual growth)
            const expenseGrowth = currentState.monthlyExpense * 12 * Math.pow(1.03, year);
            wealth -= expenseGrowth;

            yearlyValues.push(Math.max(0, wealth)); // Wealth can't go negative
        }

        return yearlyValues;
    }

    /**
     * Box-Muller transform for normal distribution
     */
    normalRandom(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    /**
     * Analyze simulation results and calculate percentiles
     */
    analyzeResults(results, timeHorizon) {
        const percentileData = [];

        for (let year = 0; year <= timeHorizon; year++) {
            const yearValues = results.map(path => path[year]).sort((a, b) => a - b);

            percentileData.push({
                year,
                p10: this.getPercentile(yearValues, 10),
                p50: this.getPercentile(yearValues, 50), // median
                p90: this.getPercentile(yearValues, 90),
                mean: yearValues.reduce((a, b) => a + b, 0) / yearValues.length
            });
        }

        const finalYear = percentileData[timeHorizon];

        return {
            yearlyProjections: percentileData,
            summary: {
                finalNetWorth: {
                    pessimistic: finalYear.p10,
                    mostLikely: finalYear.p50,
                    optimistic: finalYear.p90,
                    average: finalYear.mean
                },
                probabilityOfSuccess: this.calculateSuccessRate(results, timeHorizon)
            }
        };
    }

    /**
     * Get percentile value from sorted array
     */
    getPercentile(sortedArray, percentile) {
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, index)];
    }

    /**
     * Calculate probability of positive net worth
     */
    calculateSuccessRate(results, timeHorizon) {
        const finalValues = results.map(path => path[timeHorizon]);
        const successful = finalValues.filter(v => v > 0).length;
        return ((successful / results.length) * 100).toFixed(2);
    }

    /**
     * Get user's simulation history
     */
    async getSimulationHistory(userId) {
        return await db.query.simulationResults.findMany({
            where: eq(simulationResults.userId, userId),
            orderBy: [desc(simulationResults.createdAt)],
            limit: 10
        });
    }
}

export default new ProjectionEngine();
