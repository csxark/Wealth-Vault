import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import marginEngine from '../services/marginEngine.js';
import stressTesterAI from '../services/stressTesterAI.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Stress Test Sync Job (#447)
 * Daily batch job to run margin audits and stressed simulations for all accounts.
 */
const scheduleStressTests = () => {
    // Run daily at 4 AM
    cron.schedule('0 4 * * *', async () => {
        logInfo('[Stress Test Sync] Initiating daily global risk audit...');

        try {
            const allUsers = await db.select({ id: users.id }).from(users);

            for (const user of allUsers) {
                // 1. Refresh margin snapshot
                await marginEngine.calculateRiskPosition(user.id);

                // 2. Run automated stress test
                await stressTesterAI.runSimulation(user.id);
            }

            logInfo(`[Stress Test Sync] Risk audit complete for ${allUsers.length} users.`);
        } catch (error) {
            logError('[Stress Test Sync] Job failed:', error);
        }
    });
};

export default scheduleStressTests;
