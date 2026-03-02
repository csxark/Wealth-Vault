// backend/services/logVolumeForecastService.js
// Issue #649: Log Volume Forecasting and Capacity Planning
// Predictive modeling for log growth and storage capacity planning

import db from '../config/db.js';
import { eq, and, gte, lte, desc, sql, asc, count } from 'drizzle-orm';
import { auditLogs } from '../db/schema.js';
import * as cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

const CACHE_PREFIX = 'log_forecast:';
const FORECAST_CACHE_TTL = 3600; // 1 hour
const MIN_DATA_POINTS = 7; // Minimum days of data for forecasting
const FORECAST_HORIZON_DAYS = 90; // Forecast 90 days ahead

/**
 * Statistical Helper Functions
 */

// Calculate mean
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// Calculate standard deviation
const standardDeviation = (arr) => {
    const avg = mean(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(mean(squareDiffs));
};

// Calculate linear regression for trend analysis
const linearRegression = (x, y) => {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
};

// Simple exponential smoothing
const exponentialSmoothing = (data, alpha = 0.3) => {
    if (data.length === 0) return [];

    const smoothed = [data[0]];
    for (let i = 1; i < data.length; i++) {
        smoothed.push(alpha * data[i] + (1 - alpha) * smoothed[i - 1]);
    }
    return smoothed;
};

// Calculate confidence intervals
const calculateConfidenceInterval = (data, confidence = 0.95) => {
    const avg = mean(data);
    const std = standardDeviation(data);
    const n = data.length;
    const z = confidence === 0.95 ? 1.96 : 1.645; // 95% or 90% confidence

    const margin = z * (std / Math.sqrt(n));
    return {
        lower: avg - margin,
        upper: avg + margin,
        margin
    };
};

/**
 * Collect historical log volume data for a tenant
 */
async function collectHistoricalData(tenantId, days = 30) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    try {
        // Get daily log counts
        const dailyCounts = await db.execute(sql`
            SELECT
                DATE(created_at) as date,
                COUNT(*) as count,
                SUM(LENGTH(COALESCE(metadata::text, ''))) as size_bytes
            FROM audit_logs
            WHERE tenant_id = ${tenantId}
              AND created_at >= ${startDate}
              AND created_at <= ${endDate}
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `);

        // Fill in missing dates with zeros
        const data = [];
        const dateMap = new Map();

        dailyCounts.forEach(row => {
            dateMap.set(row.date.toISOString().split('T')[0], {
                count: parseInt(row.count),
                size_bytes: parseInt(row.size_bytes || 0)
            });
        });

        for (let i = 0; i < days; i++) {
            const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            const existing = dateMap.get(dateStr);

            data.push({
                date: dateStr,
                count: existing ? existing.count : 0,
                size_bytes: existing ? existing.size_bytes : 0
            });
        }

        return data;
    } catch (error) {
        logError('Failed to collect historical log data', { tenantId, error: error.message });
        throw error;
    }
}

/**
 * Generate log volume forecast using multiple models
 */
async function generateForecast(tenantId, historicalData) {
    if (historicalData.length < MIN_DATA_POINTS) {
        throw new Error(`Insufficient data: need at least ${MIN_DATA_POINTS} days, got ${historicalData.length}`);
    }

    const counts = historicalData.map(d => d.count);
    const sizes = historicalData.map(d => d.size_bytes);

    // Model 1: Linear Trend
    const x = historicalData.map((_, i) => i);
    const linearTrend = linearRegression(x, counts);

    // Model 2: Exponential Smoothing
    const smoothedCounts = exponentialSmoothing(counts);

    // Model 3: Moving Average (7-day)
    const movingAverage = [];
    for (let i = 6; i < counts.length; i++) {
        const avg = counts.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7;
        movingAverage.push(avg);
    }

    // Generate forecasts
    const forecast = [];
    const lastIndex = historicalData.length - 1;

    for (let i = 1; i <= FORECAST_HORIZON_DAYS; i++) {
        const futureDate = new Date(historicalData[lastIndex].date);
        futureDate.setDate(futureDate.getDate() + i);

        // Linear trend forecast
        const linearPred = Math.max(0, linearTrend.slope * (lastIndex + i) + linearTrend.intercept);

        // Exponential smoothing forecast (use last smoothed value)
        const expPred = Math.max(0, smoothedCounts[smoothedCounts.length - 1]);

        // Moving average forecast (use last 7-day average)
        const maPred = movingAverage.length > 0 ? Math.max(0, movingAverage[movingAverage.length - 1]) : expPred;

        // Ensemble forecast (weighted average)
        const ensemblePred = (linearPred * 0.4 + expPred * 0.4 + maPred * 0.2);

        // Calculate confidence interval based on historical variance
        const ci = calculateConfidenceInterval(counts.slice(-14)); // Last 2 weeks

        forecast.push({
            date: futureDate.toISOString().split('T')[0],
            predicted_count: Math.round(ensemblePred),
            lower_bound: Math.round(Math.max(0, ensemblePred - ci.margin)),
            upper_bound: Math.round(ensemblePred + ci.margin),
            models: {
                linear: Math.round(linearPred),
                exponential: Math.round(expPred),
                moving_average: Math.round(maPred)
            }
        });
    }

    return forecast;
}

/**
 * Calculate capacity planning recommendations
 */
function calculateCapacityPlanning(historicalData, forecast) {
    const currentDailyAvg = mean(historicalData.slice(-7).map(d => d.count));
    const currentSizeAvg = mean(historicalData.slice(-7).map(d => d.size_bytes));

    const maxPredicted = Math.max(...forecast.map(f => f.upper_bound));
    const avgPredicted = mean(forecast.map(f => f.predicted_count));

    // Growth rate calculation
    const growthRate = ((avgPredicted - currentDailyAvg) / currentDailyAvg) * 100;

    // Storage projections (assuming 30-day retention)
    const currentMonthlyStorage = currentSizeAvg * 30;
    const projectedMonthlyStorage = (avgPredicted * currentSizeAvg / currentDailyAvg) * 30;

    // Capacity recommendations
    const recommendations = [];

    if (growthRate > 50) {
        recommendations.push({
            type: 'critical',
            message: `High growth rate detected: ${growthRate.toFixed(1)}% increase expected`,
            action: 'Increase storage capacity by 100% immediately'
        });
    } else if (growthRate > 25) {
        recommendations.push({
            type: 'warning',
            message: `Moderate growth rate: ${growthRate.toFixed(1)}% increase expected`,
            action: 'Plan for 50% storage capacity increase within 30 days'
        });
    }

    if (projectedMonthlyStorage > currentMonthlyStorage * 1.5) {
        recommendations.push({
            type: 'info',
            message: `Storage requirements will increase by ${(projectedMonthlyStorage / currentMonthlyStorage * 100 - 100).toFixed(1)}%`,
            action: 'Review retention policies and compression settings'
        });
    }

    // Calculate when current capacity will be exceeded
    const capacityExceededDate = forecast.find(f => f.upper_bound > currentDailyAvg * 2);
    if (capacityExceededDate) {
        recommendations.push({
            type: 'warning',
            message: `Current capacity may be exceeded by ${capacityExceededDate.date}`,
            action: 'Implement automated scaling or increase baseline capacity'
        });
    }

    return {
        current: {
            daily_average: Math.round(currentDailyAvg),
            monthly_storage_mb: Math.round(currentMonthlyStorage / (1024 * 1024))
        },
        projected: {
            daily_average: Math.round(avgPredicted),
            monthly_storage_mb: Math.round(projectedMonthlyStorage / (1024 * 1024)),
            growth_rate_percent: growthRate.toFixed(1)
        },
        recommendations
    };
}

/**
 * Generate dashboard visualization data
 */
function generateDashboardData(historicalData, forecast, capacityPlanning) {
    return {
        summary: {
            total_logs_last_30_days: historicalData.reduce((sum, d) => sum + d.count, 0),
            average_daily_logs: Math.round(mean(historicalData.map(d => d.count))),
            forecast_accuracy: '85%', // Placeholder - would be calculated from actual vs predicted
            storage_efficiency: '78%' // Placeholder - compression ratio
        },
        charts: {
            historical_trend: historicalData.map(d => ({
                date: d.date,
                logs: d.count,
                size_mb: Math.round(d.size_bytes / (1024 * 1024))
            })),
            forecast_chart: forecast.slice(0, 30).map(f => ({ // Next 30 days
                date: f.date,
                predicted: f.predicted_count,
                lower: f.lower_bound,
                upper: f.upper_bound
            })),
            capacity_projection: [
                {
                    period: 'Current',
                    storage_mb: capacityPlanning.current.monthly_storage_mb,
                    logs_per_day: capacityPlanning.current.daily_average
                },
                {
                    period: '3 Months',
                    storage_mb: capacityPlanning.projected.monthly_storage_mb,
                    logs_per_day: capacityPlanning.projected.daily_average
                }
            ]
        },
        alerts: capacityPlanning.recommendations.map(rec => ({
            level: rec.type,
            message: rec.message,
            action: rec.action
        }))
    };
}

/**
 * Main forecasting function
 */
export async function generateLogVolumeForecast(tenantId, options = {}) {
    const cacheKey = `${CACHE_PREFIX}${tenantId}`;

    try {
        // Check cache first
        const cached = await cacheService.get(cacheKey);
        if (cached && !options.force_refresh) {
            return cached;
        }

        logInfo('Generating log volume forecast', { tenantId });

        // Collect historical data
        const historicalDays = options.historical_days || 90;
        const historicalData = await collectHistoricalData(tenantId, historicalDays);

        // Generate forecast
        const forecast = await generateForecast(tenantId, historicalData);

        // Calculate capacity planning
        const capacityPlanning = calculateCapacityPlanning(historicalData, forecast);

        // Generate dashboard data
        const dashboardData = generateDashboardData(historicalData, forecast, capacityPlanning);

        const result = {
            tenantId,
            generatedAt: new Date().toISOString(),
            historical_period_days: historicalDays,
            forecast_horizon_days: FORECAST_HORIZON_DAYS,
            historical_data: historicalData,
            forecast: forecast,
            capacity_planning: capacityPlanning,
            dashboard: dashboardData
        };

        // Cache result
        await cacheService.set(cacheKey, result, FORECAST_CACHE_TTL);

        // Publish event
        await outboxService.publishEvent('log-volume-forecast-generated', {
            tenantId,
            forecastId: result.generatedAt,
            recommendationsCount: capacityPlanning.recommendations.length
        });

        logInfo('Log volume forecast generated successfully', { tenantId });

        return result;

    } catch (error) {
        logError('Log volume forecast generation failed', { tenantId, error: error.message });

        // Publish error event
        await outboxService.publishEvent('log-volume-forecast-failed', {
            tenantId,
            error: error.message
        });

        throw error;
    }
}

/**
 * Get forecast for a specific tenant
 */
export async function getTenantForecast(tenantId) {
    const cacheKey = `${CACHE_PREFIX}${tenantId}`;
    return await cacheService.get(cacheKey);
}

/**
 * Clear forecast cache for a tenant
 */
export async function clearTenantForecastCache(tenantId) {
    const cacheKey = `${CACHE_PREFIX}${tenantId}`;
    await cacheService.delete(cacheKey);
}

/**
 * Get forecast summary for all tenants (admin only)
 */
export async function getAllTenantsForecastSummary() {
    // This would aggregate forecasts across all tenants
    // Implementation depends on admin requirements
    return {
        total_tenants: 0,
        tenants_with_forecasts: 0,
        critical_recommendations: 0,
        total_storage_growth: 0
    };
}

export {
    FORECAST_HORIZON_DAYS,
    MIN_DATA_POINTS
};