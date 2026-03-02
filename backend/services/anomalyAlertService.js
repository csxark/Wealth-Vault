/**
 * Anomaly Alert Service
 *
 * Generates alerts for detected anomalies and manages alert escalation.
 * Handles different alert channels and severity levels.
 */

import { db } from '../config/db.js';
import { anomalyAlerts, alertEscalations, alertChannels } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

class AnomalyAlertService {
    constructor() {
        this.redis = null;
        this.alertChannels = new Map(); // channelId -> channel config
        this.escalationRules = new Map(); // severity -> escalation config
        this.alertCooldowns = new Map(); // alertKey -> lastAlertTime
    }

    /**
     * Initialize the alert service
     */
    async initialize() {
        try {
            logInfo('Initializing Anomaly Alert Service...');

            // Connect to Redis for alert publishing
            this.redis = await getRedisClient();

            // Load alert channels and escalation rules
            await this.loadAlertChannels();
            await this.loadEscalationRules();

            logInfo('Anomaly Alert Service initialized successfully');
        } catch (error) {
            logError('Failed to initialize alert service:', error);
            throw error;
        }
    }

    /**
     * Load alert channels from database
     */
    async loadAlertChannels() {
        try {
            const channels = await db.select()
                .from(alertChannels)
                .where(eq(alertChannels.isActive, true));

            for (const channel of channels) {
                this.alertChannels.set(channel.id, {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    config: channel.config,
                    severityThreshold: channel.severityThreshold,
                    isActive: channel.isActive
                });
            }

            logInfo(`Loaded ${channels.length} alert channels`);
        } catch (error) {
            logError('Error loading alert channels:', error);
            throw error;
        }
    }

    /**
     * Load escalation rules
     */
    async loadEscalationRules() {
        try {
            const rules = await db.select()
                .from(alertEscalations)
                .where(eq(alertEscalations.isActive, true));

            for (const rule of rules) {
                this.escalationRules.set(rule.severity, {
                    id: rule.id,
                    severity: rule.severity,
                    escalationDelay: rule.escalationDelay,
                    maxEscalations: rule.maxEscalations,
                    channels: rule.channels,
                    isActive: rule.isActive
                });
            }

            logInfo(`Loaded ${rules.length} escalation rules`);
        } catch (error) {
            logError('Error loading escalation rules:', error);
            throw error;
        }
    }

    /**
     * Generate alerts for detected anomalies
     */
    async generateAlerts(tenantId, logs, anomalyScores, triggeredRules) {
        const alerts = [];

        // Group triggered rules by log ID
        const rulesByLogId = new Map();
        for (const rule of triggeredRules) {
            if (!rulesByLogId.has(rule.logId)) {
                rulesByLogId.set(rule.logId, []);
            }
            rulesByLogId.get(rule.logId).push(rule);
        }

        // Group scores by log ID
        const scoresByLogId = new Map();
        for (const score of anomalyScores) {
            scoresByLogId.set(score.logId, score);
        }

        // Generate alerts for high-scoring anomalies and triggered rules
        for (const log of logs) {
            const score = scoresByLogId.get(log.id);
            const rules = rulesByLogId.get(log.id) || [];

            if (!score && rules.length === 0) continue;

            // Determine if alert should be generated
            const shouldAlert = this.shouldGenerateAlert(score, rules);

            if (shouldAlert) {
                const alert = await this.createAlert(tenantId, log, score, rules);
                alerts.push(alert);

                // Publish alert to channels
                await this.publishAlert(alert);

                // Schedule escalation if needed
                await this.scheduleEscalation(alert);
            }
        }

        return alerts;
    }

    /**
     * Determine if an alert should be generated
     */
    shouldGenerateAlert(score, rules) {
        // Alert if score is high enough
        if (score && score.score > 0.7) {
            return true;
        }

        // Alert if critical rules are triggered
        if (rules.some(rule => rule.severity === 'critical')) {
            return true;
        }

        // Alert if multiple high-severity rules are triggered
        const highSeverityRules = rules.filter(rule => ['high', 'critical'].includes(rule.severity));
        if (highSeverityRules.length >= 2) {
            return true;
        }

        // Check for alert cooldown to prevent spam
        const alertKey = this.generateAlertKey(score, rules);
        const lastAlert = this.alertCooldowns.get(alertKey);
        const cooldownPeriod = 5 * 60 * 1000; // 5 minutes

        if (lastAlert && Date.now() - lastAlert < cooldownPeriod) {
            return false; // Still in cooldown
        }

        return false;
    }

    /**
     * Generate unique alert key for cooldown tracking
     */
    generateAlertKey(score, rules) {
        const components = [];

        if (score) {
            components.push(`score_${score.score.toFixed(2)}`);
        }

        if (rules.length > 0) {
            const ruleIds = rules.map(r => r.ruleId).sort().join(',');
            components.push(`rules_${ruleIds}`);
        }

        return components.join('_');
    }

    /**
     * Create an alert record
     */
    async createAlert(tenantId, log, score, rules) {
        try {
            // Determine alert severity
            const severity = this.determineAlertSeverity(score, rules);

            // Create alert message
            const message = this.generateAlertMessage(log, score, rules);

            // Create alert metadata
            const metadata = {
                logId: log.id,
                tenantId,
                action: log.action,
                actorUserId: log.actorUserId,
                ipAddress: log.ipAddress,
                timestamp: log.createdAt,
                score: score ? {
                    value: score.score,
                    confidence: score.confidence,
                    severity: score.severity
                } : null,
                triggeredRules: rules.map(r => ({
                    ruleId: r.ruleId,
                    severity: r.severity,
                    confidence: r.confidence,
                    message: r.message
                })),
                features: score ? score.features : {}
            };

            // Insert alert into database
            const [alert] = await db.insert(anomalyAlerts).values({
                tenantId: tenantId !== 'global' ? tenantId : null,
                logId: log.id,
                ruleId: rules.length > 0 ? rules[0].ruleId : null, // Primary rule
                score: score ? score.score : 0,
                severity,
                message,
                metadata,
                status: 'active',
                createdAt: new Date()
            }).returning();

            // Update cooldown
            const alertKey = this.generateAlertKey(score, rules);
            this.alertCooldowns.set(alertKey, Date.now());

            return {
                id: alert.id,
                tenantId,
                logId: log.id,
                severity,
                message,
                metadata,
                createdAt: alert.createdAt
            };

        } catch (error) {
            logError('Error creating alert:', error);
            throw error;
        }
    }

    /**
     * Determine alert severity
     */
    determineAlertSeverity(score, rules) {
        // Check rule severities first
        const ruleSeverities = rules.map(r => r.severity);
        if (ruleSeverities.includes('critical')) return 'critical';
        if (ruleSeverities.includes('high')) return 'high';
        if (ruleSeverities.includes('medium')) return 'medium';

        // Fall back to score-based severity
        if (score) {
            if (score.score > 0.9) return 'critical';
            if (score.score > 0.7) return 'high';
            if (score.score > 0.5) return 'medium';
        }

        return 'low';
    }

    /**
     * Generate alert message
     */
    generateAlertMessage(log, score, rules) {
        const components = [];

        // Add score information
        if (score) {
            components.push(`Anomaly score: ${(score.score * 100).toFixed(1)}%`);
        }

        // Add rule information
        if (rules.length > 0) {
            const ruleMessages = rules.map(r => r.message).join('; ');
            components.push(`Triggered rules: ${ruleMessages}`);
        }

        // Add log context
        components.push(`Action: ${log.action}`);
        if (log.actorUserId) {
            components.push(`User: ${log.actorUserId}`);
        }
        if (log.ipAddress) {
            components.push(`IP: ${log.ipAddress}`);
        }

        return components.join(' | ');
    }

    /**
     * Publish alert to configured channels
     */
    async publishAlert(alert) {
        try {
            // Publish to Redis for real-time processing
            if (this.redis) {
                await this.redis.publish('anomaly:alerts:new', JSON.stringify(alert));
            }

            // Send to configured channels
            for (const [channelId, channel] of this.alertChannels) {
                if (this.shouldSendToChannel(alert, channel)) {
                    await this.sendToChannel(alert, channel);
                }
            }

        } catch (error) {
            logError('Error publishing alert:', error);
        }
    }

    /**
     * Check if alert should be sent to a channel
     */
    shouldSendToChannel(alert, channel) {
        // Check severity threshold
        const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
        const alertLevel = severityLevels[alert.severity] || 0;
        const channelThreshold = severityLevels[channel.severityThreshold] || 0;

        return alertLevel >= channelThreshold;
    }

    /**
     * Send alert to a specific channel
     */
    async sendToChannel(alert, channel) {
        try {
            switch (channel.type) {
                case 'email':
                    await this.sendEmailAlert(alert, channel);
                    break;
                case 'slack':
                    await this.sendSlackAlert(alert, channel);
                    break;
                case 'webhook':
                    await this.sendWebhookAlert(alert, channel);
                    break;
                case 'sms':
                    await this.sendSMSAlert(alert, channel);
                    break;
                case 'database':
                    // Already stored in database
                    break;
                default:
                    logWarn(`Unknown channel type: ${channel.type}`);
            }
        } catch (error) {
            logError(`Error sending alert to ${channel.type} channel:`, error);
        }
    }

    /**
     * Send email alert
     */
    async sendEmailAlert(alert, channel) {
        // Implementation would integrate with email service
        logInfo(`Sending email alert: ${alert.message}`);
        // TODO: Implement email sending logic
    }

    /**
     * Send Slack alert
     */
    async sendSlackAlert(alert, channel) {
        // Implementation would integrate with Slack API
        logInfo(`Sending Slack alert: ${alert.message}`);
        // TODO: Implement Slack webhook logic
    }

    /**
     * Send webhook alert
     */
    async sendWebhookAlert(alert, channel) {
        try {
            const config = channel.config;
            if (!config.url) return;

            const response = await fetch(config.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.authHeader || ''
                },
                body: JSON.stringify({
                    alert,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }

            logInfo(`Webhook alert sent successfully to ${config.url}`);
        } catch (error) {
            logError('Error sending webhook alert:', error);
            throw error;
        }
    }

    /**
     * Send SMS alert
     */
    async sendSMSAlert(alert, channel) {
        // Implementation would integrate with SMS service
        logInfo(`Sending SMS alert: ${alert.message}`);
        // TODO: Implement SMS sending logic
    }

    /**
     * Schedule alert escalation
     */
    async scheduleEscalation(alert) {
        const escalationRule = this.escalationRules.get(alert.severity);
        if (!escalationRule) return;

        try {
            // Schedule escalation after delay
            setTimeout(async () => {
                await this.escalateAlert(alert, escalationRule);
            }, escalationRule.escalationDelay * 1000);

        } catch (error) {
            logError('Error scheduling alert escalation:', error);
        }
    }

    /**
     * Escalate an alert
     */
    async escalateAlert(alert, escalationRule) {
        try {
            // Check if alert is still active
            const [currentAlert] = await db.select()
                .from(anomalyAlerts)
                .where(eq(anomalyAlerts.id, alert.id))
                .limit(1);

            if (!currentAlert || currentAlert.status !== 'active') {
                return; // Alert already resolved
            }

            // Update alert with escalation
            await db.update(anomalyAlerts)
                .set({
                    severity: this.escalateSeverity(alert.severity),
                    metadata: {
                        ...currentAlert.metadata,
                        escalated: true,
                        escalationTime: new Date()
                    },
                    updatedAt: new Date()
                })
                .where(eq(anomalyAlerts.id, alert.id));

            // Send escalated alert to additional channels
            const escalatedAlert = { ...alert, severity: this.escalateSeverity(alert.severity) };
            await this.publishAlert(escalatedAlert);

            logInfo(`Alert ${alert.id} escalated to ${escalatedAlert.severity}`);

        } catch (error) {
            logError('Error escalating alert:', error);
        }
    }

    /**
     * Escalate severity level
     */
    escalateSeverity(severity) {
        const escalationMap = {
            low: 'medium',
            medium: 'high',
            high: 'critical',
            critical: 'critical' // Max level
        };
        return escalationMap[severity] || severity;
    }

    /**
     * Resolve an alert
     */
    async resolveAlert(alertId, resolution = 'auto') {
        try {
            await db.update(anomalyAlerts)
                .set({
                    status: 'resolved',
                    metadata: sql`${anomalyAlerts.metadata} || ${JSON.stringify({
                        resolved: true,
                        resolution,
                        resolvedAt: new Date()
                    })}`,
                    updatedAt: new Date()
                })
                .where(eq(anomalyAlerts.id, alertId));

            logInfo(`Alert ${alertId} resolved with resolution: ${resolution}`);
        } catch (error) {
            logError(`Error resolving alert ${alertId}:`, error);
            throw error;
        }
    }

    /**
     * Get alerts for a tenant
     */
    async getTenantAlerts(tenantId, filters = {}) {
        try {
            const conditions = [];

            if (tenantId !== 'global') {
                conditions.push(eq(anomalyAlerts.tenantId, tenantId));
            } else {
                conditions.push(sql`${anomalyAlerts.tenantId} IS NULL`);
            }

            if (filters.status) {
                conditions.push(eq(anomalyAlerts.status, filters.status));
            }

            if (filters.severity) {
                conditions.push(eq(anomalyAlerts.severity, filters.severity));
            }

            if (filters.startDate) {
                conditions.push(gte(anomalyAlerts.createdAt, new Date(filters.startDate)));
            }

            if (filters.endDate) {
                conditions.push(lte(anomalyAlerts.createdAt, new Date(filters.endDate)));
            }

            const alerts = await db.select()
                .from(anomalyAlerts)
                .where(and(...conditions))
                .orderBy(desc(anomalyAlerts.createdAt))
                .limit(filters.limit || 100);

            return alerts;
        } catch (error) {
            logError(`Error getting alerts for tenant ${tenantId}:`, error);
            throw error;
        }
    }

    /**
     * Get alert statistics
     */
    async getAlertStats(tenantId, timeRange = '24h') {
        try {
            const timeFilter = this.getTimeFilter(timeRange);
            const conditions = [
                gte(anomalyAlerts.createdAt, timeFilter)
            ];

            if (tenantId !== 'global') {
                conditions.push(eq(anomalyAlerts.tenantId, tenantId));
            }

            const stats = await db.select({
                total: sql`COUNT(*)`,
                active: sql`COUNT(CASE WHEN ${anomalyAlerts.status} = 'active' THEN 1 END)`,
                resolved: sql`COUNT(CASE WHEN ${anomalyAlerts.status} = 'resolved' THEN 1 END)`,
                critical: sql`COUNT(CASE WHEN ${anomalyAlerts.severity} = 'critical' THEN 1 END)`,
                high: sql`COUNT(CASE WHEN ${anomalyAlerts.severity} = 'high' THEN 1 END)`,
                medium: sql`COUNT(CASE WHEN ${anomalyAlerts.severity} = 'medium' THEN 1 END)`,
                low: sql`COUNT(CASE WHEN ${anomalyAlerts.severity} = 'low' THEN 1 END)`
            })
            .from(anomalyAlerts)
            .where(and(...conditions));

            return stats[0];
        } catch (error) {
            logError(`Error getting alert stats for tenant ${tenantId}:`, error);
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

    /**
     * Get service status
     */
    getStatus() {
        return {
            channelsLoaded: this.alertChannels.size,
            escalationRulesLoaded: this.escalationRules.size,
            activeCooldowns: this.alertCooldowns.size,
            redisConnected: this.redis && this.redis.isOpen
        };
    }
}

export default AnomalyAlertService;