import { db } from '../db/index.js';
import { irregularExpenses, expenses } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * Irregular Expense Service
 * Issue #668
 * 
 * Tracks and predicts one-time or irregular expenses
 */

export class IrregularExpenseService {
  /**
   * Identify irregular expenses from historical data
   */
  async identifyIrregularExpenses(userId, tenantId) {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Fetch all expenses in 90-day period
      const allExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            gte(expenses.date, ninetyDaysAgo)
          )
        )
        .orderBy((t) => t.date);

      if (allExpenses.length === 0) {
        return {
          irregularFound: false,
          message: 'No expenses found',
        };
      }

      // Group by category and identify anomalies
      const categorizedExpenses = {};
      allExpenses.forEach((exp) => {
        if (!categorizedExpenses[exp.categoryId]) {
          categorizedExpenses[exp.categoryId] = [];
        }
        categorizedExpenses[exp.categoryId].push(parseFloat(exp.amount));
      });

      const irregularList = [];

      // Analyze each category for irregularities
      for (const [categoryId, amounts] of Object.entries(categorizedExpenses)) {
        const anomalies = this.detectAnomalies(amounts);

        anomalies.forEach((anomaly) => {
          irregularList.push({
            categoryId,
            amount: anomaly.amount,
            frequency: anomaly.frequency,
            expectedFrequency: 'one_time',
            averageAmount: this.calculateMean(amounts),
          });
        });
      }

      // Save identified irregular expenses
      const saved = [];
      for (const irregular of irregularList) {
        const result = await this.saveIrregularExpense(
          userId,
          tenantId,
          irregular,
          'predicted'
        );
        saved.push(result);
      }

      return {
        irregularFound: true,
        totalIdentified: saved.length,
        expenses: saved,
      };
    } catch (error) {
      console.error('Error identifying irregular expenses:', error);
      throw error;
    }
  }

  /**
   * Detect outlier/anomalous expenses in a category
   */
  detectAnomalies(amounts) {
    if (amounts.length < 3) {
      return [];
    }

    // Calculate mean and standard deviation
    const mean = this.calculateMean(amounts);
    const stdDev = this.calculateStdDev(amounts);

    // Using 2.5 standard deviations as threshold (0.6% outliers)
    const threshold = mean + 2.5 * stdDev;

    // Find amounts exceeding threshold
    const anomalies = amounts
      .filter((amount) => amount > threshold)
      .map((amount) => ({
        amount: Math.round(amount * 100) / 100,
        zscore: (amount - mean) / stdDev,
        frequency: 'infrequent',
      }));

    return anomalies;
  }

  /**
   * Calculate mean
   */
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(values) {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2)) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Track upcoming irregular expense
   */
  async trackUpcomingExpense(userId, tenantId, expenseData) {
    try {
      const existingExpense = await db
        .select()
        .from(irregularExpenses)
        .where(
          and(
            eq(irregularExpenses.userId, userId),
            eq(irregularExpenses.tenantId, tenantId),
            eq(irregularExpenses.categoryId, expenseData.categoryId),
            eq(irregularExpenses.expectedDate, expenseData.expectedDate)
          )
        );

      if (existingExpense.length > 0) {
        return existingExpense[0];
      }

      return await db
        .insert(irregularExpenses)
        .values({
          userId,
          tenantId,
          categoryId: expenseData.categoryId,
          description: expenseData.description,
          expectedAmount: expenseData.expectedAmount,
          expectedDate: expenseData.expectedDate,
          status: 'upcoming',
          fundingSource: expenseData.fundingSource || 'reserves',
          importanceLevel: expenseData.importanceLevel || 'medium',
        })
        .returning();
    } catch (error) {
      console.error('Error tracking upcoming expense:', error);
      throw error;
    }
  }

  /**
   * Get upcoming irregular expenses
   */
  async getUpcomingExpenses(userId, tenantId, nextDays = 90) {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + nextDays);

      const upcoming = await db
        .select()
        .from(irregularExpenses)
        .where(
          and(
            eq(irregularExpenses.userId, userId),
            eq(irregularExpenses.tenantId, tenantId),
            eq(irregularExpenses.status, 'upcoming'),
            gte(irregularExpenses.expectedDate, today),
            lte(irregularExpenses.expectedDate, futureDate)
          )
        )
        .orderBy((t) => t.expectedDate);

      return {
        upcomingFound: upcoming.length > 0,
        count: upcoming.length,
        totalExpected: upcoming.reduce((sum, e) => sum + e.expectedAmount, 0),
        expenses: upcoming.map((e) => ({
          id: e.id,
          category: e.categoryId,
          description: e.description,
          expectedAmount: e.expectedAmount,
          expectedDate: e.expectedDate,
          daysUntil: Math.ceil(
            (new Date(e.expectedDate) - today) / (1000 * 60 * 60 * 24)
          ),
          funding: e.fundingSource,
          importance: e.importanceLevel,
          status: e.status,
        })),
      };
    } catch (error) {
      console.error('Error fetching upcoming expenses:', error);
      throw error;
    }
  }

  /**
   * Predict irregular expense timing
   */
  async predictExpenseTiming(userId, tenantId, categoryId) {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      // Get historical large expenses in this category
      const largeExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            eq(expenses.categoryId, categoryId),
            gte(expenses.date, oneYearAgo)
          )
        )
        .orderBy((t) => t.date);

      if (largeExpenses.length < 2) {
        return {
          canPredict: false,
          reason: 'Insufficient historical data',
        };
      }

      // Check for recurring timing pattern
      const dates = largeExpenses.map((e) => new Date(e.date));
      const intervals = [];

      for (let i = 1; i < dates.length; i++) {
        const daysDiff = Math.floor((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
        intervals.push(daysDiff);
      }

      // Calculate average interval
      const avgInterval = Math.round(intervals.reduce((a, b) => a + b) / intervals.length);
      const variance = this.calculateVariance(intervals);

      // If variance is low, pattern is predictable
      if (variance < avgInterval * 0.3) {
        const nextExpectedDate = new Date(dates[dates.length - 1]);
        nextExpectedDate.setDate(nextExpectedDate.getDate() + avgInterval);

        return {
          canPredict: true,
          pattern: 'recurring',
          averageInterval: avgInterval,
          confidence: Math.min(90, 50 + (12 - variance / 10)),
          nextExpectedDate,
          lastOccurrence: dates[dates.length - 1],
        };
      } else {
        return {
          canPredict: true,
          pattern: 'irregular',
          averageAmount: this.calculateMean(
            largeExpenses.map((e) => parseFloat(e.amount))
          ),
          frequency: largeExpenses.length,
          confidence: 30 + variance / 10,
        };
      }
    } catch (error) {
      console.error('Error predicting expense timing:', error);
      throw error;
    }
  }

  /**
   * Calculate variance in array
   */
  calculateVariance(values) {
    const mean = this.calculateMean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Get funding source recommendation
   */
  async getFundingSourceRecommendation(userId, tenantId, expenseAmount) {
    // This would integrate with other services
    // For now, return basic recommendation
    return {
      primarySource: 'emergency_fund',
      secondarySource: 'savings',
      note:
        expenseAmount > 1000
          ? 'Consider using emergency fund or vacation savings'
          : 'Can be covered from monthly surplus',
    };
  }

  /**
   * Save irregular expense to database
   */
  async saveIrregularExpense(userId, tenantId, expenseData, status) {
    return await db
      .insert(irregularExpenses)
      .values({
        userId,
        tenantId,
        categoryId: expenseData.categoryId,
        description: expenseData.description || `${expenseData.categoryId} irregular expense`,
        expectedAmount: expenseData.amount,
        expectedDate: new Date(),
        status,
        fundingSource: 'reserves',
        importanceLevel: 'medium',
      })
      .returning();
  }

  /**
   * Update expense status
   */
  async updateExpenseStatus(expenseId, newStatus) {
    try {
      const validStatuses = ['predicted', 'upcoming', 'overdue', 'completed'];
      if (!validStatuses.includes(newStatus)) {
        throw new Error('Invalid status');
      }

      return await db
        .update(irregularExpenses)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(irregularExpenses.id, expenseId))
        .returning();
    } catch (error) {
      console.error('Error updating expense status:', error);
      throw error;
    }
  }

  /**
   * Get overdue irregular expenses
   */
  async getOverdueExpenses(userId, tenantId) {
    try {
      const today = new Date();

      const overdue = await db
        .select()
        .from(irregularExpenses)
        .where(
          and(
            eq(irregularExpenses.userId, userId),
            eq(irregularExpenses.tenantId, tenantId),
            eq(irregularExpenses.status, 'upcoming'),
            lte(irregularExpenses.expectedDate, today)
          )
        )
        .orderBy((t) => t.expectedDate);

      // Auto-update to overdue status
      for (const expense of overdue) {
        await this.updateExpenseStatus(expense.id, 'overdue');
      }

      return {
        overdueFound: overdue.length > 0,
        count: overdue.length,
        expenses: overdue.map((e) => ({
          id: e.id,
          category: e.categoryId,
          description: e.description,
          expectedAmount: e.expectedAmount,
          daysOverdue: Math.floor(
            (today - new Date(e.expectedDate)) / (1000 * 60 * 60 * 24)
          ),
        })),
      };
    } catch (error) {
      console.error('Error fetching overdue expenses:', error);
      throw error;
    }
  }

  /**
   * Get expense summary by importance
   */
  async getExpenseSummaryByImportance(userId, tenantId) {
    try {
      const allExpenses = await db
        .select()
        .from(irregularExpenses)
        .where(
          and(
            eq(irregularExpenses.userId, userId),
            eq(irregularExpenses.tenantId, tenantId),
            eq(irregularExpenses.status, 'upcoming')
          )
        );

      const summary = {
        critical: {
          count: 0,
          total: 0,
        },
        high: {
          count: 0,
          total: 0,
        },
        medium: {
          count: 0,
          total: 0,
        },
        low: {
          count: 0,
          total: 0,
        },
      };

      allExpenses.forEach((exp) => {
        const level = exp.importanceLevel;
        summary[level].count++;
        summary[level].total += exp.expectedAmount;
      });

      return summary;
    } catch (error) {
      console.error('Error getting expense summary:', error);
      throw error;
    }
  }
}

export const irregularExpenseService = new IrregularExpenseService();
