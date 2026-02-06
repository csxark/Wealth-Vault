import { db } from '../config/db.js';
import { expenses, categories } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

/**
 * Parse and analyze historical expense data
 * @param {string} userId - User ID
 * @param {number} months - Number of months to analyze (default: 12)
 * @returns {Object} Historical data analysis
 */
export async function parseHistoricalData(userId, months = 12) {
  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    // Fetch all expenses in the period
    const historicalExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate)
        )
      )
      .orderBy(desc(expenses.date));

    // Group by month
    const monthlyData = {};
    historicalExpenses.forEach(expense => {
      const monthKey = expense.date.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          totalExpenses: 0,
          totalIncome: 0,
          transactions: 0,
          categoryBreakdown: {}
        };
      }

      const amount = parseFloat(expense.amount);
      if (expense.paymentMethod === 'income' || amount > 0) {
        monthlyData[monthKey].totalIncome += Math.abs(amount);
      } else {
        monthlyData[monthKey].totalExpenses += Math.abs(amount);
      }
      
      monthlyData[monthKey].transactions++;

      // Category breakdown
      const catId = expense.categoryId || 'uncategorized';
      if (!monthlyData[monthKey].categoryBreakdown[catId]) {
        monthlyData[monthKey].categoryBreakdown[catId] = 0;
      }
      monthlyData[monthKey].categoryBreakdown[catId] += Math.abs(amount);
    });

    // Calculate monthly averages
    const months_array = Object.keys(monthlyData);
    const avgMonthlyExpenses = months_array.reduce((sum, m) => sum + monthlyData[m].totalExpenses, 0) / months_array.length || 0;
    const avgMonthlyIncome = months_array.reduce((sum, m) => sum + monthlyData[m].totalIncome, 0) / months_array.length || 0;

    return {
      rawData: historicalExpenses,
      monthlyData,
      summary: {
        totalMonths: months_array.length,
        avgMonthlyExpenses: Math.round(avgMonthlyExpenses * 100) / 100,
        avgMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
        avgMonthlySavings: Math.round((avgMonthlyIncome - avgMonthlyExpenses) * 100) / 100,
        totalTransactions: historicalExpenses.length
      }
    };
  } catch (error) {
    console.error('Error parsing historical data:', error);
    throw error;
  }
}

/**
 * Identify recurring expense patterns
 * @param {string} userId - User ID
 * @returns {Array} List of identified recurring patterns
 */
export async function identifyRecurringPatterns(userId) {
  try {
    const historicalData = await parseHistoricalData(userId, 12);
    const patterns = [];

    // Group expenses by description similarity and amount
    const expenseGroups = {};
    historicalData.rawData.forEach(expense => {
      const key = `${expense.description.toLowerCase().trim()}_${Math.round(parseFloat(expense.amount))}`;
      if (!expenseGroups[key]) {
        expenseGroups[key] = [];
      }
      expenseGroups[key].push(expense);
    });

    // Analyze each group for recurring patterns
    Object.entries(expenseGroups).forEach(([key, group]) => {
      if (group.length >= 3) { // At least 3 occurrences
        // Calculate time intervals between transactions
        const sortedGroup = group.sort((a, b) => new Date(a.date) - new Date(b.date));
        const intervals = [];
        
        for (let i = 1; i < sortedGroup.length; i++) {
          const daysDiff = Math.round((new Date(sortedGroup[i].date) - new Date(sortedGroup[i-1].date)) / (1000 * 60 * 60 * 24));
          intervals.push(daysDiff);
        }

        // Calculate average interval
        const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        const stdDev = Math.sqrt(intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length);

        // Consider it recurring if intervals are consistent (low standard deviation)
        if (stdDev < avgInterval * 0.3) { // 30% tolerance
          let frequency = 'monthly';
          if (avgInterval <= 7) frequency = 'weekly';
          else if (avgInterval <= 31) frequency = 'monthly';
          else if (avgInterval <= 95) frequency = 'quarterly';
          else frequency = 'yearly';

          patterns.push({
            description: sortedGroup[0].description,
            amount: parseFloat(sortedGroup[0].amount),
            frequency,
            avgInterval: Math.round(avgInterval),
            occurrences: group.length,
            confidence: Math.max(0, Math.min(100, 100 - (stdDev / avgInterval * 100))),
            lastOccurrence: sortedGroup[sortedGroup.length - 1].date,
            categoryId: sortedGroup[0].categoryId
          });
        }
      }
    });

    // Sort by confidence
    return patterns.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error('Error identifying recurring patterns:', error);
    throw error;
  }
}

/**
 * Calculate seasonal spending trends
 * @param {string} userId - User ID
 * @returns {Object} Seasonal trends by month
 */
export async function calculateSeasonalTrends(userId) {
  try {
    const historicalData = await parseHistoricalData(userId, 12);
    
    // Group by calendar month (1-12)
    const seasonalData = {};
    Object.entries(historicalData.monthlyData).forEach(([monthKey, data]) => {
      const month = parseInt(monthKey.split('-')[1]); // Extract month number
      if (!seasonalData[month]) {
        seasonalData[month] = {
          totalExpenses: [],
          totalIncome: [],
          transactions: []
        };
      }
      seasonalData[month].totalExpenses.push(data.totalExpenses);
      seasonalData[month].totalIncome.push(data.totalIncome);
      seasonalData[month].transactions.push(data.transactions);
    });

    // Calculate averages for each month
    const trends = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    Object.entries(seasonalData).forEach(([month, data]) => {
      const avgExpenses = data.totalExpenses.reduce((sum, val) => sum + val, 0) / data.totalExpenses.length;
      const avgIncome = data.totalIncome.reduce((sum, val) => sum + val, 0) / data.totalIncome.length;
      
      trends[monthNames[parseInt(month) - 1]] = {
        avgExpenses: Math.round(avgExpenses * 100) / 100,
        avgIncome: Math.round(avgIncome * 100) / 100,
        avgSavings: Math.round((avgIncome - avgExpenses) * 100) / 100,
        dataPoints: data.totalExpenses.length
      };
    });

    // Calculate overall baseline
    const allExpenses = Object.values(seasonalData).flatMap(d => d.totalExpenses);
    const baseline = allExpenses.reduce((sum, val) => sum + val, 0) / allExpenses.length;

    return {
      monthlyTrends: trends,
      baseline: Math.round(baseline * 100) / 100,
      highestSpendingMonth: Object.entries(trends).reduce((max, [month, data]) => 
        data.avgExpenses > (max[1]?.avgExpenses || 0) ? [month, data] : max, ['', { avgExpenses: 0 }]
      )[0],
      lowestSpendingMonth: Object.entries(trends).reduce((min, [month, data]) => 
        data.avgExpenses < (min[1]?.avgExpenses || Infinity) ? [month, data] : min, ['', { avgExpenses: Infinity }]
      )[0]
    };
  } catch (error) {
    console.error('Error calculating seasonal trends:', error);
    throw error;
  }
}

/**
 * Analyze spending velocity (rate of change)
 * @param {string} userId - User ID
 * @returns {Object} Velocity analysis
 */
export async function analyzeSpendingVelocity(userId) {
  try {
    const historicalData = await parseHistoricalData(userId, 6);
    const months = Object.keys(historicalData.monthlyData).sort();
    
    if (months.length < 2) {
      return { trend: 'insufficient_data', growthRate: 0, analysis: 'Need at least 2 months of data' };
    }

    // Calculate month-over-month growth rates
    const growthRates = [];
    for (let i = 1; i < months.length; i++) {
      const prevExpenses = historicalData.monthlyData[months[i-1]].totalExpenses;
      const currExpenses = historicalData.monthlyData[months[i]].totalExpenses;
      
      if (prevExpenses > 0) {
        const growthRate = ((currExpenses - prevExpenses) / prevExpenses) * 100;
        growthRates.push(growthRate);
      }
    }

    const avgGrowthRate = growthRates.reduce((sum, val) => sum + val, 0) / growthRates.length;
    
    let trend = 'stable';
    let analysis = 'Spending is relatively stable';
    
    if (avgGrowthRate > 5) {
      trend = 'increasing';
      analysis = `Spending is increasing by ${avgGrowthRate.toFixed(1)}% per month on average`;
    } else if (avgGrowthRate < -5) {
      trend = 'decreasing';
      analysis = `Spending is decreasing by ${Math.abs(avgGrowthRate).toFixed(1)}% per month on average`;
    }

    return {
      trend,
      growthRate: Math.round(avgGrowthRate * 100) / 100,
      analysis,
      monthlyRates: growthRates.map((rate, idx) => ({
        month: months[idx + 1],
        rate: Math.round(rate * 100) / 100
      }))
    };
  } catch (error) {
    console.error('Error analyzing spending velocity:', error);
    throw error;
  }
}

export default {
  parseHistoricalData,
  identifyRecurringPatterns,
  calculateSeasonalTrends,
  analyzeSpendingVelocity
};
