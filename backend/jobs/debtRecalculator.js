import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import arbitrageEngine from '../services/arbitrageEngine.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Debt Recalculator Job (L3)
 * Monitors debt balances and updates global WACC metrics for all active users every hour.
 */
class DebtRecalculatorJob {
    start() {
        // Runs every hour
        cron.schedule('0 * * * *', async () => {
            logInfo('[Debt Recalculator] Starting hourly WACC update cycle...');

            try {
                const activeUsers = await db.select({ id: users.id }).from(users).where(sql`${users.isActive} = true`);

                for (const user of activeUsers) {
                    try {
                        // 1. Recalculate WACC and save snapshot
                        await arbitrageEngine.calculateWACC(user.id);

                        // 2. Scan for new arbitrage opportunities
                        await arbitrageEngine.generateArbitrageSignals(user.id);

                        logInfo(`[Debt Recalculator] Successfully updated metrics for user ${user.id}`);
                    } catch (userErr) {
                        logError(`[Debt Recalculator] Failed for user ${user.id}: ${userErr.message}`);
                    }
                }

                logInfo('[Debt Recalculator] Update cycle completed.');
            } catch (error) {
                logError(`[Debt Recalculator] Critical job failure: ${error.message}`);
            }
        });
    }

    /**
     * Manual trigger for testing or forced updates
     */
    async executeNow() {
        logInfo('[Debt Recalculator] Manual execution triggered.');
        const activeUsers = await db.select({ id: users.id }).from(users).where(sql`${users.isActive} = true`);
        for (const user of activeUsers) {
            await arbitrageEngine.calculateWACC(user.id);
            await arbitrageEngine.generateArbitrageSignals(user.id);
        }
    }
}

export default new DebtRecalculatorJob();
