import db from '../config/db.js';
import { exchangeRateHistory } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import axios from 'axios';

/**
 * FX Converter Service
 * Handles live and historical currency conversion logic.
 */
class FXConverter {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 3600000; // 1 hour
    }

    /**
     * Get exchange rate from -> to
     */
    async getRate(from, to) {
        if (from === to) return 1.0;

        const cacheKey = `${from}_${to}`;
        const cached = this.cache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            return cached.rate;
        }

        // Try DB for latest rate
        const [latest] = await db.select()
            .from(exchangeRateHistory)
            .where(and(eq(exchangeRateHistory.fromCurrency, from), eq(exchangeRateHistory.toCurrency, to)))
            .orderBy(desc(exchangeRateHistory.rateTimestamp))
            .limit(1);

        if (latest && (Date.now() - new Date(latest.rateTimestamp).getTime() < this.CACHE_TTL)) {
            this.cache.set(cacheKey, { rate: parseFloat(latest.rate), timestamp: Date.now() });
            return parseFloat(latest.rate);
        }

        // Fetch from external API if missing or stale
        try {
            const rate = await this.fetchExternalRate(from, to);

            // Save to DB
            await db.insert(exchangeRateHistory)
                .values({
                    fromCurrency: from,
                    toCurrency: to,
                    rate: rate.toString(),
                    rateTimestamp: new Date()
                });

            this.cache.set(cacheKey, { rate, timestamp: Date.now() });
            return rate;
        } catch (error) {
            console.error(`FX Fetch Failed: ${from}->${to}`, error);
            return latest ? parseFloat(latest.rate) : 1.0; // Fallback to stale or parity
        }
    }

    /**
     * Fetch rate from third-party provider (Mocked)
     */
    async fetchExternalRate(from, to) {
        // In a real app, use OpenExchangeRates or Fixer.io
        // const response = await axios.get(`API_URL?base=${from}&symbols=${to}`);
        // return response.data.rates[to];

        // Mock rates for development
        const mockRates = {
            'USD_EUR': 0.92,
            'EUR_USD': 1.09,
            'USD_INR': 83.20,
            'INR_USD': 0.012,
            'GBP_USD': 1.27,
            'USD_GBP': 0.79
        };

        return mockRates[`${from}_${to}`] || (1.0 + (Math.random() * 0.1 - 0.05));
    }

    /**
     * Convert amount
     */
    async convert(amount, from, to) {
        const rate = await this.getRate(from, to);
        return parseFloat(amount) * rate;
    }

    /**
     * Get historical rates for trend analysis
     */
    async getHistoricalRates(from, to, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        return await db.select()
            .from(exchangeRateHistory)
            .where(and(
                eq(exchangeRateHistory.fromCurrency, from),
                eq(exchangeRateHistory.toCurrency, to),
                sql`${exchangeRateHistory.rateTimestamp} >= ${startDate}`
            ))
            .orderBy(exchangeRateHistory.rateTimestamp);
    }
}

export default new FXConverter();
