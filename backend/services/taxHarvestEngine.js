import taxLotService from './taxLotService.js';
import washSaleTracker from './washSaleTracker.js';
import taxAnalytics from '../utils/taxAnalytics.js';
import db from '../config/db.js';
import { assetCorrelationMatrix, harvestEvents, vaults } from '../db/schema.js';
import { eq, and, gt, desc, inArray } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * TaxHarvestEngine (#482)
 * Orchestrates multi-entity tax loss harvesting based on specific lot identification.
 */
class TaxHarvestEngine {
    constructor() {
        this.GLOBAL_THRESHOLD_USD = 1000; // Total combined loss across all entities to trigger
    }

    /**
     * Scans all entities for harvesting opportunities.
     * Aggregates by asset symbol across all vaults.
     */
    async scanOpportunities(userId, currentPrices) {
        logInfo(`🔍 Scanning complex tax harvest opportunities for user ${userId}`);

        const positions = await taxLotService.getUnrealizedPositions(userId, currentPrices);

        // Group positions by asset to see total "Harvestable Pot"
        const assetGroups = positions.reduce((acc, pos) => {
            if (pos.unrealizedPL < 0) {
                if (!acc[pos.assetSymbol]) acc[pos.assetSymbol] = { totalLoss: 0, items: [] };
                acc[pos.assetSymbol].totalLoss += Math.abs(pos.unrealizedPL);
                acc[pos.assetSymbol].items.push(pos);
            }
            return acc;
        }, {});

        const recommended = [];

        for (const [symbol, group] of Object.entries(assetGroups)) {
            // Check if combined loss is worth the efficacy test
            const taxBenefit = taxAnalytics.calculateSavings(group.totalLoss);

            if (group.totalLoss >= this.GLOBAL_THRESHOLD_USD) {
                const proxy = await this.findProxyAsset(symbol);

                recommended.push({
                    assetSymbol: symbol,
                    totalLoss: group.totalLoss,
                    lotCount: group.items.length,
                    taxBenefitEstimate: taxBenefit,
                    recommendedProxy: proxy?.proxyAssetSymbol || 'CASH',
                    correlation: proxy?.correlationCoefficient || 0,
                    involvedVaults: [...new Set(group.items.map(i => i.vaultId))]
                });
            }
        }

        return recommended;
    }

    /**
     * Executes a coordinated harvest across multiple entities.
     */
    async executeCoordinatedHarvest(userId, assetSymbol, currentPrice) {
        logInfo(`💎 Executing coordinated multi-entity harvest for ${assetSymbol}`);

        try {
            // 1. Get all loss lots for this asset
            const positions = await taxLotService.getUnrealizedPositions(userId, { [assetSymbol]: currentPrice });
            const lossLots = positions.filter(p => p.assetSymbol === assetSymbol && p.unrealizedPL < 0);

            if (lossLots.length === 0) return { success: false, message: 'No loss lots found' };

            // 2. Identify lots specifically (HIFO across entities)
            const processedSales = [];
            for (const lot of lossLots) {
                const sold = await taxLotService.processSale([{ ...lot, sellQuantity: lot.quantity }], currentPrice);
                processedSales.push(...sold);
            }

            // 3. Register global wash-sale window
            await washSaleTracker.registerHarvestEvent(userId, assetSymbol);

            // 4. Record the global event
            const totalLoss = processedSales.reduce((acc, l) => {
                const cost = parseFloat(l.purchasePrice) * parseFloat(l.quantity);
                const proceeds = parseFloat(l.soldPrice) * parseFloat(l.quantity);
                return acc + (proceeds - cost);
            }, 0);

            const [event] = await db.insert(harvestEvents).values({
                userId,
                assetSymbol,
                totalLossHarvested: Math.abs(totalLoss).toString(),
                status: 'completed',
                metadata: {
                    coordinated: true,
                    vaultCount: [...new Set(lossLots.map(l => l.vaultId))].length,
                    lotIds: processedSales.map(l => l.id)
                }
            }).returning();

            return {
                success: true,
                eventId: event.id,
                totalLoss: Math.abs(totalLoss),
                message: `Harvested ${processedSales.length} lots across multiple entities.`
            };

        } catch (err) {
            logError('Coordinated harvest failed:', err);
            throw err;
        }
    }

    /**
     * Finds a highly correlated asset.
     */
    async findProxyAsset(assetSymbol) {
        return await db.query.assetCorrelationMatrix.findFirst({
            where: eq(assetCorrelationMatrix.baseAssetSymbol, assetSymbol),
            orderBy: desc(assetCorrelationMatrix.correlationCoefficient)
        });
    }
}

export default new TaxHarvestEngine();
