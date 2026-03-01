import db from '../config/db.js';
import { budgetRules, expenses, categories } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import notificationService from './notificationService.js';

class BudgetRulesService {
  async evaluateRulesForExpense(expenseData) {
    const { userId, categoryId, amount, id: expenseId } = expenseData;

    try {
      // Get active rules for this user and category
      const activeRules = await db.query.budgetRules.findMany({
        where: and(
          eq(budgetRules.userId, userId),
          eq(budgetRules.categoryId, categoryId),
          eq(budgetRules.isActive, true)
        ),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        }
      });

      for (const rule of activeRules) {
        const shouldTrigger = await this.evaluateRule(rule, expenseData);
        if (shouldTrigger) {
          await this.triggerRuleAlert(rule, expenseData);
        }
      }
    } catch (error) {
      console.error('Error evaluating budget rules:', error);
    }
  }

  async evaluateRule(rule, expenseData) {
    const { ruleType, condition, threshold, period } = rule;
    const { amount } = expenseData;

    try {
      // Calculate current spending based on period
      const currentSpending = await this.getCurrentSpending(rule, expenseData);

      switch (ruleType) {
        case 'amount':
          return this.evaluateAmountRule(condition, currentSpending, threshold);

        case 'percentage':
          return this.evaluatePercentageRule(condition, currentSpending, threshold, rule);

        case 'frequency':
          return this.evaluateFrequencyRule(condition, currentSpending, threshold, rule);

        default:
          return false;
      }
    } catch (error) {
      console.error('Error evaluating rule:', error);
      return false;
    }
  }

  async getCurrentSpending(rule, expenseData) {
    const { userId, categoryId, period } = rule;
    const now = new Date();

    let startDate;
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        startDate = weekStart;
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [spendingResult] = await db
      .select({ total: sql`sum(${expenses.amount})` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.categoryId, categoryId),
          eq(expenses.status, 'completed'),
          gte(expenses.date, startDate),
          lte(expenses.date, now)
        )
      );

    return Number(spendingResult?.total || 0);
  }

  evaluateAmountRule(condition, currentSpending, threshold) {
    const { operator, value } = condition;

    switch (operator) {
      case '>':
        return currentSpending > value;
      case '>=':
        return currentSpending >= value;
      case '<':
        return currentSpending < value;
      case '<=':
        return currentSpending <= value;
      case '==':
        return currentSpending === value;
      default:
        return false;
    }
  }

  async evaluatePercentageRule(condition, currentSpending, threshold, rule) {
    // For percentage rules, we need to calculate percentage of budget
    const { categoryId, userId } = rule;

    const [category] = await db.query.categories.findMany({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      columns: { budget: true, spendingLimit: true }
    });

    if (!category) return false;

    const budgetAmount = Number(category.budget?.monthly || 0);
    if (budgetAmount === 0) return false;

    const percentage = (currentSpending / budgetAmount) * 100;
    const { operator, value } = condition;

    switch (operator) {
      case '>':
        return percentage > value;
      case '>=':
        return percentage >= value;
      case '<':
        return percentage < value;
      case '<=':
        return percentage <= value;
      default:
        return false;
    }
  }

  async evaluateFrequencyRule(condition, currentSpending, threshold, rule) {
    // For frequency rules, check how many expenses in the period
    const { userId, categoryId, period } = rule;
    const now = new Date();

    let startDate;
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        startDate = weekStart;
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [countResult] = await db
      .select({ count: sql`count(*)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.categoryId, categoryId),
          eq(expenses.status, 'completed'),
          gte(expenses.date, startDate),
          lte(expenses.date, now)
        )
      );

    const expenseCount = Number(countResult?.count || 0);
    const { operator, value } = condition;

    switch (operator) {
      case '>':
        return expenseCount > value;
      case '>=':
        return expenseCount >= value;
      case '<':
        return expenseCount < value;
      case '<=':
        return expenseCount <= value;
      case '==':
        return expenseCount === value;
      default:
        return false;
    }
  }

  async triggerRuleAlert(rule, expenseData) {
    const { id: ruleId, name, description, notificationType, category } = rule;
    const { amount } = expenseData;

    // Check if we should avoid duplicate alerts (e.g., within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAlert = await db.query.budgetRules.findFirst({
      where: and(
        eq(budgetRules.id, ruleId),
        gte(budgetRules.lastTriggered, oneHourAgo)
      )
    });

    if (recentAlert) {
      return; // Skip duplicate alert
    }

    const message = this.generateRuleAlertMessage(rule, expenseData);

    // Create alert record in budget_alerts table for consistency
    const [alert] = await db.insert(budgetAlerts).values({
      userId: rule.userId,
      categoryId: rule.categoryId,
      alertType: 'rule_triggered',
      threshold: rule.threshold.toString(),
      currentAmount: amount.toString(),
      budgetAmount: rule.threshold.toString(),
      message,
      notificationType,
      expenseId: expenseData.id,
      metadata: {
        ruleId,
        ruleName: name,
        ruleType: rule.ruleType,
        triggeredAt: new Date().toISOString()
      }
    }).returning();

    // Update rule metadata
    await db.update(budgetRules)
      .set({
        lastTriggered: new Date(),
        metadata: {
          ...rule.metadata,
          triggerCount: (rule.metadata?.triggerCount || 0) + 1,
          lastAmount: amount
        },
        updatedAt: new Date()
      })
      .where(eq(budgetRules.id, ruleId));

    // Send notification
    await notificationService.sendBudgetAlert({
      ...alert,
      categoryName: category.name
    });
  }

  generateRuleAlertMessage(rule, expenseData) {
    const { name, ruleType, condition, period, threshold } = rule;
    const { amount, description } = expenseData;

    let conditionText = '';
    switch (ruleType) {
      case 'amount':
        conditionText = `spending ${condition.operator} ₹${condition.value}`;
        break;
      case 'percentage':
        conditionText = `spending ${condition.operator} ${condition.value}% of budget`;
        break;
      case 'frequency':
        conditionText = `more than ${condition.value} expenses`;
        break;
    }

    return `Budget rule "${name}" triggered: ${conditionText} in this ${period}. Latest expense: ₹${amount} for "${description}".`;
  }

  // CRUD operations for rules
  async getUserRules(userId) {
    try {
      const rules = await db.query.budgetRules.findMany({
        where: eq(budgetRules.userId, userId),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        },
        orderBy: (budgetRules, { desc }) => [desc(budgetRules.createdAt)]
      });

      return rules;
    } catch (error) {
      console.error('Error fetching user rules:', error);
      return [];
    }
  }

  async createRule(ruleData) {
    try {
      const [rule] = await db.insert(budgetRules).values({
        ...ruleData,
        metadata: {
          ...ruleData.metadata,
          createdBy: 'user'
        }
      }).returning();

      return rule;
    } catch (error) {
      console.error('Error creating rule:', error);
      throw error;
    }
  }

  async updateRule(ruleId, userId, ruleData) {
    try {
      const [updated] = await db.update(budgetRules)
        .set({
          ...ruleData,
          updatedAt: new Date()
        })
        .where(and(eq(budgetRules.id, ruleId), eq(budgetRules.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error updating rule:', error);
      throw error;
    }
  }

  async deleteRule(ruleId, userId) {
    try {
      await db.delete(budgetRules)
        .where(and(eq(budgetRules.id, ruleId), eq(budgetRules.userId, userId)));

      return true;
    } catch (error) {
      console.error('Error deleting rule:', error);
      throw error;
    }
  }

  async toggleRule(ruleId, userId, isActive) {
    try {
      const [updated] = await db.update(budgetRules)
        .set({
          isActive,
          updatedAt: new Date()
        })
        .where(and(eq(budgetRules.id, ruleId), eq(budgetRules.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error toggling rule:', error);
      throw error;
    }
  }
}

export default new BudgetRulesService();
