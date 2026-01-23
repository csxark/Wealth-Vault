import express from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories } from "../db/schema.js";
import { protect } from "../middleware/auth.js";

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

    // Category-wise spending
    const categorySpending = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        total: sql`sum(${expenses.amount})`,
        count: sql`count(*)`,
        avgAmount: sql`avg(${expenses.amount})`,
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(expenses.categoryId, categories.name, categories.color, categories.icon)
      .orderBy(desc(sql`sum(${expenses.amount})`));

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const [monthData] = await db
        .select({
          total: sql`sum(${expenses.amount})`,
          count: sql`count(*)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, req.user.id),
            eq(expenses.status, "completed"),
            gte(expenses.date, monthStart),
            lte(expenses.date, monthEnd)
          )
        );

      monthlyTrend.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        total: Number(monthData?.total || 0),
        count: Number(monthData?.count || 0),
        date: monthStart.toISOString(),
      });
    }

    // Top expenses in period
    const topExpenses = await db.query.expenses.findMany({
      where: and(...conditions),
      orderBy: [desc(expenses.amount)],
      limit: 10,
      with: {
        category: {
          columns: { name: true, color: true, icon: true },
        },
      },
    });

    // Payment method breakdown
    const paymentMethods = await db
      .select({
        paymentMethod: expenses.paymentMethod,
        total: sql`sum(${expenses.amount})`,
        count: sql`count(*)`,
      })
      .from(expenses)
      .where(and(...conditions))
      .groupBy(expenses.paymentMethod)
      .orderBy(desc(sql`sum(${expenses.amount})`));

    // Overall summary
    const [summary] = await db
      .select({
        totalAmount: sql`sum(${expenses.amount})`,
        totalCount: sql`count(*)`,
        avgTransaction: sql`avg(${expenses.amount})`,
        maxTransaction: sql`max(${expenses.amount})`,
        minTransaction: sql`min(${expenses.amount})`,
      })
      .from(expenses)
      .where(and(...conditions));

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          type: period,
        },
        summary: {
          totalAmount: Number(summary?.totalAmount || 0),
          totalCount: Number(summary?.totalCount || 0),
          avgTransaction: Number(summary?.avgTransaction || 0),
          maxTransaction: Number(summary?.maxTransaction || 0),
          minTransaction: Number(summary?.minTransaction || 0),
        },
        categoryBreakdown: categorySpending.map((item) => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName || 'Uncategorized',
          categoryColor: item.categoryColor || '#6b7280',
          categoryIcon: item.categoryIcon || 'circle',
          total: Number(item.total),
          count: Number(item.count),
          avgAmount: Number(item.avgAmount),
          percentage: summary?.totalAmount ? (Number(item.total) / Number(summary.totalAmount)) * 100 : 0,
        })),
        monthlyTrend,
        topExpenses: topExpenses.map((exp) => ({
          id: exp.id,
          amount: Number(exp.amount),
          description: exp.description,
          date: exp.date,
          category: exp.category,
        })),
        paymentMethods: paymentMethods.map((pm) => ({
          method: pm.paymentMethod,
          total: Number(pm.total),
          count: Number(pm.count),
          percentage: summary?.totalAmount ? (Number(pm.total) / Number(summary.totalAmount)) * 100 : 0,
        })),
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

export default router;

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