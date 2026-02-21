import db from '../config/db.js';
import { investments, portfolios, taxLossOpportunities, assetCorrelationMatrix } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import taxService from './taxService.js';

/**
 * Tax Scout AI Service (L2/L3)
 * Scans portfolios for tax-loss harvesting opportunities using correlation analytics.
 */
class TaxScoutAI {
    /**
     * Scan all user portfolios for harvesting opportunities
     */
    async scanForOpportunities(userId) {
        logInfo(`[Tax Scout AI] Starting scan for user ${userId}`);

        const userInvestments = await db.query.investments.findMany({
            where: and(eq(investments.userId, userId), eq(investments.isActive, true))
        });

        const opportunities = [];

        for (const target of userInvestments) {
            const unrealizedLoss = parseFloat(target.unrealizedGainLoss);

            // Significant loss threshold: $500 or 10%
            if (unrealizedLoss < -500 || (parseFloat(target.unrealizedGainLossPercent) < -10)) {

                // Check Global Wash-Sale Prevention Matrix
                const hasWashSaleRisk = await taxService.checkWashSaleRisk(userId, target.symbol);
                if (hasWashSaleRisk) {
                    logInfo(`[Tax Scout AI] Skipping ${target.symbol} due to wash-sale risk.`);
                    continue;
                }

                // Find proxy asset for "Tax-Loss Swap"
                const proxy = await this.findProxyAsset(target.symbol);

                const opportunityData = {
                    userId,
                    portfolioId: target.portfolioId,
                    investmentId: target.id,
                    assetSymbol: target.symbol,
                    unrealizedLoss: Math.abs(unrealizedLoss).toString(),
                    taxSavingsEstimate: (Math.abs(unrealizedLoss) * 0.20).toString(), // Baseline 20% savings
                    proxyAssetSymbol: proxy?.symbol || null,
                    correlationScore: proxy?.correlation || null,
                    status: 'pending',
                    metadata: {
                        currentPrice: target.currentPrice,
                        quantity: target.quantity,
                        lastDetected: new Date()
                    }
                };

                // Upsert opportunity
                const [opp] = await db.insert(taxLossOpportunities)
                    .values(opportunityData)
                    .onConflictDoUpdate({
                        target: [taxLossOpportunities.investmentId],
                        set: {
                            unrealizedLoss: opportunityData.unrealizedLoss,
                            updatedAt: new Date(),
                            status: 'pending' // Reset status if it drops back into opportunity
                        }
                    })
                    .returning();

                opportunities.push(opp);
            }
        }

        logInfo(`[Tax Scout AI] Scan completed. Found ${opportunities.length} opportunities for user ${userId}`);
        return opportunities;
    }

    /**
     * Find a highly correlated proxy asset using the Pearson matrix
     */
    async findProxyAsset(symbol) {
        const correlations = await db.query.assetCorrelationMatrix.findMany({
            where: eq(assetCorrelationMatrix.baseAssetSymbol, symbol),
            orderBy: [sql`${assetCorrelationMatrix.correlationCoefficient} DESC`],
            limit: 1
        });

        if (correlations.length > 0) {
            return {
                symbol: correlations[0].proxyAssetSymbol,
                correlation: correlations[0].correlationCoefficient
            };
        }

        return null;
    }
}

export default new TaxScoutAI();
