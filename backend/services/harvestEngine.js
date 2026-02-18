import db from '../config/db.js';
import { taxLotHistory, investments, harvestExecutionLogs } from '../db/schema.js';
import { eq, and, lt } from 'drizzle-orm';
import taxLotService from './taxLotService.js';
import washSaleChecker from './washSaleChecker.js';
import reaperService from './reinvestmentService.js'; // Proxy for reinvestmentService
import { logInfo, logError } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Harvest Engine (L3)
 * Mathematical logic to calculate "Net-Tax-Benefit" after considering slippage and trading fees.
 */
class HarvestEngine {
    /**
     * Scan for harvesting opportunities
     */
    async scanOpportunities(userId, minLossThreshold = 500) {
        const userInvestments = await db.query.investments.findMany({
            where: and(eq(investments.userId, userId), eq(investments.isActive, true))
        });

        const opportunities = [];

        for (const investment of userInvestments) {
            const lots = await taxLotService.getHIFOLots(userId, investment.id);
            const currentPrice = parseFloat(investment.currentPrice || '0');

            let totalPotentialLoss = 0;
            const eligibleLots = [];

            for (const lot of lots) {
                const analysis = await taxLotService.calculateLotUnrealizedGL(lot.id, currentPrice);
                if (analysis && analysis.gainLoss < 0) {
                    // Check for wash sale violations before considering
                    const isWashSaleRisk = await washSaleChecker.checkWashSaleRisk(userId, investment.symbol);

                    if (!isWashSaleRisk) {
                        totalPotentialLoss += Math.abs(analysis.gainLoss);
                        eligibleLots.push({
                            ...lot,
                            loss: Math.abs(analysis.gainLoss),
                            isLongTerm: analysis.isLongTerm
                        });
                    }
                }
            }

            if (totalPotentialLoss >= minLossThreshold) {
                const netBenefit = await this.calculateNetBenefit(userId, totalPotentialLoss, 0.002); // 0.2% slippage estimate

                opportunities.push({
                    investmentId: investment.id,
                    symbol: investment.symbol,
                    totalPotentialLoss,
                    eligibleLotsCount: eligibleLots.length,
                    estimatedTaxSavings: netBenefit.taxSavings,
                    netBenefit: netBenefit.netBenefit,
                    eligibleLots
                });
            }
        }

        return opportunities;
    }

    /**
     * Calculate Net Tax Benefit
     */
    async calculateNetBenefit(userId, lossAmount, slippageRate = 0.002) {
        // Mock tax rates - in production fetch from user tax profile
        const shortTermRate = 0.35;
        const longTermRate = 0.15;

        const taxSavings = lossAmount * shortTermRate; // Conservatively assuming ST offsetting
        const slippageCost = lossAmount * slippageRate;
        const estimatedCommission = 10.00; // Fixed flat fee mock

        const totalCosts = slippageCost + estimatedCommission;
        const netBenefit = taxSavings - totalCosts;

        return {
            lossAmount,
            taxSavings,
            totalCosts,
            netBenefit,
            isWorthwhile: netBenefit > (lossAmount * 0.05) // Benefit should be at least 5% of loss
        };
    }

    /**
     * Execute Harvest
     */
    async executeHarvest(userId, investmentId, lotIds) {
        try {
            const batchId = uuidv4();
            const investment = await db.query.investments.findFirst({
                where: eq(investments.id, investmentId)
            });

            if (!investment) throw new Error('Investment not found');

            const currentPrice = parseFloat(investment.currentPrice);
            let totalLossRealized = 0;

            const results = await db.transaction(async (tx) => {
                const harvestResults = [];

                for (const lotId of lotIds) {
                    const lot = await tx.query.taxLotHistory.findFirst({
                        where: eq(taxLotHistory.id, lotId)
                    });

                    if (!lot || lot.status !== 'open') continue;

                    const unrealized = await taxLotService.calculateLotUnrealizedGL(lotId, currentPrice);
                    totalLossRealized += Math.abs(unrealized.gainLoss);

                    // Execute sale
                    await tx.update(taxLotHistory)
                        .set({
                            status: 'harvested',
                            isSold: true,
                            soldDate: new Date(),
                            salePrice: currentPrice.toString(),
                            realizedGainLoss: unrealized.gainLoss.toString(),
                            metadata: { harvestBatchId: batchId }
                        })
                        .where(eq(taxLotHistory.id, lotId));

                    harvestResults.push(lotId);
                }

                // Log the execution
                const taxSavings = totalLossRealized * 0.35; // Mock rate

                const [log] = await tx.insert(harvestExecutionLogs).values({
                    userId,
                    batchId,
                    investmentId,
                    lotsHarvested: harvestResults,
                    totalLossRealized: totalLossRealized.toFixed(2),
                    taxSavingsEstimated: taxSavings.toFixed(2),
                    status: 'executed'
                }).returning();

                return log;
            });

            logInfo(`[Harvest Engine] Successfully harvested $${totalLossRealized} loss for ${investment.symbol}`);
            return results;
        } catch (error) {
            logError('[Harvest Engine] Harvest execution failed:', error);
            throw error;
        }
    }
}

export default new HarvestEngine();
