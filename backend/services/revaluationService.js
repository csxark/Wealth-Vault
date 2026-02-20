import db from '../config/db.js';
import {
    debts,
    users
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import currencyService from './currencyService.js';
import portfolioService from './portfolioService.js';
import assetService from './assetService.js';
import investmentService from './investmentService.js';
import fxService from './fxService.js';

class RevaluationService {
    /**
     * Trigger revaluation for all users or a specific user
     * @param {string} [userId] - Optional user ID to target specific user
     */
    async revaluatePortfolios(userId = null) {
        console.log(`[Revaluation Engine] Starting revaluation${userId ? ` for user ${userId}` : ' for class users'}...`);
        const startTime = Date.now();

        try {
            // 1. Fetch Global USD Rates for Hub-Spoke Conversion
            const usdRatesRaw = await currencyService.getAllRates('USD');
            const usdRates = new Map();
            usdRatesRaw.forEach(r => usdRates.set(r.targetCurrency, parseFloat(r.rate)));
            usdRates.set('USD', 1.0);

            // 2. Get users to process
            let usersToProcess = [];
            if (userId) {
                const [user] = await db.select().from(users).where(eq(users.id, userId));
                if (user) usersToProcess.push(user);
            } else {
                usersToProcess = await db.select().from(users).where(eq(users.isActive, true));
            }

            let updatedCount = 0;

            // 3. Process each user
            for (const user of usersToProcess) {
                const baseCurrency = user.currency || 'USD';
                const baseRate = usdRates.get(baseCurrency); // Rate: 1 USD -> X Base

                if (!baseRate) {
                    console.warn(`[Revaluation Engine] Missing exchange rate for base currency ${baseCurrency}. Skipping user ${user.id}.`);
                    continue;
                }

                // Helper to get conversion rate FROM assetCurrency TO baseCurrency
                const getConversionRate = (assetCurrency) => {
                    if (assetCurrency === baseCurrency) return 1.0;
                    const assetRate = usdRates.get(assetCurrency); // Rate: 1 USD -> Y Asset
                    if (!assetRate) return null;
                    // Rate (Asset -> Base): 1 Asset = (1/assetRate) USD = (1/assetRate) * baseRate Base
                    return baseRate / assetRate;
                };

                // Revaluate Modules via specialized services
                // We pass the rate calculation function to allow services to transform currency
                await this.revaluateInvestments(user.id, getConversionRate, baseCurrency);
                await this.revaluateAssets(user.id, getConversionRate, baseCurrency);
                await this.revaluateDebts(user.id, getConversionRate, baseCurrency);

                // Trigger Double-Entry Ledger and FX Revaluation (#432)
                await fxService.triggerGlobalRevaluation(user.id);

                // Update Portfolio Net Worth Cache (Triggers re-calculation of total portfolio value)
                const portfolios = await portfolioService.getPortfolios(user.id);
                for (const port of portfolios) {
                    await portfolioService.getPortfolioSummary(port.id, user.id);
                }

                updatedCount++;
            }

            const duration = Date.now() - startTime;
            console.log(`[Revaluation Engine] Completed. Processed ${updatedCount} users in ${duration}ms.`);

        } catch (error) {
            console.error('[Revaluation Engine] Fatal Error:', error);
        }
    }

    async revaluateInvestments(userId, getConversionRate, baseCurrencyCode) {
        await investmentService.batchUpdateValuations(userId, getConversionRate, baseCurrencyCode);
    }

    async revaluateAssets(userId, getConversionRate, baseCurrencyCode) {
        await assetService.batchUpdateValuations(userId, getConversionRate, baseCurrencyCode);
    }

    async revaluateDebts(userId, getConversionRate, baseCurrencyCode) {
        try {
            const userDebts = await db.select().from(debts).where(eq(debts.userId, userId));

            const updates = userDebts.map(async (debt) => {
                const currency = debt.currency || 'USD';
                const rate = getConversionRate(currency);

                if (rate !== null) {
                    const currentBalance = parseFloat(debt.currentBalance || 0);
                    const baseValue = currentBalance * rate;

                    await db.update(debts)
                        .set({
                            baseCurrencyValue: baseValue.toFixed(2),
                            baseCurrencyCode: baseCurrencyCode,
                            valuationDate: new Date()
                        })
                        .where(eq(debts.id, debt.id));
                }
            });
            await Promise.all(updates);
        } catch (e) {
            console.error(`[Revaluation Engine] Error updating debts for user ${userId}:`, e);
        }
    }
}

export default new RevaluationService();
