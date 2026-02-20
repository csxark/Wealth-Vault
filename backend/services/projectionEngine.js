import db from '../config/db.js';
import { cashFlowProjections, liquidityVelocityLogs, vaults, transactions, users } from '../db/schema.js';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { simulateStep, calculateConfidenceInterval } from '../utils/simulationMath.js';
import { logInfo, logError } from '../utils/logger.js';
import corporateService from './corporateService.js';

/**
 * Projection Engine (L3)
 * Core logic for 12-month liquidity forecasting using historical spending velocity.
 * Statistical "Confidence Interval" calculations for future balance ranges.
 */
class ProjectionEngine {
    /**
     * Generate a 12-month liquidity forecast for a user
     */
    async generateForecast(userId, simulations = 1000) {
        try {
            logInfo(`[Projection Engine] Generating 12-month forecast for user ${userId}...`);

            // 1. Get current total liquidity
            const userVaults = await db.query.vaults.findMany({
                where: and(eq(vaults.ownerId, userId), eq(vaults.status, 'active'))
            });
            const currentBalance = userVaults.reduce((sum, v) => sum + parseFloat(v.balance), 0);

            // 2. Calculate historical velocity (drift and volatility)
            const velocity = await this.calculateHistoricalVelocity(userId);
            const { drift, volatility, regime } = velocity;

            // 3. Run Monte Carlo simulations
            const forecastData = [];
            const months = 12;

            // Fetch monthly corporate tax drag
            const annualTaxLiability = await corporateService.calculateCorporateTaxDrag(userId);
            const monthlyTaxDrag = annualTaxLiability / 12;

            for (let m = 1; m <= months; m++) {
                const monthResults = [];
                for (let s = 0; s < simulations; s++) {
                    let simulatedBalance = currentBalance;
                    // Simulate step-by-step up to current month
                    for (let step = 1; step <= m; step++) {
                        simulatedBalance = simulateStep(simulatedBalance, drift, volatility);
                        // Subtract corporate tax leakage
                        simulatedBalance -= monthlyTaxDrag;
                    }
                    monthResults.push(simulatedBalance);
                }

                // 4. Extract stats
                const median = monthResults.reduce((sum, v) => sum + v, 0) / simulations;
                const [low, high] = calculateConfidenceInterval(monthResults, 0.95);

                const targetDate = new Date();
                targetDate.setMonth(targetDate.getMonth() + m);

                forecastData.push({
                    targetDate,
                    projectedBalance: median.toString(),
                    confidenceLow: low.toString(),
                    confidenceHigh: high.toString(),
                    metadata: { regime, simCount: simulations }
                });
            }

            // 5. Store in DB (Clear old first)
            await db.transaction(async (tx) => {
                await tx.delete(cashFlowProjections).where(eq(cashFlowProjections.userId, userId));
                await tx.insert(cashFlowProjections).values(
                    forecastData.map(f => ({
                        userId,
                        targetDate: f.targetDate,
                        projectedBalance: f.projectedBalance,
                        confidenceLow: f.confidenceLow,
                        confidenceHigh: f.confidenceHigh,
                        simulationType: 'monte_carlo',
                        metadata: f.metadata
                    }))
                );
            });

            logInfo(`[Projection Engine] Successfully updated forecast for user ${userId}.`);
            return forecastData;
        } catch (error) {
            logError('[Projection Engine] Forecast generation failed:', error);
            throw error;
        }
    }

    /**
     * Calculate historical drift (avg growth) and volatility (variance)
     * Enhanced with Regime Detection (L3)
     */
    async calculateHistoricalVelocity(userId) {
        // Fetch last 120 days of data for better regime detection
        const oneTwentyDaysAgo = new Date();
        oneTwentyDaysAgo.setDate(oneTwentyDaysAgo.getDate() - 120);

        const recentLogs = await db.query.liquidityVelocityLogs.findMany({
            where: and(
                eq(liquidityVelocityLogs.userId, userId),
                gte(liquidityVelocityLogs.measuredAt, oneTwentyDaysAgo)
            ),
            orderBy: [desc(liquidityVelocityLogs.measuredAt)]
        });

        if (recentLogs.length < 10) {
            return { drift: -0.015, volatility: 0.04, regime: 'STABLE_BURN' };
        }

        const burnRates = recentLogs.map(l => parseFloat(l.dailyBurnRate));

        // 1. Detect Regime (Stable vs Volatile vs Crisis)
        const recentVariance = this.calculateVariance(burnRates.slice(0, 5));
        const historicalVariance = this.calculateVariance(burnRates);

        let regimeMultiplier = 1.0;
        let regime = 'STABLE';

        if (recentVariance > historicalVariance * 2) {
            regime = 'HIGH_VOLATILITY';
            regimeMultiplier = 1.6;
        } else if (recentVariance < historicalVariance * 0.4) {
            regime = 'CONSOLIDATION';
            regimeMultiplier = 0.7;
        }

        // 2. Seasonality Detection (e.g., higher expenses at month end)
        const seasonalityFactor = this.calculateSeasonality(recentLogs);

        const avgBurn = burnRates.reduce((sum, v) => sum + v, 0) / burnRates.length;

        // Normalized drift: Monthly projected change based on daily burn + seasonality
        let drift = ((avgBurn * 30) / 100000) + seasonalityFactor;

        // Volatility: Adjusted by regime
        const volatility = (Math.sqrt(historicalVariance) / 10000) * regimeMultiplier;

        return {
            drift: Math.min(0.25, Math.max(-0.25, drift)),
            volatility: Math.min(0.45, Math.max(0.01, volatility)),
            regime
        };
    }

    /**
     * Statistical Variance Helper
     */
    calculateVariance(data) {
        if (data.length === 0) return 0;
        const mean = data.reduce((a, b) => a + b) / data.length;
        return data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    }

    /**
     * Seasonality Detection (L3)
     * Detects if burn rate cycles based on day of month
     */
    calculateSeasonality(logs) {
        const today = new Date().getDate();
        // Check if logs near today's day-of-month across previous months show higher burn
        const similarDayLogs = logs.filter(l => {
            const logDay = new Date(l.measuredAt).getDate();
            return Math.abs(logDay - today) <= 2;
        });

        if (similarDayLogs.length < 2) return 0;

        const avgSimilar = similarDayLogs.reduce((sum, l) => sum + parseFloat(l.dailyBurnRate), 0) / similarDayLogs.length;
        const avgGlobal = logs.reduce((sum, l) => sum + parseFloat(l.dailyBurnRate), 0) / logs.length;

        // If burn on these days is typically 20% higher, add to drift
        return (avgSimilar > avgGlobal * 1.2) ? -0.008 : 0;
    }

    /**
     * Get current projected summary
     */
    async getForecastSummary(userId) {
        return await db.query.cashFlowProjections.findMany({
            where: eq(cashFlowProjections.userId, userId),
            orderBy: [cashFlowProjections.targetDate]
        });
    }
}

export default new ProjectionEngine();
