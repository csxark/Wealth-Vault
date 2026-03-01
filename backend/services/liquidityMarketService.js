import db from '../config/db.js';
import { marketRatesOracle } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * LiquidityMarketService - Provides real-time market friction data (#476)
 */
class LiquidityMarketService {
    /**
     * Gets the current bid/ask spread and mid-market rate for a currency pair
     */
    async getMarketEfficiency(base, quote) {
        if (base === quote) return 1.0;

        const rates = await db.select().from(marketRatesOracle).where(
            and(
                eq(marketRatesOracle.baseCurrency, base),
                eq(marketRatesOracle.quoteCurrency, quote)
            )
        );

        if (rates.length === 0) {
            // Check reverse rate
            const revRates = await db.select().from(marketRatesOracle).where(
                and(
                    eq(marketRatesOracle.baseCurrency, quote),
                    eq(marketRatesOracle.quoteCurrency, base)
                )
            );

            if (revRates.length > 0) {
                const r = revRates[0];
                const mid = parseFloat(r.midRate);
                // In reverse, ask becomes bid and vice versa
                const effectiveBid = 1 / parseFloat(r.askRate || r.midRate * 1.002);
                return effectiveBid / (1 / mid);
            }

            return 0.995; // Default 0.5% friction if no data
        }

        const r = rates[0];
        const mid = parseFloat(r.midRate);
        const bid = parseFloat(r.bidRate || mid * 0.998);

        return bid / mid;
    }

    /**
     * Estimates slippage based on transaction volume
     */
    calculateSlippage(amount, volatility = 0.01) {
        // Simple linear slippage model
        // Larger transfers in volatile markets lose more to slippage
        const baseSlippage = 0.0001;
        const volumeImpact = (amount / 1000000) * 0.001;
        return 1 - (baseSlippage + volumeImpact * volatility);
    }
}

export default new LiquidityMarketService();
