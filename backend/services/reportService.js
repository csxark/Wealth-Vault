import PDFDocument from 'pdfkit';
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, goals } from "../db/schema.js";
import geminiService from './geminiservice.js';

class ReportService {
  async generateMonthlyReport(userId, year, month) {
    try {
      // Calculate date range for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of the month

      // Fetch analytics data
      const analyticsData = await this.getAnalyticsData(userId, startDate, endDate);

      // Fetch goals data
      const goalsData = await this.getGoalsData(userId);

      // Generate AI insights
      const aiInsights = await this.generateAIInsights(analyticsData, goalsData, year, month);

      // Generate PDF
      const pdfBuffer = await this.createPDF(analyticsData, goalsData, aiInsights, year, month);

      return pdfBuffer;
    } catch (error) {
      console.error('Error generating monthly report:', error);
      throw new Error('Failed to generate monthly report');
    }
  }

  async getAnalyticsData(userId, startDate, endDate) {
    const conditions = [
      eq(expenses.userId, userId),
      eq(expenses.status, "completed"),
      gte(expenses.date, startDate),
      lte(expenses.date, endDate),
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

    // Top expenses
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

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        month: startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
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
    };
  }

  async getGoalsData(userId) {
    const userGoals = await db.query.goals.findMany({
      where: eq(goals.userId, userId),
      with: {
        category: {
          columns: { name: true, color: true, icon: true },
        },
      },
    });

    // Calculate progress for each goal
    const goalsWithProgress = userGoals.map(goal => {
      const currentAmount = parseFloat(goal.currentAmount || 0);
      const targetAmount = parseFloat(goal.targetAmount);
      const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;

      return {
        id: goal.id,
        title: goal.title,
        targetAmount: targetAmount,
        currentAmount: currentAmount,
        progress: Math.min(progress, 100),
        status: goal.status,
        deadline: goal.deadline,
        category: goal.category,
      };
    });

    return {
      goals: goalsWithProgress,
      summary: {
        total: goalsWithProgress.length,
        active: goalsWithProgress.filter(g => g.status === 'active').length,
        completed: goalsWithProgress.filter(g => g.status === 'completed').length,
        averageProgress: goalsWithProgress.length > 0
          ? goalsWithProgress.reduce((sum, g) => sum + g.progress, 0) / goalsWithProgress.length
          : 0,
      },
    };
  }

  async generateAIInsights(analyticsData, goalsData, year, month) {
    try {
      const prompt = `Analyze this financial data for ${analyticsData.period.month} and provide 3-4 key insights:

Spending Summary:
- Total spent: ₹${analyticsData.summary.totalAmount.toLocaleString()}
- Number of transactions: ${analyticsData.summary.totalCount}
- Average transaction: ₹${analyticsData.summary.avgTransaction.toFixed(2)}

Top Categories:
${analyticsData.categoryBreakdown.slice(0, 5).map(cat =>
  `- ${cat.categoryName}: ₹${cat.total.toLocaleString()} (${cat.percentage.toFixed(1)}%)`
).join('\n')}

Goals Progress:
- Total goals: ${goalsData.summary.total}
- Active goals: ${goalsData.summary.active}
- Completed goals: ${goalsData.summary.completed}
- Average progress: ${goalsData.summary.averageProgress.toFixed(1)}%

Please provide actionable insights about spending patterns, goal progress, and financial health recommendations. Keep it concise and professional.`;

      const insights = await geminiService.generateInsights(prompt);
      return insights;
    } catch (error) {
      console.error('Error generating AI insights:', error);
      return 'AI insights are currently unavailable. Please check your spending patterns manually.';
    }
  }

  async createPDF(analyticsData, goalsData, aiInsights, year, month) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Financial Report - ${analyticsData.period.month}`,
          Author: 'Wealth Vault',
          Subject: 'Monthly Financial Report',
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Monthly Financial Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).font('Helvetica').text(analyticsData.period.month, { align: 'center' });
      doc.moveDown(2);

      // Summary Section
      doc.fontSize(18).font('Helvetica-Bold').text('Financial Summary');
      doc.moveDown();
      doc.fontSize(12).font('Helvetica');

      const summaryData = [
        ['Total Spent', `₹${analyticsData.summary.totalAmount.toLocaleString()}`],
        ['Number of Transactions', analyticsData.summary.totalCount.toString()],
        ['Average Transaction', `₹${analyticsData.summary.avgTransaction.toFixed(2)}`],
        ['Largest Transaction', `₹${analyticsData.summary.maxTransaction.toFixed(2)}`],
      ];

      summaryData.forEach(([label, value]) => {
        doc.text(`${label}: ${value}`);
        doc.moveDown(0.5);
      });

      doc.moveDown();

      // Category Breakdown
      doc.fontSize(18).font('Helvetica-Bold').text('Spending by Category');
      doc.moveDown();

      analyticsData.categoryBreakdown.slice(0, 10).forEach(cat => {
        doc.fontSize(12).font('Helvetica');
        doc.text(`${cat.categoryName}: ₹${cat.total.toLocaleString()} (${cat.percentage.toFixed(1)}%)`);
        doc.moveDown(0.3);
      });

      doc.moveDown();

      // Goals Progress
      doc.fontSize(18).font('Helvetica-Bold').text('Goals Progress');
      doc.moveDown();
      doc.fontSize(12).font('Helvetica');

      doc.text(`Total Goals: ${goalsData.summary.total}`);
      doc.text(`Active Goals: ${goalsData.summary.active}`);
      doc.text(`Completed Goals: ${goalsData.summary.completed}`);
      doc.text(`Average Progress: ${goalsData.summary.averageProgress.toFixed(1)}%`);
      doc.moveDown();

      goalsData.goals.slice(0, 5).forEach(goal => {
        doc.text(`${goal.title}: ${goal.progress.toFixed(1)}% complete (₹${goal.currentAmount.toLocaleString()} / ₹${goal.targetAmount.toLocaleString()})`);
        doc.moveDown(0.3);
      });

      doc.moveDown();

      // AI Insights
      doc.fontSize(18).font('Helvetica-Bold').text('AI Insights');
      doc.moveDown();
      doc.fontSize(12).font('Helvetica');

      const insightsText = aiInsights || 'AI insights are currently unavailable.';
      const lines = doc.heightOfString(insightsText, { width: 500 });
      if (lines > 200) {
        doc.text(insightsText.substring(0, 500) + '...', { width: 500 });
      } else {
        doc.text(insightsText, { width: 500 });
      }

      doc.moveDown(2);

      // Footer
      doc.fontSize(10).font('Helvetica').text(
        `Generated on ${new Date().toLocaleDateString()} by Wealth Vault`,
        { align: 'center' }
      );

      doc.end();
    });
  }
}

export default new ReportService();
