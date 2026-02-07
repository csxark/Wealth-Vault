import cron from 'node-cron';
import db from '../config/db.js';
import { fxRates } from '../db/schema.js';
import axios from 'axios';

class RateSyncer {
    constructor() {
        this.pairs = [
            'USD/EUR', 'USD/GBP', 'USD/JPY', 'USD/INR', 'USD/CAD',
            'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'BTC/USD', 'ETH/USD'
        ];
    }

    start() {
        // Sync every 5 minutes
        cron.schedule('*/5 * * * *', () => {
            this.syncRates();
        });

        // Initial sync
        this.syncRates();
    }

    async syncRates() {
        console.log('[RateSyncer] Syncing FX rates...');
        try {
            // In a real production app, you'd use a paid API like fixer.io or alpha vantage
            // For this implementation, we simulate rate movements based on base values
            // or fetch from a public free API if available.

            for (const pair of this.pairs) {
                const [base, target] = pair.split('/');

                // Mocking rate logic with some random volatility
                // Real logic would be: const response = await axios.get(`API_URL...`);
                const baseRates = {
                    'USD/EUR': 0.92,
                    'USD/GBP': 0.79,
                    'USD/JPY': 150.2,
                    'USD/INR': 83.1,
                    'USD/CAD': 1.35,
                    'EUR/GBP': 0.86,
                    'EUR/JPY': 163.4,
                    'GBP/JPY': 190.5,
                    'BTC/USD': 65000,
                    'ETH/USD': 3500
                };

                const baseRate = baseRates[pair];
                const volatility = (Math.random() * 0.4) - 0.2; // -0.2% to +0.2%
                const finalRate = baseRate * (1 + (volatility / 100));
                const change24h = (Math.random() * 2) - 1; // -1% to +1%

                await db.insert(fxRates)
                    .values({
                        pair,
                        rate: finalRate.toString(),
                        change24h: change24h.toString(),
                        volatility: (Math.abs(volatility) * 10).toString(),
                        lastUpdated: new Date()
                    })
                    .onConflictDoUpdate({
                        target: fxRates.pair,
                        set: {
                            rate: finalRate.toString(),
                            change24h: change24h.toString(),
                            volatility: (Math.abs(volatility) * 10).toString(),
                            lastUpdated: new Date()
                        }
                    });
            }
            console.log('[RateSyncer] FX rates updated successfully');
        } catch (error) {
            console.error('[RateSyncer] Error:', error);
        }
    }
}

export default new RateSyncer();
