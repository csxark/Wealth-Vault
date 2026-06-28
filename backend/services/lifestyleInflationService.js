/**
 * Lifestyle Inflation Detection & Alert Service
 * 
 * Tracks spending-to-income ratio over time, detects lifestyle inflation,
 * and provides actionable recommendations to restore savings rate.
 * 
 * Features:
 * - Income increase detection
 * - 90-day spending pattern monitoring
 * - Category-level inflation analysis
 * - Goal delay projection
 * - Rollback recommendations
 * - Auto-alert generation when savings rate drops >5%
 */

import db from '../config/db.js';
import { 
  lifestyleInflationSnapshots, 
  lifestyleInflationAlerts, 
  incomeHistory,
  expenses, 
  categories, 
  users,
  goals 
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, avg, sum, count } from 'drizzle-orm';
import logger from '../utils/logger.js';
import * as cacheService from './cacheService.js';

const CACHE_PREFIX = 'lifestyle_inflation:';
const MONITORING_WINDOW_DAYS = 90;
const ALERT_THRESHOLD_PCT = 5; // 5% drop in savings rate triggers alert

/**
 * Calculate inflation score (0-100) based on spending increases
 * 0 = No inflation, 100 = Severe inflation
 */
const calculateInflationScore = (preIncomeSpending, postIncomeSpending, incomeIncreasePct) => {
  if (!preIncomeSpending || preIncomeSpending === 0) return 0;
  
  const spendingIncreasePct = ((postIncomeSpending - preIncomeSpending) / preIncomeSpending) * 100;
  
  // If spending increased more than income increase, that's inflation
  if (spendingIncreasePct <= 0) return 0;
  
  // Score calculation: ratio of spending increase to income increase
  const inflationRatio = spendingIncreasePct / Math.max(incomeIncreasePct, 1);
  
  // Scale to 0-100
  let score = Math.min(inflationRatio * 50, 100);
  
  // Penalties for high absolute increases
  if (spendingIncreasePct > 50) score = Math.min(score + 20, 100);
  if (spendingIncreasePct > incomeIncreasePct) score = Math.min(score + 15, 100);
  
  return Math.round(score);
};

/**
 * Detect income increases for a user
 */
export const detectIncomeIncrease = async (userId, tenantId) => {
  try {
    // Get income history for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const incomeRecords = await db
      .select()
      .from(incomeHistory)
      .where(
        and(
          eq(incomeHistory.userId, userId),
          eq(incomeHistory.tenantId, tenantId),
          gte(incomeHistory.recordDate, sixMonthsAgo)
        )
      )
      .orderBy(desc(incomeHistory.recordDate))
      .limit(6);
    
    if (incomeRecords.length < 2) {
      return null; // Not enough data
    }
    
    const latestIncome = parseFloat(incomeRecords[0].monthlyIncome);
    const previousAvgIncome = incomeRecords.slice(1)
      .reduce((sum, record) => sum + parseFloat(record.monthlyIncome), 0) / (incomeRecords.length - 1);
    
    const incomeIncreasePct = ((latestIncome - previousAvgIncome) / previousAvgIncome) * 100;
    
    // Consider it an increase if >5%
    if (incomeIncreasePct > 5) {
      return {
        previousIncome: previousAvgIncome,
        currentIncome: latestIncome,
        increasePct: incomeIncreasePct,
        increaseAmount: latestIncome - previousAvgIncome,
        detectedAt: incomeRecords[0].recordDate
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Error detecting income increase:', error);
    throw error;
  }
};

/**
 * Analyze spending patterns before and after income increase
 */
export const analyzeSpendingPatterns = async (userId, tenantId, incomeIncreaseDate) => {
  try {
    const beforeStart = new Date(incomeIncreaseDate);
    beforeStart.setDate(beforeStart.getDate() - MONITORING_WINDOW_DAYS);
    
    const afterEnd = new Date(incomeIncreaseDate);
    afterEnd.setDate(afterEnd.getDate() + MONITORING_WINDOW_DAYS);
    
    const now = new Date();
    if (afterEnd > now) {
      return null; // Not enough post-increase data yet
    }
    
    // Get spending before income increase
    const beforeSpending = await db
      .select({
        total: sql`SUM(CAST(${expenses.amount} AS NUMERIC))`,
        categoryId: expenses.categoryId,
        categoryName: categories.name
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          gte(expenses.date, beforeStart),
          lte(expenses.date, incomeIncreaseDate)
        )
      )
      .groupBy(expenses.categoryId, categories.name);
    
    // Get spending after income increase
    const afterSpending = await db
      .select({
        total: sql`SUM(CAST(${expenses.amount} AS NUMERIC))`,
        categoryId: expenses.categoryId,
        categoryName: categories.name
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          gte(expenses.date, incomeIncreaseDate),
          lte(expenses.date, afterEnd)
        )
      )
      .groupBy(expenses.categoryId, categories.name);
    
    // Calculate category-level changes
    const categoryBreakdown = [];
    const beforeMap = new Map(
      beforeSpending.map(item => [
        item.categoryId || 'uncategorized', 
        { total: parseFloat(item.total || 0), name: item.categoryName || 'Uncategorized' }
      ])
    );
    
    afterSpending.forEach(item => {
      const categoryId = item.categoryId || 'uncategorized';
      const afterTotal = parseFloat(item.total || 0);
      const beforeTotal = beforeMap.get(categoryId)?.total || 0;
      const categoryName = item.categoryName || 'Uncategorized';
      
      const change = afterTotal - beforeTotal;
      const changePct = beforeTotal > 0 ? (change / beforeTotal) * 100 : 0;
      
      categoryBreakdown.push({
        categoryId,
        categoryName,
        beforeSpending: beforeTotal,
        afterSpending: afterTotal,
        change,
        changePct,
        isInflated: changePct > 10 // Consider >10% increase as inflated
      });
    });
    
    // Sort by change percentage (highest first)
    categoryBreakdown.sort((a, b) => b.changePct - a.changePct);
    
    const totalBeforeSpending = beforeSpending.reduce(
      (sum, item) => sum + parseFloat(item.total || 0), 0
    );
    const totalAfterSpending = afterSpending.reduce(
      (sum, item) => sum + parseFloat(item.total || 0), 0
    );
    
    return {
      totalBeforeSpending,
      totalAfterSpending,
      spendingChange: totalAfterSpending - totalBeforeSpending,
      spendingChangePct: totalBeforeSpending > 0 
        ? ((totalAfterSpending - totalBeforeSpending) / totalBeforeSpending) * 100 
        : 0,
      categoryBreakdown
    };
  } catch (error) {
    logger.error('Error analyzing spending patterns:', error);
    throw error;
  }
};

/**
 * Calculate savings rate
 */
const calculateSavingsRate = (income, spending) => {
  if (income === 0) return 0;
  return ((income - spending) / income) * 100;
};

/**
 * Project goal delay due to reduced savings rate
 */
export const projectGoalDelay = async (userId, tenantId, savingsRateChange) => {
  try {
    // Get user's active goals
    const userGoals = await db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          eq(goals.tenantId, tenantId),
          eq(goals.status, 'active')
        )
      );
    
    const impactedGoals = userGoals.map(goal => {
      const targetAmount = parseFloat(goal.targetAmount);
      const currentAmount = parseFloat(goal.currentAmount);
      const monthlyContribution = parseFloat(goal.monthlyContribution || 0);
      
      if (monthlyContribution === 0) {
        return {
          goalId: goal.id,
          goalName: goal.name,
          impact: 'none',
          delayMonths: 0
        };
      }
      
      // Calculate remaining amount and months needed
      const remaining = targetAmount - currentAmount;
      const originalMonthsToGoal = Math.ceil(remaining / monthlyContribution);
      
      // Adjust for savings rate change
      const adjustedContribution = monthlyContribution * (1 - Math.abs(savingsRateChange) / 100);
      const adjustedMonthsToGoal = Math.ceil(remaining / adjustedContribution);
      
      const delayMonths = adjustedMonthsToGoal - originalMonthsToGoal;
      
      return {
        goalId: goal.id,
        goalName: goal.name,
        originalDeadline: goal.targetDate,
        projectedDelayMonths: Math.max(delayMonths, 0),
        originalContribution: monthlyContribution,
        suggestedContribution: adjustedContribution,
        impact: delayMonths > 3 ? 'high' : delayMonths > 1 ? 'medium' : 'low'
      };
    });
    
    return impactedGoals.filter(goal => goal.projectedDelayMonths > 0);
  } catch (error) {
    logger.error('Error projecting goal delay:', error);
    throw error;
  }
};

/**
 * Generate rollback recommendations
 */
export const generateRollbackRecommendations = (categoryBreakdown, incomeIncrease, savingsRateChange) => {
  const recommendations = [];
  
  // Find top inflated categories
  const inflatedCategories = categoryBreakdown
    .filter(cat => cat.isInflated && cat.change > 100)
    .slice(0, 5);
  
  inflatedCategories.forEach(category => {
    const rollbackAmount = category.change * 0.5; // Suggest rolling back 50%
    
    recommendations.push({
      type: 'category_reduction',
      category: category.categoryName,
      currentSpending: category.afterSpending,
      recommendedSpending: category.beforeSpending + (category.change * 0.5),
      monthlySavings: rollbackAmount,
      priority: category.changePct > 50 ? 'high' : 'medium',
      suggestion: `Consider reducing ${category.categoryName} spending by $${rollbackAmount.toFixed(2)}/month to restore savings rate`
    });
  });
  
  // Calculate total potential savings
  const totalPotentialSavings = recommendations.reduce((sum, rec) => sum + rec.monthlySavings, 0);
  
  // Add overall strategy recommendation
  if (savingsRateChange > 10) {
    recommendations.unshift({
      type: 'overall_strategy',
      priority: 'critical',
      suggestion: `Your savings rate has dropped by ${Math.abs(savingsRateChange).toFixed(1)}%. 
        Consider implementing the "Reverse Budgeting" approach: automatically transfer ${(incomeIncrease * 0.5).toFixed(2)} 
        from your income increase to savings before it reaches your spending account.`
    });
  }
  
  return {
    recommendations,
    totalPotentialSavings,
    estimatedSavingsRateRestoration: totalPotentialSavings > 0 
      ? (totalPotentialSavings / incomeIncrease) * 100 
      : 0
  };
};

/**
 * Comprehensive lifestyle inflation analysis
 */
export const analyzeLifestyleInflation = async (userId, tenantId) => {
  try {
    // 1. Detect income increase
    const incomeIncrease = await detectIncomeIncrease(userId, tenantId);
    
    if (!incomeIncrease) {
      return {
        status: 'no_increase_detected',
        message: 'No significant income increase detected in the last 6 months'
      };
    }
    
    // 2. Analyze spending patterns
    const spendingAnalysis = await analyzeSpendingPatterns(
      userId, 
      tenantId, 
      incomeIncrease.detectedAt
    );
    
    if (!spendingAnalysis) {
      return {
        status: 'insufficient_data',
        message: 'Not enough post-income-increase data for analysis (need 90 days)'
      };
    }
    
    // 3. Calculate savings rates
    const beforeSavingsRate = calculateSavingsRate(
      incomeIncrease.previousIncome,
      spendingAnalysis.totalBeforeSpending / 3 // Convert 90 days to monthly
    );
    
    const afterSavingsRate = calculateSavingsRate(
      incomeIncrease.currentIncome,
      spendingAnalysis.totalAfterSpending / 3 // Convert 90 days to monthly
    );
    
    const savingsRateChange = afterSavingsRate - beforeSavingsRate;
    
    // 4. Calculate inflation score
    const inflationScore = calculateInflationScore(
      spendingAnalysis.totalBeforeSpending,
      spendingAnalysis.totalAfterSpending,
      incomeIncrease.increasePct
    );
    
    // 5. Project goal delays
    const goalDelays = await projectGoalDelay(userId, tenantId, savingsRateChange);
    
    // 6. Generate recommendations
    const rollbackPlan = generateRollbackRecommendations(
      spendingAnalysis.categoryBreakdown,
      incomeIncrease.increaseAmount,
      savingsRateChange
    );
    
    // 7. Save snapshot
    const snapshot = await db.insert(lifestyleInflationSnapshots).values({
      userId,
      tenantId,
      incomeIncreaseDate: incomeIncrease.detectedAt,
      previousIncome: incomeIncrease.previousIncome.toString(),
      currentIncome: incomeIncrease.currentIncome.toString(),
      incomeIncreasePct: incomeIncrease.increasePct.toString(),
      beforeSpending: spendingAnalysis.totalBeforeSpending.toString(),
      afterSpending: spendingAnalysis.totalAfterSpending.toString(),
      spendingIncreasePct: spendingAnalysis.spendingChangePct.toString(),
      beforeSavingsRate: beforeSavingsRate.toString(),
      afterSavingsRate: afterSavingsRate.toString(),
      savingsRateChange: savingsRateChange.toString(),
      inflationScore,
      categoryBreakdown: spendingAnalysis.categoryBreakdown,
      goalImpact: goalDelays,
      recommendations: rollbackPlan.recommendations
    }).returning();
    
    // 8. Create alert if savings rate dropped significantly
    if (savingsRateChange < -ALERT_THRESHOLD_PCT) {
      await db.insert(lifestyleInflationAlerts).values({
        userId,
        tenantId,
        snapshotId: snapshot[0].id,
        alertType: 'savings_rate_drop',
        severity: savingsRateChange < -15 ? 'critical' : savingsRateChange < -10 ? 'high' : 'medium',
        title: 'Lifestyle Inflation Detected',
        message: `Your savings rate has dropped by ${Math.abs(savingsRateChange).toFixed(1)}% after your recent income increase`,
        actionRequired: true,
        isRead: false,
        metadata: {
          inflationScore,
          savingsRateChange,
          topInflatedCategories: spendingAnalysis.categoryBreakdown.slice(0, 3)
        }
      });
    }
    
    return {
      status: 'analysis_complete',
      inflationScore,
      incomeIncrease: {
        previousIncome: incomeIncrease.previousIncome,
        currentIncome: incomeIncrease.currentIncome,
        increasePct: incomeIncrease.increasePct,
        increaseAmount: incomeIncrease.increaseAmount
      },
      spendingAnalysis: {
        beforeSpending: spendingAnalysis.totalBeforeSpending,
        afterSpending: spendingAnalysis.totalAfterSpending,
        changePct: spendingAnalysis.spendingChangePct
      },
      savingsRate: {
        before: beforeSavingsRate,
        after: afterSavingsRate,
        change: savingsRateChange
      },
      categoryBreakdown: spendingAnalysis.categoryBreakdown,
      goalDelays,
      rollbackPlan,
      alert: savingsRateChange < -ALERT_THRESHOLD_PCT
    };
  } catch (error) {
    logger.error('Error analyzing lifestyle inflation:', error);
    throw error;
  }
};

/**
 * Get lifestyle inflation history for a user
 */
export const getInflationHistory = async (userId, tenantId, limit = 10) => {
  try {
    const snapshots = await db
      .select()
      .from(lifestyleInflationSnapshots)
      .where(
        and(
          eq(lifestyleInflationSnapshots.userId, userId),
          eq(lifestyleInflationSnapshots.tenantId, tenantId)
        )
      )
      .orderBy(desc(lifestyleInflationSnapshots.createdAt))
      .limit(limit);
    
    return snapshots;
  } catch (error) {
    logger.error('Error fetching inflation history:', error);
    throw error;
  }
};

/**
 * Get active inflation alerts for a user
 */
export const getInflationAlerts = async (userId, tenantId) => {
  try {
    const alerts = await db
      .select()
      .from(lifestyleInflationAlerts)
      .where(
        and(
          eq(lifestyleInflationAlerts.userId, userId),
          eq(lifestyleInflationAlerts.tenantId, tenantId),
          eq(lifestyleInflationAlerts.status, 'active')
        )
      )
      .orderBy(desc(lifestyleInflationAlerts.createdAt));
    
    return alerts;
  } catch (error) {
    logger.error('Error fetching inflation alerts:', error);
    throw error;
  }
};

/**
 * Mark alert as acknowledged
 */
export const acknowledgeAlert = async (alertId, userId, tenantId) => {
  try {
    const updated = await db
      .update(lifestyleInflationAlerts)
      .set({
        isRead: true,
        acknowledgedAt: new Date(),
        status: 'acknowledged'
      })
      .where(
        and(
          eq(lifestyleInflationAlerts.id, alertId),
          eq(lifestyleInflationAlerts.userId, userId),
          eq(lifestyleInflationAlerts.tenantId, tenantId)
        )
      )
      .returning();
    
    return updated[0];
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    throw error;
  }
};

/**
 * Track income change manually
 */
export const recordIncomeChange = async (userId, tenantId, newIncome) => {
  try {
    const record = await db.insert(incomeHistory).values({
      userId,
      tenantId,
      monthlyIncome: newIncome.toString(),
      recordDate: new Date(),
      source: 'manual',
      metadata: {}
    }).returning();
    
    // Update user's current income
    await db
      .update(users)
      .set({ monthlyIncome: newIncome.toString() })
      .where(eq(users.id, userId));
    
    return record[0];
  } catch (error) {
    logger.error('Error recording income change:', error);
    throw error;
  }
};

export default {
  analyzeLifestyleInflation,
  detectIncomeIncrease,
  analyzeSpendingPatterns,
  projectGoalDelay,
  generateRollbackRecommendations,
  getInflationHistory,
  getInflationAlerts,
  acknowledgeAlert,
  recordIncomeChange
};
