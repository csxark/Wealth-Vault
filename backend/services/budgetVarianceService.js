import { db } from '../db/index.js';
import { budgetVarianceAnalysis, budgets, expenses } from '../db/schema.js';
import { eq, and, gte, lte, sumDistinct } from 'drizzle-orm';

/**
 * Budget Variance Service
 * Issue #668
 * 
 * Analyzes budget vs actual spending and identifies variances
 */

export class BudgetVarianceService {
  /**
   * Analyze budget variance for a period
   */
  async analyzeBudgetVariance(userId, tenantId, period = 'current_month') {
    try {
      const { startDate, endDate } = this.getPeriodDates(period);

      // Fetch all budgets for the user
      const userBudgets = await db
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.tenantId, tenantId)));

      if (userBudgets.length === 0) {
        return {
          varianceFound: false,
          message: 'No budgets found for analysis',
        };
      }

      const varianceAnalysis = [];

      // Analyze variance for each budget
      for (const budget of userBudgets) {
        const variance = await this.calculateVariance(
          userId,
          tenantId,
          budget.categoryId,
          budget.budgetAmount,
          startDate,
          endDate
        );

        const status = this.determineVarianceStatus(
          variance.budgetAmount,
          variance.actualSpending
        );

        // Save to database
        const saved = await this.saveVarianceAnalysis({
          userId,
          tenantId,
          budgetId: budget.id,
          categoryId: budget.categoryId,
          period,
          budgetAmount: variance.budgetAmount,
          actualSpending: variance.actualSpending,
          varianceAmount: variance.varianceAmount,
          variancePercentage: variance.variancePercentage,
          status,
          trend: this.calculateTrend(variance.historicalData),
        });

        varianceAnalysis.push(saved);
      }

      return {
        varianceFound: true,
        period,
        startDate,
        endDate,
        totalBudgets: userBudgets.length,
        analysis: varianceAnalysis,
        summary: this.summarizeVariances(varianceAnalysis),
      };
    } catch (error) {
      console.error('Error analyzing budget variance:', error);
      throw error;
    }
  }

  /**
   * Calculate variance for a specific category
   */
  async calculateVariance(userId, tenantId, categoryId, budgetAmount, startDate, endDate) {
    // Fetch actual spending
    const actualExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          eq(expenses.categoryId, categoryId),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        )
      );

    const actualSpending = actualExpenses.reduce(
      (sum, exp) => sum + parseFloat(exp.amount),
      0
    );

    const varianceAmount = budgetAmount - actualSpending;
    const variancePercentage =
      budgetAmount > 0 ? (varianceAmount / budgetAmount) * 100 : 0;

    // Get historical data for trend analysis
    const sixMonthsAgo = new Date(startDate);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          eq(expenses.categoryId, categoryId),
          gte(expenses.date, sixMonthsAgo),
          lte(expenses.date, endDate)
        )
      )
      .orderBy((t) => t.date);

    return {
      budgetAmount: Math.round(budgetAmount * 100) / 100,
      actualSpending: Math.round(actualSpending * 100) / 100,
      varianceAmount: Math.round(varianceAmount * 100) / 100,
      variancePercentage: Math.round(variancePercentage * 100) / 100,
      transactionCount: actualExpenses.length,
      historicalData: historicalExpenses,
    };
  }

  /**
   * Determine variance status
   */
  determineVarianceStatus(budgetAmount, actualSpending) {
    const variance = budgetAmount - actualSpending;
    const variancePercent = (variance / budgetAmount) * 100;

    if (variancePercent > 10) {
      return 'underspend'; // Spending under budget
    } else if (variancePercent < -10) {
      return 'overage'; // Spending over budget
    } else {
      return 'on_track'; // Within 10% of budget
    }
  }

  /**
   * Calculate trend direction
   */
  calculateTrend(historicalData) {
    if (historicalData.length < 2) {
      return 'insufficient_data';
    }

    // Group by month and calculate average spending
    const monthlyData = {};
    historicalData.forEach((exp) => {
      const date = new Date(exp.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
      )}`;
      if (!monthlyData[key]) {
        monthlyData[key] = [];
      }
      monthlyData[key].push(parseFloat(exp.amount));
    });

    const monthlyAverages = Object.entries(monthlyData)
      .map(([month, values]) => ({
        month,
        avg: values.reduce((a, b) => a + b) / values.length,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (monthlyAverages.length < 3) {
      return 'insufficient_data';
    }

    // Calculate trend using simple linear regression
    const n = monthlyAverages.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = monthlyAverages.map((m) => m.avg);

    const sumX = x.reduce((a, b) => a + b);
    const sumY = y.reduce((a, b) => a + b);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.5) {
      return 'increasing';
    } else if (slope < -0.5) {
      return 'declining';
    } else {
      return 'stable';
    }
  }

  /**
   * Save variance analysis to database
   */
  async saveVarianceAnalysis(data) {
    const existing = await db
      .select()
      .from(budgetVarianceAnalysis)
      .where(
        and(
          eq(budgetVarianceAnalysis.userId, data.userId),
          eq(budgetVarianceAnalysis.tenantId, data.tenantId),
          eq(budgetVarianceAnalysis.budgetId, data.budgetId),
          eq(budgetVarianceAnalysis.period, data.period)
        )
      );

    if (existing.length > 0) {
      return await db
        .update(budgetVarianceAnalysis)
        .set({
          actualSpending: data.actualSpending,
          varianceAmount: data.varianceAmount,
          variancePercentage: data.variancePercentage,
          status: data.status,
          trendDirection: data.trend,
          analyzedAt: new Date(),
        })
        .where(eq(budgetVarianceAnalysis.id, existing[0].id))
        .returning();
    } else {
      return await db
        .insert(budgetVarianceAnalysis)
        .values({
          userId: data.userId,
          tenantId: data.tenantId,
          budgetId: data.budgetId,
          categoryId: data.categoryId,
          period: data.period,
          budgetAmount: data.budgetAmount,
          actualSpending: data.actualSpending,
          varianceAmount: data.varianceAmount,
          variancePercentage: data.variancePercentage,
          status: data.status,
          trendDirection: data.trend,
          analyzedAt: new Date(),
        })
        .returning();
    }
  }

  /**
   * Summarize variances across all budgets
   */
  summarizeVariances(analyses) {
    const summary = {
      totalBudgeted: 0,
      totalSpent: 0,
      totalVariance: 0,
      categories: {
        onTrack: 0,
        overage: 0,
        underspend: 0,
      },
      trends: {
        increasing: 0,
        declining: 0,
        stable: 0,
      },
    };

    analyses.forEach((item) => {
      if (Array.isArray(item)) {
        item = item[0];
      }
      summary.totalBudgeted += item.budgetAmount;
      summary.totalSpent += item.actualSpending;
      summary.totalVariance += item.varianceAmount;
      summary.categories[item.status]++;
      summary.trends[item.trendDirection]++;
    });

    summary.totalBudgeted = Math.round(summary.totalBudgeted * 100) / 100;
    summary.totalSpent = Math.round(summary.totalSpent * 100) / 100;
    summary.totalVariance = Math.round(summary.totalVariance * 100) / 100;
    summary.overallVariancePercent = Math.round(
      (summary.totalVariance / summary.totalBudgeted) * 100 * 100
    ) / 100;

    return summary;
  }

  /**
   * Get category breakdown with variance
   */
  async getCategoryBreakdown(userId, tenantId, period = 'current_month') {
    const { startDate, endDate } = this.getPeriodDates(period);

    const variances = await db
      .select()
      .from(budgetVarianceAnalysis)
      .where(
        and(
          eq(budgetVarianceAnalysis.userId, userId),
          eq(budgetVarianceAnalysis.tenantId, tenantId),
          eq(budgetVarianceAnalysis.period, period)
        )
      );

    return variances.map((v) => ({
      category: v.categoryId,
      budgetAmount: v.budgetAmount,
      actualSpending: v.actualSpending,
      varianceAmount: v.varianceAmount,
      variancePercentage: v.variancePercentage,
      status: v.status,
      trend: v.trendDirection,
      isOverBudget: v.varianceAmount < 0,
      percentageOfBudget: Math.round(
        (v.actualSpending / v.budgetAmount) * 100 * 100
      ) / 100,
    }));
  }

  /**
   * Get period dates
   */
  getPeriodDates(period) {
    const today = new Date();
    let startDate, endDate;

    switch (period) {
      case 'current_month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = today;
        break;
      case 'previous_month':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), quarter * 3, 1);
        endDate = today;
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = today;
        break;
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = today;
    }

    return { startDate, endDate };
  }

  /**
   * Identify over-budget categories
   */
  async getOverBudgetCategories(userId, tenantId) {
    const variances = await db
      .select()
      .from(budgetVarianceAnalysis)
      .where(
        and(
          eq(budgetVarianceAnalysis.userId, userId),
          eq(budgetVarianceAnalysis.tenantId, tenantId),
          eq(budgetVarianceAnalysis.status, 'overage')
        )
      )
      .orderBy((t) => t.varianceAmount);

    return variances.map((v) => ({
      category: v.categoryId,
      budgetAmount: v.budgetAmount,
      actualSpending: v.actualSpending,
      overAmount: Math.abs(v.varianceAmount),
      percentageOver: Math.abs(v.variancePercentage),
      trend: v.trendDirection,
    }));
  }

  /**
   * Generate variance recommendations
   */
  async getVarianceRecommendations(userId, tenantId) {
    const overBudget = await this.getOverBudgetCategories(userId, tenantId);
    const breakdown = await this.getCategoryBreakdown(userId, tenantId);

    const recommendations = [];

    // High overage categories
    overBudget.forEach((item) => {
      if (item.percentageOver > 20) {
        recommendations.push({
          type: 'reduce_spending',
          category: item.category,
          message: `Over budget by ${item.percentageOver.toFixed(1)}% (${item.overAmount.toFixed(
            2
          )})`,
          priority: 'high',
          action: 'Review and reduce spending in this category',
        });
      }
    });

    // Increasing trend categories
    breakdown
      .filter((d) => d.trend === 'increasing' && d.status === 'overage')
      .forEach((item) => {
        recommendations.push({
          type: 'trend_alert',
          category: item.category,
          message: `Spending trend is increasing in ${item.category}`,
          priority: 'medium',
          action: 'Set stricter limits to prevent further overspend',
        });
      });

    // Underspend opportunities
    breakdown
      .filter((d) => d.status === 'underspend' && d.variancePercentage > 20)
      .forEach((item) => {
        recommendations.push({
          type: 'savings_opportunity',
          category: item.category,
          message: `Consistently spending less than budgeted`,
          priority: 'low',
          action: 'Consider reallocating saved funds',
        });
      });

    return recommendations;
  }
}

export const budgetVarianceService = new BudgetVarianceService();
