import db from '../config/db.js';
import { taxLotInventory, costBasisAdjustments, liquidationQueues } from '../db/schema.js';
import { eq, and, asc, desc } from 'drizzle-orm';
import { sortLotsForLiquidation, getHoldingPeriodType } from '../utils/taxMath.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tax Lot Manager Service (#448)
 * Manages granular lot tracking and liquidation matching.
 */
class TaxLotManager {
    /**
     * Create a new tax lot after a purchase
     */
    async createLot(userId, portfolioId, investmentId, quantity, price, purchaseDate = new Date()) {
        logInfo(`[Tax Lot Manager] Creating new lot for user ${userId}, asset ${investmentId}`);

        try {
            const [lot] = await db.insert(taxLotInventory).values({
                userId,
                portfolioId,
                investmentId,
                originalQuantity: quantity.toString(),
                remainingQuantity: quantity.toString(),
                purchasePrice: price.toString(),
                costBasisPerUnit: price.toString(),
                purchaseDate: new Date(purchaseDate),
                lotStatus: 'open',
                holdingPeriodType: 'short_term' // Initial state
            }).returning();

            return lot;
        } catch (error) {
            logError(`[Tax Lot Manager] Failed to create lot:`, error);
            throw error;
        }
    }

    /**
     * Match a sale against specific lots based on a method (FIFO, HIFO, etc)
     */
    async processLiquidation(userId, investmentId, quantityToSell, method = 'HIFO') {
        logInfo(`[Tax Lot Manager] Processing liquidation of ${quantityToSell} units using ${method}`);

        return await db.transaction(async (tx) => {
            // 1. Fetch available open lots
            const availableLots = await tx.select().from(taxLotInventory).where(and(
                eq(taxLotInventory.userId, userId),
                eq(taxLotInventory.investmentId, investmentId),
                eq(taxLotInventory.lotStatus, 'open')
            ));

            if (availableLots.length === 0) {
                throw new Error("Insufficient tax lots available for liquidation.");
            }

            // 2. Sort lots based on method
            const sortedLots = sortLotsForLiquidation(availableLots, method);

            let remainingToLiquidate = parseFloat(quantityToSell);
            const matchedLots = [];

            for (const lot of sortedLots) {
                if (remainingToLiquidate <= 0) break;

                const lotQty = parseFloat(lot.remainingQuantity);
                const sellQty = Math.min(remainingToLiquidate, lotQty);

                const newRemainingQty = lotQty - sellQty;

                // 3. Update lot OR split if necessary
                await tx.update(taxLotInventory).set({
                    remainingQuantity: newRemainingQty.toString(),
                    lotStatus: newRemainingQty === 0 ? 'closed' : 'open',
                    disposalDate: newRemainingQty === 0 ? new Date() : null,
                    updatedAt: new Date()
                }).where(eq(taxLotInventory.id, lot.id));

                matchedLots.push({
                    lotId: lot.id,
                    unitsSold: sellQty,
                    costBasis: lot.costBasisPerUnit,
                    holdingPeriod: getHoldingPeriodType(lot.purchaseDate, new Date())
                });

                remainingToLiquidate -= sellQty;
            }

            if (remainingToLiquidate > 0) {
                throw new Error(`Oversold asset. ${remainingToLiquidate} units remained unmatched.`);
            }

            return matchedLots;
        });
    }

    /**
     * Apply a cost basis adjustment to a specific lot
     */
    async adjustLotBasis(lotId, amount, type, description) {
        return await db.transaction(async (tx) => {
            const [lot] = await tx.select().from(taxLotInventory).where(eq(taxLotInventory.id, lotId));
            if (!lot) throw new Error("Lot not found.");

            await tx.insert(costBasisAdjustments).values({
                lotId,
                adjustmentAmount: amount.toString(),
                adjustmentType: type,
                description
            });

            const newBasis = parseFloat(lot.costBasisPerUnit) + parseFloat(amount);

            await tx.update(taxLotInventory).set({
                costBasisPerUnit: newBasis.toString(),
                updatedAt: new Date()
            }).where(eq(taxLotInventory.id, lotId));

            return newBasis;
        });
    }
}

export default new TaxLotManager();
