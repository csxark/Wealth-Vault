import cron from 'node-cron';
import db from '../config/db.js';
import { userCurrencies } from '../db/schema.js';
import fxConverter from '../services/fxConverter.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * FX Rate Updater Job
 * Refresh exchange rates for currencies used by active users.
 */
class FXRateUpdater {
    start() {
        // Runs every hour
        cron.schedule('0 * * * *', async () => {
            await this.refreshActiveRates();
        });

        logInfo('FX Rate Updater Job scheduled (hourly)');

        // Immediate run (delayed)
        setTimeout(() => this.refreshActiveRates(), 60000);
    }

    async refreshActiveRates() {
        try {
            logInfo('💱 Refreshing FX rates for active users...');

            // Get all unique currency codes used by users
            const activeCurrencies = await db.select({ code: userCurrencies.currencyCode })
                .from(userCurrencies)
                .where(eq(userCurrencies.autoRefresh, true));

            const uniqueCodes = [...new Set(activeCurrencies.map(c => c.code))];

            // Assuming USD is the common pivot
            for (const code of uniqueCodes) {
                if (code === 'USD') continue;

                // Refresh USD -> Code and Code -> USD
                await fxConverter.getRate('USD', code);
                await fxConverter.getRate(code, 'USD');
            }

            logInfo(`✅ Refreshed rates for ${uniqueCodes.length} currencies.`);
        } catch (error) {
            logError('FX Rate refresh failed:', error);
        }
    }
}

export default new FXRateUpdater();
