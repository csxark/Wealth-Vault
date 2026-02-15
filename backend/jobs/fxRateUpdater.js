import cron from 'node-cron';
import db from '../config/db.js';
import { userCurrencies } from '../db/schema.js';
import fxConverter from '../services/fxConverter.js';
import { logInfo, logError } from '../utils/logger.js';
import fxEngine from '../services/fxEngine.js';
import auditService from '../services/auditService.js';
import { eq } from 'drizzle-orm';

/**
 * FX Rate Updater Job (L3)
 * Refresh exchange rates and scan for "Conversion Alpha" (Arbitrage).
 */
class FXRateUpdater {
    start() {
        // Runs every hour
        cron.schedule('0 * * * *', async () => {
            await this.refreshActiveRates();
            await this.scanForArbitrage();
        });

        logInfo('FX Rate Updater Job scheduled (hourly)');
    }

    async refreshActiveRates() {
        try {
            logInfo('💱 Refreshing FX rates for active users...');

            // Get all unique currency codes used by users
            const activeCurrencies = await db.select({ code: userCurrencies.currencyCode })
                .from(userCurrencies)
                .where(eq(userCurrencies.autoRefresh, true));

            const uniqueCodes = [...new Set(activeCurrencies.map(c => c.code))];

            for (const code of uniqueCodes) {
                if (code === 'USD') continue;
                // In this system, fxConverter.getRate internally calls currencyService.fetchExchangeRates
                await fxConverter.getRate('USD', code);
            }

            logInfo(`✅ Refreshed rates for ${uniqueCodes.length} currencies.`);
        } catch (error) {
            logError('FX Rate refresh failed:', error);
        }
    }

    async scanForArbitrage() {
        logInfo('🔍 Scanning for FX Triangular Arbitrage...');
        try {
            const opportunities = await fxEngine.detectTriangularArbitrage('USD');

            for (const opp of opportunities) {
                if (opp.spread > 0.5) { // Significant opportunity
                    console.log(`[FX Arbitrage] HIGH ALPHA DETECTED: ${opp.path.join('->')} with ${opp.spread.toFixed(2)}% spread.`);
                    // Log high alpha opportunities for system analytics
                }
            }
        } catch (error) {
            logError('Arbitrage scan failed:', error);
        }
    }
}

export default new FXRateUpdater();
