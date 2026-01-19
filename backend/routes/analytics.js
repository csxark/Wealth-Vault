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