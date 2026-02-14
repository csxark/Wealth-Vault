import db from '../config/db.js';
import { yieldPools } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

/**
 * Yield Service - Tracks and simulates external yield opportunities
 */
class YieldService {
    /**
     * Get current APY for a pool
     */
    async getPoolYield(poolId) {
        const [pool] = await db.select().from(yieldPools).where(eq(yieldPools.id, poolId));
        return parseFloat(pool?.currentApy || 0);
    }

    /**
     * Update yield rates from external providers (Mock)
     */
    async refreshYieldRates() {
        const pools = await db.select().from(yieldPools);

        for (const pool of pools) {
            // Simulate small market fluctuations (-0.1% to +0.1%)
            const fluctuation = (Math.random() * 0.2 - 0.1);
            const newApy = Math.max(0.1, parseFloat(pool.currentApy) + fluctuation);

            await db.update(yieldPools)
                .set({ currentApy: newApy.toFixed(2), lastUpdated: new Date() })
                .where(eq(yieldPools.id, pool.id));
        }
    }

    /**
     * Find best yielding asset for a given risk score
     */
    async getBestPool(maxRisk = 5) {
        const pools = await db.select().from(yieldPools)
            .where(sql`${yieldPools.riskScore} <= ${maxRisk}`)
            .orderBy(desc(yieldPools.currentApy))
            .limit(1);
        return pools[0];
    }
}

export default new YieldService();
