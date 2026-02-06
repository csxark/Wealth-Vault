import express from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, users, debts, debtPayments, payoffStrategies, amortizationSchedules } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { convertAmount, getAllRates } from "../services/currencyService.js";
import assetService from "../services/assetService.js";
import projectionEngine from "../services/projectionEngine.js";
import marketData from "../services/marketData.js";

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
    const monthlyIncome = parseFloat(user.monthlyIncome || 0);

    if (monthlyIncome <= 0) {
      return res.status(400).json({ success: false, message: "Please set your monthly income in profile to calculate DTI" });
    }

    // Get all active debts
    const userDebts = await db.select().from(debts).where(and(eq(debts.userId, req.user.id), eq(debts.isActive, true)));

    // Calculate total monthly minimum payments
    const totalMonthlyDebtPayments = userDebts.reduce((sum, debt) => sum + parseFloat(debt.minimumPayment), 0);

    const dtiRatio = (totalMonthlyDebtPayments / monthlyIncome) * 100;

    let healthStatus = 'good';
    if (dtiRatio > 50) healthStatus = 'critical';
    else if (dtiRatio > 43) healthStatus = 'danger';
    else if (dtiRatio > 36) healthStatus = 'warning';

    res.json({
      success: true,
      data: {
        monthlyIncome,
        totalMonthlyDebtPayments,
        dtiRatio: parseFloat(dtiRatio.toFixed(2)),
        healthStatus,
        recommendation: dtiRatio > 36
          ? "Your DTI is high. Consider debt consolidation and aggressive payoff strategies."
          : "Your DTI is within healthy limits."
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /analytics/debt-summary
 * @desc    Get comprehensive debt summary and consolidation eligibility
 */
router.get("/debt-summary", protect, async (req, res) => {
  try {
    const userDebts = await db.select().from(debts).where(and(eq(debts.userId, req.user.id), eq(debts.isActive, true)));

    if (userDebts.length === 0) {
      return res.json({ success: true, data: { hasDebt: false, message: "No active debts found" } });
    }

    const totalBalance = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
    const weightedAvgApr = userDebts.reduce((sum, d) => sum + (parseFloat(d.apr) * parseFloat(d.currentBalance)), 0) / totalBalance;

    // Consolidation analysis
    let consolidationAnalysis = {
      eligible: totalBalance >= 5000,
      potentialBenefit: weightedAvgApr > 0.12 ? 'high' : weightedAvgAvgApr > 0.08 ? 'medium' : 'low',
      recommendation: weightedAvgApr > 0.15
        ? "Highly recommended to consolidate into a lower-interest personal loan."
        : "Compare current rates to see if refinancing can save you money."
    };

    res.json({
      success: true,
      data: {
        hasDebt: true,
        totalBalance,
        weightedAvgApr: parseFloat((weightedAvgApr * 100).toFixed(2)),
        debtCount: userDebts.length,
        consolidationAnalysis,
        debtsBreakdown: userDebts.map(d => ({
          name: d.name,
          balance: d.currentBalance,
          apr: d.apr,
          type: d.debtType
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

