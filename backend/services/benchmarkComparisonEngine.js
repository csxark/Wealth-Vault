// Benchmark Comparison Engine - Compare portfolio performance against benchmarks
// Issue #653: Advanced Portfolio Analytics & Performance Attribution

import { db } from '../db/index.js';
import { benchmarkComparisons, benchmarkPrices, portfolioSnapshots, performanceMetrics } from '../db/schema.js';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import fetch from 'node-fetch';

class BenchmarkComparisonEngine {
    constructor() {
        // Yahoo Finance API (free tier)
        this.yahooFinanceBaseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

        // Major benchmarks
        this.benchmarks = {
            '^GSPC': { name: 'S&P 500', description: 'Large-cap U.S. equities' },
            '^RUT': { name: 'Russell 2000', description: 'Small-cap U.S. equities' },
            '^NDX': { name: 'NASDAQ-100', description: 'Tech-heavy U.S. equities' },
            'URTH': { name: 'MSCI World', description: 'Global developed markets' },
            'AGG': { name: 'Total Bond Market', description: 'U.S. investment-grade bonds' },
            'BTC-USD': { name: 'Bitcoin', description: 'Cryptocurrency' },
        };

        // Risk-free rate
        this.riskFreeRate = 0.045;
    }

    /**
     * Compare portfolio against benchmark
     * @param {string} userId - User ID
     * @param {string} benchmarkSymbol - Benchmark symbol
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @returns {object} Comparison results
     */
    async compareAgainstBenchmark(userId, benchmarkSymbol, periodStart, periodEnd, vaultId = null) {
        try {
            // Fetch benchmark prices if not available
            await this.fetchBenchmarkPrices(benchmarkSymbol, periodStart, periodEnd);

            // Get portfolio snapshots
            const portfolioSnapshots = await this.getPortfolioSnapshots(userId, periodStart, periodEnd, vaultId);
            
            if (portfolioSnapshots.length < 2) {
                throw new Error('Insufficient portfolio data');
            }

            // Get benchmark prices
            const benchmarkData = await this.getBenchmarkPrices(benchmarkSymbol, periodStart, periodEnd);
            
            if (benchmarkData.length < 2) {
                throw new Error('Insufficient benchmark data');
            }

            // Calculate returns
            const portfolioReturns = this.calculateReturns(portfolioSnapshots, 'totalValue');
            const benchmarkReturns = this.calculateReturns(benchmarkData, 'closePrice');

            // Align data points
            const { alignedPortfolio, alignedBenchmark } = this.alignReturns(portfolioReturns, benchmarkReturns);

            // Calculate comparison metrics
            const relativeReturn = this.calculateRelativeReturn(portfolioSnapshots, benchmarkData);
            const trackingError = this.calculateTrackingError(alignedPortfolio, alignedBenchmark);
            const correlation = this.calculateCorrelation(alignedPortfolio, alignedBenchmark);
            const { upCapture, downCapture } = this.calculateCaptureRatios(alignedPortfolio, alignedBenchmark);
            const informationRatio = this.calculateInformationRatio(relativeReturn, trackingError);

            // Calculate beta and alpha
            const beta = this.calculateBeta(alignedPortfolio, alignedBenchmark);
            
            const portfolioTotalReturn = (parseFloat(portfolioSnapshots[portfolioSnapshots.length - 1].totalValue) 
                - parseFloat(portfolioSnapshots[0].totalValue)) / parseFloat(portfolioSnapshots[0].totalValue);
            
            const benchmarkTotalReturn = (parseFloat(benchmarkData[benchmarkData.length - 1].closePrice) 
                - parseFloat(benchmarkData[0].closePrice)) / parseFloat(benchmarkData[0].closePrice);

            const alpha = portfolioTotalReturn - (this.riskFreeRate + beta * (benchmarkTotalReturn - this.riskFreeRate));

            // Store comparison results
            const [comparison] = await db.insert(benchmarkComparisons).values({
                userId,
                vaultId,
                benchmarkSymbol,
                periodType: this.determinePeriodType(periodStart, periodEnd),
                periodStart,
                periodEnd,
                relativeReturn,
                trackingError,
                informationRatio,
                beta,
                alpha,
                correlation,
                upCapture,
                downCapture,
            }).returning();

            return {
                success: true,
                comparison,
                details: {
                    benchmark: this.benchmarks[benchmarkSymbol],
                    portfolioReturn: portfolioTotalReturn * 100,
                    benchmarkReturn: benchmarkTotalReturn * 100,
                    relativeReturn: relativeReturn * 100,
                    tracking: {
                        error: trackingError * 100,
                        informationRatio,
                    },
                    correlation: {
                        coefficient: correlation,
                        strength: this.interpretCorrelation(correlation),
                    },
                    marketRelation: {
                        beta,
                        alpha: alpha * 100,
                        alphaInterpretation: alpha > 0 ? 'Outperforming' : 'Underperforming',
                    },
                    captureRatios: {
                        upCapture: upCapture * 100,
                        downCapture: downCapture * 100,
                        asymmetry: upCapture - downCapture,
                    },
                },
            };

        } catch (error) {
            console.error('Error comparing against benchmark:', error);
            throw error;
        }
    }

    /**
     * Fetch benchmark prices from Yahoo Finance
     */
    async fetchBenchmarkPrices(benchmarkSymbol, periodStart, periodEnd) {
        try {
            // Check if we already have data
            const existingData = await db.select()
                .from(benchmarkPrices)
                .where(and(
                    eq(benchmarkPrices.benchmarkSymbol, benchmarkSymbol),
                    gte(benchmarkPrices.priceDate, periodStart),
                    lte(benchmarkPrices.priceDate, periodEnd)
                ))
                .limit(1);

            if (existingData.length > 0) {
                console.log(`Benchmark data already exists for ${benchmarkSymbol}`);
                return;
            }

            // Convert dates to Unix timestamps
            const startTimestamp = Math.floor(new Date(periodStart).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(periodEnd).getTime() / 1000);

            // Fetch from Yahoo Finance
            const url = `${this.yahooFinanceBaseUrl}/${benchmarkSymbol}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (!data.chart || !data.chart.result || !data.chart.result[0]) {
                console.warn(`No data returned from Yahoo Finance for ${benchmarkSymbol}`);
                return;
            }

            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const quotes = result.indicators.quote[0];

            // Insert prices
            const pricesToInsert = [];
            for (let i = 0; i < timestamps.length; i++) {
                const date = new Date(timestamps[i] * 1000);
                
                pricesToInsert.push({
                    benchmarkSymbol,
                    priceDate: date,
                    openPrice: quotes.open[i]?.toString() || '0',
                    highPrice: quotes.high[i]?.toString() || '0',
                    lowPrice: quotes.low[i]?.toString() || '0',
                    closePrice: quotes.close[i]?.toString() || '0',
                    volume: quotes.volume[i]?.toString() || '0',
                });
            }

            if (pricesToInsert.length > 0) {
                await db.insert(benchmarkPrices).values(pricesToInsert);
                console.log(`Inserted ${pricesToInsert.length} benchmark prices for ${benchmarkSymbol}`);
            }

        } catch (error) {
            console.error(`Error fetching benchmark prices for ${benchmarkSymbol}:`, error);
            // Don't throw - allow comparison to continue with existing data
        }
    }

    /**
     * Get portfolio snapshots
     */
    async getPortfolioSnapshots(userId, periodStart, periodEnd, vaultId = null) {
        const conditions = vaultId
            ? and(
                eq(portfolioSnapshots.userId, userId),
                eq(portfolioSnapshots.vaultId, vaultId),
                gte(portfolioSnapshots.snapshotDate, periodStart),
                lte(portfolioSnapshots.snapshotDate, periodEnd)
              )
            : and(
                eq(portfolioSnapshots.userId, userId),
                gte(portfolioSnapshots.snapshotDate, periodStart),
                lte(portfolioSnapshots.snapshotDate, periodEnd)
              );

        return await db.select()
            .from(portfolioSnapshots)
            .where(conditions)
            .orderBy(asc(portfolioSnapshots.snapshotDate));
    }

    /**
     * Get benchmark prices
     */
    async getBenchmarkPrices(benchmarkSymbol, periodStart, periodEnd) {
        return await db.select()
            .from(benchmarkPrices)
            .where(and(
                eq(benchmarkPrices.benchmarkSymbol, benchmarkSymbol),
                gte(benchmarkPrices.priceDate, periodStart),
                lte(benchmarkPrices.priceDate, periodEnd)
            ))
            .orderBy(asc(benchmarkPrices.priceDate));
    }

    /**
     * Calculate returns from price series
     */
    calculateReturns(dataPoints, valueField) {
        const returns = [];

        for (let i = 1; i < dataPoints.length; i++) {
            const prevValue = parseFloat(dataPoints[i - 1][valueField]);
            const currValue = parseFloat(dataPoints[i][valueField]);
            
            if (prevValue > 0) {
                returns.push({
                    date: dataPoints[i].snapshotDate || dataPoints[i].priceDate,
                    return: (currValue - prevValue) / prevValue,
                });
            }
        }

        return returns;
    }

    /**
     * Align portfolio and benchmark returns by date
     */
    alignReturns(portfolioReturns, benchmarkReturns) {
        const portfolioMap = new Map(portfolioReturns.map(r => [r.date.toISOString().split('T')[0], r.return]));
        const benchmarkMap = new Map(benchmarkReturns.map(r => [r.date.toISOString().split('T')[0], r.return]));

        const alignedPortfolio = [];
        const alignedBenchmark = [];

        for (const [date, portfolioReturn] of portfolioMap) {
            if (benchmarkMap.has(date)) {
                alignedPortfolio.push(portfolioReturn);
                alignedBenchmark.push(benchmarkMap.get(date));
            }
        }

        return { alignedPortfolio, alignedBenchmark };
    }

    /**
     * Calculate relative return (portfolio vs benchmark)
     */
    calculateRelativeReturn(portfolioSnapshots, benchmarkData) {
        const portfolioStart = parseFloat(portfolioSnapshots[0].totalValue);
        const portfolioEnd = parseFloat(portfolioSnapshots[portfolioSnapshots.length - 1].totalValue);
        const portfolioReturn = (portfolioEnd - portfolioStart) / portfolioStart;

        const benchmarkStart = parseFloat(benchmarkData[0].closePrice);
        const benchmarkEnd = parseFloat(benchmarkData[benchmarkData.length - 1].closePrice);
        const benchmarkReturn = (benchmarkEnd - benchmarkStart) / benchmarkStart;

        return portfolioReturn - benchmarkReturn;
    }

    /**
     * Calculate tracking error (volatility of excess returns)
     */
    calculateTrackingError(portfolioReturns, benchmarkReturns) {
        if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
            return 0;
        }

        // Calculate excess returns
        const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);

        // Calculate standard deviation of excess returns
        const mean = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
        const squaredDeviation = excessReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
        const variance = squaredDeviation / (excessReturns.length - 1);

        return Math.sqrt(variance);
    }

    /**
     * Calculate Information Ratio
     * IR = Relative Return / Tracking Error
     */
    calculateInformationRatio(relativeReturn, trackingError) {
        if (trackingError === 0) return 0;
        return relativeReturn / trackingError;
    }

    /**
     * Calculate correlation coefficient
     */
    calculateCorrelation(portfolioReturns, benchmarkReturns) {
        if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
            return 0;
        }

        const n = portfolioReturns.length;

        // Calculate means
        const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / n;
        const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / n;

        // Calculate covariance and standard deviations
        let covariance = 0;
        let portfolioVariance = 0;
        let benchmarkVariance = 0;

        for (let i = 0; i < n; i++) {
            const portfolioDiff = portfolioReturns[i] - portfolioMean;
            const benchmarkDiff = benchmarkReturns[i] - benchmarkMean;

            covariance += portfolioDiff * benchmarkDiff;
            portfolioVariance += Math.pow(portfolioDiff, 2);
            benchmarkVariance += Math.pow(benchmarkDiff, 2);
        }

        const portfolioStd = Math.sqrt(portfolioVariance / (n - 1));
        const benchmarkStd = Math.sqrt(benchmarkVariance / (n - 1));

        if (portfolioStd === 0 || benchmarkStd === 0) return 0;

        return covariance / ((n - 1) * portfolioStd * benchmarkStd);
    }

    /**
     * Calculate up and down capture ratios
     */
    calculateCaptureRatios(portfolioReturns, benchmarkReturns) {
        if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
            return { upCapture: 0, downCapture: 0 };
        }

        let upPortfolioSum = 0;
        let upBenchmarkSum = 0;
        let upCount = 0;

        let downPortfolioSum = 0;
        let downBenchmarkSum = 0;
        let downCount = 0;

        for (let i = 0; i < benchmarkReturns.length; i++) {
            if (benchmarkReturns[i] > 0) {
                // Up market
                upPortfolioSum += portfolioReturns[i];
                upBenchmarkSum += benchmarkReturns[i];
                upCount++;
            } else if (benchmarkReturns[i] < 0) {
                // Down market
                downPortfolioSum += portfolioReturns[i];
                downBenchmarkSum += benchmarkReturns[i];
                downCount++;
            }
        }

        const upCapture = upBenchmarkSum !== 0 ? upPortfolioSum / upBenchmarkSum : 0;
        const downCapture = downBenchmarkSum !== 0 ? downPortfolioSum / downBenchmarkSum : 0;

        return { upCapture, downCapture };
    }

    /**
     * Calculate beta
     */
    calculateBeta(portfolioReturns, benchmarkReturns) {
        if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
            return 1;
        }

        const n = portfolioReturns.length;

        // Calculate means
        const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / n;
        const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / n;

        // Calculate covariance
        let covariance = 0;
        for (let i = 0; i < n; i++) {
            covariance += (portfolioReturns[i] - portfolioMean) * (benchmarkReturns[i] - benchmarkMean);
        }
        covariance /= (n - 1);

        // Calculate benchmark variance
        let variance = 0;
        for (let i = 0; i < n; i++) {
            variance += Math.pow(benchmarkReturns[i] - benchmarkMean, 2);
        }
        variance /= (n - 1);

        return variance !== 0 ? covariance / variance : 1;
    }

    /**
     * Interpret correlation strength
     */
    interpretCorrelation(correlation) {
        const absCorr = Math.abs(correlation);
        
        if (absCorr > 0.9) return 'Very strong';
        if (absCorr > 0.7) return 'Strong';
        if (absCorr > 0.5) return 'Moderate';
        if (absCorr > 0.3) return 'Weak';
        return 'Very weak';
    }

    /**
     * Determine period type
     */
    determinePeriodType(startDate, endDate) {
        const days = Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
        
        if (days <= 1) return 'daily';
        if (days <= 7) return 'weekly';
        if (days <= 31) return 'monthly';
        if (days <= 92) return 'quarterly';
        if (days <= 365) return 'yearly';
        return 'custom';
    }

    /**
     * Get all benchmark comparisons for user
     */
    async getBenchmarkComparisons(userId, vaultId = null) {
        const conditions = vaultId
            ? and(eq(benchmarkComparisons.userId, userId), eq(benchmarkComparisons.vaultId, vaultId))
            : eq(benchmarkComparisons.userId, userId);

        const comparisons = await db.select()
            .from(benchmarkComparisons)
            .where(conditions)
            .orderBy(desc(benchmarkComparisons.periodEnd));

        return {
            success: true,
            comparisons: comparisons.map(c => ({
                ...c,
                benchmarkInfo: this.benchmarks[c.benchmarkSymbol],
            })),
        };
    }

    /**
     * Compare against multiple benchmarks
     */
    async compareAgainstMultipleBenchmarks(userId, benchmarkSymbols, periodStart, periodEnd, vaultId = null) {
        const results = [];

        for (const symbol of benchmarkSymbols) {
            try {
                const comparison = await this.compareAgainstBenchmark(userId, symbol, periodStart, periodEnd, vaultId);
                results.push(comparison);
            } catch (error) {
                console.error(`Error comparing against ${symbol}:`, error);
                results.push({
                    success: false,
                    benchmarkSymbol: symbol,
                    error: error.message,
                });
            }
        }

        return {
            success: true,
            comparisons: results,
        };
    }
}

export default new BenchmarkComparisonEngine();
