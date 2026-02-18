import expenseService from './expenseService.js';
import investmentService from './investmentService.js';
import savingsService from './savingsService.js';
import { getAIProvider } from './aiProvider.js';

/**
 * AI Insights Service
 * Aggregates user financial data and generates AI-powered insights using the universal AI Provider
 */

/**
 * Anonymize user data for privacy
 * @param {Object} data - Raw user data
 * @returns {Object} - Anonymized data
 */
const anonymizeData = (data) => {
  // Remove or generalize personal identifiers
  // For expenses: keep categories, amounts, dates (but not specific descriptions)
  // For investments: keep types, performance metrics, not specific symbols
  // For savings: keep goal types, progress percentages

  const anonymized = { ...data };

  if (anonymized.expenses) {
    anonymized.expenses = anonymized.expenses.map(expense => ({
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      currency: expense.currency,
      // Remove description, location, etc.
    }));
  }

  if (anonymized.investments) {
    anonymized.investments = anonymized.investments.map(investment => ({
      type: investment.type,
      quantity: investment.quantity,
      averageCost: investment.averageCost,
      currentPrice: investment.currentPrice,
      marketValue: investment.marketValue,
      unrealizedGainLoss: investment.unrealizedGainLoss,
      // Remove symbol, name
    }));
  }

  if (anonymized.savings) {
    anonymized.savings = anonymized.savings.map(goal => ({
      type: goal.type,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      progressPercent: (goal.currentAmount / goal.targetAmount) * 100,
      // Remove specific names
    }));
  }

  return anonymized;
};

/**
 * Aggregate user financial data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Aggregated data
 */
const aggregateUserData = async (userId) => {
  try {
    // Get recent expenses (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Note: expenseService doesn't have a direct method for filtering by date, so we'll assume we need to add one or use existing
    // For now, mock or use getExpenses with filters if available
    const expenses = []; // TODO: Implement proper expense fetching

    // Get investments
    const investments = await investmentService.getInvestments(userId);

    // Get savings goals
    const savingsGoals = await savingsService.getUserSavingsGoals(userId);

    return {
      expenses,
      investments,
      savings: savingsGoals,
    };
  } catch (error) {
    console.error('Error aggregating user data:', error);
    throw error;
  }
};

/**
 * Generate AI insights based on user data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - AI-generated insights
 */
export const generateInsights = async (userId) => {
  try {
    // Aggregate data
    const rawData = await aggregateUserData(userId);

    // Anonymize data
    const anonymizedData = anonymizeData(rawData);

    // Prepare prompt for AI
    const prompt = `
Analyze the following anonymized financial data and provide personalized insights and recommendations:

Expenses (last 3 months):
${JSON.stringify(anonymizedData.expenses, null, 2)}

Investments:
${JSON.stringify(anonymizedData.investments, null, 2)}

Savings Goals:
${JSON.stringify(anonymizedData.savings, null, 2)}

Please provide:
1. Spending pattern analysis
2. Investment performance insights
3. Savings progress evaluation
4. Specific recommendations (e.g., "You could save $X by reducing Y", "Consider reallocating Z% to bonds")
5. Risk assessment

Keep recommendations actionable and specific.
`;

    // Get AI response using provider abstraction
    const provider = getAIProvider();
    const insightsText = await provider.generateText(prompt, {
      temperature: 0.7,
      model: 'pro' // Use a capable model for complex analysis
    });

    return {
      insights: insightsText,
      generatedAt: new Date().toISOString(),
      dataSummary: {
        expenseCount: anonymizedData.expenses?.length || 0,
        investmentCount: anonymizedData.investments?.length || 0,
        savingsGoalCount: anonymizedData.savings?.length || 0,
      },
      provider: provider.constructor.name
    };
  } catch (error) {
    console.error('Error generating insights:', error);
    // Return graceful fallback instead of throwing if AI fails, to keep app resilient
    return {
      insights: "AI insights are currently unavailable. Please check back later.",
      error: true,
      generatedAt: new Date().toISOString()
    };
  }
};

export default {
  generateInsights,
};
