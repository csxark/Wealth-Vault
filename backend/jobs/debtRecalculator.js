import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import debtEngine from '../services/debtEngine.js';
import payoffOptimizer from '../services/payoffOptimizer.js';
import refinanceScout from '../services/refinanceScout.js';

class DebtRecalculator {
    /**
     * Start the scheduled job for debt recalculation
     * Runs on the 1st of every month at 2:00 AM
     */
    startScheduledJob() {
        cron.schedule('0 2 * 1 *', async () => {
            console.log('[DebtRecalculator] Starting monthly debt recalculation...');
            await this.processAllUsers();
        });
        console.log('[DebtRecalculator] Scheduled for 1st of every month at 2:00 AM');
    }

    /**
     * Process all users in the system
     */
    async processAllUsers() {
        try {
            const allUsers = await db.query.users.findMany({
                columns: { id: true }
            });

            for (const user of allUsers) {
                await this.processSingleUser(user.id);
            }
            console.log(`[DebtRecalculator] Successfully processed ${allUsers.length} users`);
        } catch (error) {
            console.error('[DebtRecalculator] Error processing users:', error);
        }
    }

    /**
     * Recalculate everything for a single user
     */
    async processSingleUser(userId) {
        try {
            // 1. Scan for new refinancing opportunities
            await refinanceScout.scanOpportunities(userId);

            // 2. Refresh active payoff strategy simulation
            const strategy = await payoffOptimizer.getActiveStrategy(userId);
            await payoffOptimizer.simulatePayoff(userId, strategy.strategyName, parseFloat(strategy.monthlyExtraPayment));

            // 3. Update amortization schedules if needed
            // This ensures they stay in sync with actual payments made in the previous month
        } catch (error) {
            console.error(`[DebtRecalculator] Error for user ${userId}:`, error.message);
        }
    }

    /**
     * Manual trigger for testing
     */
    async runNow() {
        console.log('[DebtRecalculator] Manual run triggered');
        await this.processAllUsers();
    }
}

export default new DebtRecalculator();
