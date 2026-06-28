import { db } from '../db/index.js';
import { spendingPredictions, expenses } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';

/**
 * Spending Prediction Service
 * Issue #668
 * 
 * Predicts future spending by category using historical data and statistical analysis
 */

export class SpendingPredictionService {
  /**
   * Generate spending predictions for all categories
   */
  async generateCategoryPredictions(userId, tenantId, days = 30) {
    try {
      // Get all categories with spending
      const categories = await this.getActiveCategories(userId, tenantId);

      if (categories.length === 0) {
        return {
          predictionsGenerated: false,
          message: 'No spending categories found',
        };
      }

      const predictions = [];

      // Generate prediction for each category
      for (const category of categories) {
        const prediction = await this.predictCategorySpending(
          userId,
          tenantId,
          category,
          days
        );

        if (prediction) {
          predictions.push(prediction);
        }
      }

      return {
        predictionsGenerated: true,
        generatedAt: new Date(),
        period: days,
        totalPredicted: predictions.reduce((sum, p) => sum + p.predictedAmount, 0),
        predictions,
      };
    } catch (error) {
      console.error('Error generating spending predictions:', error);
      throw error;
    }
  }

  /**
   * Predict spending for a specific category
   */
  async predictCategorySpending(userId, tenantId, categoryId, days = 30) {
    try {
      const historicalData = await this.getHistoricalCategoryData(
        userId,
        tenantId,
        categoryId
      );

      if (historicalData.transactions.length < 5) {
        return null; // Insufficient data
      }

      // Calculate statistics
      const stats = this.calculateSpendingStats(historicalData.transactions);

      // Calculate confidence interval (95% CI)
      const confidenceInterval = this.calculateConfidenceInterval(
        stats.mean,
        stats.stdDev,
        historicalData.transactions.length
      );

      // Project daily rate to period
      const prediction = {
        predictedAmount: stats.mean * (days / 30),
        lower95CI: confidenceInterval.lower * (days / 30),
        upper95CI: confidenceInterval.upper * (days / 30),
        confidence: this.calculateConfidence(historicalData.transactions.length),
      };

      // Adjust for trend
      const trend = this.calculateCategoryTrend(historicalData.transactions);
      if (trend.slope > 0) {
        prediction.trend = 'increasing';
        prediction.predictedAmount *= 1 + trend.slopePercentage;
      } else if (trend.slope < -0.1) {
        prediction.trend = 'declining';
        prediction.predictedAmount *= 1 - Math.abs(trend.slopePercentage);
      } else {
        prediction.trend = 'stable';
      }

      // Save to database
      const saved = await this.savePrediction({
        userId,
        tenantId,
        categoryId,
        period: days,
        predictedAmount: prediction.predictedAmount,
        lower95CI: prediction.lower95CI,
        upper95CI: prediction.upper95CI,
        confidence: prediction.confidence,
        trend: prediction.trend,
        dataPoints: historicalData.transactions.length,
        meanDailySpend: stats.mean,
        stdDeviation: stats.stdDev,
        factorApplied: historicalData.seasonalFactor || 1.0,
      });

      return saved;
    } catch (error) {
      console.error(
        `Error predicting spending for category ${categoryId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get historical data for a category
   */
  async getHistoricalCategoryData(userId, tenantId, categoryId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const transactions = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          eq(expenses.categoryId, categoryId),
          gte(expenses.date, ninetyDaysAgo)
        )
      )
      .orderBy((t) => t.date);

    // Calculate daily averages
    const dailyData = this.aggregateDailySpending(transactions);

    return {
      transactions: dailyData,
      totalSpent: transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0),
      transactionCount: transactions.length,
      seasonalFactor: 1.0, // Can be enhanced with seasonal service
    };
  }

  /**
   * Get active categories with recent spending
   */
  async getActiveCategories(userId, tenantId) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          gte(expenses.date, thirtyDaysAgo)
        )
      );

    // Get unique categories
    const categories = [...new Set(recentExpenses.map((e) => e.categoryId))];
    return categories;
  }

  /**
   * Calculate spending statistics
   */
  calculateSpendingStats(dailySpending) {
    if (dailySpending.length === 0) {
      return { mean: 0, stdDev: 0, min: 0, max: 0 };
    }

    const amounts = dailySpending.map((d) => d.amount);
    const mean = amounts.reduce((a, b) => a + b) / amounts.length;

    const variance =
      amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      min: Math.min(...amounts),
      max: Math.max(...amounts),
    };
  }

  /**
   * Calculate 95% confidence interval
   */
  calculateConfidenceInterval(mean, stdDev, sampleSize) {
    // Using standard normal z-score of 1.96 for 95% CI
    const zScore = 1.96;
    const standardError = stdDev / Math.sqrt(sampleSize);
    const margin = zScore * standardError;

    return {
      lower: Math.max(0, mean - margin),
      upper: mean + margin,
    };
  }

  /**
   * Calculate prediction confidence (0-100)
   */
  calculateConfidence(dataPoints) {
    // More data points = more confidence
    // Minimum 5 points for prediction
    if (dataPoints < 5) return 0;
    if (dataPoints < 30) return 40 + (dataPoints - 5) * 1.7; // 40-80
    return Math.min(95, 80 + (dataPoints - 30) * 0.5); // 80-95
  }

  /**
   * Calculate trend in category spending
   */
  calculateCategoryTrend(dailySpending) {
    if (dailySpending.length < 10) {
      return { slope: 0, slopePercentage: 0 };
    }

    // Use last 30 data points if available
    const recentData = dailySpending.slice(-30);
    const n = recentData.length;

    const x = Array.from({ length: n }, (_, i) => i);
    const y = recentData.map((d) => d.amount);

    const sumX = x.reduce((a, b) => a + b);
    const sumY = y.reduce((a, b) => a + b);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const meanY = sumY / n;
    const slopePercentage = meanY > 0 ? (slope / meanY) * 100 : 0;

    return {
      slope: Math.round(slope * 100) / 100,
      slopePercentage: Math.round(slopePercentage * 100) / 100,
    };
  }

  /**
   * Aggregate daily spending
   */
  aggregateDailySpending(transactions) {
    const daily = {};

    transactions.forEach((t) => {
      const date = new Date(t.date);
      const dateStr = date.toISOString().split('T')[0];

      if (!daily[dateStr]) {
        daily[dateStr] = 0;
      }
      daily[dateStr] += parseFloat(t.amount);
    });

    // Convert to array and filter out zero days
    return Object.entries(daily)
      .map(([date, amount]) => ({ date, amount }))
      .filter((d) => d.amount > 0);
  }

  /**
   * Save prediction to database
   */
  async savePrediction(predictionData) {
    const existing = await db
      .select()
      .from(spendingPredictions)
      .where(
        and(
          eq(spendingPredictions.userId, predictionData.userId),
          eq(spendingPredictions.tenantId, predictionData.tenantId),
          eq(spendingPredictions.categoryId, predictionData.categoryId)
        )
      );

    if (existing.length > 0) {
      return await db
        .update(spendingPredictions)
        .set({
          predictedAmount: predictionData.predictedAmount,
          lower95CI: predictionData.lower95CI,
          upper95CI: predictionData.upper95CI,
          confidence: predictionData.confidence,
          trend: predictionData.trend,
          dataPoints: predictionData.dataPoints,
          meanDailySpend: predictionData.meanDailySpend,
          stdDeviation: predictionData.stdDeviation,
          factorApplied: predictionData.factorApplied,
          predictedAt: new Date(),
        })
        .where(
          and(
            eq(spendingPredictions.userId, predictionData.userId),
            eq(spendingPredictions.tenantId, predictionData.tenantId),
            eq(spendingPredictions.categoryId, predictionData.categoryId)
          )
        )
        .returning();
    } else {
      return await db
        .insert(spendingPredictions)
        .values({
          userId: predictionData.userId,
          tenantId: predictionData.tenantId,
          categoryId: predictionData.categoryId,
          period: predictionData.period,
          predictedAmount: predictionData.predictedAmount,
          lower95CI: predictionData.lower95CI,
          upper95CI: predictionData.upper95CI,
          confidence: predictionData.confidence,
          trend: predictionData.trend,
          dataPoints: predictionData.dataPoints,
          meanDailySpend: predictionData.meanDailySpend,
          stdDeviation: predictionData.stdDeviation,
          factorApplied: predictionData.factorApplied,
          predictedAt: new Date(),
        })
        .returning();
    }
  }

  /**
   * Get spending predictions for a period
   */
  async getSpendingPredictions(userId, tenantId) {
    const predictions = await db
      .select()
      .from(spendingPredictions)
      .where(
        and(
          eq(spendingPredictions.userId, userId),
          eq(spendingPredictions.tenantId, tenantId)
        )
      );

    return predictions.map((p) => ({
      category: p.categoryId,
      predictedAmount: p.predictedAmount,
      confidenceInterval: {
        lower: p.lower95CI,
        upper: p.upper95CI,
      },
      confidence: p.confidence,
      trend: p.trend,
      meanDaily: p.meanDailySpend,
      volatility: p.stdDeviation,
    }));
  }

  /**
   * Compare prediction vs actual
   */
  async compareToActual(userId, tenantId, categoryId, actualAmount) {
    const prediction = await db
      .select()
      .from(spendingPredictions)
      .where(
        and(
          eq(spendingPredictions.userId, userId),
          eq(spendingPredictions.tenantId, tenantId),
          eq(spendingPredictions.categoryId, categoryId)
        )
      );

    if (prediction.length === 0) {
      return { status: 'no_prediction' };
    }

    const pred = prediction[0];
    const difference = actualAmount - pred.predictedAmount;
    const percentageDiff = (difference / pred.predictedAmount) * 100;
    const withinCI = actualAmount >= pred.lower95CI && actualAmount <= pred.upper95CI;

    return {
      predicted: pred.predictedAmount,
      actual: actualAmount,
      difference: Math.round(difference * 100) / 100,
      percentageDiff: Math.round(percentageDiff * 100) / 100,
      withinConfidenceInterval: withinCI,
      accurate: Math.abs(percentageDiff) < 15, // Within 15% is accurate
    };
  }

  /**
   * Get categories exceeding predictions
   */
  async getCategoriesExceedingPredictions(userId, tenantId) {
    const predictions = await db
      .select()
      .from(spendingPredictions)
      .where(
        and(
          eq(spendingPredictions.userId, userId),
          eq(spendingPredictions.tenantId, tenantId)
        )
      );

    const exceeding = [];

    for (const pred of predictions) {
      // Get actual spending since prediction
      const actualExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            eq(expenses.categoryId, pred.categoryId),
            gte(expenses.date, pred.predictedAt)
          )
        );

      const actualAmount = actualExpenses.reduce(
        (sum, e) => sum + parseFloat(e.amount),
        0
      );

      if (actualAmount > pred.upper95CI) {
        exceeding.push({
          category: pred.categoryId,
          predicted: pred.predictedAmount,
          actual: actualAmount,
          exceedAmount: actualAmount - pred.predicted,
          confidence: pred.confidence,
        });
      }
    }

    return exceeding.sort((a, b) => b.exceedAmount - a.exceedAmount);
  }
}

export const spendingPredictionService = new SpendingPredictionService();
