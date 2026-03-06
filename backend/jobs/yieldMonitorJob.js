import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import yieldService from '../services/yieldService.js';
import auditService from '../services/auditService.js';

/**
 * Yield Monitor Job (L3)
 * Nightly daemon that scans for "Yield Alpha" across all portfolios.
 */
class YieldMonitorJob {
    start() {
        // Run nightly at 4 AM
        cron.schedule('0 4 * * *', async () => {
            console.log('[Yield Monitor Job] Starting nightly cycle...');
            await this.scanAllUsers();
        });

        console.log('[Yield Monitor Job] Scheduled for 4:00 AM daily');
    }

    async scanAllUsers() {
        try {
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                const rebalances = await yieldService.optimizeYield(user.id);

                if (rebalances.length > 0) {
                    console.log(`[Yield Monitor Job] Executed ${rebalances.length} optimizations for user ${user.id}`);

                    for (const rb of rebalances) {
                        await auditService.logAuditEvent({
                            userId: user.id,
                            action: 'ASSET_SWAP',
                            resourceType: 'vault',
                            resourceId: rb.id,
                            metadata: {
                                amount: rb.amount,
                                from: rb.fromSource,
                                to: rb.toDestination,
                                spread: rb.yieldSpread
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[Yield Monitor Job] Critical failing in cycle:', error);
        }
    }
}

export default new YieldMonitorJob();
