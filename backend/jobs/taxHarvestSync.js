import cron from 'node-cron';
import taxScoutAI from '../services/taxScoutAI.js';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tax Harvest Sync Job (L3)
 * Autonomous background agent that scans for Tax-Loss Harvesting opportunities 
 * across the entire global user base at market close.
 */
const scheduleTaxHarvestSync = () => {
    // Run daily at 4:30 PM (Simulated Market Close)
    cron.schedule('30 16 * * *', async () => {
        logInfo('[Cron Job] Initializing Global Tax-Loss Harvesting Scan...');

        try {
            // 1. Fetch all active users
            const allUsers = await db.select({ id: users.id }).from(users);
            logInfo(`[Cron Job] Scanning portfolios for ${allUsers.length} users.`);

            // 2. Continuous Scanning Execution
            for (const user of allUsers) {
                try {
                    await taxScoutAI.scanForOpportunities(user.id);
                } catch (err) {
                    logError(`[Cron Job] Error scanning user ${user.id}:`, err);
                }
            }

            logInfo('[Cron Job] Global Tax-Loss Harvesting Scan completed successfully.');
        } catch (error) {
            logError('[Cron Job] Global Tax-Loss Harvesting Sync failed:', error);
        }
    });
};

export default scheduleTaxHarvestSync;
