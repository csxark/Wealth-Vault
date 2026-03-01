import cron from 'node-cron';
import oracleService from '../services/oracleService.js';
import escrowEngine from '../services/escrowEngine.js';
import { logInfo, logError } from '../utils/logger.js';
import db from '../config/db.js';
import { escrowContracts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Oracle Sync Job
 * Polls simulated external providers and evaluates active escrow contracts.
 */
const scheduleOracleSync = () => {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
        logInfo('[Cron Job] Starting Oracle Sync...');

        try {
            // 1. Sync from various sources
            await oracleService.syncFromSource('county_clerk');
            await oracleService.syncFromSource('vital_statistics');

            // 2. Evaluate all active escrow contracts
            const activeContracts = await db.query.escrowContracts.findMany({
                where: eq(escrowContracts.status, 'active')
            });

            logInfo(`[Cron Job] Evaluating ${activeContracts.length} active escrow contracts`);

            for (const contract of activeContracts) {
                try {
                    await escrowEngine.evaluateReleaseConditions(contract.id);
                } catch (e) {
                    logError(`[Cron Job] Failed to evaluate escrow ${contract.id}:`, e);
                }
            }

            logInfo('[Cron Job] Oracle Sync completed successfully.');
        } catch (error) {
            logError('[Cron Job] Oracle Sync failed:', error);
        }
    });
};

export default scheduleOracleSync;
