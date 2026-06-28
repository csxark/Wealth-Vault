import db from '../config/db.js';
import { 
    financialHealthScores, 
    healthScoreHistory, 
    spendingHeatmaps,
    healthRecommendations,
    wellnessTrends,
    expenses,
    debts as debtsTable,
    goals,
    portfolioHoldings,
    users,
    budgets
} from '../db/schema.js';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

/**
 * Financial Health Scoring Service
 * Issue #667
 * 
 * Calculates comprehensive financial health scores (0-850) using:
 * - Savings metrics (emergency fund, savings rate)
 * - Debt metrics (DTI ratio, credit utilization)
 * - Spending patterns (budget adherence, variability)
 * - Investment health (portfolio value, diversification)
 * - Income stability (growth rate, multiple streams)
 */
class HealthScoringService {
    constructor() {
        // Score weights for overall wealth score (sum = 100)
        this.SCORE_WEIGHTS = {
            savings: 0.25,      // 25%
            debt: 0.25,         // 25%
            spending: 0.20,     // 20%
            investment: 0.20,   // 20%
            income: 0.10        // 10%
        };

        // Score ranges
        this.SCORE_RANGES = {
            excellent: { min: 750, max: 850 },
            good: { min: 650, max: 749 },
            fair: { min: 550, max: 649 },
            poor: { min: 450, max: 549 },
            critical: { min: 0, max: 449 }
        };
    }

    /**
     * Calculate complete financial health score for a user
     */
    async calculateHealthScore(userId, tenantId) {
        try {
            // Get user data
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            if (!user) throw new Error('User not found');

            // Calculate component scores in parallel
            const [
                savingsScore,
                debtScore,
                spendingScore,
                investmentScore,
                incomeScore
            ] = await Promise.all([
                this.calculateSavingsScore(userId, tenantId, user),
                this.calculateDebtScore(userId, tenantId, user),
                this.calculateSpendingScore(userId, tenantId, user),
                this.calculateInvestmentScore(userId, tenantId, user),
                this.calculateIncomeScore(userId, tenantId, user)
            ]);

            // Calculate overall wealth score (0-850)
            const wealthScore = Math.round(
                (savingsScore.score * this.SCORE_WEIGHTS.savings +
                 debtScore.score * this.SCORE_WEIGHTS.debt +
                 spendingScore.score * this.SCORE_WEIGHTS.spending +
                 investmentScore.score * this.SCORE_WEIGHTS.investment +
                 incomeScore.score * this.SCORE_WEIGHTS.income) * 8.5 // Scale to 850
            );

            // Determine health status
            const healthStatus = this.getHealthStatus(wealthScore);

            // Get previous score for comparison
            const [previousScore] = await db.select()
                .from(financialHealthScores)
                .where(and(
                    eq(financialHealthScores.userId, userId),
                    eq(financialHealthScores.tenantId, tenantId)
                ))
                .limit(1);

            const scoreChange = previousScore 
                ? wealthScore - previousScore.wealthScore 
                : 0;

            // Combine all metrics
            const metrics = {
                ...savingsScore.metrics,
                ...debtScore.metrics,
                ...spendingScore.metrics,
                ...investmentScore.metrics,
                ...incomeScore.metrics
            };

            // Get peer comparison
            const peerComparison = await this.getPeerComparison(userId, wealthScore, user);

            // Calculate data quality
            const dataQuality = this.calculateDataQuality(metrics);

            // Upsert health score
            const scoreData = {
                tenantId,
                userId,
                wealthScore,
                previousScore: previousScore?.wealthScore || null,
                scoreChange,
                savingsScore: savingsScore.score,
                debtScore: debtScore.score,
                spendingScore: spendingScore.score,
                investmentScore: investmentScore.score,
                incomeScore: incomeScore.score,
                healthStatus,
                metrics,
                peerComparison,
                calculatedAt: new Date(),
                calculationVersion: '1.0',
                dataQuality
            };

            // Delete existing score and insert new one
            await db.delete(financialHealthScores)
                .where(and(
                    eq(financialHealthScores.userId, userId),
                    eq(financialHealthScores.tenantId, tenantId)
                ));

            const [result] = await db.insert(financialHealthScores)
                .values(scoreData)
                .returning();

            // Generate recommendations
            await this.generateRecommendations(userId, tenantId, result.id, scoreData);

            return result;
        } catch (error) {
            console.error('Error calculating health score:', error);
            throw error;
        }
    }

    /**
     * Calculate savings score (0-100)
     * Based on emergency fund, savings rate, liquid assets
     */
    async calculateSavingsScore(userId, tenantId, user) {
        try {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

            // Get monthly income (from expenses or user profile)
            const monthlyIncome = user.monthlyIncome || 5000; // Default estimate

            // Calculate liquid assets (savings goals + available balance)
            const [savingsGoals] = await db.select({
                totalSaved: sql`COALESCE(SUM(${goals.currentAmount}), 0)`
            }).from(goals)
            .where(and(
                eq(goals.userId, userId),
                eq(goals.type, 'savings')
            ));

            const liquidAssets = Number(savingsGoals?.totalSaved || 0);

            // Calculate emergency fund in months
            const emergencyFundMonths = monthlyIncome > 0 
                ? liquidAssets / monthlyIncome 
                : 0;

            // Calculate savings rate (last 3 months)
            const [incomeData] = await db.select({
                totalIncome: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'income' THEN ${expenses.amount} ELSE 0 END), 0)`,
                totalExpenses: sql`COALESCE(SUM(CASE WHEN ${expenses.type} = 'expense' THEN ${expenses.amount} ELSE 0 END), 0)`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                gte(expenses.date, threeMonthsAgo)
            ));

            const totalIncome = Number(incomeData?.totalIncome || monthlyIncome * 3);
            const totalExpenses = Number(incomeData?.totalExpenses || 0);
            const savingsRate = totalIncome > 0 
                ? ((totalIncome - totalExpenses) / totalIncome) * 100 
                : 0;

            // Calculate score (0-100)
            let score = 0;

            // Emergency fund scoring (60 points max)
            // 6+ months = 60, 3 months = 40, 1 month = 20
            if (emergencyFundMonths >= 6) score += 60;
            else if (emergencyFundMonths >= 3) score += 40 + (emergencyFundMonths - 3) * 6.67;
            else score += emergencyFundMonths * 20;

            // Savings rate scoring (40 points max)
            // 20%+ = 40, 15% = 30, 10% = 20
            if (savingsRate >= 20) score += 40;
            else if (savingsRate >= 10) score += 20 + (savingsRate - 10) * 2;
            else if (savingsRate > 0) score += savingsRate * 2;

            return {
                score: Math.min(Math.round(score), 100),
                metrics: {
                    emergencyFundMonths: Number(emergencyFundMonths.toFixed(2)),
                    savingsRate: Number(savingsRate.toFixed(2)),
                    liquidAssets: Math.round(liquidAssets)
                }
            };
        } catch (error) {
            console.error('Error calculating savings score:', error);
            return { 
                score: 0, 
                metrics: { 
                    emergencyFundMonths: 0, 
                    savingsRate: 0, 
                    liquidAssets: 0 
                } 
            };
        }
    }

    /**
     * Calculate debt score (0-100)
     * Based on debt-to-income ratio, total debt, monthly payments
     */
    async calculateDebtScore(userId, tenantId, user) {
        try {
            const monthlyIncome = user.monthlyIncome || 5000;

            // Get total debt and monthly payments
            const [debtData] = await db.select({
                totalDebt: sql`COALESCE(SUM(${debtsTable.remainingBalance}), 0)`,
                monthlyPayments: sql`COALESCE(SUM(${debtsTable.minimumPayment}), 0)`
            }).from(debtsTable)
            .where(and(
                eq(debtsTable.userId, userId),
                eq(debtsTable.status, 'active')
            ));

            const totalDebt = Number(debtData?.totalDebt || 0);
            const monthlyPayments = Number(debtData?.monthlyPayments || 0);

            // Calculate DTI ratio
            const debtToIncomeRatio = monthlyIncome > 0 
                ? (monthlyPayments / monthlyIncome) * 100 
                : 0;

            // Calculate credit utilization (assuming credit cards)
            // TODO: Add credit limit tracking
            const creditUtilization = 0; // Placeholder

            // Calculate score (0-100)
            let score = 0;

            // DTI ratio scoring (70 points max)
            // <20% = 70, 20-36% = 50, 36-50% = 30, >50% = 0
            if (debtToIncomeRatio === 0) score += 70; // No debt is excellent
            else if (debtToIncomeRatio <= 20) score += 70;
            else if (debtToIncomeRatio <= 36) score += 50 + (36 - debtToIncomeRatio);
            else if (debtToIncomeRatio <= 50) score += 30 - (debtToIncomeRatio - 36);
            else score += 0;

            // Total debt scoring (30 points max)
            // <1x annual income = 30, <2x = 20, <3x = 10
            const annualIncome = monthlyIncome * 12;
            const debtToAnnualIncome = annualIncome > 0 ? totalDebt / annualIncome : 0;
            
            if (debtToAnnualIncome === 0) score += 30;
            else if (debtToAnnualIncome <= 1) score += 30;
            else if (debtToAnnualIncome <= 2) score += 20;
            else if (debtToAnnualIncome <= 3) score += 10;

            return {
                score: Math.min(Math.round(score), 100),
                metrics: {
                    debtToIncomeRatio: Number(debtToIncomeRatio.toFixed(2)),
                    creditUtilization: Number(creditUtilization.toFixed(2)),
                    totalDebt: Math.round(totalDebt),
                    monthlyDebtPayments: Math.round(monthlyPayments)
                }
            };
        } catch (error) {
            console.error('Error calculating debt score:', error);
            return { 
                score: 50, // Neutral score if no data
                metrics: { 
                    debtToIncomeRatio: 0, 
                    creditUtilization: 0, 
                    totalDebt: 0,
                    monthlyDebtPayments: 0
                } 
            };
        }
    }

    /**
     * Calculate spending score (0-100)
     * Based on budget adherence, spending variability, discretionary vs essential
     */
    async calculateSpendingScore(userId, tenantId, user) {
        try {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            // Get spending data
            const [spendingData] = await db.select({
                totalSpending: sql`COALESCE(SUM(${expenses.amount}), 0)`,
                count: sql`COUNT(*)`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.type, 'expense'),
                gte(expenses.date, threeMonthsAgo)
            ));

            const totalSpending = Number(spendingData?.totalSpending || 0);

            // Get budget data for current month
            const [budgetData] = await db.select({
                totalBudget: sql`COALESCE(SUM(${budgets.amount}), 0)`
            }).from(budgets)
            .where(and(
                eq(budgets.userId, userId),
                gte(budgets.startDate, firstDayOfMonth)
            ));

            const totalBudget = Number(budgetData?.totalBudget || 0);

            // Get current month spending
            const [currentMonthSpending] = await db.select({
                spent: sql`COALESCE(SUM(${expenses.amount}), 0)`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.type, 'expense'),
                gte(expenses.date, firstDayOfMonth)
            ));

            const spent = Number(currentMonthSpending?.spent || 0);

            // Calculate budget adherence
            const budgetAdherence = totalBudget > 0 
                ? Math.max(0, (1 - (spent / totalBudget)) * 100)
                : 50; // Neutral if no budget

            // Calculate spending variability (coefficient of variation)
            const avgMonthlySpending = totalSpending / 3;
            const spendingVariability = avgMonthlySpending > 0 
                ? ((spent - avgMonthlySpending) / avgMonthlySpending) * 100 
                : 0;

            // Categorize spending (placeholder - needs category analysis)
            const discretionarySpending = totalSpending * 0.3; // Estimate
            const essentialSpending = totalSpending * 0.7; // Estimate

            // Calculate score (0-100)
            let score = 0;

            // Budget adherence scoring (60 points max)
            if (budgetAdherence >= 90) score += 60;
            else if (budgetAdherence >= 70) score += 40 + (budgetAdherence - 70);
            else if (budgetAdherence >= 50) score += 20 + (budgetAdherence - 50);
            else score += budgetAdherence * 0.4;

            // Spending consistency scoring (40 points max)
            const absVariability = Math.abs(spendingVariability);
            if (absVariability <= 10) score += 40;
            else if (absVariability <= 25) score += 30;
            else if (absVariability <= 40) score += 20;
            else score += 10;

            return {
                score: Math.min(Math.round(score), 100),
                metrics: {
                    budgetAdherence: Number(budgetAdherence.toFixed(2)),
                    spendingVariability: Number(Math.abs(spendingVariability).toFixed(2)),
                    discretionarySpending: Math.round(discretionarySpending),
                    essentialSpending: Math.round(essentialSpending)
                }
            };
        } catch (error) {
            console.error('Error calculating spending score:', error);
            return { 
                score: 50, 
                metrics: { 
                    budgetAdherence: 0, 
                    spendingVariability: 0,
                    discretionarySpending: 0,
                    essentialSpending: 0
                } 
            };
        }
    }

    /**
     * Calculate investment score (0-100)
     * Based on portfolio value, diversification, returns
     */
    async calculateInvestmentScore(userId, tenantId, user) {
        try {
            // Get portfolio data
            const [portfolioData] = await db.select({
                portfolioValue: sql`COALESCE(SUM(${portfolioHoldings.currentValue}), 0)`,
                assetCount: sql`COUNT(DISTINCT ${portfolioHoldings.assetType})`
            }).from(portfolioHoldings)
            .where(eq(portfolioHoldings.userId, userId));

            const portfolioValue = Number(portfolioData?.portfolioValue || 0);
            const assetCount = Number(portfolioData?.assetCount || 0);

            // Calculate diversification score
            const portfolioDiversification = Math.min((assetCount / 5) * 100, 100);

            // Placeholder for returns calculation
            const investmentReturns = 7; // Placeholder: 7% annual return
            const riskAdjustedReturns = 6; // Placeholder

            const monthlyIncome = user.monthlyIncome || 5000;
            const annualIncome = monthlyIncome * 12;

            // Calculate score (0-100)
            let score = 0;

            // Portfolio existence and size (40 points max)
            if (portfolioValue === 0) score += 0;
            else if (portfolioValue >= annualIncome) score += 40;
            else score += (portfolioValue / annualIncome) * 40;

            // Diversification (30 points max)
            score += (portfolioDiversification / 100) * 30;

            // Returns (30 points max)
            if (investmentReturns >= 8) score += 30;
            else if (investmentReturns >= 5) score += 20;
            else if (investmentReturns >= 0) score += 10;

            return {
                score: Math.min(Math.round(score), 100),
                metrics: {
                    portfolioValue: Math.round(portfolioValue),
                    portfolioDiversification: Number(portfolioDiversification.toFixed(2)),
                    investmentReturns: Number(investmentReturns.toFixed(2)),
                    riskAdjustedReturns: Number(riskAdjustedReturns.toFixed(2))
                }
            };
        } catch (error) {
            console.error('Error calculating investment score:', error);
            return { 
                score: 0, 
                metrics: { 
                    portfolioValue: 0, 
                    portfolioDiversification: 0,
                    investmentReturns: 0,
                    riskAdjustedReturns: 0
                } 
            };
        }
    }

    /**
     * Calculate income score (0-100)
     * Based on income stability, growth rate, multiple streams
     */
    async calculateIncomeScore(userId, tenantId, user) {
        try {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

            // Get income data from last 6 months
            const [recentIncome] = await db.select({
                last3Months: sql`COALESCE(SUM(CASE WHEN ${expenses.date} >= ${threeMonthsAgo} THEN ${expenses.amount} ELSE 0 END), 0)`,
                previous3Months: sql`COALESCE(SUM(CASE WHEN ${expenses.date} >= ${sixMonthsAgo} AND ${expenses.date} < ${threeMonthsAgo} THEN ${expenses.amount} ELSE 0 END), 0)`,
                sources: sql`COUNT(DISTINCT ${expenses.category})`
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.type, 'income'),
                gte(expenses.date, sixMonthsAgo)
            ));

            const last3Months = Number(recentIncome?.last3Months || 0);
            const previous3Months = Number(recentIncome?.previous3Months || 0);
            const incomeSources = Number(recentIncome?.sources || 1);

            const monthlyIncome = last3Months / 3;

            // Calculate income growth rate
            const incomeGrowthRate = previous3Months > 0 
                ? ((last3Months - previous3Months) / previous3Months) * 100 
                : 0;

            // Calculate income stability (inverse of variability)
            const incomeStability = Math.max(0, 100 - Math.abs(incomeGrowthRate));

            const multipleIncomeStreams = incomeSources >= 2;

            // Calculate score (0-100)
            let score = 0;

            // Income level (40 points max)
            // Scoring based on reasonable income levels
            if (monthlyIncome >= 8000) score += 40;
            else if (monthlyIncome >= 5000) score += 30 + ((monthlyIncome - 5000) / 3000) * 10;
            else if (monthlyIncome >= 3000) score += 20 + ((monthlyIncome - 3000) / 2000) * 10;
            else score += (monthlyIncome / 3000) * 20;

            // Income stability (30 points max)
            score += (incomeStability / 100) * 30;

            // Multiple income streams (20 points max)
            if (incomeSources >= 3) score += 20;
            else if (incomeSources >= 2) score += 15;
            else if (incomeSources >= 1) score += 10;

            // Growth rate bonus (10 points max)
            if (incomeGrowthRate > 10) score += 10;
            else if (incomeGrowthRate > 5) score += 7;
            else if (incomeGrowthRate > 0) score += 5;

            return {
                score: Math.min(Math.round(score), 100),
                metrics: {
                    monthlyIncome: Math.round(monthlyIncome),
                    incomeGrowthRate: Number(incomeGrowthRate.toFixed(2)),
                    incomeStability: Number(incomeStability.toFixed(2)),
                    multipleIncomeStreams
                }
            };
        } catch (error) {
            console.error('Error calculating income score:', error);
            return { 
                score: 50, 
                metrics: { 
                    monthlyIncome: 0, 
                    incomeGrowthRate: 0,
                    incomeStability: 0,
                    multipleIncomeStreams: false
                } 
            };
        }
    }

    /**
     * Get health status from wealth score
     */
    getHealthStatus(score) {
        if (score >= 750) return 'excellent';
        if (score >= 650) return 'good';
        if (score >= 550) return 'fair';
        if (score >= 450) return 'poor';
        return 'critical';
    }

    /**
     * Calculate data quality score
     */
    calculateDataQuality(metrics) {
        let dataPoints = 0;
        let totalPoints = 0;

        const checkMetric = (value) => {
            totalPoints++;
            if (value !== null && value !== undefined && value !== 0) {
                dataPoints++;
            }
        };

        // Check key metrics
        checkMetric(metrics.emergencyFundMonths);
        checkMetric(metrics.savingsRate);
        checkMetric(metrics.monthlyIncome);
        checkMetric(metrics.totalDebt);
        checkMetric(metrics.budgetAdherence);
        checkMetric(metrics.portfolioValue);

        return Math.round((dataPoints / totalPoints) * 100);
    }

    /**
     * Get peer comparison data
     */
    async getPeerComparison(userId, wealthScore, user) {
        // Placeholder - would query peer_benchmarks table
        // For now, return estimated percentiles
        
        const percentile = Math.min(95, Math.max(5, (wealthScore / 850) * 100));
        
        return {
            percentile: Math.round(percentile),
            ageGroupAverage: 550,
            incomeGroupAverage: 575,
            regionAverage: 560
        };
    }

    /**
     * Generate personalized recommendations
     */
    async generateRecommendations(userId, tenantId, scoreId, scoreData) {
        try {
            const recommendations = [];

            // Savings recommendations
            if (scoreData.savingsScore < 70) {
                if (scoreData.metrics.emergencyFundMonths < 3) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Build Emergency Fund',
                        description: `You currently have ${scoreData.metrics.emergencyFundMonths.toFixed(1)} months of expenses saved. Aim for at least 3-6 months to protect against unexpected events.`,
                        category: 'savings',
                        priority: 'critical',
                        estimatedScoreImpact: 15,
                        estimatedDollarImpact: Math.round(scoreData.metrics.monthlyIncome * 3),
                        estimatedTimeframe: '6 months',
                        actionItems: [
                            { step: 'Set up automatic transfer of 10% income to savings', completed: false },
                            { step: 'Create a dedicated emergency fund account', completed: false },
                            { step: 'Reduce one discretionary expense', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.95,
                        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
                    });
                }

                if (scoreData.metrics.savingsRate < 15) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Increase Savings Rate',
                        description: `Your current savings rate is ${scoreData.metrics.savingsRate.toFixed(1)}%. Try to save at least 15-20% of your income for better financial health.`,
                        category: 'savings',
                        priority: 'high',
                        estimatedScoreImpact: 10,
                        estimatedDollarImpact: Math.round(scoreData.metrics.monthlyIncome * 0.15 * 12),
                        estimatedTimeframe: '3 months',
                        actionItems: [
                            { step: 'Review and cut unnecessary subscriptions', completed: false },
                            { step: 'Automate savings with each paycheck', completed: false },
                            { step: 'Set savings goals using the app', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.90,
                        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
                    });
                }
            }

            // Debt recommendations
            if (scoreData.debtScore < 70) {
                if (scoreData.metrics.debtToIncomeRatio > 36) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Reduce Debt-to-Income Ratio',
                        description: `Your DTI ratio is ${scoreData.metrics.debtToIncomeRatio.toFixed(1)}%, which is above the recommended 36%. Focus on paying down high-interest debt first.`,
                        category: 'debt',
                        priority: 'critical',
                        estimatedScoreImpact: 20,
                        estimatedDollarImpact: scoreData.metrics.totalDebt,
                        estimatedTimeframe: '12 months',
                        actionItems: [
                            { step: 'Create debt payoff plan using avalanche method', completed: false },
                            { step: 'Consider debt consolidation for better rates', completed: false },
                            { step: 'Avoid taking on new debt', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.92,
                        expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
                    });
                }
            }

            // Spending recommendations
            if (scoreData.spendingScore < 70) {
                if (scoreData.metrics.budgetAdherence < 80) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Improve Budget Adherence',
                        description: 'You\'re exceeding your budget targets. Review your spending patterns and adjust budgets or spending habits.',
                        category: 'spending',
                        priority: 'high',
                        estimatedScoreImpact: 12,
                        estimatedDollarImpact: scoreData.metrics.discretionarySpending,
                        estimatedTimeframe: '2 months',
                        actionItems: [
                            { step: 'Review spending heatmap to identify problem areas', completed: false },
                            { step: 'Set realistic budgets for top spending categories', completed: false },
                            { step: 'Enable budget alerts', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.88,
                        expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
                    });
                }
            }

            // Investment recommendations
            if (scoreData.investmentScore < 60) {
                if (scoreData.metrics.portfolioValue === 0) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Start Investing',
                        description: 'You don\'t have any investments yet. Start building wealth through diversified investments for long-term financial health.',
                        category: 'investment',
                        priority: 'medium',
                        estimatedScoreImpact: 15,
                        estimatedDollarImpact: 100000, // Potential 10-year growth
                        estimatedTimeframe: '1 month to start',
                        actionItems: [
                            { step: 'Open investment account', completed: false },
                            { step: 'Start with low-cost index funds', completed: false },
                            { step: 'Set up automatic monthly investments', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.85,
                        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                    });
                } else if (scoreData.metrics.portfolioDiversification < 50) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Diversify Portfolio',
                        description: 'Your portfolio lacks diversification. Spread investments across different asset classes to reduce risk.',
                        category: 'investment',
                        priority: 'medium',
                        estimatedScoreImpact: 10,
                        estimatedDollarImpact: 0,
                        estimatedTimeframe: '3 months',
                        actionItems: [
                            { step: 'Review current asset allocation', completed: false },
                            { step: 'Add bonds or real estate investments', completed: false },
                            { step: 'Consider international diversification', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.83,
                        expiresAt: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)
                    });
                }
            }

            // Income recommendations
            if (scoreData.incomeScore < 60) {
                if (!scoreData.metrics.multipleIncomeStreams) {
                    recommendations.push({
                        tenantId,
                        userId,
                        scoreId,
                        title: 'Create Additional Income Streams',
                        description: 'Diversify your income sources to increase financial stability and accelerate wealth building.',
                        category: 'income',
                        priority: 'low',
                        estimatedScoreImpact: 8,
                        estimatedDollarImpact: scoreData.metrics.monthlyIncome * 3, // 25% additional income annually
                        estimatedTimeframe: '6 months',
                        actionItems: [
                            { step: 'Explore freelance opportunities in your field', completed: false },
                            { step: 'Consider passive income investments', completed: false },
                            { step: 'Develop a marketable skill or side project', completed: false }
                        ],
                        generatedBy: 'system',
                        confidence: 0.75,
                        expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
                    });
                }
            }

            // Insert recommendations
            if (recommendations.length > 0) {
                await db.insert(healthRecommendations)
                    .values(recommendations);
            }

            return recommendations;
        } catch (error) {
            console.error('Error generating recommendations:', error);
            return [];
        }
    }

    /**
     * Get user's financial health score
     */
    async getHealthScore(userId, tenantId) {
        const [score] = await db.select()
            .from(financialHealthScores)
            .where(and(
                eq(financialHealthScores.userId, userId),
                eq(financialHealthScores.tenantId, tenantId)
            ))
            .limit(1);

        return score;
    }

    /**
     * Get score history for trending
     */
    async getScoreHistory(userId, tenantId, limit = 12) {
        const history = await db.select()
            .from(healthScoreHistory)
            .where(and(
                eq(healthScoreHistory.userId, userId),
                eq(healthScoreHistory.tenantId, tenantId)
            ))
            .orderBy(desc(healthScoreHistory.snapshotDate))
            .limit(limit);

        return history.reverse(); // Chronological order
    }

    /**
     * Get active recommendations
     */
    async getRecommendations(userId, tenantId, status = 'pending') {
        let query = db.select()
            .from(healthRecommendations)
            .where(and(
                eq(healthRecommendations.userId, userId),
                eq(healthRecommendations.tenantId, tenantId)
            ));

        if (status) {
            query = query.where(eq(healthRecommendations.status, status));
        }

        return await query.orderBy(
            desc(healthRecommendations.priority),
            desc(healthRecommendations.createdAt)
        );
    }

    /**
     * Update recommendation status
     */
    async updateRecommendationStatus(recommendationId, status, userId) {
        const updates = { status };

        if (status === 'in_progress') {
            updates.startedAt = new Date();
        } else if (status === 'completed') {
            updates.completedAt = new Date();
        } else if (status === 'dismissed') {
            updates.dismissedAt = new Date();
        }

        const [updated] = await db.update(healthRecommendations)
            .set(updates)
            .where(and(
                eq(healthRecommendations.id, recommendationId),
                eq(healthRecommendations.userId, userId)
            ))
            .returning();

        return updated;
    }
}

export default new HealthScoringService();
