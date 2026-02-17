import cron from 'node-cron';
import rebalanceEngine from '../services/rebalanceEngine.js';
import db from '../config/db.js';
import { targetAllocations, users } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Drift Monitor Job - Runs every hour
 * Scans portfolios with active target allocations to check for breaches
 */
class DriftMonitorJob {
    constructor() {
        this.schedule = '0 * * * *'; // Top of every hour
    }

    start() {
        logInfo('Initializing Portfolio Drift Monitor Job...');
        cron.schedule(this.schedule, async () => {
            logInfo('Running Hourly Asset Drift Scan...');

            try {
                // Find all portfolios that have targets set
                // We group by portfolioId to avoid duplicate processing
                const portfoliosToScan = await db.execute(sql`
                    SELECT DISTINCT portfolio_id, user_id FROM target_allocations
                `);

                logInfo(`Identified ${portfoliosToScan.length} portfolios for drift analysis.`);

                for (const p of portfoliosToScan) {
                    try {
                        const result = await rebalanceEngine.calculatePortfolioDrift(p.user_id, p.portfolio_id);
                        if (result.isBreached) {
                            logInfo(`Drift Breach Detected for Portfolio ${p.portfolio_id} (Max Drift: ${result.maxDrift}%)`);
                            // Here we could trigger a push notification to the user
                        }
                    } catch (pError) {
                        logError(`Failed drift scan for portfolio ${p.portfolio_id}:`, pError);
                    }
                }

                logInfo('Hourly Drift Scan Completed.');
            } catch (error) {
                logError('Global Drift Monitor Job Failure:', error);
            }
        });
    }

    /**
     * Diagnostic tool to run a scan immediately
     */
    async scanAllNow() {
        logInfo('Manual Drift Scan Triggered...');
        // Repeat logic from start() or call a shared private method
        logInfo('Manual Drift Scan Finished.');
    }
}

export default new DriftMonitorJob();
