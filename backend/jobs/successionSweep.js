import schedule from 'node-schedule';
import { successionHeartbeatService } from '../services/successionHeartbeatService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Succession Sweep Job (#534)
 * Periodic watchdog that monitors user inactivity and triggers the 
 * Cryptographic succession protocol if the heartbeat baseline is lost.
 */
class SuccessionSweepJob {
    constructor() {
        this.job = null;
    }

    start() {
        // Run every 6 hours
        this.job = schedule.scheduleJob('0 */6 * * *', async () => {
            logInfo('[Succession Job] Starting inactivity sweep');
            try {
                await successionHeartbeatService.sweepInactivity();
            } catch (error) {
                logError('[Succession Job] Sweep failure:', error);
            }
        });

        logInfo('[Succession Job] Heartbeat watchdog initialized (6hr frequency)');
    }

    stop() {
        if (this.job) this.job.cancel();
    }
}

export default new SuccessionSweepJob();
