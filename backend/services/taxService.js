import db from '../config/db.js';
import { taxLots, washSaleLogs, harvestOpportunities } from '../db/schema.js';
import { eq, and, sql, gte, lte, asc, desc } from 'drizzle-orm';

/**
 * Tax Service (L3)
 * Implements Tax-Loss Harvesting and Wash-Sale Prevention logic.
 */
class TaxService {
  /**
   * Get available tax lots for an investment using a matching algorithm
   * @param {string} investmentId
   * @param {string} userId
   * @param {string} method - 'FIFO', 'LIFO', 'HIFO' (Highest In, First Out)
   */
  async getMatchingLots(investmentId, userId, method = 'FIFO') {
    let orderBy;
    switch (method) {
      case 'LIFO':
        orderBy = desc(taxLots.acquiredAt);
        break;
      case 'HIFO':
        orderBy = desc(taxLots.costBasisPerUnit);
        break;
      case 'FIFO':
      default:
        orderBy = asc(taxLots.acquiredAt);
    }

    return await db.query.taxLots.findMany({
      where: and(
        eq(taxLots.investmentId, investmentId),
        eq(taxLots.userId, userId),
        eq(taxLots.isSold, false)
      ),
      orderBy
    });
  }

  /**
   * Detect potential Wash-Sale (Buy within 30 days before/after a loss sale)
   */
  async checkWashSaleRisk(userId, investmentId, sellDate, lossAmount) {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const windowStart = new Date(sellDate.getTime() - thirtyDaysInMs);
    const windowEnd = new Date(sellDate.getTime() + thirtyDaysInMs);

    // Check for "Replacement Shares" bought in the window
    const replacementLots = await db.query.taxLots.findMany({
      where: and(
        eq(taxLots.userId, userId),
        eq(taxLots.investmentId, investmentId),
        gte(taxLots.acquiredAt, windowStart),
        lte(taxLots.acquiredAt, windowEnd)
      )
    });

    if (replacementLots.length > 0) {
      return {
        isWashSale: true,
        replacementLots,
        disallowedLoss: lossAmount
      };
    }

    return { isWashSale: false };
  }

  /**
   * Calculate Tax Alpha (Estimated tax savings from harvested losses)
   */
  async calculateTaxAlpha(userId) {
    const harvestedLosses = await db.select({
      total: sql`sum(${harvestOpportunities.unrealizedLoss})`
    }).from(harvestOpportunities)
      .where(and(
        eq(harvestOpportunities.userId, userId),
        eq(harvestOpportunities.status, 'harvested')
      ));

    const taxRate = 0.20; // Default LTCG rate
    const alpha = (harvestedLosses[0]?.total || 0) * taxRate;

    return {
      totalLossesHarvested: harvestedLosses[0]?.total || 0,
      estimatedTaxAlpha: alpha
    };
  }

  /**
   * Liquidate lots when selling shares
   */
  async liquidateLots(userId, investmentId, quantityToSell, method = 'FIFO') {
    const lots = await this.getMatchingLots(investmentId, userId, method);
    let remainingToSell = parseFloat(quantityToSell);
    const updatedLots = [];

    for (const lot of lots) {
      if (remainingToSell <= 0) break;

      const lotQty = parseFloat(lot.quantity);
      if (lotQty <= remainingToSell) {
        // Full lot sold
        const [updated] = await db.update(taxLots)
          .set({ isSold: true, soldAt: new Date(), quantity: '0' })
          .where(eq(taxLots.id, lot.id))
          .returning();
        updatedLots.push(updated);
        remainingToSell -= lotQty;
      } else {
        // Partial lot sold
        const [updated] = await db.update(taxLots)
          .set({ quantity: (lotQty - remainingToSell).toString() })
          .where(eq(taxLots.id, lot.id))
          .returning();
        updatedLots.push(updated);
        remainingToSell = 0;
      }
    }
    return updatedLots;
  }
}

export default new TaxService();
