import express from 'express';
import { param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import expenseAnomalyGoalImpactService from '../services/expenseAnomalyGoalImpactService.js';

const router = express.Router();

/**
 * @swagger
 * /expense-anomaly-impact/scan:
 *   get:
 *     summary: Detect spending anomaly and recalculate safe goal allocation
 *     tags: [Expense Anomaly Goal Impact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: notify
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Send notifications for impacted goals
 *     responses:
 *       200:
 *         description: Anomaly detection and impact recalculation completed
 */
router.get('/scan', protect, [
  query('notify').optional().isBoolean().withMessage('notify must be boolean')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const userId = req.user.id;
  const notify = req.query.notify !== 'false';

  const analysis = await expenseAnomalyGoalImpactService.detectAndRecalculate(userId, { notify });

  return new ApiResponse(
    200,
    { analysis },
    analysis.isAnomalous
      ? 'Expense anomaly impact analysis completed'
      : 'No significant spending anomaly detected'
  ).send(res);
}));

/**
 * @swagger
 * /expense-anomaly-impact/preview:
 *   get:
 *     summary: Preview anomaly impact recalculation without sending notifications
 *     tags: [Expense Anomaly Goal Impact]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Impact preview generated
 */
router.get('/preview', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const analysis = await expenseAnomalyGoalImpactService.detectAndRecalculate(userId, { notify: false });

  return new ApiResponse(
    200,
    { analysis },
    'Expense anomaly impact preview generated'
  ).send(res);
}));

/**
 * @swagger
 * /expense-anomaly-impact/alerts:
 *   get:
 *     summary: Get expense anomaly impact alerts
 *     tags: [Expense Anomaly Goal Impact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 */
router.get('/alerts', protect, [
  query('goalId').optional().isUUID().withMessage('Invalid goal ID'),
  query('unreadOnly').optional().isBoolean().withMessage('unreadOnly must be boolean'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const userId = req.user.id;
  const { goalId, unreadOnly, limit = 20, offset = 0 } = req.query;

  const alerts = await expenseAnomalyGoalImpactService.getImpactAlerts({
    userId,
    goalId,
    unreadOnly: unreadOnly === 'true',
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10)
  });

  return new ApiResponse(
    200,
    {
      alerts,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: alerts.length
      }
    },
    'Expense anomaly impact alerts retrieved successfully'
  ).send(res);
}));

/**
 * @swagger
 * /expense-anomaly-impact/alerts/{alertId}/read:
 *   put:
 *     summary: Mark an expense anomaly impact alert as read
 *     tags: [Expense Anomaly Goal Impact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Alert marked as read
 */
router.put('/alerts/:alertId/read', protect, [
  param('alertId').isUUID().withMessage('Invalid alert ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { alertId } = req.params;
  const userId = req.user.id;

  const alert = await expenseAnomalyGoalImpactService.markAlertRead(alertId, userId);

  if (!alert) {
    return new ApiResponse(404, null, 'Alert not found').send(res);
  }

  return new ApiResponse(200, { alert }, 'Alert marked as read').send(res);
}));

export default router;
