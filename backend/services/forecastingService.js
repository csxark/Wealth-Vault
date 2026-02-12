/**
 * Forecasting Service
 * Handles AI-driven budget forecasting and predictions using machine learning models
 */

import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, categories, forecasts, users, exchangeRates, cashFlowModels } from '../db/schema.js';
import currencyService from './currencyService.js';

// Simple Linear Regression implementation for forecasting
class LinearRegression {
  constructor() {
    this.slope = 0;
    this.intercept = 0;
  }

  train(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    this.slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    this.intercept = (sumY - this.slope * sumX) / n;
  }

  predict(x) {
    return this.slope * x + this.intercept;
  }

  getRSquared(x, y) {
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;
    const ssRes = x.reduce((sum, xi, i) => sum + Math.pow(y[i] - this.predict(xi), 2), 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    return 1 - (ssRes / ssTot);
  }
}

class ForecastingService {
  /**
   * Generate expense forecast for a user
   * @param {string} userId - User ID
   * @param {string} categoryId - Optional category ID for category-specific forecast
   * @param {string} period - Forecast period ('monthly', 'quarterly', 'yearly')
   * @param {number} monthsAhead - Number of months to forecast
   * @param {object} options - Additional options (scenario, externalFactors)
   * @returns {object} Forecast data with predictions and metadata
   */
  async generateExpenseForecast(userId, categoryId = null, period = 'monthly', monthsAhead = 6, options = {}) {
    try {
      // Get historical expense data
      const historicalData = await this.getHistoricalExpenseData(userId, categoryId, 12); // Last 12 months

      if (historicalData.length < 3) {
        throw new Error('Insufficient historical data for forecasting');
      }

      // Prepare data for training
      const { x, y } = this.prepareTrainingData(historicalData);

      // Train model
      const model = new LinearRegression();
      model.train(x, y);

      // Generate predictions
      const predictions = this.generatePredictions(model, monthsAhead, historicalData);

      // Apply seasonal adjustments and external factors
      const adjustedPredictions = await this.applyAdjustments(predictions, options, userId);

      // Calculate confidence intervals
      const confidenceIntervals = this.calculateConfidenceIntervals(adjustedPredictions, model);

      // Store forecast in database
      const forecastRecord = await this.saveForecast({
        userId,
        categoryId,
        forecastType: 'expense',
        period,
        forecastData: adjustedPredictions,
        parameters: {
          modelType: 'linear_regression',
          slope: model.slope,
          intercept: model.intercept,
          rSquared: model.getRSquared(x, y),
          confidenceIntervals
        },
        accuracy: model.getRSquared(x, y),
        scenario: options.scenario || 'baseline',
        isSimulation: options.isSimulation || false,
        simulationInputs: options.simulationInputs || null,
        metadata: {
          trainingDataPoints: historicalData.length,
          seasonalAdjustment: options.seasonalAdjustment || false,
          externalFactors: options.externalFactors || [],
          lastTrained: new Date().toISOString()
        }
      });

      return {
        forecastId: forecastRecord.id,
        predictions: adjustedPredictions,
        confidenceIntervals,
        accuracy: model.getRSquared(x, y),
        metadata: forecastRecord.metadata
      };

    } catch (error) {
      console.error('Error generating expense forecast:', error);
      throw error;
    }
  }

  /**
   * Generate what-if scenario forecast
   * @param {string} userId - User ID
   * @param {object} simulationInputs - User inputs for simulation
   * @returns {object} Simulation forecast
   */
  async generateSimulationForecast(userId, simulationInputs) {
    try {
      // Get baseline forecast
      const baselineForecast = await this.generateExpenseForecast(userId, null, 'monthly', 6, { scenario: 'baseline' });

      // Apply simulation adjustments
      const simulatedPredictions = this.applySimulationAdjustments(baselineForecast.predictions, simulationInputs);

      // Save simulation forecast
      const simulationRecord = await this.saveForecast({
        userId,
        forecastType: 'expense',
        period: 'monthly',
        forecastData: simulatedPredictions,
        parameters: { simulationType: 'what_if' },
        scenario: 'custom',
        isSimulation: true,
        simulationInputs,
        metadata: {
          basedOnForecastId: baselineForecast.forecastId,
          simulationType: 'what_if'
        }
      });

      return {
        forecastId: simulationRecord.id,
        predictions: simulatedPredictions,
        baselineComparison: baselineForecast.predictions,
        simulationInputs
      };

    } catch (error) {
      console.error('Error generating simulation forecast:', error);
      throw error;
    }
  }

  /**
   * Get historical expense data for training
   */
  async getHistoricalExpenseData(userId, categoryId, monthsBack) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    let conditions = [
      eq(expenses.userId, userId),
      eq(expenses.status, 'completed'),
      gte(expenses.date, startDate),
      lte(expenses.date, endDate)
    ];

    if (categoryId) {
      conditions.push(eq(expenses.categoryId, categoryId));
    }

    const expenseData = await db
      .select({
        month: sql`DATE_TRUNC('month', ${expenses.date})`,
        total: sql`SUM(${expenses.amount})`,
        count: sql`COUNT(*)`
      })
      .from(expenses)
      .where(and(...conditions))
      .groupBy(sql`DATE_TRUNC('month', ${expenses.date})`)
      .orderBy(sql`DATE_TRUNC('month', ${expenses.date})`);

    return expenseData.map(row => ({
      month: row.month,
      total: Number(row.total),
      count: Number(row.count)
    }));
  }

  /**
   * Prepare data for model training
   */
  prepareTrainingData(historicalData) {
    const x = [];
    const y = [];

    historicalData.forEach((data, index) => {
      x.push(index); // Time index
      y.push(data.total);
    });

    return { x, y };
  }

  /**
   * Generate predictions using trained model
   */
  generatePredictions(model, monthsAhead, historicalData) {
    const predictions = [];
    const lastIndex = historicalData.length - 1;

    for (let i = 1; i <= monthsAhead; i++) {
      const futureIndex = lastIndex + i;
      const predictedAmount = Math.max(0, model.predict(futureIndex)); // Ensure non-negative

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + i);

      predictions.push({
        date: futureDate.toISOString().split('T')[0],
        predictedAmount,
        month: futureDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      });
    }

    return predictions;
  }

  /**
   * Apply seasonal adjustments and external factors
   */
  async applyAdjustments(predictions, options, userId) {
    let adjustedPredictions = [...predictions];

    // Apply seasonal adjustments
    if (options.seasonalAdjustment) {
      adjustedPredictions = this.applySeasonalAdjustment(adjustedPredictions);
    }

    // Apply external factors (inflation, etc.)
    if (options.externalFactors && options.externalFactors.length > 0) {
      adjustedPredictions = await this.applyExternalFactors(adjustedPredictions, options.externalFactors, userId);
    }

    return adjustedPredictions;
  }

  /**
   * Apply seasonal adjustment based on historical patterns
   */
  applySeasonalAdjustment(predictions) {
    // Simple seasonal adjustment based on month of year
    const seasonalFactors = {
      0: 1.1,   // January (higher due to holidays)
      1: 0.9,   // February
      2: 1.0,   // March
      3: 1.0,   // April
      4: 1.05,  // May
      5: 1.1,   // June (summer)
      6: 1.15,  // July (vacation)
      7: 1.1,   // August
      8: 1.0,   // September
      9: 1.0,   // October
      10: 1.2,  // November (holidays)
      11: 1.3   // December (holidays)
    };

    return predictions.map(prediction => {
      const date = new Date(prediction.date);
      const month = date.getMonth();
      const factor = seasonalFactors[month] || 1.0;

      return {
        ...prediction,
        predictedAmount: prediction.predictedAmount * factor,
        seasonalAdjustment: factor
      };
    });
  }

  /**
   * Apply external factors like inflation
   */
  async applyExternalFactors(predictions, externalFactors, userId) {
    // Get current exchange rates for inflation calculations
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { currency: true }
    });

    const userCurrency = user?.currency || 'USD';

    // For now, apply simple inflation rate
    const inflationRate = externalFactors.includes('inflation') ? 0.03 : 0; // 3% annual inflation

    return predictions.map((prediction, index) => {
      const inflationFactor = Math.pow(1 + inflationRate, (index + 1) / 12);
      return {
        ...prediction,
        predictedAmount: prediction.predictedAmount * inflationFactor,
        inflationAdjustment: inflationFactor
      };
    });
  }

  /**
   * Apply simulation adjustments for what-if scenarios
   */
  applySimulationAdjustments(predictions, simulationInputs) {
    return predictions.map(prediction => {
      let adjustedAmount = prediction.predictedAmount;

      // Apply income changes
      if (simulationInputs.incomeChange) {
        const incomeFactor = 1 + (simulationInputs.incomeChange / 100);
        adjustedAmount *= incomeFactor;
      }

      // Apply expense adjustments
      if (simulationInputs.expenseAdjustments) {
        simulationInputs.expenseAdjustments.forEach(adjustment => {
          if (adjustment.category === 'all' || prediction.category === adjustment.category) {
            const factor = 1 + (adjustment.percentage / 100);
            adjustedAmount *= factor;
          }
        });
      }

      // Apply one-time expenses
      if (simulationInputs.oneTimeExpenses) {
        simulationInputs.oneTimeExpenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          const predictionDate = new Date(prediction.date);
          if (expenseDate.getMonth() === predictionDate.getMonth() &&
              expenseDate.getFullYear() === predictionDate.getFullYear()) {
            adjustedAmount += expense.amount;
          }
        });
      }

      return {
        ...prediction,
        predictedAmount: Math.max(0, adjustedAmount),
        simulationAdjustment: adjustedAmount / prediction.predictedAmount
      };
    });
  }

  /**
   * Calculate confidence intervals for predictions
   */
  calculateConfidenceIntervals(predictions, model) {
    // Simple confidence interval calculation
    const standardError = 0.1; // Placeholder - would be calculated from residuals
    const tValue = 1.96; // 95% confidence

    return predictions.map(prediction => ({
      date: prediction.date,
      lowerBound: Math.max(0, prediction.predictedAmount - (tValue * standardError * prediction.predictedAmount)),
      upperBound: prediction.predictedAmount + (tValue * standardError * prediction.predictedAmount)
    }));
  }

  /**
   * Save forecast to database
   */
  async saveForecast(forecastData) {
    const [saved] = await db.insert(forecasts).values(forecastData).returning();
    return saved;
  }

  /**
   * Get user's forecasts
   */
  async getUserForecasts(userId, type = null, limit = 10) {
    let conditions = [eq(forecasts.userId, userId)];

    if (type) {
      conditions.push(eq(forecasts.forecastType, type));
    }

    const userForecasts = await db.query.forecasts.findMany({
      where: and(...conditions),
      orderBy: desc(forecasts.createdAt),
      limit
    });

    return userForecasts;
  }

  /**
   * Get forecast by ID
   */
  async getForecastById(forecastId, userId) {
    const [forecast] = await db.query.forecasts.findMany({
      where: and(eq(forecasts.id, forecastId), eq(forecasts.userId, userId))
    });

    return forecast;
  }

  /**
   * Delete forecast
   */
  async deleteForecast(forecastId, userId) {
    await db.delete(forecasts).where(
      and(eq(forecasts.id, forecastId), eq(forecasts.userId, userId))
    );
  }
}

export default new ForecastingService();
