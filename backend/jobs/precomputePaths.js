import cron from 'node-cron';
import db from '../config/db.js';
import { users, simulationScenarios } from '../db/schema.js';
import simulationAI from '../services/simulationAI.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Precompute Paths Job (#454)
 * Periodic worker to pre-calculate most likely simulation scenarios.
 */
const schedulePrecomputePaths = () => {
    // Run nightly at 5 AM
    cron.schedule('0 5 * * *', async () => {
        logInfo('[Precompute Paths] Starting nightly simulation batch...');

        try {
            const allUsers = await db.select({ id: users.id }).from(users);

            for (const user of allUsers) {
                // Run a standard 30-year simulation for every user
                // This ensures their dashboard "Probability Cloud" is always fresh
                await simulationAI.runGlobalSimulation(user.id);
            }

            logInfo(`[Precompute Paths] Batch complete. Simulated ${allUsers.length} user profiles.`);
        } catch (error) {
            logError('[Precompute Paths] Job failed:', error);
        }
    });
};

export default schedulePrecomputePaths;
