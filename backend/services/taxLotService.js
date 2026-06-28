import db from '../config/db.js';
import { taxLots } from '../db/schema.js';
import { eq, and, asc, desc, sql } from 'drizzle-orm';

/**
 * TaxLotService (#482)
 * Handles specific tax-lot identification (FIFO, HIFO, LIFO) for cross-entity optimization.
 */
class TaxLotService {
    /**
     * Records a new asset purchase as a specific tax lot.
     */
    async recordPurchase(userId, portfolioId, vaultId, assetSymbol, quantity, price, purchaseDate = new Date()) {
        const [lot] = await db.insert(taxLots).values({
            userId,
            portfolioId,
            vaultId,
            assetSymbol,
            quantity: quantity.toString(),
            purchasePrice: price.toString(),
            purchaseDate
        }).returning();
        return lot;
    }

    /**
     * Identifies which lots to sell based on a specific strategy.
     * @param {string} strategy - 'FIFO' (First In First Out), 'HIFO' (Highest In First Out), 'LIFO' (Last In First Out)
     */
    async identifyLotsForSale(userId, assetSymbol, quantityToSell, strategy = 'HIFO') {
        let orderBy;
        switch (strategy) {
            case 'FIFO':
                orderBy = asc(taxLots.purchaseDate);
                break;
            case 'LIFO':
                orderBy = desc(taxLots.purchaseDate);
                break;
            case 'HIFO':
            default:
                orderBy = desc(taxLots.purchasePrice);
                break;
        }

        const activeLots = await db.select()
            .from(taxLots)
            .where(and(
                eq(taxLots.userId, userId),
                eq(taxLots.assetSymbol, assetSymbol),
                eq(taxLots.isSold, false)
            ))
            .orderBy(orderBy);

        let remainingToSell = parseFloat(quantityToSell);
        const selectedLots = [];

        for (const lot of activeLots) {
            if (remainingToSell <= 0) break;

            const lotQty = parseFloat(lot.quantity);
            const sellQty = Math.min(lotQty, remainingToSell);

            selectedLots.push({
                ...lot,
                sellQuantity: sellQty
            });

            remainingToSell -= sellQty;
        }

        if (remainingToSell > 0) {
            throw new Error(`Insufficient inventory for ${assetSymbol}. Short by ${remainingToSell}`);
        }

        return selectedLots;
    }

    /**
     * Marks lots as sold and handles partial lot splits if necessary.
     */
    async processSale(selectedLots, sellPrice, sellDate = new Date()) {
        const results = [];
        for (const selection of selectedLots) {
            const lotQty = parseFloat(selection.quantity);
            const sellQty = selection.sellQuantity;

            if (sellQty < lotQty) {
                // Split the lot: update existing with remaining, create new for sold portion
                const remainingQty = lotQty - sellQty;

                await db.update(taxLots)
                    .set({ quantity: remainingQty.toString() })
                    .where(eq(taxLots.id, selection.id));

                const [soldPart] = await db.insert(taxLots).values({
                    userId: selection.userId,
                    portfolioId: selection.portfolioId,
                    vaultId: selection.vaultId,
                    assetSymbol: selection.assetSymbol,
                    quantity: sellQty.toString(),
                    purchasePrice: selection.purchasePrice,
                    purchaseDate: selection.purchaseDate,
                    isSold: true,
                    soldDate: sellDate,
                    soldPrice: sellPrice.toString(),
                    metadata: { originalLotId: selection.id, splitFrom: true }
                }).returning();
                results.push(soldPart);
            } else {
                const [updated] = await db.update(taxLots)
                    .set({
                        isSold: true,
                        soldDate: sellDate,
                        soldPrice: sellPrice.toString()
                    })
                    .where(eq(taxLots.id, selection.id))
                    .returning();
                results.push(updated);
            }
        }
        return results;
    }

    /**
     * Calculates unrealized gain/loss for a user's entire inventory.
     */
    async getUnrealizedPositions(userId, currentPricesMapping) {
        const lots = await db.select()
            .from(taxLots)
            .where(and(
                eq(taxLots.userId, userId),
                eq(taxLots.isSold, false)
            ));

        return lots.map(lot => {
            const currentPrice = currentPricesMapping[lot.assetSymbol] || 0;
            const costBasis = parseFloat(lot.purchasePrice);
            const qty = parseFloat(lot.quantity);
            const currentValue = qty * currentPrice;
            const totalCostBasis = qty * costBasis;
            const unrealizedPL = currentValue - totalCostBasis;

            return {
                ...lot,
                currentPrice,
                currentValue,
                unrealizedPL,
                unrealizedPLPct: costBasis > 0 ? (unrealizedPL / totalCostBasis) * 100 : 0
            };
        });
    }

    /**
     * Calculates the weighted average cost basis for an asset in a specific vault.
     */
    async getAverageCostBasis(userId, vaultId, assetSymbol) {
        const lots = await db.select()
            .from(taxLots)
            .where(and(
                eq(taxLots.userId, userId),
                eq(taxLots.vaultId, vaultId),
                eq(taxLots.assetSymbol, assetSymbol),
                eq(taxLots.isSold, false)
            ));

        if (lots.length === 0) return 0;

        let totalCost = 0;
        let totalQty = 0;

        for (const lot of lots) {
            totalCost += parseFloat(lot.purchasePrice) * parseFloat(lot.quantity);
            totalQty += parseFloat(lot.quantity);
        }

        return totalQty > 0 ? totalCost / totalQty : 0;
    }

    /**
     * Adjusts the cost basis of a lot due to returns of capital or split adjustments.
     */
    async adjustCostBasis(lotId, adjustmentAmountPerUnit) {
        const [lot] = await db.select().from(taxLots).where(eq(taxLots.id, lotId));
        if (!lot) throw new Error('Lot not found');

        const newPrice = parseFloat(lot.purchasePrice) + parseFloat(adjustmentAmountPerUnit);

        await db.update(taxLots)
            .set({
                purchasePrice: newPrice.toString(),
                metadata: { ...lot.metadata, lastBasisAdjustment: new Date(), adjustment: adjustmentAmountPerUnit }
            })
            .where(eq(taxLots.id, lotId));

        return newPrice;
    }

    /**
     * Finds and merges "dust" lots of the same asset in the same vault to simplify tracking.
     */
    async consolidateDustLots(userId, vaultId, assetSymbol, dustThreshold = 0.0001) {
        const lots = await db.select()
            .from(taxLots)
            .where(and(
                eq(taxLots.userId, userId),
                eq(taxLots.vaultId, vaultId),
                eq(taxLots.assetSymbol, assetSymbol),
                eq(taxLots.isSold, false),
                sql`${taxLots.quantity} < ${dustThreshold}`
            )).orderBy(asc(taxLots.purchaseDate));

        if (lots.length < 2) return;

        let totalQty = 0;
        let totalCost = 0;

        for (const lot of lots) {
            totalQty += parseFloat(lot.quantity);
            totalCost += parseFloat(lot.purchasePrice) * parseFloat(lot.quantity);
            await db.delete(taxLots).where(eq(taxLots.id, lot.id));
        }

        const avgPrice = totalCost / totalQty;
        await this.recordPurchase(userId, lots[0].portfolioId, vaultId, assetSymbol, totalQty, avgPrice, lots[0].purchaseDate);

        console.log(`[TaxLotService] Consolidated ${lots.length} dust lots for ${assetSymbol}`);
    }
}

export default new TaxLotService();
