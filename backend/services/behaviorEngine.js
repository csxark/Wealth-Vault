/**
 * Behavior Engine Service
 * Calculates financial health scores based on budget adherence, savings rate, and behavioral patterns
 */

import { db } from '../config/db.js';
import { userScores, expenses, goals, categories, users, budgetRules, habitLogs } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

/**
 * Calculate comprehensive financial health score for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Calculated scores and insights
 */
export async function calculateFinancialHealthScore(userId) {
  try {
    // Get user data
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // Calculate time periods
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Parallel fetch of all data
    const [
      recentExpenses,
      historicalExpenses,
      userGoals,
      budgetScore,
      savingsScore,
      consistencyScore,
      impulseScore,
      planningScore
    ] = await Promise.all([
      getRecentExpenses(userId, thirtyDaysAgo),
      getRecentExpenses(userId, ninetyDaysAgo),
      getUserGoals(userId),
      calculateBudgetAdherenceScore(userId, user),
      calculateSavingsRateScore(userId, user),
      calculateConsistencyScore(userId, thirtyDaysAgo),
      calculateImpulseControlScore(userId, thirtyDaysAgo),
      calculatePlanningScore(userId, userGoals)
    ]);

    // Calculate overall score (weighted average)
    const weights = {
      budgetAdherence: 0.25,
      savingsRate: 0.25,
      consistency: 0.20,
      impulseControl: 0.15,
      planning: 0.15
    };

    const overallScore = Math.round(
      budgetScore * weights.budgetAdherence +
      savingsScore * weights.savingsRate +
      consistencyScore * weights.consistency +
      impulseScore * weights.impulseControl +
      planningScore * weights.planning
    );

    // Generate insights
    const insights = generateInsights({
      budgetScore,
      savingsScore,
      consistencyScore,
      impulseScore,
     planningScore,
      recentExpenses,
      userGoals,
      user
    });

    // Calculate level and XP
    const currentUserScore = await db.query.userScores.findFirst({
      where: eq(userScores.userId, userId)
    });

    const currentXP = currentUserScore?.experiencePoints || 0;
    const xpGain = calculateXPGain(overallScore, currentUserScore?.overallScore || 0);
    const newXP = currentXP + xpGain;
    const { level, nextLevelThreshold } = calculateLevel(newXP);

    // Calculate streaks
    const { currentStreak, longestStreak } = await calculateStreaks(userId);

    return {
      overallScore,
      budgetAdherenceScore: budgetScore,
      savingsRateScore: savingsScore,
      consistencyScore,
      impulseControlScore: impulseScore,
      planningScore,
      insights,
      strengths: insights.strengths,
      improvements: insights.improvements,
      currentStreak,
      longestStreak,
      level,
      experiencePoints: newXP,
      nextLevelThreshold,
      xpGained: xpGain,
      calculatedAt: new Date()
    };
  } catch (error) {
    console.error('Error calculating financial health score:', error);
    throw error;
  }
}

/**
 * Calculate budget adherence score (0-100)
 */
async function calculateBudgetAdherenceScore(userId, user) {
  try {
    const monthlyBudget = parseFloat(user.monthlyBudget || 0);
    
    if (monthlyBudget === 0) {
      return 50; // Neutral score if no budget set
    }

    // Get current month expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [result] = await db
      .select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startOfMonth),
          eq(expenses.status, 'completed')
        )
      );

    const totalSpent = parseFloat(result?.total || 0);
    const percentageUsed = (totalSpent / monthlyBudget) * 100;

    // Scoring logic
    if (percentageUsed <= 80) return 100; // Excellent - under budget
    if (percentageUsed <= 95) return 90;  // Good - near budget
    if (percentageUsed <= 100) return 75; // Fair - at budget
    if (percentageUsed <= 110) return 50; // Warning - slightly over
    if (percentageUsed <= 125) return 25; // Poor - significantly over
    return 0; // Critical - way over budget

  } catch (error) {
    console.error('Error calculating budget adherence score:', error);
    return 50;
  }
}

/**
 * Calculate savings rate score (0-100)
 */
async function calculateSavingsRateScore(userId, user) {
  try {
    const monthlyIncome = parseFloat(user.monthlyIncome || 0);
    
    if (monthlyIncome === 0) {
      return 50; // Neutral if no income data
    }

    // Get current month expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [result] = await db
      .select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startOfMonth),
          eq(expenses.status, 'completed')
        )
      );

    const totalSpent = parseFloat(result?.total || 0);
    const savingsAmount = monthlyIncome - totalSpent;
    const savingsRate = (savingsAmount / monthlyIncome) * 100;

    // Scoring based on savings rate
    if (savingsRate >= 30) return 100; // Excellent - 30%+ savings
    if (savingsRate >= 20) return 90;  // Great - 20-30% savings
    if (savingsRate >= 10) return 75;  // Good - 10-20% savings
    if (savingsRate >= 5) return 50;   // Fair - 5-10% savings
    if (savingsRate >= 0) return 25;   // Poor - 0-5% savings
    return 0; // Critical - negative savings (overspending)

  } catch (error) {
    console.error('Error calculating savings rate score:', error);
    return 50;
  }
}

/**
 * Calculate consistency score (0-100)
 * Measures regularity of expense tracking and financial review
 */
async function calculateConsistencyScore(userId, startDate) {
  try {
    const now = new Date();
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    
    // Get expenses grouped by day
    const expensesByDay = await db
      .select({
        date: sql`DATE(${expenses.date})`,
        count: sql`COUNT(*)`
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate)
        )
      )
      .groupBy(sql`DATE(${expenses.date})`);

    const daysWithActivity = expensesByDay.length;
    const activityRate = (daysWithActivity / daysSinceStart) * 100;

    // Calculate variance in daily activity
    const counts = expensesByDay.map(d => Number(d.count));
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length || 0;
    const variance = counts.reduce((sum, count) => sum + Math.pow(count - avgCount, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgCount > 0 ? (stdDev / avgCount) : 1;

    // Lower variation = higher consistency
    const variationScore = Math.max(0, 100 - (coefficientOfVariation * 50));
    
    // Combined score
    const consistencyScore = Math.round((activityRate * 0.6) + (variationScore * 0.4));
    
    return Math.min(100, Math.max(0, consistencyScore));

  } catch (error) {
    console.error('Error calculating consistency score:', error);
    return 50;
  }
}

/**
 * Calculate impulse control score (0-100)
 * Detects patterns of impulse buying (weekend spending, late-night purchases, etc.)
 */
async function calculateImpulseControlScore(userId, startDate) {
  try {
    const allExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate),
          eq(expenses.status, 'completed')
        )
      );

    if (allExpenses.length === 0) return 75; // Default for new users

    let impulseCount = 0;
    const totalExpenses = allExpenses.length;

    allExpenses.forEach(expense => {
      const expenseDate = new Date(expense.date);
      const hour = expenseDate.getHours();
      const dayOfWeek = expenseDate.getDay();
      const amount = parseFloat(expense.amount);

      // Impulse indicators
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isLateNight = hour >= 22 || hour <= 4;
      const isHighAmount = amount > 100; // Arbitrary threshold
      const hasImpulseKeywords = /urgent|sale|deal|offer|limited/i.test(expense.description || '');

      // Count as impulse if multiple flags
      const impulseFlags = [isWeekend && isHighAmount, isLateNight, hasImpulseKeywords].filter(Boolean).length;
      
      if (impulseFlags >= 2) {
        impulseCount++;
      }
    });

    const impulseRate = (impulseCount / totalExpenses) * 100;
    
    // Lower impulse rate = higher score
    const impulseScore = Math.round(Math.max(0, 100 - (impulseRate * 5)));
    
    return Math.min(100, impulseScore);

  } catch (error) {
    console.error('Error calculating impulse control score:', error);
    return 50;
  }
}

/**
 * Calculate planning score (0-100)
 * Based on goal-setting and progress tracking
 */
async function calculatePlanningScore(userId, userGoals) {
  try {
    if (userGoals.length === 0) {
      return 30; // Low score for no goals
    }

    let totalProgress = 0;
    let activeGoals = 0;

    userGoals.forEach(goal => {
      if (goal.status === 'in_progress') {
        activeGoals++;
        const currentAmount = parseFloat(goal.currentAmount || 0);
        const targetAmount = parseFloat(goal.targetAmount);
        const progress = (currentAmount / targetAmount) * 100;
        totalProgress += Math.min(progress, 100);
      }
    });

    if (activeGoals === 0) {
      return 50; // Has goals but none active
    }

    const avgProgress = totalProgress / activeGoals;
    
    // Bonus for having multiple goals
    const goalCountBonus = Math.min(20, userGoals.length * 5);
    
    const planningScore = Math.round(Math.min(100, (avgProgress * 0.7) + goalCountBonus));
    
    return planningScore;

  } catch (error) {
    console.error('Error calculating planning score:', error);
    return 50;
  }
}

/**
 * Generate behavioral insights based on scores
 */
function generateInsights(data) {
  const { budgetScore, savingsScore, consistencyScore, impulseScore, planningScore, recentExpenses, userGoals, user } = data;
  
  const strengths = [];
  const improvements = [];
  const analysis = {
    budgetHealth: '',
    savingsPattern: '',
    spendingBehavior: '',
    goalProgress: ''
  };

  // Budget adherence analysis
  if (budgetScore >= 75) {
    strengths.push('Excellent budget adherence');
    analysis.budgetHealth = 'You consistently stay within your monthly budget.';
  } else if (budgetScore >= 50) {
    improvements.push('Improve budget adherence');
    analysis.budgetHealth = 'You occasionally exceed your budget. Consider reviewing spending categories.';
  } else {
    improvements.push('Urgent: Address budget overspending');
    analysis.budgetHealth = 'You frequently exceed your budget. Time to implement stricter controls.';
  }

  // Savings rate analysis
  if (savingsScore >= 75) {
    strengths.push('Strong savings rate');
    analysis.savingsPattern = 'Your savings rate is healthy. Keep it up!';
  } else if (savingsScore >= 50) {
    improvements.push('Increase savings rate');
    analysis.savingsPattern = 'Try to save at least 10-20% of your income monthly.';
  } else {
    improvements.push('Critical: Build emergency savings');
    analysis.savingsPattern = 'Your savings rate is concerning. Start small - even 5% helps.';
  }

  // Consistency analysis
  if (consistencyScore >= 70) {
    strengths.push('Consistent expense tracking');
    analysis.spendingBehavior = 'You regularly track your expenses.';
  } else {
    improvements.push('Track expenses more consistently');
    analysis.spendingBehavior = 'Regular tracking leads to better financial awareness.';
  }

  // Impulse control analysis
  if (impulseScore >= 70) {
    strengths.push('Good impulse control');
  } else if (impulseScore >= 50) {
    improvements.push('Reduce impulse purchases');
    analysis.spendingBehavior += ' Watch out for weekend and late-night spending.';
  } else {
    improvements.push('Major issue: Impulse buying detected');
    analysis.spendingBehavior += ' High frequency of impulse purchases detected.';
  }

  // Planning analysis
  if (planningScore >= 70) {
    strengths.push('Active goal planning');
    analysis.goalProgress = `You have ${userGoals.length} financial goals and are making progress.`;
  } else if (planningScore >= 40) {
    improvements.push('Set more financial goals');
    analysis.goalProgress = 'Consider setting specific savings or investment goals.';
  } else {
    improvements.push('Start financial planning');
    analysis.goalProgress = 'Begin by setting one clear financial goal.';
  }

  return {
    strengths,
    improvements,
    analysis,
    overallAssessment: getOverallAssessment(
      (budgetScore + savingsScore + consistencyScore + impulseScore + planningScore) / 5
    )
  };
}

function getOverallAssessment(score) {
  if (score >= 80) return 'Excellent - You have strong financial habits!';
  if (score >= 60) return 'Good - You\'re on the right track with room to improve.';
  if (score >= 40) return 'Fair - Some areas need attention.';
  return 'Needs Work - Focus on building better financial habits.';
}

/**
 * Calculate XP gain based on score improvement
 */
function calculateXPGain(newScore, oldScore) {
  const improvement = newScore - oldScore;
  let baseXP = newScore; // Base XP equals current score
  
  // Bonus XP for improvements
  if (improvement > 0) {
    baseXP += improvement * 5; // 5 XP per point improvement
  }
  
  // Bonus for high scores
  if (newScore >= 90) baseXP += 50;
  else if (newScore >= 75) baseXP += 25;
  else if (newScore >= 60) baseXP += 10;
  
  return baseXP;
}

/**
 * Calculate level from XP
 */
function calculateLevel(xp) {
  // Level formula: Level = floor(sqrt(XP/100)) + 1
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const nextLevelThreshold = Math.pow(level, 2) * 100;
  
  return {
    level: Math.min(level, 100), // Cap at level 100
    nextLevelThreshold
  };
}

/**
 * Calculate current and longest positive behavior streak
 */
async function calculateStreaks(userId) {
  try {
    // Get habit logs ordered by date
    const logs = await db.query.habitLogs.findMany({
      where: eq(habitLogs.userId, userId),
      orderBy: [desc(habitLogs.loggedAt)],
      limit: 365 // Last year
    });

    if (logs.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;

    // Group by day and calculate net impact
    const dayImpacts = new Map();
    
    logs.forEach(log => {
      const date = new Date(log.loggedAt).toDateString();
      const currentImpact = dayImpacts.get(date) || 0;
      dayImpacts.set(date, currentImpact + log.impactScore);
    });

    // Convert to sorted array
    const sortedDays = Array.from(dayImpacts.entries())
      .sort((a, b) => new Date(b[0]) - new Date(a[0]));

    // Calculate streaks
    sortedDays.forEach(([date, impact], index) => {
      if (impact > 0) { // Positive day
        tempStreak++;
        
        if (index === 0) { // Most recent day
          currentStreak = tempStreak;
        }
        
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    });

    return { currentStreak, longestStreak };

  } catch (error) {
    console.error('Error calculating streaks:', error);
    return { currentStreak: 0, longestStreak: 0 };
  }
}

/**
 * Save or update user score in database
 */
export async function saveUserScore(userId, scoreData) {
  try {
    const existingScore = await db.query.userScores.findFirst({
      where: eq(userScores.userId, userId)
    });

    // Add to score history
    const scoreHistory = existingScore?.scoreHistory || [];
    scoreHistory.push({
      date: new Date().toISOString(),
      overallScore: scoreData.overallScore,
      breakdown: {
        budgetAdherence: scoreData.budgetAdherenceScore,
        savingsRate: scoreData.savingsRateScore,
        consistency: scoreData.consistencyScore,
        impulseControl: scoreData.impulseControlScore,
        planning: scoreData.planningScore
      }
    });

    // Keep only last 90 days of history
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const filteredHistory = scoreHistory.filter(entry => new Date(entry.date) >= ninetyDaysAgo);

    if (existingScore) {
      // Update existing score
      const [updated] = await db
        .update(userScores)
        .set({
          overallScore: scoreData.overallScore,
          budgetAdherenceScore: scoreData.budgetAdherenceScore,
          savingsRateScore: scoreData.savingsRateScore,
          consistencyScore: scoreData.consistencyScore,
          impulseControlScore: scoreData.impulseControlScore,
          planningScore: scoreData.planningScore,
          scoreHistory: filteredHistory,
          insights: scoreData.insights,
          strengths: scoreData.strengths,
          improvements: scoreData.improvements,
          currentStreak: scoreData.currentStreak,
          longestStreak: scoreData.longestStreak,
          level: scoreData.level,
          experiencePoints: scoreData.experiencePoints,
          nextLevelThreshold: scoreData.nextLevelThreshold,
          lastCalculatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(userScores.userId, userId))
        .returning();

      return updated;
    } else {
      // Create new score
      const [created] = await db
        .insert(userScores)
        .values({
          userId,
          overallScore: scoreData.overallScore,
          budgetAdherenceScore: scoreData.budgetAdherenceScore,
          savingsRateScore: scoreData.savingsRateScore,
          consistencyScore: scoreData.consistencyScore,
          impulseControlScore: scoreData.impulseControlScore,
          planningScore: scoreData.planningScore,
          scoreHistory: filteredHistory,
          insights: scoreData.insights,
          strengths: scoreData.strengths,
          improvements: scoreData.improvements,
          currentStreak: scoreData.currentStreak,
          longestStreak: scoreData.longestStreak,
          level: scoreData.level,
          experiencePoints: scoreData.experiencePoints,
          nextLevelThreshold: scoreData.nextLevelThreshold,
          lastCalculatedAt: new Date()
        })
        .returning();

      return created;
    }
  } catch (error) {
    console.error('Error saving user score:', error);
    throw error;
  }
}

/**
 * Get user's current financial health score
 */
export async function getUserScore(userId) {
  try {
    const score = await db.query.userScores.findFirst({
      where: eq(userScores.userId, userId)
    });

    return score;
  } catch (error) {
    console.error('Error fetching user score:', error);
    return null;
  }
}

// Helper functions
async function getRecentExpenses(userId, startDate) {
  return await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.date, startDate),
        eq(expenses.status, 'completed')
      )
    );
}

async function getUserGoals(userId) {
  return await db.query.goals.findMany({
    where: eq(goals.userId, userId)
  });
}

export default {
  calculateFinancialHealthScore,
  saveUserScore,
  getUserScore
};
