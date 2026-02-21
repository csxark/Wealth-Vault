import db from '../config/db.js';
import { taxLots } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logAuditEvent } from './auditService.js';

/**
 * Portfolio Service (L3)
 * Manages specific cost-basis tax lots for every investment.
 */
class PortfolioService {
  /**
   * Add a new tax lot after a purchase
   */
  async addTaxLot(userId, investmentId, symbol, quantity, costBasis, acquiredAt) {
    const [lot] = await db.insert(taxLots).values({
      userId,
      investmentId,
      symbol,
      quantity,
      costBasisPerUnit: costBasis,
      acquiredAt: acquiredAt || new Date(),
      isSold: false
    }).returning();

    await logAuditEvent({
      userId,
      action: 'COST_BASIS_ADJUSTMENT',
      resourceType: 'investment',
      resourceId: investmentId,
      metadata: { quantity, costBasis, lotId: lot.id }
    });

    return lot;
  }

  /**
   * Get all active tax lots for a user
   */
  async getActiveTaxLots(userId) {
    return await db.query.taxLots.findMany({
      where: and(eq(taxLots.userId, userId), eq(taxLots.isSold, false))
    });
  }

  /**
   * Get specific lots for an investment
   */
  async getInvestmentLots(userId, investmentId) {
    return await db.query.taxLots.findMany({
      where: and(
        eq(taxLots.userId, userId),
        eq(taxLots.investmentId, investmentId),
        eq(taxLots.isSold, false)
      )
    });
  }
}

export default new PortfolioService();
