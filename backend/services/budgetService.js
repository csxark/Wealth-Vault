import db from '../config/db.js';
import { expenses, categories, budgetAlerts } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import notificationService from './notificationService.js';

class BudgetService {
  async checkBudgetAfterExpense(expenseData) {
    const { userId, categoryId, amount, id: expenseId } = expenseData;

    try {
      // Get category with budget info
      const [category] = await db.query.categories.findMany({
        where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
        columns: { id: true, name: true, budget: true, spendingLimit: true }
      });

      if (!category || !category.budget) {
        return; // No budget set for this category
      }

      // Calculate current spending for this category in the current period
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Get monthly spending
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);

      const [monthlySpending] = await db
        .select({ total: sql`sum(${expenses.amount})` })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.categoryId, categoryId),
            eq(expenses.status, 'completed'),
            gte(expenses.date, monthStart),
            lte(expenses.date, monthEnd)
          )
        );

      const currentMonthlySpending = Number(monthlySpending?.total || 0);
      const monthlyBudget = Number(category.budget.monthly || 0);

      // Check monthly budget alerts
      if (monthlyBudget > 0) {
        await this.checkAndTriggerAlerts({
          userId,
          categoryId,
          categoryName: category.name,
          currentAmount: currentMonthlySpending,
          budgetAmount: monthlyBudget,
          period: 'monthly',
          expenseId
        });
      }

      // Check spending limit alerts
      const spendingLimit = Number(category.spendingLimit || 0);
      if (spendingLimit > 0) {
        await this.checkAndTriggerAlerts({
          userId,
          categoryId,
          categoryName: category.name,
          currentAmount: currentMonthlySpending,
          budgetAmount: spendingLimit,
          period: 'limit',
          expenseId
        });
      }

    } catch (error) {
      console.error('Error checking budget after expense:', error);
    }
  }

  async checkAndTriggerAlerts({ userId, categoryId, categoryName, currentAmount, budgetAmount, period, expenseId }) {
    const percentage = (currentAmount / budgetAmount) * 100;

    // Define alert thresholds
    const thresholds = [
      { type: 'approaching', threshold: 80, condition: percentage >= 80 && percentage < 100 },
      { type: 'exceeded', threshold: 100, condition: percentage >= 100 }
    ];

    for (const { type, threshold, condition } of thresholds) {
      if (condition) {
        // Check if alert already exists for this period and type
        const existingAlert = await db.query.budgetAlerts.findFirst({
          where: and(
            eq(budgetAlerts.userId, userId),
            eq(budgetAlerts.categoryId, categoryId),
            eq(budgetAlerts.alertType, type),
            sql`DATE(${budgetAlerts.createdAt}) = CURRENT_DATE`,
            sql`${budgetAlerts.metadata}::jsonb ->> 'period' = ${period}`
          )
        });

        if (!existingAlert) {
          const message = this.generateAlertMessage(type, categoryName, currentAmount, budgetAmount, threshold, period);

          // Create alert record
          const [alert] = await db.insert(budgetAlerts).values({
            userId,
            categoryId,
            alertType: type,
            threshold: threshold.toString(),
            currentAmount: currentAmount.toString(),
            budgetAmount: budgetAmount.toString(),
            message,
            notificationType: 'in_app', // Default to in-app, can be expanded
            expenseId,
            metadata: {
              period,
              triggeredAt: new Date().toISOString()
            }
          }).returning();

          // Send notification
          await notificationService.sendBudgetAlert({
            ...alert,
            categoryName
          });
        }
      }
    }
  }

  generateAlertMessage(type, categoryName, currentAmount, budgetAmount, threshold, period) {
    const percentage = ((currentAmount / budgetAmount) * 100).toFixed(1);
    const periodText = period === 'monthly' ? 'monthly budget' : period === 'yearly' ? 'yearly budget' : 'spending limit';

    switch (type) {
      case 'approaching':
        return `You're approaching your ${periodText} for ${categoryName}. Current spending: $${currentAmount.toFixed(2)} (${percentage}% of $${budgetAmount.toFixed(2)}).`;
      case 'exceeded':
        return `You've exceeded your ${periodText} for ${categoryName}. Current spending: $${currentAmount.toFixed(2)} (${percentage}% of $${budgetAmount.toFixed(2)}).`;
      default:
        return `Budget alert for ${categoryName}: $${currentAmount.toFixed(2)} spent (${percentage}% of ${periodText}).`;
    }
  }

  async getBudgetStatus(userId, categoryId = null) {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);

      let conditions = [eq(categories.userId, userId), eq(categories.isActive, true)];
      if (categoryId) {
        conditions.push(eq(categories.id, categoryId));
      }

      const categoriesWithBudgets = await db.query.categories.findMany({
        where: and(...conditions),
        columns: { id: true, name: true, budget: true, spendingLimit: true, color: true, icon: true }
      });

      const budgetStatuses = [];

      for (const category of categoriesWithBudgets) {
        const [monthlySpending] = await db
          .select({ total: sql`sum(${expenses.amount})` })
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, userId),
              eq(expenses.categoryId, category.id),
              eq(expenses.status, 'completed'),
              gte(expenses.date, monthStart),
              lte(expenses.date, monthEnd)
            )
          );

        const currentSpending = Number(monthlySpending?.total || 0);
        const monthlyBudget = Number(category.budget?.monthly || 0);
        const spendingLimit = Number(category.spendingLimit || 0);

        const status = {
          categoryId: category.id,
          categoryName: category.name,
          color: category.color,
          icon: category.icon,
          currentSpending,
          monthlyBudget,
          spendingLimit,
          monthlyPercentage: monthlyBudget > 0 ? (currentSpending / monthlyBudget) * 100 : 0,
          limitPercentage: spendingLimit > 0 ? (currentSpending / spendingLimit) * 100 : 0,
          status: this.getBudgetStatusText(currentSpending, monthlyBudget, spendingLimit)
        };

        budgetStatuses.push(status);
      }

      return budgetStatuses;
    } catch (error) {
      console.error('Error getting budget status:', error);
      return [];
    }
  }

  getBudgetStatusText(currentSpending, monthlyBudget, spendingLimit) {
    if (spendingLimit > 0 && currentSpending >= spendingLimit) {
      return 'exceeded';
    }
    if (monthlyBudget > 0 && currentSpending >= monthlyBudget) {
      return 'exceeded';
    }
    if (monthlyBudget > 0 && currentSpending >= monthlyBudget * 0.8) {
      return 'warning';
    }
    if (spendingLimit > 0 && currentSpending >= spendingLimit * 0.8) {
      return 'warning';
    }
    return 'good';
  }
}

export default new BudgetService();
