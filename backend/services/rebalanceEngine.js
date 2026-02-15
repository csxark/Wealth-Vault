import { db } from '../db/index.js';
import { targetAllocations, driftLogs, portfolios } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import tradeOptimizer from './tradeOptimizer.js';
import { logInfo, logError } from '../utils/logger.js';

class RebalanceEngine {
    /**
     * Calculates the "drift" for a portfolio compared to its targets
     */
    async calculatePortfolioDrift(userId, portfolioId) {
        logInfo(`Calculating drift for portfolio: ${portfolioId}`);

        try {
            // 1. Get targets
            const targets = await db.select()
                .from(targetAllocations)
                .where(and(
                    eq(targetAllocations.userId, userId),
                    eq(targetAllocations.portfolioId, portfolioId)
                ));

            if (targets.length === 0) return { drift: [], isBreached: false };

            // 2. Get current actual values (mocking asset value retrieval)
            const currentAssets = await this.getCurrentAssetValues(userId, portfolioId);
            const totalValue = currentAssets.reduce((sum, a) => sum + a.value, 0);

            if (totalValue === 0) return { drift: [], isBreached: false };

            const driftResults = [];
            let maxDrift = 0;
            let breachDetected = false;

            for (const target of targets) {
                const asset = currentAssets.find(a => a.symbol === target.symbol) || { value: 0 };
                const actualPercentage = (asset.value / totalValue) * 100;
                const targetPercentage = parseFloat(target.targetPercentage);
                const drift = actualPercentage - targetPercentage;
                const tolerance = parseFloat(target.toleranceBand || 5);

                if (Math.abs(drift) > tolerance) {
                    breachDetected = true;
                }

                if (Math.abs(drift) > maxDrift) {
                    maxDrift = Math.abs(drift);
                }

                driftResults.push({
                    symbol: target.symbol,
                    target: targetPercentage,
                    actual: actualPercentage,
                    drift: drift,
                    tolerance: tolerance,
                    requiresTrade: Math.abs(drift) > tolerance
                });
            }

            // 3. Log the drift check
            await db.insert(driftLogs).values({
                userId,
                portfolioId,
                currentAllocations: driftResults,
                maxDriftDetected: maxDrift.toString(),
                isBreachDetected: breachDetected
            });

            return {
                portfolioId,
                totalValue,
                drift: driftResults,
                isBreached: breachDetected,
                maxDrift
            };
        } catch (error) {
            logError(`Drift calculation failed for portfolio ${portfolioId}:`, error);
            throw error;
        }
    }

    /**
     * Proposes a series of trades to bring the portfolio back into balance
     */
    async generateRebalancePlan(userId, portfolioId) {
        const driftData = await this.calculatePortfolioDrift(userId, portfolioId);
        if (!driftData.isBreached) {
            return { message: "Portfolio is within tolerance bands. No rebalance needed.", plan: [] };
        }

        const trades = [];
        for (const d of driftData.drift) {
            if (Math.abs(d.drift) > 0.1) { // Only trade if drift is > 0.1%
                const tradeAmount = (d.drift / 100) * driftData.totalValue;
                trades.push({
                    symbol: d.symbol,
                    action: tradeAmount > 0 ? 'sell' : 'buy',
                    amount: Math.abs(tradeAmount),
                    currentDrift: d.drift
                });
            }
        }

        // Optimize trades for tax and fees
        const optimizedPlan = await tradeOptimizer.optimizeTrades(userId, trades);
        return optimizedPlan;
    }

    /**
     * Mock function to simulate fetching real-time asset values
     */
    async getCurrentAssetValues(userId, portfolioId) {
        // In a real implementation, this would query the portfolio_investments table
        // and fetch current prices from a market data service.
        return [
            { symbol: 'BTC', value: 12000 },
            { symbol: 'ETH', value: 8000 },
            { symbol: 'AAPL', value: 5000 },
            { symbol: 'USD', value: 1000 }
        ];
    }
}

export default new RebalanceEngine();
