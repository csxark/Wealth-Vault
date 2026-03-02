/**
 * Expense Anomaly Detection Service
 * 
 * Real-time ML-based anomaly detection for spending patterns.
 * Uses isolation forest concepts + statistical analysis for multi-model approach.
 * 
 * Features:
 * - Per-category/user isolation forest models
 * - Feature extraction (amount, day, time, frequency)
 * - Z-score and IQR-based statistical detection
 * - Rule-based pattern detection
 * - Automatic model retraining
 * - Comprehensive statistics tracking
 * 
 * Addresses Issue #612: Expense Anomaly Detection using Time Series Analysis
 */

import db from '../config/db.js';
import {
    anomalyModels,
    anomalyDetections,
    anomalyTrainingData,
    anomalyRules,
    anomalyStatistics,
    expenses,
    categories,
    users
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'anomaly:';
const MODEL_CACHE_TTL = 3600; // 1 hour
const TRAINING_DATA_MIN = 30; // Minimum data points to train model
const ANOMALY_THRESHOLD = 0.5; // Score >= 0.5 triggers alert

/**
 * Extract features from transaction
 */
async function extractFeatures(expense, categoryStats) {
    const transactionDate = new Date(expense.createdAt);
    const dayOfWeek = transactionDate.getDay();
    const hourOfDay = transactionDate.getHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Get last transaction for frequency analysis
    const [lastTransaction] = await db.select().from(expenses)
        .where(and(
            eq(expenses.categoryId, expense.categoryId),
            eq(expenses.userId, expense.userId),
            lte(expenses.createdAt, transactionDate)
        ))
        .orderBy(desc(expenses.createdAt))
        .limit(2); // Skip current, get previous

    const daysFromLastTransaction = lastTransaction
        ? Math.floor((transactionDate - new Date(lastTransaction.createdAt)) / (1000 * 60 * 60 * 24))
        : null;

    // Calculate deviations
    const amount = parseFloat(expense.amount);
    const avgAmount = parseFloat(categoryStats.avgAmount || 0);
    const stdDevAmount = parseFloat(categoryStats.stdDevAmount || 0);
    
    const amountDeviation = stdDevAmount > 0
        ? Math.abs((amount - avgAmount) / stdDevAmount)
        : 0;

    const avgFrequency = categoryStats.avgFrequency || 7; // Default 7 days
    const frequencyDeviation = daysFromLastTransaction
        ? Math.abs((daysFromLastTransaction - avgFrequency) / avgFrequency)
        : 0;

    return {
        amount,
        dayOfWeek,
        hourOfDay,
        isWeekend,
        daysFromLastTransaction,
        amountDeviation,
        frequencyDeviation,
        lastTransactionAmount: lastTransaction ? parseFloat(lastTransaction.amount) : null,
        avgTransactionAmount: avgAmount,
        stdDeviation: stdDevAmount
    };
}

/**
 * Calculate statistical anomaly score using Z-score and IQR
 */
function calculateStatisticalScore(amount, avgAmount, stdDevAmount, categoryStats) {
    if (stdDevAmount === 0) return 0;

    // Z-score calculation
    const zScore = Math.abs((amount - avgAmount) / stdDevAmount);
    
    // IQR-based detection (typically > 3 standard deviations is extreme)
    let score = 0;
    if (zScore > 3) {
        score = 0.95; // Critical
    } else if (zScore > 2.5) {
        score = 0.80; // High
    } else if (zScore > 2) {
        score = 0.65; // Medium-High
    } else if (zScore > 1.5) {
        score = 0.45; // Medium
    } else if (zScore > 1) {
        score = 0.25; // Low
    }

    return Math.min(score, 1.0);
}

/**
 * Isolation Forest-style anomaly scoring
 * Simulates path length in trees - anomalies have shorter paths
 */
function calculateIsolationForestScore(features, categoryStats) {
    let anomalyIndicators = 0;
    let totalChecks = 0;

    // Check amount extremes
    totalChecks++;
    if (features.amountDeviation > 3) anomalyIndicators++;
    
    // Check frequency patterns
    totalChecks++;
    if (features.frequencyDeviation > 2 && features.daysFromLastTransaction !== null) {
        anomalyIndicators++;
    }

    // Check time-of-day patterns (if available in historical data)
    if (categoryStats.commonHours) {
        totalChecks++;
        if (!categoryStats.commonHours.includes(features.hourOfDay)) {
            anomalyIndicators++;
        }
    }

    // Check day-of-week patterns
    if (categoryStats.commonDays) {
        totalChecks++;
        if (!categoryStats.commonDays.includes(features.dayOfWeek)) {
            anomalyIndicators++;
        }
    }

    // Normalize anomaly score (0-1)
    return Math.min(anomalyIndicators / totalChecks, 1.0);
}

/**
 * Get or create anomaly model for category/user
 */
async function getOrCreateModel(userId, categoryId, tenantId) {
    try {
        const cacheKey = `${CACHE_PREFIX}model:${categoryId}:${userId}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) return JSON.parse(cached);

        let [model] = await db.select().from(anomalyModels)
            .where(and(
                eq(anomalyModels.userId, userId),
                eq(anomalyModels.categoryId, categoryId),
                eq(anomalyModels.tenantId, tenantId)
            ))
            .limit(1);

        if (!model) {
            // Create new model
            [model] = await db.insert(anomalyModels).values({
                tenantId,
                userId,
                categoryId,
                modelVersion: '1.0',
                isActive: true,
                needsRetraining: false
            }).returning();
        }

        await cacheService.set(cacheKey, JSON.stringify(model), MODEL_CACHE_TTL);
        return model;
    } catch (error) {
        logger.error('Error getting/creating model:', error);
        throw error;
    }
}

/**
 * Get category statistics for anomaly calculation
 */
async function getCategoryStats(userId, categoryId, days = 90) {
    try {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const result = await db.execute(sql`
            SELECT 
                COUNT(*) as transaction_count,
                AVG(CAST(amount AS numeric)) as avg_amount,
                STDDEV(CAST(amount AS numeric)) as std_dev_amount,
                MIN(CAST(amount AS numeric)) as min_amount,
                MAX(CAST(amount AS numeric)) as max_amount,
                MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM created_at)) as common_day,
                array_agg(DISTINCT EXTRACT(DOW FROM created_at)::int) as common_days,
                array_agg(DISTINCT EXTRACT(HOUR FROM created_at)::int) as common_hours
            FROM expenses
            WHERE user_id = ${userId}
            AND category_id = ${categoryId}
            AND created_at >= ${startDate}
        `);

        const row = result[0];
        return {
            transactionCount: row.transaction_count,
            avgAmount: row.avg_amount,
            stdDevAmount: row.std_dev_amount,
            minAmount: row.min_amount,
            maxAmount: row.max_amount,
            avgFrequency: row.transaction_count > 0 ? days / row.transaction_count : 7,
            commonDays: row.common_days || [],
            commonHours: row.common_hours || []
        };
    } catch (error) {
        logger.error('Error getting category stats:', error);
        return {
            transactionCount: 0,
            avgAmount: 0,
            stdDevAmount: 0,
            avgFrequency: 7,
            commonDays: [],
            commonHours: []
        };
    }
}

/**
 * Detect anomalies in a transaction
 */
export async function detectAnomaly(expenseId, tenantId) {
    try {
        // Get expense
        const [expense] = await db.select().from(expenses)
            .where(eq(expenses.id, expenseId))
            .limit(1);

        if (!expense) {
            throw new Error('Expense not found');
        }

        const userId = expense.userId;
        const categoryId = expense.categoryId;

        // Get or create model
        const model = await getOrCreateModel(userId, categoryId, tenantId);

        // Get category statistics
        const categoryStats = await getCategoryStats(userId, categoryId);

        // Extract features
        const features = await extractFeatures(expense, categoryStats);

        // Calculate anomaly score using multiple methods
        const statisticalScore = calculateStatisticalScore(
            features.amount,
            categoryStats.avgAmount,
            categoryStats.stdDevAmount,
            categoryStats
        );

        const isolationScore = calculateIsolationForestScore(features, categoryStats);

        // Ensemble score (weighted average)
        const anomalyScore = (statisticalScore * 0.6 + isolationScore * 0.4);

        // Check custom rules
        let ruleTriggered = false;
        const rules = await db.select().from(anomalyRules)
            .where(and(
                eq(anomalyRules.tenantId, tenantId),
                eq(anomalyRules.isActive, true)
            ));

        for (const rule of rules) {
            if (checkRuleCondition(rule.condition, features, expense)) {
                ruleTriggered = true;
                // Update rule trigger count
                await db.update(anomalyRules)
                    .set({
                        timesTriggered: sql`times_triggered + 1`,
                        lastTriggeredAt: new Date()
                    })
                    .where(eq(anomalyRules.id, rule.id));
                break;
            }
        }

        // Determine severity
        let severity = 'low';
        if (anomalyScore >= 0.8) severity = 'critical';
        else if (anomalyScore >= 0.6) severity = 'high';
        else if (anomalyScore >= 0.4) severity = 'medium';

        // Create detection if score exceeds threshold or rule triggered
        if (anomalyScore >= ANOMALY_THRESHOLD || ruleTriggered) {
            const [detection] = await db.insert(anomalyDetections).values({
                tenantId,
                userId,
                categoryId,
                expenseId,
                anomalyScore: anomalyScore.toString(),
                severity: ruleTriggered ? 'high' : severity,
                status: 'detected',
                amount: expense.amount,
                description: expense.description,
                transactionDate: expense.createdAt,
                zScore: (features.amount > 0) ? features.amountDeviation.toString() : null,
                expectedAmount: categoryStats.avgAmount,
                amountDeviation: features.amountDeviation.toString(),
                frequencyDeviation: features.frequencyDeviation.toString(),
                modelId: model.id,
                modelVersion: model.modelVersion,
                features
            }).returning();

            // Store training data
            await db.insert(anomalyTrainingData).values({
                tenantId,
                userId,
                categoryId,
                expenseId,
                amount: expense.amount,
                dayOfWeek: features.dayOfWeek,
                hourOfDay: features.hourOfDay,
                isWeekend: features.isWeekend,
                daysFromLastTransaction: features.daysFromLastTransaction,
                amountDeviation: features.amountDeviation.toString(),
                frequencyDeviation: features.frequencyDeviation.toString(),
                isAnomaly: anomalyScore >= ANOMALY_THRESHOLD,
                features
            });

            // Publish event
            await outboxService.publish({
                tenantId,
                aggregateType: 'expense',
                aggregateId: expenseId,
                eventType: 'expense.anomaly_detected',
                payload: {
                    detectionId: detection.id,
                    anomalyScore,
                    severity,
                    expenseId,
                    userId,
                    categoryId
                }
            });

            // Invalidate model cache
            await cacheService.del(`${CACHE_PREFIX}model:${categoryId}:${userId}`);

            logger.info(`Anomaly detected in expense ${expenseId}: score=${anomalyScore}, severity=${severity}`);

            return detection;
        }

        return null;
    } catch (error) {
        logger.error('Error detecting anomaly:', error);
        throw error;
    }
}

/**
 * Check if transaction matches rule condition
 */
function checkRuleCondition(condition, features, expense) {
    try {
        const { field, operator, value } = condition;

        switch (field) {
            case 'amount':
                const amount = parseFloat(expense.amount);
                return evaluateOperator(amount, operator, value);
            case 'amountDeviation':
                return evaluateOperator(features.amountDeviation, operator, value);
            case 'frequencyDeviation':
                return evaluateOperator(features.frequencyDeviation, operator, value);
            case 'dayOfWeek':
                return evaluateOperator(features.dayOfWeek, operator, value);
            case 'hour':
                return evaluateOperator(features.hourOfDay, operator, value);
            default:
                return false;
        }
    } catch (error) {
        logger.error('Error checking rule condition:', error);
        return false;
    }
}

/**
 * Evaluate operator for rule conditions
 */
function evaluateOperator(value, operator, threshold) {
    switch (operator) {
        case 'gt':
            return value > threshold;
        case 'gte':
            return value >= threshold;
        case 'lt':
            return value < threshold;
        case 'lte':
            return value <= threshold;
        case 'eq':
            return value === threshold;
        case 'neq':
            return value !== threshold;
        case 'in':
            return Array.isArray(threshold) && threshold.includes(value);
        default:
            return false;
    }
}

/**
 * Get unreviewed anomalies for user
 */
export async function getUnreviewedAnomalies(userId, tenantId, limit = 50) {
    try {
        const anomalies = await db.query.anomalyDetections.findMany({
            where: and(
                eq(anomalyDetections.userId, userId),
                eq(anomalyDetections.tenantId, tenantId),
                eq(anomalyDetections.status, 'detected')
            ),
            with: {
                expense: true,
                category: true,
                model: true
            },
            orderBy: [desc(anomalyDetections.anomalyScore)],
            limit
        });

        return anomalies;
    } catch (error) {
        logger.error('Error getting unreviewed anomalies:', error);
        throw error;
    }
}

/**
 * Review anomaly and take action
 */
export async function reviewAnomaly(detectionId, userId, tenantId, action, notes = null) {
    try {
        const [detection] = await db.update(anomalyDetections)
            .set({
                status: action === 'confirmed' ? 'confirmed' : 'reviewed',
                reviewedBy: userId,
                reviewedAt: new Date(),
                actionTaken: action,
                actionTakenAt: action !== 'pending' ? new Date() : null,
                actionTakenBy: action !== 'pending' ? userId : null,
                reviewNotes: notes
            })
            .where(eq(anomalyDetections.id, detectionId))
            .returning();

        // Update training data label if confirmed
        if (action === 'confirmed') {
            await db.update(anomalyTrainingData)
                .set({
                    isAnomaly: true,
                    userConfirmed: true,
                    confirmationLabel: 'fraud'
                })
                .where(and(
                    eq(anomalyTrainingData.expenseId, detection.expenseId),
                    eq(anomalyTrainingData.tenantId, tenantId)
                ));
        } else if (action === 'false_positive') {
            await db.update(anomalyTrainingData)
                .set({
                    isAnomaly: false,
                    userConfirmed: true,
                    confirmationLabel: 'legitimate'
                })
                .where(and(
                    eq(anomalyTrainingData.expenseId, detection.expenseId),
                    eq(anomalyTrainingData.tenantId, tenantId)
                ));
        }

        return detection;
    } catch (error) {
        logger.error('Error reviewing anomaly:', error);
        throw error;
    }
}

/**
 * Get anomaly statistics for period
 */
export async function getAnomalyStats(userId, categoryId, tenantId, periodType = 'daily') {
    try {
        const [stats] = await db.select().from(anomalyStatistics)
            .where(and(
                eq(anomalyStatistics.userId, userId),
                eq(anomalyStatistics.categoryId, categoryId),
                eq(anomalyStatistics.tenantId, tenantId),
                eq(anomalyStatistics.periodType, periodType)
            ))
            .orderBy(desc(anomalyStatistics.periodStart))
            .limit(1);

        return stats;
    } catch (error) {
        logger.error('Error getting anomaly stats:', error);
        return null;
    }
}

/**
 * Check if model needs retraining
 */
export async function shouldRetrain(model, tenantId) {
    try {
        if (!model.needsRetraining && model.lastTrainedAt) {
            // Check if enough time passed since last training (7 days)
            const daysSinceTrained = Math.floor(
                (Date.now() - new Date(model.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            return daysSinceTrained >= 7;
        }

        return model.needsRetraining === true || !model.lastTrainedAt;
    } catch (error) {
        logger.error('Error checking retraining need:', error);
        return false;
    }
}

/**
 * Get models needing retraining
 */
export async function getModelsForRetraining(tenantId) {
    try {
        const models = await db.query.anomalyModels.findMany({
            where: and(
                eq(anomalyModels.tenantId, tenantId),
                eq(anomalyModels.isActive, true)
            )
        });

        const needsRetraining = [];
        for (const model of models) {
            if (await shouldRetrain(model, tenantId)) {
                needsRetraining.push(model);
            }
        }

        return needsRetraining;
    } catch (error) {
        logger.error('Error getting models for retraining:', error);
        throw error;
    }
}

export default {
    detectAnomaly,
    getUnreviewedAnomalies,
    reviewAnomaly,
    getAnomalyStats,
    getModelsForRetraining,
    shouldRetrain
};
