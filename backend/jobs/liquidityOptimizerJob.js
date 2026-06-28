import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import liquidityOptimizerService from '../services/liquidityOptimizerService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Liquidity Optimizer Job (L3)
 * Runs Monte Carlo simulations and optimization suggestions for all users
 */
class LiquidityOptimizerJob {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.stats = {
            totalSimulations: 0,
            actionsSuggested: 0,
            errors: 0
        };
    }

    /**
     * Start the optimization job
     * Runs daily at 1 AM
     */
    start() {
        // Run every day at 01:00 AM
        cron.schedule('0 1 * * *', async () => {
            await this.run();
        });

        logInfo('Liquidity Optimizer Job scheduled (daily at 1 AM)');
    }

    /**
     * Run the optimization job
     */
    async run() {
        if (this.isRunning) {
            logInfo('Liquidity optimizer job already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logInfo('📉 Starting daily liquidity optimization & simulations...');

            // Get all active users
            const allUsers = await db.select().from(users).where(eq(users.isActive, true));

            logInfo(`Processing ${allUsers.length} users for liquidity simulation...`);

            let simulationsCompleted = 0;
            let actionsSuggested = 0;
            let errors = 0;

            // Sequential processing for simulations as they are compute intensive
            for (const user of allUsers) {
                try {
                    // 1. Run Monte Carlo Simulation
                    await liquidityOptimizerService.simulateLiquidity(user.id);
                    simulationsCompleted++;

                    // 2. Propose actions if risk detected
                    const actions = await liquidityOptimizerService.suggestActions(user.id);
                    actionsSuggested += actions.length;

                    if (actions.length > 0) {
                        logInfo(`💡 Propped ${actions.length} liquidity actions for user ${user.id}`);
                    }
                } catch (error) {
                    errors++;
                    logError(`Error in optimizer job for user ${user.id}:`, error);
                }
            }

            const duration = Date.now() - startTime;

            this.stats.totalSimulations += simulationsCompleted;
            this.stats.actionsSuggested += actionsSuggested;
            this.stats.errors += errors;
            this.lastRun = new Date();

            logInfo(`✅ Liquidity optimization completed in ${duration}ms`);
            logInfo(`   - Simulations: ${simulationsCompleted}`);
            logInfo(`   - Actions Suggested: ${actionsSuggested}`);
            logInfo(`   - Errors: ${errors}`);
        } catch (error) {
            logError('Liquidity optimizer job failed:', error);
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
}

// Fixed eq import issue
import { eq } from 'drizzle-orm';

const liquidityOptimizerJob = new LiquidityOptimizerJob();

export default liquidityOptimizerJob;
export { liquidityOptimizerJob };
