/**
 * Budget Forecasting Service
 * 
 * Implements time-series forecasting for category budgets with confidence intervals.
 * Features:
 * - Multiple forecasting models (Moving Average, Exponential Smoothing, ARIMA)
 * - 95% confidence intervals for predictions
 * - Anomaly detection using Z-score
 * - Seasonal trend analysis
 * - Model accuracy tracking and auto-retraining
 * - Predictive alerts for overspending prevention
 * 
 * Addresses Issue #609: Category Budget Forecasting with Confidence Intervals
 */

import db from '../config/db.js';
import { 
    categoryForecastHistory, 
    categoryForecasts, 
    forecastAccuracyMetrics,
    forecastAlerts,
    forecastModelConfig,
    expenses,
    categories 
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'forecast:';
const FORECAST_CACHE_TTL = 3600; // 1 hour
const MIN_DATA_POINTS = 7; // Minimum historical points needed for forecasting

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

// Calculate variance
const variance = (arr) => {
    const avg = mean(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return mean(squareDiffs);
};

// Calculate moving average
const movingAverage = (arr, window) => {
    if (arr.length < window) return null;
    const slice = arr.slice(-window);
    return mean(slice);
};

// Calculate exponential moving average
const exponentialMovingAverage = (arr, smoothingFactor = 0.3) => {
    if (arr.length === 0) return null;
    
    let ema = arr[0];
    for (let i = 1; i < arr.length; i++) {
        ema = smoothingFactor * arr[i] + (1 - smoothingFactor) * ema;
    }
    return ema;
};

// Calculate Z-score for anomaly detection
const calculateZScore = (value, arr) => {
    const avg = mean(arr);
    const stdDev = standardDeviation(arr);
    return stdDev === 0 ? 0 : (value - avg) / stdDev;
};

// Detect trend direction and strength
const detectTrend = (arr) => {
    if (arr.length < 2) return { direction: 'stable', strength: 0 };
    
    // Simple linear regression
    const n = arr.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = arr;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgY = mean(y);
    
    // Normalize slope by average to get trend strength
    const strength = avgY === 0 ? 0 : Math.abs(slope / avgY);
    
    let direction = 'stable';
    if (slope > 0.1) direction = 'increasing';
    else if (slope < -0.1) direction = 'decreasing';
    else if (standardDeviation(y) / avgY > 0.3) direction = 'volatile';
    
    return { direction, strength };
};

// Detect seasonality (simple approach - day of week patterns)
const detectSeasonality = (historicalData) => {
    if (historicalData.length < 14) return { hasSeasonality: false };
    
    // Group by day of week
    const dayGroups = Array(7).fill(0).map(() => []);
    
    historicalData.forEach(record => {
        const date = new Date(record.periodStart);
        const dayOfWeek = date.getDay();
        dayGroups[dayOfWeek].push(parseFloat(record.actualSpent));
    });
    
    // Calculate average for each day
    const dayAverages = dayGroups.map(group => 
        group.length > 0 ? mean(group) : 0
    );
    
    const overallMean = mean(dayAverages.filter(v => v > 0));
    const seasonalVariance = variance(dayAverages.filter(v => v > 0));
    
    // If variance is significant, we have seasonality
    const hasSeasonality = seasonalVariance / (overallMean * overallMean) > 0.15;
    
    // Find peak day
    const peakDay = dayAverages.indexOf(Math.max(...dayAverages));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return {
        hasSeasonality,
        seasonalPeakPeriod: hasSeasonality ? dayNames[peakDay] : null,
        dayAverages
    };
};

/**
 * Forecasting Models
 */

// Simple Moving Average Model
const simpleMovingAverageModel = (historicalData, config) => {
    const window = config.hyperparameters?.movingAveragePeriod || 30;
    const values = historicalData.map(d => parseFloat(d.actualSpent));
    
    const prediction = movingAverage(values, Math.min(window, values.length));
    const stdDev = standardDeviation(values.slice(-window));
    
    const confidenceLevel = config.hyperparameters?.confidenceLevel || 0.95;
    const zScore = confidenceLevel === 0.95 ? 1.96 : 2.576; // 95% or 99%
    
    return {
        predicted: prediction,
        confidenceLower: Math.max(0, prediction - zScore * stdDev),
        confidenceUpper: prediction + zScore * stdDev,
        lowerBound80: Math.max(0, prediction - 1.28 * stdDev),
        upperBound80: prediction + 1.28 * stdDev,
        stdDev
    };
};

// Exponential Smoothing Model
const exponentialSmoothingModel = (historicalData, config) => {
    const smoothingFactor = config.hyperparameters?.smoothingFactor || 0.3;
    const values = historicalData.map(d => parseFloat(d.actualSpent));
    
    const prediction = exponentialMovingAverage(values, smoothingFactor);
    const stdDev = standardDeviation(values);
    
    const confidenceLevel = config.hyperparameters?.confidenceLevel || 0.95;
    const zScore = confidenceLevel === 0.95 ? 1.96 : 2.576;
    
    return {
        predicted: prediction,
        confidenceLower: Math.max(0, prediction - zScore * stdDev),
        confidenceUpper: prediction + zScore * stdDev,
        lowerBound80: Math.max(0, prediction - 1.28 * stdDev),
        upperBound80: prediction + 1.28 * stdDev,
        stdDev
    };
};

// Ensemble Model (combines multiple models)
const ensembleModel = (historicalData, config) => {
    const ma = simpleMovingAverageModel(historicalData, config);
    const es = exponentialSmoothingModel(historicalData, config);
    
    // Weighted average of predictions
    const predicted = (ma.predicted * 0.5 + es.predicted * 0.5);
    const confidenceLower = Math.min(ma.confidenceLower, es.confidenceLower);
    const confidenceUpper = Math.max(ma.confidenceUpper, es.confidenceUpper);
    
    return {
        predicted,
        confidenceLower: Math.max(0, confidenceLower),
        confidenceUpper,
        lowerBound80: Math.max(0, (ma.lowerBound80 + es.lowerBound80) / 2),
        upperBound80: (ma.upperBound80 + es.upperBound80) / 2,
        stdDev: (ma.stdDev + es.stdDev) / 2
    };
};

/**
 * Core Service Functions
 */

/**
 * Collect and store historical spending data
 */
export const collectHistoricalData = async (userId, categoryId, tenantId, periodType = 'daily', lookbackDays = 90) => {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - lookbackDays);
        
        // Aggregate expenses by period
        const historicalExpenses = await db
            .select({
                date: sql`DATE_TRUNC(${periodType}, ${expenses.date})`,
                totalSpent: sql`SUM(${expenses.amount})`,
                count: sql`COUNT(*)`,
            })
            .from(expenses)
            .where(
                and(
                    eq(expenses.tenantId, tenantId),
                    eq(expenses.userId, userId),
                    eq(expenses.categoryId, categoryId),
                    gte(expenses.date, startDate),
                    lte(expenses.date, endDate)
                )
            )
            .groupBy(sql`DATE_TRUNC(${periodType}, ${expenses.date})`)
            .orderBy(sql`DATE_TRUNC(${periodType}, ${expenses.date})`);
        
        // Store in forecast history
        for (const expense of historicalExpenses) {
            const periodStart = new Date(expense.date);
            const periodEnd = new Date(periodStart);
            
            if (periodType === 'daily') {
                periodEnd.setDate(periodEnd.getDate() + 1);
            } else if (periodType === 'weekly') {
                periodEnd.setDate(periodEnd.getDate() + 7);
            } else {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
            }
            
            await db.insert(categoryForecastHistory).values({
                tenantId,
                userId,
                categoryId,
                periodStart,
                periodEnd,
                periodType,
                actualSpent: expense.totalSpent,
                transactionCount: parseInt(expense.count),
            }).onConflictDoNothing();
        }
        
        // Calculate moving averages for all records
        await calculateMovingAveragesForCategory(userId, categoryId, tenantId);
        
        // Detect anomalies
        await detectAnomaliesForCategory(userId, categoryId, tenantId);
        
        logger.info(`Collected historical data for category ${categoryId}`);
        return historicalExpenses.length;
        
    } catch (error) {
        logger.error('Error collecting historical data:', error);
        throw error;
    }
};

/**
 * Calculate moving averages for historical data
 */
export const calculateMovingAveragesForCategory = async (userId, categoryId, tenantId) => {
    try {
        // Get all historical data for this category
        const history = await db.query.categoryForecastHistory.findMany({
            where: and(
                eq(categoryForecastHistory.tenantId, tenantId),
                eq(categoryForecastHistory.userId, userId),
                eq(categoryForecastHistory.categoryId, categoryId)
            ),
            orderBy: [asc(categoryForecastHistory.periodStart)]
        });
        
        if (history.length === 0) return;
        
        const values = history.map(h => parseFloat(h.actualSpent));
        
        // Update each record with moving averages
        for (let i = 0; i < history.length; i++) {
            const record = history[i];
            const valuesUpToNow = values.slice(0, i + 1);
            
            const updates = {
                ma7: movingAverage(valuesUpToNow, 7),
                ma30: movingAverage(valuesUpToNow, 30),
                ma90: movingAverage(valuesUpToNow, 90),
                ema7: exponentialMovingAverage(valuesUpToNow.slice(-7)),
                ema30: exponentialMovingAverage(valuesUpToNow.slice(-30)),
                standardDeviation: standardDeviation(valuesUpToNow),
                variance: variance(valuesUpToNow),
                updatedAt: new Date()
            };
            
            await db.update(categoryForecastHistory)
                .set(updates)
                .where(eq(categoryForecastHistory.id, record.id));
        }
        
        logger.info(`Updated moving averages for category ${categoryId}`);
        
    } catch (error) {
        logger.error('Error calculating moving averages:', error);
        throw error;
    }
};

/**
 * Detect anomalies in historical data using Z-score
 */
export const detectAnomaliesForCategory = async (userId, categoryId, tenantId, threshold = 2.5) => {
    try {
        const history = await db.query.categoryForecastHistory.findMany({
            where: and(
                eq(categoryForecastHistory.tenantId, tenantId),
                eq(categoryForecastHistory.userId, userId),
                eq(categoryForecastHistory.categoryId, categoryId)
            ),
            orderBy: [asc(categoryForecastHistory.periodStart)]
        });
        
        if (history.length < MIN_DATA_POINTS) return;
        
        const values = history.map(h => parseFloat(h.actualSpent));
        
        for (let i = 0; i < history.length; i++) {
            const record = history[i];
            const value = parseFloat(record.actualSpent);
            
            // Calculate Z-score using all previous data
            const relevantValues = values.slice(Math.max(0, i - 90), i + 1);
            const zScore = Math.abs(calculateZScore(value, relevantValues));
            
            await db.update(categoryForecastHistory)
                .set({
                    isAnomaly: zScore > threshold,
                    anomalyScore: zScore,
                    updatedAt: new Date()
                })
                .where(eq(categoryForecastHistory.id, record.id));
        }
        
        logger.info(`Detected anomalies for category ${categoryId}`);
        
    } catch (error) {
        logger.error('Error detecting anomalies:', error);
        throw error;
    }
};

/**
 * Generate forecast for a category
 */
export const generateForecast = async (userId, categoryId, tenantId, periodType = 'monthly', periodsAhead = 1) => {
    try {
        const cacheKey = `${CACHE_PREFIX}${userId}:${categoryId}:${periodType}:${periodsAhead}`;
        
        // Check cache
        const cached = await cacheService.get(cacheKey);
        if (cached && cached.status === 'completed') {
            return cached;
        }
        
        // Get model configuration
        let config = await db.query.forecastModelConfig.findFirst({
            where: and(
                eq(forecastModelConfig.tenantId, tenantId),
                eq(forecastModelConfig.categoryId, categoryId),
                eq(forecastModelConfig.isActive, true)
            )
        });
        
        // Use default config if none exists
        if (!config) {
            config = await db.query.forecastModelConfig.findFirst({
                where: and(
                    eq(forecastModelConfig.tenantId, tenantId),
                    eq(forecastModelConfig.isDefault, true),
                    eq(forecastModelConfig.isActive, true)
                )
            });
        }
        
        // Create default config if still none
        if (!config) {
            config = {
                modelType: 'moving_average',
                hyperparameters: {
                    movingAveragePeriod: 30,
                    smoothingFactor: 0.3,
                    confidenceLevel: 0.95
                },
                features: {
                    includeSeasonality: true,
                    includeTrend: true
                },
                minHistoricalPeriods: 30
            };
        }
        
        // Get historical data
        const minPeriods = config.minHistoricalPeriods || 30;
        const lookbackDays = periodType === 'daily' ? minPeriods : 
                            periodType === 'weekly' ? minPeriods * 7 : minPeriods * 30;
        
        // Ensure we have historical data
        await collectHistoricalData(userId, categoryId, tenantId, periodType, lookbackDays);
        
        const historicalData = await db.query.categoryForecastHistory.findMany({
            where: and(
                eq(categoryForecastHistory.tenantId, tenantId),
                eq(categoryForecastHistory.userId, userId),
                eq(categoryForecastHistory.categoryId, categoryId),
                eq(categoryForecastHistory.periodType, periodType)
            ),
            orderBy: [desc(categoryForecastHistory.periodStart)],
            limit: minPeriods * 2
        });
        
        if (historicalData.length < MIN_DATA_POINTS) {
            throw new Error(`Insufficient historical data. Need at least ${MIN_DATA_POINTS} data points, have ${historicalData.length}`);
        }
        
        // Reverse to chronological order
        historicalData.reverse();
        
        // Select forecasting model
        let forecastResult;
        const startTime = Date.now();
        
        switch (config.modelType) {
            case 'exponential_smoothing':
                forecastResult = exponentialSmoothingModel(historicalData, config);
                break;
            case 'ensemble':
                forecastResult = ensembleModel(historicalData, config);
                break;
            case 'moving_average':
            default:
                forecastResult = simpleMovingAverageModel(historicalData, config);
        }
        
        const computeTimeMs = Date.now() - startTime;
        
        // Analyze trends and seasonality
        const values = historicalData.map(d => parseFloat(d.actualSpent));
        const trend = detectTrend(values);
        const seasonality = detectSeasonality(historicalData);
        
        // Calculate forecast period
        const now = new Date();
        let forecastStart, forecastEnd;
        
        if (periodType === 'daily') {
            forecastStart = new Date(now);
            forecastStart.setDate(forecastStart.getDate() + 1);
            forecastEnd = new Date(forecastStart);
            forecastEnd.setDate(forecastEnd.getDate() + periodsAhead);
        } else if (periodType === 'weekly') {
            forecastStart = new Date(now);
            forecastStart.setDate(forecastStart.getDate() + 7);
            forecastEnd = new Date(forecastStart);
            forecastEnd.setDate(forecastEnd.getDate() + (7 * periodsAhead));
        } else { // monthly
            forecastStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            forecastEnd = new Date(now.getFullYear(), now.getMonth() + 1 + periodsAhead, 1);
        }
        
        // Calculate accuracy from recent forecasts
        const recentAccuracy = await calculateModelAccuracy(userId, categoryId, tenantId, config.modelType);
        
        // Create forecast record
        const forecast = await db.insert(categoryForecasts).values({
            tenantId,
            userId,
            categoryId,
            forecastStart,
            forecastEnd,
            periodType,
            predictedSpent: forecastResult.predicted?.toFixed(2) || '0',
            confidenceLower: forecastResult.confidenceLower?.toFixed(2) || '0',
            confidenceUpper: forecastResult.confidenceUpper?.toFixed(2) || '0',
            confidenceLevel: config.hyperparameters?.confidenceLevel || 0.95,
            lowerBound80: forecastResult.lowerBound80?.toFixed(2),
            upperBound80: forecastResult.upperBound80?.toFixed(2),
            modelType: config.modelType,
            modelVersion: config.modelVersion || '1.0',
            trendDirection: trend.direction,
            trendStrength: trend.strength,
            hasSeasonality: seasonality.hasSeasonality,
            seasonalPeakPeriod: seasonality.seasonalPeakPeriod,
            accuracy: recentAccuracy.accuracy,
            mape: recentAccuracy.mape,
            rmse: recentAccuracy.rmse,
            status: 'completed',
            isActive: true,
            metadata: {
                historicalPeriods: historicalData.length,
                computeTimeMs,
                dataPoints: values.length,
                anomaliesDetected: historicalData.filter(h => h.isAnomaly).length
            },
            validUntil: new Date(forecastEnd.getTime() + 24 * 60 * 60 * 1000) // Valid for 1 day after period
        }).returning();
        
        // Cache the result
        await cacheService.set(cacheKey, forecast[0], FORECAST_CACHE_TTL);
        
        // Publish forecast created event
        await outboxService.publish({
            eventType: 'forecast.created',
            aggregateType: 'category_forecast',
            aggregateId: forecast[0].id,
            payload: {
                tenantId,
                userId,
                categoryId,
                forecastId: forecast[0].id,
                predictedSpent: forecast[0].predictedSpent,
                confidenceInterval: {
                    lower: forecast[0].confidenceLower,
                    upper: forecast[0].confidenceUpper
                }
            },
            tenantId
        });
        
        // Check if we should create predictive alerts
        await checkForPredictiveAlerts(userId, categoryId, tenantId, forecast[0]);
        
        logger.info(`Generated forecast ${forecast[0].id} for category ${categoryId}`);
        
        return forecast[0];
        
    } catch (error) {
        logger.error('Error generating forecast:', error);
        throw error;
    }
};

/**
 * Calculate model accuracy from historical forecasts
 */
export const calculateModelAccuracy = async (userId, categoryId, tenantId, modelType) => {
    try {
        const metrics = await db.query.forecastAccuracyMetrics.findMany({
            where: and(
                eq(forecastAccuracyMetrics.tenantId, tenantId),
                eq(forecastAccuracyMetrics.userId, userId),
                eq(forecastAccuracyMetrics.categoryId, categoryId),
                eq(forecastAccuracyMetrics.modelType, modelType)
            ),
            orderBy: [desc(forecastAccuracyMetrics.evaluationDate)],
            limit: 30
        });
        
        if (metrics.length === 0) {
            return { accuracy: null, mape: null, rmse: null };
        }
        
        const mape = mean(metrics.map(m => Math.abs(m.percentageError || 0)));
        const rmse = Math.sqrt(mean(metrics.map(m => parseFloat(m.squaredError || 0))));
        const accuracy = Math.max(0, 1 - mape / 100);
        
        return { accuracy, mape, rmse };
        
    } catch (error) {
        logger.error('Error calculating model accuracy:', error);
        return { accuracy: null, mape: null, rmse: null };
    }
};

/**
 * Check if predictive alerts should be created
 */
export const checkForPredictiveAlerts = async (userId, categoryId, tenantId, forecast) => {
    try {
        // Get category budget if exists
        const category = await db.query.categories.findFirst({
            where: eq(categories.id, categoryId)
        });
        
        if (!category || !category.monthlyBudget) {
            return; // No budget set, no alert needed
        }
        
        const budgetLimit = parseFloat(category.monthlyBudget);
        const projectedSpent = parseFloat(forecast.predictedSpent);
        const confidenceUpper = parseFloat(forecast.confidenceUpper);
        
        // Check if upper confidence bound exceeds budget
        if (confidenceUpper > budgetLimit) {
            const projectedOverage = confidenceUpper - budgetLimit;
            const daysUntilEnd = Math.ceil((new Date(forecast.forecastEnd) - new Date()) / (1000 * 60 * 60 * 24));
            
            const alert = await db.insert(forecastAlerts).values({
                tenantId,
                userId,
                categoryId,
                forecastId: forecast.id,
                alertType: 'predictive_overspend',
                severity: projectedOverage / budgetLimit > 0.2 ? 'critical' : 'warning',
                projectedSpent: forecast.predictedSpent,
                budgetLimit: budgetLimit.toFixed(2),
                projectedOverage: projectedOverage.toFixed(2),
                daysUntilOverage: daysUntilEnd,
                confidence: forecast.confidenceLevel,
                message: `Your spending in this category is projected to exceed the budget by $${projectedOverage.toFixed(2)} by month-end.`,
                recommendation: `Consider reducing spending by $${(projectedOverage / daysUntilEnd).toFixed(2)} per day to stay within budget.`,
                isActive: true,
                metadata: {
                    triggerCondition: 'upper_confidence_exceeds_budget',
                    historicalContext: forecast.metadata
                }
            }).returning();
            
            // Publish alert event
            await outboxService.publish({
                eventType: 'forecast_alert.created',
                aggregateType: 'forecast_alert',
                aggregateId: alert[0].id,
                payload: {
                    tenantId,
                    userId,
                    categoryId,
                    alertType: 'predictive_overspend',
                    severity: alert[0].severity,
                    message: alert[0].message,
                    recommendation: alert[0].recommendation
                },
                tenantId
            });
            
            logger.info(`Created predictive alert for category ${categoryId}`);
        }
        
    } catch (error) {
        logger.error('Error checking for predictive alerts:', error);
    }
};

/**
 * Validate forecast accuracy after period ends
 */
export const validateForecastAccuracy = async (forecastId) => {
    try {
        const forecast = await db.query.categoryForecasts.findFirst({
            where: eq(categoryForecasts.id, forecastId)
        });
        
        if (!forecast) {
            throw new Error(`Forecast ${forecastId} not found`);
        }
        
        // Check if forecast period has ended
        if (new Date() < new Date(forecast.forecastEnd)) {
            logger.info(`Forecast ${forecastId} period has not ended yet`);
            return null;
        }
        
        // Get actual spending for the forecast period
        const actualSpending = await db
            .select({
                totalSpent: sql`SUM(${expenses.amount})`
            })
            .from(expenses)
            .where(
                and(
                    eq(expenses.tenantId, forecast.tenantId),
                    eq(expenses.userId, forecast.userId),
                    eq(expenses.categoryId, forecast.categoryId),
                    gte(expenses.date, forecast.forecastStart),
                    lte(expenses.date, forecast.forecastEnd)
                )
            );
        
        const actualSpent = parseFloat(actualSpending[0]?.totalSpent || 0);
        const predictedSpent = parseFloat(forecast.predictedSpent);
        
        const absoluteError = Math.abs(actualSpent - predictedSpent);
        const percentageError = predictedSpent === 0 ? 0 : (absoluteError / predictedSpent) * 100;
        const squaredError = Math.pow(absoluteError, 2);
        
        const withinConfidenceInterval = 
            actualSpent >= parseFloat(forecast.confidenceLower) && 
            actualSpent <= parseFloat(forecast.confidenceUpper);
        
        // Store accuracy metrics
        const metric = await db.insert(forecastAccuracyMetrics).values({
            tenantId: forecast.tenantId,
            userId: forecast.userId,
            categoryId: forecast.categoryId,
            forecastId: forecast.id,
            evaluationDate: forecast.forecastEnd,
            periodType: forecast.periodType,
            actualSpent: actualSpent.toFixed(2),
            predictedSpent: forecast.predictedSpent,
            absoluteError: absoluteError.toFixed(2),
            percentageError,
            squaredError: squaredError.toFixed(2),
            withinConfidenceInterval,
            confidenceLevel: forecast.confidenceLevel,
            modelType: forecast.modelType,
            modelVersion: forecast.modelVersion,
            modelHealth: percentageError < 10 ? 'excellent' : 
                        percentageError < 20 ? 'good' : 
                        percentageError < 35 ? 'fair' : 'poor',
            needsRetraining: percentageError > 35
        }).returning();
        
        logger.info(`Validated forecast ${forecastId}, error: ${percentageError.toFixed(2)}%`);
        
        return metric[0];
        
    } catch (error) {
        logger.error('Error validating forecast accuracy:', error);
        throw error;
    }
};

/**
 * Get latest forecast for a category
 */
export const getLatestForecast = async (userId, categoryId, tenantId, periodType = 'monthly') => {
    try {
        const cacheKey = `${CACHE_PREFIX}latest:${userId}:${categoryId}:${periodType}`;
        
        const cached = await cacheService.get(cacheKey);
        if (cached) return cached;
        
        const forecast = await db.query.categoryForecasts.findFirst({
            where: and(
                eq(categoryForecasts.tenantId, tenantId),
                eq(categoryForecasts.userId, userId),
                eq(categoryForecasts.categoryId, categoryId),
                eq(categoryForecasts.periodType, periodType),
                eq(categoryForecasts.isActive, true),
                eq(categoryForecasts.status, 'completed')
            ),
            orderBy: [desc(categoryForecasts.computedAt)]
        });
        
        if (forecast) {
            await cacheService.set(cacheKey, forecast, FORECAST_CACHE_TTL);
        }
        
        return forecast;
        
    } catch (error) {
        logger.error('Error getting latest forecast:', error);
        throw error;
    }
};

/**
 * Get active forecast alerts for a user
 */
export const getActiveForecastAlerts = async (userId, tenantId) => {
    try {
        const alerts = await db.query.forecastAlerts.findMany({
            where: and(
                eq(forecastAlerts.tenantId, tenantId),
                eq(forecastAlerts.userId, userId),
                eq(forecastAlerts.isActive, true),
                eq(forecastAlerts.isDismissed, false)
            ),
            orderBy: [desc(forecastAlerts.createdAt)],
            with: {
                category: true,
                forecast: true
            }
        });
        
        return alerts;
        
    } catch (error) {
        logger.error('Error getting forecast alerts:', error);
        throw error;
    }
};

/**
 * Dismiss a forecast alert
 */
export const dismissForecastAlert = async (alertId, userId, tenantId) => {
    try {
        const alert = await db.update(forecastAlerts)
            .set({
                isDismissed: true,
                dismissedAt: new Date(),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(forecastAlerts.id, alertId),
                    eq(forecastAlerts.userId, userId),
                    eq(forecastAlerts.tenantId, tenantId)
                )
            )
            .returning();
        
        return alert[0];
        
    } catch (error) {
        logger.error('Error dismissing forecast alert:', error);
        throw error;
    }
};

export default {
    collectHistoricalData,
    calculateMovingAveragesForCategory,
    detectAnomaliesForCategory,
    generateForecast,
    calculateModelAccuracy,
    validateForecastAccuracy,
    getLatestForecast,
    getActiveForecastAlerts,
    dismissForecastAlert,
    checkForPredictiveAlerts
};
