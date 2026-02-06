import express from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, users, debts as debtsTable, debtPayments } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { convertAmount, getAllRates } from "../services/currencyService.js";
import assetService from "../services/assetService.js";
import projectionEngine from "../services/projectionEngine.js";
import marketData from "../services/marketData.js";
import debtEngine from "../services/debtEngine.js";
import payoffOptimizer from "../services/payoffOptimizer.js";
import refinanceScout from "../services/refinanceScout.js";

const router = express.Router();

/**
 * @swagger
 * /analytics/spending-summary:
 *   get:
 *     summary: Get comprehensive spending analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *           default: month
 *         description: Time period for analytics
 *     responses:
 *       200:
 *         description: Spending analytics data
 */
router.get("/spending-summary", protect, async (req, res) => {
  try {
    const { startDate, endDate, period = "month" } = req.query;

    // Get user's base currency
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    const baseCurrency = user?.currency || 'USD';

    // Calculate date range based on period
    const now = new Date();
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      switch (period) {
        case "quarter":
          start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          end = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
          break;
        case "year":
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31);
          break;
        default: // month
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    }

    const conditions = [
      eq(expenses.userId, req.user.id),
      eq(expenses.status, "completed"),
      gte(expenses.date, start),
      lte(expenses.date, end),
    ];

    // Fetch all expenses for processing (needed for normalization)
    const allExpenses = await db.query.expenses.findMany({
      where: and(...conditions),
      with: {
        category: {
          columns: { name: true, color: true, icon: true, id: true }
        }
      }
    });

    // Normalize expenses
    const normalizedExpenses = await Promise.all(allExpenses.map(async (exp) => {
      let normalizedAmount = Number(exp.amount);
      if (exp.currency && exp.currency !== baseCurrency) {
        normalizedAmount = await convertAmount(normalizedAmount, exp.currency, baseCurrency);
      }
      return {
        ...exp,
        normalizedAmount,
        categoryId: exp.categoryId,
        categoryName: exp.category?.name || 'Uncategorized',
        categoryColor: exp.category?.color,
        categoryIcon: exp.category?.icon
      };
    }));

    // Calculate Summary
    const summary = {
      totalAmount: normalizedExpenses.reduce((sum, e) => sum + e.normalizedAmount, 0),
      totalCount: normalizedExpenses.length,
      avgTransaction: normalizedExpenses.length > 0
        ? normalizedExpenses.reduce((sum, e) => sum + e.normalizedAmount, 0) / normalizedExpenses.length
        : 0,
      maxTransaction: normalizedExpenses.length > 0
        ? Math.max(...normalizedExpenses.map(e => e.normalizedAmount))
        : 0,
      minTransaction: normalizedExpenses.length > 0
        ? Math.min(...normalizedExpenses.map(e => e.normalizedAmount))
        : 0,
    };

    // Category-wise spending
    const categoryMap = new Map();
    normalizedExpenses.forEach(exp => {
      const catKey = exp.categoryId || 'uncategorized';
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, {
          categoryId: exp.categoryId,
          categoryName: exp.categoryName,
          categoryColor: exp.categoryColor,
          categoryIcon: exp.categoryIcon,
          total: 0,
          count: 0,
          expenses: [] // keep track for avg calculation if needed
        });
      }
      const cat = categoryMap.get(catKey);
      cat.total += exp.normalizedAmount;
      cat.count += 1;
      cat.expenses.push(exp.normalizedAmount);
    });

    const categorySpending = Array.from(categoryMap.values())
      .map(cat => ({
        ...cat,
        avgAmount: cat.total / cat.count,
        percentage: summary.totalAmount > 0 ? (cat.total / summary.totalAmount) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total);

    // Monthly trend (last 6 months) - Requires fetching past data and normalizing
    // Optimization: fetching aggregated data by currency for past months to avoid fetching all rows
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      // Fetch grouped by currency
      const monthData = await db
        .select({
          currency: expenses.currency,
          total: sql`sum(${expenses.amount})`,
          count: sql`count(*)`
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, req.user.id),
            eq(expenses.status, "completed"),
            gte(expenses.date, monthStart),
            lte(expenses.date, monthEnd)
          )
        )
        .groupBy(expenses.currency);

      let monthTotal = 0;
      let monthCount = 0;

      for (const record of monthData) {
        const amount = Number(record.total);
        const currency = record.currency || baseCurrency;
        const normalized = currency !== baseCurrency
          ? await convertAmount(amount, currency, baseCurrency)
          : amount;
        monthTotal += normalized;
        monthCount += Number(record.count);
      }

      monthlyTrend.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        total: monthTotal,
        count: monthCount,
        date: monthStart.toISOString(),
      });
    }

    // Top expenses in period (normalized)
    const topExpenses = [...normalizedExpenses]
      .sort((a, b) => b.normalizedAmount - a.normalizedAmount)
      .slice(0, 10);

    // Payment method breakdown
    const paymentMap = new Map();
    normalizedExpenses.forEach(exp => {
      const method = exp.paymentMethod || 'other';
      if (!paymentMap.has(method)) {
        paymentMap.set(method, {
          method,
          total: 0,
          count: 0
        });
      }
      const pm = paymentMap.get(method);
      pm.total += exp.normalizedAmount;
      pm.count += 1;
    });

    const paymentMethods = Array.from(paymentMap.values())
      .map(pm => ({
        ...pm,
        percentage: summary.totalAmount > 0 ? (pm.total / summary.totalAmount) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: {
        baseCurrency,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          type: period,
        },
        summary,
        categoryBreakdown: categorySpending,
        monthlyTrend,
        topExpenses: topExpenses.map((exp) => ({
          id: exp.id,
          amount: exp.normalizedAmount, // Send normalized amount
          originalAmount: Number(exp.amount),
          currency: baseCurrency,
          originalCurrency: exp.currency,
          description: exp.description,
          date: exp.date,
          category: exp.category,
        })),
        paymentMethods,
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating analytics",
    });
  }
});
/**
 * @swagger
 * /analytics/financial-health:
 *   get:
 *     summary: Get comprehensive financial health score and analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (defaults to start of current month)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (defaults to current date)
 *       - in: query
 *         name: save
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to save the score to history
 *     responses:
 *       200:
 *         description: Financial health analysis with score and predictions
 */
router.get("/financial-health", protect, async (req, res) => {
  try {
    const { startDate, endDate, save = true } = req.query;

    // Default to current month if no dates provided
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    // Calculate financial health
    const healthData = await calculateUserFinancialHealth(req.user.id, start, end);

    // Save to database if requested
    if (save === true || save === 'true') {
      await saveFinancialHealthScore(req.user.id, healthData, start, end);
    }

    // Get comparison with previous period if available
    const comparison = await compareHealthScores(req.user.id);

    res.json({
      success: true,
      data: {
        ...healthData,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        comparison,
      },
    });
  } catch (error) {
    console.error("Financial health calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while calculating financial health",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /analytics/health-history:
 *   get:
 *     summary: Get historical financial health scores
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of historical scores to retrieve
 *     responses:
 *       200:
 *         description: Historical health scores
 */
router.get("/health-history", protect, async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const history = await getHealthScoreHistory(req.user.id, parseInt(limit));

    // Calculate trend
    let trend = 'stable';
    if (history.length >= 2) {
      const recent = history.slice(-3); // Last 3 scores
      const avgRecent = recent.reduce((sum, s) => sum + s.overallScore, 0) / recent.length;
      const older = history.slice(0, Math.min(3, history.length - 3));

      if (older.length > 0) {
        const avgOlder = older.reduce((sum, s) => sum + s.overallScore, 0) / older.length;
        if (avgRecent > avgOlder + 5) trend = 'improving';
        else if (avgRecent < avgOlder - 5) trend = 'declining';
      }
    }

    res.json({
      success: true,
      data: {
        history: history.map(score => ({
          id: score.id,
          overallScore: score.overallScore,
          rating: score.rating,
          breakdown: {
            dti: score.dtiScore,
            savingsRate: score.savingsRateScore,
            volatility: score.volatilityScore,
            emergencyFund: score.emergencyFundScore,
            budgetAdherence: score.budgetAdherenceScore,
            goalProgress: score.goalProgressScore,
          },
          date: score.calculatedAt,
          period: {
            start: score.periodStart,
            end: score.periodEnd,
          },
        })),
        trend,
        count: history.length,
      },
    });
  } catch (error) {
    console.error("Health history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching health history",
    });
  }
});

/**
 * @swagger
 * /analytics/predictions:
 *   get:
 *     summary: Get predictive financial analytics and forecasts
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Financial predictions and forecasts
 */
router.get("/predictions", protect, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;

    // Get current health data which includes predictions
    const healthData = await calculateUserFinancialHealth(req.user.id, start, end);

    res.json({
      success: true,
      data: {
        cashFlowForecast: healthData.cashFlowPrediction,
        insights: healthData.insights.filter(i => i.category === 'Forecast' || i.type === 'warning'),
        spendingPatterns: {
          dayOfWeek: healthData.dayOfWeekAnalysis,
          categoryConcentration: healthData.concentrationMetrics,
        },
        recommendations: [
          healthData.recommendation,
          ...healthData.insights.filter(i => i.priority === 'high' || i.priority === 'critical').map(i => i.message),
        ],
      },
    });
  } catch (error) {
    console.error("Predictions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating predictions",
    });
  }
});

/**
 * @swagger
 * /analytics/insights:
 *   get:
 *     summary: Get AI-powered financial insights and recommendations
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Personalized financial insights
 */
router.get("/insights", protect, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;

    const healthData = await calculateUserFinancialHealth(req.user.id, start, end);

    // Categorize insights by priority
    const categorized = {
      critical: healthData.insights.filter(i => i.priority === 'critical'),
      high: healthData.insights.filter(i => i.priority === 'high'),
      medium: healthData.insights.filter(i => i.priority === 'medium'),
      low: healthData.insights.filter(i => i.priority === 'low'),
    };

    res.json({
      success: true,
      data: {
        overallScore: healthData.overallScore,
        rating: healthData.rating,
        mainRecommendation: healthData.recommendation,
        insights: healthData.insights,
        categorized,
        summary: {
          totalInsights: healthData.insights.length,
          criticalIssues: categorized.critical.length,
          warnings: categorized.high.length,
          opportunities: categorized.low.filter(i => i.type === 'success').length,
        },
      },
    });
  } catch (error) {
    console.error("Insights error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating insights",
    });
  }
});


/**
 * @swagger
 * /analytics/category-trends:
 *   get:
 *     summary: Get category-wise spending trends over time
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Specific category ID to analyze
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Number of months to analyze
 *     responses:
 *       200:
 *         description: Category trends data
 */
router.get("/category-trends", protect, async (req, res) => {
  try {
    const { categoryId, months = 6 } = req.query;
    const now = new Date();
    const monthsToAnalyze = parseInt(months);

    const trends = [];

    for (let i = monthsToAnalyze - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const conditions = [
        eq(expenses.userId, req.user.id),
        eq(expenses.status, "completed"),
        gte(expenses.date, monthStart),
        lte(expenses.date, monthEnd),
      ];

      if (categoryId) {
        conditions.push(eq(expenses.categoryId, categoryId));
      }

      const monthData = await db
        .select({
          categoryId: expenses.categoryId,
          categoryName: categories.name,
          total: sql`sum(${expenses.amount})`,
          count: sql`count(*)`,
        })
        .from(expenses)
        .leftJoin(categories, eq(expenses.categoryId, categories.id))
        .where(and(...conditions))
        .groupBy(expenses.categoryId, categories.name);

      trends.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        date: monthStart.toISOString(),
        categories: monthData.map((item) => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName || 'Uncategorized',
          total: Number(item.total),
          count: Number(item.count),
        })),
      });
    }

    res.json({
      success: true,
      data: { trends },
    });
  } catch (error) {
    console.error("Category trends error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating category trends",
    });
  }
});




/**
 * @swagger
 * /analytics/spending-patterns:
 *   get:
 *     summary: Get advanced spending pattern analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *         description: Analysis period
 *     responses:
 *       200:
 *         description: Spending pattern analysis
 */
router.get("/spending-patterns", protect, async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const now = new Date();

    // Calculate date ranges for comparison
    let currentStart, currentEnd, previousStart, previousEnd;

    switch (period) {
      case "week":
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        currentEnd = now;
        previousStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case "quarter":
        const currentQuarter = Math.floor(now.getMonth() / 3);
        currentStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
        currentEnd = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0);
        previousStart = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
        previousEnd = new Date(now.getFullYear(), currentQuarter * 3, 0);
        break;
      case "year":
        currentStart = new Date(now.getFullYear(), 0, 1);
        currentEnd = new Date(now.getFullYear(), 11, 31);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousEnd = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default: // month
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    // Current period data
    const [currentPeriod] = await db
      .select({
        totalAmount: sql`sum(${expenses.amount})`,
        totalCount: sql`count(*)`,
        avgTransaction: sql`avg(${expenses.amount})`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, req.user.id),
          eq(expenses.status, "completed"),
          gte(expenses.date, currentStart),
          lte(expenses.date, currentEnd)
        )
      );

    // Previous period data for comparison
    const [previousPeriod] = await db
      .select({
        totalAmount: sql`sum(${expenses.amount})`,
        totalCount: sql`count(*)`,
        avgTransaction: sql`avg(${expenses.amount})`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, req.user.id),
          eq(expenses.status, "completed"),
          gte(expenses.date, previousStart),
          lte(expenses.date, previousEnd)
        )
      );

    // Daily spending pattern (last 30 days)
    const dailyPattern = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);

      const [dayData] = await db
        .select({
          total: sql`sum(${expenses.amount})`,
          count: sql`count(*)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, req.user.id),
            eq(expenses.status, "completed"),
            gte(expenses.date, dayStart),
            lte(expenses.date, dayEnd)
          )
        );

      dailyPattern.push({
        date: dayStart.toISOString().split('T')[0],
        total: Number(dayData?.total || 0),
        count: Number(dayData?.count || 0),
        dayOfWeek: dayStart.getDay(),
        dayName: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      });
    }

    // Calculate percentage changes
    const currentTotal = Number(currentPeriod?.totalAmount || 0);
    const previousTotal = Number(previousPeriod?.totalAmount || 0);
    const totalChange = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

    const currentCount = Number(currentPeriod?.totalCount || 0);
    const previousCount = Number(previousPeriod?.totalCount || 0);
    const countChange = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;

    const currentAvg = Number(currentPeriod?.avgTransaction || 0);
    const previousAvg = Number(previousPeriod?.avgTransaction || 0);
    const avgChange = previousAvg > 0 ? ((currentAvg - previousAvg) / previousAvg) * 100 : 0;

    res.json({
      success: true,
      data: {
        period: {
          current: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
          previous: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
          type: period,
        },
        comparison: {
          current: {
            totalAmount: currentTotal,
            totalCount: currentCount,
            avgTransaction: currentAvg,
          },
          previous: {
            totalAmount: previousTotal,
            totalCount: previousCount,
            avgTransaction: previousAvg,
          },
          changes: {
            totalAmount: { value: totalChange, trend: totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'stable' },
            totalCount: { value: countChange, trend: countChange > 0 ? 'up' : countChange < 0 ? 'down' : 'stable' },
            avgTransaction: { value: avgChange, trend: avgChange > 0 ? 'up' : avgChange < 0 ? 'down' : 'stable' },
          },
        },
        dailyPattern,
        insights: {
          highestSpendingDay: dailyPattern.reduce((max, day) => day.total > max.total ? day : max, dailyPattern[0]),
          averageDailySpending: dailyPattern.reduce((sum, day) => sum + day.total, 0) / dailyPattern.length,
          spendingFrequency: dailyPattern.filter(day => day.count > 0).length,
        },
      },
    });
  } catch (error) {
    console.error("Spending patterns error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while analyzing spending patterns",
    });
  }
});

/**
 * @swagger
 * /analytics/export:
 *   get:
 *     summary: Export analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *         description: Export format
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for export
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for export
 *     responses:
 *       200:
 *         description: Exported data
 */
router.get("/export", protect, async (req, res) => {
  try {
    const { format = "csv", startDate, endDate } = req.query;

    // Default to last 3 months if no dates provided
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const end = endDate ? new Date(endDate) : now;

    // Get detailed expense data
    const expenseData = await db.query.expenses.findMany({
      where: and(
        eq(expenses.userId, req.user.id),
        eq(expenses.status, "completed"),
        gte(expenses.date, start),
        lte(expenses.date, end)
      ),
      with: {
        category: {
          columns: { name: true, color: true, icon: true },
        },
      },
      orderBy: [desc(expenses.date)],
    });

    const exportData = expenseData.map((expense) => ({
      id: expense.id,
      date: expense.date.toISOString().split('T')[0],
      amount: Number(expense.amount),
      currency: expense.currency,
      description: expense.description,
      category: expense.category?.name || 'Uncategorized',
      subcategory: expense.subcategory || '',
      paymentMethod: expense.paymentMethod,
      notes: expense.notes || '',
    }));

    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'Date,Amount,Currency,Description,Category,Subcategory,Payment Method,Notes\n';
      const csvRows = exportData.map(row =>
        `${row.date},${row.amount},${row.currency},"${row.description}","${row.category}","${row.subcategory}","${row.paymentMethod}","${row.notes}"`
      ).join('\n');

      const csvContent = csvHeader + csvRows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="wealth-vault-expenses-${start.toISOString().split('T')[0]}-to-${end.toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: {
          exportInfo: {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            totalRecords: exportData.length,
            exportedAt: new Date().toISOString(),
          },
          expenses: exportData,
        },
      });
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while exporting data",
    });
  }
});

/**
 * @swagger
 * /analytics/normalized-summary:
 *   get:
 *     summary: Get spending summary normalized to user's base currency
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Normalized spending analytics
 */
router.get("/normalized-summary", protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get user's base currency
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    const baseCurrency = user?.currency || 'USD';

    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all expenses in date range
    const userExpenses = await db.query.expenses.findMany({
      where: and(
        eq(expenses.userId, req.user.id),
        eq(expenses.status, "completed"),
        gte(expenses.date, start),
        lte(expenses.date, end)
      ),
      with: {
        category: {
          columns: { name: true, color: true, icon: true }
        }
      }
    });

    // Normalize all amounts to base currency
    const normalizedExpenses = await Promise.all(
      userExpenses.map(async (expense) => {
        const normalizedAmount = expense.currency && expense.currency !== baseCurrency
          ? await convertAmount(Number(expense.amount), expense.currency, baseCurrency)
          : Number(expense.amount);

        return {
          ...expense,
          originalAmount: Number(expense.amount),
          originalCurrency: expense.currency || baseCurrency,
          normalizedAmount,
          normalizedCurrency: baseCurrency
        };
      })
    );

    // Calculate totals
    const totalNormalized = normalizedExpenses.reduce((sum, exp) => sum + exp.normalizedAmount, 0);
    const totalOriginal = userExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

    // Category breakdown with normalization
    const categoryBreakdown = {};
    normalizedExpenses.forEach(exp => {
      const catName = exp.category?.name || 'Uncategorized';
      if (!categoryBreakdown[catName]) {
        categoryBreakdown[catName] = {
          category: catName,
          color: exp.category?.color,
          icon: exp.category?.icon,
          total: 0,
          count: 0
        };
      }
      categoryBreakdown[catName].total += exp.normalizedAmount;
      categoryBreakdown[catName].count += 1;
    });

    // Currency breakdown
    const currencyBreakdown = {};
    userExpenses.forEach(exp => {
      const curr = exp.currency || baseCurrency;
      if (!currencyBreakdown[curr]) {
        currencyBreakdown[curr] = { currency: curr, total: 0, count: 0 };
      }
      currencyBreakdown[curr].total += Number(exp.amount);
      currencyBreakdown[curr].count += 1;
    });

    res.json({
      success: true,
      data: {
        baseCurrency,
        dateRange: { start, end },
        summary: {
          totalNormalized: Number(totalNormalized.toFixed(2)),
          totalOriginal: Number(totalOriginal.toFixed(2)),
          currency: baseCurrency,
          expenseCount: normalizedExpenses.length,
          avgExpense: Number((totalNormalized / normalizedExpenses.length || 0).toFixed(2))
        },
        categoryBreakdown: Object.values(categoryBreakdown).sort((a, b) => b.total - a.total),
        currencyBreakdown: Object.values(currencyBreakdown),
        expenses: normalizedExpenses
      }
    });
  } catch (error) {
    console.error("Normalized summary error:", error);
    res.status(500).json({
      success: false,
      message: "Error calculating normalized summary",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /analytics/exchange-rates:
 *   get:
 *     summary: Get current exchange rates for user's base currency
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Exchange rates data
 */
router.get("/exchange-rates", protect, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    const baseCurrency = user?.currency || 'USD';

    const rates = await getAllRates(baseCurrency);

    res.json({
      success: true,
      data: {
        baseCurrency,
        rates: rates.map(r => ({
          currency: r.targetCurrency,
          rate: r.rate,
          validFrom: r.validFrom,
          validUntil: r.validUntil,
          source: r.source
        })),
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error("Exchange rates error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching exchange rates",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /analytics/generate-monthly-report:
 *   post:
 *     summary: Manually trigger monthly report generation
 *     tags: [Analytics]
 */
router.post("/generate-monthly-report", protect, async (req, res) => {
  const { year, month } = req.body;
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  try {
    const report = await reportService.generateMonthlyReport(req.user.id, targetYear, targetMonth);
    res.success(report, "Monthly report generated successfully");
  } catch (error) {
    console.error("Manual report generation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /analytics/portfolio
 * @desc    Get complete portfolio overview (assets + projections)
 */
router.get("/portfolio", protect, async (req, res) => {
  try {
    const [assets, portfolio, latestSimulation] = await Promise.all([
      assetService.getUserAssets(req.user.id),
      assetService.getPortfolioValue(req.user.id),
      projectionEngine.getSimulationHistory(req.user.id).then(sims => sims[0] || null)
    ]);

    // Get financial state for context
    const financialState = await projectionEngine.getCurrentFinancialState(req.user.id, true);

    res.success({
      assets,
      portfolio,
      financialState,
      latestProjection: latestSimulation
    });
  } catch (error) {
    console.error("Portfolio analytics error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /analytics/net-worth-projection
 * @desc    Quick projection for dashboard widgets
 */
router.get("/net-worth-projection", protect, async (req, res) => {
  try {
    const { years = 10 } = req.query;

    // Run a lightweight simulation (fewer iterations)
    const result = await projectionEngine.runSimulation(req.user.id, {
      timeHorizon: parseInt(years),
      iterations: 500, // Faster for real-time
      includeAssets: true
    });

    res.success(result);
  } catch (error) {
    console.error("Projection error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /analytics/asset-allocation
 * @desc    Get asset allocation breakdown
 */
router.get("/asset-allocation", protect, async (req, res) => {
  try {
    const assets = await assetService.getUserAssets(req.user.id);

    const allocation = assets.reduce((acc, asset) => {
      const category = asset.category;
      const value = parseFloat(asset.currentValue);

      if (!acc[category]) {
        acc[category] = { count: 0, totalValue: 0 };
      }

      acc[category].count++;
      acc[category].totalValue += value;

      return acc;
    }, {});

    const totalValue = Object.values(allocation).reduce((sum, cat) => sum + cat.totalValue, 0);

    const formatted = Object.entries(allocation).map(([category, data]) => ({
      category,
      count: data.count,
      value: data.totalValue,
      percentage: totalValue > 0 ? ((data.totalValue / totalValue) * 100).toFixed(2) : 0
    }));

    res.success({
      allocation: formatted,
      totalValue
    });
  } catch (error) {
    console.error("Asset allocation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// DEBT ANALYTICS ENDPOINTS
// ============================================

/**
 * @route   GET /analytics/debt-to-income
 * @desc    Calculate debt-to-income ratio
 */
router.get("/debt-to-income", protect, async (req, res) => {
  try {
    // Get user's monthly income
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    const monthlyIncome = req.body.monthlyIncome 
      ? parseFloat(req.body.monthlyIncome) 
      : user?.monthlyIncome 
        ? parseFloat(user.monthlyIncome) 
        : 0;

    if (monthlyIncome <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monthly income is required to calculate DTI ratio"
      });
    }

    // Get all active debts
    const userDebts = await db.query.debts.findMany({
      where: and(
        eq(debtsTable.userId, req.user.id),
        eq(debtsTable.isActive, true)
      )
    });

    // Calculate total monthly debt payments
    const breakdown = {
      creditCards: 0,
      loans: 0,
      mortgage: 0,
      other: 0
    };

    userDebts.forEach(debt => {
      const payment = parseFloat(debt.minimumPayment);
      switch (debt.debtType) {
        case 'credit_card':
          breakdown.creditCards += payment;
          break;
        case 'personal_loan':
        case 'student_loan':
        case 'auto_loan':
        case 'medical':
          breakdown.loans += payment;
          break;
        case 'mortgage':
          breakdown.mortgage += payment;
          break;
        default:
          breakdown.other += payment;
      }
    });

    const totalMonthlyDebt = breakdown.creditCards + breakdown.loans + breakdown.mortgage + breakdown.other;
    const dtiRatio = (totalMonthlyDebt / monthlyIncome) * 100;

    // Determine DTI category
    let dtiCategory;
    if (dtiRatio < 20) dtiCategory = 'Excellent';
    else if (dtiRatio < 30) dtiCategory = 'Good';
    else if (dtiRatio < 40) dtiCategory = 'Fair';
    else if (dtiRatio < 50) dtiCategory = 'Poor';
    else dtiCategory = 'Critical';

    // Generate recommendations
    const recommendations = [];
    if (dtiRatio > 40) {
      recommendations.push({
        priority: 'high',
        message: 'Consider focusing on high-interest debts first to reduce your DTI quickly.'
      });
    }
    if (breakdown.creditCards > totalMonthlyDebt * 0.5) {
      recommendations.push({
        priority: 'medium',
        message: 'Credit card debt is a significant portion of your payments. Consider a balance transfer.'
      });
    }
    if (dtiRatio < 30) {
      recommendations.push({
        priority: 'low',
        message: 'Your DTI is in a healthy range. Consider increasing savings or investments.'
      });
    }

    res.json({
      success: true,
      data: {
        dtiRatio: Math.round(dtiRatio * 100) / 100,
        dtiCategory,
        totalMonthlyDebt: Math.round(totalMonthlyDebt * 100) / 100,
        monthlyIncome: Math.round(monthlyIncome * 100) / 100,
        breakdown,
        recommendations
      }
    });
  } catch (error) {
    console.error("Debt-to-income error:", error);
    res.status(500).json({
      success: false,
      message: "Server error calculating debt-to-income ratio",
      error: error.message
    });
  }
});

/**
 * @route   GET /analytics/debt-freedom
 * @desc    Calculate debt freedom date with payoff strategies
 */
router.get("/debt-freedom", protect, async (req, res) => {
  try {
    const { strategy = 'snowball', extra_payment = 0 } = req.query;
    const extraPayment = parseFloat(extra_payment) || 0;

    // Get all active debts
    const userDebts = await db.query.debts.findMany({
      where: and(
        eq(debtsTable.userId, req.user.id),
        eq(debtsTable.isActive, true)
      )
    });

    if (userDebts.length === 0) {
      return res.json({
        success: true,
        data: {
          debtFreeDate: new Date().toISOString(),
          monthsRemaining: 0,
          totalInterest: 0,
          totalPrincipal: 0,
          payoffOrder: [],
          milestones: [],
          strategy,
          message: 'No active debts found'
        }
      });
    }

    // Prepare debts array for optimizer
    const debtsArray = userDebts.map(debt => ({
      id: debt.id,
      name: debt.name,
      balance: parseFloat(debt.currentBalance),
      apr: parseFloat(debt.apr),
      minimumPayment: parseFloat(debt.minimumPayment)
    }));

    let result;
    if (strategy === 'avalanche') {
      result = await payoffOptimizer.calculateAvalancheStrategy(debtsArray, extraPayment);
    } else {
      result = await payoffOptimizer.calculateSnowballStrategy(debtsArray, extraPayment);
    }

    // Build payoff order
    const payoffOrder = strategy === 'avalanche'
      ? [...debtsArray].sort((a, b) => b.apr - a.apr).map(d => ({ id: d.id, name: d.name, apr: d.apr }))
      : [...debtsArray].sort((a, b) => a.balance - b.balance).map(d => ({ id: d.id, name: d.name, balance: d.balance }));

    // Create milestones
    const milestones = [];
    if (result.milestones && result.milestones.length > 0) {
      milestones.push(...result.milestones);
    }

    // Add final payoff milestone
    milestones.push({
      name: 'Debt Freedom Day',
      date: payoffOptimizer.formatDate(result.debtFreeDate),
      remainingDebt: 0,
      totalInterest: result.totalInterest
    });

    res.json({
      success: true,
      data: {
        debtFreeDate: result.debtFreeDate.toISOString(),
        monthsRemaining: result.monthsToFreedom,
        totalInterest: result.totalInterest,
        totalPrincipal: result.totalPrincipal || debtsArray.reduce((sum, d) => sum + d.balance, 0),
        payoffOrder,
        milestones,
        strategy
      }
    });
  } catch (error) {
    console.error("Debt freedom calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error calculating debt freedom date",
      error: error.message
    });
  }
});

/**
 * @route   GET /analytics/debt-summary
 * @desc    Get comprehensive debt summary
 */
router.get("/debt-summary", protect, async (req, res) => {
  try {
    // Get all active debts
    const userDebts = await db.query.debts.findMany({
      where: and(
        eq(debtsTable.userId, req.user.id),
        eq(debtsTable.isActive, true)
      )
    });

    // Calculate totals
    let totalDebt = 0;
    let totalMonthlyPayment = 0;
    let weightedAvgApr = 0;
    let totalPrincipal = 0;
    const debtByType = {};

    userDebts.forEach(debt => {
      const balance = parseFloat(debt.currentBalance);
      const payment = parseFloat(debt.minimumPayment);
      const apr = parseFloat(debt.apr);

      totalDebt += balance;
      totalMonthlyPayment += payment;
      totalPrincipal += balance;

      if (!debtByType[debt.debtType]) {
        debtByType[debt.debtType] = { balance: 0, percentage: 0, count: 0 };
      }
      debtByType[debt.debtType].balance += balance;
      debtByType[debt.debtType].count += 1;
    });

    // Calculate weighted average APR
    if (totalDebt > 0) {
      weightedAvgApr = userDebts.reduce((sum, debt) => {
        return sum + (parseFloat(debt.apr) * parseFloat(debt.currentBalance));
      }, 0) / totalDebt;
    }

    const monthlyInterest = totalDebt * (weightedAvgApr / 12);
    const yearlyInterest = monthlyInterest * 12;

    Object.keys(debtByType).forEach(type => {
      debtByType[type].percentage = totalDebt > 0 
        ? (debtByType[type].balance / totalDebt) * 100 
        : 0;
      debtByType[type].balance = Math.round(debtByType[type].balance * 100) / 100;
      debtByType[type].percentage = Math.round(debtByType[type].percentage * 100) / 100;
    });

    // Get DTI ratio
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    const monthlyIncome = user?.monthlyIncome ? parseFloat(user.monthlyIncome) : 1;
    const dtiRatio = monthlyIncome > 0 ? (totalMonthlyPayment / monthlyIncome) * 100 : 0;

    // Calculate debt freedom date
    const debtFreeDate = await payoffOptimizer.calculateDebtFreeDate(
      userDebts.map(d => ({
        balance: parseFloat(d.currentBalance),
        apr: parseFloat(d.apr),
        minimumPayment: parseFloat(d.minimumPayment)
      }))
    );

    res.json({
      success: true,
      data: {
        totalDebt: Math.round(totalDebt * 100) / 100,
        totalMonthlyPayment: Math.round(totalMonthlyPayment * 100) / 100,
        weightedAvgApr: Math.round(weightedAvgApr * 1000) / 1000,
        debtByType,
        monthlyInterest: Math.round(monthlyInterest * 100) / 100,
        yearlyInterest: Math.round(yearlyInterest * 100) / 100,
        debtFreeDate: debtFreeDate?.toISOString() || null,
        dtiRatio: Math.round(dtiRatio * 100) / 100,
        debtCount: userDebts.length
      }
    });
  } catch (error) {
    console.error("Debt summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error calculating debt summary",
      error: error.message
    });
  }
});

/**
 * @route   GET /analytics/debt-trends
 * @desc    Get debt payment trends
 */
router.get("/debt-trends", protect, async (req, res) => {
  try {
    const { period = 'monthly', months = 12 } = req.query;
    const monthsToAnalyze = parseInt(months);
    const now = new Date();

    // Get payment history
    const trends = [];

    if (period === 'monthly') {
      for (let i = monthsToAnalyze - 1; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

        const [paymentData] = await db
          .select({
            totalPaid: sql`sum(${debtPayments.paymentAmount})`,
            principalPaid: sql`sum(${debtPayments.principalPayment})`,
            interestPaid: sql`sum(${debtPayments.interestPayment})`
          })
          .from(debtPayments)
          .where(
            and(
              eq(debtPayments.userId, req.user.id),
              gte(debtPayments.paymentDate, monthStart),
              lte(debtPayments.paymentDate, monthEnd)
            )
          );

        // Get debt balance at end of month
        const [debtBalanceData] = await db
          .select({
            totalBalance: sql`sum(${debtsTable.currentBalance})`
          })
          .from(debtsTable)
          .where(
            and(
              eq(debtsTable.userId, req.user.id),
              eq(debtsTable.isActive, true)
            )
          );

        trends.push({
          period: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          date: monthStart.toISOString(),
          totalPaid: Number(paymentData?.totalPaid || 0),
          principalPaid: Number(paymentData?.principalPaid || 0),
          interestPaid: Number(paymentData?.interestPaid || 0),
          debtBalance: Number(debtBalanceData?.totalBalance || 0)
        });
      }
    } else {
      // Yearly trends
      for (let i = 4; i >= 0; i--) {
        const yearStart = new Date(now.getFullYear() - i, 0, 1);
        const yearEnd = new Date(now.getFullYear() - i + 1, 0, 0);

        const [paymentData] = await db
          .select({
            totalPaid: sql`sum(${debtPayments.paymentAmount})`,
            principalPaid: sql`sum(${debtPayments.principalPayment})`,
            interestPaid: sql`sum(${debtPayments.interestPayment})`
          })
          .from(debtPayments)
          .where(
            and(
              eq(debtPayments.userId, req.user.id),
              gte(debtPayments.paymentDate, yearStart),
              lte(debtPayments.paymentDate, yearEnd)
            )
          );

        trends.push({
          period: (now.getFullYear() - i).toString(),
          date: yearStart.toISOString(),
          totalPaid: Number(paymentData?.totalPaid || 0),
          principalPaid: Number(paymentData?.principalPaid || 0),
          interestPaid: Number(paymentData?.interestPaid || 0)
        });
      }
    }

    // Calculate growth rate
    let growthRate = 0;
    if (trends.length >= 2) {
      const first = trends[0];
      const last = trends[trends.length - 1];
      if (first.debtBalance > 0) {
        growthRate = ((last.debtBalance - first.debtBalance) / first.debtBalance) * 100;
      }
    }

    res.json({
      success: true,
      data: {
        trends,
        growthRate: Math.round(growthRate * 100) / 100,
        period,
        monthsAnalyzed: monthsToAnalyze
      }
    });
  } catch (error) {
    console.error("Debt trends error:", error);
    res.status(500).json({
      success: false,
      message: "Server error calculating debt trends",
      error: error.message
    });
  }
});

/**
 * @route   GET /analytics/debt-health
 * @desc    Calculate overall debt health score
 */
router.get("/debt-health", protect, async (req, res) => {
  try {
    // Get all active debts
    const userDebts = await db.query.debts.findMany({
      where: and(
        eq(debtsTable.userId, req.user.id),
        eq(debtsTable.isActive, true)
      )
    });

    // Get user income for DTI calculation
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    const monthlyIncome = user?.monthlyIncome ? parseFloat(user.monthlyIncome) : 1;

    // Calculate DTI score (0-25)
    let dtiScore = 25;
    let totalMonthlyDebt = 0;

    userDebts.forEach(debt => {
      totalMonthlyDebt += parseFloat(debt.minimumPayment);
    });

    const dtiRatio = monthlyIncome > 0 ? (totalMonthlyDebt / monthlyIncome) * 100 : 100;
    if (dtiRatio > 50) dtiScore = 0;
    else if (dtiRatio > 40) dtiScore = 5;
    else if (dtiRatio > 30) dtiScore = 10;
    else if (dtiRatio > 20) dtiScore = 18;
    else if (dtiRatio > 10) dtiScore = 22;

    // Calculate APR score (0-25)
    let aprScore = 25;
    if (userDebts.length > 0) {
      const avgApr = userDebts.reduce((sum, d) => sum + parseFloat(d.apr), 0) / userDebts.length;
      if (avgApr > 0.25) aprScore = 5;
      else if (avgApr > 0.20) aprScore = 10;
      else if (avgApr > 0.15) aprScore = 15;
      else if (avgApr > 0.10) aprScore = 20;
    }

    // Calculate diversity score (0-25)
    const debtTypes = new Set(userDebts.map(d => d.debtType));
    let diversityScore = Math.min(debtTypes.size * 5, 25);

    // Calculate progress score (0-25)
    let progressScore = 25;
    if (userDebts.length > 0) {
      const totalOriginal = userDebts.reduce((sum, d) => {
        return sum + parseFloat(d.principalAmount || d.currentBalance);
      }, 0);
      const totalCurrent = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
      const progress = totalOriginal > 0 ? ((totalOriginal - totalCurrent) / totalOriginal) * 100 : 0;
      progressScore = Math.min(progress, 25);
    }

    const healthScore = dtiScore + aprScore + diversityScore + progressScore;

    // Determine rating
    let rating;
    if (healthScore >= 85) rating = 'excellent';
    else if (healthScore >= 70) rating = 'good';
    else if (healthScore >= 50) rating = 'fair';
    else rating = 'poor';

    // Generate recommendations
    const recommendations = [];
    if (dtiScore < 15) {
      recommendations.push({
        priority: 'high',
        message: 'Your debt-to-income ratio is high. Consider increasing payments or consolidating debts.'
      });
    }
    if (aprScore < 15) {
      recommendations.push({
        priority: 'medium',
        message: 'Your average APR is high. Look into refinancing or balance transfer options.'
      });
    }
    if (progressScore < 10) {
      recommendations.push({
        priority: 'medium',
        message: 'Make consistent payments to reduce your debt faster and improve your credit score.'
      });
    }
    if (healthScore >= 85) {
      recommendations.push({
        priority: 'low',
        message: 'Great job! Consider redirecting freed-up funds to investments or savings.'
      });
    }

    res.json({
      success: true,
      data: {
        healthScore: Math.round(healthScore),
        factors: {
          dtiScore: Math.round(dtiScore),
          aprScore: Math.round(aprScore),
          diversityScore: Math.round(diversityScore),
          progressScore: Math.round(progressScore)
        },
        rating,
        recommendations,
        summary: {
          totalDebts: userDebts.length,
          totalBalance: Math.round(userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0) * 100) / 100,
          avgApr: userDebts.length > 0 
            ? Math.round((userDebts.reduce((sum, d) => sum + parseFloat(d.apr), 0) / userDebts.length) * 1000) / 10 
            : 0
        }
      }
    });
  } catch (error) {
    console.error("Debt health error:", error);
    res.status(500).json({
      success: false,
      message: "Server error calculating debt health",
      error: error.message
    });
  }
});

/**
 * @route   GET /analytics/debt-insights
 * @desc    Get AI-powered debt insights and refinance opportunities
 */
router.get("/debt-insights", protect, async (req, res) => {
  try {
    // Get all active debts
    const userDebts = await db.query.debts.findMany({
      where: and(
        eq(debtsTable.userId, req.user.id),
        eq(debtsTable.isActive, true)
      )
    });

    // Get market rates for comparison
    const marketRates = await refinanceScout.getCurrentMarketRates();

    const insights = [];
    let refinanceOpportunities = [];
    let consolidationAnalysis = null;

    // Analyze each debt
    userDebts.forEach(debt => {
      const currentApr = parseFloat(debt.apr);
      const balance = parseFloat(debt.currentBalance);
      const type = debt.debtType;

      // Check for high APR warning
      if (marketRates[type]) {
        const { avg } = marketRates[type];
        if (currentApr > avg + 0.03) {
          insights.push({
            type: 'warning',
            title: `High APR on ${debt.name}`,
            description: `Your APR of ${(currentApr * 100).toFixed(1)}% is ${((currentApr - avg) * 100).toFixed(1)}% higher than the current market average of ${(avg * 100).toFixed(1)}%.`,
            action: 'Consider refinancing this debt to save on interest.'
          });

          // Add to refinance opportunities
          refinanceOpportunities.push({
            debtId: debt.id,
            debtName: debt.name,
            currentApr: currentApr * 100,
            marketAvgApr: avg * 100,
            potentialSavings: Math.round((currentApr - avg) * balance * 0.5 * 100) / 100
          });
        }
      }

      // Check for good payment history
      if (currentApr < 0.10) {
        insights.push({
          type: 'success',
          title: `Good Rate on ${debt.name}`,
          description: `Your APR of ${(currentApr * 100).toFixed(1)}% is competitive.`,
          action: 'Consider prioritizing higher-rate debts first.'
        });
      }
    });

    // Consolidation analysis
    if (userDebts.length >= 2) {
      const totalBalance = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
      const weightedAvgApr = userDebts.reduce((sum, d) => sum + parseFloat(d.apr) * parseFloat(d.currentBalance), 0) / totalBalance;

      consolidationAnalysis = {
        eligible: totalBalance >= 5000,
        potentialBenefit: weightedAvgApr > 0.12 ? 'high' : weightedAvgApr > 0.08 ? 'medium' : 'low',
        recommendation: weightedAvgApr > 0.15 
          ? 'Consider a debt consolidation loan to simplify payments and reduce interest.'
          : 'Your current rates are relatively good. Consolidation may not provide significant savings.'
      };
    }

    // General insights
    if (userDebts.length === 0) {
      insights.push({
        type: 'success',
        title: 'Debt Free',
        description: 'You have no active debts!',
        action: 'Focus on building wealth and increasing your emergency fund.'
      });
    }

    // Sort insights by priority
    const priorityOrder = { warning: 0, info: 1, success: 2 };
    insights.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);

    res.json({
      success: true,
      data: {
        insights,
        refinanceOpportunities: refinanceOpportunities.sort((a, b) => b.potentialSavings - a.potentialSavings),
        consolidationAnalysis,
        summary: {
          totalDebts: userDebts.length,
          highPriorityIssues: insights.filter(i => i.type === 'warning').length,
          opportunities: refinanceOpportunities.length
        }
      }
    });
  } catch (error) {
    console.error("Debt insights error:", error);
    res.status(500).json({
      success: false,
      message: "Server error generating debt insights",
      error: error.message
    });
  }
});

export default router;

