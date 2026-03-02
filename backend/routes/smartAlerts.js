/**
 * Smart Notifications & Recommendations API Routes
 * Endpoints for budget alerts, recommendations, and spending benchmarks
 * Issue #626: Real-Time Budget Alerts & Smart Notifications
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import * as smartNotificationsService from '../services/smartNotificationsService.js';
import * as smartRecommendationsService from '../services/smartRecommendationsService.js';
import * as smartBenchmarkingService from '../services/smartBenchmarkingService.js';
import logger from '../utils/logger.js';
import db from '../config/db.js';
import { eq, and } from 'drizzle-orm';
import { categories, tenants, tenantMembers } from '../db/schema.js';
import { dailySpendingSummary } from '../db/schema-smart-notifications.js';

const router = express.Router();

/**
 * @swagger
 * /smart-alerts/rules:
 *   post:
 *     summary: Create a smart alert rule with multi-level thresholds
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoryId, budgetAmount]
 *             properties:
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               budgetAmount:
 *                 type: number
 *               period:
 *                 type: string
 *                 enum: [daily, weekly, monthly, quarterly, yearly]
 *                 default: monthly
 *               alertLevels:
 *                 type: array
 *                 items:
 *                   type: number
 *                 default: [80, 95, 100, 150]
 *                 description: Alert thresholds as percentages of budget
 *               notificationChannels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [in-app, email, sms, push]
 *                 default: [in-app, email]
 *               maxNotificationsPerDay:
 *                 type: integer
 *                 default: 3
 *                 description: Prevent alert fatigue
 *               quietHours:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   start_hour:
 *                     type: integer
 *                   end_hour:
 *                     type: integer
 *                   timezone:
 *                     type: string
 */
router.post(
  '/rules',
  protect,
  body('categoryId').isUUID('all').withMessage('Invalid category ID'),
  body('budgetAmount').isFloat({ min: 0 }).withMessage('Budget amount must be positive'),
  body('period').optional().isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  body('alertLevels').optional().isArray().withMessage('Alert levels must be an array'),
  body('alertLevels.*').optional().isInt({ min: 1, max: 200 }).withMessage('Alert levels must be between 1-200'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { categoryId, budgetAmount, ...config } = req.body;

      // Verify user has access to this category
      const category = await db.query.categories.findFirst({
        where: and(eq(categories.id, categoryId), eq(categories.userId, req.user.id))
      });

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      // Get user's tenant
      const tenantMembership = await db.query.tenantMembers.findFirst({
        where: and(
          eq(tenantMembers.userId, req.user.id),
          eq(tenantMembers.tenantId, category.tenantId)
        )
      });

      if (!tenantMembership) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const rule = await smartNotificationsService.createSmartAlertRule(
        req.user.id,
        categoryId,
        {
          budgetAmount,
          tenantId: category.tenantId,
          rulesName: config.rulesName || `${category.name} Budget Alert`,
          ...config
        }
      );

      res.status(201).json({
        success: true,
        data: rule
      });
    } catch (error) {
      logger.error('Error creating smart alert rule', {
        error: error.message,
        userId: req.user.id
      });
      res.status(500).json({ error: 'Failed to create alert rule', message: error.message });
    }
  }
);

/**
 * @swagger
 * /smart-alerts/rules:
 *   get:
 *     summary: Get all smart alert rules for user
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional category filter
 */
router.get('/rules', protect, async (req, res) => {
  try {
    const { categoryId } = req.query;
    const rules = await smartNotificationsService.getSmartAlertRules(
      req.user.id,
      categoryId
    );

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    logger.error('Error fetching smart alert rules', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

/**
 * @swagger
 * /smart-alerts/rules/:ruleId:
 *   put:
 *     summary: Update a smart alert rule
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       -  in: path
 *          name: ruleId
 *          required: true
 *          schema:
 *            type: string
 *            format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               budgetAmount:
 *                 type: number
 *               notificationChannels:
 *                 type: array
 *                 items:
 *                   type: string
 *               maxNotificationsPerDay:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 */
router.put(
  '/rules/:ruleId',
  protect,
  param('ruleId').isUUID('all').withMessage('Invalid rule ID'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updated = await smartNotificationsService.updateSmartAlertRule(
        req.params.ruleId,
        req.body
      );

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      logger.error('Error updating smart alert rule', {
        error: error.message,
        userId: req.user.id
      });
      res.status(500).json({ error: 'Failed to update rule' });
    }
  }
);

/**
 * @swagger
 * /smart-alerts/rules/:ruleId:
 *   delete:
 *     summary: Disable a smart alert rule
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.delete('/rules/:ruleId', protect, async (req, res) => {
  try {
    await smartNotificationsService.disableSmartAlertRule(
      req.params.ruleId,
      req.user.id
    );

    res.json({ success: true, message: 'Rule disabled' });
  } catch (error) {
    logger.error('Error disabling smart alert rule', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to disable rule' });
  }
});

/**
 * @swagger
 * /smart-alerts/notifications:
 *   get:
 *     summary: Get notification history for user
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [budget_alert, recommendation, summary]
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 */
router.get('/notifications', protect, async (req, res) => {
  try {
    const notifications = await smartNotificationsService.getNotificationHistory(
      req.user.id,
      req.query
    );

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    logger.error('Error fetching notification history', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * @swagger
 * /smart-alerts/notifications/:notificationId/read:
 *   put:
 *     summary: Mark notification as read
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 */
router.put('/notifications/:notificationId/read', protect, async (req, res) => {
  try {
    await smartNotificationsService.markNotificationAsRead(
      req.params.notificationId,
      req.user.id
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Error marking notification as read', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ========== RECOMMENDATIONS ENDPOINTS ==========

/**
 * @swagger
 * /smart-alerts/recommendations:
 *   get:
 *     summary: Get spending recommendations for user
 *     tags: [Recommendations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [suggested, accepted, implemented, dismissed]
 *           default: suggested
 */
router.get('/recommendations', protect, async (req, res) => {
  try {
    const recommendations = await smartRecommendationsService.getRecommendations(
      req.user.id,
      req.query
    );

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    logger.error('Error fetching recommendations', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

/**
 * @swagger
 * /smart-alerts/recommendations/:recommendationId/accept:
 *   put:
 *     summary: Accept a recommendation
 *     tags: [Recommendations]
 *     security:
 *       - bearerAuth: []
 */
router.put('/recommendations/:recommendationId/accept', protect, async (req, res) => {
  try {
    const recommendation = await smartRecommendationsService.acceptRecommendation(
      req.params.recommendationId,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Recommendation accepted',
      data: recommendation
    });
  } catch (error) {
    logger.error('Error accepting recommendation', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to accept recommendation' });
  }
});

/**
 * @swagger
 * /smart-alerts/recommendations/:recommendationId/dismiss:
 *   put:
 *     summary: Dismiss a recommendation
 *     tags: [Recommendations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 */
router.put('/recommendations/:recommendationId/dismiss', protect, async (req, res) => {
  try {
    const recommendation = await smartRecommendationsService.dismissRecommendation(
      req.params.recommendationId,
      req.user.id,
      req.body.reason
    );

    res.json({
      success: true,
      message: 'Recommendation dismissed',
      data: recommendation
    });
  } catch (error) {
    logger.error('Error dismissing recommendation', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to dismiss recommendation' });
  }
});

// ========== BENCHMARKING ENDPOINTS ==========

/**
 * @swagger
 * /smart-alerts/benchmarks/:categoryId:
 *   get:
 *     summary: Get spending benchmarks for a category
 *     tags: [Benchmarks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [monthly, quarterly, yearly]
 *           default: monthly
 */
router.get('/benchmarks/:categoryId', protect, async (req, res) => {
  try {
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, req.params.categoryId)
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const benchmarks = await smartBenchmarkingService.getBenchmarks(
      req.params.categoryId,
      category.tenantId,
      req.query
    );

    res.json({
      success: true,
      data: benchmarks
    });
  } catch (error) {
    logger.error('Error fetching benchmarks', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch benchmarks' });
  }
});

/**
 * @swagger
 * /smart-alerts/comparison/:categoryId:
 *   get:
 *     summary: Compare user's spending to peers
 *     tags: [Benchmarks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get('/comparison/:categoryId', protect, async (req, res) => {
  try {
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, req.params.categoryId)
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const comparison = await smartBenchmarkingService.compareToPheer(
      req.user.id,
      req.params.categoryId,
      category.tenantId
    );

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    logger.error('Error fetching peer comparison', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch comparison data' });
  }
});

// ========== DASHBOARD ENDPOINTS ==========

/**
 * @swagger
 * /smart-alerts/dashboard:
 *   get:
 *     summary: Get comprehensive spending dashboard with alerts, recommendations, and benchmarks
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional category filter
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
    const { categoryId } = req.query;

    // Get active alert rules
    const alertRules = await smartNotificationsService.getSmartAlertRules(
      req.user.id,
      categoryId
    );

    // Get pending recommendations
    const recommendations = await smartRecommendationsService.getRecommendations(
      req.user.id,
      { categoryId, status: 'suggested', limit: 5 }
    );

    // Get recent notifications
    const recentNotifications = await smartNotificationsService.getNotificationHistory(
      req.user.id,
      { limit: 10, days: 7 }
    );

    // Get daily summary if available
    const today = new Date().toISOString().split('T')[0];
    const dailySummary = await db.query.dailySpendingSummary.findFirst({
      where: and(
        eq(dailySpendingSummary.userId, req.user.id),
        eq(dailySpendingSummary.summaryDate, today)
      )
    });

    // Get comparison data if category specified
    let comparison = null;
    if (categoryId) {
      comparison = await smartBenchmarkingService.compareToPheer(
        req.user.id,
        categoryId,
        null
      );
    }

    res.json({
      success: true,
      data: {
        alertRules: alertRules.length,
        activeRules: alertRules.filter(r => r.isActive).length,
        pendingRecommendations: recommendations.length,
        recentNotifications,
        dailySummary,
        peerComparison: comparison,
        summary: {
          totalAlertRules: alertRules.length,
          totalRecommendations: recommendations.length,
          notificationsThisWeek: recentNotifications.length
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard data', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * @swagger
 * /smart-alerts/daily-summary:
 *   get:
 *     summary: Get today's spending summary
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
router.get('/daily-summary', protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const summary = await db.query.dailySpendingSummary.findFirst({
      where: and(
        eq(dailySpendingSummary.userId, req.user.id),
        eq(dailySpendingSummary.summaryDate, today)
      )
    });

    res.json({
      success: true,
      data: summary || {
        summaryDate: today,
        totalSpendingToday: 0,
        transactionCount: 0,
        alertsTriggered: [],
        budgetStatus: {}
      }
    });
  } catch (error) {
    logger.error('Error fetching daily summary', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch daily summary' });
  }
});

export default router;
