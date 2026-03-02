// Performance Attribution Service - Decompose portfolio returns
// Issue #653: Advanced Portfolio Analytics & Performance Attribution

import { db } from '../db/index.js';
import { 
    performanceAttributions, 
    portfolioSnapshots,
    sectorAllocations,
    geographicAllocations,
    investments,
    benchmarkPrices,
    benchmarkComparisons
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import marketData from './marketData.js';

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
                weightPercent: (data.totalBeginningValue / (await this.getPortfolioValue(userId, periodStart, vaultId))) * 100,
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

    /**
     * ISSUE #694: Calculate comprehensive risk metrics
     * Includes volatility, Sharpe ratio, max drawdown, beta, VaR, and CVaR
     * @param {string} userId - User ID
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @param {string} vaultId - Optional vault ID
     * @returns {object} Risk metrics
     */
    async calculateRiskMetrics(userId, periodStart, periodEnd, vaultId = null) {
        try {
            // Get portfolio snapshots time series
            const snapshots = await this.getPortfolioTimeSeries(userId, periodStart, periodEnd, vaultId);
            
            if (snapshots.length < 2) {
                return {
                    error: 'Insufficient data for risk calculation',
                    volatility: null,
                    sharpeRatio: null,
                    maxDrawdown: null,
                    beta: null,
                    var95: null,
                    cvar95: null
                };
            }

            // Calculate daily returns
            const returns = [];
            for (let i = 1; i < snapshots.length; i++) {
                const prevValue = parseFloat(snapshots[i - 1].totalValue);
                const currValue = parseFloat(snapshots[i].totalValue);
                if (prevValue > 0) {
                    returns.push((currValue - prevValue) / prevValue);
                }
            }

            if (returns.length === 0) {
                return {
                    error: 'No valid returns to calculate',
                    volatility: null,
                    sharpeRatio: null,
                    maxDrawdown: null,
                    beta: null,
                    var95: null,
                    cvar95: null
                };
            }

            // Calculate volatility (annualized standard deviation)
            const volatility = this.calculateStdDev(returns) * Math.sqrt(252); // 252 trading days

            // Calculate Sharpe Ratio
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const annualizedReturn = Math.pow(1 + avgReturn, 252) - 1;
            const riskFreeRate = 0.02; // Assume 2% risk-free rate
            const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;

            // Calculate Maximum Drawdown
            const maxDrawdown = this.calculateMaxDrawdown(snapshots);

            // Calculate Beta (portfolio sensitivity to market movements)
            const beta = await this.calculateBeta(userId, returns, periodStart, periodEnd);

            // Calculate Value at Risk (95% confidence interval)
            const sortedReturns = [...returns].sort((a, b) => a - b);
            const var95Index = Math.floor(returns.length * 0.05);
            const var95 = sortedReturns[var95Index] || 0;

            // Calculate Conditional VaR (expected loss beyond VaR threshold)
            const cvar95 = var95Index > 0 
                ? sortedReturns.slice(0, var95Index).reduce((a, b) => a + b, 0) / var95Index 
                : 0;

            // Calculate additional metrics
            const sortino = this.calculateSortinoRatio(returns, riskFreeRate);
            const calmar = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

            return {
                success: true,
                period: { start: periodStart, end: periodEnd },
                volatility: (volatility * 100).toFixed(2), // As percentage
                annualizedVolatility: (volatility * 100).toFixed(2),
                sharpeRatio: sharpeRatio.toFixed(3),
                sortinoRatio: sortino.toFixed(3),
                calmarRatio: calmar.toFixed(3),
                maxDrawdown: maxDrawdown.toFixed(2), // As percentage
                beta: beta.toFixed(3),
                var95: (var95 * 100).toFixed(2), // As percentage
                cvar95: (cvar95 * 100).toFixed(2), // As percentage
                avgDailyReturn: (avgReturn * 100).toFixed(4),
                annualizedReturn: (annualizedReturn * 100).toFixed(2),
                sampleSize: returns.length
            };
        } catch (error) {
            console.error('Error calculating risk metrics:', error);
            throw error;
        }
    }

    /**
     * Calculate standard deviation
     */
    calculateStdDev(values) {
        if (values.length === 0) return 0;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(variance);
    }

    /**
     * Calculate maximum drawdown
     */
    calculateMaxDrawdown(snapshots) {
        let maxDrawdown = 0;
        let peak = parseFloat(snapshots[0]?.totalValue || 0);

        for (const snapshot of snapshots) {
            const value = parseFloat(snapshot.totalValue);
            if (value > peak) {
                peak = value;
            }
            const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        return maxDrawdown;
    }

    /**
     * Calculate Sortino Ratio (similar to Sharpe but only considers downside volatility)
     */
    calculateSortinoRatio(returns, riskFreeRate) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const annualizedReturn = Math.pow(1 + avgReturn, 252) - 1;
        
        // Calculate downside deviation
        const downsideReturns = returns.filter(r => r < 0);
        if (downsideReturns.length === 0) return 0;
        
        const downsideDeviation = this.calculateStdDev(downsideReturns) * Math.sqrt(252);
        
        return downsideDeviation > 0 ? (annualizedReturn - riskFreeRate) / downsideDeviation : 0;
    }

    /**
     * Calculate Beta - sensitivity to market movements
     */
    async calculateBeta(userId, portfolioReturns, periodStart, periodEnd) {
        try {
            // Get S&P 500 as market proxy
            const marketReturns = await this.getBenchmarkReturns('SPY', periodStart, periodEnd);
            
            if (!marketReturns || marketReturns.length < 2) {
                return 1.0; // Default to market beta
            }

            // Align portfolio and market returns
            const minLength = Math.min(portfolioReturns.length, marketReturns.length);
            const alignedPortfolio = portfolioReturns.slice(0, minLength);
            const alignedMarket = marketReturns.slice(0, minLength);

            // Calculate covariance and market variance
            const portfolioAvg = alignedPortfolio.reduce((a, b) => a + b, 0) / minLength;
            const marketAvg = alignedMarket.reduce((a, b) => a + b, 0) / minLength;

            let covariance = 0;
            let marketVariance = 0;

            for (let i = 0; i < minLength; i++) {
                covariance += (alignedPortfolio[i] - portfolioAvg) * (alignedMarket[i] - marketAvg);
                marketVariance += Math.pow(alignedMarket[i] - marketAvg, 2);
            }

            covariance /= minLength;
            marketVariance /= minLength;

            return marketVariance > 0 ? covariance / marketVariance : 1.0;
        } catch (error) {
            console.error('Error calculating beta:', error);
            return 1.0; // Default to market beta
        }
    }

    /**
     * ISSUE #694: Compare portfolio performance to major benchmarks
     * Benchmarks include S&P 500, MSCI World, NASDAQ, bonds, gold, etc.
     * @param {string} userId - User ID
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @param {string} vaultId - Optional vault ID
     * @returns {object} Benchmark comparison results
     */
    async compareToBenchmarks(userId, periodStart, periodEnd, vaultId = null) {
        try {
            // Get portfolio performance
            const portfolioSnapshots = await this.getPortfolioTimeSeries(userId, periodStart, periodEnd, vaultId);
            
            if (portfolioSnapshots.length < 2) {
                return {
                    error: 'Insufficient portfolio data for comparison',
                    comparisons: []
                };
            }

            const startValue = parseFloat(portfolioSnapshots[0].totalValue);
            const endValue = parseFloat(portfolioSnapshots[portfolioSnapshots.length - 1].totalValue);
            const portfolioReturn = ((endValue - startValue) / startValue);

            // Define benchmarks to compare against
            const benchmarks = [
                { symbol: 'SPY', name: 'S&P 500' },
                { symbol: 'QQQ', name: 'NASDAQ 100' },
                { symbol: 'ACWI', name: 'MSCI World' },
                { symbol: 'EFA', name: 'MSCI EAFE' },
                { symbol: 'AGG', name: 'US Aggregate Bonds' },
                { symbol: 'GLD', name: 'Gold' },
                { symbol: 'VNQ', name: 'Real Estate (REITs)' },
                { symbol: 'BTC-USD', name: 'Bitcoin' }
            ];

            const comparisons = [];

            for (const benchmark of benchmarks) {
                try {
                    const benchmarkReturn = await this.getBenchmarkReturn(benchmark.symbol, periodStart, periodEnd);
                    const alpha = portfolioReturn - benchmarkReturn; // Excess return
                    
                    // Store comparison in database
                    await db.insert(benchmarkComparisons).values({
                        userId,
                        vaultId,
                        benchmarkSymbol: benchmark.symbol,
                        periodStart,
                        periodEnd,
                        portfolioReturn: portfolioReturn.toString(),
                        benchmarkReturn: benchmarkReturn.toString(),
                        alpha: alpha.toString(),
                        trackingError: '0', // Can calculate if needed
                        informationRatio: '0', // Can calculate if needed
                        metadata: {
                            benchmarkName: benchmark.name,
                            calculatedAt: new Date()
                        }
                    }).onConflictDoNothing();

                    comparisons.push({
                        benchmark: benchmark.name,
                        symbol: benchmark.symbol,
                        portfolioReturn: (portfolioReturn * 100).toFixed(2),
                        benchmarkReturn: (benchmarkReturn * 100).toFixed(2),
                        alpha: (alpha * 100).toFixed(2),
                        outperforming: portfolioReturn > benchmarkReturn,
                        relativePerformance: benchmarkReturn !== 0 
                            ? ((portfolioReturn / benchmarkReturn - 1) * 100).toFixed(2)
                            : 'N/A'
                    });
                } catch (benchmarkError) {
                    console.error(`Error comparing to ${benchmark.symbol}:`, benchmarkError);
                    comparisons.push({
                        benchmark: benchmark.name,
                        symbol: benchmark.symbol,
                        error: 'Data unavailable'
                    });
                }
            }

            // Sort by alpha (best performing comparisons first)
            comparisons.sort((a, b) => {
                const alphaA = parseFloat(a.alpha) || 0;
                const alphaB = parseFloat(b.alpha) || 0;
                return alphaB - alphaA;
            });

            return {
                success: true,
                period: { start: periodStart, end: periodEnd },
                portfolioReturn: (portfolioReturn * 100).toFixed(2),
                comparisons
            };
        } catch (error) {
            console.error('Error comparing to benchmarks:', error);
            throw error;
        }
    }

    /**
     * Get benchmark return for specified period
     */
    async getBenchmarkReturn(symbol, startDate, endDate) {
        try {
            // Check if we have cached data
            const cachedPrices = await db.select()
                .from(benchmarkPrices)
                .where(and(
                    eq(benchmarkPrices.benchmarkSymbol, symbol),
                    gte(benchmarkPrices.priceDate, startDate),
                    lte(benchmarkPrices.priceDate, endDate)
                ))
                .orderBy(benchmarkPrices.priceDate);

            if (cachedPrices.length >= 2) {
                const startPrice = parseFloat(cachedPrices[0].closePrice);
                const endPrice = parseFloat(cachedPrices[cachedPrices.length - 1].closePrice);
                return (endPrice - startPrice) / startPrice;
            }

            // Fetch from market data service if not cached
            const historicalData = await marketData.getHistoricalPrices(symbol, startDate, endDate);
            
            if (!historicalData || historicalData.length < 2) {
                throw new Error(`Insufficient data for ${symbol}`);
            }

            // Cache the data
            for (const dataPoint of historicalData) {
                await db.insert(benchmarkPrices).values({
                    benchmarkSymbol: symbol,
                    benchmarkName: symbol, // Can be enhanced with full names
                    priceDate: new Date(dataPoint.date),
                    openPrice: dataPoint.open?.toString() || '0',
                    closePrice: dataPoint.close.toString(),
                    highPrice: dataPoint.high?.toString() || dataPoint.close.toString(),
                    lowPrice: dataPoint.low?.toString() || dataPoint.close.toString(),
                    volume: dataPoint.volume?.toString() || '0',
                    adjustedClose: dataPoint.adjustedClose?.toString() || dataPoint.close.toString(),
                    metadata: {}
                }).onConflictDoNothing();
            }

            const startPrice = historicalData[0].close;
            const endPrice = historicalData[historicalData.length - 1].close;
            return (endPrice - startPrice) / startPrice;
        } catch (error) {
            console.error(`Error getting benchmark return for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * Get benchmark returns as time series
     */
    async getBenchmarkReturns(symbol, startDate, endDate) {
        try {
            const prices = await db.select()
                .from(benchmarkPrices)
                .where(and(
                    eq(benchmarkPrices.benchmarkSymbol, symbol),
                    gte(benchmarkPrices.priceDate, startDate),
                    lte(benchmarkPrices.priceDate, endDate)
                ))
                .orderBy(benchmarkPrices.priceDate);

            if (prices.length < 2) {
                // Try to fetch and cache
                await this.getBenchmarkReturn(symbol, startDate, endDate);
                // Retry query
                const retryPrices = await db.select()
                    .from(benchmarkPrices)
                    .where(and(
                        eq(benchmarkPrices.benchmarkSymbol, symbol),
                        gte(benchmarkPrices.priceDate, startDate),
                        lte(benchmarkPrices.priceDate, endDate)
                    ))
                    .orderBy(benchmarkPrices.priceDate);
                    
                if (retryPrices.length < 2) {
                    return null;
                }
                
                return this.calculateReturnsFromPrices(retryPrices);
            }

            return this.calculateReturnsFromPrices(prices);
        } catch (error) {
            console.error(`Error getting benchmark returns for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Calculate returns from price series
     */
    calculateReturnsFromPrices(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const prevPrice = parseFloat(prices[i - 1].closePrice);
            const currPrice = parseFloat(prices[i].closePrice);
            if (prevPrice > 0) {
                returns.push((currPrice - prevPrice) / prevPrice);
            }
        }
        return returns;
    }

    /**
     * Get portfolio time series data
     */
    async getPortfolioTimeSeries(userId, startDate, endDate, vaultId = null) {
        const conditions = vaultId
            ? and(
                eq(portfolioSnapshots.userId, userId),
                eq(portfolioSnapshots.vaultId, vaultId),
                gte(portfolioSnapshots.snapshotDate, startDate),
                lte(portfolioSnapshots.snapshotDate, endDate)
              )
            : and(
                eq(portfolioSnapshots.userId, userId),
                gte(portfolioSnapshots.snapshotDate, startDate),
                lte(portfolioSnapshots.snapshotDate, endDate)
              );

        const snapshots = await db.select()
            .from(portfolioSnapshots)
            .where(conditions)
            .orderBy(portfolioSnapshots.snapshotDate);

        return snapshots;
    }

    /**
     * ISSUE #694: Analyze historical performance trends
     * Identifies patterns in portfolio growth, momentum, and volatility changes
     * @param {string} userId - User ID
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @param {string} vaultId - Optional vault ID
     * @returns {object} Performance trends analysis
     */
    async analyzePerformanceTrends(userId, periodStart, periodEnd, vaultId = null) {
        try {
            const snapshots = await this.getPortfolioTimeSeries(userId, periodStart, periodEnd, vaultId);

            if (snapshots.length < 30) {
                return {
                    error: 'Insufficient data for trend analysis (minimum 30 days required)',
                    trend: 'insufficient_data'
                };
            }

            // Calculate returns
            const returns = [];
            for (let i = 1; i < snapshots.length; i++) {
                const prevValue = parseFloat(snapshots[i - 1].totalValue);
                const currValue = parseFloat(snapshots[i].totalValue);
                if (prevValue > 0) {
                    returns.push((currValue - prevValue) / prevValue);
                }
            }

            // Analyze 30-day and 90-day trends
            const recent30 = returns.slice(-Math.min(30, returns.length));
            const recent90 = returns.slice(-Math.min(90, returns.length));

            const trend30 = this.calculateLinearTrend(recent30);
            const trend90 = this.calculateLinearTrend(recent90);
            const momentum = trend30 - trend90;

            // Calculate volatility trends
            const volatility30 = this.calculateStdDev(recent30);
            const volatility90 = this.calculateStdDev(recent90);

            let volatilityTrend = 'stable';
            if (volatility30 > volatility90 * 1.2) {
                volatilityTrend = 'increasing';
            } else if (volatility30 < volatility90 * 0.8) {
                volatilityTrend = 'decreasing';
            }

            // Calculate rolling metrics
            const rollingReturns = this.calculateRollingReturns(returns, 30);
            const rollingVolatility = this.calculateRollingVolatility(returns, 30);

            // Identify regime changes (bull vs bear markets)
            const regime = this.identifyMarketRegime(returns);

            return {
                success: true,
                period: { start: periodStart, end: periodEnd },
                trend: trend30 > 0 ? 'upward' : 'downward',
                trend30Day: (trend30 * 100).toFixed(4),
                trend90Day: (trend90 * 100).toFixed(4),
                momentum: (momentum * 100).toFixed(4),
                momentumSignal: momentum > 0.001 ? 'accelerating' : momentum < -0.001 ? 'decelerating' : 'stable',
                volatilityTrend,
                volatility30Day: (volatility30 * 100).toFixed(3),
                volatility90Day: (volatility90 * 100).toFixed(3),
                regime,
                rollingMetrics: {
                    returns: rollingReturns.slice(-10), // Last 10 periods
                    volatility: rollingVolatility.slice(-10)
                }
            };
        } catch (error) {
            console.error('Error analyzing performance trends:', error);
            throw error;
        }
    }

    /**
     * Calculate linear trend using least squares
     */
    calculateLinearTrend(data) {
        const n = data.length;
        if (n < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }

    /**
     * Calculate rolling returns
     */
    calculateRollingReturns(returns, window) {
        const rolling = [];
        for (let i = window; i < returns.length; i++) {
            const windowReturns = returns.slice(i - window, i);
            const cumulativeReturn = windowReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
            rolling.push(cumulativeReturn);
        }
        return rolling;
    }

    /**
     * Calculate rolling volatility
     */
    calculateRollingVolatility(returns, window) {
        const rolling = [];
        for (let i = window; i < returns.length; i++) {
            const windowReturns = returns.slice(i - window, i);
            const volatility = this.calculateStdDev(windowReturns);
            rolling.push(volatility);
        }
        return rolling;
    }

    /**
     * Identify market regime (bull/bear/sideways)
     */
    identifyMarketRegime(returns) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const volatility = this.calculateStdDev(returns);

        // Calculate percentage of positive days
        const positiveDays = returns.filter(r => r > 0).length;
        const positiveRatio = positiveDays / returns.length;

        if (avgReturn > volatility * 0.5 && positiveRatio > 0.55) {
            return 'bull_market';
        } else if (avgReturn < -volatility * 0.5 && positiveRatio < 0.45) {
            return 'bear_market';
        } else {
            return 'sideways_market';
        }
    }
}

export default new PerformanceAttributionService();
