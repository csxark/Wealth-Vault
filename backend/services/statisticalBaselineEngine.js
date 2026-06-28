/**
 * Statistical Baseline Engine
 *
 * Calculates and maintains statistical baselines for normal audit log behavior patterns.
 * Used by the anomaly detection pipeline to establish "normal" activity thresholds.
 */

import { db } from '../config/db.js';
import { auditLogs, anomalyBaselines } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class StatisticalBaselineEngine {
    constructor() {
        this.baselines = new Map(); // tenantId -> baseline data
        this.baselineWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
        this.updateInterval = 3600000; // 1 hour
    }

    /**
     * Initialize the baseline engine
     */
    async initialize() {
        try {
            logInfo('Initializing Statistical Baseline Engine...');

            // Load existing baselines from database
            await this.loadBaselines();

            logInfo('Statistical Baseline Engine initialized successfully');
        } catch (error) {
            logError('Failed to initialize baseline engine:', error);
            throw error;
        }
    }

    /**
     * Load baselines from database
     */
    async loadBaselines() {
        try {
            const baselineRecords = await db.select()
                .from(anomalyBaselines)
                .where(eq(anomalyBaselines.isActive, true));

            for (const record of baselineRecords) {
                const tenantId = record.tenantId || 'global';
                this.baselines.set(tenantId, {
                    ...record.baselineData,
                    lastUpdated: record.lastUpdated,
                    version: record.version
                });
            }

            logInfo(`Loaded ${baselineRecords.length} baseline records`);
        } catch (error) {
            logError('Error loading baselines:', error);
            throw error;
        }
    }

    /**
     * Get baseline for a tenant
     */
    async getBaselines(tenantId) {
        const key = tenantId || 'global';

        if (!this.baselines.has(key)) {
            // Calculate baseline on demand
            const baseline = await this.calculateBaseline(tenantId);
            this.baselines.set(key, baseline);
            await this.saveBaseline(tenantId, baseline);
        }

        return this.baselines.get(key);
    }

    /**
     * Calculate statistical baseline for a tenant
     */
    async calculateBaseline(tenantId) {
        try {
            const startDate = new Date(Date.now() - this.baselineWindow);

            // Get audit logs for the baseline period
            const conditions = [
                gte(auditLogs.createdAt, startDate)
            ];

            if (tenantId) {
                conditions.push(eq(auditLogs.tenantId, tenantId));
            } else {
                conditions.push(sql`${auditLogs.tenantId} IS NULL`);
            }

            const logs = await db.select({
                action: auditLogs.action,
                actorUserId: auditLogs.actorUserId,
                category: auditLogs.category,
                ipAddress: auditLogs.ipAddress,
                userAgent: auditLogs.userAgent,
                createdAt: auditLogs.createdAt,
                metadata: auditLogs.metadata
            })
            .from(auditLogs)
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt));

            if (logs.length === 0) {
                return this.getDefaultBaseline();
            }

            // Calculate statistical baselines
            const baseline = {
                totalLogs: logs.length,
                avgLogsPerHour: logs.length / (this.baselineWindow / (60 * 60 * 1000)),
                avgLogsPerDay: logs.length / (this.baselineWindow / (24 * 60 * 60 * 1000)),

                // Action frequency distribution
                actionFrequency: this.calculateFrequencyDistribution(logs.map(l => l.action)),

                // User activity patterns
                userActivity: this.calculateUserActivityPatterns(logs),

                // Time-based patterns
                timePatterns: this.calculateTimePatterns(logs),

                // IP address patterns
                ipPatterns: this.calculateIPPatterns(logs),

                // Category distribution
                categoryDistribution: this.calculateFrequencyDistribution(logs.map(l => l.category)),

                // Geographic patterns (if available)
                geoPatterns: this.calculateGeoPatterns(logs),

                // Session patterns
                sessionPatterns: this.calculateSessionPatterns(logs),

                // Anomaly thresholds
                thresholds: this.calculateThresholds(logs),

                calculatedAt: new Date(),
                version: 1
            };

            return baseline;
        } catch (error) {
            logError(`Error calculating baseline for tenant ${tenantId}:`, error);
            return this.getDefaultBaseline();
        }
    }

    /**
     * Calculate frequency distribution of values
     */
    calculateFrequencyDistribution(values) {
        const distribution = {};
        const total = values.length;

        for (const value of values) {
            if (value) {
                distribution[value] = (distribution[value] || 0) + 1;
            }
        }

        // Convert to percentages
        const percentages = {};
        for (const [key, count] of Object.entries(distribution)) {
            percentages[key] = count / total;
        }

        return {
            raw: distribution,
            percentages,
            total
        };
    }

    /**
     * Calculate user activity patterns
     */
    calculateUserActivityPatterns(logs) {
        const userStats = {};

        for (const log of logs) {
            const userId = log.actorUserId;
            if (!userId) continue;

            if (!userStats[userId]) {
                userStats[userId] = {
                    totalActions: 0,
                    actionsByType: {},
                    lastActivity: null,
                    firstActivity: null,
                    avgActionsPerDay: 0
                };
            }

            userStats[userId].totalActions++;
            userStats[userId].actionsByType[log.action] = (userStats[userId].actionsByType[log.action] || 0) + 1;

            const logTime = new Date(log.createdAt);
            if (!userStats[userId].firstActivity || logTime < userStats[userId].firstActivity) {
                userStats[userId].firstActivity = logTime;
            }
            if (!userStats[userId].lastActivity || logTime > userStats[userId].lastActivity) {
                userStats[userId].lastActivity = logTime;
            }
        }

        // Calculate averages
        const userIds = Object.keys(userStats);
        for (const userId of userIds) {
            const stats = userStats[userId];
            const daysActive = stats.firstActivity && stats.lastActivity ?
                Math.max(1, (stats.lastActivity - stats.firstActivity) / (24 * 60 * 60 * 1000)) : 1;
            stats.avgActionsPerDay = stats.totalActions / daysActive;
        }

        return userStats;
    }

    /**
     * Calculate time-based patterns
     */
    calculateTimePatterns(logs) {
        const hourly = new Array(24).fill(0);
        const daily = new Array(7).fill(0); // 0 = Sunday, 6 = Saturday

        for (const log of logs) {
            const date = new Date(log.createdAt);
            hourly[date.getHours()]++;
            daily[date.getDay()]++;
        }

        return {
            hourlyDistribution: hourly.map(count => count / logs.length),
            dailyDistribution: daily.map(count => count / logs.length),
            peakHour: hourly.indexOf(Math.max(...hourly)),
            peakDay: daily.indexOf(Math.max(...daily))
        };
    }

    /**
     * Calculate IP address patterns
     */
    calculateIPPatterns(logs) {
        const ipStats = {};

        for (const log of logs) {
            const ip = log.ipAddress;
            if (!ip) continue;

            if (!ipStats[ip]) {
                ipStats[ip] = {
                    totalRequests: 0,
                    actions: {},
                    firstSeen: log.createdAt,
                    lastSeen: log.createdAt
                };
            }

            ipStats[ip].totalRequests++;
            ipStats[ip].actions[log.action] = (ipStats[ip].actions[log.action] || 0) + 1;

            const logTime = new Date(log.createdAt);
            if (logTime < new Date(ipStats[ip].firstSeen)) {
                ipStats[ip].firstSeen = log.createdAt;
            }
            if (logTime > new Date(ipStats[ip].lastSeen)) {
                ipStats[ip].lastSeen = log.createdAt;
            }
        }

        return ipStats;
    }

    /**
     * Calculate geographic patterns (if location data available)
     */
    calculateGeoPatterns(logs) {
        // This would require IP geolocation service integration
        // For now, return basic structure
        return {
            countries: {},
            regions: {},
            cities: {},
            // Would be populated with geo data from IP addresses
        };
    }

    /**
     * Calculate session patterns
     */
    calculateSessionPatterns(logs) {
        // Group logs by user sessions (simplified - would need session IDs in real implementation)
        const sessions = {};
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes

        for (const log of logs) {
            const userId = log.actorUserId;
            if (!userId) continue;

            if (!sessions[userId]) {
                sessions[userId] = [];
            }

            const logTime = new Date(log.createdAt);
            let sessionFound = false;

            for (const session of sessions[userId]) {
                const lastLogTime = new Date(session.logs[session.logs.length - 1].createdAt);
                if (logTime - lastLogTime < sessionTimeout) {
                    session.logs.push(log);
                    session.endTime = log.createdAt;
                    sessionFound = true;
                    break;
                }
            }

            if (!sessionFound) {
                sessions[userId].push({
                    startTime: log.createdAt,
                    endTime: log.createdAt,
                    logs: [log],
                    duration: 0
                });
            }
        }

        // Calculate session statistics
        const sessionStats = {
            avgSessionDuration: 0,
            avgActionsPerSession: 0,
            totalSessions: 0
        };

        let totalDuration = 0;
        let totalActions = 0;

        for (const userSessions of Object.values(sessions)) {
            for (const session of userSessions) {
                session.duration = new Date(session.endTime) - new Date(session.startTime);
                totalDuration += session.duration;
                totalActions += session.logs.length;
                sessionStats.totalSessions++;
            }
        }

        if (sessionStats.totalSessions > 0) {
            sessionStats.avgSessionDuration = totalDuration / sessionStats.totalSessions;
            sessionStats.avgActionsPerSession = totalActions / sessionStats.totalSessions;
        }

        return sessionStats;
    }

    /**
     * Calculate anomaly detection thresholds
     */
    calculateThresholds(logs) {
        // Calculate statistical thresholds for anomaly detection
        const actionsPerHour = logs.length / (this.baselineWindow / (60 * 60 * 1000));

        return {
            maxActionsPerHour: actionsPerHour * 3, // 3x normal rate
            maxActionsPerMinute: actionsPerHour * 3 / 60,
            suspiciousActionRate: actionsPerHour * 2, // 2x normal rate
            unusualHourThreshold: 0.1, // Hours with < 10% of normal activity
            unusualDayThreshold: 0.1, // Days with < 10% of normal activity
            newIPThreshold: 0.05, // IPs with < 5% of total requests
            rareActionThreshold: 0.01 // Actions with < 1% frequency
        };
    }

    /**
     * Get default baseline for new tenants
     */
    getDefaultBaseline() {
        return {
            totalLogs: 0,
            avgLogsPerHour: 0,
            avgLogsPerDay: 0,
            actionFrequency: { raw: {}, percentages: {}, total: 0 },
            userActivity: {},
            timePatterns: {
                hourlyDistribution: new Array(24).fill(0),
                dailyDistribution: new Array(7).fill(0),
                peakHour: 12,
                peakDay: 1
            },
            ipPatterns: {},
            categoryDistribution: { raw: {}, percentages: {}, total: 0 },
            geoPatterns: { countries: {}, regions: {}, cities: {} },
            sessionPatterns: {
                avgSessionDuration: 0,
                avgActionsPerSession: 0,
                totalSessions: 0
            },
            thresholds: {
                maxActionsPerHour: 100,
                maxActionsPerMinute: 2,
                suspiciousActionRate: 50,
                unusualHourThreshold: 0.1,
                unusualDayThreshold: 0.1,
                newIPThreshold: 0.05,
                rareActionThreshold: 0.01
            },
            calculatedAt: new Date(),
            version: 1
        };
    }

    /**
     * Save baseline to database
     */
    async saveBaseline(tenantId, baseline) {
        try {
            await db.insert(anomalyBaselines).values({
                tenantId: tenantId || null,
                baselineData: baseline,
                version: baseline.version,
                isActive: true,
                lastUpdated: new Date()
            }).onConflictDoUpdate({
                target: tenantId ? anomalyBaselines.tenantId : anomalyBaselines.id,
                set: {
                    baselineData: baseline,
                    version: baseline.version,
                    lastUpdated: new Date()
                }
            });
        } catch (error) {
            logError(`Error saving baseline for tenant ${tenantId}:`, error);
        }
    }

    /**
     * Update baselines for all tenants
     */
    async updateBaselines() {
        try {
            logInfo('Updating statistical baselines for all tenants...');

            // Get all active tenants
            const tenants = await db.select({ id: 'id' })
                .from(auditLogs)
                .where(sql`${auditLogs.tenantId} IS NOT NULL`);

            const tenantIds = [...new Set(tenants.map(t => t.id))];
            tenantIds.push(null); // Include global baseline

            for (const tenantId of tenantIds) {
                try {
                    const baseline = await this.calculateBaseline(tenantId);
                    this.baselines.set(tenantId || 'global', baseline);
                    await this.saveBaseline(tenantId, baseline);
                } catch (error) {
                    logError(`Error updating baseline for tenant ${tenantId}:`, error);
                }
            }

            logInfo(`Updated baselines for ${tenantIds.length} tenants`);
        } catch (error) {
            logError('Error updating baselines:', error);
        }
    }

    /**
     * Get engine status
     */
    getStatus() {
        return {
            baselinesLoaded: this.baselines.size,
            lastUpdate: new Date(),
            baselineWindowDays: this.baselineWindow / (24 * 60 * 60 * 1000)
        };
    }
}

export default StatisticalBaselineEngine;