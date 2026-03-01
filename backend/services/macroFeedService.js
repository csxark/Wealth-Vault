import db from '../config/db.js';
import { economicVolatilityIndices } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Macro Feed Service (#454)
 * Manages economic volatility indices used by the simulation engine.
 */
class MacroFeedService {
    /**
     * Get the latest value for a specific index.
     * @param {string} indexName - e.g. 'VIX', 'CPI', 'MarketVol'
     */
    async getLatestIndex(indexName) {
        try {
            const [index] = await db.select()
                .from(economicVolatilityIndices)
                .where(eq(economicVolatilityIndices.indexName, indexName))
                .orderBy(desc(economicVolatilityIndices.observationDate))
                .limit(1);

            return index || { currentValue: '0.15', standardDeviation: '0.02' }; // Fallback defaults
        } catch (error) {
            logError(`[Macro Feed] Failed to fetch index ${indexName}:`, error);
            return { currentValue: '0.15', standardDeviation: '0.02' };
        }
    }

    /**
     * Update or ingest new macro data.
     */
    async updateIndex(indexName, value, stdDev = null, source = 'system') {
        logInfo(`[Macro Feed] Updating ${indexName} to ${value}`);

        return await db.insert(economicVolatilityIndices).values({
            indexName,
            currentValue: value.toString(),
            standardDeviation: stdDev ? stdDev.toString() : null,
            observationDate: new Date(),
            source
        }).returning();
    }
}

export default new MacroFeedService();
