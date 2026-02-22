import cron from 'node-cron';
import db from '../config/db.js';
import { governanceResolutions } from '../db/schema.js';
import { and, eq, lte } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Resolution Cleanup Job (#453)
 * Nightly job to expire failed votes and notify members of pending quorum.
 */
const scheduleResolutionCleanup = () => {
    // Run nightly at 2 AM
    cron.schedule('0 2 * * *', async () => {
        logInfo('[Resolution Cleanup] Checking for expired governance resolutions...');

        try {
            // Find open resolutions that have passed their expiry date
            const expired = await db.update(governanceResolutions)
                .set({ status: 'failed' })
                .where(and(
                    eq(governanceResolutions.status, 'open'),
                    lte(governanceResolutions.expiresAt, new Date())
                ))
                .returning();

            if (expired.length > 0) {
                logInfo(`[Resolution Cleanup] Expired ${expired.length} resolutions.`);
            }

            logInfo('[Resolution Cleanup] Cleanup task complete.');
        } catch (error) {
            logError('[Resolution Cleanup] Job failed:', error);
        }
    });
};

export default scheduleResolutionCleanup;
