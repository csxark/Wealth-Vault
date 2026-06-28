import db from '../config/db.js';
import { yieldStrategies, liquidityBuffers, rebalanceExecutionLogs, vaults, vaultBalances } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import forecastEngine from './forecastEngine.js';
import vaultService from './vaultService.js';
import investmentService from './investmentService.js';

/**
 * Yield Service (L3)
 * Orchestrates autonomous capital rebalancing to optimize APY while maintaining liquidity.
 */
class YieldService {
    /**
     * Calculate "Liquidity Runway" based on historical spending vs cash reserves
     */
    async calculateRequiredLiquidity(userId) {
        // Use forecastEngine to get average monthly burn rate
        const forecast = await forecastEngine.generateCashFlowForecast(userId, 6);
        const avgMonthlyExpenses = forecast.summary.totalProjectedExpenses / 6;

        // Fetch user buffers
        const buffers = await db.query.liquidityBuffers.findMany({
            where: eq(liquidityBuffers.userId, userId)
        });

        const results = [];
        for (const buffer of buffers) {
            const requiredAmount = avgMonthlyExpenses * buffer.requiredRunwayMonths;

            // Check current vault balance
            const balanceData = await db.select({
                total: sql`sum(${vaultBalances.balance})`
            }).from(vaultBalances)
                .where(eq(vaultBalances.vaultId, buffer.vaultId));

            const currentBalance = parseFloat(balanceData[0]?.total || 0);

            results.push({
                vaultId: buffer.vaultId,
                requiredAmount,
                currentBalance,
                surplus: currentBalance - requiredAmount,
                status: currentBalance >= requiredAmount ? 'safe' : 'deficit'
            });

            // Update buffer record
            await db.update(liquidityBuffers)
                .set({
                    currentRunwayAmount: currentBalance.toFixed(2),
                    lastCheckedAt: new Date()
                })
                .where(eq(liquidityBuffers.id, buffer.id));
        }

        return results;
    }

    /**
     * Scan and execute yield-optimizing rebalances
     */
    async optimizeYield(userId) {
        const liquidityStatus = await this.calculateRequiredLiquidity(userId);
        const strategies = await db.query.yieldStrategies.findMany({
            where: and(eq(yieldStrategies.userId, userId), eq(yieldStrategies.isActive, true))
        });

        const logs = [];

        for (const status of liquidityStatus) {
            if (status.surplus > 100) { // Only rebalance if surplus > $100
                const strategy = strategies[0]; // Simplified: pick first active strategy
                if (!strategy) continue;

                console.log(`[Yield Service] Surplus of $${status.surplus.toFixed(2)} detected in vault ${status.vaultId}. Executing strategy: ${strategy.name}`);

                // Execute Rebalance (Simulated fund movement)
                // In a real system, this would move money to a high-yield investment or a different vault.
                const amountToMove = status.surplus * 0.8; // Keep 20% of surplus for additional buffer

                const log = await db.insert(rebalanceExecutionLogs).values({
                    userId,
                    strategyId: strategy.id,
                    fromSource: `Vault: ${status.vaultId}`,
                    toDestination: `Yield-Optimized Allocation (${strategy.riskTolerance})`,
                    amount: amountToMove.toFixed(2),
                    yieldSpread: '4.50', // Estimated yield improvement (e.g., Cash 0.5% -> Bond 5.0%)
                    status: 'completed'
                }).returning();

                logs.push(log[0]);
            }
        }

        return logs;
    }
}

export default new YieldService();
