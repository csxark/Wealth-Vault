import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import arbitrageScout from '../services/arbitrageScout.js';
import waccCalculator from '../services/waccCalculator.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Market Rate Sync Job (L3)
 * Daily sync of mortgage, crypto-loan, and bond rates to find refinancing alpha.
 * Orchestrates the re-calculation of WACC and re-scanning for arbitrage opportunities for all users.
 */
class MarketRateSyncJob {
    start() {
        // Run at 1 AM daily
        cron.schedule('0 1 * * *', async () => {
            logInfo('[Market Rate Sync Job] Starting daily capital cost analysis...');
            await this.syncRatesAndScan();
        });
    }

    async syncRatesAndScan() {
        try {
            // 1. Fetch "Live" Market Rates (Mocked Integration)
            const marketRates = await this.fetchExternalMarketRates();
            logInfo(`[Market Rate Sync Job] Fetched latest rates: Mortgage: ${marketRates.mortgage}%, Crypto-Loan: ${marketRates.cryptoLoan}%`);

            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                try {
                    // 2. Re-calculate WACC based on potentially updated valuation of assets/debts
                    await waccCalculator.calculateUserWACC(user.id);

                    // 3. Scan for new arbitrage opportunities
                    const opportunities = await arbitrageScout.scanForArbitrage(user.id);

                    if (opportunities.length > 0) {
                        logInfo(`[Market Rate Sync Job] Found ${opportunities.length} potential arbitrage moves for user ${user.id}`);
                        // In production, we'd trigger a notification service here
                    }
                } catch (userError) {
                    logError(`[Market Rate Sync Job] Failed to process user ${user.id}:`, userError);
                }
            }

            logInfo('[Market Rate Sync Job] Daily sync and scan completed for all users.');
        } catch (error) {
            logError('[Market Rate Sync Job] Job execution failed:', error);
        }
    }

    /**
     * Simulate fetching external market data
     */
    async fetchExternalMarketRates() {
        // Integration point for Bloomberg, Plaid, or CoinGecko yield rates
        return {
            mortgage: 6.5 + (Math.random() - 0.5),
            cryptoLoan: 8.2 + (Math.random() - 0.5),
            corporateBond: 5.4,
            highYieldSavings: 4.5
        };
    }
}

export default new MarketRateSyncJob();
