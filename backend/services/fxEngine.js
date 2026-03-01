import db from '../config/db.js';
import { currencySwapLogs, fxHedgingRules, investments, portfolios } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import currencyService from './currencyService.js';
import auditService from './auditService.js';
import taxLotService from './taxLotService.js';
import eventBus from '../events/eventBus.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * FX Engine (L3)
 * Sophisticated FX math for arbitrage, hedging, and settlement routing.
 */
class FXEngine {
    /**
     * Helper: Ensure a 'fiat' type investment exists for tax lot tracking
     */
    async getOrCreateCurrencyInvestment(userId, symbol, vaultId = null) {
        let [inv] = await db.select().from(investments).where(
            and(
                eq(investments.userId, userId),
                eq(investments.symbol, symbol),
                eq(investments.type, 'fiat')
            )
        );

        if (!inv) {
            // Find or create a default 'Currencies' portfolio
            let [pf] = await db.select().from(portfolios).where(
                and(eq(portfolios.userId, userId), eq(portfolios.name, 'Currencies'))
            );

            if (!pf) {
                [pf] = await db.insert(portfolios).values({
                    userId,
                    name: 'Currencies',
                    description: 'Global currency holdings for tax-lot tracking'
                }).returning();
            }

            [inv] = await db.insert(investments).values({
                userId,
                portfolioId: pf.id,
                vaultId,
                symbol,
                name: `${symbol} Currency`,
                type: 'fiat',
                quantity: '0',
                averageCost: '1',
                totalCost: '0'
            }).returning();
            logInfo(`[FX Engine] Created new fiat investment record for ${symbol}`);
        }
        return inv;
    }

    /**
     * Detect triangular arbitrage opportunities
     */
    async detectTriangularArbitrage(baseCurrency = 'USD') {
        const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR']; // Core corridors
        let opportunities = [];

        for (const mid1 of currencies) {
            if (mid1 === baseCurrency) continue;
            for (const mid2 of currencies) {
                if (mid2 === baseCurrency || mid2 === mid1) continue;

                const rate1 = await currencyService.getExchangeRate(baseCurrency, mid1);
                const rate2 = await currencyService.getExchangeRate(mid1, mid2);
                const rate3 = await currencyService.getExchangeRate(mid2, baseCurrency);

                if (rate1 && rate2 && rate3) {
                    const finalAmount = 1 * rate1 * rate2 * rate3;
                    const spread = (finalAmount - 1) * 100;

                    if (spread > 0.05) {
                        opportunities.push({
                            path: [baseCurrency, mid1, mid2, baseCurrency],
                            spread,
                            expectedYield: finalAmount
                        });
                    }
                }
            }
        }
        return opportunities.sort((a, b) => b.spread - a.spread);
    }

    /**
     * Convert Currency with Tax-Lot Tracking (#460)
     */
    async convertCurrency(userId, data) {
        const { fromCurrency, toCurrency, amount, vaultId, method = 'HIFO' } = data;

        logInfo(`[FX Engine] Converting ${amount} ${fromCurrency} to ${toCurrency} for user ${userId}`);

        try {
            const exchangeRate = await currencyService.getExchangeRate(fromCurrency, toCurrency);
            const targetAmount = amount * exchangeRate;

            // 1. Get/Create Investment records for both currencies
            const fromInv = await this.getOrCreateCurrencyInvestment(userId, fromCurrency, vaultId);
            const toInv = await this.getOrCreateCurrencyInvestment(userId, toCurrency, vaultId);

            // 2. Close lots for source currency (Liquidation)
            const usdRateFrom = await currencyService.getExchangeRate(fromCurrency, 'USD');
            const salePriceInBase = usdRateFrom; // The "price" of 1 unit of fromCurrency in base USD

            const closedLots = await taxLotService.closeLots(userId, {
                investmentId: fromInv.id,
                unitsSold: amount,
                salePrice: salePriceInBase,
                method
            });

            // 3. Add lot for target currency (Acquisition)
            const usdRateTo = await currencyService.getExchangeRate(toCurrency, 'USD');
            const acqPriceInBase = usdRateTo;

            const newLot = await taxLotService.addLot(
                userId,
                toInv.id,
                targetAmount,
                acqPriceInBase
            );

            // 4. Record Swap Log
            const swapLog = await this.recordSwap(userId, {
                fromCurrency,
                toCurrency,
                amount: amount.toString(),
                exchangeRate: exchangeRate.toString(),
                swapType: 'manual',
                arbitrageAlpha: '0'
            });

            // 5. Emit Events
            eventBus.emit('FX_CONVERSION_COMPLETED', {
                userId,
                swapLog,
                closedLots,
                newLotId: newLot.id,
                vaultId
            });

            return {
                swapLog,
                targetAmount,
                exchangeRate,
                closedLotsCount: closedLots.length,
                newLotId: newLot.id
            };
        } catch (error) {
            logError(`[FX Engine] Conversion failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate Hedging Requirement
     */
    async calculateHedgingRequirement(userId, fromCurrency, toCurrency, amount) {
        const [rule] = await db.select().from(fxHedgingRules)
            .where(and(
                eq(fxHedgingRules.userId, userId),
                eq(fxHedgingRules.fromCurrency, fromCurrency),
                eq(fxHedgingRules.toCurrency, toCurrency)
            ));

        if (!rule || rule.status !== 'active') return null;

        const volatility = await currencyService.getCurrencyVolatility(fromCurrency, toCurrency);

        if (volatility >= parseFloat(rule.thresholdVolatility)) {
            const hedgeAmount = amount * parseFloat(rule.hedgeRatio);
            return {
                isHedgeRequired: true,
                hedgeAmount,
                volatility,
                reason: `Volatility ${volatility.toFixed(4)} exceeded threshold ${rule.thresholdVolatility}`
            };
        }

        return { isHedgeRequired: false, volatility };
    }

    /**
     * Record a Smart Currency Swap
     */
    async recordSwap(userId, swapData) {
        const { fromCurrency, toCurrency, amount, exchangeRate, arbitrageAlpha, swapType } = swapData;

        const [log] = await db.insert(currencySwapLogs).values({
            userId,
            fromCurrency,
            toCurrency,
            amount,
            exchangeRate,
            arbitrageAlpha,
            swapType,
            status: 'completed'
        }).returning();

        return log;
    }

    /**
     * Create or Update Hedging Rule
     */
    async upsertHedgingRule(userId, data) {
        const { fromCurrency, toCurrency, hedgeRatio, thresholdVolatility } = data;

        const [rule] = await db.insert(fxHedgingRules).values({
            userId,
            fromCurrency,
            toCurrency,
            hedgeRatio: hedgeRatio.toString(),
            thresholdVolatility: thresholdVolatility.toString()
        }).onConflictDoUpdate({
            target: [fxHedgingRules.userId, fxHedgingRules.fromCurrency, fxHedgingRules.toCurrency],
            set: { hedgeRatio: hedgeRatio.toString(), thresholdVolatility: thresholdVolatility.toString() }
        }).returning();

        return rule;
    }
}

export default new FXEngine();
