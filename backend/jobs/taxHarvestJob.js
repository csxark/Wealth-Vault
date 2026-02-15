import cron from 'node-cron';
import db from '../config/db.js';
import { taxLots, investments, harvestOpportunities } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import taxService from '../services/taxService.js';
import { logAuditEvent } from '../services/auditService.js';

/**
 * Tax-Loss Harvesting Job (L3)
 * Nightly scan for investments with significant unrealized losses.
 */
class TaxHarvestJob {
    start() {
        // Run nightly at 2 AM
        cron.schedule('0 2 * * *', async () => {
            console.log('[Tax-Harvest Job] Starting nightly scan...');
            await this.scanForOpportunities();
        });
    }

    async scanForOpportunities() {
        try {
            // 1. Get all active investments with current prices
            const activePositions = await db.select({
                userId: taxLots.userId,
                investmentId: taxLots.investmentId,
                totalQuantity: sql`sum(${taxLots.quantity})`,
                avgCost: sql`avg(${taxLots.costBasisPerUnit})`,
                currentPrice: investments.currentPrice
            })
                .from(taxLots)
                .innerJoin(investments, eq(taxLots.investmentId, investments.id))
                .where(eq(taxLots.isSold, false))
                .groupBy(taxLots.userId, taxLots.investmentId, investments.currentPrice);

            for (const pos of activePositions) {
                const currentPrice = parseFloat(pos.currentPrice || 0);
                const avgCost = parseFloat(pos.avgCost || 0);
                const quantity = parseFloat(pos.totalQuantity || 0);

                if (currentPrice > 0 && currentPrice < avgCost) {
                    const unrealizedLoss = (avgCost - currentPrice) * quantity;

                    // Trigger alert if loss > $500 (Threshold for L3 Harvesting)
                    if (unrealizedLoss > 500) {
                        const estimatedSavings = unrealizedLoss * 0.20; // 20% Tax Alpha

                        // Check if opportunity already recorded
                        const existing = await db.query.harvestOpportunities.findFirst({
                            where: and(
                                eq(harvestOpportunities.investmentId, pos.investmentId),
                                eq(harvestOpportunities.status, 'detected')
                            )
                        });

                        if (!existing) {
                            await db.insert(harvestOpportunities).values({
                                userId: pos.userId,
                                investmentId: pos.investmentId,
                                unrealizedLoss: unrealizedLoss.toFixed(2),
                                estimatedSavings: estimatedSavings.toFixed(2),
                                status: 'detected'
                            });

                            await logAuditEvent({
                                userId: pos.userId,
                                action: 'TAX_HARVEST_DETECTED',
                                resourceType: 'investment',
                                resourceId: pos.investmentId,
                                metadata: { unrealizedLoss, estimatedSavings }
                            });

                            console.log(`[Tax-Harvest Job] Opportunity detected for User ${pos.userId} on Investment ${pos.investmentId}: $${unrealizedLoss.toFixed(2)} loss`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Tax-Harvest Job] Scan failed:', error);
        }
    }
}

export default new TaxHarvestJob();
