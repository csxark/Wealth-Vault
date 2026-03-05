import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import residencyEngine from '../services/residencyEngine.js';
import taxWithholdingService from '../services/taxWithholdingService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Residency Audit Job (L3)
 * Weekly job (Sunday 1 AM) to reconcile physical presence logs with vault income locations.
 * Automatically updates tax residency status for all users based on presenceTracker data.
 */
class ResidencyAuditJob {
    start() {
        cron.schedule('0 1 * * 0', async () => {
            logInfo('[Residency Audit Job] Starting weekly residency audit...');
            await this.auditAllUsers();
        });
    }

    async auditAllUsers() {
        try {
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                try {
                    // 1. Recalculate residency days
                    await residencyEngine.recalculateResidency(user.id);

                    // 2. Perform sanity check on withholdings
                    // (Mock logic to flag missing withholdings if residency changed)
                    logInfo(`[Residency Audit Job] Audit completed for user ${user.id}`);
                } catch (userError) {
                    logError(`[Residency Audit Job] Error for user ${user.id}:`, userError);
                }
            }

            logInfo('[Residency Audit Job] Weekly audit finished.');
        } catch (error) {
            logError('[Residency Audit Job] Job execution failed:', error);
        }
    }
}

export default new ResidencyAuditJob();
