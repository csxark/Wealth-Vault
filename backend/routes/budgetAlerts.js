/**
 * Budget Alerts API Routes
 * 
 * Provides endpoints for budget alert management and real-time budget monitoring
 * with race condition prevention through materialized views and optimistic locking
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { budgetAlerts, budgetAggregates } from '../db/schema.js';
import budgetAlertService from '../services/budgetAlertService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /budget-alerts/summary:
 *   get:
 *     summary: Get budget summary with aggregated spending data
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Category ID to get budget summary for
 *     responses:
 *       200:
 *         description: Budget summary with daily, weekly, monthly, yearly aggregates
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Category not found
 */
router.get('/summary', protect, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { categoryId } = req.query;

    if (!categoryId) {
      return res.status(400).json({
        error: 'categoryId is required',
      });
    }

    const summary = await budgetAlertService.getBudgetSummary(req.user.id, categoryId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error getting budget summary', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to get budget summary',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /budget-alerts/create:
 *   post:
 *     summary: Create a new budget alert
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoryId, threshold, alertType]
 *             properties:
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               alertType:
 *                 type: string
 *                 enum: [threshold, daily_limit, weekly_limit, monthly_budget]
 *               threshold:
 *                 type: number
 *                 description: Alert triggers at this amount
 *               thresholdPercentage:
 *                 type: number
 *                 default: 80
 *                 description: Or percentage of budget
 *               scope:
 *                 type: string
 *                 enum: [daily, weekly, monthly, yearly]
 *                 default: monthly
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: [email, in-app]
 *                 description: Notification channels
 *     responses:
 *       201:
 *         description: Budget alert created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Category not found
 */
router.post(
  '/create',
  protect,
  body('categoryId').isUUID('all').withMessage('Invalid category ID'),
  body('alertType')
    .isIn(['threshold', 'daily_limit', 'weekly_limit', 'monthly_budget'])
    .withMessage('Invalid alert type'),
  body('threshold').isFloat({ min: 0 }).withMessage('Threshold must be positive'),
  body('thresholdPercentage').optional().isFloat({ min: 1, max: 100 }).withMessage('Invalid percentage'),
  body('scope')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'yearly'])
    .withMessage('Invalid scope'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { categoryId, alertType, threshold, thresholdPercentage, scope, channels } = req.body;

      // Verify category exists and belongs to user
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, categoryId),
      });

      if (!category || category.userId !== req.user.id) {
        return res.status(404).json({
          error: 'Category not found',
        });
      }

      // Create alert
      const alert = await budgetAlertService.createBudgetAlert(req.user.id, categoryId, {
        alertType,
        threshold,
        thresholdPercentage,
        scope,
        channels,
      });

      logger.info('Budget alert created', {
        userId: req.user.id,
        categoryId,
        alertId: alert.id,
        alertType,
      });

      res.status(201).json({
        success: true,
        data: alert,
      });
    } catch (error) {
      logger.error('Error creating budget alert', {
        error: error.message,
        userId: req.user.id,
      });

      res.status(500).json({
        error: 'Failed to create budget alert',
        message: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /budget-alerts:
 *   get:
 *     summary: Get all budget alerts for user
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by category ID
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of budget alerts
 */
router.get('/', protect, async (req, res) => {
  try {
    const { categoryId, isActive } = req.query;

    const conditions = [eq(budgetAlerts.userId, req.user.id)];

    if (categoryId) {
      conditions.push(eq(budgetAlerts.categoryId, categoryId));
    }

    if (isActive !== undefined) {
      conditions.push(eq(budgetAlerts.isActive, isActive === 'true'));
    }

    const alerts = await db.query.budgetAlerts.findMany({
      where: and(...conditions),
    });

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    logger.error('Error fetching budget alerts', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to fetch budget alerts',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /budget-alerts/{alertId}:
 *   get:
 *     summary: Get a specific budget alert
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: Budget alert details
 *       404:
 *         description: Alert not found
 */
router.get('/:alertId', protect, param('alertId').isUUID('all'), async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await db.query.budgetAlerts.findFirst({
      where: and(
        eq(budgetAlerts.id, alertId),
        eq(budgetAlerts.userId, req.user.id)
      ),
    });

    if (!alert) {
      return res.status(404).json({
        error: 'Budget alert not found',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    logger.error('Error fetching budget alert', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to fetch budget alert',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /budget-alerts/{alertId}:
 *   patch:
 *     summary: Update a budget alert
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               threshold:
 *                 type: number
 *               thresholdPercentage:
 *                 type: number
 *               scope:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Budget alert updated
 *       404:
 *         description: Alert not found
 */
router.patch('/:alertId', protect, param('alertId').isUUID('all'), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { threshold, thresholdPercentage, scope, isActive, channels } = req.body;

    const alert = await db.query.budgetAlerts.findFirst({
      where: and(
        eq(budgetAlerts.id, alertId),
        eq(budgetAlerts.userId, req.user.id)
      ),
    });

    if (!alert) {
      return res.status(404).json({
        error: 'Budget alert not found',
      });
    }

    const updateData = {};
    if (threshold !== undefined) updateData.threshold = threshold;
    if (thresholdPercentage !== undefined) updateData.thresholdPercentage = thresholdPercentage;
    if (scope !== undefined) updateData.scope = scope;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (channels !== undefined) updateData.notificationChannels = channels;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
      });
    }

    const [updated] = await db
      .update(budgetAlerts)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(budgetAlerts.id, alertId))
      .returning();

    logger.info('Budget alert updated', {
      userId: req.user.id,
      alertId,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error('Error updating budget alert', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to update budget alert',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /budget-alerts/{alertId}:
 *   delete:
 *     summary: Delete a budget alert
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: Budget alert deleted
 *       404:
 *         description: Alert not found
 */
router.delete('/:alertId', protect, param('alertId').isUUID('all'), async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await db.query.budgetAlerts.findFirst({
      where: and(
        eq(budgetAlerts.id, alertId),
        eq(budgetAlerts.userId, req.user.id)
      ),
    });

    if (!alert) {
      return res.status(404).json({
        error: 'Budget alert not found',
      });
    }

    await db
      .delete(budgetAlerts)
      .where(eq(budgetAlerts.id, alertId));

    logger.info('Budget alert deleted', {
      userId: req.user.id,
      alertId,
    });

    res.json({
      success: true,
      message: 'Budget alert deleted',
    });
  } catch (error) {
    logger.error('Error deleting budget alert', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to delete budget alert',
      message: error.message,
    });
  }
});

export default router;
