import db from '../config/db.js';
import { taxLotHistory, investments } from '../db/schema.js';
import { eq, and, gte, lte, or, sql } from 'drizzle-orm';

/**
 * Wash Sale Checker (L3)
 * 30-day look-back/look-forward logic to prevent disallowed tax losses across all user entities.
 */
class WashSaleChecker {
    /**
     * Check if selling an asset now would likely trigger a wash sale
     * (i.e., has the user bought the same/similar asset in the last 30 days?)
     */
    async checkWashSaleRisk(userId, symbol) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Look for recent purchases (new lots)
        const recentLots = await db.query.taxLotHistory.findMany({
            where: and(
                eq(taxLotHistory.userId, userId),
                gte(taxLotHistory.acquisitionDate, thirtyDaysAgo),
                eq(taxLotHistory.status, 'open')
            ),
            with: {
                investment: true
            }
        });

        const hasRecentPurchase = recentLots.some(lot => lot.investment.symbol === symbol);

        if (hasRecentPurchase) return true;

        // In production, also check for "Substantially Identical" assets (Proxies)
        // using reinvestmentService mappings

        return false;
    }

    /**
     * Validate a harvest execution plan for wash sale compliance
     */
    async validateHarvestPlan(userId, investmentId) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Check if any lot of this investment was purchased in the last 30 days
        const conflictingLots = await db.query.taxLotHistory.findMany({
            where: and(
                eq(taxLotHistory.userId, userId),
                eq(taxLotHistory.investmentId, investmentId),
                gte(taxLotHistory.acquisitionDate, thirtyDaysAgo)
            )
        });

        if (conflictingLots.length > 0) {
            return {
                isCompliant: false,
                reason: 'A corresponding purchase was found within the last 30 days (Look-back violation)',
                conflicts: conflictingLots.length
            };
        }

        return { isCompliant: true };
    }

    /**
     * Monitor for "Post-Sale" Wash Sale triggers
     * Used to alert users if they manually buy an asset they just harvested
     */
    async checkPostHarvestViolation(userId, symbol, purchaseDate) {
        // Find if this symbol was harvested in the last 30 days
        const thirtyDaysPriorToPurchase = new Date(purchaseDate);
        thirtyDaysPriorToPurchase.setDate(thirtyDaysPriorToPurchase.getDate() - 30);

        const recentHarvests = await db.query.taxLotHistory.findMany({
            where: and(
                eq(taxLotHistory.userId, userId),
                eq(taxLotHistory.status, 'harvested'),
                gte(taxLotHistory.soldDate, thirtyDaysPriorToPurchase)
            ),
            with: {
                investment: true
            }
        });

        const violation = recentHarvests.find(h => h.investment.symbol === symbol);

        if (violation) {
            return {
                isViolation: true,
                harvestedLotId: violation.id,
                harvestDate: violation.soldDate,
                realizedLoss: violation.realizedGainLoss
            };
        }

        return { isViolation: false };
    }
}

export default new WashSaleChecker();
