import cron from 'node-cron';
import db from '../config/db.js';
import { washSaleWindows } from '../db/schema.js';
import { and, eq, lt } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * WashSaleExpirationJob (#482)
 * Periodically deactivates wash-sale windows that have passed their 30-day period.
 */
class WashSaleExpirationJob {
    start() {
        // Run every hour
        cron.schedule('30 * * * *', async () => {
            await this.cleanupExpiredWindows();
        });
        logInfo('WashSaleExpirationJob scheduled (Hourly)');
    }

    async cleanupExpiredWindows() {
        logInfo('🧹 Cleaning up expired Wash-Sale windows...');

        try {
            const now = new Date();
            const result = await db.update(washSaleWindows)
                .set({ isActive: false })
                .where(and(
                    eq(washSaleWindows.isActive, true),
                    lt(washSaleWindows.windowEnd, now)
                ))
                .returning();

            if (result.length > 0) {
                logInfo(`✅ Deactivated ${result.length} expired wash-sale windows.`);
            }
        } catch (err) {
            logError('WashSaleExpirationJob failed:', err);
        }
    }
}

export default new WashSaleExpirationJob();
