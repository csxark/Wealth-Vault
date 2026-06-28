import db from '../config/db.js';
import { impliedVolSurfaces, investments } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Implied Volatility Tracker (#509)
 * Manages the "Surface" data needed for accurate options pricing.
 * In production, this would ingest data from Bloomberg/Refinitiv or a market oracle.
 */
class ImpliedVolTracker {
    /**
     * Get the latest IV for an asset at a specific tenor and moneyness.
     */
    async getLatestVol(investmentId, tenorDays = 30, moneyness = 1.0) {
        try {
            const [latest] = await db.select()
                .from(impliedVolSurfaces)
                .where(and(
                    eq(impliedVolSurfaces.investmentId, investmentId),
                    eq(impliedVolSurfaces.tenorDays, tenorDays)
                ))
                .orderBy(desc(impliedVolSurfaces.observationDate))
                .limit(1);

            // Default fallback if no data found (standard for equity)
            return latest ? parseFloat(latest.impliedVol) : 0.25;
        } catch (error) {
            logError('[IV Tracker] Failed to fetch vol:', error);
            return 0.25;
        }
    }

    /**
     * Ingest new surface data.
     */
    async updateVolSurface(investmentId, iv, tenorDays, moneyness = 1.0) {
        logInfo(`[IV Tracker] Updating IV for investment ${investmentId} to ${iv}`);

        return await db.insert(impliedVolSurfaces).values({
            investmentId,
            impliedVol: iv.toString(),
            tenorDays,
            moneyness: moneyness.toString(),
            observationDate: new Date(),
            source: 'system_calibration'
        }).returning();
    }

    /**
     * Calculate historical volatility trend.
     */
    async getVolTrend(investmentId, limit = 10) {
        return db.select()
            .from(impliedVolSurfaces)
            .where(eq(impliedVolSurfaces.investmentId, investmentId))
            .orderBy(desc(impliedVolSurfaces.observationDate))
            .limit(limit);
    }
}

export default new ImpliedVolTracker();
