import db from '../config/db.js';
import { harvestOpportunities, taxLots } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Analytics Service (L3)
 * Provides advanced financial intelligence and metrics.
 */
class AnalyticsService {
  /**
   * Calculate Tax Alpha
   * Measures the value added through active tax-loss harvesting.
   */
  async getTaxAlphaMetrics(userId) {
    const harvested = await db.select({
      totalLoss: sql`sum(${harvestOpportunities.unrealizedLoss})`,
      totalSavings: sql`sum(${harvestOpportunities.estimatedSavings})`
    }).from(harvestOpportunities)
      .where(and(eq(harvestOpportunities.userId, userId), eq(harvestOpportunities.status, 'harvested')));

    const activeLosses = await db.select({
      total: sql`sum(${harvestOpportunities.unrealizedLoss})`
    }).from(harvestOpportunities)
      .where(and(eq(harvestOpportunities.userId, userId), eq(harvestOpportunities.status, 'detected')));

    return {
      realizedTaxAlpha: harvested[0]?.totalSavings || 0,
      potentialTaxAlpha: (activeLosses[0]?.total || 0) * 0.20,
      totalHarvestableLosses: activeLosses[0]?.total || 0
    };
  }
}

export default new AnalyticsService();
