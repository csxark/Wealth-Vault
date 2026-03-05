import db from '../config/db.js';
import { irs7520Rates } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import axios from 'axios';

/**
 * IRS Rate Tracker (#511)
 * Manages the fetching, caching, and retrieval of IRS Section 7520 hurdle rates.
 * These rates are critical for GRAT calculations and Dynasty trust valuations.
 */
class IRSRateTracker {
    /**
     * Get the current effective 7520 rate.
     * Defaults to 5.0% if no rate is found.
     */
    async getCurrentRate() {
        try {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            const [latestRate] = await db.select()
                .from(irs7520Rates)
                .orderBy(desc(irs7520Rates.effectiveYear), desc(irs7520Rates.effectiveMonth))
                .limit(1);

            return latestRate ? parseFloat(latestRate.rate) : 0.050; // Fallback to 5%
        } catch (error) {
            logError('[IRS Rate Tracker] Failed to fetch current rate:', error);
            return 0.050;
        }
    }

    /**
     * Sync the latest rate from an external source (mocked for now).
     * In production, this would hit an official IRS or financial data provider API.
     */
    async syncLatestRate() {
        logInfo('[IRS Rate Tracker] Syncing latest IRS 7520 rate');

        try {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            // Mocked external fetch - realistically would use a scraper or official API
            // Section 7520 rates typically hover between 2% and 6% in current macro environment
            const mockedRate = (Math.random() * (0.055 - 0.045) + 0.045).toFixed(4);

            const [existing] = await db.select()
                .from(irs7520Rates)
                .where(and(
                    eq(irs7520Rates.effectiveMonth, month),
                    eq(irs7520Rates.effectiveYear, year)
                ));

            if (existing) {
                logInfo(`[IRS Rate Tracker] Rate for ${month}/${year} already exists: ${existing.rate}`);
                return existing;
            }

            const [newRate] = await db.insert(irs7520Rates).values({
                effectiveMonth: month,
                effectiveYear: year,
                rate: mockedRate.toString(),
            }).returning();

            logInfo(`[IRS Rate Tracker] Synced new rate for ${month}/${year}: ${mockedRate}`);
            return newRate;
        } catch (error) {
            logError('[IRS Rate Tracker] Sync failed:', error);
            throw error;
        }
    }

    /**
     * Get historical rates for trend analysis in simulations.
     */
    async getHistoricalRates(limit = 12) {
        return db.select()
            .from(irs7520Rates)
            .orderBy(desc(irs7520Rates.effectiveYear), desc(irs7520Rates.effectiveMonth))
            .limit(limit);
    }
}

export default new IRSRateTracker();
