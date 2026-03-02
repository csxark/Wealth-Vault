import { db } from '../db/index.js';
import { cashFlowTracker, expenses, income } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * Cash Flow Tracker Service
 * Issue #668
 * 
 * Real-time tracking of cash position and cash flow metrics
 */

export class CashFlowTrackerService {
  /**
   * Get current cash flow snapshot
   */
  async getCurrentCashFlowSnapshot(userId, tenantId) {
    try {
      const today = new Date();

      // Get today's cash flow
      const todayData = await this.getCashFlowForDate(userId, tenantId, today);

      // Get this week's cash flow (last 7 days)
      const weekData = await this.getCashFlowForPeriod(userId, tenantId, 7);

      // Get this month's cash flow (from 1st to today)
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthData = await this.getCashFlowForPeriod(
        userId,
        tenantId,
        Math.floor((today - monthStart) / (1000 * 60 * 60 * 24)) + 1
      );

      // Calculate snapshots
      const snapshot = {
        today: todayData,
        week: weekData,
        month: monthData,
        trend: this.calculateTrend(weekData),
        health: this.assessHealthScore(todayData, weekData, monthData),
      };

      // Save snapshot
      const saved = await this.saveSnapshot(userId, tenantId, snapshot);

      return {
        snapshotGenerated: true,
        snapshot: saved[0],
      };
    } catch (error) {
      console.error('Error getting cash flow snapshot:', error);
      throw error;
    }
  }

  /**
   * Get cash flow for a specific date
   */
  async getCashFlowForDate(userId, tenantId, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      // Get expenses for the date
      const dayExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            gte(expenses.date, startDate),
            lte(expenses.date, endDate)
          )
        );

      const totalExpenses = dayExpenses.reduce(
        (sum, e) => sum + parseFloat(e.amount),
        0
      );

      // Get income for the date (if income table exists)
      let totalIncome = 0;
      try {
        const dayIncome = await db
          .select()
          .from(income)
          .where(
            and(
              eq(income.userId, userId),
              eq(income.tenantId, tenantId),
              gte(income.date, startDate),
              lte(income.date, endDate)
            )
          );

        totalIncome = dayIncome.reduce((sum, i) => sum + parseFloat(i.amount), 0);
      } catch (e) {
        // Income table may not exist, use default
        totalIncome = 0;
      }

      const netCashFlow = totalIncome - totalExpenses;

      return {
        date: dateStr,
        income: Math.round(totalIncome * 100) / 100,
        expenses: Math.round(totalExpenses * 100) / 100,
        netCashFlow: Math.round(netCashFlow * 100) / 100,
        transactionCount: dayExpenses.length,
        averageTransaction:
          dayExpenses.length > 0
            ? Math.round((totalExpenses / dayExpenses.length) * 100) / 100
            : 0,
      };
    } catch (error) {
      console.error(`Error getting cash flow for date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get cash flow for a period
   */
  async getCashFlowForPeriod(userId, tenantId, days) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      // Get all expenses in period
      const periodExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            gte(expenses.date, startDate),
            lte(expenses.date, endDate)
          )
        )
        .orderBy((t) => t.date);

      // Aggregate by date
      const dailyData = {};
      let totalExpenses = 0;

      periodExpenses.forEach((exp) => {
        const dateStr = new Date(exp.date).toISOString().split('T')[0];
        const amount = parseFloat(exp.amount);

        if (!dailyData[dateStr]) {
          dailyData[dateStr] = {
            expenses: 0,
            income: 0,
          };
        }
        dailyData[dateStr].expenses += amount;
        totalExpenses += amount;
      });

      // Get income if available
      let totalIncome = 0;
      try {
        const periodIncome = await db
          .select()
          .from(income)
          .where(
            and(
              eq(income.userId, userId),
              eq(income.tenantId, tenantId),
              gte(income.date, startDate),
              lte(income.date, endDate)
            )
          );

        periodIncome.forEach((inc) => {
          const dateStr = new Date(inc.date).toISOString().split('T')[0];
          const amount = parseFloat(inc.amount);

          if (!dailyData[dateStr]) {
            dailyData[dateStr] = {
              expenses: 0,
              income: 0,
            };
          }
          dailyData[dateStr].income += amount;
          totalIncome += amount;
        });
      } catch (e) {
        // Income table may not exist
      }

      const netFlowState =
        totalIncome > 0
          ? totalIncome - totalExpenses
          : -totalExpenses; // Assume base income if no explicit income data

      const averageDailyExpense =
        days > 0 ? Math.round((totalExpenses / days) * 100) / 100 : 0;

      return {
        period: `${days}_days`,
        startDate,
        endDate,
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netCashFlow: Math.round(netFlowState * 100) / 100,
        averageDailyExpense,
        transactionCount: periodExpenses.length,
        dailyBreakdown: dailyData,
      };
    } catch (error) {
      console.error(`Error getting cash flow for ${days} days:`, error);
      throw error;
    }
  }

  /**
   * Calculate cash flow trend
   */
  calculateTrend(weekData) {
    if (!weekData.dailyBreakdown || Object.keys(weekData.dailyBreakdown).length < 3) {
      return { trend: 'insufficient_data', direction: 'unknown' };
    }

    const dailyNetFlows = Object.values(weekData.dailyBreakdown).map(
      (d) => d.income - d.expenses
    );

    // Simple trend: compare first half to second half
    const midpoint = Math.floor(dailyNetFlows.length / 2);
    const firstHalf = dailyNetFlows.slice(0, midpoint);
    const secondHalf = dailyNetFlows.slice(midpoint);

    const avgFirst = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

    let direction = 'stable';
    let strength = 'low';

    if (avgSecond > avgFirst * 1.1) {
      direction = 'improving';
      strength =
        avgSecond > avgFirst * 1.5
          ? 'strong'
          : avgSecond > avgFirst * 1.2
            ? 'moderate'
            : 'weak';
    } else if (avgSecond < avgFirst * 0.9) {
      direction = 'declining';
      strength =
        avgSecond < avgFirst * 0.7
          ? 'strong'
          : avgSecond < avgFirst * 0.85
            ? 'moderate'
            : 'weak';
    }

    return {
      trend: `${direction} (${strength})`,
      direction,
      strength,
      changePercent: Math.round(
        ((avgSecond - avgFirst) / Math.abs(avgFirst)) * 100 * 100
      ) / 100,
    };
  }

  /**
   * Assess cash flow health score
   */
  assessHealthScore(todayData, weekData, monthData) {
    let score = 100;

    // Negative cash flow penalty
    if (todayData.netCashFlow < 0) score -= 15;
    if (weekData.netCashFlow < 0) score -= 25;

    // High daily expenses
    if (todayData.expenses > 500) score -= 5;

    // Volatility penalty
    const weekDaily = Object.values(weekData.dailyBreakdown || {});
    if (weekDaily.length > 2) {
      const expenses = weekDaily.map((d) => d.expenses);
      const mean = expenses.reduce((a, b) => a + b) / expenses.length;
      const stdDev = Math.sqrt(
        expenses.reduce((sum, e) => sum + Math.pow(e - mean, 2)) / expenses.length
      );

      if (stdDev > mean * 0.5) score -= 10; // High volatility
    }

    // Positive cash flow bonus
    if (monthData.netCashFlow > 0) score += 20;

    // Sustainable spending bonus
    if (
      monthData.totalExpenses > 0 &&
      monthData.totalExpenses < monthData.totalIncome * 0.8
    ) {
      score += 10;
    }

    score = Math.max(0, Math.min(100, score));

    const grade =
      score >= 90
        ? 'A'
        : score >= 80
          ? 'B'
          : score >= 70
            ? 'C'
            : score >= 60
              ? 'D'
              : 'F';

    return {
      score: Math.round(score),
      grade,
      status:
        grade <= 'C'
          ? 'at_risk'
          : grade === 'B'
            ? 'good'
            : 'excellent',
    };
  }

  /**
   * Save cash flow snapshot to database
   */
  async saveSnapshot(userId, tenantId, snapshot) {
    return await db
      .insert(cashFlowTracker)
      .values({
        userId,
        tenantId,
        snapshotDate: new Date(),
        dailyIncome: snapshot.today.income,
        dailyExpenses: snapshot.today.expenses,
        dailyNetCashFlow: snapshot.today.netCashFlow,
        weeklyIncome: snapshot.week.totalIncome,
        weeklyExpenses: snapshot.week.totalExpenses,
        weeklyNetCashFlow: snapshot.week.netCashFlow,
        monthlyIncome: snapshot.month.totalIncome,
        monthlyExpenses: snapshot.month.totalExpenses,
        monthlyNetCashFlow: snapshot.month.netCashFlow,
        trend: snapshot.trend.direction,
        healthScore: snapshot.health.score,
      })
      .returning();
  }

  /**
   * Get upcoming activity (next 7 days)
   */
  async getUpcomingActivity(userId, tenantId) {
    try {
      const today = new Date();
      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      // Get planned expenses/income for next week
      const upcomingExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            gte(expenses.date, today),
            lte(expenses.date, sevenDaysLater)
          )
        )
        .orderBy((t) => t.date);

      // Aggregate by date
      const byDate = {};
      upcomingExpenses.forEach((exp) => {
        const dateStr = new Date(exp.date).toISOString().split('T')[0];
        if (!byDate[dateStr]) {
          byDate[dateStr] = { total: 0, count: 0, items: [] };
        }
        byDate[dateStr].total += parseFloat(exp.amount);
        byDate[dateStr].count++;
        byDate[dateStr].items.push({
          category: exp.categoryId,
          amount: parseFloat(exp.amount),
        });
      });

      return {
        upcomingFound: Object.keys(byDate).length > 0,
        nextSevenDays: byDate,
        totalPlanned: Object.values(byDate).reduce((sum, d) => sum + d.total, 0),
      };
    } catch (error) {
      console.error('Error getting upcoming activity:', error);
      throw error;
    }
  }

  /**
   * Get cash flow history
   */
  async getHistoricalSnapshots(userId, tenantId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const snapshots = await db
        .select()
        .from(cashFlowTracker)
        .where(
          and(
            eq(cashFlowTracker.userId, userId),
            eq(cashFlowTracker.tenantId, tenantId),
            gte(cashFlowTracker.snapshotDate, startDate)
          )
        )
        .orderBy((t) => desc(t.snapshotDate));

      return {
        historyFound: snapshots.length > 0,
        periodDays: days,
        snapshotCount: snapshots.length,
        snapshots,
      };
    } catch (error) {
      console.error('Error getting historical snapshots:', error);
      throw error;
    }
  }

  /**
   * Get cash flow by week
   */
  async getWeeklyComparison(userId, tenantId) {
    try {
      const currentWeek = await this.getCashFlowForPeriod(userId, tenantId, 7);
      const lastWeek = await this.getCashFlowForPeriodEndingAt(
        userId,
        tenantId,
        14,
        7
      );

      return {
        currentWeek: {
          period: 'this_week',
          netCashFlow: currentWeek.netCashFlow,
          expenses: currentWeek.totalExpenses,
          income: currentWeek.totalIncome,
        },
        previousWeek: {
          period: 'last_week',
          netCashFlow: lastWeek?.netCashFlow || 0,
          expenses: lastWeek?.totalExpenses || 0,
          income: lastWeek?.totalIncome || 0,
        },
        comparison: {
          expenseChange:
            lastWeek && lastWeek.totalExpenses > 0
              ? Math.round(
                  ((currentWeek.totalExpenses - lastWeek.totalExpenses) /
                    lastWeek.totalExpenses) *
                    100 * 100
                ) / 100
              : 0,
          trend: currentWeek.netCashFlow > (lastWeek?.netCashFlow || 0) ? 'improving' : 'declining',
        },
      };
    } catch (error) {
      console.error('Error getting weekly comparison:', error);
      throw error;
    }
  }

  /**
   * Get cash flow for a period ending at a specific time
   */
  async getCashFlowForPeriodEndingAt(userId, tenantId, totalDays, endingDaysAgo) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - endingDaysAgo);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - totalDays + endingDaysAgo);
    startDate.setHours(0, 0, 0, 0);

    const periodExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        )
      );

    const totalExpenses = periodExpenses.reduce(
      (sum, e) => sum + parseFloat(e.amount),
      0
    );

    return {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netCashFlow: -totalExpenses, // Assuming no income data
    };
  }
}

export const cashFlowTrackerService = new CashFlowTrackerService();
