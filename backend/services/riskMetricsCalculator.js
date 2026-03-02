// Risk Metrics Calculator - Calculate portfolio risk measures
// Issue #653: Advanced Portfolio Analytics & Performance Attribution

import { db } from '../db/index.js';
import { riskMetrics, portfolioSnapshots, performanceMetrics, benchmarkPrices } from '../db/schema.js';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';

class RiskMetricsCalculator {
    constructor() {
        // Risk-free rate (3-month Treasury yield, 2026 estimate)
        this.riskFreeRate = 0.045; // 4.5%

        // Trading days per year
        this.tradingDaysPerYear = 252;
    }

    /**
     * Calculate all risk metrics for a period
     * @param {string} userId - User ID
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @returns {object} Risk metrics
     */
    async calculateRiskMetrics(userId, periodStart, periodEnd, vaultId = null, benchmarkSymbol = '^GSPC') {
        try {
            // Get daily snapshots for the period
            const snapshots = await this.getDailySnapshots(userId, periodStart, periodEnd, vaultId);

            if (snapshots.length < 10) {
                throw new Error('Insufficient data for risk calculations (minimum 10 days required)');
            }

            // Calculate daily returns
            const returns = this.calculateDailyReturns(snapshots);

            // Calculate volatility metrics
            const volatility = this.calculateVolatility(returns);
            const downsideDeviation = this.calculateDownsideDeviation(returns);

            // Get portfolio return
            const portfolioReturn = await this.getPortfolioReturn(userId, periodStart, periodEnd, vaultId);

            // Calculate Sharpe and Sortino ratios
            const sharpeRatio = this.calculateSharpeRatio(portfolioReturn, volatility);
            const sortinoRatio = this.calculateSortinoRatio(portfolioReturn, downsideDeviation);

            // Calculate maximum drawdown
            const drawdownMetrics = this.calculateMaxDrawdown(snapshots);

            // Calculate beta and alpha
            const { beta, alpha } = await this.calculateBetaAlpha(
                userId, periodStart, periodEnd, vaultId, benchmarkSymbol
            );

            // Calculate VaR and CVaR
            const var95 = this.calculateVaR(returns, 0.95, snapshots[snapshots.length - 1].totalValue);
            const cvar95 = this.calculateCVaR(returns, 0.95, snapshots[snapshots.length - 1].totalValue);

            // Calculate Calmar ratio
            const calmarRatio = this.calculateCalmarRatio(portfolioReturn, Math.abs(drawdownMetrics.maxDrawdown));

            // Store in database
            const [storedMetrics] = await db.insert(riskMetrics).values({
                userId,
                vaultId,
                periodType: this.determinePeriodType(periodStart, periodEnd),
                periodStart,
                periodEnd,
                volatility,
                downsideDeviation,
                sharpeRatio,
                sortinoRatio,
                maxDrawdown: drawdownMetrics.maxDrawdown,
                maxDrawdownStart: drawdownMetrics.startDate,
                maxDrawdownEnd: drawdownMetrics.endDate,
                maxDrawdownRecoveryDate: drawdownMetrics.recoveryDate,
                currentDrawdown: drawdownMetrics.currentDrawdown,
                beta,
                alpha,
                var95,
                cvar95,
                calmarRatio,
                riskFreeRate: this.riskFreeRate,
            }).returning();

            return {
                success: true,
                riskMetrics: storedMetrics,
                details: {
                    returns: {
                        portfolio: portfolioReturn,
                        annualized: portfolioReturn * (365 / this.getDaysDiff(periodStart, periodEnd)),
                    },
                    volatility: {
                        daily: volatility,
                        annualized: volatility * Math.sqrt(this.tradingDaysPerYear),
                    },
                    ratios: {
                        sharpe: sharpeRatio,
                        sortino: sortinoRatio,
                        calmar: calmarRatio,
                    },
                    drawdown: drawdownMetrics,
                    marketRelation: {
                        beta,
                        alpha,
                    },
                    valueAtRisk: {
                        var95,
                        cvar95,
                    },
                },
            };

        } catch (error) {
            console.error('Error calculating risk metrics:', error);
            throw error;
        }
    }

    /**
     * Get daily portfolio snapshots
     */
    async getDailySnapshots(userId, periodStart, periodEnd, vaultId = null) {
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
     * Calculate daily returns from snapshots
     */
    calculateDailyReturns(snapshots) {
        const returns = [];

        for (let i = 1; i < snapshots.length; i++) {
            const prevValue = parseFloat(snapshots[i - 1].totalValue);
            const currValue = parseFloat(snapshots[i].totalValue);
            const netCashFlow = parseFloat(snapshots[i].netDeposits) - parseFloat(snapshots[i - 1].netDeposits);

            // Simple return adjusted for cash flows
            const dailyReturn = (currValue - prevValue - netCashFlow) / prevValue;
            returns.push(dailyReturn);
        }

        return returns;
    }

    /**
     * Calculate volatility (standard deviation of returns)
     */
    calculateVolatility(returns) {
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const squaredDeviation = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
        const variance = squaredDeviation / (returns.length - 1);
        return Math.sqrt(variance);
    }

    /**
     * Calculate downside deviation (only negative returns)
     */
    calculateDownsideDeviation(returns) {
        const negativeReturns = returns.filter(r => r < 0);
        
        if (negativeReturns.length === 0) return 0;

        const mean = 0; // Target return for downside
        const squaredDeviation = negativeReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0);
        const variance = squaredDeviation / negativeReturns.length;
        return Math.sqrt(variance);
    }

    /**
     * Calculate Sharpe Ratio
     * Sharpe = (Portfolio Return - Risk-Free Rate) / Volatility
     */
    calculateSharpeRatio(portfolioReturn, volatility) {
        if (volatility === 0) return 0;

        const excessReturn = portfolioReturn - this.riskFreeRate;
        const annualizedVolatility = volatility * Math.sqrt(this.tradingDaysPerYear);
        
        return excessReturn / annualizedVolatility;
    }

    /**
     * Calculate Sortino Ratio
     * Sortino = (Portfolio Return - Risk-Free Rate) / Downside Deviation
     */
    calculateSortinoRatio(portfolioReturn, downsideDeviation) {
        if (downsideDeviation === 0) return 0;

        const excessReturn = portfolioReturn - this.riskFreeRate;
        const annualizedDownsideDeviation = downsideDeviation * Math.sqrt(this.tradingDaysPerYear);
        
        return excessReturn / annualizedDownsideDeviation;
    }

    /**
     * Calculate maximum drawdown
     */
    calculateMaxDrawdown(snapshots) {
        let peak = parseFloat(snapshots[0].totalValue);
        let peakDate = snapshots[0].snapshotDate;
        let maxDrawdown = 0;
        let maxDrawdownStart = null;
        let maxDrawdownEnd = null;
        let currentDrawdown = 0;
        let recoveryDate = null;

        for (let i = 0; i < snapshots.length; i++) {
            const value = parseFloat(snapshots[i].totalValue);

            // Update peak if we hit a new high
            if (value > peak) {
                peak = value;
                peakDate = snapshots[i].snapshotDate;
                
                // If we recovered from drawdown
                if (currentDrawdown < 0) {
                    recoveryDate = snapshots[i].snapshotDate;
                    currentDrawdown = 0;
                }
            }

            // Calculate current drawdown from peak
            const drawdown = (value - peak) / peak;

            if (drawdown < maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownStart = peakDate;
                maxDrawdownEnd = snapshots[i].snapshotDate;
            }

            // Track current drawdown
            if (drawdown < 0) {
                currentDrawdown = drawdown;
            }
        }

        return {
            maxDrawdown, // Negative value (e.g., -0.15 for 15% drawdown)
            startDate: maxDrawdownStart,
            endDate: maxDrawdownEnd,
            recoveryDate,
            currentDrawdown,
            percentDrawdown: Math.abs(maxDrawdown) * 100,
        };
    }

    /**
     * Calculate Beta and Alpha relative to benchmark
     */
    async calculateBetaAlpha(userId, periodStart, periodEnd, vaultId = null, benchmarkSymbol = '^GSPC') {
        try {
            // Get portfolio returns
            const portfolioSnapshots = await this.getDailySnapshots(userId, periodStart, periodEnd, vaultId);
            const portfolioReturns = this.calculateDailyReturns(portfolioSnapshots);

            // Get benchmark returns
            const benchmarkReturns = await this.getBenchmarkReturns(benchmarkSymbol, periodStart, periodEnd);

            if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
                return { beta: null, alpha: null };
            }

            // Calculate beta using covariance and variance
            const beta = this.calculateBeta(portfolioReturns, benchmarkReturns);

            // Calculate alpha
            const portfolioReturn = await this.getPortfolioReturn(userId, periodStart, periodEnd, vaultId);
            const benchmarkReturn = await this.getBenchmarkReturn(benchmarkSymbol, periodStart, periodEnd);
            
            const alpha = portfolioReturn - (this.riskFreeRate + beta * (benchmarkReturn - this.riskFreeRate));

            return { beta, alpha };

        } catch (error) {
            console.error('Error calculating beta/alpha:', error);
            return { beta: null, alpha: null };
        }
    }

    /**
     * Calculate beta (covariance / variance)
     */
    calculateBeta(portfolioReturns, benchmarkReturns) {
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

        return variance !== 0 ? covariance / variance : 0;
    }

    /**
     * Get benchmark returns for period
     */
    async getBenchmarkReturns(benchmarkSymbol, periodStart, periodEnd) {
        const prices = await db.select()
            .from(benchmarkPrices)
            .where(and(
                eq(benchmarkPrices.benchmarkSymbol, benchmarkSymbol),
                gte(benchmarkPrices.priceDate, periodStart),
                lte(benchmarkPrices.priceDate, periodEnd)
            ))
            .orderBy(asc(benchmarkPrices.priceDate));

        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const prevPrice = parseFloat(prices[i - 1].closePrice);
            const currPrice = parseFloat(prices[i].closePrice);
            returns.push((currPrice - prevPrice) / prevPrice);
        }

        return returns;
    }

    /**
     * Get benchmark return for period
     */
    async getBenchmarkReturn(benchmarkSymbol, periodStart, periodEnd) {
        const [startPrice] = await db.select()
            .from(benchmarkPrices)
            .where(and(
                eq(benchmarkPrices.benchmarkSymbol, benchmarkSymbol),
                gte(benchmarkPrices.priceDate, periodStart)
            ))
            .orderBy(asc(benchmarkPrices.priceDate))
            .limit(1);

        const [endPrice] = await db.select()
            .from(benchmarkPrices)
            .where(and(
                eq(benchmarkPrices.benchmarkSymbol, benchmarkSymbol),
                lte(benchmarkPrices.priceDate, periodEnd)
            ))
            .orderBy(desc(benchmarkPrices.priceDate))
            .limit(1);

        if (!startPrice || !endPrice) return 0;

        return (parseFloat(endPrice.closePrice) - parseFloat(startPrice.closePrice)) / parseFloat(startPrice.closePrice);
    }

    /**
     * Calculate Value at Risk (VaR) - 95% confidence
     */
    calculateVaR(returns, confidence, portfolioValue) {
        // Sort returns in ascending order
        const sortedReturns = [...returns].sort((a, b) => a - b);

        // Find the return at the (1 - confidence) percentile
        const index = Math.floor((1 - confidence) * sortedReturns.length);
        const varReturn = sortedReturns[index];

        // VaR in dollar terms
        return Math.abs(varReturn * portfolioValue);
    }

    /**
     * Calculate Conditional VaR (CVaR) - Expected loss beyond VaR
     */
    calculateCVaR(returns, confidence, portfolioValue) {
        // Sort returns in ascending order
        const sortedReturns = [...returns].sort((a, b) => a - b);

        // Find all returns worse than VaR threshold
        const index = Math.floor((1 - confidence) * sortedReturns.length);
        const tailReturns = sortedReturns.slice(0, index + 1);

        // Average of tail returns
        const avgTailReturn = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;

        // CVaR in dollar terms
        return Math.abs(avgTailReturn * portfolioValue);
    }

    /**
     * Calculate Calmar Ratio
     * Calmar = Annualized Return / Abs(Max Drawdown)
     */
    calculateCalmarRatio(annualReturn, maxDrawdown) {
        if (maxDrawdown === 0) return 0;
        return annualReturn / maxDrawdown;
    }

    /**
     * Get portfolio return for period
     */
    async getPortfolioReturn(userId, periodStart, periodEnd, vaultId = null) {
        const snapshots = await this.getDailySnapshots(userId, periodStart, periodEnd, vaultId);
        
        if (snapshots.length < 2) return 0;

        const startValue = parseFloat(snapshots[0].totalValue);
        const endValue = parseFloat(snapshots[snapshots.length - 1].totalValue);
        const netCashFlow = parseFloat(snapshots[snapshots.length - 1].netDeposits) - parseFloat(snapshots[0].netDeposits);

        return (endValue - startValue - netCashFlow) / startValue;
    }

    /**
     * Determine period type
     */
    determinePeriodType(startDate, endDate) {
        const days = this.getDaysDiff(startDate, endDate);
        
        if (days <= 1) return 'daily';
        if (days <= 7) return 'weekly';
        if (days <= 31) return 'monthly';
        if (days <= 92) return 'quarterly';
        if (days <= 365) return 'yearly';
        return 'custom';
    }

    /**
     * Get days difference
     */
    getDaysDiff(startDate, endDate) {
        return Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
    }

    /**
     * Get risk metrics summary
     */
    async getRiskMetricsSummary(userId, vaultId = null) {
        const conditions = vaultId
            ? and(eq(riskMetrics.userId, userId), eq(riskMetrics.vaultId, vaultId))
            : eq(riskMetrics.userId, userId);

        const metrics = await db.select()
            .from(riskMetrics)
            .where(conditions)
            .orderBy(desc(riskMetrics.periodEnd))
            .limit(1);

        if (metrics.length === 0) {
            return { success: false, message: 'No risk metrics found' };
        }

        return {
            success: true,
            metrics: metrics[0],
            interpretation: this.interpretRiskMetrics(metrics[0]),
        };
    }

    /**
     * Interpret risk metrics
     */
    interpretRiskMetrics(metrics) {
        const interpretations = [];

        // Sharpe Ratio
        const sharpe = parseFloat(metrics.sharpeRatio || 0);
        if (sharpe > 2) {
            interpretations.push('Excellent risk-adjusted returns (Sharpe > 2)');
        } else if (sharpe > 1) {
            interpretations.push('Good risk-adjusted returns (Sharpe > 1)');
        } else if (sharpe > 0) {
            interpretations.push('Positive risk-adjusted returns');
        } else {
            interpretations.push('Poor risk-adjusted returns (negative Sharpe)');
        }

        // Volatility
        const vol = parseFloat(metrics.volatility || 0) * Math.sqrt(252) * 100;
        if (vol < 10) {
            interpretations.push('Low volatility portfolio');
        } else if (vol < 20) {
            interpretations.push('Moderate volatility');
        } else {
            interpretations.push('High volatility portfolio');
        }

        // Max Drawdown
        const dd = Math.abs(parseFloat(metrics.maxDrawdown || 0)) * 100;
        if (dd < 10) {
            interpretations.push('Minimal drawdown risk');
        } else if (dd < 20) {
            interpretations.push('Moderate drawdown experienced');
        } else {
            interpretations.push('Significant drawdown risk');
        }

        return interpretations;
    }
}

export default new RiskMetricsCalculator();
