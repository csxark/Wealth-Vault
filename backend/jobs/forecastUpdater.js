import cron from 'node-cron';
import forecastEngine from '../services/forecastEngine.js';
import projectionEngine from '../services/projectionEngine.js';
import liquidityMonitor from '../services/liquidityMonitor.js';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';

class ForecastUpdater {
    /**
     * Start the daily forecast update job
     * Runs at 3:00 AM every day
     */
    start() {
        // Daily at 3:00 AM
        cron.schedule('0 3 * * *', async () => {
            console.log('[ForecastUpdater] Starting daily forecast and liquidity audit...');
            await this.processAllUsers();
        });

        // Every Sunday at 4:00 AM (for snapshots)
        cron.schedule('0 4 * * 0', async () => {
            console.log('[ForecastUpdater] Recording weekly balance snapshots...');
            await liquidityMonitor.recordSnapshots();
        });

        console.log('[ForecastUpdater] Scheduled: Daily audit at 3:00 AM, Weekly snapshots Sunday at 4:00 AM');
    }

    /**
     * Process all users to update their forecasts and check for liquidity issues
     */
    async processAllUsers() {
        try {
            const allUsers = await db.query.users.findMany({
                columns: { id: true }
            });

            for (const user of allUsers) {
                // 1. Generate fresh forecast
                const forecast = await forecastEngine.projectCashFlow(user.id, 60);

                // 2. Save snapshot of this forecast
                await forecastEngine.saveForecastSnapshot(user.id, forecast);

                // 3. Generate fresh 12-month stochastic projection (accounts for Tax-Drag)
                await projectionEngine.generateForecast(user.id);

                // 4. Monitor liquidity and trigger alerts/suggestions
                await liquidityMonitor.checkLiquidity(user.id);
            }

            console.log(`[ForecastUpdater] Successfully processed ${allUsers.length} users`);
        } catch (error) {
            console.error('[ForecastUpdater] Error during background processing:', error);
        }
    }

    /**
     * Manual run for initialization or testing
     */
    async runNow() {
        console.log('[ForecastUpdater] Manual run triggered');
        await this.processAllUsers();
    }
}

export default new ForecastUpdater();
