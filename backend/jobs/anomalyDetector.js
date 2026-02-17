import cron from 'node-cron';
import auditEngine from '../services/auditEngine.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Anomaly Detector Job - Runs daily at 2 AM
 * Scans all active users for suspicious transaction patterns
 */
class AnomalyDetectorJob {
    constructor() {
        this.schedule = '0 2 * * *'; // 2 AM Daily
    }

    start() {
        logInfo('Initializing Anomaly Detector Job...');
        cron.schedule(this.schedule, async () => {
            logInfo('Running Scheduled Anomaly Detection Scan...');

            try {
                // Get all active users
                const activeUsers = await db.select({ id: users.id })
                    .from(users)
                    .where(eq(users.isActive, true));

                logInfo(`Found ${activeUsers.length} users to scan.`);

                for (const user of activeUsers) {
                    try {
                        await auditEngine.performForensicScan(user.id);
                    } catch (userError) {
                        logError(`Failed scan for user ${user.id}:`, userError);
                        // Continue with next user
                    }
                }

                logInfo('Scheduled Anomaly Detection Scan Completed.');
            } catch (error) {
                logError('Global Anomaly Detector Job Failure:', error);
            }
        });
    }

    /**
     * Manual trigger for testing or administrative purposes
     */
    async runNow() {
        logInfo('Manually triggering Anomaly Detection Scan...');
        const activeUsers = await db.select({ id: users.id }).from(users);
        for (const user of activeUsers) {
            await auditEngine.performForensicScan(user.id);
        }
        logInfo('Manual Anomaly Detection Scan Completed.');
    }
}

import { eq } from 'drizzle-orm';

export default new AnomalyDetectorJob();
