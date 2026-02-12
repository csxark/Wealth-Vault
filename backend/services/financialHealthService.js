import { eq, desc, and, gte, lte } from 'drizzle-orm';
import db from '../config/db.js';
import { financialHealthScores, users, expenses, goals, categories } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Financial Health Scoring Service
 * Calculates comprehensive financial health scores based on multiple factors
 */

// Scoring weights (total = 100%)
const WEIGHTS = {
  SAVINGS_RATE: 0.25,      // 25%
  DTI: 0.20,               // 20%
  BUDGET_ADHERENCE: 0.20,  // 20%
  GOAL_PROGRESS: 0.15,     // 15%
  EMERGENCY_FUND: 0.10,    // 10%
  VOLATILITY: 0.10         // 10%
};

/**
 * Calculate savings rate score (0-100)
 * Savings rate = (monthly savings / monthly income) * 100
 * @param {Object} user - User data
 * @param {Array} expenses - User's expenses for the period
 * @returns {number} Savings rate score
 */
const calculateSavingsRateScore = (user, expenses) => {
  const monthlyIncome = parseFloat(user.monthlyIncome || 0);
  if (monthlyIncome <= 0) return 0;

  // Calculate total expenses for the current month
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyExpenses = expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === currentMonth &&
             expenseDate.getFullYear() === currentYear;
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

  const savingsRate = ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;

  // Score based on savings rate
  if (savingsRate >= 20) return 100;      // Excellent
  if (savingsRate >= 15) return 80;       // Good
  if (savingsRate >= 10) return 60;       // Fair
  if (savingsRate >= 5) return 40;        // Poor
  if (savingsRate >= 0) return 20;        // Very Poor
  return 0;                               // Negative savings
};

/**
 * Calculate Debt-to-Income ratio score (0-100)
 * DTI = (monthly debt payments / monthly income) * 100
 * @param {Object} user - User data
 * @param {Array} expenses - User's expenses for the period
 * @returns {number} DTI score
 */
const calculateDTIScore = (user, expenses) => {
  const monthlyIncome = parseFloat(user.monthlyIncome || 0);
  if (monthlyIncome <= 0) return 0;

  // Identify debt-related expenses (loans, credit cards, etc.)
  const debtCategories = ['loans', 'credit_cards', 'debt'];
  const monthlyDebtPayments = expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      return expenseDate.getMonth() === currentMonth &&
             expenseDate.getFullYear() === currentYear &&
             debtCategories.some(cat => expense.category?.name?.toLowerCase().includes(cat));
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

  const dti = (monthlyDebtPayments / monthlyIncome) * 100;

  // Score based on DTI ratio
  if (dti <= 20) return 100;      // Excellent
  if (dti <= 30) return 80;       // Good
  if (dti <= 40) return 60;       // Fair
  if (dti <= 50) return 40;       // Poor
  return 0;                       // Very Poor
};

/**
 * Calculate budget adherence score (0-100)
 * Based on how well user stays within budget limits
 * @param {Object} user - User data
 * @param {Array} expenses - User's expenses for the period
 * @param {Array} categories - User's categories with budgets
 * @returns {number} Budget adherence score
 */
const calculateBudgetAdherenceScore = (user, expenses, categories) => {
  const monthlyBudget = parseFloat(user.monthlyBudget || 0);
  if (monthlyBudget <= 0) return 0;

  // Calculate total expenses for current month
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyExpenses = expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === currentMonth &&
             expenseDate.getFullYear() === currentYear;
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

  const budgetUtilization = (monthlyExpenses / monthlyBudget) * 100;

  // Score based on budget utilization
  if (budgetUtilization <= 80) return 100;      // Excellent
  if (budgetUtilization <= 90) return 90;       // Very Good
  if (budgetUtilization <= 100) return 80;      // Good
  if (budgetUtilization <= 110) return 60;      // Fair
  if (budgetUtilization <= 120) return 40;      // Poor
  return 0;                                     // Very Poor
};

/**
 * Calculate goal progress score (0-100)
 * Based on completion rate of active goals
 * @param {Array} goals - User's goals
 * @returns {number} Goal progress score
 */
const calculateGoalProgressScore = (goals) => {
  if (goals.length === 0) return 50; // Neutral score if no goals

  const activeGoals = goals.filter(goal => goal.status === 'active');
  if (activeGoals.length === 0) return 50;

  const totalProgress = activeGoals.reduce((sum, goal) => {
    const progress = (parseFloat(goal.currentAmount || 0) / parseFloat(goal.targetAmount || 1)) * 100;
    return sum + Math.min(progress, 100); // Cap at 100%
  }, 0);

  const averageProgress = totalProgress / activeGoals.length;

  // Score based on average goal progress
  if (averageProgress >= 80) return 100;      // Excellent
  if (averageProgress >= 60) return 80;       // Good
  if (averageProgress >= 40) return 60;       // Fair
  if (averageProgress >= 20) return 40;       // Poor
  return 20;                                  // Very Poor
};

/**
 * Calculate emergency fund score (0-100)
 * Based on emergency fund coverage (months of expenses)
 * @param {Object} user - User data
 * @param {Array} expenses - User's expenses for the period
 * @returns {number} Emergency fund score
 */
const calculateEmergencyFundScore = (user, expenses) => {
  const emergencyFund = parseFloat(user.emergencyFund || 0);
  const monthlyIncome = parseFloat(user.monthlyIncome || 0);

  if (monthlyIncome <= 0) return 0;

  // Estimate monthly expenses from recent data
  const recentExpenses = expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return expenseDate >= threeMonthsAgo;
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

  const avgMonthlyExpenses = recentExpenses / 3;
  const monthsCovered = emergencyFund / avgMonthlyExpenses;

  // Score based on months of expenses covered
  if (monthsCovered >= 6) return 100;       // Excellent (6+ months)
  if (monthsCovered >= 3) return 80;        // Good (3-6 months)
  if (monthsCovered >= 2) return 60;        // Fair (2-3 months)
  if (monthsCovered >= 1) return 40;        // Poor (1-2 months)
  if (monthsCovered > 0) return 20;         // Very Poor (< 1 month)
  return 0;                                 // No emergency fund
};

/**
 * Calculate volatility score (0-100)
 * Based on expense volatility (consistency of spending)
 * @param {Array} expenses - User's expenses for the period
 * @returns {number} Volatility score
 */
const calculateVolatilityScore = (expenses) => {
  if (expenses.length < 10) return 50; // Neutral score with insufficient data

  // Group expenses by month
  const monthlyTotals = {};
  expenses.forEach(expense => {
    const date = new Date(expense.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthlyTotals[key] = (monthlyTotals[key] || 0) + parseFloat(expense.amount);
  });

  const monthlyAmounts = Object.values(monthlyTotals);
  if (monthlyAmounts.length < 3) return 50;

  // Calculate coefficient of variation (CV)
  const mean = monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length;
  const variance = monthlyAmounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / monthlyAmounts.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

  // Score based on coefficient of variation (lower is better)
  if (cv <= 10) return 100;      // Very consistent
  if (cv <= 20) return 80;       // Consistent
  if (cv <= 30) return 60;       // Moderate volatility
  if (cv <= 40) return 40;       // High volatility
  return 20;                     // Very high volatility
};

/**
 * Calculate overall financial health score
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Score calculation result
 */
export const calculateFinancialHealthScore = async (userId) => {
  try {
    // Fetch user data
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error('User not found');

    // Fetch recent expenses (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const userExpenses = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        date: expenses.date,
        category: categories
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(
        eq(expenses.userId, userId),
        gte(expenses.date, sixMonthsAgo)
      ));

    // Fetch user goals
    const userGoals = await db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId));

    // Fetch user categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));

    // Calculate individual component scores
    const savingsRateScore = calculateSavingsRateScore(user, userExpenses);
    const dtiScore = calculateDTIScore(user, userExpenses);
    const budgetAdherenceScore = calculateBudgetAdherenceScore(user, userExpenses, userCategories);
    const goalProgressScore = calculateGoalProgressScore(userGoals);
    const emergencyFundScore = calculateEmergencyFundScore(user, userExpenses);
    const volatilityScore = calculateVolatilityScore(userExpenses);

    // Calculate overall score
    const overallScore = Math.round(
      savingsRateScore * WEIGHTS.SAVINGS_RATE +
      dtiScore * WEIGHTS.DTI +
      budgetAdherenceScore * WEIGHTS.BUDGET_ADHERENCE +
      goalProgressScore * WEIGHTS.GOAL_PROGRESS +
      emergencyFundScore * WEIGHTS.EMERGENCY_FUND +
      volatilityScore * WEIGHTS.VOLATILITY
    );

    // Determine rating
    let rating;
    if (overallScore >= 80) rating = 'Excellent';
    else if (overallScore >= 60) rating = 'Good';
    else if (overallScore >= 40) rating = 'Fair';
    else if (overallScore >= 20) rating = 'Poor';
    else rating = 'Very Poor';

    // Generate insights and recommendations
    const { insights, recommendation } = generateInsightsAndRecommendations({
      savingsRateScore,
      dtiScore,
      budgetAdherenceScore,
      goalProgressScore,
      emergencyFundScore,
      volatilityScore
    });

    // Prepare metrics
    const metrics = {
      monthlyIncome: parseFloat(user.monthlyIncome || 0),
      monthlyExpenses: calculateMonthlyExpenses(userExpenses),
      savingsRate: calculateSavingsRate(user, userExpenses),
      dti: calculateDTI(user, userExpenses),
      emergencyFundMonths: calculateEmergencyFundMonths(user, userExpenses),
      budgetUtilization: calculateBudgetUtilization(user, userExpenses),
      goalCompletionRate: calculateGoalCompletionRate(userGoals),
      expenseVolatility: calculateExpenseVolatility(userExpenses)
    };

    // Prepare cash flow prediction (simplified)
    const cashFlowPrediction = {
      nextMonth: metrics.monthlyIncome - metrics.monthlyExpenses,
      trend: 'stable', // Could be enhanced with ML
      confidence: 0.8
    };

    return {
      overallScore,
      rating,
      dtiScore,
      savingsRateScore,
      volatilityScore,
      emergencyFundScore,
      budgetAdherenceScore,
      goalProgressScore,
      metrics,
      recommendation,
      insights,
      cashFlowPrediction
    };

  } catch (error) {
    logError('Error calculating financial health score', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get current financial health score for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Current score or null if not calculated
 */
export const getCurrentFinancialHealthScore = async (userId) => {
  try {
    const [score] = await db
      .select()
      .from(financialHealthScores)
      .where(eq(financialHealthScores.userId, userId))
      .orderBy(desc(financialHealthScores.calculatedAt))
      .limit(1);

    return score || null;
  } catch (error) {
    logError('Error fetching current financial health score', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get historical financial health scores for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of records to fetch
 * @returns {Promise<Array>} Historical scores
 */
export const getFinancialHealthScoreHistory = async (userId, limit = 12) => {
  try {
    const scores = await db
      .select()
      .from(financialHealthScores)
      .where(eq(financialHealthScores.userId, userId))
      .orderBy(desc(financialHealthScores.calculatedAt))
      .limit(limit);

    return scores;
  } catch (error) {
    logError('Error fetching financial health score history', { userId, error: error.message });
    throw error;
  }
};

/**
 * Recalculate and save financial health score
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated score
 */
export const recalculateAndSaveScore = async (userId) => {
  try {
    const scoreData = await calculateFinancialHealthScore(userId);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Save to database
    const [savedScore] = await db
      .insert(financialHealthScores)
      .values({
        userId,
        overallScore: scoreData.overallScore,
        rating: scoreData.rating,
        dtiScore: scoreData.dtiScore,
        savingsRateScore: scoreData.savingsRateScore,
        volatilityScore: scoreData.volatilityScore,
        emergencyFundScore: scoreData.emergencyFundScore,
        budgetAdherenceScore: scoreData.budgetAdherenceScore,
        goalProgressScore: scoreData.goalProgressScore,
        metrics: scoreData.metrics,
        recommendation: scoreData.recommendation,
        insights: scoreData.insights,
        cashFlowPrediction: scoreData.cashFlowPrediction,
        periodStart,
        periodEnd,
        calculatedAt: now
      })
      .returning();

    logInfo('Financial health score recalculated and saved', {
      userId,
      overallScore: scoreData.overallScore,
      rating: scoreData.rating
    });

    return savedScore;
  } catch (error) {
    logError('Error recalculating and saving financial health score', { userId, error: error.message });
    throw error;
  }
};

// Helper functions for metrics calculation

const calculateMonthlyExpenses = (expenses) => {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  return expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === currentMonth &&
             expenseDate.getFullYear() === currentYear;
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
};

const calculateSavingsRate = (user, expenses) => {
  const monthlyIncome = parseFloat(user.monthlyIncome || 0);
  const monthlyExpenses = calculateMonthlyExpenses(expenses);
  return monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;
};

const calculateDTI = (user, expenses) => {
  const monthlyIncome = parseFloat(user.monthlyIncome || 0);
  const debtCategories = ['loans', 'credit_cards', 'debt'];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyDebtPayments = expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === currentMonth &&
             expenseDate.getFullYear() === currentYear &&
             debtCategories.some(cat => expense.category?.name?.toLowerCase().includes(cat));
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

  return monthlyIncome > 0 ? (monthlyDebtPayments / monthlyIncome) * 100 : 0;
};

const calculateEmergencyFundMonths = (user, expenses) => {
  const emergencyFund = parseFloat(user.emergencyFund || 0);
  const recentExpenses = expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return expenseDate >= threeMonthsAgo;
    })
    .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

  const avgMonthlyExpenses = recentExpenses / 3;
  return avgMonthlyExpenses > 0 ? emergencyFund / avgMonthlyExpenses : 0;
};

const calculateBudgetUtilization = (user, expenses) => {
  const monthlyBudget = parseFloat(user.monthlyBudget || 0);
  const monthlyExpenses = calculateMonthlyExpenses(expenses);
  return monthlyBudget > 0 ? (monthlyExpenses / monthlyBudget) * 100 : 0;
};

const calculateGoalCompletionRate = (goals) => {
  const activeGoals = goals.filter(goal => goal.status === 'active');
  if (activeGoals.length === 0) return 0;

  const totalProgress = activeGoals.reduce((sum, goal) => {
    const progress = (parseFloat(goal.currentAmount || 0) / parseFloat(goal.targetAmount || 1)) * 100;
    return sum + Math.min(progress, 100);
  }, 0);

  return totalProgress / activeGoals.length;
};

const calculateExpenseVolatility = (expenses) => {
  if (expenses.length < 10) return 0;

  const monthlyTotals = {};
  expenses.forEach(expense => {
    const date = new Date(expense.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthlyTotals[key] = (monthlyTotals[key] || 0) + parseFloat(expense.amount);
  });

  const monthlyAmounts = Object.values(monthlyTotals);
  if (monthlyAmounts.length < 3) return 0;

  const mean = monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length;
  const variance = monthlyAmounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / monthlyAmounts.length;
  const stdDev = Math.sqrt(variance);
  return mean > 0 ? (stdDev / mean) * 100 : 0;
};

const generateInsightsAndRecommendations = (scores) => {
  const insights = [];
  const recommendations = [];

  // Savings rate insights
  if (scores.savingsRateScore < 60) {
    insights.push('Your savings rate is below optimal levels');
    recommendations.push('Aim to save at least 15-20% of your monthly income');
  }

  // DTI insights
  if (scores.dtiScore < 60) {
    insights.push('Your debt-to-income ratio is high');
    recommendations.push('Consider paying down high-interest debt or increasing income');
  }

  // Budget adherence insights
  if (scores.budgetAdherenceScore < 60) {
    insights.push('You are exceeding your monthly budget');
    recommendations.push('Review your spending patterns and adjust budget categories');
  }

  // Goal progress insights
  if (scores.goalProgressScore < 60) {
    insights.push('Your financial goals are behind schedule');
    recommendations.push('Increase contributions to your goals or adjust target dates');
  }

  // Emergency fund insights
  if (scores.emergencyFundScore < 60) {
    insights.push('Your emergency fund needs strengthening');
    recommendations.push('Build an emergency fund covering 3-6 months of expenses');
  }

  // Volatility insights
  if (scores.volatilityScore < 60) {
    insights.push('Your spending shows high volatility');
    recommendations.push('Focus on creating more consistent spending habits');
  }

  const recommendation = recommendations.length > 0
    ? recommendations[Math.floor(Math.random() * recommendations.length)]
    : 'Keep up the good work! Your financial health is strong.';

  return { insights, recommendation };
};

export default {
  calculateFinancialHealthScore,
  getCurrentFinancialHealthScore,
  getFinancialHealthScoreHistory,
  recalculateAndSaveScore
};
