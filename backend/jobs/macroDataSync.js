import cron from 'node-cron';
import db from '../config/db.js';
import { macroEconomicIndicators } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Macro Data Sync Job (#441)
 * Daily job to fetch (simulate) macroeconomic rate changes that 
 * affect variable APR debts and default probabilities.
 */
const scheduleMacroDataSync = () => {
    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        logInfo('[Macro Sync] Initializing daily economic data fetch...');

        try {
            const indicators = [
                { name: 'fed_funds_rate', base: 5.25 },
                { name: 'libor_3m', base: 5.58 },
                { name: 'us_inflation_yoy', base: 3.10 }
            ];

            for (const indicator of indicators) {
                const fluctuation = (Math.random() * 0.25) - 0.125; // +/- 0.125%
                const newValue = (indicator.base + fluctuation).toFixed(4);

                await db.insert(macroEconomicIndicators).values({
                    indicatorName: indicator.name,
                    value: newValue,
                    periodDate: new Date(),
                    source: 'simulated_feed'
                });

                logInfo(`[Macro Sync] Updated ${indicator.name}: ${newValue}%`);
            }

            logInfo('[Macro Sync] Daily economic synchronization complete.');
        } catch (error) {
            logError('[Macro Sync] Synchronization failed:', error);
        }
    });
};

export default scheduleMacroDataSync;
