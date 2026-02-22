import cron from 'node-cron';
import db from '../config/db.js';
import { users, targetAllocations } from '../db/schema.js';
import rebalanceEngine from '../services/rebalanceEngine.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Drift Monitor Job (#449)
 * Periodically checks all users for portfolio drift and triggers rebalance proposals.
 */
const scheduleDriftMonitor = () => {
    // Run hourly
    cron.schedule('0 * * * *', async () => {
        logInfo('[Drift Monitor] Initiating hourly portfolio drift audit...');

        try {
            // 1. Get all active users with target allocations
            const activeUsers = await db.selectDistinct({ userId: targetAllocations.userId })
                .from(targetAllocations)
                .where(eq(targetAllocations.isActive, true));

            logInfo(`[Drift Monitor] Auditing ${activeUsers.length} users for drift.`);

            for (const user of activeUsers) {
                // 2. Run rebalance engine check
                const result = await rebalanceEngine.generateProposal(user.userId);

                if (result.status === 'rebalance_required') {
                    logInfo(`[Drift Monitor] User ${user.userId} requires rebalancing. Drift: ${result.drift}`);
                }
            }

            logInfo('[Drift Monitor] Drift audit complete.');
        } catch (error) {
            logError('[Drift Monitor] Audit failed:', error);
        }
    });
};

export default scheduleDriftMonitor;
