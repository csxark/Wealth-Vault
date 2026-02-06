import { db } from '../config/db.js';
import { expenses, forecastSnapshots } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * Compare actual spending vs predicted spending
 * @param {string} userId - User ID
 * @param {string} snapshotId - Forecast snapshot ID to validate
 * @returns {Object} Comparison results
 */
export async function compareActualVsPredicted(userId, snapshotId) {
  try {
    // Get the forecast snapshot
    const [snapshot] = await db
      .select()
      .from(forecastSnapshots)
      .where(
        and(
          eq(forecastSnapshots.id, snapshotId),
          eq(forecastSnapshots.userId, userId)
        )
      );

    if (!snapshot) {
      throw new Error('Forecast snapshot not found');
    }

    const forecastDate = new Date(snapshot.forecastDate);
    const predictions = snapshot.predictions || [];

    // Get actual expenses for the forecast period
    const startDate = forecastDate;
    const endDate = new Date(forecastDate);
    endDate.setDate(endDate.getDate() + predictions.length);

    const actualExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        )
      )
      .orderBy(expenses.date);

    // Group actual expenses by date
    const actualByDate = {};
    actualExpenses.forEach(expense => {
      const dateKey = expense.date.toISOString().split('T')[0];
      if (!actualByDate[dateKey]) {
        actualByDate[dateKey] = {
          totalExpenses: 0,
          totalIncome: 0,
          count: 0
        };
      }

      const amount = parseFloat(expense.amount);
      if (amount > 0 || expense.paymentMethod === 'income') {
        actualByDate[dateKey].totalIncome += Math.abs(amount);
      } else {
        actualByDate[dateKey].totalExpenses += Math.abs(amount);
      }
      actualByDate[dateKey].count++;
    });

    // Compare each day
    const comparisons = [];
    let totalPredictedExpenses = 0;
    let totalActualExpenses = 0;
    let totalPredictedIncome = 0;
    let totalActualIncome = 0;
    let daysWithData = 0;

    predictions.forEach(prediction => {
      const dateKey = prediction.date;
      const actual = actualByDate[dateKey] || { totalExpenses: 0, totalIncome: 0, count: 0 };

      // Only compare if we have actual data (date has passed)
      const predictionDate = new Date(dateKey);
      if (predictionDate <= new Date()) {
        const expenseError = actual.totalExpenses - prediction.expenses;
        const incomeError = actual.totalIncome - prediction.income;
        
        comparisons.push({
          date: dateKey,
          predicted: {
            expenses: prediction.expenses,
            income: prediction.income,
            balance: prediction.balance
          },
          actual: {
            expenses: actual.totalExpenses,
            income: actual.totalIncome,
            transactions: actual.count
          },
          error: {
            expenses: Math.round(expenseError * 100) / 100,
            income: Math.round(incomeError * 100) / 100,
            expensePercent: prediction.expenses > 0 
              ? Math.round((expenseError / prediction.expenses) * 10000) / 100
              : 0
          }
        });

        totalPredictedExpenses += prediction.expenses;
        totalActualExpenses += actual.totalExpenses;
        totalPredictedIncome += prediction.income;
        totalActualIncome += actual.totalIncome;
        daysWithData++;
      }
    });

    // Calculate overall accuracy
    const accuracy = calculateForecastAccuracy(comparisons);

    return {
      snapshotId,
      forecastDate: snapshot.forecastDate,
      daysAnalyzed: daysWithData,
      totalDays: predictions.length,
      accuracy,
      totals: {
        predicted: {
          expenses: Math.round(totalPredictedExpenses * 100) / 100,
          income: Math.round(totalPredictedIncome * 100) / 100
        },
        actual: {
          expenses: Math.round(totalActualExpenses * 100) / 100,
          income: Math.round(totalActualIncome * 100) / 100
        },
        error: {
          expenses: Math.round((totalActualExpenses - totalPredictedExpenses) * 100) / 100,
          income: Math.round((totalActualIncome - totalPredictedIncome) * 100) / 100
        }
      },
      dailyComparisons: comparisons.slice(0, 30) // Limit to 30 days in response
    };
  } catch (error) {
    console.error('Error comparing actual vs predicted:', error);
    throw error;
  }
}

/**
 * Calculate forecast accuracy metrics
 * @param {Array} comparisons - Daily comparisons
 * @returns {Object} Accuracy metrics
 */
export function calculateForecastAccuracy(comparisons) {
  if (comparisons.length === 0) {
    return {
      overall: 0,
      expenses: 0,
      income: 0,
      rating: 'insufficient_data'
    };
  }

  // Calculate Mean Absolute Percentage Error (MAPE)
  let totalExpenseError = 0;
  let totalIncomeError = 0;
  let validExpenseComparisons = 0;
  let validIncomeComparisons = 0;

  comparisons.forEach(comp => {
    if (comp.predicted.expenses > 0) {
      const mape = Math.abs(comp.error.expenses / comp.predicted.expenses) * 100;
      totalExpenseError += mape;
      validExpenseComparisons++;
    }

    if (comp.predicted.income > 0) {
      const mape = Math.abs(comp.error.income / comp.predicted.income) * 100;
      totalIncomeError += mape;
      validIncomeComparisons++;
    }
  });

  const expenseAccuracy = validExpenseComparisons > 0
    ? 100 - (totalExpenseError / validExpenseComparisons)
    : 0;

  const incomeAccuracy = validIncomeComparisons > 0
    ? 100 - (totalIncomeError / validIncomeComparisons)
    : 0;

  const overallAccuracy = (expenseAccuracy + incomeAccuracy) / 2;

  // Rate accuracy
  let rating = 'poor';
  if (overallAccuracy >= 90) rating = 'excellent';
  else if (overallAccuracy >= 80) rating = 'good';
  else if (overallAccuracy >= 70) rating = 'fair';
  else if (overallAccuracy >= 60) rating = 'moderate';

  return {
    overall: Math.round(overallAccuracy * 100) / 100,
    expenses: Math.round(expenseAccuracy * 100) / 100,
    income: Math.round(incomeAccuracy * 100) / 100,
    rating,
    comparisons: comparisons.length
  };
}

/**
 * Validate forecast quality and suggest improvements
 * @param {string} userId - User ID
 * @param {string} snapshotId - Forecast snapshot ID
 * @returns {Object} Validation results with suggestions
 */
export async function validateForecastQuality(userId, snapshotId) {
  try {
    const comparison = await compareActualVsPredicted(userId, snapshotId);
    const suggestions = [];

    // Analyze expense prediction accuracy
    if (comparison.accuracy.expenses < 70) {
      suggestions.push({
        category: 'expense_prediction',
        severity: 'high',
        message: 'Expense predictions are less accurate than expected',
        recommendation: 'Review spending patterns and ensure all recurring expenses are tracked'
      });
    }

    // Analyze income prediction accuracy
    if (comparison.accuracy.income < 70) {
      suggestions.push({
        category: 'income_prediction',
        severity: 'medium',
        message: 'Income predictions need improvement',
        recommendation: 'Update monthly income settings and track all income sources'
      });
    }

    // Check if forecast is outdated
    const [snapshot] = await db
      .select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.id, snapshotId));

    const forecastAge = (Date.now() - new Date(snapshot.forecastDate).getTime()) / (1000 * 60 * 60 * 24);
    
    if (forecastAge > 30) {
      suggestions.push({
        category: 'forecast_age',
        severity: 'low',
        message: 'Forecast is over 30 days old',
        recommendation: 'Generate a new forecast for more accurate predictions'
      });
    }

    // Check data quality
    if (comparison.daysAnalyzed < 7) {
      suggestions.push({
        category: 'data_quality',
        severity: 'high',
        message: 'Insufficient data for validation',
        recommendation: 'Wait for more days to pass or track expenses daily'
      });
    }

    return {
      isValid: comparison.accuracy.overall >= 60,
      accuracy: comparison.accuracy,
      dataQuality: {
        daysAnalyzed: comparison.daysAnalyzed,
        totalDays: comparison.totalDays,
        completeness: Math.round((comparison.daysAnalyzed / comparison.totalDays) * 100)
      },
      suggestions,
      validatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error validating forecast quality:', error);
    throw error;
  }
}

/**
 * Get validation summary for recent forecasts
 * @param {string} userId - User ID
 * @param {number} limit - Number of recent forecasts to validate
 * @returns {Object} Validation summary
 */
export async function getValidationSummary(userId, limit = 5) {
  try {
    const recentForecasts = await db
      .select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.userId, userId))
      .orderBy(desc(forecastSnapshots.createdAt))
      .limit(limit);

    const validations = [];
    let totalAccuracy = 0;
    let validCount = 0;

    for (const forecast of recentForecasts) {
      try {
        const validation = await validateForecastQuality(userId, forecast.id);
        validations.push({
          snapshotId: forecast.id,
          forecastDate: forecast.createdAt,
          ...validation
        });

        if (validation.accuracy.overall > 0) {
          totalAccuracy += validation.accuracy.overall;
          validCount++;
        }
      } catch (err) {
        console.warn(`Could not validate forecast ${forecast.id}:`, err.message);
      }
    }

    const avgAccuracy = validCount > 0 ? totalAccuracy / validCount : 0;

    return {
      forecastCount: recentForecasts.length,
      validations,
      summary: {
        averageAccuracy: Math.round(avgAccuracy * 100) / 100,
        improvementTrend: calculateImprovementTrend(validations),
        modelConfidence: avgAccuracy >= 80 ? 'high' : avgAccuracy >= 60 ? 'medium' : 'low'
      },
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting validation summary:', error);
    throw error;
  }
}

/**
 * Calculate improvement trend across forecasts
 * @param {Array} validations - List of validations
 * @returns {string} Trend direction
 */
function calculateImprovementTrend(validations) {
  if (validations.length < 2) return 'insufficient_data';

  const accuracies = validations
    .filter(v => v.accuracy?.overall > 0)
    .map(v => v.accuracy.overall);

  if (accuracies.length < 2) return 'insufficient_data';

  // Compare first half vs second half
  const midpoint = Math.floor(accuracies.length / 2);
  const firstHalf = accuracies.slice(0, midpoint);
  const secondHalf = accuracies.slice(midpoint);

  const avgFirst = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

export default {
  compareActualVsPredicted,
  calculateForecastAccuracy,
  validateForecastQuality,
  getValidationSummary
};
