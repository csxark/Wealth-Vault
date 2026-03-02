import { db } from '../db/index.js';
import { forecastAlerts, cashFlowForecasts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Forecast Alert Service
 * Issue #668
 * 
 * Generates alerts for forecast-based events and anomalies
 */

export class ForecastAlertService {
  /**
   * Generate alerts from forecast
   */
  async generateAlertsFromForecast(userId, tenantId, forecast) {
    try {
      const alerts = [];

      // Check for negative cash flow alerts
      const negativeFlowAlerts = this.checkNegativeCashFlow(forecast);
      alerts.push(...negativeFlowAlerts);

      // Check for volatility alerts
      const volatilityAlerts = this.checkSpendingVolatility(forecast);
      alerts.push(...volatilityAlerts);

      // Check for budget overage alerts
      if (forecast.riskFactors && forecast.riskFactors.budgetOverage) {
        alerts.push({
          type: 'budget_overage',
          severity: 'high',
          message: 'Projected to exceed budget',
          affectedArea: 'spending',
        });
      }

      // Check for cash reserve alerts
      const reserveAlerts = this.checkCashReserves(forecast);
      alerts.push(...reserveAlerts);

      // Save all alerts
      const savedAlerts = [];
      for (const alert of alerts) {
        const saved = await this.saveAlert(userId, tenantId, forecast.id, alert);
        savedAlerts.push(saved);
      }

      return {
        alertsGenerated: savedAlerts.length > 0,
        count: savedAlerts.length,
        alerts: savedAlerts,
      };
    } catch (error) {
      console.error('Error generating forecast alerts:', error);
      throw error;
    }
  }

  /**
   * Check for negative cash flow alerts
   */
  checkNegativeCashFlow(forecast) {
    const alerts = [];
    let negativeCount = 0;

    if (forecast.dailyProjections) {
      forecast.dailyProjections.forEach((projection, index) => {
        if (projection.netCashFlow < 0) {
          negativeCount++;
        }
      });

      const negativePercent = (negativeCount / forecast.dailyProjections.length) * 100;

      if (negativePercent > 50) {
        alerts.push({
          type: 'sustained_negative_flow',
          severity: 'critical',
          message: `${Math.round(negativePercent)}% of projected days have negative cash flow`,
          affectedArea: 'cash_flow',
          triggerThreshold: 50,
          actualValue: Math.round(negativePercent),
        });
      } else if (negativePercent > 20) {
        alerts.push({
          type: 'frequent_negative_flow',
          severity: 'high',
          message: `${Math.round(negativePercent)}% of days projected to have negative cash flow`,
          affectedArea: 'cash_flow',
          triggerThreshold: 20,
          actualValue: Math.round(negativePercent),
        });
      }
    }

    return alerts;
  }

  /**
   * Check for spending volatility
   */
  checkSpendingVolatility(forecast) {
    const alerts = [];

    if (forecast.riskFactors && forecast.riskFactors.highExpenseRatio) {
      const ratio = forecast.riskFactors.highExpenseRatio;

      // Volatility defined as variance in expense amounts
      alerts.push({
        type: 'high_volatility',
        severity: ratio > 0.95 ? 'critical' : 'high',
        message:
          ratio > 0.95
            ? 'Expense to income ratio critically high'
            : 'Highly variable spending patterns detected',
        affectedArea: 'spending_volatility',
        triggerThreshold: 0.8,
        actualValue: Math.round(ratio * 100),
      });
    }

    return alerts;
  }

  /**
   * Check for cash reserve alerts
   */
  checkCashReserves(forecast) {
    const alerts = [];

    if (forecast.endingBalance !== undefined) {
      // Assume $25,000 is minimum safe reserve
      const minimumReserve = 25000;

      if (forecast.endingBalance < minimumReserve * 0.5) {
        alerts.push({
          type: 'critical_reserves_low',
          severity: 'critical',
          message: `Projected cash reserves below critical threshold`,
          affectedArea: 'cash_reserves',
          triggerThreshold: minimumReserve * 0.5,
          actualValue: Math.round(forecast.endingBalance),
          recommendations: 'Consider increasing income or reducing expenses',
        });
      } else if (forecast.endingBalance < minimumReserve) {
        alerts.push({
          type: 'reserves_depleting',
          severity: 'high',
          message: `Cash reserves projected to deplete below minimum`,
          affectedArea: 'cash_reserves',
          triggerThreshold: minimumReserve,
          actualValue: Math.round(forecast.endingBalance),
        });
      }
    }

    return alerts;
  }

  /**
   * Save alert to database
   */
  async saveAlert(userId, tenantId, forecastId, alertData) {
    const existing = await db
      .select()
      .from(forecastAlerts)
      .where(
        and(
          eq(forecastAlerts.userId, userId),
          eq(forecastAlerts.tenantId, tenantId),
          eq(forecastAlerts.forecastId, forecastId),
          eq(forecastAlerts.alertType, alertData.type)
        )
      );

    if (existing.length > 0) {
      // Update existing alert
      return await db
        .update(forecastAlerts)
        .set({
          severity: alertData.severity,
          message: alertData.message,
          affectedArea: alertData.affectedArea,
          alertData: alertData,
          acknowledgedAt: null, // Reset acknowledgment
          createdAt: new Date(),
        })
        .where(eq(forecastAlerts.id, existing[0].id))
        .returning();
    } else {
      // Create new alert
      return await db
        .insert(forecastAlerts)
        .values({
          userId,
          tenantId,
          forecastId,
          alertType: alertData.type,
          severity: alertData.severity,
          message: alertData.message,
          affectedArea: alertData.affectedArea,
          alertData: alertData,
          status: 'active',
          createdAt: new Date(),
        })
        .returning();
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(userId, tenantId) {
    const alerts = await db
      .select()
      .from(forecastAlerts)
      .where(
        and(
          eq(forecastAlerts.userId, userId),
          eq(forecastAlerts.tenantId, tenantId),
          eq(forecastAlerts.status, 'active')
        )
      );

    return {
      count: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical'),
      high: alerts.filter((a) => a.severity === 'high'),
      medium: alerts.filter((a) => a.severity === 'medium'),
      low: alerts.filter((a) => a.severity === 'low'),
      alerts,
    };
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alerterId, userId, tenantId) {
    try {
      return await db
        .update(forecastAlerts)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date(),
        })
        .where(
          and(
            eq(forecastAlerts.id, alerterId),
            eq(forecastAlerts.userId, userId),
            eq(forecastAlerts.tenantId, tenantId)
          )
        )
        .returning();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(alertId, userId, tenantId) {
    try {
      return await db
        .update(forecastAlerts)
        .set({
          status: 'dismissed',
          dismissedAt: new Date(),
        })
        .where(
          and(
            eq(forecastAlerts.id, alertId),
            eq(forecastAlerts.userId, userId),
            eq(forecastAlerts.tenantId, tenantId)
          )
        )
        .returning();
    } catch (error) {
      console.error('Error dismissing alert:', error);
      throw error;
    }
  }

  /**
   * Get alert history
   */
  async getAlertHistory(userId, tenantId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const history = await db
      .select()
      .from(forecastAlerts)
      .where(
        and(
          eq(forecastAlerts.userId, userId),
          eq(forecastAlerts.tenantId, tenantId)
        )
      );

    return {
      periodDays: days,
      totalAlerts: history.length,
      byStatus: {
        active: history.filter((a) => a.status === 'active').length,
        acknowledged: history.filter((a) => a.status === 'acknowledged').length,
        dismissed: history.filter((a) => a.status === 'dismissed').length,
        resolved: history.filter((a) => a.status === 'resolved').length,
      },
      bySeverity: {
        critical: history.filter((a) => a.severity === 'critical').length,
        high: history.filter((a) => a.severity === 'high').length,
        medium: history.filter((a) => a.severity === 'medium').length,
        low: history.filter((a) => a.severity === 'low').length,
      },
      uniqueAlertTypes: [...new Set(history.map((a) => a.alertType))],
    };
  }

  /**
   * Get alert recommendations
   */
  async getAlertRecommendations(userId, tenantId) {
    const activeAlerts = await this.getActiveAlerts(userId, tenantId);
    const recommendations = [];

    // Critical alerts
    activeAlerts.critical.forEach((alert) => {
      switch (alert.alertType) {
        case 'sustained_negative_flow':
          recommendations.push({
            priority: 'immediate',
            message: 'Reduce monthly expenses or increase income',
            actions: [
              'Review discretionary spending',
              'Consider additional income sources',
              'Defer non-essential purchases',
            ],
          });
          break;
        case 'critical_reserves_low':
          recommendations.push({
            priority: 'immediate',
            message: 'Replenish emergency fund',
            actions: [
              'Allocate all surplus to reserves',
              'Pause non-essential savings',
              'Increase work hours if possible',
            ],
          });
          break;
      }
    });

    // High severity alerts
    activeAlerts.high.forEach((alert) => {
      switch (alert.alertType) {
        case 'frequent_negative_flow':
          recommendations.push({
            priority: 'high',
            message: 'Plan for negative cash flow periods',
            actions: [
              'Identify which days/periods are problematic',
              'Create spending reduction plan for those periods',
              'Build larger reserve for next period',
            ],
          });
          break;
        case 'reserves_depleting':
          recommendations.push({
            priority: 'high',
            message: 'Start building emergency fund',
            actions: [
              'Increase monthly savings target',
              'Cut non-essential expenses',
              'Track progress monthly',
            ],
          });
          break;
      }
    });

    return {
      recommendationsCount: recommendations.length,
      recommendations,
    };
  }

  /**
   * Create custom alert
   */
  async createCustomAlert(userId, tenantId, forecastId, alertConfig) {
    try {
      return await db
        .insert(forecastAlerts)
        .values({
          userId,
          tenantId,
          forecastId,
          alertType: alertConfig.type || 'custom',
          severity: alertConfig.severity || 'medium',
          message: alertConfig.message,
          affectedArea: alertConfig.area || 'custom',
          alertData: alertConfig.data || {},
          status: 'active',
          createdAt: new Date(),
        })
        .returning();
    } catch (error) {
      console.error('Error creating custom alert:', error);
      throw error;
    }
  }

  /**
   * Resolve alert when conditions improve
   */
  async resolveAlert(alertId, userId, tenantId) {
    try {
      return await db
        .update(forecastAlerts)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(forecastAlerts.id, alertId),
            eq(forecastAlerts.userId, userId),
            eq(forecastAlerts.tenantId, tenantId)
          )
        )
        .returning();
    } catch (error) {
      console.error('Error resolving alert:', error);
      throw error;
    }
  }

  /**
   * Check if alert conditions are still valid
   */
  async validateAlertConditions(userId, tenantId, latestForecast) {
    const activeAlerts = await this.getActiveAlerts(userId, tenantId);

    for (const alert of activeAlerts.alerts) {
      let stillValid = true;

      // Re-validate condition
      switch (alert.alertType) {
        case 'critical_reserves_low':
          stillValid = latestForecast.endingBalance < 12500;
          break;
        case 'reserves_depleting':
          stillValid = latestForecast.endingBalance < 25000;
          break;
        case 'sustained_negative_flow':
          // Would need to recalculate from latest forecast
          stillValid = true; // Assume true unless otherwise determined
          break;
      }

      if (!stillValid) {
        await this.resolveAlert(alert.id, userId, tenantId);
      }
    }
  }
}

export const forecastAlertService = new ForecastAlertService();
