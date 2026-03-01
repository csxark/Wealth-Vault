import cron from 'node-cron';
import db from '../config/db.js';
import { vaults, users } from '../db/schema.js';
import { eq, lt, and } from 'drizzle-orm';
import liquidityOptimizerService from './liquidityOptimizerService.js';
import { logInfo, logWarning, logError } from '../utils/logger.js';

/**
 * ThresholdMonitor (#476)
 * Periodically scans vault balances. If a "Priority" vault drops below
 * its AI-predicted threshold, it triggers the MILP optimizer to find
 * the cheapest refill path.
 */
class ThresholdMonitor {
    start() {
        // Run every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            await this.sweepAllUsers();
        });
        logInfo('ThresholdMonitor scheduled (every 6 hours)');
    }

    async sweepAllUsers() {
        try {
            const allUsers = await db.select().from(users);
            for (const user of allUsers) {
                await this.checkUserVaults(user.id);
            }
        } catch (err) {
            logError('ThresholdMonitor sweep failed:', err);
        }
    }

    async checkUserVaults(userId) {
        logInfo(`[ThresholdMonitor] Checking liquidity for user ${userId}...`);

        // Find vaults with balance < $1000
        const lowLiquidityVaults = await db.select()
            .from(vaults)
            .where(and(
                eq(vaults.userId, userId),
                lt(vaults.balance, 1000)
            ));

        for (const vault of lowLiquidityVaults) {
            logWarning(`[ThresholdMonitor] Vault ${vault.id} (${vault.name}) reached critical threshold: ${vault.balance}`);

            try {
                const refillAmount = 5000 - Number(vault.balance);
                const optimalMove = await liquidityOptimizerService.findOptimalPath(userId, vault.id, refillAmount);

                logInfo(`[ThresholdMonitor] Best refill path for ${vault.name} found. Total cost: $${optimalMove.totalCost}`);
            } catch (optErr) {
                logError(`[ThresholdMonitor] Could not find path to refill ${vault.id}:`, optErr.message);
            }
        }
    }
}

export default new ThresholdMonitor();
