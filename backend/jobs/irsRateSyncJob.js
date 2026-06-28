import cron from 'node-cron';
import irsRateTracker from '../services/irsRateTracker.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * IRS Rate Sync Job (#511)
 * Periodic task to fetch the monthly Section 7520 hurdle rate from the IRS.
 * Runs on the 1st of every month at midnight.
 */
class IRSRateSyncJob {
    constructor() {
        this.task = null;
    }

    start() {
        // Schedule for the 1st of every month at 00:00
        this.task = cron.schedule('0 0 1 * *', async () => {
            logInfo('[IRS Job] Triggering monthly 7520 rate synchronization');

            try {
                const newRate = await irsRateTracker.syncLatestRate();
                logInfo(`[IRS Job] Successfully synced rate for ${newRate.effectiveMonth}/${newRate.effectiveYear}: ${newRate.rate}`);
            } catch (error) {
                logError('[IRS Job] Monthly sync failing:', error);
            }
        });

        logInfo('[IRS Job] IRS Rate Sync service initialized (Monthly schedule)');
    }

    stop() {
        if (this.task) this.task.stop();
    }

    // Manual trigger helper for testing/admin use
    async manualTrigger() {
        return await irsRateTracker.syncLatestRate();
    }
}

export default new IRSRateSyncJob();
