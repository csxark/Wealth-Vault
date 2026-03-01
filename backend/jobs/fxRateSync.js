import cron from 'node-cron';
import currencyService from '../services/currencyService.js';
import revaluationService from '../services/revaluationService.js';
import arbitrageAI from '../services/arbitrageAI.js';

class FxRateSync {
    constructor() {
        this.task = null;
    }

    start() {
        // Run every hour to ensure freshness and trigger revaluation
        this.task = cron.schedule('0 * * * *', async () => {
            try {
                console.log('[FX Rate Sync] Job triggered: Fetching rates and revaluating portfolios...');

                // 1. Fetch latest rates (updates DB if cache expired)
                await currencyService.fetchExchangeRates('USD');

                // 2. Cascade update to all portfolios
                await revaluationService.revaluatePortfolios();

                // 3. Run arbitrage analysis
                await arbitrageAI.analyzeMarket();

            } catch (error) {
                console.error('[FX Rate Sync] Error during execution:', error);
            }
        });
        console.log('[FX Rate Sync] Job started (Hourly interval)');
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new FxRateSync();
