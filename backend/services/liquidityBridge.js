import db from '../config/db.js';
import { liquidityPools, bankAccounts, internalClearingLogs } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import { calculatePoolRebalanceNeed } from '../utils/settlementMath.js';

/**
 * Liquidity Bridge Service (#455)
 * Real-time monitor of "Cash Reserves" across all global sub-accounts.
 */
class LiquidityBridge {
    /**
     * Refresh all liquidity pools for a user based on current bank account balances
     */
    async refreshPools(userId) {
        logInfo(`[Liquidity Bridge] Refreshing pools for user ${userId}`);

        try {
            // 1. Get aggregate balances by currency from bank accounts
            const balancesByCurrency = await db.select({
                currency: bankAccounts.currency,
                total: sql`SUM(CAST(balance AS NUMERIC))`
            }).from(bankAccounts)
                .where(eq(bankAccounts.userId, userId))
                .groupBy(bankAccounts.currency);

            const results = [];

            for (const item of balancesByCurrency) {
                // 2. Update or Create liquidity pool entry
                const [pool] = await db.insert(liquidityPools).values({
                    userId,
                    currencyCode: item.currency,
                    totalBalance: item.total.toString(),
                    updatedAt: new Date()
                }).onConflictDoUpdate({
                    target: [liquidityPools.userId, liquidityPools.currencyCode],
                    set: {
                        totalBalance: item.total.toString(),
                        updatedAt: new Date()
                    }
                }).returning();

                // 3. Check for threshold breach
                const rebalanceNeed = calculatePoolRebalanceNeed(pool.totalBalance, pool.minThreshold);

                results.push({
                    currency: item.currency,
                    balance: pool.totalBalance,
                    isBelowThreshold: rebalanceNeed > 0,
                    rebalanceNeed
                });
            }

            return results;
        } catch (error) {
            logError(`[Liquidity Bridge] Pool refresh failed:`, error);
            throw error;
        }
    }

    /**
     * Get Global Liquidity Health
     */
    async getLiquidityHealth(userId) {
        const pools = await db.select().from(liquidityPools).where(eq(liquidityPools.userId, userId));

        const health = {
            totalValueUsd: 0,
            breachedPools: [],
            isHealthy: true
        };

        // Assume we have a way to convert to USD (simplified for this logic)
        for (const pool of pools) {
            if (parseFloat(pool.totalBalance) < parseFloat(pool.minThreshold)) {
                health.breachedPools.push(pool.currencyCode);
                health.isHealthy = false;
            }
        }

        return health;
    }
}

export default new LiquidityBridge();
