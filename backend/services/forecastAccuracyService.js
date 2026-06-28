import { db } from '../db/index.js';
import { forecastAccuracyMetrics, cashFlowForecasts, expenses } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';

/**
 * Forecast Accuracy Service
 * Issue #668
 * 
 * Tracks and analyzes forecast accuracy metrics and model performance
 */

export class ForecastAccuracyService {
  /**
   * Calculate accuracy metrics for a completed forecast
   */
  async calculateAccuracyMetrics(forecastId, userId, tenantId) {
    try {
      const forecast = await db
        .select()
        .from(cashFlowForecasts)
        .where(
          and(
            eq(cashFlowForecasts.id, forecastId),
            eq(cashFlowForecasts.userId, userId),
            eq(cashFlowForecasts.tenantId, tenantId)
          )
        );

      if (forecast.length === 0) {
        return { metricsCalculated: false, message: 'Forecast not found' };
      }

      const fc = forecast[0];
      const forecastEndDate = new Date(fc.endDate);

      // Check if forecast period has ended
      if (new Date() < forecastEndDate) {
        return {
          metricsCalculated: false,
          message: 'Forecast period not yet complete',
        };
      }

      // Fetch actual data for the forecast period
      const actualData = await this.getActualData(
        userId,
        tenantId,
        new Date(fc.startDate),
        forecastEndDate
      );

      // Calculate metrics
      const metrics = {
        mae: 0, // Mean Absolute Error
        mape: 0, // Mean Absolute Percentage Error
        rmse: 0, // Root Mean Square Error
        directionAccuracy: 0, // % of correct direction predictions
        categoryAccuracy: {}, // Accuracy per category
        overallAccuracy: 0,
      };

      if (fc.projectedData && Array.isArray(fc.projectedData)) {
        // Project data is daily projections
        const projectionErrors = [];
        let directionCorrect = 0;
        let totalDays = 0;

        for (const projection of fc.projectedData) {
          const projDate = projection.date;
          const actual = actualData[projDate] || {
            income: 0,
            expenses: 0,
            netCashFlow: 0,
          };

          // Calculate errors
          const expenseError = Math.abs(
            actual.expenses - (projection.expense || 0)
          );
          const incomeError = Math.abs(actual.income - (projection.income || 0));
          const netFlowError = Math.abs(
            actual.netCashFlow - (projection.netCashFlow || 0)
          );

          projectionErrors.push({
            date: projDate,
            expenseError,
            incomeError,
            netFlowError,
          });

          // Check direction accuracy (was the direction of change correct?)
          const projDirection = (projection.netCashFlow || 0) > 0 ? 'positive' : 'negative';
          const actualDirection = actual.netCashFlow > 0 ? 'positive' : 'negative';
          if (projDirection === actualDirection) {
            directionCorrect++;
          }

          totalDays++;
        }

        // Calculate MAE
        metrics.mae = this.calculateMean(
          projectionErrors.map((e) => e.netFlowError)
        );

        // Calculate MAPE
        metrics.mape = this.calculateMAPE(projectionErrors, actualData);

        // Calculate RMSE
        metrics.rmse = this.calculateRMSE(
          projectionErrors.map((e) => e.netFlowError)
        );

        // Calculate direction accuracy
        metrics.directionAccuracy = (directionCorrect / totalDays) * 100;

        // Overall accuracy (inverse of MAPE)
        metrics.overallAccuracy = Math.max(
          0,
          Math.min(100, 100 - metrics.mape)
        );
      }

      // Save metrics
      const saved = await this.saveMetrics(userId, tenantId, forecastId, metrics);

      return {
        metricsCalculated: true,
        metrics: saved[0],
      };
    } catch (error) {
      console.error('Error calculating accuracy metrics:', error);
      throw error;
    }
  }

  /**
   * Get actual data for a period
   */
  async getActualData(userId, tenantId, startDate, endDate) {
    const expenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.tenantId, tenantId),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        )
      );

    // Aggregate by date
    const actualByDate = {};

    expenses.forEach((exp) => {
      const dateStr = new Date(exp.date).toISOString().split('T')[0];

      if (!actualByDate[dateStr]) {
        actualByDate[dateStr] = {
          income: 0,
          expenses: 0,
          netCashFlow: 0,
        };
      }

      actualByDate[dateStr].expenses += parseFloat(exp.amount);
    });

    // Calculate net cash flow for each day
    Object.keys(actualByDate).forEach((date) => {
      actualByDate[date].netCashFlow =
        actualByDate[date].income - actualByDate[date].expenses;
    });

    return actualByDate;
  }

  /**
   * Calculate Mean Absolute Error
   */
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b) / values.length;
  }

  /**
   * Calculate Mean Absolute Percentage Error
   */
  calculateMAPE(errors, actualData) {
    let totalPercentageError = 0;
    let count = 0;

    errors.forEach((error) => {
      const actualValue = actualData[error.date]?.netCashFlow || 0;
      if (actualValue !== 0) {
        const percentageError =
          (Math.abs(error.netFlowError) / Math.abs(actualValue)) * 100;
        totalPercentageError += percentageError;
        count++;
      }
    });

    return count > 0 ? totalPercentageError / count : 0;
  }

  /**
   * Calculate Root Mean Square Error
   */
  calculateRMSE(errors) {
    if (errors.length === 0) return 0;
    const sumSquares = errors.reduce((sum, e) => sum + e * e, 0);
    return Math.sqrt(sumSquares / errors.length);
  }

  /**
   * Save metrics to database
   */
  async saveMetrics(userId, tenantId, forecastId, metrics) {
    const existing = await db
      .select()
      .from(forecastAccuracyMetrics)
      .where(
        and(
          eq(forecastAccuracyMetrics.userId, userId),
          eq(forecastAccuracyMetrics.tenantId, tenantId),
          eq(forecastAccuracyMetrics.forecastId, forecastId)
        )
      );

    if (existing.length > 0) {
      return await db
        .update(forecastAccuracyMetrics)
        .set({
          mae: Math.round(metrics.mae * 100) / 100,
          mape: Math.round(metrics.mape * 100) / 100,
          rmse: Math.round(metrics.rmse * 100) / 100,
          directionAccuracy: Math.round(metrics.directionAccuracy * 100) / 100,
          overallAccuracy: Math.round(metrics.overallAccuracy * 100) / 100,
          evaluatedAt: new Date(),
        })
        .where(eq(forecastAccuracyMetrics.id, existing[0].id))
        .returning();
    } else {
      return await db
        .insert(forecastAccuracyMetrics)
        .values({
          userId,
          tenantId,
          forecastId,
          mae: Math.round(metrics.mae * 100) / 100,
          mape: Math.round(metrics.mape * 100) / 100,
          rmse: Math.round(metrics.rmse * 100) / 100,
          directionAccuracy: Math.round(metrics.directionAccuracy * 100) / 100,
          overallAccuracy: Math.round(metrics.overallAccuracy * 100) / 100,
          evaluatedAt: new Date(),
        })
        .returning();
    }
  }

  /**
   * Get accuracy for specific forecast
   */
  async getForecastAccuracy(forecastId) {
    const accuracy = await db
      .select()
      .from(forecastAccuracyMetrics)
      .where(eq(forecastAccuracyMetrics.forecastId, forecastId));

    return accuracy.length > 0 ? accuracy[0] : null;
  }

  /**
   * Get average accuracy for user
   */
  async getUserAverageAccuracy(userId, tenantId) {
    const allMetrics = await db
      .select()
      .from(forecastAccuracyMetrics)
      .where(
        and(
          eq(forecastAccuracyMetrics.userId, userId),
          eq(forecastAccuracyMetrics.tenantId, tenantId)
        )
      );

    if (allMetrics.length === 0) {
      return {
        metricsAvailable: false,
        message: 'No completed forecasts with accuracy metrics',
      };
    }

    const averages = {
      mae:
        allMetrics.reduce((sum, m) => sum + m.mae, 0) / allMetrics.length,
      mape:
        allMetrics.reduce((sum, m) => sum + m.mape, 0) / allMetrics.length,
      rmse:
        allMetrics.reduce((sum, m) => sum + m.rmse, 0) / allMetrics.length,
      directionAccuracy:
        allMetrics.reduce((sum, m) => sum + m.directionAccuracy, 0) /
        allMetrics.length,
      overallAccuracy:
        allMetrics.reduce((sum, m) => sum + m.overallAccuracy, 0) /
        allMetrics.length,
    };

    // Round to 2 decimals
    Object.keys(averages).forEach((key) => {
      averages[key] = Math.round(averages[key] * 100) / 100;
    });

    return {
      metricsAvailable: true,
      forecasts_evaluated: allMetrics.length,
      averages,
      recentMetrics: allMetrics.slice(-5), // Last 5 forecasts
    };
  }

  /**
   * Compare forecast period accuracy trends
   */
  async compareAccuracyByPeriod(userId, tenantId) {
    const allMetrics = await db
      .select()
      .from(forecastAccuracyMetrics)
      .where(
        and(
          eq(forecastAccuracyMetrics.userId, userId),
          eq(forecastAccuracyMetrics.tenantId, tenantId)
        )
      );

    const byPeriod = {
      thirty_days: [],
      sixty_days: [],
      ninety_days: [],
    };

    // Group by forecast period (would need to join with cashFlowForecasts)
    // For now, return metrics grouped

    return {
      comparison: byPeriod,
      insight:
        'Accuracy typically improves for longer periods due to averaging and trend stability',
    };
  }

  /**
   * Identify forecast improvement areas
   */
  async getImprovementAreas(userId, tenantId) {
    const userAccuracy = await this.getUserAverageAccuracy(userId, tenantId);

    if (!userAccuracy.metricsAvailable) {
      return {
        improvements: [],
        message: 'Insufficient data for improvement recommendations',
      };
    }

    const improvements = [];
    const { averages } = userAccuracy;

    // MAPE-based improvements
    if (averages.mape > 20) {
      improvements.push({
        area: 'Overall Accuracy',
        current: `${averages.mape.toFixed(1)}% error`,
        recommendation: 'Review spending patterns for unusual variability',
        priority: 'high',
      });
    }

    // Direction accuracy
    if (averages.directionAccuracy < 70) {
      improvements.push({
        area: 'Trend Prediction',
        current: `${averages.directionAccuracy.toFixed(1)}% directional accuracy`,
        recommendation: 'Consider seasonal adjustments in forecasting model',
        priority: 'medium',
      });
    }

    // RMSE-based improvements
    if (averages.rmse > 500) {
      improvements.push({
        area: 'Volatility Handling',
        current: `${averages.rmse.toFixed(0)} RMSE`,
        recommendation: 'Include more volatility buffers for irregular expenses',
        priority: 'medium',
      });
    }

    return {
      improvementsIdentified: improvements.length > 0,
      improvements,
      overallHealthScore: Math.round(averages.overallAccuracy),
    };
  }

  /**
   * Get forecast quality assessment
   */
  async getQualityAssessment(userId, tenantId) {
    const userAccuracy = await this.getUserAverageAccuracy(userId, tenantId);

    if (!userAccuracy.metricsAvailable) {
      return {
        quality: 'insufficient_data',
        forecasts_needed: 3,
      };
    }

    const { averages } = userAccuracy;
    let quality = 'excellent';

    if (averages.overallAccuracy < 70) {
      quality = 'poor';
    } else if (averages.overallAccuracy < 80) {
      quality = 'fair';
    } else if (averages.overallAccuracy < 90) {
      quality = 'good';
    }

    return {
      quality,
      score: averages.overallAccuracy,
      mape: averages.mape,
      directionAccuracy: averages.directionAccuracy,
      recommendation:
        quality === 'excellent'
          ? 'Forecasts are highly reliable for decision making'
          : quality === 'good'
            ? 'Forecasts are reliable with minor adjustments'
            : quality === 'fair'
              ? 'Use forecasts cautiously, review for patterns'
              : 'Significant variability detected, use with caution',
    };
  }

  /**
   * Generate accuracy report
   */
  async generateAccuracyReport(userId, tenantId) {
    const averageAccuracy = await this.getUserAverageAccuracy(userId, tenantId);
    const improvements = await this.getImprovementAreas(userId, tenantId);
    const quality = await this.getQualityAssessment(userId, tenantId);

    return {
      report: {
        generatedAt: new Date(),
        userId,
        tenantId,
        quality: quality,
        averageMetrics: averageAccuracy.averages || null,
        improvementAreas: improvements.improvements,
        recommendation: quality.recommendation,
      },
    };
  }
}

export const forecastAccuracyService = new ForecastAccuracyService();
