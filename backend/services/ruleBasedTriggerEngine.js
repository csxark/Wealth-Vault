/**
 * Rule-Based Trigger Engine
 *
 * Evaluates audit logs against predefined rules to detect suspicious activities.
 * Rules are based on patterns like unusual timing, rare actions, geographic anomalies, etc.
 */

import { db } from '../config/db.js';
import { anomalyRules, auditLogs } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class RuleBasedTriggerEngine {
    constructor() {
        this.rules = new Map(); // ruleId -> rule definition
        this.compiledRules = new Map(); // ruleId -> compiled function
    }

    /**
     * Initialize the trigger engine
     */
    async initialize() {
        try {
            logInfo('Initializing Rule-Based Trigger Engine...');

            // Load rules from database
            await this.loadRules();

            // Compile rules for efficient evaluation
            await this.compileRules();

            logInfo(`Rule-Based Trigger Engine initialized with ${this.rules.size} rules`);
        } catch (error) {
            logError('Failed to initialize trigger engine:', error);
            throw error;
        }
    }

    /**
     * Load rules from database
     */
    async loadRules() {
        try {
            const ruleRecords = await db.select()
                .from(anomalyRules)
                .where(eq(anomalyRules.isActive, true));

            for (const record of ruleRecords) {
                this.rules.set(record.id, {
                    id: record.id,
                    name: record.name,
                    description: record.description,
                    ruleType: record.ruleType,
                    conditions: record.conditions,
                    severity: record.severity,
                    threshold: record.threshold,
                    timeWindow: record.timeWindow,
                    tenantId: record.tenantId,
                    isActive: record.isActive,
                    createdAt: record.createdAt
                });
            }
        } catch (error) {
            logError('Error loading rules:', error);
            throw error;
        }
    }

    /**
     * Compile rules into executable functions
     */
    async compileRules() {
        for (const [ruleId, rule] of this.rules) {
            try {
                const compiledRule = this.compileRule(rule);
                this.compiledRules.set(ruleId, compiledRule);
            } catch (error) {
                logError(`Error compiling rule ${ruleId}:`, error);
            }
        }
    }

    /**
     * Compile a single rule into an executable function
     */
    compileRule(rule) {
        const { ruleType, conditions, threshold } = rule;

        switch (ruleType) {
            case 'frequency':
                return this.compileFrequencyRule(conditions, threshold);
            case 'velocity':
                return this.compileVelocityRule(conditions, threshold);
            case 'unusual_timing':
                return this.compileTimingRule(conditions, threshold);
            case 'geographic_anomaly':
                return this.compileGeographicRule(conditions, threshold);
            case 'rare_action':
                return this.compileRareActionRule(conditions, threshold);
            case 'session_anomaly':
                return this.compileSessionRule(conditions, threshold);
            case 'ip_anomaly':
                return this.compileIPRule(conditions, threshold);
            case 'user_behavior':
                return this.compileUserBehaviorRule(conditions, threshold);
            default:
                throw new Error(`Unknown rule type: ${ruleType}`);
        }
    }

    /**
     * Evaluate rules against audit logs
     */
    async evaluateRules(tenantId, logs, baselines) {
        const triggeredRules = [];

        for (const [ruleId, compiledRule] of this.compiledRules) {
            const rule = this.rules.get(ruleId);

            // Check if rule applies to this tenant
            if (rule.tenantId && rule.tenantId !== tenantId) {
                continue;
            }

            try {
                const results = await compiledRule(logs, baselines, rule.timeWindow);

                for (const result of results) {
                    if (result.triggered) {
                        triggeredRules.push({
                            ruleId,
                            logId: result.logId,
                            severity: rule.severity,
                            confidence: result.confidence,
                            message: result.message,
                            metadata: result.metadata
                        });
                    }
                }
            } catch (error) {
                logError(`Error evaluating rule ${ruleId}:`, error);
            }
        }

        return triggeredRules;
    }

    /**
     * Compile frequency-based rule
     */
    compileFrequencyRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];
            const now = Date.now();
            const windowStart = now - (timeWindow * 1000);

            // Count actions within time window
            const actionCounts = {};
            for (const log of logs) {
                if (new Date(log.createdAt).getTime() >= windowStart) {
                    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
                }
            }

            // Check against threshold
            for (const [action, count] of Object.entries(actionCounts)) {
                if (count > threshold) {
                    // Find the most recent log for this action
                    const recentLog = logs
                        .filter(l => l.action === action)
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

                    results.push({
                        logId: recentLog.id,
                        triggered: true,
                        confidence: Math.min(count / threshold, 1),
                        message: `High frequency of ${action}: ${count} times in ${timeWindow}s (threshold: ${threshold})`,
                        metadata: { action, count, threshold, timeWindow }
                    });
                }
            }

            return results;
        };
    }

    /**
     * Compile velocity-based rule (rate of actions)
     */
    compileVelocityRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];
            const now = Date.now();
            const windowStart = now - (timeWindow * 1000);

            // Group logs by user
            const userActions = {};
            for (const log of logs) {
                if (new Date(log.createdAt).getTime() >= windowStart) {
                    const userId = log.actorUserId;
                    if (!userActions[userId]) {
                        userActions[userId] = [];
                    }
                    userActions[userId].push(log);
                }
            }

            // Check velocity for each user
            for (const [userId, userLogs] of Object.entries(userActions)) {
                const velocity = userLogs.length / (timeWindow / 60); // actions per minute

                if (velocity > threshold) {
                    const recentLog = userLogs.sort((a, b) =>
                        new Date(b.createdAt) - new Date(a.createdAt))[0];

                    results.push({
                        logId: recentLog.id,
                        triggered: true,
                        confidence: Math.min(velocity / threshold, 1),
                        message: `High velocity for user ${userId}: ${velocity.toFixed(2)} actions/min (threshold: ${threshold})`,
                        metadata: { userId, velocity, threshold, timeWindow }
                    });
                }
            }

            return results;
        };
    }

    /**
     * Compile timing-based rule
     */
    compileTimingRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];

            for (const log of logs) {
                const logTime = new Date(log.createdAt);
                const hour = logTime.getHours();
                const day = logTime.getDay();

                // Check against baseline patterns
                const hourlyPattern = baselines.timePatterns?.hourlyDistribution || [];
                const dailyPattern = baselines.timePatterns?.dailyDistribution || [];

                const hourlyDeviation = hourlyPattern[hour] || 0;
                const dailyDeviation = dailyPattern[day] || 0;

                // Low activity hours/days are suspicious for certain actions
                if (hourlyDeviation < threshold || dailyDeviation < threshold) {
                    results.push({
                        logId: log.id,
                        triggered: true,
                        confidence: 1 - Math.max(hourlyDeviation, dailyDeviation),
                        message: `Unusual timing for ${log.action} at ${hour}:00 on day ${day}`,
                        metadata: { hour, day, hourlyDeviation, dailyDeviation, threshold }
                    });
                }
            }

            return results;
        };
    }

    /**
     * Compile geographic anomaly rule
     */
    compileGeographicRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];

            for (const log of logs) {
                const ip = log.ipAddress;
                if (!ip) continue;

                // Check if IP is in baseline patterns
                const ipPattern = baselines.ipPatterns?.[ip];
                if (!ipPattern) {
                    // New IP address
                    results.push({
                        logId: log.id,
                        triggered: true,
                        confidence: 0.8,
                        message: `New IP address: ${ip} performing ${log.action}`,
                        metadata: { ip, action: log.action }
                    });
                } else if (ipPattern.totalRequests < threshold) {
                    // Rare IP address
                    results.push({
                        logId: log.id,
                        triggered: true,
                        confidence: 0.6,
                        message: `Rare IP address: ${ip} (${ipPattern.totalRequests} requests) performing ${log.action}`,
                        metadata: { ip, totalRequests: ipPattern.totalRequests, threshold }
                    });
                }
            }

            return results;
        };
    }

    /**
     * Compile rare action rule
     */
    compileRareActionRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];

            for (const log of logs) {
                const action = log.action;
                const actionFrequency = baselines.actionFrequency?.percentages?.[action] || 0;

                if (actionFrequency < threshold) {
                    results.push({
                        logId: log.id,
                        triggered: true,
                        confidence: 1 - actionFrequency,
                        message: `Rare action: ${action} (${(actionFrequency * 100).toFixed(2)}% frequency)`,
                        metadata: { action, frequency: actionFrequency, threshold }
                    });
                }
            }

            return results;
        };
    }

    /**
     * Compile session anomaly rule
     */
    compileSessionRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];

            // Group logs by user sessions (simplified)
            const userSessions = {};
            const sessionTimeout = 30 * 60 * 1000; // 30 minutes

            for (const log of logs) {
                const userId = log.actorUserId;
                if (!userId) continue;

                if (!userSessions[userId]) {
                    userSessions[userId] = [];
                }

                const logTime = new Date(log.createdAt);
                let sessionFound = false;

                for (const session of userSessions[userId]) {
                    const lastLogTime = new Date(session.logs[session.logs.length - 1].createdAt);
                    if (logTime - lastLogTime < sessionTimeout) {
                        session.logs.push(log);
                        sessionFound = true;
                        break;
                    }
                }

                if (!sessionFound) {
                    userSessions[userId].push({
                        logs: [log],
                        startTime: log.createdAt
                    });
                }
            }

            // Check for anomalous session patterns
            for (const [userId, sessions] of Object.entries(userSessions)) {
                for (const session of sessions) {
                    const actionsPerMinute = session.logs.length / (timeWindow / 60);

                    if (actionsPerMinute > threshold) {
                        const recentLog = session.logs.sort((a, b) =>
                            new Date(b.createdAt) - new Date(a.createdAt))[0];

                        results.push({
                            logId: recentLog.id,
                            triggered: true,
                            confidence: Math.min(actionsPerMinute / threshold, 1),
                            message: `High session activity for user ${userId}: ${actionsPerMinute.toFixed(2)} actions/min`,
                            metadata: { userId, actionsPerMinute, threshold, sessionLength: session.logs.length }
                        });
                    }
                }
            }

            return results;
        };
    }

    /**
     * Compile IP anomaly rule
     */
    compileIPRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];

            // Count actions per IP
            const ipActions = {};
            for (const log of logs) {
                const ip = log.ipAddress;
                if (!ip) continue;

                if (!ipActions[ip]) {
                    ipActions[ip] = {};
                }
                ipActions[ip][log.action] = (ipActions[ip][log.action] || 0) + 1;
            }

            // Check for IPs with high concentration of specific actions
            for (const [ip, actions] of Object.entries(ipActions)) {
                const totalActions = Object.values(actions).reduce((sum, count) => sum + count, 0);

                for (const [action, count] of Object.entries(actions)) {
                    const concentration = count / totalActions;

                    if (concentration > threshold) {
                        // Find a log for this IP and action
                        const relevantLog = logs.find(l => l.ipAddress === ip && l.action === action);

                        results.push({
                            logId: relevantLog.id,
                            triggered: true,
                            confidence: concentration,
                            message: `IP ${ip} shows high concentration of ${action} (${(concentration * 100).toFixed(1)}%)`,
                            metadata: { ip, action, concentration, threshold, totalActions }
                        });
                    }
                }
            }

            return results;
        };
    }

    /**
     * Compile user behavior rule
     */
    compileUserBehaviorRule(conditions, threshold) {
        return async (logs, baselines, timeWindow) => {
            const results = [];

            for (const log of logs) {
                const userId = log.actorUserId;
                if (!userId) continue;

                const userBaseline = baselines.userActivity?.[userId];
                if (!userBaseline) {
                    // New user activity
                    results.push({
                        logId: log.id,
                        triggered: true,
                        confidence: 0.7,
                        message: `New user activity: ${userId} performing ${log.action}`,
                        metadata: { userId, action: log.action }
                    });
                    continue;
                }

                // Check for unusual actions for this user
                const actionFrequency = userBaseline.actionsByType?.[log.action] || 0;
                const userTotalActions = userBaseline.totalActions || 1;
                const actionRatio = actionFrequency / userTotalActions;

                if (actionRatio < threshold) {
                    results.push({
                        logId: log.id,
                        triggered: true,
                        confidence: 1 - actionRatio,
                        message: `Unusual action for user ${userId}: ${log.action} (${(actionRatio * 100).toFixed(2)}% of their activity)`,
                        metadata: { userId, action: log.action, actionRatio, threshold }
                    });
                }
            }

            return results;
        };
    }

    /**
     * Add a new rule
     */
    async addRule(ruleData) {
        try {
            const [newRule] = await db.insert(anomalyRules).values({
                name: ruleData.name,
                description: ruleData.description,
                ruleType: ruleData.ruleType,
                conditions: ruleData.conditions,
                severity: ruleData.severity,
                threshold: ruleData.threshold,
                timeWindow: ruleData.timeWindow,
                tenantId: ruleData.tenantId,
                isActive: true,
                createdAt: new Date()
            }).returning();

            // Add to in-memory cache
            this.rules.set(newRule.id, newRule);

            // Compile the new rule
            const compiledRule = this.compileRule(newRule);
            this.compiledRules.set(newRule.id, compiledRule);

            return newRule;
        } catch (error) {
            logError('Error adding rule:', error);
            throw error;
        }
    }

    /**
     * Update an existing rule
     */
    async updateRule(ruleId, updates) {
        try {
            await db.update(anomalyRules)
                .set({
                    ...updates,
                    updatedAt: new Date()
                })
                .where(eq(anomalyRules.id, ruleId));

            // Reload rules
            await this.loadRules();
            await this.compileRules();

            return { success: true };
        } catch (error) {
            logError(`Error updating rule ${ruleId}:`, error);
            throw error;
        }
    }

    /**
     * Get engine status
     */
    getStatus() {
        return {
            rulesLoaded: this.rules.size,
            rulesCompiled: this.compiledRules.size,
            ruleTypes: [...new Set(Array.from(this.rules.values()).map(r => r.ruleType))]
        };
    }
}

export default RuleBasedTriggerEngine;