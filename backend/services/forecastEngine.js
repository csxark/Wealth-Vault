import { db } from '../config/db.js';
import { expenses, users, forecastSnapshots } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { parseHistoricalData, identifyRecurringPatterns, calculateSeasonalTrends, analyzeSpendingVelocity } from './trendAnalyzer.js';

/**
 * Project cash flow for the next N days
 * @param {string} userId - User ID
 * @param {number} days - Number of days to forecast (default: 30)
 * @returns {Object} Cash flow forecast
 */
export async function projectCashFlow(userId, days = 30) {
  try {
    // Get user's current balance and income
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error('User not found');

    // Get historical data and patterns
    const historicalData = await parseHistoricalData(userId, 12);
    const recurringPatterns = await identifyRecurringPatterns(userId);
    const seasonalTrends = await calculateSeasonalTrends(userId);
    const velocity = await analyzeSpendingVelocity(userId);

    // Calculate current balance (emergency fund + monthly budget)
    const currentBalance = parseFloat(user.emergencyFund || 0) + parseFloat(user.monthlyBudget || 0);
    const monthlyIncome = parseFloat(user.monthlyIncome || 0);
    const avgDailyExpense = historicalData.summary.avgMonthlyExpenses / 30;

    // Generate daily projections
    const projections = [];
    let runningBalance = currentBalance;
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(today.getDate() + i);

      // Estimate daily income (distributed across month)
      const dailyIncome = monthlyIncome / 30;

      // Estimate daily expenses (with velocity adjustment)
      let dailyExpense = avgDailyExpense * (1 + velocity.growthRate / 100);

      // Apply seasonal adjustment
      const month = forecastDate.toLocaleString('en', { month: 'short' });
      const seasonalFactor = seasonalTrends.monthlyTrends[month]?.avgExpenses / seasonalTrends.baseline || 1;
      dailyExpense *= seasonalFactor;

      // Check for recurring expenses due on this date
      recurringPatterns.forEach(pattern => {
        const lastOccurrence = new Date(pattern.lastOccurrence);
        const daysSince = Math.floor((forecastDate - lastOccurrence) / (1000 * 60 * 60 * 24));

        // If due date approaches, add recurring expense
        if (daysSince > 0 && daysSince % pattern.avgInterval === 0) {
          dailyExpense += Math.abs(parseFloat(pattern.amount));
        }
      });

      runningBalance += dailyIncome - dailyExpense;

      projections.push({
        date: forecastDate.toISOString().split('T')[0],
        income: Math.round(dailyIncome * 100) / 100,
        expenses: Math.round(dailyExpense * 100) / 100,
        balance: Math.round(runningBalance * 100) / 100,
        isWeekend: forecastDate.getDay() === 0 || forecastDate.getDay() === 6
      });
    }

    return {
      projections,
      summary: {
        startBalance: Math.round(currentBalance * 100) / 100,
        endBalance: Math.round(runningBalance * 100) / 100,
        totalProjectedIncome: Math.round(projections.reduce((sum, p) => sum + p.income, 0) * 100) / 100,
        totalProjectedExpenses: Math.round(projections.reduce((sum, p) => sum + p.expenses, 0) * 100) / 100,
        netChange: Math.round((runningBalance - currentBalance) * 100) / 100
      },
      metadata: {
        forecastDays: days,
        confidence: calculateConfidenceScore(historicalData.summary.totalTransactions, velocity),
        appliedFactors: {
          velocityAdjustment: velocity.growthRate,
          seasonalAdjustment: true,
          recurringExpenses: recurringPatterns.length
        }
      }
    };
  } catch (error) {
    console.error('Error projecting cash flow:', error);
    throw error;
  }
}

/**
 * Calculate projected balance on a specific date
 * @param {string} userId - User ID
 * @param {Date} targetDate - Target date
 * @returns {Object} Projected balance details
 */
export async function calculateProjectedBalance(userId, targetDate) {
  try {
    const today = new Date();
    const daysUntil = Math.ceil((new Date(targetDate) - today) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      throw new Error('Target date must be in the future');
    }

    const forecast = await projectCashFlow(userId, daysUntil + 1);
    const targetProjection = forecast.projections[daysUntil];

    return {
      targetDate: targetDate.toISOString().split('T')[0],
      projectedBalance: targetProjection.balance,
      daysUntil,
      confidence: forecast.metadata.confidence,
      breakdown: {
        currentBalance: forecast.summary.startBalance,
        projectedIncome: targetProjection.income * daysUntil,
        projectedExpenses: targetProjection.expenses * daysUntil,
        netChange: targetProjection.balance - forecast.summary.startBalance
      }
    };
  } catch (error) {
    console.error('Error calculating projected balance:', error);
    throw error;
  }
}

/**
 * Identify periods where balance may go negative (danger zones)
 * @param {string} userId - User ID
 * @param {number} days - Days to analyze (default: 60)
 * @returns {Array} List of danger zones
 */
export async function identifyNegativeMonths(userId, days = 60) {
  try {
    const forecast = await projectCashFlow(userId, days);
    const dangerZones = [];
    let currentZone = null;

    forecast.projections.forEach((projection, index) => {
      if (projection.balance < 0) {
        if (!currentZone) {
          // Start new danger zone
          currentZone = {
            startDate: projection.date,
            startBalance: projection.balance,
            lowestBalance: projection.balance,
            duration: 1
          };
        } else {
          // Extend current danger zone
          currentZone.duration++;
          if (projection.balance < currentZone.lowestBalance) {
            currentZone.lowestBalance = projection.balance;
          }
        }
      } else if (currentZone) {
        // End current danger zone
        currentZone.endDate = forecast.projections[index - 1].date;
        currentZone.severity = calculateSeverity(currentZone.lowestBalance, currentZone.duration);
        dangerZones.push(currentZone);
        currentZone = null;
      }
    });

    // If still in danger zone at end of forecast
    if (currentZone) {
      currentZone.endDate = forecast.projections[forecast.projections.length - 1].date;
      currentZone.severity = calculateSeverity(currentZone.lowestBalance, currentZone.duration);
      dangerZones.push(currentZone);
    }

    return {
      hasDangerZones: dangerZones.length > 0,
      totalDangerZones: dangerZones.length,
      dangerZones: dangerZones.map(zone => ({
        ...zone,
        lowestBalance: Math.round(zone.lowestBalance * 100) / 100,
        startBalance: Math.round(zone.startBalance * 100) / 100,
        recommendation: generateRecommendation(zone)
      })),
      overallRisk: calculateOverallRisk(dangerZones)
    };
  } catch (error) {
    console.error('Error identifying negative months:', error);
    throw error;
  }
}

/**
 * Save forecast snapshot to database
 * @param {string} userId - User ID
 * @param {Object} forecastData - Forecast data to save
 * @returns {Object} Saved snapshot
 */
export async function saveForecastSnapshot(userId, forecastData) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const currentBalance = parseFloat(user.emergencyFund || 0) + parseFloat(user.monthlyBudget || 0);

    const snapshot = {
      userId,
      forecastDate: new Date(),
      projectedBalance: forecastData.summary.endBalance,
      confidence: forecastData.metadata.confidence,
      predictions: forecastData.projections,
      anomalies: forecastData.anomalies || [],
      trends: forecastData.trends || {},
      dangerZones: forecastData.dangerZones || [],
      aiInsights: forecastData.aiInsights || {},
      metadata: {
        analysisVersion: '1.0',
        dataPoints: forecastData.projections.length,
        historicalMonths: 12,
        forecastDays: forecastData.projections.length
      }
    };

    const [saved] = await db.insert(forecastSnapshots).values(snapshot).returning();
    return saved;
  } catch (error) {
    console.error('Error saving forecast snapshot:', error);
    throw error;
  }
}

/**
 * Get forecast history for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of forecasts to retrieve
 * @returns {Array} Historical forecasts
 */
export async function getForecastHistory(userId, limit = 10) {
  try {
    const history = await db
      .select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.userId, userId))
      .orderBy(desc(forecastSnapshots.createdAt))
      .limit(limit);

    return history;
  } catch (error) {
    console.error('Error retrieving forecast history:', error);
    throw error;
  }
}

/**
 * Calculate confidence score based on data quality
 * @param {number} transactionCount - Number of historical transactions
 * @param {Object} velocity - Velocity analysis
 * @returns {number} Confidence score (0-100)
 */
function calculateConfidenceScore(transactionCount, velocity) {
  let confidence = 50; // Base confidence

  // More transactions = higher confidence
  if (transactionCount > 100) confidence += 30;
  else if (transactionCount > 50) confidence += 20;
  else if (transactionCount > 20) confidence += 10;

  // Stable spending = higher confidence
  if (Math.abs(velocity.growthRate) < 5) confidence += 20;
  else if (Math.abs(velocity.growthRate) < 10) confidence += 10;

  return Math.min(100, confidence);
}

/**
 * Calculate severity of danger zone
 * @param {number} lowestBalance - Lowest balance in danger zone
 * @param {number} duration - Duration in days
 * @returns {string} Severity level
 */
function calculateSeverity(lowestBalance, duration) {
  const deficit = Math.abs(lowestBalance);

  if (deficit > 1000 || duration > 14) return 'critical';
  if (deficit > 500 || duration > 7) return 'high';
  if (deficit > 100 || duration > 3) return 'medium';
  return 'low';
}

/**
 * Calculate overall risk from danger zones
 * @param {Array} dangerZones - List of danger zones
 * @returns {string} Overall risk level
 */
function calculateOverallRisk(dangerZones) {
  if (dangerZones.length === 0) return 'low';

  const criticalCount = dangerZones.filter(z => z.severity === 'critical').length;
  const highCount = dangerZones.filter(z => z.severity === 'high').length;

  if (criticalCount > 0) return 'critical';
  if (highCount > 1) return 'high';
  if (dangerZones.length > 2) return 'medium';
  return 'low';
}

/**
 * Generate recommendation for danger zone
 * @param {Object} zone - Danger zone
 * @returns {string} Recommendation text
 */
function generateRecommendation(zone) {
  const deficit = Math.abs(zone.lowestBalance);

  if (zone.severity === 'critical') {
    return `Urgent: Reduce spending by $${deficit} or increase income before ${zone.startDate}`;
  } else if (zone.severity === 'high') {
    return `Important: Plan for additional $${deficit} to avoid overdraft during this period`;
  } else if (zone.severity === 'medium') {
    return `Caution: Monitor spending closely, potential shortfall of $${deficit}`;
  } else {
    return `Advisory: Minor balance dip expected, consider small budget adjustments`;
  }
}

/**
 * Reserve Operating Liquidity (L3)
 * Ensures minimum cash reserves before sweeping dividend cash into long-term investments
 * @param {string} userId - User ID
 * @param {number} months - Months of expenses to reserve (default: 3)
 * @returns {Object} Liquidity reservation details
 */
export async function reserveOperatingLiquidity(userId, months = 3) {
  try {
    // Get cash flow forecast
    const forecast = await projectCashFlow(userId, months * 30);

    // Calculate required operating reserve
    const avgMonthlyExpenses = forecast.summary.totalProjectedExpenses / months;
    const requiredReserve = avgMonthlyExpenses * months;

    // Get current balance
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const currentBalance = parseFloat(user.emergencyFund || 0) + parseFloat(user.monthlyBudget || 0);

    // Calculate available for investment
    const availableForInvestment = Math.max(0, currentBalance - requiredReserve);

    // Check for upcoming danger zones
    const dangerZones = await identifyNegativeMonths(userId, months * 30);

    // If danger zones exist, increase reserve
    let adjustedReserve = requiredReserve;
    if (dangerZones.hasDangerZones) {
      const maxDeficit = Math.max(...dangerZones.dangerZones.map(z => Math.abs(z.lowestBalance)));
      adjustedReserve += maxDeficit * 1.2; // 20% buffer
    }

    const adjustedAvailable = Math.max(0, currentBalance - adjustedReserve);

    return {
      currentBalance,
      requiredReserve: Math.round(requiredReserve * 100) / 100,
      adjustedReserve: Math.round(adjustedReserve * 100) / 100,
      availableForInvestment: Math.round(availableForInvestment * 100) / 100,
      adjustedAvailable: Math.round(adjustedAvailable * 100) / 100,
      reserveMonths: months,
      avgMonthlyExpenses: Math.round(avgMonthlyExpenses * 100) / 100,
      hasDangerZones: dangerZones.hasDangerZones,
      dangerZoneCount: dangerZones.totalDangerZones,
      recommendation: adjustedAvailable > 0
        ? `Safe to invest up to $${adjustedAvailable.toFixed(2)}`
        : 'Insufficient liquidity - do not sweep cash at this time'
    };
  } catch (error) {
    console.error('Error reserving operating liquidity:', error);
    throw error;
  }
}

export default {
  projectCashFlow,
  calculateProjectedBalance,
  identifyNegativeMonths,
  saveForecastSnapshot,
  getForecastHistory,
  reserveOperatingLiquidity
};
