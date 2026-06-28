/**
 * Smart Notifications Service
 * Handles real-time multi-level budget alerts and notification delivery
 * Prevents alert fatigue through intelligent scheduling and deduplication
 * Supports multiple notification channels (email, in-app, push, SMS)
 */

import db from '../config/db.js';
import {
    smartAlertRules,
    notificationHistory,
    expenses,
    categories,
    users
} from '../db/schema-smart-notifications.js';
import { budgetAlerts } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import * as emailService from './emailService.js';
import * as notificationService from './notificationService.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'smart_notifications:';
const NOTIFICATION_COOLDOWN_MIN = 3600000; // 1 hour default cooldown between alerts

/**
 * Create or update smart alert rules with multi-level thresholds
 * Supports 80%, 95%, 100%, 150% of budget thresholds
 */
export const createSmartAlertRule = async (userId, categoryId, config) => {
    try {
        const {
            budgetAmount,
            period = 'monthly',
            notificationChannels = ['in-app', 'email'],
            alertLevels = [80, 95, 100, 150],
            maxNotificationsPerDay = 3,
            quietHours = null,
            sendDailySummary = false,
            sendWeeklySummary = false,
            ruleType = 'percentage_based',
            tenantId
        } = config;

        // Build alert thresholds based on provided levels
        const alertThresholds = buildAlertThresholds(budgetAmount, alertLevels);

        const rule = await db.insert(smartAlertRules).values({
            tenantId,
            userId,
            categoryId,
            rulesName: `${config.rulesName || 'Budget Alert Rule'}`,
            ruleType,
            alertThresholds,
            period,
            budgetAmount: budgetAmount.toString(),
            notificationEnabled: true,
            notificationChannels,
            quietHours: quietHours || {
                enabled: false,
                start_hour: 20,
                end_hour: 8,
                timezone: 'UTC'
            },
            maxNotificationsPerDay,
            sendDailySummary,
            sendWeeklySummary,
            isActive: true,
            metadata: config.metadata || {}
        }).returning();

        logger.info('Smart alert rule created', {
            userId,
            categoryId,
            budgetAmount,
            alertLevels
        });

        // Invalidate cache
        await cacheService.delete(`${CACHE_PREFIX}${userId}:rules`);

        return rule[0];
    } catch (error) {
        logger.error('Error creating smart alert rule', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

/**
 * Build alert thresholds based on percentage levels
 * Returns array of threshold objects for each alert level
 */
const buildAlertThresholds = (budgetAmount, percentages = [80, 95, 100, 150]) => {
    const descriptions = {
        80: 'Warning - 80% of budget reached',
        95: 'Alert - 95% of budget reached',
        100: 'Critical - Budget fully spent',
        150: 'Overspent - 50% over budget'
    };

    const severities = {
        80: 'info',
        95: 'warning',
        100: 'danger',
        150: 'critical'
    };

    return percentages.map((pct, idx) => ({
        level: idx + 1,
        percentage: pct,
        amount: (budgetAmount * pct / 100).toFixed(2),
        description: descriptions[pct] || `Alert at ${pct}% of budget`,
        severity: severities[pct] || 'warning'
    }));
};

/**
 * Evaluate all smart alert rules for a user and trigger appropriate notifications
 * Respects quiet hours and notification frequency limits
 */
export const evaluateSmartAlerts = async (userId, categoryId, currentSpent, budgetAmount, tenantId) => {
    try {
        // Get all active alert rules for this category
        const rules = await db.query.smartAlertRules.findMany({
            where: and(
                eq(smartAlertRules.userId, userId),
                eq(smartAlertRules.categoryId, categoryId),
                eq(smartAlertRules.isActive, true)
            )
        });

        if (!rules || rules.length === 0) {
            return [];
        }

        const triggeredAlerts = [];
        const now = new Date();

        for (const rule of rules) {
            // Check if we should send notifications (quiet hours, rate limiting)
            const shouldNotify = await shouldSendNotification(userId, rule, now);
            if (!shouldNotify) {
                continue;
            }

            // Evaluate each threshold level
            const thresholds = rule.alertThresholds || [];
            for (const threshold of thresholds) {
                const thresholdAmount = parseFloat(threshold.amount || budgetAmount * threshold.percentage / 100);

                // Check if current spending meets this threshold
                if (currentSpent >= thresholdAmount) {
                    // Check deduplication - don't send same alert twice
                    const isDuplicate = await checkAlertDuplication(
                        userId,
                        rule.id,
                        threshold.level,
                        currentSpent
                    );

                    if (!isDuplicate) {
                        triggeredAlerts.push({
                            ruleId: rule.id,
                            level: threshold.level,
                            percentage: threshold.percentage,
                            severity: threshold.severity,
                            description: threshold.description,
                            currentSpent,
                            budgetAmount,
                            channels: rule.notificationChannels
                        });

                        // Handle notification delivery
                        await deliverAlert(userId, categoryId, rule, threshold, currentSpent, tenantId);

                        // Update rule trigger count
                        await db.update(smartAlertRules)
                            .set({
                                lastTriggeredAt: now,
                                triggerCount: sql`trigger_count + 1`
                            })
                            .where(eq(smartAlertRules.id, rule.id));
                    }
                }
            }
        }

        return triggeredAlerts;
    } catch (error) {
        logger.error('Error evaluating smart alerts', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

/**
 * Check if notification should be sent based on quiet hours and rate limiting
 */
const shouldSendNotification = async (userId, rule, now) => {
    try {
        // Check quiet hours
        if (rule.quietHours && rule.quietHours.enabled) {
            const { start_hour, end_hour, timezone } = rule.quietHours;
            const currentHour = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getHours();

            if (start_hour < end_hour) {
                // Normal case: quiet hours don't cross midnight
                if (currentHour >= start_hour && currentHour < end_hour) {
                    logger.debug('In quiet hours, skipping notification', { userId });
                    return false;
                }
            } else {
                // Quiet hours cross midnight
                if (currentHour >= start_hour || currentHour < end_hour) {
                    logger.debug('In quiet hours, skipping notification', { userId });
                    return false;
                }
            }
        }

        // Check daily notification limit
        const maxPerDay = rule.maxNotificationsPerDay || 3;
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const notificationsToday = await db.query.notificationHistory.findMany({
            where: and(
                eq(notificationHistory.userId, userId),
                eq(notificationHistory.relatedAlertRuleId, rule.id),
                gte(notificationHistory.sentAt, todayStart)
            )
        });

        if (notificationsToday.length >= maxPerDay) {
            logger.debug('Daily notification limit reached', { userId, limit: maxPerDay });
            return false;
        }

        return true;
    } catch (error) {
        logger.error('Error checking notification eligibility', {
            error: error.message,
            userId
        });
        return true; // Default to sending if error occurs
    }
};

/**
 * Check if alert is a duplicate (already sent at this level)
 */
const checkAlertDuplication = async (userId, ruleId, level, currentSpent) => {
    try {
        // Get last 5 notifications for this rule
        const lastNotifications = await db.query.notificationHistory.findMany({
            where: and(
                eq(notificationHistory.userId, userId),
                eq(notificationHistory.relatedAlertRuleId, ruleId),
                eq(notificationHistory.notificationType, 'budget_alert')
            ),
            orderBy: desc(notificationHistory.sentAt),
            limit: 5
        });

        // Check if we sent a notification at this level recently
        for (const notification of lastNotifications) {
            const richContent = notification.richContent || {};
            if (richContent.level === level) {
                // Check if it's within cooldown window
                const timeSinceLast = Date.now() - new Date(notification.sentAt).getTime();
                if (timeSinceLast < NOTIFICATION_COOLDOWN_MIN) {
                    logger.debug('Alert deduplicated - recently sent', {
                        userId,
                        ruleId,
                        level
                    });
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        logger.error('Error checking alert duplication', {
            error: error.message,
            userId
        });
        return false; // Default to not duplicate if error
    }
};

/**
 * Deliver alert notification through configured channels
 */
const deliverAlert = async (userId, categoryId, rule, threshold, currentSpent, tenantId) => {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });

        const category = await db.query.categories.findFirst({
            where: eq(categories.id, categoryId)
        });

        if (!user || !category) {
            logger.warn('User or category not found for alert delivery', {
                userId,
                categoryId
            });
            return;
        }

        const notificationContent = {
            title: `Budget Alert: ${category.name}`,
            message: threshold.description,
            level: threshold.level,
            percentage: threshold.percentage,
            currentSpent: parseFloat(currentSpent),
            severity: threshold.severity,
            categoryName: category.name,
            timestamp: new Date().toISOString()
        };

        const channels = rule.notificationChannels || ['in-app'];

        // Send through each channel
        for (const channel of channels) {
            try {
                if (channel === 'email') {
                    await emailService.sendBudgetAlertEmail(user.email, {
                        userName: user.displayName || user.email,
                        categoryName: category.name,
                        ...notificationContent
                    });
                } else if (channel === 'in-app') {
                    await notificationService.createNotification(userId, {
                        type: 'budget_alert',
                        ...notificationContent
                    });
                } else if (channel === 'sms') {
                    // SMS implementation would go here
                    logger.info('SMS notifications not yet implemented for budget alerts');
                } else if (channel === 'push') {
                    // Push notification implementation would go here
                    logger.info('Push notifications not yet implemented for budget alerts');
                }

                // Record notification in history
                await db.insert(notificationHistory).values({
                    tenantId,
                    userId,
                    notificationType: 'budget_alert',
                    relatedAlertRuleId: rule.id,
                    title: notificationContent.title,
                    message: notificationContent.message,
                    richContent: notificationContent,
                    channelsAttempted: [channel],
                    channelsSucceeded: [channel],
                    deliveryStatus: 'delivered',
                    deliveredAt: new Date(),
                    sentAt: new Date()
                });
            } catch (channelError) {
                logger.error('Error sending notification channel', {
                    error: channelError.message,
                    channel,
                    userId
                });

                // Record failed delivery
                await db.insert(notificationHistory).values({
                    tenantId,
                    userId,
                    notificationType: 'budget_alert',
                    relatedAlertRuleId: rule.id,
                    title: notificationContent.title,
                    message: notificationContent.message,
                    richContent: notificationContent,
                    channelsAttempted: [channel],
                    deliveryStatus: 'failed',
                    failureReason: channelError.message,
                    sentAt: new Date()
                });
            }
        }

        logger.info('Budget alert delivered', {
            userId,
            level: threshold.level,
            channels: channels.length
        });
    } catch (error) {
        logger.error('Error delivering alert', {
            error: error.message,
            userId,
            categoryId
        });
    }
};

/**
 * Get all smart alert rules for a user
 */
export const getSmartAlertRules = async (userId, categoryId = null) => {
    try {
        const cacheKey = `${CACHE_PREFIX}${userId}:rules:${categoryId || 'all'}`;
        const cached = await cacheService.get(cacheKey);

        if (cached) {
            return cached;
        }

        const where = eq(smartAlertRules.userId, userId);
        const rules = await db.query.smartAlertRules.findMany({
            where: categoryId
                ? and(where, eq(smartAlertRules.categoryId, categoryId))
                : where
        });

        // Cache for 30 minutes
        await cacheService.set(cacheKey, rules, 1800);

        return rules;
    } catch (error) {
        logger.error('Error retrieving smart alert rules', {
            error: error.message,
            userId
        });
        throw error;
    }
};

/**
 * Update smart alert rule
 */
export const updateSmartAlertRule = async (ruleId, config) => {
    try {
        const updated = await db.update(smartAlertRules)
            .set({
                rulesName: config.rulesName,
                budgetAmount: config.budgetAmount?.toString(),
                notificationEnabled: config.notificationEnabled,
                notificationChannels: config.notificationChannels,
                quietHours: config.quietHours,
                maxNotificationsPerDay: config.maxNotificationsPerDay,
                sendDailySummary: config.sendDailySummary,
                sendWeeklySummary: config.sendWeeklySummary,
                isActive: config.isActive,
                updatedAt: new Date()
            })
            .where(eq(smartAlertRules.id, ruleId))
            .returning();

        // Invalidate cache
        if (updated.length > 0) {
            await cacheService.delete(`${CACHE_PREFIX}${updated[0].userId}:rules`);
        }

        return updated[0];
    } catch (error) {
        logger.error('Error updating smart alert rule', {
            error: error.message,
            ruleId
        });
        throw error;
    }
};

/**
 * Disable smart alert rule
 */
export const disableSmartAlertRule = async (ruleId, userId) => {
    try {
        await db.update(smartAlertRules)
            .set({
                isActive: false,
                updatedAt: new Date()
            })
            .where(and(
                eq(smartAlertRules.id, ruleId),
                eq(smartAlertRules.userId, userId)
            ));

        // Invalidate cache
        await cacheService.delete(`${CACHE_PREFIX}${userId}:rules`);

        logger.info('Smart alert rule disabled', { ruleId, userId });
    } catch (error) {
        logger.error('Error disabling smart alert rule', {
            error: error.message,
            ruleId
        });
        throw error;
    }
};

/**
 * Get notification history for user
 */
export const getNotificationHistory = async (userId, filters = {}) => {
    try {
        const { limit = 50, offset = 0, type = null, days = 30 } = filters;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const where = and(
            eq(notificationHistory.userId, userId),
            gte(notificationHistory.sentAt, cutoffDate)
        );

        const notifications = await db.query.notificationHistory.findMany({
            where: type
                ? and(where, eq(notificationHistory.notificationType, type))
                : where,
            orderBy: desc(notificationHistory.sentAt),
            limit,
            offset
        });

        return notifications;
    } catch (error) {
        logger.error('Error retrieving notification history', {
            error: error.message,
            userId
        });
        throw error;
    }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId, userId) => {
    try {
        await db.update(notificationHistory)
            .set({
                readAt: new Date(),
                interactionData: { clicked: true, dismissed: false }
            })
            .where(and(
                eq(notificationHistory.id, notificationId),
                eq(notificationHistory.userId, userId)
            ));

        logger.info('Notification marked as read', {
            notificationId,
            userId
        });
    } catch (error) {
        logger.error('Error marking notification as read', {
            error: error.message,
            notificationId
        });
        throw error;
    }
};

export default {
    createSmartAlertRule,
    evaluateSmartAlerts,
    getSmartAlertRules,
    updateSmartAlertRule,
    disableSmartAlertRule,
    getNotificationHistory,
    markNotificationAsRead
};
