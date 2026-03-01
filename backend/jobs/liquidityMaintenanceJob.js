import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import liquidityService from '../services/liquidityService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Liquidity Maintenance Job
 * Runs periodic checks on all users' liquidity status
 * Triggers automated rescues when needed
 */
class LiquidityMaintenanceJob {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.stats = {
            totalChecks: 0,
            rescuesTriggered: 0,
            errors: 0
        };
    }

    /**
     * Start the maintenance job
     * Runs every 6 hours
     */
    start() {
        // Run every 6 hours: 0 */6 * * *
        cron.schedule('0 */6 * * *', async () => {
            await this.run();
        });

        logInfo('Liquidity Maintenance Job scheduled (every 6 hours)');

        // Run immediately on startup
        setTimeout(() => {
            this.run();
        }, 5000); // Wait 5 seconds after startup
    }

    /**
     * Run the maintenance job
     */
    async run() {
        if (this.isRunning) {
            logInfo('Liquidity maintenance job already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logInfo('🔍 Starting liquidity maintenance job...');

            // Get all active users
            const allUsers = await db.select().from(users);

            logInfo(`Checking liquidity for ${allUsers.length} users...`);

            let checksCompleted = 0;
            let rescuesTriggered = 0;
            let errors = 0;

            // Process users in batches to avoid overwhelming the system
            const batchSize = 10;
            for (let i = 0; i < allUsers.length; i += batchSize) {
                const batch = allUsers.slice(i, i + batchSize);

                await Promise.all(
                    batch.map(async (user) => {
                        try {
                            const result = await liquidityService.monitorLiquidity(user.id);

                            checksCompleted++;

                            if (result.status === 'rescue_executed') {
                                rescuesTriggered++;
                                logInfo(`✅ Liquidity rescue executed for user ${user.id}`);
                            } else if (result.status === 'rescue_on_cooldown') {
                                logInfo(`⏳ Rescue needed for user ${user.id} but on cooldown`);
                            }
                        } catch (error) {
                            errors++;
                            logError(`Error checking liquidity for user ${user.id}:`, error);
                        }
                    })
                );
            }

            const duration = Date.now() - startTime;

            this.stats.totalChecks += checksCompleted;
            this.stats.rescuesTriggered += rescuesTriggered;
            this.stats.errors += errors;
            this.lastRun = new Date();

            logInfo(`✅ Liquidity maintenance completed in ${duration}ms`);
            logInfo(`   - Checks: ${checksCompleted}`);
            logInfo(`   - Rescues: ${rescuesTriggered}`);
            logInfo(`   - Errors: ${errors}`);
        } catch (error) {
            logError('Liquidity maintenance job failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get job statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastRun: this.lastRun,
            isRunning: this.isRunning
        };
    }

    /**
     * Manually trigger the job
     */
    async trigger() {
        logInfo('Manually triggering liquidity maintenance job...');
        await this.run();
    }
}

const liquidityMaintenanceJob = new LiquidityMaintenanceJob();

export default liquidityMaintenanceJob;
export { liquidityMaintenanceJob };
