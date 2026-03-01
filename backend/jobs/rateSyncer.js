
import cron from 'node-cron';
import db from '../config/db.js';
import { fxRates } from '../db/schema.js';
import arbitrageAI from '../services/arbitrageAI.js';

class RateSyncer {
    /**
     * Start the real-time FX rate sync job
     * Runs every 5 minutes
     */
    start() {
        cron.schedule('*/5 * * * *', async () => {
            console.log('--- Starting High-Frequency FX Rate Sync ---');
            await this.syncRates();
            await arbitrageAI.scanMarkets();
        });
    }

    async syncRates() {
        try {
            // In a real app, this would fetch from an API like Fixer or CoinGecko
            const pairs = ['USD/EUR', 'EUR/USD', 'USD/GBP', 'USD/BTC', 'BTC/USD'];

            for (const pair of pairs) {
                const baseRate = pair.includes('BTC') ? 45000 : 1.1;
                const randomFlactuation = (Math.random() * 0.02) - 0.01;
                const newRate = baseRate * (1 + randomFlactuation);

                await db.insert(fxRates).values({
                    pair,
                    rate: newRate.toFixed(8),
                    change24h: (randomFlactuation * 100).toFixed(2),
                    volatility: (Math.random() * 5).toFixed(2),
                    lastUpdated: new Date()
                }).onConflictDoUpdate({
                    target: fxRates.pair,
                    set: {
                        rate: newRate.toFixed(8),
                        change24h: (randomFlactuation * 100).toFixed(2),
                        volatility: (Math.random() * 5).toFixed(2),
                        lastUpdated: new Date()
                    }
                });
            }
            console.log('✅ FX Rates synchronized successfully');
        } catch (error) {
            console.error('❌ FX Rate sync failed:', error);
        }
    }
}

export default new RateSyncer();
