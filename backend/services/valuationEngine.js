import db from '../config/db.js';
import { taxLotInventory, investments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Valuation Engine (#448)
 * Recalculates portfolio value iteratively over individual tax lots.
 */
class ValuationEngine {
    /**
     * Calculate granular portfolio value for a user
     */
    async calculateGranularValue(userId, portfolioId) {
        logInfo(`[Valuation Engine] Calculating granular valuation for portfolio ${portfolioId}`);

        try {
            // 1. Fetch all open lots for this portfolio
            const openLots = await db.select().from(taxLotInventory).where(and(
                eq(taxLotInventory.userId, userId),
                eq(taxLotInventory.portfolioId, portfolioId),
                eq(taxLotInventory.lotStatus, 'open')
            ));

            let totalValue = 0;
            let totalUnrealizedGain = 0;

            // 2. Map current prices from investments
            const assetIds = [...new Set(openLots.map(l => l.investmentId))];
            const priceMap = {};

            // Fetch assets to get current market prices
            if (assetIds.length > 0) {
                const assets = await db.select().from(investments).where(eq(investments.userId, userId));
                assets.forEach(a => {
                    priceMap[a.id] = parseFloat(a.currentPrice || 0);
                });
            }

            // 3. Iterative Valuation over LOTS
            for (const lot of openLots) {
                const currentPrice = priceMap[lot.investmentId] || 0;
                const qty = parseFloat(lot.remainingQuantity);
                const lotValue = qty * currentPrice;
                const lotCostBasis = qty * parseFloat(lot.costBasisPerUnit);

                totalValue += lotValue;
                totalUnrealizedGain += (lotValue - lotCostBasis);
            }

            return {
                portfolioId,
                totalMarketValue: totalValue.toFixed(2),
                totalUnrealizedGain: totalUnrealizedGain.toFixed(2),
                lotCount: openLots.length
            };
        } catch (error) {
            logError(`[Valuation Engine] Valuation failed:`, error);
            throw error;
        }
    }
}

export default new ValuationEngine();
