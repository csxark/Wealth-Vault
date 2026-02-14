import db from '../config/db.js';
import { exchangeRates } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import axios from 'axios';

// Simple in-memory cache
const ratesCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Fetch exchange rates from external API
 * Using exchangerate-api.com (free tier: 1500 requests/month)
 */
export async function fetchExchangeRates(baseCurrency = 'USD') {
    const cacheKey = `rates_${baseCurrency}`;
    const cached = ratesCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Using cached rates for ${baseCurrency}`);
        return cached.data;
    }

    try {
        const apiKey = process.env.EXCHANGE_RATE_API_KEY || 'free';
        const url = apiKey === 'free'
            ? `https://open.er-api.com/v6/latest/${baseCurrency}`
            : `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`;

        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.result === 'success' || response.data.rates) {
            const rates = response.data.rates;
            const validUntil = new Date(response.data.time_next_update_unix * 1000);

            // Save rates to database
            const savedRates = [];
            for (const [targetCurrency, rate] of Object.entries(rates)) {
                // Mark old rates as inactive
                await db.update(exchangeRates)
                    .set({ isActive: false })
                    .where(and(
                        eq(exchangeRates.baseCurrency, baseCurrency),
                        eq(exchangeRates.targetCurrency, targetCurrency),
                        eq(exchangeRates.isActive, true)
                    ));

                // Insert new rate
                const [newRate] = await db.insert(exchangeRates).values({
                    baseCurrency,
                    targetCurrency,
                    rate,
                    source: 'exchangerate-api',
                    validFrom: new Date(),
                    validUntil,
                    isActive: true,
                    metadata: {
                        lastUpdated: new Date().toISOString(),
                        apiResponse: response.data.result
                    }
                }).returning();

                savedRates.push(newRate);
            }

            // Update cache
            ratesCache.set(cacheKey, {
                data: { rates, validUntil },
                timestamp: Date.now()
            });

            console.log(`Successfully fetched and saved ${savedRates.length} exchange rates for ${baseCurrency}`);
            return { rates, validUntil };
        } else {
            throw new Error('Invalid API response');
        }
    } catch (error) {
        console.error('Error fetching exchange rates:', error.message);

        // Fallback to database if API fails
        const dbRates = await db.select()
            .from(exchangeRates)
            .where(and(
                eq(exchangeRates.baseCurrency, baseCurrency),
                eq(exchangeRates.isActive, true)
            ));

        if (dbRates.length > 0) {
            console.log(`Using database fallback rates for ${baseCurrency}`);
            const rates = {};
            dbRates.forEach(r => {
                rates[r.targetCurrency] = r.rate;
            });
            return { rates, validUntil: dbRates[0].validUntil };
        }

        throw new Error('Failed to fetch exchange rates and no fallback available');
    }
}

/**
 * Convert amount from one currency to another
 */
export async function convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
        return amount;
    }

    // Check cache first
    const cacheKey = `rate_${fromCurrency}_${toCurrency}`;
    const cached = ratesCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return amount * cached.rate;
    }

    // Try to get rate from database
    const [rate] = await db.select()
        .from(exchangeRates)
        .where(and(
            eq(exchangeRates.baseCurrency, fromCurrency),
            eq(exchangeRates.targetCurrency, toCurrency),
            eq(exchangeRates.isActive, true),
            lte(exchangeRates.validFrom, new Date()),
            gte(exchangeRates.validUntil, new Date())
        ))
        .orderBy(exchangeRates.createdAt, 'desc')
        .limit(1);

    if (rate) {
        // Cache the rate
        ratesCache.set(cacheKey, {
            rate: rate.rate,
            timestamp: Date.now()
        });
        return amount * rate.rate;
    }

    // If direct rate not found, try through USD
    if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
        const toUSD = await convertAmount(amount, fromCurrency, 'USD');
        return await convertAmount(toUSD, 'USD', toCurrency);
    }

    throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
}

/**
 * Get exchange rate between two currencies
 */
export async function getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
        return 1.0;
    }

    const [rate] = await db.select()
        .from(exchangeRates)
        .where(and(
            eq(exchangeRates.baseCurrency, fromCurrency),
            eq(exchangeRates.targetCurrency, toCurrency),
            eq(exchangeRates.isActive, true)
        ))
        .orderBy(exchangeRates.createdAt, 'desc')
        .limit(1);

    if (rate) {
        return rate.rate;
    }

    // Try reverse rate
    const [reverseRate] = await db.select()
        .from(exchangeRates)
        .where(and(
            eq(exchangeRates.baseCurrency, toCurrency),
            eq(exchangeRates.targetCurrency, fromCurrency),
            eq(exchangeRates.isActive, true)
        ))
        .orderBy(exchangeRates.createdAt, 'desc')
        .limit(1);

    if (reverseRate) {
        return 1 / reverseRate.rate;
    }

    throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
}

/**
 * Get all active exchange rates for a base currency
 */
export async function getAllRates(baseCurrency = 'USD') {
    const rates = await db.select()
        .from(exchangeRates)
        .where(and(
            eq(exchangeRates.baseCurrency, baseCurrency),
            eq(exchangeRates.isActive, true)
        ))
        .orderBy(exchangeRates.targetCurrency);

    return rates;
}

/**
 * Convert amount to base currency (USD)
 */
export async function convertToBase(amount, fromCurrency) {
    return await convertAmount(amount, fromCurrency, 'USD');
}

/**
 * Clear exchange rates cache
 */
export function clearRatesCache() {
    ratesCache.clear();
    console.log('Exchange rates cache cleared');
}

export default {
    fetchExchangeRates,
    convertAmount,
    convertToBase,
    getExchangeRate,
    getAllRates,
    clearRatesCache
};
