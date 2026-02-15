import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import harvestEngine from '../services/harvestEngine.js';
import { logInfo, logError } from '../utils/logger.js';
import auditService from '../services/auditService.js';

/**
 * Tax Audit Job (L3)
 * Weekly cycle to scan the entire portfolio for assets sitting at a "Deep-Loss" relative to cost basis.
 */
class TaxAuditJob {
    start() {
        // Run at 3 AM every Sunday
        cron.schedule('0 3 * * 0', async () => {
            logInfo('[Tax Audit Job] Starting weekly Tax-Loss Harvesting scan...');
            await this.scanAllUsers();
        });
    }

    async scanAllUsers() {
        try {
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                // Scan for harvesting opportunities
                const opportunities = await harvestEngine.scanOpportunities(user.id, 1000); // Higher threshold for auto-scan

                if (opportunities.length > 0) {
                    await auditService.logAuditEvent({
                        userId: user.id,
                        action: 'TAX_HARVEST_DETECTED',
                        resourceType: 'tax_lot',
                        metadata: {
                            opportunitiesFound: opportunities.length,
                            potentialSavings: opportunities.reduce((sum, o) => sum + o.estimatedTaxSavings, 0)
                        }
                    });

                    logInfo(`[Tax Audit Job] Found ${opportunities.length} harvesting opportunities for user ${user.id}`);

                    // In a real app, send a notification here
                }
            }
            logInfo('[Tax Audit Job] Weekly scan completed.');
        } catch (error) {
            logError('[Tax Audit Job] Job failed:', error);
        }
    }
}

export default new TaxAuditJob();
