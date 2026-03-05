/**
 * Anomaly Scoring Engine
 *
 * Uses machine learning and statistical methods to calculate anomaly scores for audit logs.
 * Combines multiple scoring algorithms to provide comprehensive anomaly detection.
 */

import { db } from '../config/db.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class AnomalyScoringEngine {
    constructor() {
        this.models = new Map(); // tenantId -> ML model
        this.featureExtractors = new Map(); // tenantId -> feature extractor
        this.scoringAlgorithms = {
            isolationForest: this.isolationForestScore.bind(this),
            localOutlierFactor: this.localOutlierFactorScore.bind(this),
            statistical: this.statisticalScore.bind(this),
            ensemble: this.ensembleScore.bind(this)
        };
    }

    /**
     * Initialize the scoring engine
     */
    async initialize() {
        try {
            logInfo('Initializing Anomaly Scoring Engine...');

            // Initialize feature extractors for different tenants
            await this.initializeFeatureExtractors();

            // Load or train ML models
            await this.initializeModels();

            logInfo('Anomaly Scoring Engine initialized successfully');
        } catch (error) {
            logError('Failed to initialize scoring engine:', error);
            throw error;
        }
    }

    /**
     * Initialize feature extractors
     */
    async initializeFeatureExtractors() {
        // Feature extractors will be tenant-specific
        this.featureExtractors.set('global', this.createGlobalFeatureExtractor());
    }

    /**
     * Create global feature extractor
     */
    createGlobalFeatureExtractor() {
        return {
            extractFeatures: (log, baselines, historicalLogs = []) => {
                const features = {};

                // Time-based features
                const logTime = new Date(log.createdAt);
                features.hourOfDay = logTime.getHours() / 24;
                features.dayOfWeek = logTime.getDay() / 7;
                features.isWeekend = logTime.getDay() === 0 || logTime.getDay() === 6 ? 1 : 0;

                // Action frequency features
                const actionFreq = baselines.actionFrequency?.percentages?.[log.action] || 0;
                features.actionFrequency = actionFreq;
                features.actionRarity = 1 - actionFreq;

                // User activity features
                const userActivity = baselines.userActivity?.[log.actorUserId];
                features.userTotalActions = userActivity?.totalActions || 0;
                features.userAvgActionsPerDay = userActivity?.avgActionsPerDay || 0;

                // IP-based features
                const ipPattern = baselines.ipPatterns?.[log.ipAddress];
                features.ipTotalRequests = ipPattern?.totalRequests || 0;
                features.ipIsKnown = ipPattern ? 1 : 0;

                // Session-based features
                features.sessionActions = this.calculateSessionFeatures(log, historicalLogs);

                // Velocity features (actions in last N minutes)
                features.velocity5Min = this.calculateVelocity(log, historicalLogs, 5 * 60 * 1000);
                features.velocity1Hour = this.calculateVelocity(log, historicalLogs, 60 * 60 * 1000);
                features.velocity24Hours = this.calculateVelocity(log, historicalLogs, 24 * 60 * 60 * 1000);

                // Geographic features (if available)
                features.geoAnomaly = this.calculateGeoAnomaly(log, baselines);

                // Metadata features
                features.metadataComplexity = this.calculateMetadataComplexity(log.metadata);

                return features;
            }
        };
    }

    /**
     * Calculate session-based features
     */
    calculateSessionFeatures(log, historicalLogs) {
        // Simplified session detection - in real implementation would use session IDs
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes
        const logTime = new Date(log.createdAt);

        let sessionActions = 1; // Current log
        for (const hLog of historicalLogs) {
            const hTime = new Date(hLog.createdAt);
            if (Math.abs(logTime - hTime) < sessionTimeout && hLog.actorUserId === log.actorUserId) {
                sessionActions++;
            }
        }

        return sessionActions;
    }

    /**
     * Calculate velocity features
     */
    calculateVelocity(log, historicalLogs, timeWindow) {
        const logTime = new Date(log.createdAt);
        const windowStart = logTime.getTime() - timeWindow;

        let velocity = 0;
        for (const hLog of historicalLogs) {
            const hTime = new Date(hLog.createdAt).getTime();
            if (hTime >= windowStart && hTime <= logTime.getTime() &&
                hLog.actorUserId === log.actorUserId) {
                velocity++;
            }
        }

        return velocity;
    }

    /**
     * Calculate geographic anomaly score
     */
    calculateGeoAnomaly(log, baselines) {
        // Simplified - would use IP geolocation in real implementation
        const ip = log.ipAddress;
        if (!ip) return 0.5; // Unknown

        const ipPattern = baselines.ipPatterns?.[ip];
        return ipPattern ? 0 : 1; // 1 if unknown IP, 0 if known
    }

    /**
     * Calculate metadata complexity
     */
    calculateMetadataComplexity(metadata) {
        if (!metadata) return 0;

        try {
            const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            return Object.keys(meta).length / 10; // Normalize to 0-1 scale
        } catch {
            return 0.5; // Parsing error
        }
    }

    /**
     * Initialize ML models
     */
    async initializeModels() {
        // For now, we'll use statistical models
        // In a real implementation, this would load trained ML models
        this.models.set('global', {
            type: 'ensemble',
            trained: true,
            lastTrained: new Date()
        });
    }

    /**
     * Calculate anomaly scores for logs
     */
    async calculateScores(tenantId, logs, baselines, triggeredRules) {
        const scores = [];
        const key = tenantId || 'global';

        // Get feature extractor
        const featureExtractor = this.featureExtractors.get(key) || this.featureExtractors.get('global');

        // Get historical logs for context (last 100 logs for this tenant)
        const historicalLogs = await this.getHistoricalLogs(tenantId, 100);

        for (const log of logs) {
            try {
                // Extract features
                const features = featureExtractor.extractFeatures(log, baselines, historicalLogs);

                // Calculate scores using different algorithms
                const algorithmScores = {};

                for (const [algorithmName, algorithm] of Object.entries(this.scoringAlgorithms)) {
                    try {
                        algorithmScores[algorithmName] = await algorithm(log, features, baselines, historicalLogs);
                    } catch (error) {
                        logError(`Error calculating ${algorithmName} score for log ${log.id}:`, error);
                        algorithmScores[algorithmName] = 0.5; // Neutral score on error
                    }
                }

                // Combine scores using ensemble method
                const finalScore = this.combineScores(algorithmScores);

                // Calculate confidence based on agreement between algorithms
                const confidence = this.calculateConfidence(algorithmScores);

                // Check if any rules were triggered for this log
                const triggeredForLog = triggeredRules.filter(r => r.logId === log.id);

                scores.push({
                    logId: log.id,
                    score: finalScore,
                    confidence,
                    algorithmScores,
                    features,
                    triggeredRules: triggeredForLog.length,
                    severity: this.calculateSeverity(finalScore, triggeredForLog)
                });

            } catch (error) {
                logError(`Error calculating score for log ${log.id}:`, error);
                // Provide neutral score on error
                scores.push({
                    logId: log.id,
                    score: 0.5,
                    confidence: 0.5,
                    algorithmScores: {},
                    features: {},
                    triggeredRules: 0,
                    severity: 'low'
                });
            }
        }

        return scores;
    }

    /**
     * Isolation Forest scoring algorithm
     */
    async isolationForestScore(log, features, baselines, historicalLogs) {
        // Simplified isolation forest implementation
        // In real implementation, would use a trained isolation forest model

        const featureValues = Object.values(features);
        const mean = featureValues.reduce((sum, val) => sum + val, 0) / featureValues.length;
        const variance = featureValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / featureValues.length;
        const stdDev = Math.sqrt(variance);

        // Calculate z-scores for each feature
        const zScores = featureValues.map(val => Math.abs(val - mean) / (stdDev || 1));

        // Anomaly score based on maximum z-score
        const maxZScore = Math.max(...zScores);
        return Math.min(maxZScore / 3, 1); // Normalize to 0-1
    }

    /**
     * Local Outlier Factor scoring algorithm
     */
    async localOutlierFactorScore(log, features, baselines, historicalLogs) {
        // Simplified LOF implementation
        // Calculate distance to k-nearest neighbors in feature space

        const k = 5;
        const distances = [];

        for (const hLog of historicalLogs.slice(0, 50)) { // Limit for performance
            const hFeatures = this.featureExtractors.get('global').extractFeatures(hLog, baselines, []);
            const distance = this.euclideanDistance(features, hFeatures);
            distances.push(distance);
        }

        if (distances.length === 0) return 0.5;

        distances.sort((a, b) => a - b);
        const kDistance = distances[Math.min(k - 1, distances.length - 1)];

        // LOF score (simplified)
        const avgKDistance = distances.slice(0, k).reduce((sum, d) => sum + d, 0) / k;

        return Math.min(kDistance / (avgKDistance + 0.001), 1);
    }

    /**
     * Statistical scoring algorithm
     */
    async statisticalScore(log, features, baselines, historicalLogs) {
        let anomalyScore = 0;
        let featureCount = 0;

        // Check each feature against baseline thresholds
        const thresholds = baselines.thresholds || {};

        // Velocity checks
        if (features.velocity5Min > (thresholds.maxActionsPerMinute * 5 || 10)) {
            anomalyScore += 0.3;
        }
        if (features.velocity1Hour > (thresholds.suspiciousActionRate || 50)) {
            anomalyScore += 0.4;
        }

        // Time pattern checks
        if (features.hourOfDay < 0.3 || features.hourOfDay > 0.8) { // Unusual hours
            anomalyScore += 0.1;
        }

        // Action rarity
        if (features.actionRarity > 0.9) { // Very rare action
            anomalyScore += 0.2;
        }

        // IP checks
        if (features.ipIsKnown === 0) { // Unknown IP
            anomalyScore += 0.25;
        }

        // User behavior
        if (features.userTotalActions < 5) { // New user
            anomalyScore += 0.15;
        }

        featureCount = 6; // Number of checks performed

        return Math.min(anomalyScore / featureCount, 1);
    }

    /**
     * Ensemble scoring method
     */
    async ensembleScore(log, features, baselines, historicalLogs) {
        // Combine multiple algorithms with weights
        const weights = {
            isolationForest: 0.4,
            localOutlierFactor: 0.3,
            statistical: 0.3
        };

        const scores = {};
        for (const [name, weight] of Object.entries(weights)) {
            const algorithm = this.scoringAlgorithms[name];
            scores[name] = await algorithm(log, features, baselines, historicalLogs);
        }

        // Weighted average
        let totalScore = 0;
        let totalWeight = 0;

        for (const [name, score] of Object.entries(scores)) {
            totalScore += score * weights[name];
            totalWeight += weights[name];
        }

        return totalScore / totalWeight;
    }

    /**
     * Calculate Euclidean distance between feature vectors
     */
    euclideanDistance(features1, features2) {
        const keys = new Set([...Object.keys(features1), ...Object.keys(features2)]);
        let sum = 0;

        for (const key of keys) {
            const val1 = features1[key] || 0;
            const val2 = features2[key] || 0;
            sum += Math.pow(val1 - val2, 2);
        }

        return Math.sqrt(sum);
    }

    /**
     * Combine scores from multiple algorithms
     */
    combineScores(algorithmScores) {
        // Use weighted ensemble
        const weights = {
            isolationForest: 0.3,
            localOutlierFactor: 0.3,
            statistical: 0.2,
            ensemble: 0.2
        };

        let totalScore = 0;
        let totalWeight = 0;

        for (const [algorithm, score] of Object.entries(algorithmScores)) {
            const weight = weights[algorithm] || 0.25;
            totalScore += score * weight;
            totalWeight += weight;
        }

        return totalScore / totalWeight;
    }

    /**
     * Calculate confidence in the anomaly score
     */
    calculateConfidence(algorithmScores) {
        const scores = Object.values(algorithmScores);
        if (scores.length === 0) return 0.5;

        // Confidence based on agreement between algorithms
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);

        // Lower variance = higher confidence
        return Math.max(0, 1 - (stdDev / 0.5)); // Normalize stdDev to 0-1 confidence
    }

    /**
     * Calculate severity based on score and triggered rules
     */
    calculateSeverity(score, triggeredRules) {
        const ruleSeverity = triggeredRules.length > 0 ?
            Math.max(...triggeredRules.map(r => this.severityToNumber(r.severity))) : 0;

        const scoreSeverity = score > 0.8 ? 3 : score > 0.6 ? 2 : score > 0.4 ? 1 : 0;

        const combinedSeverity = Math.max(ruleSeverity, scoreSeverity);

        return combinedSeverity >= 3 ? 'critical' :
               combinedSeverity >= 2 ? 'high' :
               combinedSeverity >= 1 ? 'medium' : 'low';
    }

    /**
     * Convert severity string to number
     */
    severityToNumber(severity) {
        switch (severity) {
            case 'critical': return 3;
            case 'high': return 2;
            case 'medium': return 1;
            case 'low': return 0;
            default: return 0;
        }
    }

    /**
     * Get historical logs for context
     */
    async getHistoricalLogs(tenantId, limit = 100) {
        try {
            const conditions = [sql`true`]; // Always true condition

            if (tenantId) {
                conditions.push(eq(auditLogs.tenantId, tenantId));
            }

            const logs = await db.select({
                id: auditLogs.id,
                action: auditLogs.action,
                actorUserId: auditLogs.actorUserId,
                ipAddress: auditLogs.ipAddress,
                createdAt: auditLogs.createdAt,
                metadata: auditLogs.metadata
            })
            .from(auditLogs)
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);

            return logs;
        } catch (error) {
            logError('Error getting historical logs:', error);
            return [];
        }
    }

    /**
     * Get engine status
     */
    getStatus() {
        return {
            modelsLoaded: this.models.size,
            featureExtractorsLoaded: this.featureExtractors.size,
            algorithmsAvailable: Object.keys(this.scoringAlgorithms).length
        };
    }
}

export default AnomalyScoringEngine;