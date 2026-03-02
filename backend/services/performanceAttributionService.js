// Performance Attribution Service - Decompose portfolio returns
// Issue #653: Advanced Portfolio Analytics & Performance Attribution

import { db } from '../db/index.js';
import { 
    performanceAttributions, 
    portfolioSnapshots,
    sectorAllocations,
    geographicAllocations,
    investments 
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

class PerformanceAttributionService {
    constructor() {
        // Sector mappings
        this.sectors = {
            technology: ['software', 'hardware', 'semiconductor', 'it services', 'cloud'],
            healthcare: ['pharmaceuticals', 'biotechnology', 'medical devices', 'healthcare services'],
            financials: ['banks', 'insurance', 'investment', 'financial services', 'fintech'],
            consumer_discretionary: ['retail', 'automotive', 'entertainment', 'media', 'travel'],
            consumer_staples: ['food', 'beverage', 'household products', 'tobacco'],
            industrials: ['aerospace', 'defense', 'construction', 'machinery', 'transportation'],
            energy: ['oil', 'gas', 'renewable energy', 'utilities'],
            materials: ['chemicals', 'metals', 'mining', 'paper', 'packaging'],
            real_estate: ['reit', 'real estate', 'property', 'housing'],
            utilities: ['electric', 'water', 'natural gas'],
            communications: ['telecom', 'media', 'social media', 'internet'],
        };

        // Asset class definitions
        this.assetClasses = {
            equities: ['stock', 'equity', 'shares'],
            fixed_income: ['bond', 'fixed income', 'treasury'],
            cash: ['cash', 'money market', 'savings'],
            crypto: ['crypto', 'bitcoin', 'ethereum', 'cryptocurrency'],
            real_estate: ['real estate', 'property', 'reit'],
            commodities: ['gold', 'silver', 'commodity', 'oil'],
            alternatives: ['hedge fund', 'private equity', 'venture capital'],
        };

        // Geographic regions
        this.regions = {
            north_america: ['usa', 'canada', 'mexico'],
            europe: ['uk', 'germany', 'france', 'italy', 'spain', 'netherlands'],
            asia: ['china', 'japan', 'india', 'south korea', 'singapore'],
            emerging_markets: ['brazil', 'russia', 'south africa', 'turkey', 'argentina'],
            oceania: ['australia', 'new zealand'],
        };
    }

    /**
     * Calculate performance attribution for a period
     * @param {string} userId - User ID
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @returns {object} Attribution breakdown
     */
    async calculateAttribution(userId, periodStart, periodEnd, vaultId = null) {
        try {
            // Get snapshots for the period
            const startSnapshot = await this.getSnapshotNear(userId, periodStart, vaultId);
            const endSnapshot = await this.getSnapshotNear(userId, periodEnd, vaultId);

            if (!startSnapshot || !endSnapshot) {
                throw new Error('Insufficient snapshot data for attribution');
            }

            // Calculate attributions by different dimensions
            const byAssetClass = await this.attributeByAssetClass(userId, periodStart, periodEnd, vaultId);
            const bySector = await this.attributeBySector(userId, periodStart, periodEnd, vaultId);
            const byHolding = await this.attributeByHolding(userId, periodStart, periodEnd, vaultId);
            const byGeography = await this.attributeByGeography(userId, periodStart, periodEnd, vaultId);

            const totalReturn = this.calculateTotalReturn(startSnapshot, endSnapshot);

            return {
                success: true,
                periodStart,
                periodEnd,
                totalReturn,
                byAssetClass,
                bySector,
                byHolding,
                byGeography,
                summary: {
                    beginningValue: parseFloat(startSnapshot.totalValue),
                    endingValue: parseFloat(endSnapshot.totalValue),
                    totalGain: parseFloat(endSnapshot.totalValue) - parseFloat(startSnapshot.totalValue),
                },
            };

        } catch (error) {
            console.error('Error calculating attribution:', error);
            throw error;
        }
    }

    /**
     * Get snapshot nearest to a date
     */
    async getSnapshotNear(userId, targetDate, vaultId = null) {
        const conditions = vaultId
            ? and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.vaultId, vaultId))
            : eq(portfolioSnapshots.userId, userId);

        const [snapshot] = await db.select()
            .from(portfolioSnapshots)
            .where(and(
                conditions,
                lte(portfolioSnapshots.snapshotDate, targetDate)
            ))
            .orderBy(desc(portfolioSnapshots.snapshotDate))
            .limit(1);

        return snapshot;
    }

    /**
     * Calculate total return between snapshots
     */
    calculateTotalReturn(startSnapshot, endSnapshot) {
        const startValue = parseFloat(startSnapshot.totalValue);
        const endValue = parseFloat(endSnapshot.totalValue);
        const netCashFlow = parseFloat(endSnapshot.netDeposits) - parseFloat(startSnapshot.netDeposits);

        // Simple return: (End - Start - Net Cash Flows) / Start
        return ((endValue - startValue - netCashFlow) / startValue);
    }

    /**
     * Attribute returns by asset class
     */
    async attributeByAssetClass(userId, periodStart, periodEnd, vaultId = null) {
        // Get all investments for user
        const userInvestments = await this.getUserInvestments(userId, vaultId);

        const assetClassAttribution = {};

        for (const investment of userInvestments) {
            const assetClass = this.classifyAssetClass(investment);
            
            if (!assetClassAttribution[assetClass]) {
                assetClassAttribution[assetClass] = {
                    holdings: [],
                    totalBeginningValue: 0,
                    totalEndingValue: 0,
                    totalGain: 0,
                    contributionToReturn: 0,
                };
            }

            // Calculate contribution for this holding
            const contribution = await this.calculateHoldingContribution(
                userId, investment, periodStart, periodEnd, vaultId
            );

            assetClassAttribution[assetClass].holdings.push(contribution);
            assetClassAttribution[assetClass].totalBeginningValue += contribution.beginningValue;
            assetClassAttribution[assetClass].totalEndingValue += contribution.endingValue;
            assetClassAttribution[assetClass].totalGain += contribution.gain;
            assetClassAttribution[assetClass].contributionToReturn += contribution.contributionToReturn;
        }

        // Store in database
        for (const [assetClass, data] of Object.entries(assetClassAttribution)) {
            await db.insert(performanceAttributions).values({
                userId,
                vaultId,
                periodStart,
                periodEnd,
                attributionType: 'asset_class',
                categoryName: assetClass,
                beginningValue: data.totalBeginningValue,
                endingValue: data.totalEndingValue,
                weightPercent: (data.totalBeginningValue / (await this.getPortfolioValue(userId, periodStart, vaultId))) * 100,
                contributionToReturn: data.contributionToReturn,
                details: { holdings: data.holdings },
            });
        }

        return assetClassAttribution;
    }

    /**
     * Attribute returns by sector
     */
    async attributeBySector(userId, periodStart, periodEnd, vaultId = null) {
        const userInvestments = await this.getUserInvestments(userId, vaultId);
        const sectorAttribution = {};

        for (const investment of userInvestments) {
            const sector = this.classifySector(investment);
            
            if (!sectorAttribution[sector]) {
                sectorAttribution[sector] = {
                    holdings: [],
                    totalBeginningValue: 0,
                    totalEndingValue: 0,
                    totalGain: 0,
                    contributionToReturn: 0,
                };
            }

            const contribution = await this.calculateHoldingContribution(
                userId, investment, periodStart, periodEnd, vaultId
            );

            sectorAttribution[sector].holdings.push(contribution);
            sectorAttribution[sector].totalBeginningValue += contribution.beginningValue;
            sectorAttribution[sector].totalEndingValue += contribution.endingValue;
            sectorAttribution[sector].totalGain += contribution.gain;
            sectorAttribution[sector].contributionToReturn += contribution.contributionToReturn;
        }

        // Store sector allocations
        const portfolioValue = await this.getPortfolioValue(userId, periodEnd, vaultId);
        for (const [sector, data] of Object.entries(sectorAttribution)) {
            await db.insert(sectorAllocations).values({
                userId,
                vaultId,
                allocationDate: periodEnd,
                sectorName: sector,
                allocationValue: data.totalEndingValue,
                allocationPercent: (data.totalEndingValue / portfolioValue) * 100,
                numberOfHoldings: data.holdings.length,
                topHoldings: data.holdings.slice(0, 5).map(h => ({
                    name: h.investmentName,
                    value: h.endingValue,
                })),
            });

            await db.insert(performanceAttributions).values({
                userId,
                vaultId,
                periodStart,
                periodEnd,
                attributionType: 'sector',
                categoryName: sector,
                beginningValue: data.totalBeginningValue,
                endingValue: data.totalEndingValue,
                weightPercent: (data.totalBeginningValue / (await this.getPortfolioValue(userId, periodStart, vaultId))) * 100,
                contributionToReturn: data.contributionToReturn,
                details: { holdings: data.holdings },
            });
        }

        return sectorAttribution;
    }

    /**
     * Attribute returns by individual holding
     */
    async attributeByHolding(userId, periodStart, periodEnd, vaultId = null) {
        const userInvestments = await this.getUserInvestments(userId, vaultId);
        const holdingAttributions = [];

        for (const investment of userInvestments) {
            const contribution = await this.calculateHoldingContribution(
                userId, investment, periodStart, periodEnd, vaultId
            );

            holdingAttributions.push(contribution);

            // Store in database
            await db.insert(performanceAttributions).values({
                userId,
                vaultId,
                periodStart,
                periodEnd,
                attributionType: 'holding',
                categoryName: investment.name || investment.symbol,
                beginningValue: contribution.beginningValue,
                endingValue: contribution.endingValue,
                weightPercent: contribution.weight,
                totalReturn: contribution.return,
                contributionToReturn: contribution.contributionToReturn,
                capitalGain: contribution.capitalGain,
                dividendIncome: contribution.dividendIncome || 0,
                details: { investment },
            });
        }

        return holdingAttributions.sort((a, b) => b.contributionToReturn - a.contributionToReturn);
    }

    /**
     * Attribute returns by geography
     */
    async attributeByGeography(userId, periodStart, periodEnd, vaultId = null) {
        const userInvestments = await this.getUserInvestments(userId, vaultId);
        const geoAttribution = {};

        for (const investment of userInvestments) {
            const region = this.classifyRegion(investment);
            
            if (!geoAttribution[region]) {
                geoAttribution[region] = {
                    holdings: [],
                    totalBeginningValue: 0,
                    totalEndingValue: 0,
                    totalGain: 0,
                    contributionToReturn: 0,
                };
            }

            const contribution = await this.calculateHoldingContribution(
                userId, investment, periodStart, periodEnd, vaultId
            );

            geoAttribution[region].holdings.push(contribution);
            geoAttribution[region].totalBeginningValue += contribution.beginningValue;
            geoAttribution[region].totalEndingValue += contribution.endingValue;
            geoAttribution[region].totalGain += contribution.gain;
            geoAttribution[region].contributionToReturn += contribution.contributionToReturn;
        }

        // Store geographic allocations
        const portfolioValue = await this.getPortfolioValue(userId, periodEnd, vaultId);
        for (const [region, data] of Object.entries(geoAttribution)) {
            await db.insert(geographicAllocations).values({
                userId,
                vaultId,
                allocationDate: periodEnd,
                region,
                allocationValue: data.totalEndingValue,
                allocationPercent: (data.totalEndingValue / portfolioValue) * 100,
                numberOfHoldings: data.holdings.length,
            });

            await db.insert(performanceAttributions).values({
                userId,
                vaultId,
                periodStart,
                periodEnd,
                attributionType: 'geographic',
                categoryName: region,
                beginningValue: data.totalBeginningValue,
                endingValue: data.totalEndingValue,
                weightPercent: (data.totalBeginningValue / (await this.getPortfolio Value(userId, periodStart, vaultId))) * 100,
                contributionToReturn: data.contributionToReturn,
                details: { holdings: data.holdings },
            });
        }

        return geoAttribution;
    }

    /**
     * Calculate contribution of a single holding
     */
    async calculateHoldingContribution(userId, investment, periodStart, periodEnd, vaultId = null) {
        // Simplified calculation - in production, would query actual position history
        const beginningValue = investment.currentValue * 0.95; // Estimate
        const endingValue = investment.currentValue;
        const gain = endingValue - beginningValue;
        const portfolioValue = await this.getPortfolioValue(userId, periodStart, vaultId);
        const weight = (beginningValue / portfolioValue) * 100;
        const holdingReturn = gain / beginningValue;
        const contributionToReturn = weight * holdingReturn / 100;

        return {
            investmentId: investment.id,
            investmentName: investment.name || investment.symbol,
            beginningValue,
            endingValue,
            gain,
            weight,
            return: holdingReturn,
            contributionToReturn,
            capitalGain: gain,
            dividendIncome: 0, // Would query dividend history
        };
    }

    /**
     * Get user's investments
     */
    async getUserInvestments(userId, vaultId = null) {
        const conditions = vaultId
            ? and(eq(investments.userId, userId), eq(investments.vaultId, vaultId))
            : eq(investments.userId, userId);

        return await db.select().from(investments).where(conditions);
    }

    /**
     * Get portfolio value at a date
     */
    async getPortfolioValue(userId, date, vaultId = null) {
        const snapshot = await this.getSnapshotNear(userId, date, vaultId);
        return snapshot ? parseFloat(snapshot.totalValue) : 0;
    }

    /**
     * Classify investment by asset class
     */
    classifyAssetClass(investment) {
        const type = (investment.type || '').toLowerCase();
        const name = (investment.name || '').toLowerCase();
        const symbol = (investment.symbol || '').toLowerCase();

        for (const [assetClass, keywords] of Object.entries(this.assetClasses)) {
            for (const keyword of keywords) {
                if (type.includes(keyword) || name.includes(keyword) || symbol.includes(keyword)) {
                    return assetClass;
                }
            }
        }

        return 'other';
    }

    /**
     * Classify investment by sector
     */
    classifySector(investment) {
        const sector = (investment.sector || '').toLowerCase();
        const industry = (investment.industry || '').toLowerCase();
        const name = (investment.name || '').toLowerCase();

        if (sector) {
            return sector;
        }

        for (const [sectorName, keywords] of Object.entries(this.sectors)) {
            for (const keyword of keywords) {
                if (industry.includes(keyword) || name.includes(keyword)) {
                    return sectorName;
                }
            }
        }

        return 'other';
    }

    /**
     * Classify investment by region
     */
    classifyRegion(investment) {
        const country = (investment.country || '').toLowerCase();
        const region = (investment.region || '').toLowerCase();

        if (region) {
            return region;
        }

        for (const [regionName, countries] of Object.entries(this.regions)) {
            for (const countryKeyword of countries) {
                if (country.includes(countryKeyword)) {
                    return regionName;
                }
            }
        }

        // Default to North America
        return 'north_america';
    }

    /**
     * Get attribution summary
     */
    async getAttributionSummary(userId, periodStart, periodEnd, vaultId = null) {
        const conditions = vaultId
            ? and(
                eq(performanceAttributions.userId, userId),
                eq(performanceAttributions.vaultId, vaultId),
                gte(performanceAttributions.periodEnd, periodStart),
                lte(performanceAttributions.periodEnd, periodEnd)
              )
            : and(
                eq(performanceAttributions.userId, userId),
                gte(performanceAttributions.periodEnd, periodStart),
                lte(performanceAttributions.periodEnd, periodEnd)
              );

        const attributions = await db.select()
            .from(performanceAttributions)
            .where(conditions);

        // Group by attribution type
        const grouped = {
            asset_class: [],
            sector: [],
            holding: [],
            geographic: [],
        };

        for (const attr of attributions) {
            if (grouped[attr.attributionType]) {
                grouped[attr.attributionType].push(attr);
            }
        }

        return {
            success: true,
            periodStart,
            periodEnd,
            attributions: grouped,
        };
    }
}

export default new PerformanceAttributionService();
