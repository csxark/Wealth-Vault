import cron from 'node-cron';
import fxEngine from '../services/fxEngine.js';
import arbitrageAI from '../services/arbitrageAI.js';

class FxRateSync {
    constructor() {
        this.task = null;
    }

    start() {
        // Run every minute for rates
        this.task = cron.schedule('* * * * *', async () => {
            await fxEngine.updateRates();
            // Arbitrage analysis every 5 minutes
            if (new Date().getMinutes() % 5 === 0) {
                await arbitrageAI.analyzeMarket();
            }
        });
        console.log('[FX Rate Sync] Job started (1-min interval)');
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new FxRateSync();
