import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import taxHarvestEngine from '../services/taxHarvestEngine.js';
import { logInfo, logError } from '../utils/logger.js';
import marketDataService from '../services/marketDataService.js'; // Mocked or existing service

/**
 * TaxHarvestScanner (#482)
 * Nightly scan of all user portfolios to discover tax-loss harvesting opportunities.
 */
class TaxHarvestScanner {
    start() {
        // Run daily at 1 AM
        cron.schedule('0 1 * * *', async () => {
            await this.performGlobalScan();
        });
        logInfo('TaxHarvestScanner scheduled (Daily 1 AM)');
    }

    async performGlobalScan() {
        logInfo('📊 Starting Global Tax Harvest Scan...');

        try {
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                // 1. Fetch latest prices for all assets held by user
                // In real app, this would be a dynamic mapping of asset -> price
                const currentPrices = await this.getPricesForUser(user.id);

                // 2. Scan for opportunities
                const opportunities = await taxHarvestEngine.scanOpportunities(user.id, currentPrices);

                if (opportunities.length > 0) {
                    logInfo(`[TaxHarvestScanner] Found ${opportunities.length} opportunities for User ${user.id}`);
                    // Trigger notification or auto-propose event
                    // For L3, we log it; automated execution would depend on user preference
                }
            }
            logInfo('✅ Global Tax Harvest Scan completed.');
        } catch (err) {
            logError('TaxHarvestScanner failed:', err);
        }
    }

    async getPricesForUser(userId) {
        // Placeholder for market data integration
        // Returns { 'AAPL': 175.20, 'VTI': 220.50, ... }
        return { 'VTI': 210.00, 'AAPL': 160.00, 'BTC': 42000 };
    }
}

export default new TaxHarvestScanner();
