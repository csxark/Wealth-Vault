import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, goals, reports, users, subscriptions, subscriptionUsage, cancellationSuggestions, debts, debtPayments } from "../db/schema.js";
import geminiService from './geminiservice.js';
import emailService from './emailService.js';

class ReportService {
  async generateMonthlyReport(userId, year, month) {
    try {
      // Calculate date range for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of the month
      const period = `${year}-${String(month).padStart(2, '0')}`;

      // Fetch user info
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error('User not found');

      // Fetch analytics data
      const analyticsData = await this.getAnalyticsData(userId, startDate, endDate);

      // Fetch goals data
      const goalsData = await this.getGoalsData(userId);

      // Fetch subscription data
      const subscriptionData = await this.getSubscriptionData(userId);

      // Generate AI insights
      const aiInsights = await this.generateAIInsights(analyticsData, goalsData, subscriptionData, year, month);

      // Generate PDF and Excel
      const pdfBuffer = await this.createPDF(analyticsData, goalsData, subscriptionData, aiInsights, year, month);
      const excelBuffer = await this.createExcel(analyticsData, goalsData, subscriptionData, year, month);

      // Save files to disk
      const reportsDir = path.join(process.cwd(), 'uploads', 'reports');
      await fs.mkdir(reportsDir, { recursive: true });

      const pdfFilename = `${userId}_report_${period}.pdf`;
      const excelFilename = `${userId}_report_${period}.xlsx`;

      const pdfPath = path.join(reportsDir, pdfFilename);
      const excelPath = path.join(reportsDir, excelFilename);

      await fs.writeFile(pdfPath, pdfBuffer);
      await fs.writeFile(excelPath, excelBuffer);

      // Archive reports in database
      const [pdfReport] = await db.insert(reports).values({
        userId,
        name: `Monthly Report - ${analyticsData.period.month}`,
        type: 'monthly_digest',
        format: 'pdf',
        url: `/uploads/reports/${pdfFilename}`,
        period,
      }).returning();

      await db.insert(reports).values({
        userId,
        name: `Monthly Report Data - ${analyticsData.period.month}`,
        type: 'monthly_digest',
        format: 'excel',
        url: `/uploads/reports/${excelFilename}`,
        period,
      });

      // Send email notification (if email service supports attachments we'd use them, but let's send a link)
      await emailService.sendEmail({
        to: user.email,
        subject: `📊 Your Financial Digest for ${analyticsData.period.month} is Ready`,
        html: `
          <h1>Hi ${user.firstName},</h1>
          <p>Your monthly financial report for <strong>${analyticsData.period.month}</strong> has been generated.</p>
          <p>You can view your detailed insights and spending breakdown by logging into Wealth-Vault.</p>
          <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reports/${pdfReport.id}">Download PDF Report</a></p>
          <br>
          <p>Best regards,<br>The Wealth Vault Team</p>
        `
      });

      return pdfReport;
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

  async generateAIInsights(analyticsData, goalsData, subscriptionData, year, month) {
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
- Avg. progress: ${goalsData.summary.averageProgress.toFixed(1)}%

Subscription Analytics:
- Active subscriptions: ${subscriptionData.activeCount}
- Monthly subscription cost: ₹${subscriptionData.totalMonthlyCost.toFixed(2)}
- Potential annual savings: ₹${subscriptionData.totalPotentialAnnualSavings.toFixed(2)}
- AI Suggestions: ${subscriptionData.suggestions.map(s => s.reason).join(', ')}
- Average progress: ${goalsData.summary.averageProgress.toFixed(1)}%
- Total milestones: ${goalsData.summary.totalMilestones}
- Completed milestones: ${goalsData.summary.completedMilestones}

Please provide actionable insights about spending patterns, goal progress, milestone achievements, and financial health recommendations. Keep it concise and professional.`;

      const insights = await geminiService.generateInsights(prompt);
      return insights;
    } catch (error) {
      console.error('Error generating AI insights:', error);
      return 'AI insights are currently unavailable. Please check your spending patterns manually.';
    }
  }
  async createPDF(analyticsData, goalsData, subscriptionData, aiInsights, year, month) {
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

      // Subscription Section
      doc.fontSize(18).font('Helvetica-Bold').text('Subscription Intelligence');
      doc.moveDown();
      doc.fontSize(12).font('Helvetica');

      doc.text(`Active Subscriptions: ${subscriptionData.activeCount}`);
      doc.text(`Monthly Subscription Spend: ₹${subscriptionData.totalMonthlyCost.toFixed(2)}`);
      doc.text(`Potential Annual Savings: ₹${subscriptionData.totalPotentialAnnualSavings.toFixed(2)}`);
      doc.moveDown();

      if (subscriptionData.suggestions.length > 0) {
        doc.font('Helvetica-Bold').text('Recommended Actions:');
        doc.font('Helvetica');
        subscriptionData.suggestions.forEach(sug => {
          doc.text(`• ${sug.reason}`);
        });
      }

      doc.moveDown();

      // AI Insights
      doc.fontSize(18).font('Helvetica-Bold').text('AI Insights');
      doc.moveDown();
      doc.fontSize(12).font('Helvetica');

      const insightsText = aiInsights || 'AI insights are currently unavailable.';
      doc.text(insightsText, { width: 500 });

      doc.moveDown(2);

      // Footer
      doc.fontSize(10).font('Helvetica').text(
        `Generated on ${new Date().toLocaleDateString()} by Wealth Vault`,
        { align: 'center' }
      );

      doc.end();
    });
  }

  async createExcel(analyticsData, goalsData, subscriptionData, year, month) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Spending Summary');

    // Summary Info
    sheet.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Percentage', key: 'percentage', width: 15 },
      { header: 'Count', key: 'count', width: 10 },
    ];

    analyticsData.categoryBreakdown.forEach(cat => {
      sheet.addRow({
        category: cat.categoryName,
        amount: cat.total,
        percentage: `${cat.percentage.toFixed(1)}%`,
        count: cat.count,
      });
    });

    // Add another sheet for Top Expenses
    const expenseSheet = workbook.addWorksheet('Top Expenses');
    expenseSheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Amount', key: 'amount', width: 15 },
    ];

    analyticsData.topExpenses.forEach(exp => {
      expenseSheet.addRow({
        date: new Date(exp.date).toLocaleDateString(),
        description: exp.description,
        category: exp.category?.name || 'Uncategorized',
        amount: exp.amount,
      });
    });

    // Add Goals sheet
    const goalsSheet = workbook.addWorksheet('Goals Progress');
    goalsSheet.columns = [
      { header: 'Goal Name', key: 'title', width: 30 },
      { header: 'Target', key: 'target', width: 15 },
      { header: 'Current', key: 'current', width: 15 },
      { header: 'Progress', key: 'progress', width: 15 },
    ];

    goalsData.goals.forEach(goal => {
      goalsSheet.addRow({
        title: goal.title,
        target: goal.targetAmount,
        current: goal.currentAmount,
        progress: `${goal.progress.toFixed(1)}%`,
      });
    });

    // Add Subscriptions sheet
    const subSheet = workbook.addWorksheet('Subscription Analysis');
    subSheet.columns = [
      { header: 'Monthly Cost (₹)', key: 'monthlyCost', width: 20 },
      { header: 'Potential Savings (₹)', key: 'savings', width: 20 },
      { header: 'Active Count', key: 'count', width: 15 },
    ];

    subSheet.addRow({
      monthlyCost: subscriptionData.totalMonthlyCost.toFixed(2),
      savings: subscriptionData.totalPotentialAnnualSavings.toFixed(2),
      count: subscriptionData.activeCount
    });

    if (subscriptionData.suggestions.length > 0) {
      subSheet.addRow({});
      subSheet.addRow({ monthlyCost: 'AI Suggestions' });
      subscriptionData.suggestions.forEach(sug => {
        subSheet.addRow({ monthlyCost: sug.reason });
      });
    }

    return await workbook.xlsx.writeBuffer();
  }

  async getSubscriptionData(userId) {
    const activeSubs = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')));

    // Total monthly subscription cost
    let totalMonthlyCost = 0;
    activeSubs.forEach(sub => {
      const amt = parseFloat(sub.amount);
      if (sub.billingCycle === 'yearly') totalMonthlyCost += amt / 12;
      else if (sub.billingCycle === 'quarterly') totalMonthlyCost += amt / 3;
      else if (sub.billingCycle === 'weekly') totalMonthlyCost += amt * 4;
      else totalMonthlyCost += amt;
    });

    const pendingSuggestions = await db.select().from(cancellationSuggestions).where(
      and(eq(cancellationSuggestions.userId, userId), eq(cancellationSuggestions.status, 'pending'))
    );

    const totalPotentialAnnualSavings = pendingSuggestions.reduce((sum, sug) => sum + parseFloat(sug.potentialSavings || 0), 0);

    return {
      activeCount: activeSubs.length,
      totalMonthlyCost,
      totalPotentialAnnualSavings,
      suggestions: pendingSuggestions.slice(0, 5)
    };
  }

  async generateDebtSummaryReport(userId) {
    try {
      const userDebts = await db.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.isActive, true)));

      const reportData = {
        generatedAt: new Date().toISOString(),
        totalPrincipal: userDebts.reduce((sum, d) => sum + parseFloat(d.principalAmount), 0),
        totalCurrentBalance: userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0),
        debtCount: userDebts.length,
        debts: userDebts.map(d => ({
          name: d.name,
          balance: d.currentBalance,
          apr: d.apr,
          payoffDate: d.estimatedPayoffDate
        }))
      };

      return reportData;
    } catch (error) {
      console.error("Debt report generation error:", error);
      throw error;
    }
  }
}

export default new ReportService();
