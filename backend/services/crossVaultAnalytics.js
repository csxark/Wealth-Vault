import db from '../config/db.js';
import { consolidatedSnapshots, consolidatedAnalytics, vaultGroups } from '../db/schema.js';
import { eq, and, desc, gte } from 'drizzle-orm';

/**
 * Cross-Vault Analytics Service
 * Provides deep insights across consolidated portfolios
 */
class CrossVaultAnalytics {
    /**
     * Generate comprehensive group analytics
     */
    async generateGroupAnalytics(groupId) {
        try {
            const types = ['asset_allocation', 'risk_exposure', 'yield_analysis', 'tax_efficiency'];
            const results = {};

            for (const type of types) {
                const analysis = await this.performAnalysis(groupId, type);

                const [record] = await db.insert(consolidatedAnalytics).values({
                    groupId,
                    analysisType: type,
                    analysisDate: new Date(),
                    data: analysis.data,
                    insights: analysis.insights,
                    timeframe: 'month'
                }).returning();

                results[type] = record;
            }

            return results;
        } catch (error) {
            console.error(`Failed to generate group analytics for ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Perform specific analysis type
     */
    async performAnalysis(groupId, type) {
        // Logic to calculate cross-vault metrics.
        // This is a placeholder for complex aggregation logic.

        const insights = [];
        let data = {};

        switch (type) {
            case 'asset_allocation':
                data = {
                    stocks: 0.65,
                    bonds: 0.20,
                    cash: 0.10,
                    crypto: 0.05
                };
                insights.push("Your portfolio is heavily weighted in equities (65%). Consider rebalancing if your risk tolerance has changed.");
                break;
            case 'risk_exposure':
                data = {
                    beta: 1.15,
                    maxDrawdown: -0.18,
                    var95: 0.04
                };
                insights.push("Correlation between your vaults is high (0.85), reducing the benefits of diversification.");
                break;
            case 'yield_analysis':
                data = {
                    weightedYield: 0.042,
                    dividendIncome: 12500,
                    rentalYield: 0.051
                };
                insights.push("Rental income from Vault B is currently outperforming your stock dividends in Vault A.");
                break;
            case 'tax_efficiency':
                data = {
                    taxLossHarvestingOpp: 4500,
                    qualifiedDividends: 0.80,
                    effectiveTaxRate: 0.18
                };
                insights.push("Possible tax loss harvesting opportunity identified in Vault C ($4,500).");
                break;
        }

        return { data, insights };
    }

    /**
     * Get historical performance comparison
     */
    async getPerformanceHistory(groupId, months = 12) {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        return await db.select()
            .from(consolidatedSnapshots)
            .where(
                and(
                    eq(consolidatedSnapshots.groupId, groupId),
                    gte(consolidatedSnapshots.snapshotDate, startDate)
                )
            )
            .orderBy(desc(consolidatedSnapshots.snapshotDate));
    }

    /**
     * Get latest insights for a group
     */
    async getGroupInsights(groupId) {
        return await db.select()
            .from(consolidatedAnalytics)
            .where(eq(consolidatedAnalytics.groupId, groupId))
            .orderBy(desc(consolidatedAnalytics.analysisDate))
            .limit(5);
    }
}

export default new CrossVaultAnalytics();
