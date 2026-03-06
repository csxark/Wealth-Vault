import db from '../config/db.js';
import { wellnessTrends, expenses, debts as debtsTable, goals, portfolioHoldings, users, budgets } from '../db/schema.js';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

/**
 * Wellness Trends Service
 * Issue #667
 * 
 * Tracks financial wellness metrics over time including:
 * - Net worth trends
 * - Savings rate
 * - Debt-to-income ratio
 * - Budget adherence
 * - Financial stress indicators
 */
class WellnessTrendsService {
    /**
     * Record wellness trend data point
     */
    async recordTrend(userId, tenantId, trendDate = new Date()) {
        try {
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            if (!user) throw new Error('User not found');

            // Calculate all wellness metrics
            const metrics = await this.calculateWellnessMetrics(userId, tenantId, user, trendDate);

            // Create trend record
            const trendData = {
                tenantId,
                userId,
                trendDate,
                ...metrics,
                dataQuality: this.calculateDataQuality(metrics)
            };

            // Delete existing trend for this date
            await db.delete(wellnessTrends)
                .where(and(
                    eq(wellnessTrends.userId, userId),
                    eq(wellnessTrends.tenantId, tenantId),
                    eq(wellnessTrends.trendDate, trendDate)
                ));

            // Insert new trend
            const [result] = await db.insert(wellnessTrends)
                .values(trendData)
                .returning();

            return result;
        } catch (error) {
            console.error('Error recording wellness trend:', error);
            throw error;
        }
    }

    /**
     * Calculate all wellness metrics
     */
    async calculateWellnessMetrics(userId, tenantId, user, trendDate) {
        const metrics = {};

        // Calculate net worth
        const netWorth = await this.calculateNetWorth(userId, tenantId);
        metrics.netWorth = netWorth.total;
        metrics.liquidNetWorth = netWorth.liquid;

        // Calculate savings rate (last 30 days)
        const savingsRate = await this.calculateSavingsRate(userId, trendDate);
        metrics.savingsRate = savingsRate;

        // Calculate debt-to-income ratio
        const dtiRatio = await this.calculateDebtToIncomeRatio(userId, user);
        metrics.debtToIncomeRatio = dtiRatio;

        // Calculate budget adherence (current month)
        const budgetAdherence = await this.calculateBudgetAdherence(userId, trendDate);
        metrics.budgetAdherence = budgetAdherence;

        // Calculate savings goal progress
        const goalProgress = await this.calculateGoalProgress(userId);
        metrics.savingsGoalProgress = goalProgress;

        // Calculate investment growth (last 30 days)
        const investmentGrowth = await this.calculateInvestmentGrowth(userId, trendDate);
        metrics.investmentGrowth = investmentGrowth;

        // Calculate financial stress score
        const stressScore = await this.calculateFinancialStressScore(userId, tenantId, user, trendDate);
        metrics.financialStressScore = stressScore.score;
        metrics.spendingVolatility = stressScore.volatility;
        metrics.emergencyFundCoverage = stressScore.emergencyFund;

        return metrics;
    }

    /**
     * Calculate net worth (assets - liabilities)
     */
    async calculateNetWorth(userId, tenantId) {
        try {
            // Get portfolio value (assets)
            const [portfolioData] = await db.select({
                totalValue: sql`COALESCE(SUM(${portfolioHoldings.currentValue}), 0)`
            }).from(portfolioHoldings)
            .where(eq(portfolioHoldings.userId, userId));

            // Get savings (liquid assets)
            const [savingsData] = await db.select({
                totalSavings: sql`COALESCE(SUM(${goals.currentAmount}), 0)`
            }).from(goals)
            .where(and(
                eq(goals.userId, userId),
                eq(goals.type, 'savings')
            ));

            // Get total debt (liabilities)
            const [debtData] = await db.select({
                totalDebt: sql`COALESCE(SUM(${debtsTable.remainingBalance}), 0)`
            }).from(debtsTable)
            .where(and(
                eq(debtsTable.userId, userId),
                eq(debtsTable.status, 'active')
            ));

            const assets = Number(portfolioData?.totalValue || 0) + Number(savingsData?.totalSavings || 0);
            const liabilities = Number(debtData?.totalDebt || 0);

            return {
                total: Math.round(assets - liabilities),
                liquid: Math.round(Number(savingsData?.totalSavings || 0))
            };
        } catch (error) {
            console.error('Error calculating net worth:', error);
            return { total: 0, liquid: 0 };
        }
    }

    /**
     * Calculate savings rate (income - expenses) / income
     */
    async calculateSavingsRate(userId, asOfDate) {
        try {
            const thirtyDaysAgo = new Date(asOfDate);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const [data] = await db.select({
                income: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'income' THEN ${expenses.amount} ELSE 0 END), 0)`,
                spending: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'expense' THEN ${expenses.amount} ELSE 0 END), 0)`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                gte(expenses.date, thirtyDaysAgo),
                lte(expenses.date, asOfDate)
            ));

            const income = Number(data?.income || 0);
            const spending = Number(data?.spending || 0);

            if (income === 0) return 0;

            const savingsRate = ((income - spending) / income) * 100;
            return Number(Math.max(0, savingsRate).toFixed(2));
        } catch (error) {
            console.error('Error calculating savings rate:', error);
            return 0;
        }
    }

    /**
     * Calculate debt-to-income ratio
     */
    async calculateDebtToIncomeRatio(userId, user) {
        try {
            const monthlyIncome = user.monthlyIncome || 5000;

            const [debtData] = await db.select({
                monthlyPayments: sql`COALESCE(SUM(${debtsTable.minimumPayment}), 0)`
            }).from(debtsTable)
            .where(and(
                eq(debtsTable.userId, userId),
                eq(debtsTable.status, 'active')
            ));

            const monthlyPayments = Number(debtData?.monthlyPayments || 0);

            if (monthlyIncome === 0) return 0;

            const dtiRatio = (monthlyPayments / monthlyIncome) * 100;
            return Number(dtiRatio.toFixed(2));
        } catch (error) {
            console.error('Error calculating DTI ratio:', error);
            return 0;
        }
    }

    /**
     * Calculate budget adherence for current month
     */
    async calculateBudgetAdherence(userId, asOfDate) {
        try {
            const firstDayOfMonth = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);

            // Get total budgets
            const [budgetData] = await db.select({
                totalBudget: sql`COALESCE(SUM(${budgets.amount}), 0)`
            }).from(budgets)
            .where(and(
                eq(budgets.userId, userId),
                gte(budgets.startDate, firstDayOfMonth)
            ));

            // Get actual spending
            const [spendingData] = await db.select({
                totalSpent: sql`COALESCE(SUM(${expenses.amount}), 0)`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.type, 'expense'),
                gte(expenses.date, firstDayOfMonth),
                lte(expenses.date, asOfDate)
            ));

            const budget = Number(budgetData?.totalBudget || 0);
            const spent = Number(spendingData?.totalSpent || 0);

            if (budget === 0) return 50; // Neutral if no budget

            // 100 = under budget, 0 = way over budget
            const adherence = Math.max(0, ((budget - spent) / budget) * 100);
            return Number(Math.min(100, adherence).toFixed(2));
        } catch (error) {
            console.error('Error calculating budget adherence:', error);
            return 50;
        }
    }

    /**
     * Calculate savings goal progress
     */
    async calculateGoalProgress(userId) {
        try {
            const [goalData] = await db.select({
                totalTarget: sql`COALESCE(SUM(${goals.targetAmount}), 0)`,
                totalCurrent: sql`COALESCE(SUM(${goals.currentAmount}), 0)`
            }).from(goals)
            .where(and(
                eq(goals.userId, userId),
                eq(goals.type, 'savings'),
                eq(goals.status, 'active')
            ));

            const target = Number(goalData?.totalTarget || 0);
            const current = Number(goalData?.totalCurrent || 0);

            if (target === 0) return 0;

            const progress = (current / target) * 100;
            return Number(Math.min(100, progress).toFixed(2));
        } catch (error) {
            console.error('Error calculating goal progress:', error);
            return 0;
        }
    }

    /**
     * Calculate investment growth rate (last 30 days)
     */
    async calculateInvestmentGrowth(userId, asOfDate) {
        try {
            // Get current portfolio value
            const [currentValue] = await db.select({
                total: sql`COALESCE(SUM(${portfolioHoldings.currentValue}), 0)`
            }).from(portfolioHoldings)
            .where(eq(portfolioHoldings.userId, userId));

            // For now, return placeholder
            // TODO: Add historical portfolio tracking
            const current = Number(currentValue?.total || 0);

            if (current === 0) return 0;

            // Placeholder: assume 7% annual return
            const monthlyReturn = 0.5833; // ~7% annual / 12
            return Number(monthlyReturn.toFixed(2));
        } catch (error) {
            console.error('Error calculating investment growth:', error);
            return 0;
        }
    }

    /**
     * Calculate financial stress score (0-100, higher = more stress)
     */
    async calculateFinancialStressScore(userId, tenantId, user, asOfDate) {
        try {
            let stressScore = 0;
            const monthlyIncome = user.monthlyIncome || 5000;

            // Factor 1: Emergency fund coverage (30 points)
            const netWorth = await this.calculateNetWorth(userId, tenantId);
            const emergencyFundMonths = monthlyIncome > 0 ? netWorth.liquid / monthlyIncome : 0;
            
            if (emergencyFundMonths < 1) stressScore += 30;
            else if (emergencyFundMonths < 3) stressScore += 20;
            else if (emergencyFundMonths < 6) stressScore += 10;
            // else 0 points (good)

            // Factor 2: Debt burden (30 points)
            const dtiRatio = await this.calculateDebtToIncomeRatio(userId, user);
            
            if (dtiRatio > 50) stressScore += 30;
            else if (dtiRatio > 36) stressScore += 20;
            else if (dtiRatio > 20) stressScore += 10;
            // else 0 points (good)

            // Factor 3: Spending volatility (20 points)
            const thirtyDaysAgo = new Date(asOfDate);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const sixtyDaysAgo = new Date(asOfDate);
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const [recentSpending] = await db.select({
                last30Days: sql`COALESCE(SUM(CASE WHEN ${expenses.date} >= ${thirtyDaysAgo} THEN ${expenses.amount} ELSE 0 END), 0)`,
                previous30Days: sql`COALESCE(SUM(CASE WHEN ${expenses.date} >= ${sixtyDaysAgo} AND ${expenses.date} < ${thirtyDaysAgo} THEN ${expenses.amount} ELSE 0 END), 0)`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.type, 'expense'),
                gte(expenses.date, sixtyDaysAgo)
            ));

            const last30 = Number(recentSpending?.last30Days || 0);
            const previous30 = Number(recentSpending?.previous30Days || 0);
            
            const volatility = previous30 > 0 
                ? Math.abs((last30 - previous30) / previous30) * 100 
                : 0;

            if (volatility > 50) stressScore += 20;
            else if (volatility > 30) stressScore += 15;
            else if (volatility > 20) stressScore += 10;
            // else 0 points (good)

            // Factor 4: Budget overruns (20 points)
            const budgetAdherence = await this.calculateBudgetAdherence(userId, asOfDate);
            
            if (budgetAdherence < 0) stressScore += 20; // Over budget
            else if (budgetAdherence < 50) stressScore += 10;
            // else 0 points (good)

            return {
                score: Math.min(100, Math.round(stressScore)),
                volatility: Number(volatility.toFixed(2)),
                emergencyFund: Number(emergencyFundMonths.toFixed(2))
            };
        } catch (error) {
            console.error('Error calculating financial stress score:', error);
            return { score: 50, volatility: 0, emergencyFund: 0 };
        }
    }

    /**
     * Calculate data quality
     */
    calculateDataQuality(metrics) {
        let dataPoints = 0;
        let totalPoints = 0;

        const checkMetric = (value) => {
            totalPoints++;
            if (value !== null && value !== undefined) {
                dataPoints++;
            }
        };

        checkMetric(metrics.netWorth);
        checkMetric(metrics.savingsRate);
        checkMetric(metrics.debtToIncomeRatio);
        checkMetric(metrics.budgetAdherence);
        checkMetric(metrics.savingsGoalProgress);
        checkMetric(metrics.investmentGrowth);
        checkMetric(metrics.financialStressScore);

        return Math.round((dataPoints / totalPoints) * 100);
    }

    /**
     * Get wellness trends for a user
     */
    async getTrends(userId, tenantId, limit = 30) {
        const trends = await db.select()
            .from(wellnessTrends)
            .where(and(
                eq(wellnessTrends.userId, userId),
                eq(wellnessTrends.tenantId, tenantId)
            ))
            .orderBy(desc(wellnessTrends.trendDate))
            .limit(limit);

        return trends.reverse(); // Chronological order
    }

    /**
     * Get trend summary with insights
     */
    async getTrendSummary(userId, tenantId) {
        const trends = await this.getTrends(userId, tenantId, 30);

        if (trends.length === 0) {
            return null;
        }

        const latest = trends[trends.length - 1];
        const oldest = trends[0];

        // Calculate changes
        const netWorthChange = latest.netWorth - oldest.netWorth;
        const savingsRateChange = latest.savingsRate - oldest.savingsRate;
        const stressChange = latest.financialStressScore - oldest.financialStressScore;

        // Determine trends
        const insights = {
            netWorth: {
                current: latest.netWorth,
                change: netWorthChange,
                trend: netWorthChange > 0 ? 'improving' : netWorthChange < 0 ? 'declining' : 'stable'
            },
            savingsRate: {
                current: latest.savingsRate,
                change: savingsRateChange,
                trend: savingsRateChange > 0 ? 'improving' : savingsRateChange < 0 ? 'declining' : 'stable'
            },
            financialStress: {
                current: latest.financialStressScore,
                change: stressChange,
                trend: stressChange < 0 ? 'improving' : stressChange > 0 ? 'declining' : 'stable' // Lower stress is better
            },
            budgetAdherence: {
                current: latest.budgetAdherence,
                average: trends.reduce((sum, t) => sum + t.budgetAdherence, 0) / trends.length
            },
            emergencyFund: {
                current: latest.emergencyFundCoverage,
                status: latest.emergencyFundCoverage >= 6 ? 'excellent' :
                       latest.emergencyFundCoverage >= 3 ? 'good' :
                       latest.emergencyFundCoverage >= 1 ? 'fair' : 'critical'
            }
        };

        return {
            latest,
            oldest,
            insights,
            dataPoints: trends.length
        };
    }
}

export default new WellnessTrendsService();
