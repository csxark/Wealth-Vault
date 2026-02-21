import db from '../config/db.js';
import { taxLotHistory, investments } from '../db/schema.js';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tax Lot Service (L3)
 * Deep implementation of HIFO (Highest-In-First-Out) and Specific ID cost-basis tracking.
 */
class TaxLotService {
    /**
     * Record a new acquisition lot
     */
    async addLot(userId, investmentId, quantity, unitPrice, acquisitionDate = new Date()) {
        const costBasis = parseFloat(quantity) * parseFloat(unitPrice);

        const [lot] = await db.insert(taxLotHistory).values({
            userId,
            investmentId,
            acquisitionDate,
            quantity: quantity.toString(),
            unitPrice: unitPrice.toString(),
            costBasis: costBasis.toFixed(2),
            status: 'open'
        }).returning();

        logInfo(`[TaxLot Service] Added new lot for investment ${investmentId}: ${quantity} units @ $${unitPrice}`);
        return lot;
    }

    /**
     * Get lots for HIFO (Highest-In-First-Out) optimization
     * Used for tax-loss harvesting (selling highest cost basis first)
     */
    async getHIFOLots(userId, investmentId) {
        return await db.query.taxLotHistory.findMany({
            where: and(
                eq(taxLotHistory.userId, userId),
                eq(taxLotHistory.investmentId, investmentId),
                eq(taxLotHistory.status, 'open')
            ),
            orderBy: [desc(taxLotHistory.unitPrice)]
        });
    }

    /**
     * Get lots for FIFO (First-In-First-Out)
     */
    async getFIFOLots(userId, investmentId) {
        return await db.query.taxLotHistory.findMany({
            where: and(
                eq(taxLotHistory.userId, userId),
                eq(taxLotHistory.investmentId, investmentId),
                eq(taxLotHistory.status, 'open')
            ),
            orderBy: [asc(taxLotHistory.acquisitionDate)]
        });
    }

    /**
     * Calculate unrealized gain/loss per lot
     */
    async calculateLotUnrealizedGL(lotId, currentPrice) {
        const lot = await db.query.taxLotHistory.findFirst({
            where: eq(taxLotHistory.id, lotId)
        });

        if (!lot) return null;

        const currentValValue = parseFloat(lot.quantity) * parseFloat(currentPrice);
        const gainLoss = currentValValue - parseFloat(lot.costBasis);
        const daysHeld = Math.floor((new Date() - new Date(lot.acquisitionDate)) / (1000 * 60 * 60 * 24));
        const isLongTerm = daysHeld > 365;

        return {
            lotId: lot.id,
            gainLoss: parseFloat(gainLoss.toFixed(2)),
            gainLossPercent: parseFloat(((gainLoss / parseFloat(lot.costBasis)) * 100).toFixed(2)),
            isLongTerm,
            daysHeld
        };
    }

    /**
     * Close out lots on sale (Specific ID method)
     */
    async closeLots(userId, saleDetails) {
        const { investmentId, unitsSold, salePrice, method = 'HIFO' } = saleDetails;

        try {
            return await db.transaction(async (tx) => {
                let lots;
                if (method === 'HIFO') {
                    lots = await tx.select().from(taxLotHistory)
                        .where(and(
                            eq(taxLotHistory.userId, userId),
                            eq(taxLotHistory.investmentId, investmentId),
                            eq(taxLotHistory.status, 'open')
                        ))
                        .orderBy(desc(taxLotHistory.unitPrice));
                } else {
                    lots = await tx.select().from(taxLotHistory)
                        .where(and(
                            eq(taxLotHistory.userId, userId),
                            eq(taxLotHistory.investmentId, investmentId),
                            eq(taxLotHistory.status, 'open')
                        ))
                        .orderBy(asc(taxLotHistory.acquisitionDate));
                }

                let remainingUnitsToClose = parseFloat(unitsSold);
                const closedLots = [];

                for (const lot of lots) {
                    if (remainingUnitsToClose <= 0) break;

                    const lotQty = parseFloat(lot.quantity);
                    const qtyToClose = Math.min(lotQty, remainingUnitsToClose);

                    const realizedGL = (parseFloat(salePrice) - parseFloat(lot.unitPrice)) * qtyToClose;
                    const daysHeld = Math.floor((new Date() - new Date(lot.acquisitionDate)) / (1000 * 60 * 60 * 24));

                    if (qtyToClose === lotQty) {
                        // Full lot closure
                        await tx.update(taxLotHistory)
                            .set({
                                status: 'closed',
                                isSold: true,
                                soldDate: new Date(),
                                salePrice: salePrice.toString(),
                                realizedGainLoss: realizedGL.toFixed(2),
                                holdingPeriodDays: daysHeld,
                                isLongTerm: daysHeld > 365
                            })
                            .where(eq(taxLotHistory.id, lot.id));

                        closedLots.push({ id: lot.id, qty: qtyToClose, realizedGL });
                    } else {
                        // Partial lot closure (needs lot splitting)
                        // 1. Update existing lot to remaining
                        await tx.update(taxLotHistory)
                            .set({ quantity: (lotQty - qtyToClose).toString(), costBasis: ((lotQty - qtyToClose) * parseFloat(lot.unitPrice)).toFixed(2) })
                            .where(eq(taxLotHistory.id, lot.id));

                        // 2. Insert new closed lot
                        const [newClosedLot] = await tx.insert(taxLotHistory).values({
                            userId,
                            investmentId,
                            acquisitionDate: lot.acquisitionDate,
                            quantity: qtyToClose.toString(),
                            unitPrice: lot.unitPrice,
                            costBasis: (qtyToClose * parseFloat(lot.unitPrice)).toFixed(2),
                            status: 'closed',
                            isSold: true,
                            soldDate: new Date(),
                            salePrice: salePrice.toString(),
                            realizedGainLoss: realizedGL.toFixed(2),
                            holdingPeriodDays: daysHeld,
                            isLongTerm: daysHeld > 365
                        }).returning();

                        closedLots.push({ id: newClosedLot.id, qty: qtyToClose, realizedGL });
                    }

                    remainingUnitsToClose -= qtyToClose;
                }

                return closedLots;
            });
        } catch (error) {
            logError('[TaxLot Service] Closing lots failed:', error);
            throw error;
        }
    }
}

export default new TaxLotService();
