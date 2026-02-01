/**
 * Habit AI Service
 * Uses Gemini AI to analyze spending psychology and generate behavioral insights
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../config/db.js';
import { habitLogs, expenses, categories, users, userScores } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyze spending psychology using AI
 * @param {string} userId - User ID
 * @param {Date} startDate - Analysis period start
 * @returns {Promise<Object>} Psychological analysis and recommendations
 */
export async function analyzeSpendingPsychology(userId, startDate = null) {
  try {
    if (!startDate) {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    }

    // Fetch user data
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    // Fetch expenses with categories
    const userExpenses = await db
      .select({
        expense: expenses,
        category: categories
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate)
        )
      )
      .orderBy(desc(expenses.date));

    if (userExpenses.length === 0) {
      return {
        analysis: 'Not enough data for psychological analysis. Start tracking expenses to get insights.',
        patterns: [],
        triggers: [],
        recommendations: ['Begin tracking your expenses regularly']
      };
    }

    // Get existing habit logs
    const existingHabits = await db.query.habitLogs.findMany({
      where: and(
        eq(habitLogs.userId, userId),
        gte(habitLogs.loggedAt, startDate)
      )
    });

    // Prepare data for AI
    const expenseData = prepareExpenseDataForAI(userExpenses, user);

    // Use AI if available
    if (process.env.GEMINI_API_KEY) {
      return await performAIAnalysis(userId, expenseData, existingHabits);
    } else {
      return performRuleBasedAnalysis(userId, expenseData);
    }
  } catch (error) {
    console.error('Error analyzing spending psychology:', error);
    throw error;
  }
}

/**
 * Perform AI-powered psychological analysis
 */
async function performAIAnalysis(userId, expenseData, existingHabits) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `You are a behavioral finance expert analyzing spending patterns. Review the following expense data and provide psychological insights.

**User Profile:**
- Monthly Income: $${expenseData.monthlyIncome}
- Monthly Budget: $${expenseData.monthlyBudget}
- Analysis Period: ${expenseData.period}

**Expense Summary:**
- Total Expenses: $${expenseData.totalSpent}
- Transaction Count: ${expenseData.transactionCount}
- Average Transaction: $${expenseData.avgTransaction}

**Spending by Category:**
${expenseData.categoryBreakdown.map(cat => `- ${cat.name}: $${cat.amount} (${cat.percentage}%)`).join('\n')}

**Temporal Patterns:**
- Weekend Spending: $${expenseData.weekendSpending} (${expenseData.weekendPercentage}%)
- Weekday Spending: $${expenseData.weekdaySpending} (${expenseData.weekdayPercentage}%)
- Late Night Transactions (10pm-4am): ${expenseData.lateNightCount}

**Recent Transactions (Sample):**
${expenseData.recentTransactions.map(t => `- ${t.date}: $${t.amount} - ${t.description} [${t.category}]`).join('\n')}

Provide a JSON response with the following structure:
{
  "psychologicalAnalysis": "2-3 sentence analysis of spending psychology and emotional patterns",
  "detectedPatterns": [
    {
      "patternType": "weekend_splurging|late_night_shopping|emotional_spending|category_obsession|budget_anxiety",
      "description": "Brief description of the pattern",
      "frequency": "high|medium|low",
      "impactScore": -100 to 100 (negative = harmful, positive = beneficial)
    }
  ],
  "emotionalTriggers": [
    {
      "trigger": "stress|boredom|social_pressure|reward_seeking|habit",
      "indicators": "What suggests this trigger",
      "affectedCategories": ["category names"]
    }
  ],
  "cognitiveB biases": [
    {
      "biasType": "present_bias|anchoring|mental_accounting|loss_aversion|sunk_cost_fallacy",
      "manifestation": "How this bias appears in spending"
    }
  ],
  "recommendations": [
    {
      "recommendation": "Specific actionable advice",
      "rationale": "Why this helps",
      "priority": "high|medium|low"
    }
  ],
  "positiveBehaviors": ["List any good financial habits observed"],
  "concerningBehaviors": ["List behaviors that need attention"],
  "coachingTip": "One specific, encouraging tip for this week"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Log detected habits
    await logDetectedHabits(userId, analysis.detectedPatterns, 'ai');

    return {
      psychologicalAnalysis: analysis.psychologicalAnalysis,
      patterns: analysis.detectedPatterns || [],
      triggers: analysis.emotionalTriggers || [],
      biases: analysis.cognitiveBiases || [],
      recommendations: analysis.recommendations || [],
      positiveBehaviors: analysis.positiveBehaviors || [],
      concerningBehaviors: analysis.concerningBehaviors || [],
      coachingTip: analysis.coachingTip,
      generatedAt: new Date(),
      source: 'gemini-ai'
    };
  } catch (error) {
    console.error('AI analysis failed, falling back to rule-based:', error);
    return performRuleBasedAnalysis(userId, expenseData);
  }
}

/**
 * Fallback rule-based analysis
 */
function performRuleBasedAnalysis(userId, expenseData) {
  const patterns = [];
  const triggers = [];
  const recommendations = [];

  // Detect weekend splurging
  if (expenseData.weekendPercentage > 40) {
    patterns.push({
      patternType: 'weekend_splurging',
      description: 'Higher spending on weekends compared to weekdays',
      frequency: 'high',
      impactScore: -30
    });
    recommendations.push({
      recommendation: 'Plan weekend activities with a set budget',
      rationale: 'Prevents impulse spending during leisure time',
      priority: 'medium'
    });
  }

  // Detect late-night shopping
  if (expenseData.lateNightCount > 5) {
    patterns.push({
      patternType: 'late_night_shopping',
      description: 'Frequent transactions during late night hours',
      frequency: 'medium',
      impactScore: -40
    });
    triggers.push({
      trigger: 'boredom',
      indicators: 'Late-night transactions suggest impulsive behavior',
      affectedCategories: ['shopping', 'entertainment']
    });
  }

  // Check budget adherence
  const budgetUsage = (expenseData.totalSpent / expenseData.monthlyBudget) * 100;
  if (budgetUsage > 100) {
    recommendations.push({
      recommendation: 'Review and adjust your budget categories',
      rationale: `You've exceeded your budget by ${(budgetUsage - 100).toFixed(1)}%`,
      priority: 'high'
    });
  }

  // Check savings rate
  const savingsRate = ((expenseData.monthlyIncome - expenseData.totalSpent) / expenseData.monthlyIncome) * 100;
  if (savingsRate < 10) {
    recommendations.push({
      recommendation: 'Aim to save at least 10% of your income',
      rationale: 'Building emergency fund is crucial for financial security',
      priority: 'high'
    });
  }

  // Detect category obsession
  const dominantCategory = expenseData.categoryBreakdown[0];
  if (dominantCategory && dominantCategory.percentage > 50) {
    patterns.push({
      patternType: 'category_obsession',
      description: `Over 50% of spending in ${dominantCategory.name}`,
      frequency: 'high',
      impactScore: -25
    });
  }

  return {
    psychologicalAnalysis: 'Rule-based analysis shows spending patterns that may benefit from more structured budgeting.',
    patterns,
    triggers,
    biases: [],
    recommendations,
    positiveBehaviors: savingsRate > 20 ? ['Maintaining healthy savings rate'] : [],
    concerningBehaviors: budgetUsage > 100 ? ['Regular budget overruns'] : [],
    coachingTip: 'Track every expense this week to build awareness of your spending habits.',
    generatedAt: new Date(),
    source: 'rule-based'
  };
}

/**
 * Detect specific spending habits from expense patterns
 */
export async function detectSpendingHabits(userId, expenses) {
  try {
    const detectedHabits = [];

    // Group expenses by day of week
    const byDayOfWeek = {};
    expenses.forEach(exp => {
      const day = new Date(exp.expense.date).getDay();
      byDayOfWeek[day] = (byDayOfWeek[day] || 0) + parseFloat(exp.expense.amount);
    });

    // Weekend vs weekday analysis
    const weekendTotal = (byDayOfWeek[0] || 0) + (byDayOfWeek[6] || 0);
    const weekdayTotal = Object.keys(byDayOfWeek)
      .filter(d => d != 0 && d != 6)
      .reduce((sum, d) => sum + byDayOfWeek[d], 0);

    if (weekendTotal > weekdayTotal * 1.5) {
      detectedHabits.push({
        habitType: 'weekend_overspending',
        habitCategory: 'negative',
        impactScore: -35,
        contextData: {
          weekendSpending: weekendTotal,
          weekdaySpending: weekdayTotal,
          ratio: (weekendTotal / weekdayTotal).toFixed(2)
        },
        confidence: 0.85
      });
    }

    // Detect payday spending spikes
    const expensesByDate = {};
    expenses.forEach(exp => {
      const date = new Date(exp.expense.date).getDate();
      expensesByDate[date] = (expensesByDate[date] || 0) + parseFloat(exp.expense.amount);
    });

    const firstWeekSpending = Object.keys(expensesByDate)
      .filter(d => d <= 7)
      .reduce((sum, d) => sum + expensesByDate[d], 0);
    
    const totalSpending = Object.values(expensesByDate).reduce((a, b) => a + b, 0);
    
    if (firstWeekSpending > totalSpending * 0.5) {
      detectedHabits.push({
        habitType: 'payday_splurge',
        habitCategory: 'negative',
        impactScore: -30,
        contextData: {
          firstWeekSpending,
          totalSpending,
          percentage: ((firstWeekSpending / totalSpending) * 100).toFixed(1)
        },
        confidence: 0.80
      });
    }

    // Detect consistent small purchases (positive habit)
    const smallTransactions = expenses.filter(exp => parseFloat(exp.expense.amount) < 20);
    if (smallTransactions.length > expenses.length * 0.7) {
      detectedHabits.push({
        habitType: 'mindful_small_purchases',
        habitCategory: 'positive',
        impactScore: 25,
        contextData: {
          smallTransactionCount: smallTransactions.length,
          totalTransactions: expenses.length
        },
        confidence: 0.75
      });
    }

    // Detect subscription management (positive)
    const recurringExpenses = expenses.filter(exp => 
      /subscription|monthly|netflix|spotify|gym/i.test(exp.expense.description || '')
    );
    if (recurringExpenses.length > 0 && recurringExpenses.length < 8) {
      detectedHabits.push({
        habitType: 'controlled_subscriptions',
        habitCategory: 'positive',
        impactScore: 20,
        contextData: {
          subscriptionCount: recurringExpenses.length,
          totalCost: recurringExpenses.reduce((sum, exp) => sum + parseFloat(exp.expense.amount), 0)
        },
        confidence: 0.70
      });
    }

    return detectedHabits;
  } catch (error) {
    console.error('Error detecting spending habits:', error);
    return [];
  }
}

/**
 * Generate weekly coaching tips based on scores
 */
export async function generateWeeklyCoachingTips(userId, scores) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return generateFallbackCoachingTips(scores);
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `You are a supportive financial coach. Based on the following financial health scores, provide encouraging and actionable weekly coaching tips.

**Financial Health Scores:**
- Overall Score: ${scores.overallScore}/100
- Budget Adherence: ${scores.budgetAdherenceScore}/100
- Savings Rate: ${scores.savingsRateScore}/100
- Consistency: ${scores.consistencyScore}/100
- Impulse Control: ${scores.impulseControlScore}/100
- Planning: ${scores.planningScore}/100

**Current Status:**
- Level: ${scores.level}
- Current Streak: ${scores.currentStreak} days
- Strengths: ${scores.strengths.join(', ')}
- Areas for Improvement: ${scores.improvements.join(', ')}

Provide a JSON response with 3 specific coaching tips:
{
  "weeklyTips": [
    {
      "title": "Short, catchy title (max 6 words)",
      "message": "Encouraging 2-3 sentence tip",
      "actionableStep": "One specific action to take this week",
      "category": "budget|savings|impulse|planning|general",
      "motivationLevel": "encourage|celebrate|gentle_nudge"
    }
  ],
  "weeklyChallenge": {
    "title": "Challenge title",
    "description": "What to do this week",
    "reward": "XP points or badge to earn",
    "difficulty": "easy|medium|hard"
  },
  "encouragement": "One sentence of positive reinforcement"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response invalid');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error generating coaching tips:', error);
    return generateFallbackCoachingTips(scores);
  }
}

/**
 * Fallback coaching tips when AI unavailable
 */
function generateFallbackCoachingTips(scores) {
  const tips = [];

  if (scores.budgetAdherenceScore < 70) {
    tips.push({
      title: 'Budget Mastery',
      message: 'You\'re close to your budget goals! Small adjustments make big differences.',
      actionableStep: 'Review your top 3 spending categories this week',
      category: 'budget',
      motivationLevel: 'gentle_nudge'
    });
  }

  if (scores.savingsRateScore < 70) {
    tips.push({
      title: 'Save More, Stress Less',
      message: 'Every dollar saved is a step toward financial freedom.',
      actionableStep: 'Set up automatic transfer of $50 to savings this week',
      category: 'savings',
      motivationLevel: 'encourage'
    });
  }

  if (scores.impulseControlScore < 70) {
    tips.push({
      title: 'Think Before You Buy',
      message: 'Impulse purchases add up quickly. Pause before spending.',
      actionableStep: 'Wait 24 hours before any purchase over $50',
      category: 'impulse',
      motivationLevel: 'gentle_nudge'
    });
  }

  // Ensure at least 3 tips
  while (tips.length < 3) {
    tips.push({
      title: 'Keep Going!',
      message: 'You\'re building strong financial habits.',
      actionableStep: 'Track all expenses this week',
      category: 'general',
      motivationLevel: 'encourage'
    });
  }

  return {
    weeklyTips: tips.slice(0, 3),
    weeklyChallenge: {
      title: 'Perfect Week Challenge',
      description: 'Stay under budget in all categories for 7 days',
      reward: '100 XP + Budget Master badge',
      difficulty: 'medium'
    },
    encouragement: scores.overallScore >= 70 
      ? 'You\'re doing great! Keep up the momentum.' 
      : 'Small steps lead to big changes. You\'ve got this!'
  };
}

/**
 * Log detected habits to database
 */
async function logDetectedHabits(userId, patterns, detectedBy = 'system') {
  try {
    const habitLogsToInsert = patterns.map(pattern => ({
      userId,
      habitType: pattern.patternType,
      habitCategory: pattern.impactScore >= 0 ? 'positive' : 'negative',
      impactScore: pattern.impactScore,
      detectedBy,
      confidence: pattern.frequency === 'high' ? 0.9 : pattern.frequency === 'medium' ? 0.7 : 0.5,
      aiAnalysis: {
        description: pattern.description,
        frequency: pattern.frequency
      },
      contextData: {},
      loggedAt: new Date()
    }));

    if (habitLogsToInsert.length > 0) {
      await db.insert(habitLogs).values(habitLogsToInsert);
    }

    return habitLogsToInsert.length;
  } catch (error) {
    console.error('Error logging habits:', error);
    return 0;
  }
}

/**
 * Prepare expense data for AI analysis
 */
function prepareExpenseDataForAI(userExpenses, user) {
  const totalSpent = userExpenses.reduce((sum, exp) => sum + parseFloat(exp.expense.amount), 0);
  const transactionCount = userExpenses.length;
  const avgTransaction = transactionCount > 0 ? totalSpent / transactionCount : 0;

  // Category breakdown
  const categoryTotals = {};
  userExpenses.forEach(exp => {
    const categoryName = exp.category?.name || 'Uncategorized';
    categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + parseFloat(exp.expense.amount);
  });

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([name, amount]) => ({
      name,
      amount: amount.toFixed(2),
      percentage: ((amount / totalSpent) * 100).toFixed(1)
    }))
    .sort((a, b) => b.amount - a.amount);

  // Weekend vs weekday
  let weekendSpending = 0;
  let weekdaySpending = 0;
  let lateNightCount = 0;

  userExpenses.forEach(exp => {
    const date = new Date(exp.expense.date);
    const day = date.getDay();
    const hour = date.getHours();
    const amount = parseFloat(exp.expense.amount);

    if (day === 0 || day === 6) {
      weekendSpending += amount;
    } else {
      weekdaySpending += amount;
    }

    if (hour >= 22 || hour <= 4) {
      lateNightCount++;
    }
  });

  // Recent transactions sample
  const recentTransactions = userExpenses.slice(0, 10).map(exp => ({
    date: new Date(exp.expense.date).toLocaleDateString(),
    amount: parseFloat(exp.expense.amount).toFixed(2),
    description: exp.expense.description || 'No description',
    category: exp.category?.name || 'Uncategorized'
  }));

  return {
    monthlyIncome: parseFloat(user.monthlyIncome || 0).toFixed(2),
    monthlyBudget: parseFloat(user.monthlyBudget || 0).toFixed(2),
    period: '30 days',
    totalSpent: totalSpent.toFixed(2),
    transactionCount,
    avgTransaction: avgTransaction.toFixed(2),
    categoryBreakdown,
    weekendSpending: weekendSpending.toFixed(2),
    weekdaySpending: weekdaySpending.toFixed(2),
    weekendPercentage: ((weekendSpending / totalSpent) * 100).toFixed(1),
    weekdayPercentage: ((weekdaySpending / totalSpent) * 100).toFixed(1),
    lateNightCount,
    recentTransactions
  };
}

export default {
  analyzeSpendingPsychology,
  detectSpendingHabits,
  generateWeeklyCoachingTips
};
