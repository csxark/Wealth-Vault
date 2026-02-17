import db from '../config/db.js';
import { currencySwapLogs, fxHedgingRules } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import currencyService from './currencyService.js';
import auditService from './auditService.js';

/**
 * FX Engine (L3)
 * Sophisticated FX math for arbitrage, hedging, and settlement routing.
 */
class FXEngine {
    /**
     * Detect triangular arbitrage opportunities
     * Example: USD -> EUR -> GBP -> USD
     */
    async detectTriangularArbitrage(baseCurrency = 'USD') {
        const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR']; // Core corridors
        let opportunities = [];

        for (const mid1 of currencies) {
            if (mid1 === baseCurrency) continue;
            for (const mid2 of currencies) {
                if (mid2 === baseCurrency || mid2 === mid1) continue;

                // Path: Base -> Mid1 -> Mid2 -> Base
                const rate1 = await currencyService.getExchangeRate(baseCurrency, mid1);
                const rate2 = await currencyService.getExchangeRate(mid1, mid2);
                const rate3 = await currencyService.getExchangeRate(mid2, baseCurrency);

                if (rate1 && rate2 && rate3) {
                    const finalAmount = 1 * rate1 * rate2 * rate3;
                    const spread = (finalAmount - 1) * 100; // in percentage

                    if (spread > 0.05) { // 0.05% threshold for L3 arbitrage
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
     * Calculate Hedging Requirement
     * Uses volatility indexing to determine if a forward hedge is needed.
     */
    async calculateHedgingRequirement(userId, fromCurrency, toCurrency, amount) {
        const [rule] = await db.select().from(fxHedgingRules)
            .where(and(
                eq(fxHedgingRules.userId, userId),
                eq(fxHedgingRules.fromCurrency, fromCurrency),
                eq(fxHedgingRules.toCurrency, toCurrency)
            ));

        if (!rule || rule.status !== 'active') return null;

        // Fetch real-time volatility (L3: high-frequency variance check)
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
