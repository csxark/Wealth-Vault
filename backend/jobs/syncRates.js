import cron from 'node-cron';
import { fetchExchangeRates } from '../services/currencyService.js';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';
import { sql } from 'drizzle-orm';

/**
 * Sync exchange rates for all currencies used in the system
 */
async function syncAllRates() {
    try {
        console.log('Starting exchange rates sync...');
        const startTime = Date.now();

        // Get all unique currencies used by users
        const result = await db.select({ currency: users.currency })
            .from(users)
            .groupBy(users.currency);

        const currencies = result.map(r => r.currency).filter(Boolean);
        
        // Always include USD as base
        const currenciesToSync = new Set(['USD', ...currencies]);

        console.log(`Syncing rates for ${currenciesToSync.size} currencies: ${[...currenciesToSync].join(', ')}`);

        const syncResults = [];
        for (const currency of currenciesToSync) {
            try {
                const { rates, validUntil } = await fetchExchangeRates(currency);
                syncResults.push({
                    currency,
                    success: true,
                    ratesCount: Object.keys(rates).length,
                    validUntil
                });
                
                // Add delay to avoid rate limiting (if using free API)
                if (!process.env.EXCHANGE_RATE_API_KEY) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`Failed to sync rates for ${currency}:`, error.message);
                syncResults.push({
                    currency,
                    success: false,
                    error: error.message
                });
            }
        }

        const duration = Date.now() - startTime;
        const successCount = syncResults.filter(r => r.success).length;
        
        console.log(`Exchange rates sync completed in ${duration}ms`);
        console.log(`Success: ${successCount}/${currenciesToSync.size} currencies`);
        
        return {
            success: true,
            duration,
            currencies: currenciesToSync.size,
            successful: successCount,
            results: syncResults
        };
    } catch (error) {
        console.error('Error in exchange rates sync:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Schedule daily exchange rates sync
 * Runs at 2 AM every day to get fresh rates
 */
export function scheduleRatesSync() {
    // Run at 2 AM every day
    cron.schedule('0 2 * * *', async () => {
        console.log('Running scheduled exchange rates sync...');
        await syncAllRates();
    });

    console.log('Exchange rates sync scheduled for 2 AM daily');
}

/**
 * Run sync immediately (useful for manual triggers and startup)
 */
export async function runImmediateSync() {
    console.log('Running immediate exchange rates sync...');
    return await syncAllRates();
}

/**
 * Sync rates for a specific currency
 */
export async function syncCurrencyRates(currency) {
    try {
        console.log(`Syncing exchange rates for ${currency}...`);
        const { rates, validUntil } = await fetchExchangeRates(currency);
        return {
            success: true,
            currency,
            ratesCount: Object.keys(rates).length,
            validUntil
        };
    } catch (error) {
        console.error(`Failed to sync rates for ${currency}:`, error.message);
        return {
            success: false,
            currency,
            error: error.message
        };
    }
}
