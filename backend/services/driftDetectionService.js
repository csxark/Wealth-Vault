/**
 * ML Model Drift Detection Service
 * 
 * Monitors transaction categorization model performance and detects drift
 * Features:
 * - Confidence score tracking
 * - Accuracy monitoring over time
 * - Automatic drift detection
 * - Retraining trigger logic
 * - User feedback integration
 * 
 * Issue #610: Transaction Categorization ML Model Drift Detection
 */

import db from '../config/db.js';
import {
    categorizationPredictions,
    modelDriftMetrics,
    modelTrainingHistory,
    categorizationFeedback,
    driftDetectionConfig,
    driftAlerts,
    categories
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'drift:';
const CACHE_TTL = 1800; // 30 minutes
const CURRENT_MODEL_VERSION = '1.0.0';
const CURRENT_MODEL_TYPE = 'gemini';

/**
 * Record a categorization prediction
 */
export const recordPrediction = async (userId, tenantId, transactionData, prediction) => {
    try {
        const predictionRecord = await db.insert(categorizationPredictions).values({
            tenantId,
            userId,
            expenseId: transactionData.expenseId || null,
            description: transactionData.description,
            amount: transactionData.amount,
            predictedCategoryId: prediction.categoryId,
            predictedCategoryName: prediction.categoryName,
            confidenceScore: prediction.confidence || 0,
            topPredictions: prediction.alternatives || [],
           modelVersion: prediction.modelVersion || CURRENT_MODEL_VERSION,
            modelType: prediction.modelType || CURRENT_MODEL_TYPE,
            features: prediction.features || {},
            metadata: {
                processingTimeMs: prediction.processingTimeMs || 0,
                fallbackUsed: prediction.fallbackUsed || false,
                errorOccurred: false
            }
        }).returning();

        logger.debug(`Recorded prediction ${predictionRecord[0].id} with confidence ${prediction.confidence}`);

        return predictionRecord[0];

    } catch (error) {
        logger.error('Error recording prediction:', error);
        throw error;
    }
};

/**
 * Record user feedback/correction
 */
export const recordFeedback = async (userId, tenantId, predictionId, feedbackData) => {
    try {
        // Get the prediction
        const prediction = await db.query.categorizationPredictions.findFirst({
            where: and(
                eq(categorizationPredictions.id, predictionId),
                eq(categorizationPredictions.userId, userId),
                eq(categorizationPredictions.tenantId, tenantId)
            )
        });

        if (!prediction) {
            throw new Error('Prediction not found');
        }

        // Record feedback
        const feedback = await db.insert(categorizationFeedback).values({
            tenantId,
            userId,
            predictionId,
            feedbackType: feedbackData.type, // 'correction', 'confirmation', 'rejection'
            originalCategoryId: prediction.predictedCategoryId,
            correctedCategoryId: feedbackData.correctedCategoryId,
            userComment: feedbackData.comment,
            confidenceRating: feedbackData.confidenceRating
        }).returning();

        logger.info(`Recorded feedback for prediction ${predictionId}: ${feedbackData.type}`);

        // Trigger drift analysis if we have enough feedback
        await checkForDriftTrigger(tenantId, userId);

        return feedback[0];

    } catch (error) {
        logger.error('Error recording feedback:', error);
        throw error;
    }
};

/**
 * Calculate drift metrics for a time period
 */
export const calculateDriftMetrics = async (tenantId, userId = null, periodType = 'daily') => {
    try {
        const now = new Date();
        let periodStart, periodEnd;

        // Calculate period
        if (periodType === 'hourly') {
            periodStart = new Date(now);
            periodStart.setMinutes(0, 0, 0);
            periodStart.setHours(periodStart.getHours() - 1);
            periodEnd = new Date(periodStart);
            periodEnd.setHours(periodEnd.getHours() + 1);
        } else if (periodType === 'weekly') {
            periodStart = new Date(now);
            periodStart.setDate(periodStart.getDate() - 7);
            periodEnd = now;
        } else { // daily
            periodStart = new Date(now);
            periodStart.setDate(periodStart.getDate() - 1);
            periodEnd = now;
        }

        // Get predictions for this period with validation data
        const predictions = await db.query.categorizationPredictions.findMany({
            where: and(
                eq(categorizationPredictions.tenantId, tenantId),
                userId ? eq(categorizationPredictions.userId, userId) : sql`true`,
                gte(categorizationPredictions.createdAt, periodStart),
                lte(categorizationPredictions.createdAt, periodEnd),
                sql`${categorizationPredictions.wasCorrect} IS NOT NULL`
            )
        });

        if (predictions.length === 0) {
            logger.debug('No predictions with validation data for period');
            return null;
        }

        // Calculate metrics
        const totalPredictions = predictions.length;
        const correctPredictions = predictions.filter(p => p.wasCorrect).length;
        const incorrectPredictions = totalPredictions - correctPredictions;
        const userCorrectedCount = predictions.filter(p => p.userCorrected).length;

        const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

        // Confidence metrics
        const avgConfidenceScore = predictions.reduce((sum, p) => sum + (p.confidenceScore || 0), 0) / totalPredictions;
        const correctPreds = predictions.filter(p => p.wasCorrect);
        const incorrectPreds = predictions.filter(p => !p.wasCorrect);

        const avgConfidenceCorrect = correctPreds.length > 0
            ? correctPreds.reduce((sum, p) => sum + (p.confidenceScore || 0), 0) / correctPreds.length
            : 0;

        const avgConfidenceIncorrect = incorrectPreds.length > 0
            ? incorrectPreds.reduce((sum, p) => sum + (p.confidenceScore || 0), 0) / incorrectPreds.length
            : 0;

        // Confidence distribution
        const lowConfidenceCount = predictions.filter(p => p.confidenceScore < 0.5).length;
        const mediumConfidenceCount = predictions.filter(p => p.confidenceScore >= 0.5 && p.confidenceScore < 0.75).length;
        const highConfidenceCount = predictions.filter(p => p.confidenceScore >= 0.75).length;

        // Get baseline accuracy (last 30 days before this period)
        const baselineStart = new Date(periodStart);
        baselineStart.setDate(baselineStart.getDate() - 30);

        const baselineMetrics = await db.query.modelDriftMetrics.findFirst({
            where: and(
                eq(modelDriftMetrics.tenantId, tenantId),
                userId ? eq(modelDriftMetrics.userId, userId) : sql`true`,
                gte(modelDriftMetrics.periodStart, baselineStart),
                lte(modelDriftMetrics.periodEnd, periodStart)
            ),
            orderBy: [desc(modelDriftMetrics.createdAt)]
        });

        const baselineAccuracy = baselineMetrics?.accuracy || accuracy;
        const accuracyDrift = accuracy - baselineAccuracy;

        // Calculate drift score
        const confidenceVariance = predictions.reduce((sum, p) => {
            const diff = (p.confidenceScore || 0) - avgConfidenceScore;
            return sum + (diff * diff);
        }, 0) / totalPredictions;

        const userCorrectionRate = userCorrectedCount / totalPredictions;

        const driftScore = calculateDriftScore(
            accuracy,
            baselineAccuracy,
            confidenceVariance,
            userCorrectionRate
        );

        const driftSeverity = determineDriftSeverity(driftScore);

        // Category-specific performance
        const categoryPerformance = {};
        const categoryMap = new Map();

        predictions.forEach(p => {
            if (!p.predictedCategoryId) return;

            if (!categoryMap.has(p.predictedCategoryId)) {
                categoryMap.set(p.predictedCategoryId, {
                    total: 0,
                    correct: 0,
                    name: p.predictedCategoryName
                });
            }

            const catStats = categoryMap.get(p.predictedCategoryId);
            catStats.total++;
            if (p.wasCorrect) catStats.correct++;
        });

        categoryMap.forEach((stats, catId) => {
            categoryPerformance[catId] = {
                accuracy: stats.correct / stats.total,
                count: stats.total,
                name: stats.name
            };
        });

        // Find worst performing categories
        const worstCategories = Object.entries(categoryPerformance)
            .sort(([, a], [, b]) => a.accuracy - b.accuracy)
            .slice(0, 5)
            .map(([catId, stats]) => ({
                categoryId: catId,
                categoryName: stats.name,
                accuracy: stats.accuracy,
                count: stats.count
            }));

        // Store metrics
        const metrics = await db.insert(modelDriftMetrics).values({
            tenantId,
            userId,
            periodStart,
            periodEnd,
            periodType,
            modelVersion: CURRENT_MODEL_VERSION,
            modelType: CURRENT_MODEL_TYPE,
            totalPredictions,
            correctPredictions,
            incorrectPredictions,
            userCorrectedCount,
            accuracy,
            avgConfidenceScore,
            avgConfidenceCorrect,
            avgConfidenceIncorrect,
            lowConfidenceCount,
            mediumConfidenceCount,
            highConfidenceCount,
            driftScore,
            driftSeverity,
            baselineAccuracy,
            accuracyDrift,
            categoryPerformance,
            worstCategories,
            confidenceVariance,
            metadata: {
                dataQuality: totalPredictions >= 50 ? 'good' : 'insufficient',
                missingLabels: totalPredictions - predictions.filter(p => p.wasCorrect !== null).length
            }
        }).returning();

        logger.info(
            `Calculated drift metrics: accuracy=${(accuracy * 100).toFixed(1)}%, ` +
            `drift=${(driftScore * 100).toFixed(1)}%, severity=${driftSeverity}`
        );

        // Check if we should create an alert
        if (driftSeverity !== 'none') {
            await createDriftAlert(tenantId, userId, metrics[0]);
        }

        return metrics[0];

    } catch (error) {
        logger.error('Error calculating drift metrics:', error);
        throw error;
    }
};

/**
 * Calculate drift score using weighted formula
 */
const calculateDriftScore = (currentAccuracy, baselineAccuracy, confidenceVariance, userCorrectionRate) => {
    const accuracyDrift = Math.max(0, (baselineAccuracy - currentAccuracy) / Math.max(baselineAccuracy, 0.01));
    
    const driftScore =
        (0.5 * accuracyDrift) +
        (0.3 * Math.min(1.0, userCorrectionRate)) +
        (0.2 * Math.min(1.0, confidenceVariance));

    return driftScore;
};

/**
 * Determine drift severity from score
 */
const determineDriftSeverity = (driftScore) => {
    if (driftScore >= 0.40) return 'critical';
    if (driftScore >= 0.25) return 'high';
    if (driftScore >= 0.15) return 'medium';
    if (driftScore >= 0.05) return 'low';
    return 'none';
};

/**
 * Create drift alert
 */
const createDriftAlert = async (tenantId, userId, metrics) => {
    try {
        // Check if similar alert already exists
        const existingAlert = await db.query.driftAlerts.findFirst({
            where: and(
                eq(driftAlerts.tenantId, tenantId),
                eq(driftAlerts.isActive, true),
                eq(driftAlerts.isDismissed, false),
                eq(driftAlerts.modelVersion, metrics.modelVersion)
            )
        });

        if (existingAlert) {
            logger.debug('Drift alert already exists, skipping');
            return;
        }

        const alertType = metrics.driftSeverity === 'critical' ? 'retrain_recommended' : 'drift_detected';
        const actionRequired = metrics.driftScore >= 0.20 ? 'retrain' : 'review';

        const message = metrics.driftSeverity === 'critical'
            ? `Critical model drift detected! Accuracy dropped to ${(metrics.accuracy * 100).toFixed(1)}% (baseline: ${(metrics.baselineAccuracy * 100).toFixed(1)}%). Immediate retraining recommended.`
            : `Model drift detected (${metrics.driftSeverity}). Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%, Drift score: ${(metrics.driftScore * 100).toFixed(1)}%.`;

        const recommendation = actionRequired === 'retrain'
            ? 'Model retraining is recommended to improve accuracy. Review recent user corrections for training data.'
            : 'Monitor model performance. Consider retraining if accuracy continues to decline.';

        const alert = await db.insert(driftAlerts).values({
            tenantId,
            userId,
            alertType,
            severity: metrics.driftSeverity,
            currentAccuracy: metrics.accuracy,
            baselineAccuracy: metrics.baselineAccuracy,
            driftScore: metrics.driftScore,
            modelVersion: metrics.modelVersion,
            affectedCategories: metrics.worstCategories,
            message,
            recommendation,
            actionRequired
        }).returning();

        // Publish alert event
        await outboxService.publish({
            eventType: 'drift_alert.created',
            aggregateType: 'drift_alert',
            aggregateId: alert[0].id,
            payload: {
                tenantId,
                userId,
                severity: metrics.driftSeverity,
                message,
                actionRequired
            },
            tenantId
        });

        logger.warn(`Created drift alert: ${alertType}, severity: ${metrics.driftSeverity}`);

        return alert[0];

    } catch (error) {
        logger.error('Error creating drift alert:', error);
    }
};

/**
 * Check if drift analysis should be triggered
 */
const checkForDriftTrigger = async (tenantId, userId) => {
    try {
        // Get drift config
        const config = await getDriftConfig(tenantId);

        // Count recent predictions
        const recentCount = await db
            .select({ count: count() })
            .from(categorizationPredictions)
            .where(
                and(
                    eq(categorizationPredictions.tenantId, tenantId),
                    gte(categorizationPredictions.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
                )
            );

        if (recentCount[0].count >= config.minPredictionsForDrift) {
            // Trigger drift calculation
            await calculateDriftMetrics(tenantId, userId, 'daily');
        }

    } catch (error) {
        logger.error('Error checking drift trigger:', error);
    }
};

/**
 * Get or create drift detection config
 */
export const getDriftConfig = async (tenantId, userId = null) => {
    try {
        const cacheKey = `${CACHE_PREFIX}config:${tenantId}:${userId || 'default'}`;

        const cached = await cacheService.get(cacheKey);
        if (cached) return cached;

        let config = await db.query.driftDetectionConfig.findFirst({
            where: and(
                eq(driftDetectionConfig.tenantId, tenantId),
                userId ? eq(driftDetectionConfig.userId, userId) : sql`${driftDetectionConfig.userId} IS NULL`,
                eq(driftDetectionConfig.isActive, true)
            )
        });

        // Create default config if none exists
        if (!config) {
            const [newConfig] = await db.insert(driftDetectionConfig).values({
                tenantId,
                userId,
                driftThreshold: 0.15,
                retrainThreshold: 0.20,
                minPredictionsForDrift: 50,
                monitoringWindowDays: 7,
                comparisonBaselineDays: 30,
                autoRetrainEnabled: true,
                minTrainingDataSize: 100
            }).returning();

            config = newConfig;
        }

        await cacheService.set(cacheKey, config, CACHE_TTL);

        return config;

    } catch (error) {
        logger.error('Error getting drift config:', error);
        // Return defaults
        return {
            driftThreshold: 0.15,
            retrainThreshold: 0.20,
            minPredictionsForDrift: 50,
            autoRetrainEnabled: true
        };
    }
};

/**
 * Get drift alerts for a user
 */
export const getDriftAlerts = async (tenantId, userId = null) => {
    try {
        const alerts = await db.query.driftAlerts.findMany({
            where: and(
                eq(driftAlerts.tenantId, tenantId),
                userId ? eq(driftAlerts.userId, userId) : sql`true`,
                eq(driftAlerts.isActive, true),
                eq(driftAlerts.isDismissed, false)
            ),
            orderBy: [desc(driftAlerts.createdAt)]
        });

        return alerts;

    } catch (error) {
        logger.error('Error getting drift alerts:', error);
        throw error;
    }
};

/**
 * Dismiss a drift alert
 */
export const dismissDriftAlert = async (alertId, tenantId, userId) => {
    try {
        const alert = await db.update(driftAlerts)
            .set({
                isDismissed: true,
                dismissedAt: new Date(),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(driftAlerts.id, alertId),
                    eq(driftAlerts.tenantId, tenantId),
                    userId ? eq(driftAlerts.userId, userId) : sql`true`
                )
            )
            .returning();

        return alert[0];

    } catch (error) {
        logger.error('Error dismissing drift alert:', error);
        throw error;
    }
};

/**
 * Get model performance summary
 */
export const getModelPerformanceSummary = async (tenantId, userId = null, days = 30) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const metrics = await db.query.modelDriftMetrics.findMany({
            where: and(
                eq(modelDriftMetrics.tenantId, tenantId),
                userId ? eq(modelDriftMetrics.userId, userId) : sql`true`,
                gte(modelDriftMetrics.periodStart, startDate)
            ),
            orderBy: [desc(modelDriftMetrics.periodStart)]
        });

        if (metrics.length === 0) {
            return {
                avgAccuracy: null,
                avgDriftScore: null,
                totalPredictions: 0,
                userCorrections: 0,
                trend: 'stable'
            };
        }

        const totalPredictions = metrics.reduce((sum, m) => sum + m.totalPredictions, 0);
        const avgAccuracy = metrics.reduce((sum, m) => sum + m.accuracy, 0) / metrics.length;
        const avgDriftScore = metrics.reduce((sum, m) => sum + (m.driftScore || 0), 0) / metrics.length;
        const userCorrections = metrics.reduce((sum, m) => sum + m.userCorrectedCount, 0);

        // Detect trend
        const recentAccuracy = metrics.slice(0, Math.min(7, metrics.length)).reduce((sum, m) => sum + m.accuracy, 0) / Math.min(7, metrics.length);
        const olderAccuracy = metrics.slice(-Math.min(7, metrics.length)).reduce((sum, m) => sum + m.accuracy, 0) / Math.min(7, metrics.length);

        let trend = 'stable';
        if (recentAccuracy > olderAccuracy + 0.05) trend = 'improving';
        else if (recentAccuracy < olderAccuracy - 0.05) trend = 'declining';

        return {
            avgAccuracy,
            avgDriftScore,
            totalPredictions,
            userCorrections,
            trend,
            metrics: metrics.slice(0, 30) // Last 30 data points
        };

    } catch (error) {
        logger.error('Error getting model performance summary:', error);
        throw error;
    }
};

export default {
    recordPrediction,
    recordFeedback,
    calculateDriftMetrics,
    getDriftConfig,
    getDriftAlerts,
    dismissDriftAlert,
    getModelPerformanceSummary
};
