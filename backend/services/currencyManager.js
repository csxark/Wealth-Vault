import db from '../config/db.js';
import { userCurrencies, exchangeRateHistory } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import fxConverter from './fxConverter.js';

/**
 * Currency Manager Service
 * Manages user currency preferences and base currency settings.
 */
class CurrencyManager {
    /**
     * Set user's base currency
     */
    async setBaseCurrency(userId, currencyCode) {
        // 1. Reset existing base currency
        await db.update(userCurrencies)
            .set({ isBaseCurrency: false })
            .where(eq(userCurrencies.userId, userId));

        // 2. Set new base currency
        const existing = await db.select()
            .from(userCurrencies)
            .where(and(eq(userCurrencies.userId, userId), eq(userCurrencies.currencyCode, currencyCode)))
            .limit(1);

        if (existing.length > 0) {
            return await db.update(userCurrencies)
                .set({ isBaseCurrency: true, updatedAt: new Date() })
                .where(eq(userCurrencies.id, existing[0].id))
                .returning();
        } else {
            return await db.insert(userCurrencies)
                .values({
                    userId,
                    currencyCode,
                    isBaseCurrency: true
                })
                .returning();
        }
    }

    /**
     * Get user's base currency
     */
    async getBaseCurrency(userId) {
        const [curr] = await db.select()
            .from(userCurrencies)
            .where(and(eq(userCurrencies.userId, userId), eq(userCurrencies.isBaseCurrency, true)))
            .limit(1);

        return curr ? curr.currencyCode : 'USD';
    }

    /**
     * Get all active currencies for user
     */
    async getUserCurrencies(userId) {
        return await db.select()
            .from(userCurrencies)
            .where(eq(userCurrencies.userId, userId));
    }

    /**
     * Add currency to user profile
     */
    async addCurrency(userId, data) {
        const { currencyCode, exchangeRateSource, manualRate } = data;

        return await db.insert(userCurrencies)
            .values({
                userId,
                currencyCode,
                exchangeRateSource: exchangeRateSource || 'market',
                manualRate: manualRate ? manualRate.toString() : null
            })
            .returning();
    }

    /**
     * Calculate portfolio value in base currency
     */
    async getConsolidatedValue(userId, assets) {
        const baseCurrency = await this.getBaseCurrency(userId);
        let totalBaseValue = 0;

        for (const asset of assets) {
            const assetCurrency = asset.currency || 'USD';
            const value = parseFloat(asset.value);

            if (assetCurrency === baseCurrency) {
                totalBaseValue += value;
            } else {
                const rate = await fxConverter.getRate(assetCurrency, baseCurrency);
                totalBaseValue += value * rate;
            }
        }

        return {
            totalValue: totalBaseValue,
            currency: baseCurrency,
            assetCount: assets.length
        };
    }
}

export default new CurrencyManager();
