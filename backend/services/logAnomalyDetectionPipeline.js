/**
 * Log Anomaly Detection Pipeline (#630)
 *
 * Real-time anomaly detection engine that processes audit logs through a streaming pipeline.
 * Uses statistical baselines and rule-based triggers to identify suspicious activities in large log volumes.
 *
 * Features:
 * - Real-time log streaming via Redis pub/sub
 * - Statistical baseline calculation for normal behavior patterns
 * - Rule-based triggers for suspicious activities
 * - Machine learning anomaly scoring
 * - Multi-tenant isolation with tenant-aware processing
 * - Alert generation and escalation
 */

import { EventEmitter } from 'events';
import { db } from '../config/db.js';
import { auditLogs, anomalyBaselines, anomalyRules, anomalyAlerts } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { getRedisClient } from '../config/redis.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import StatisticalBaselineEngine from './statisticalBaselineEngine.js';
import RuleBasedTriggerEngine from './ruleBasedTriggerEngine.js';
import AnomalyScoringEngine from './anomalyScoringEngine.js';
import AnomalyAlertService from './anomalyAlertService.js';
import tenantAwareAuditService from './tenantAwareAuditService.js';

class LogAnomalyDetectionPipeline extends EventEmitter {
    constructor() {
        super();
        this.redis = null;
        this.isRunning = false;
        this.baselineEngine = new StatisticalBaselineEngine();
        this.triggerEngine = new RuleBasedTriggerEngine();
        this.scoringEngine = new AnomalyScoringEngine();
        this.alertService = new AnomalyAlertService();
        this.processingQueue = [];
        this.batchSize = 100;
        this.processingInterval = 5000; // 5 seconds
        this.baselineUpdateInterval = 3600000; // 1 hour
    }

    /**
     * Initialize the anomaly detection pipeline
     */
    async initialize() {
        try {
            logInfo('Initializing Log Anomaly Detection Pipeline...');

            // Connect to Redis for streaming
            this.redis = await getRedisClient();
            if (!this.redis) {
                throw new Error('Redis connection failed - pipeline cannot start');
            }

            // Subscribe to audit log events
            await this.redis.subscribe('audit:logs:new', this.handleNewAuditLog.bind(this));
            await this.redis.subscribe('audit:logs:batch', this.handleBatchAuditLogs.bind(this));

            // Initialize engines
            await this.baselineEngine.initialize();
            await this.triggerEngine.initialize();
            await this.scoringEngine.initialize();
            await this.alertService.initialize();

            // Start baseline updates
            this.startBaselineUpdates();

            logInfo('Log Anomaly Detection Pipeline initialized successfully');
        } catch (error) {
            logError('Failed to initialize anomaly detection pipeline:', error);
            throw error;
        }
    }

    /**
     * Start the anomaly detection pipeline
     */
    async start() {
        if (this.isRunning) {
            logWarn('Anomaly detection pipeline is already running');
            return;
        }

        try {
            logInfo('Starting Log Anomaly Detection Pipeline...');

            this.isRunning = true;

            // Start batch processing
            this.processingTimer = setInterval(() => {
                this.processQueuedLogs();
            }, this.processingInterval);

            // Emit pipeline started event
            this.emit('pipeline:started');

            logInfo('Log Anomaly Detection Pipeline started successfully');
        } catch (error) {
            logError('Failed to start anomaly detection pipeline:', error);
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the anomaly detection pipeline
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            logInfo('Stopping Log Anomaly Detection Pipeline...');

            this.isRunning = false;

            // Clear timers
            if (this.processingTimer) {
                clearInterval(this.processingTimer);
                this.processingTimer = null;
            }

            if (this.baselineTimer) {
                clearInterval(this.baselineTimer);
                this.baselineTimer = null;
            }

            // Process remaining logs
            await this.processQueuedLogs();

            // Emit pipeline stopped event
            this.emit('pipeline:stopped');

            logInfo('Log Anomaly Detection Pipeline stopped successfully');
        } catch (error) {
            logError('Error stopping anomaly detection pipeline:', error);
            throw error;
        }
    }

    /**
     * Handle new audit log from Redis pub/sub
     */
    async handleNewAuditLog(message) {
        try {
            const auditLog = JSON.parse(message);

            // Add to processing queue
            this.processingQueue.push(auditLog);

            // Process immediately if queue is getting large
            if (this.processingQueue.length >= this.batchSize) {
                await this.processQueuedLogs();
            }
        } catch (error) {
            logError('Error handling new audit log:', error);
        }
    }

    /**
     * Handle batch audit logs from Redis pub/sub
     */
    async handleBatchAuditLogs(message) {
        try {
            const batchLogs = JSON.parse(message);

            // Add batch to processing queue
            this.processingQueue.push(...batchLogs);

            // Process the batch
            await this.processQueuedLogs();
        } catch (error) {
            logError('Error handling batch audit logs:', error);
        }
    }

    /**
     * Process queued audit logs through the anomaly detection pipeline
     */
    async processQueuedLogs() {
        if (this.processingQueue.length === 0 || !this.isRunning) {
            return;
        }

        const logsToProcess = this.processingQueue.splice(0, this.batchSize);

        try {
            logInfo(`Processing ${logsToProcess.length} audit logs through anomaly detection pipeline`);

            // Group logs by tenant for efficient processing
            const logsByTenant = this.groupLogsByTenant(logsToProcess);

            // Process each tenant's logs
            for (const [tenantId, tenantLogs] of Object.entries(logsByTenant)) {
                await this.processTenantLogs(tenantId, tenantLogs);
            }

            // Emit processing complete event
            this.emit('logs:processed', logsToProcess.length);

        } catch (error) {
            logError('Error processing queued logs:', error);
            // Re-queue failed logs
            this.processingQueue.unshift(...logsToProcess);
        }
    }

    /**
     * Group audit logs by tenant
     */
    groupLogsByTenant(logs) {
        const grouped = {};

        for (const log of logs) {
            const tenantId = log.tenantId || 'global';
            if (!grouped[tenantId]) {
                grouped[tenantId] = [];
            }
            grouped[tenantId].push(log);
        }

        return grouped;
    }

    /**
     * Process logs for a specific tenant through the anomaly detection pipeline
     */
    async processTenantLogs(tenantId, logs) {
        try {
            // Step 1: Calculate statistical baselines if needed
            const baselines = await this.baselineEngine.getBaselines(tenantId);

            // Step 2: Apply rule-based triggers
            const triggeredRules = await this.triggerEngine.evaluateRules(tenantId, logs, baselines);

            // Step 3: Calculate anomaly scores
            const anomalyScores = await this.scoringEngine.calculateScores(tenantId, logs, baselines, triggeredRules);

            // Step 4: Generate alerts for high-scoring anomalies
            const alerts = await this.alertService.generateAlerts(tenantId, logs, anomalyScores, triggeredRules);

            // Step 5: Log anomaly detection results
            await this.logAnomalyResults(tenantId, logs, anomalyScores, alerts);

            // Emit tenant processing complete event
            this.emit('tenant:processed', { tenantId, logCount: logs.length, alertsGenerated: alerts.length });

        } catch (error) {
            logError(`Error processing tenant ${tenantId} logs:`, error);
            throw error;
        }
    }

    /**
     * Log anomaly detection results
     */
    async logAnomalyResults(tenantId, logs, scores, alerts) {
        try {
            // Store anomaly scores in database
            const scoreRecords = scores.map(score => ({
                tenantId: tenantId !== 'global' ? tenantId : null,
                logId: score.logId,
                score: score.score,
                confidence: score.confidence,
                features: score.features,
                detectedAt: new Date()
            }));

            if (scoreRecords.length > 0) {
                await db.insert(anomalyScores).values(scoreRecords);
            }

            // Log alerts
            for (const alert of alerts) {
                await db.insert(anomalyAlerts).values({
                    tenantId: tenantId !== 'global' ? tenantId : null,
                    logId: alert.logId,
                    ruleId: alert.ruleId,
                    score: alert.score,
                    severity: alert.severity,
                    message: alert.message,
                    metadata: alert.metadata,
                    status: 'active',
                    createdAt: new Date()
                });
            }

        } catch (error) {
            logError('Error logging anomaly results:', error);
        }
    }

    /**
     * Start periodic baseline updates
     */
    startBaselineUpdates() {
        this.baselineTimer = setInterval(async () => {
            try {
                await this.baselineEngine.updateBaselines();
                logInfo('Statistical baselines updated successfully');
            } catch (error) {
                logError('Error updating statistical baselines:', error);
            }
        }, this.baselineUpdateInterval);
    }

    /**
     * Get pipeline health status
     */
    getHealthStatus() {
        return {
            isRunning: this.isRunning,
            queueSize: this.processingQueue.length,
            redisConnected: this.redis && this.redis.isOpen,
            lastProcessed: new Date(),
            baselineEngine: this.baselineEngine.getStatus(),
            triggerEngine: this.triggerEngine.getStatus(),
            scoringEngine: this.scoringEngine.getStatus(),
            alertService: this.alertService.getStatus()
        };
    }

    /**
     * Force process a specific audit log
     */
    async processLogImmediately(logId) {
        try {
            const log = await db.select()
                .from(auditLogs)
                .where(eq(auditLogs.id, logId))
                .limit(1);

            if (log.length === 0) {
                throw new Error(`Audit log ${logId} not found`);
            }

            const tenantId = log[0].tenantId || 'global';
            await this.processTenantLogs(tenantId, [log[0]]);

            return { success: true, tenantId };
        } catch (error) {
            logError(`Error processing log ${logId} immediately:`, error);
            throw error;
        }
    }

    /**
     * Get anomaly statistics for a tenant
     */
    async getTenantAnomalyStats(tenantId, timeRange = '24h') {
        try {
            const timeFilter = this.getTimeFilter(timeRange);

            const stats = await db.select({
                totalLogs: sql`COUNT(DISTINCT ${anomalyScores.logId})`,
                highScoreAnomalies: sql`COUNT(CASE WHEN ${anomalyScores.score} > 0.8 THEN 1 END)`,
                mediumScoreAnomalies: sql`COUNT(CASE WHEN ${anomalyScores.score} BETWEEN 0.5 AND 0.8 THEN 1 END)`,
                lowScoreAnomalies: sql`COUNT(CASE WHEN ${anomalyScores.score} < 0.5 THEN 1 END)`,
                alertsGenerated: sql`COUNT(DISTINCT ${anomalyAlerts.id})`,
                avgScore: sql`AVG(${anomalyScores.score})`
            })
            .from(anomalyScores)
            .leftJoin(anomalyAlerts, eq(anomalyScores.logId, anomalyAlerts.logId))
            .where(and(
                tenantId !== 'global' ? eq(anomalyScores.tenantId, tenantId) : sql`${anomalyScores.tenantId} IS NULL`,
                gte(anomalyScores.detectedAt, timeFilter)
            ));

            return stats[0];
        } catch (error) {
            logError(`Error getting tenant anomaly stats for ${tenantId}:`, error);
            throw error;
        }
    }

    /**
     * Get time filter for statistics
     */
    getTimeFilter(timeRange) {
        const now = new Date();
        switch (timeRange) {
            case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
            case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            default: return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
    }
}

// Export singleton instance
export default new LogAnomalyDetectionPipeline();