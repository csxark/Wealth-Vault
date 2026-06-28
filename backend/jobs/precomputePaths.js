import cron from 'node-cron';
import db from '../config/db.js';
import { users, vaults } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import liquidityOptimizerService from '../services/liquidityOptimizerService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * PrecomputeOptimalPaths Job (#476)
 * Periodically calculates best routes between all user vaults to speed up UI response.
 */
class PrecomputeOptimalPathsJob {
    constructor() {
        this.isRunning = false;
        this.cache = new Map();
    }

    start() {
        // Run every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            await this.run();
        });
        logInfo('Precompute Optimal Paths Job scheduled (every 6 hours)');
    }

    async run() {
        if (this.isRunning) return;
        this.isRunning = true;
        logInfo('🚀 Starting precomputation of optimal liquidity paths...');

        try {
            const activeUsers = await db.select().from(users).where(eq(users.isActive, true));

            for (const user of activeUsers) {
                const userVaults = await db.select().from(vaults).where(eq(vaults.ownerId, user.id));

                if (userVaults.length < 2) continue;

                for (const vSrc of userVaults) {
                    for (const vDest of userVaults) {
                        if (vSrc.id === vDest.id) continue;

                        try {
                            const route = await liquidityOptimizerService.findOptimalRoute(user.id, vSrc.id, vDest.id, 10000);
                            // Store in a cache or a 'precomputed_routes' table
                            const cacheKey = `${user.id}:${vSrc.id}:${vDest.id}`;
                            this.cache.set(cacheKey, {
                                route,
                                computedAt: new Date()
                            });
                        } catch (e) {
                            // Silent fail for impossible routes
                        }
                    }
                }
                logInfo(`Precomputed routes for user ${user.id} (${userVaults.length} vaults)`);
            }
            logInfo('✅ Precomputation complete.');
        } catch (error) {
            logError('Precompute job failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    getCachedRoute(userId, srcId, destId) {
        return this.cache.get(`${userId}:${srcId}:${destId}`);
    }
}

export default new PrecomputeOptimalPathsJob();
