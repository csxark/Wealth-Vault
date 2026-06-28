import cron from 'node-cron';
import vaultConsolidator from '../services/vaultConsolidator.js';
import crossVaultAnalytics from '../services/crossVaultAnalytics.js';
import db from '../config/db.js';
import { vaultGroups } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Consolidation Sync Job
 * Periodically refreshes data across all multi-vault groups
 */
class ConsolidationSyncJob {
    start() {
        // Runs every 4 hours
        cron.schedule('0 */4 * * *', async () => {
            await this.run();
        });

        logInfo('Consolidation Sync Job scheduled (every 4 hours)');

        // Run once on startup after a delay
        setTimeout(() => this.run(), 20000);
    }

    async run() {
        try {
            logInfo('🔄 Starting global consolidation sync...');

            const groups = await db.select().from(vaultGroups);

            for (const group of groups) {
                try {
                    // Refresh snapshot
                    await vaultConsolidator.consolidateGroup(group.id);

                    // Update analytics
                    await crossVaultAnalytics.generateGroupAnalytics(group.id);
                } catch (err) {
                    logError(`Sync failed for group ${group.id}:`, err);
                }
            }

            logInfo('✅ Multi-vault consolidation sync complete.');
        } catch (error) {
            logError('Global consolidation sync failed:', error);
        }
    }
}

export default new ConsolidationSyncJob();
