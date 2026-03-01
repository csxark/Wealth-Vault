import cron from 'node-cron';
import arbitrageEngine from '../services/arbitrageEngine.js';
import yieldService from '../services/yieldService.js';

/**
 * Arbitrage Job - Weekly yield scan and auto-rebalance
 */
class ArbitrageJob {
    start() {
        // Run every Monday at 3 AM
        cron.schedule('0 3 * * 1', async () => {
            console.log('[Arbitrage Job] Starting market yield refresh and optimization...');

            // 1. Refresh market yields
            await yieldService.refreshYieldRates();

            // 2. Scan and optimize for all users
            await arbitrageEngine.scanAndOptimize();

            console.log('[Arbitrage Job] Weekly optimization cycle complete.');
        });

        console.log('[Arbitrage Job] Initialized - running every Monday at 3 AM');
    }

    async runManual() {
        console.log('[Arbitrage Job] Manual trigger starting...');
        await yieldService.refreshYieldRates();
        await arbitrageEngine.scanAndOptimize();
        return { message: 'Manual arbitrage cycle finished' };
    }
}

export default new ArbitrageJob();
