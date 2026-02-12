import BudgetRepository from '../repositories/BudgetRepository.js';
import notificationService from './notificationService.js';
import budgetRulesService from './budgetRulesService.js';

class BudgetService {
  async checkBudgetAfterExpense(expenseData) {
    const { userId, categoryId, amount, id: expenseId } = expenseData;

    try {
      // Get category with budget info
      const category = await BudgetRepository.findCategoryWithBudget(categoryId, userId);

      if (!category || !category.budget) {
        // Still check custom rules even without category budget
      } else {
        // Calculate current spending for this category in the current period
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Get monthly spending
        const monthStart = new Date(currentYear, currentMonth, 1);
        const monthEnd = new Date(currentYear, currentMonth + 1, 0);

        const currentMonthlySpending = await BudgetRepository.getCategorySpending(userId, categoryId, monthStart, monthEnd);
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
      }

      // Check custom budget rules
      await budgetRulesService.evaluateRulesForExpense(expenseData);

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
        const existingAlert = await BudgetRepository.findAlert(userId, categoryId, type, period);

        if (!existingAlert) {
          const message = this.generateAlertMessage(type, categoryName, currentAmount, budgetAmount, threshold, period);

          // Create alert record
          const alert = await BudgetRepository.createAlert({
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
          });

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

      const categoriesWithBudgets = await BudgetRepository.findCategoriesWithBudgets(userId, categoryId);

      const budgetStatuses = [];

      for (const category of categoriesWithBudgets) {
        const currentSpending = await BudgetRepository.getCategorySpending(userId, category.id, monthStart, monthEnd);

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
