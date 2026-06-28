// Time-Weighted Returns Calculator - Calculate accurate portfolio performance
// Issue #653: Advanced Portfolio Analytics & Performance Attribution

import { db } from '../db/index.js';
import { performanceMetrics, portfolioSnapshots, transactions } from '../db/schema.js';
import { eq, and, gte, lte, desc, asc, or } from 'drizzle-orm';

class TimeWeightedReturnsCalculator {
    constructor() {
        // Trading days per year for annualization
        this.tradingDaysPerYear = 252;
    }

    /**
     * Calculate time-weighted return (TWR) for a period
     * Uses Modified Dietz method for sub-period calculations
     * @param {string} userId - User ID
     * @param {Date} periodStart - Start date
     * @param {Date} periodEnd - End date
     * @returns {object} Performance metrics
     */
    async calculateTimeWeightedReturn(userId, periodStart, periodEnd, vaultId = null) {
        try {
            // Get all transactions (cash flows) in period
            const cashFlows = await this.getCashFlows(userId, periodStart, periodEnd, vaultId);

            // Get portfolio snapshots
            const snapshots = await this.getPortfolioSnapshots(userId, periodStart, periodEnd, vaultId);

            if (snapshots.length < 2) {
                throw new Error('Insufficient data for TWR calculation (minimum 2 snapshots required)');
            }

            // Calculate TWR using Modified Dietz method
            const twr = this.calculateModifiedDietzReturn(snapshots, cashFlows, periodStart, periodEnd);

            // Calculate Money-Weighted Return (IRR)
            const mwr = this.calculateMoneyWeightedReturn(snapshots, cashFlows);

            // Annualize returns
            const days = this.getDaysDiff(periodStart, periodEnd);
            const annualizedTWR = this.annualizeReturn(twr, days);
            const annualizedMWR = this.annualizeReturn(mwr, days);

            // Calculate cumulative return
            const startValue = parseFloat(snapshots[0].totalValue);
            const endValue = parseFloat(snapshots[snapshots.length - 1].totalValue);
            const totalNetCashFlow = cashFlows.reduce((sum, cf) => sum + parseFloat(cf.amount), 0);
            const cumulativeReturn = (endValue - startValue - totalNetCashFlow) / startValue;

            // Calculate average daily return
            const dailyReturns = this.calculateDailyReturns(snapshots, cashFlows);
            const averageDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

            // Store metrics
            const [metrics] = await db.insert(performanceMetrics).values({
                userId,
                vaultId,
                periodType: this.determinePeriodType(periodStart, periodEnd),
                periodStart,
                periodEnd,
                timeWeightedReturn: twr,
                moneyWeightedReturn: mwr,
                annualizedReturn: annualizedTWR,
                cumulativeReturn,
                averageDailyReturn,
            }).returning();

            return {
                success: true,
                metrics,
                details: {
                    returns: {
                        timeWeighted: twr * 100,
                        moneyWeighted: mwr * 100,
                        cumulative: cumulativeReturn * 100,
                        annualized: annualizedTWR * 100,
                    },
                    values: {
                        start: startValue,
                        end: endValue,
                        gain: endValue - startValue,
                        netCashFlows: totalNetCashFlow,
                    },
                    performance: {
                        days,
                        dailyAverage: averageDailyReturn * 100,
                        interpretation: this.interpretPerformance(twr, mwr),
                    },
                },
            };

        } catch (error) {
            console.error('Error calculating time-weighted return:', error);
            throw error;
        }
    }

    /**
     * Calculate Modified Dietz Return
     * R = (MVE - MVB - CF) / (MVB + Σ(CF_i × W_i))
     * where W_i = (D - D_i) / D
     */
    calculateModifiedDietzReturn(snapshots, cashFlows, periodStart, periodEnd) {
        const startValue = parseFloat(snapshots[0].totalValue);
        const endValue = parseFloat(snapshots[snapshots.length - 1].totalValue);
        
        const totalDays = this.getDaysDiff(periodStart, periodEnd);
        
        // Calculate weighted cash flows
        let weightedCashFlows = 0;
        let totalCashFlows = 0;

        for (const cf of cashFlows) {
            const amount = parseFloat(cf.amount);
            const daysFromStart = this.getDaysDiff(periodStart, cf.date);
            const weight = (totalDays - daysFromStart) / totalDays;
            
            weightedCashFlows += amount * weight;
            totalCashFlows += amount;
        }

        // Modified Dietz formula
        const denominator = startValue + weightedCashFlows;
        
        if (denominator === 0) return 0;

        return (endValue - startValue - totalCashFlows) / denominator;
    }

    /**
     * Calculate Money-Weighted Return (approximation of IRR)
     * Uses simple IRR approximation for performance
     */
    calculateMoneyWeightedReturn(snapshots, cashFlows) {
        if (snapshots.length < 2) return 0;

        const startValue = parseFloat(snapshots[0].totalValue);
        const endValue = parseFloat(snapshots[snapshots.length - 1].totalValue);

        // Separate deposits and withdrawals
        const deposits = cashFlows.filter(cf => parseFloat(cf.amount) > 0);
        const withdrawals = cashFlows.filter(cf => parseFloat(cf.amount) < 0);

        const totalDeposits = deposits.reduce((sum, cf) => sum + parseFloat(cf.amount), 0);
        const totalWithdrawals = Math.abs(withdrawals.reduce((sum, cf) => sum + parseFloat(cf.amount), 0));

        // Simple MWR approximation
        const averageCapital = startValue + (totalDeposits / 2);
        
        if (averageCapital === 0) return 0;

        return (endValue - startValue - totalDeposits + totalWithdrawals) / averageCapital;
    }

    /**
     * Calculate daily returns
     */
    calculateDailyReturns(snapshots, cashFlows) {
        const returns = [];
        const cashFlowMap = new Map();

        // Map cash flows by date
        for (const cf of cashFlows) {
            const dateKey = cf.date.toISOString().split('T')[0];
            cashFlowMap.set(dateKey, (cashFlowMap.get(dateKey) || 0) + parseFloat(cf.amount));
        }

        for (let i = 1; i < snapshots.length; i++) {
            const prevValue = parseFloat(snapshots[i - 1].totalValue);
            const currValue = parseFloat(snapshots[i].totalValue);
            
            const dateKey = snapshots[i].snapshotDate.toISOString().split('T')[0];
            const cashFlow = cashFlowMap.get(dateKey) || 0;

            // Return adjusted for cash flows
            const dailyReturn = (currValue - prevValue - cashFlow) / (prevValue + (cashFlow / 2));
            returns.push(dailyReturn);
        }

        return returns;
    }

    /**
     * Annualize return
     */
    annualizeReturn(periodicReturn, days) {
        if (days === 0) return 0;
        
        // Geometric annualization: (1 + R)^(365/days) - 1
        return Math.pow(1 + periodicReturn, 365 / days) - 1;
    }

    /**
     * Get cash flows for period
     */
    async getCashFlows(userId, periodStart, periodEnd, vaultId = null) {
        const conditions = vaultId
            ? and(
                eq(transactions.userId, userId),
                eq(transactions.vaultId, vaultId),
                gte(transactions.date, periodStart),
                lte(transactions.date, periodEnd),
                or(
                    eq(transactions.type, 'deposit'),
                    eq(transactions.type, 'withdrawal'),
                    eq(transactions.type, 'transfer_in'),
                    eq(transactions.type, 'transfer_out')
                )
              )
            : and(
                eq(transactions.userId, userId),
                gte(transactions.date, periodStart),
                lte(transactions.date, periodEnd),
                or(
                    eq(transactions.type, 'deposit'),
                    eq(transactions.type, 'withdrawal'),
                    eq(transactions.type, 'transfer_in'),
                    eq(transactions.type, 'transfer_out')
                )
              );

        const cashFlowTransactions = await db.select()
            .from(transactions)
            .where(conditions)
            .orderBy(asc(transactions.date));

        // Normalize amounts (withdrawals should be negative)
        return cashFlowTransactions.map(t => ({
            ...t,
            amount: ['withdrawal', 'transfer_out'].includes(t.type) 
                ? -Math.abs(parseFloat(t.amount))
                : Math.abs(parseFloat(t.amount)),
        }));
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
     * Calculate returns for multiple periods (monthly, quarterly, yearly)
     */
    async calculateMultiPeriodReturns(userId, startDate, endDate, vaultId = null) {
        const periods = this.generatePeriods(startDate, endDate);
        const results = [];

        for (const period of periods) {
            try {
                const metrics = await this.calculateTimeWeightedReturn(
                    userId, 
                    period.start, 
                    period.end, 
                    vaultId
                );
                results.push({
                    period: period.label,
                    ...metrics,
                });
            } catch (error) {
                console.error(`Error calculating return for period ${period.label}:`, error);
            }
        }

        return {
            success: true,
            periods: results,
        };
    }

    /**
     * Generate period definitions (monthly, quarterly, yearly)
     */
    generatePeriods(startDate, endDate) {
        const periods = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Monthly periods
        let currentMonth = new Date(start.getFullYear(), start.getMonth(), 1);
        while (currentMonth <= end) {
            const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
            periods.push({
                label: currentMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
                type: 'monthly',
                start: new Date(Math.max(currentMonth, start)),
                end: new Date(Math.min(monthEnd, end)),
            });
            currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        }

        // Quarterly periods
        const quarters = [
            { months: [0, 1, 2], label: 'Q1' },
            { months: [3, 4, 5], label: 'Q2' },
            { months: [6, 7, 8], label: 'Q3' },
            { months: [9, 10, 11], label: 'Q4' },
        ];

        let year = start.getFullYear();
        while (year <= end.getFullYear()) {
            for (const q of quarters) {
                const quarterStart = new Date(year, q.months[0], 1);
                const quarterEnd = new Date(year, q.months[2] + 1, 0);
                
                if (quarterEnd >= start && quarterStart <= end) {
                    periods.push({
                        label: `${year} ${q.label}`,
                        type: 'quarterly',
                        start: new Date(Math.max(quarterStart, start)),
                        end: new Date(Math.min(quarterEnd, end)),
                    });
                }
            }
            year++;
        }

        // Yearly periods
        year = start.getFullYear();
        while (year <= end.getFullYear()) {
            const yearStart = new Date(year, 0, 1);
            const yearEnd = new Date(year, 11, 31);
            
            if (yearEnd >= start && yearStart <= end) {
                periods.push({
                    label: year.toString(),
                    type: 'yearly',
                    start: new Date(Math.max(yearStart, start)),
                    end: new Date(Math.min(yearEnd, end)),
                });
            }
            year++;
        }

        return periods;
    }

    /**
     * Get performance summary
     */
    async getPerformanceSummary(userId, vaultId = null) {
        const conditions = vaultId
            ? and(eq(performanceMetrics.userId, userId), eq(performanceMetrics.vaultId, vaultId))
            : eq(performanceMetrics.userId, userId);

        const metrics = await db.select()
            .from(performanceMetrics)
            .where(conditions)
            .orderBy(desc(performanceMetrics.periodEnd));

        if (metrics.length === 0) {
            return { success: false, message: 'No performance metrics found' };
        }

        // Latest, YTD, 1Y, 3Y, 5Y, all-time
        const now = new Date();
        const ytdStart = new Date(now.getFullYear(), 0, 1);
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
        const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

        return {
            success: true,
            summary: {
                latest: metrics[0],
                ytd: this.findMetricForPeriod(metrics, ytdStart, now),
                oneYear: this.findMetricForPeriod(metrics, oneYearAgo, now),
                threeYears: this.findMetricForPeriod(metrics, threeYearsAgo, now),
                fiveYears: this.findMetricForPeriod(metrics, fiveYearsAgo, now),
                allTime: metrics[metrics.length - 1],
            },
            allMetrics: metrics,
        };
    }

    /**
     * Find metric for specific period
     */
    findMetricForPeriod(metrics, startDate, endDate) {
        return metrics.find(m => 
            new Date(m.periodStart) <= startDate && 
            new Date(m.periodEnd) >= endDate
        ) || null;
    }

    /**
     * Interpret performance
     */
    interpretPerformance(twr, mwr) {
        const interpretation = [];

        // TWR interpretation
        if (twr > 0.15) {
            interpretation.push('Excellent portfolio performance');
        } else if (twr > 0.08) {
            interpretation.push('Good portfolio performance');
        } else if (twr > 0) {
            interpretation.push('Positive portfolio performance');
        } else {
            interpretation.push('Portfolio declined in value');
        }

        // TWR vs MWR comparison
        const diff = twr - mwr;
        if (Math.abs(diff) > 0.02) {
            if (diff > 0) {
                interpretation.push('Timing of contributions reduced returns');
            } else {
                interpretation.push('Timing of contributions enhanced returns');
            }
        } else {
            interpretation.push('Cash flow timing had minimal impact');
        }

        return interpretation;
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
     * Calculate compound annual growth rate (CAGR)
     */
    calculateCAGR(startValue, endValue, years) {
        if (startValue === 0 || years === 0) return 0;
        return Math.pow(endValue / startValue, 1 / years) - 1;
    }
}

export default new TimeWeightedReturnsCalculator();
