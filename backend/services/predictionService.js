/**
 * Prediction Service
 * Handles predictive analytics and forecasting for financial data
 */

import { eq, and, gte, lte, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, users, goals, categories, financialHealthScores } from "../db/schema.js";
import {
  calculateDTI,
  calculateSavingsRate,
  calculateSpendingVolatility,
  calculateEmergencyFundAdequacy,
  calculateBudgetAdherence,
  calculateGoalProgress,
  calculateFinancialHealthScore,
  predictCashFlow,
  analyzeSpendingByDayOfWeek,
  calculateCategoryConcentration,
} from "../utils/financialCalculations.js";

/**
 * Calculate comprehensive financial health metrics for a user
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date for analysis period
 * @param {Date} endDate - End date for analysis period
 * @returns {object} Complete financial health analysis
 */
export async function calculateUserFinancialHealth(userId, startDate, endDate) {
  try {
    // Get user data
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      throw new Error("User not found");
    }

    const monthlyIncome = Number(user.monthlyIncome || 0);
    const monthlyBudget = Number(user.monthlyBudget || 0);
    const emergencyFund = Number(user.emergencyFund || 0);

    // Get expenses for the period
    const userExpenses = await db.query.expenses.findMany({
      where: and(
        eq(expenses.userId, userId),
        eq(expenses.status, "completed"),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate)
      ),
      with: {
        category: {
          columns: { name: true, color: true, icon: true },
        },
      },
    });

    // Calculate total expenses for the period
    const totalExpenses = userExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    
    // Get category breakdown
    const categorySpending = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        total: sql`sum(${expenses.amount})`,
        count: sql`count(*)`,
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.status, "completed"),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        )
      )
      .groupBy(expenses.categoryId, categories.name);

    // Get monthly spending trend (last 6 months)
    const monthlyTrend = await getMonthlyTrend(userId, 6);

    // Get recurring expenses
    const recurringExpenses = await db.query.expenses.findMany({
      where: and(
        eq(expenses.userId, userId),
        eq(expenses.isRecurring, true),
        eq(expenses.status, "completed")
      ),
    });

    // Get user goals
    const userGoals = await db.query.goals.findMany({
      where: and(
        eq(goals.userId, userId),
        eq(goals.status, "active")
      ),
    });

    // Calculate metrics
    const monthlyExpenses = totalExpenses; // For the current period
    
    // Estimate monthly debt from recurring expenses (assuming some are debt payments)
    const monthlyDebt = recurringExpenses
      .filter(exp => {
        const desc = exp.description.toLowerCase();
        return desc.includes('loan') || desc.includes('credit') || desc.includes('mortgage') || desc.includes('debt');
      })
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const dti = calculateDTI(monthlyDebt, monthlyIncome);
    const savingsRate = calculateSavingsRate(monthlyIncome, monthlyExpenses);
    const volatilityMetrics = calculateSpendingVolatility(monthlyTrend.map(m => m.total));
    const emergencyFundMetrics = calculateEmergencyFundAdequacy(emergencyFund, monthlyExpenses);
    const budgetAdherenceMetrics = calculateBudgetAdherence(monthlyExpenses, monthlyBudget);
    const goalProgressMetrics = calculateGoalProgress(
      userGoals.map(g => ({
        currentAmount: Number(g.currentAmount),
        targetAmount: Number(g.targetAmount),
        title: g.title,
      }))
    );

    // Calculate overall financial health score
    const healthScore = calculateFinancialHealthScore({
      dti,
      savingsRate,
      volatility: volatilityMetrics.volatility,
      emergencyFundScore: emergencyFundMetrics.score,
      budgetAdherence: budgetAdherenceMetrics.adherence,
      goalProgress: goalProgressMetrics.score,
    });

    // Predict cash flow
    const cashFlowPrediction = predictCashFlow(
      monthlyTrend,
      recurringExpenses.map(exp => ({ amount: Number(exp.amount) })),
      monthlyIncome
    );

    // Additional insights
    const dayOfWeekAnalysis = analyzeSpendingByDayOfWeek(
      userExpenses.map(exp => ({
        date: exp.date,
        amount: Number(exp.amount),
      }))
    );

    const concentrationMetrics = calculateCategoryConcentration(
      categorySpending.map(cat => ({
        categoryName: cat.categoryName || 'Uncategorized',
        total: Number(cat.total),
      }))
    );

    // Generate insights
    const insights = generateInsights({
      dti,
      savingsRate,
      volatilityMetrics,
      emergencyFundMetrics,
      budgetAdherenceMetrics,
      goalProgressMetrics,
      cashFlowPrediction,
      concentrationMetrics,
      dayOfWeekAnalysis,
    });

    return {
      overallScore: healthScore.overallScore,
      rating: healthScore.rating,
      recommendation: healthScore.recommendation,
      breakdown: healthScore.breakdown,
      metrics: {
        dti,
        savingsRate,
        volatility: volatilityMetrics.volatility,
        monthlyIncome,
        monthlyExpenses,
        emergencyFundMonths: emergencyFundMetrics.monthsCovered,
        budgetAdherence: budgetAdherenceMetrics.adherence,
        goalProgress: goalProgressMetrics.averageProgress,
      },
      insights,
      cashFlowPrediction,
      concentrationMetrics,
      dayOfWeekAnalysis,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error calculating financial health:", error);
    throw error;
  }
}

/**
 * Get monthly spending trend
 */
async function getMonthlyTrend(userId, months) {
  const now = new Date();
  const monthlyData = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const [monthData] = await db
      .select({
        total: sql`COALESCE(sum(${expenses.amount}), 0)`,
        count: sql`count(*)`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.status, "completed"),
          gte(expenses.date, monthStart),
          lte(expenses.date, monthEnd)
        )
      );

    monthlyData.push({
      month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: Number(monthData?.total || 0),
      count: Number(monthData?.count || 0),
      date: monthStart.toISOString(),
    });
  }

  return monthlyData;
}

/**
 * Generate actionable insights based on financial metrics
 */
function generateInsights(data) {
  const insights = [];

  // DTI insights
  if (data.dti > 43) {
    insights.push({
      type: 'warning',
      category: 'Debt',
      title: 'High Debt-to-Income Ratio',
      message: `Your debt payments are ${data.dti.toFixed(0)}% of your income. Consider debt consolidation or increasing income.`,
      priority: 'high',
    });
  } else if (data.dti < 20) {
    insights.push({
      type: 'success',
      category: 'Debt',
      title: 'Excellent Debt Management',
      message: 'Your debt-to-income ratio is excellent. Keep maintaining this healthy balance.',
      priority: 'low',
    });
  }

  // Savings rate insights
  if (data.savingsRate < 0) {
    insights.push({
      type: 'critical',
      category: 'Savings',
      title: 'Spending More Than Earning',
      message: 'You\'re spending more than you earn. Immediate budget review required.',
      priority: 'critical',
    });
  } else if (data.savingsRate < 10) {
    insights.push({
      type: 'warning',
      category: 'Savings',
      title: 'Low Savings Rate',
      message: `You\'re only saving ${data.savingsRate.toFixed(1)}% of your income. Try to increase this to at least 20%.`,
      priority: 'high',
    });
  } else if (data.savingsRate >= 20) {
    insights.push({
      type: 'success',
      category: 'Savings',
      title: 'Strong Savings Habit',
      message: `You\'re saving ${data.savingsRate.toFixed(1)}% of your income. Great work!`,
      priority: 'low',
    });
  }

  // Volatility insights
  if (data.volatilityMetrics.volatility > 40) {
    insights.push({
      type: 'warning',
      category: 'Spending Consistency',
      title: 'High Spending Volatility',
      message: 'Your spending varies significantly month-to-month. Consider creating a more consistent budget.',
      priority: 'medium',
    });
  } else if (data.volatilityMetrics.volatility < 15) {
    insights.push({
      type: 'success',
      category: 'Spending Consistency',
      title: 'Consistent Spending Patterns',
      message: 'Your spending is very consistent. This makes budgeting easier.',
      priority: 'low',
    });
  }

  // Emergency fund insights
  if (data.emergencyFundMetrics.monthsCovered < 1) {
    insights.push({
      type: 'critical',
      category: 'Emergency Fund',
      title: 'Insufficient Emergency Fund',
      message: `You only have ${data.emergencyFundMetrics.monthsCovered.toFixed(1)} months of expenses saved. Build this to 3-6 months.`,
      priority: 'critical',
    });
  } else if (data.emergencyFundMetrics.monthsCovered >= 6) {
    insights.push({
      type: 'success',
      category: 'Emergency Fund',
      title: 'Excellent Emergency Preparedness',
      message: `You have ${data.emergencyFundMetrics.monthsCovered.toFixed(1)} months of expenses saved. You\'re well prepared!`,
      priority: 'low',
    });
  }

  // Budget adherence insights
  if (data.budgetAdherenceMetrics.status === 'poor') {
    insights.push({
      type: 'warning',
      category: 'Budget',
      title: 'Significant Budget Overrun',
      message: `You\'re ${Math.abs(data.budgetAdherenceMetrics.adherence).toFixed(0)}% over budget. Review and adjust your spending categories.`,
      priority: 'high',
    });
  } else if (data.budgetAdherenceMetrics.status === 'excellent') {
    insights.push({
      type: 'success',
      category: 'Budget',
      title: 'Excellent Budget Management',
      message: 'You\'re staying well within your budget. Great discipline!',
      priority: 'low',
    });
  }

  // Cash flow prediction insights
  if (data.cashFlowPrediction.warning) {
    insights.push({
      type: 'warning',
      category: 'Forecast',
      title: 'Cash Flow Warning',
      message: data.cashFlowPrediction.warning,
      priority: 'high',
    });
  }

  // Category concentration insights
  if (data.concentrationMetrics.concentrationIndex > 50) {
    insights.push({
      type: 'info',
      category: 'Spending Distribution',
      title: 'Concentrated Spending',
      message: `${data.concentrationMetrics.dominantCategoryPercentage.toFixed(0)}% of spending is in ${data.concentrationMetrics.dominantCategory}. Consider if this balance is optimal.`,
      priority: 'medium',
    });
  }

  // Day of week insights
  if (data.dayOfWeekAnalysis.weekendTotal > data.dayOfWeekAnalysis.weekdayTotal * 0.4) {
    insights.push({
      type: 'info',
      category: 'Spending Patterns',
      title: 'High Weekend Spending',
      message: `You spend significantly more on weekends. Consider weekend budgeting strategies.`,
      priority: 'medium',
    });
  }

  // Goal progress insights
  if (data.goalProgressMetrics.totalGoals > 0) {
    if (data.goalProgressMetrics.averageProgress < 25) {
      insights.push({
        type: 'warning',
        category: 'Goals',
        title: 'Slow Goal Progress',
        message: `Your goals are ${data.goalProgressMetrics.averageProgress.toFixed(0)}% complete on average. Consider increasing contributions.`,
        priority: 'medium',
      });
    } else if (data.goalProgressMetrics.averageProgress >= 75) {
      insights.push({
        type: 'success',
        category: 'Goals',
        title: 'Excellent Goal Progress',
        message: `Your goals are ${data.goalProgressMetrics.averageProgress.toFixed(0)}% complete on average. Keep it up!`,
        priority: 'low',
      });
    }
  } else {
    insights.push({
      type: 'info',
      category: 'Goals',
      title: 'No Active Goals',
      message: 'Consider setting financial goals to improve motivation and track progress.',
      priority: 'low',
    });
  }

  return insights;
}

/**
 * Save financial health score to database
 */
export async function saveFinancialHealthScore(userId, healthData, periodStart, periodEnd) {
  try {
    const [saved] = await db.insert(financialHealthScores).values({
      userId,
      overallScore: healthData.overallScore,
      rating: healthData.rating,
      dtiScore: healthData.breakdown.dti,
      savingsRateScore: healthData.breakdown.savingsRate,
      volatilityScore: healthData.breakdown.volatility,
      emergencyFundScore: healthData.breakdown.emergencyFund,
      budgetAdherenceScore: healthData.breakdown.budgetAdherence,
      goalProgressScore: healthData.breakdown.goalProgress,
      metrics: healthData.metrics,
      recommendation: healthData.recommendation,
      insights: healthData.insights,
      cashFlowPrediction: healthData.cashFlowPrediction,
      periodStart,
      periodEnd,
    }).returning();

    return saved;
  } catch (error) {
    console.error("Error saving financial health score:", error);
    throw error;
  }
}

/**
 * Get historical health scores for a user
 */
export async function getHealthScoreHistory(userId, limit = 12) {
  try {
    const scores = await db
      .select()
      .from(financialHealthScores)
      .where(eq(financialHealthScores.userId, userId))
      .orderBy(sql`${financialHealthScores.calculatedAt} DESC`)
      .limit(limit);

    return scores.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error fetching health score history:", error);
    throw error;
  }
}

/**
 * Compare current health score with previous period
 */
export async function compareHealthScores(userId) {
  try {
    const recentScores = await db
      .select()
      .from(financialHealthScores)
      .where(eq(financialHealthScores.userId, userId))
      .orderBy(sql`${financialHealthScores.calculatedAt} DESC`)
      .limit(2);

    if (recentScores.length < 2) {
      return null;
    }

    const [current, previous] = recentScores;
    const scoreDiff = current.overallScore - previous.overallScore;
    const percentChange = (scoreDiff / previous.overallScore) * 100;

    return {
      current: {
        score: current.overallScore,
        rating: current.rating,
        date: current.calculatedAt,
      },
      previous: {
        score: previous.overallScore,
        rating: previous.rating,
        date: previous.calculatedAt,
      },
      change: {
        absolute: scoreDiff,
        percentage: percentChange,
        trend: scoreDiff > 0 ? 'improving' : scoreDiff < 0 ? 'declining' : 'stable',
      },
      breakdown: {
        dti: current.dtiScore - previous.dtiScore,
        savingsRate: current.savingsRateScore - previous.savingsRateScore,
        volatility: current.volatilityScore - previous.volatilityScore,
        emergencyFund: current.emergencyFundScore - previous.emergencyFundScore,
        budgetAdherence: current.budgetAdherenceScore - previous.budgetAdherenceScore,
        goalProgress: current.goalProgressScore - previous.goalProgressScore,
      },
    };
  } catch (error) {
    console.error("Error comparing health scores:", error);
    throw error;
  }
}
