import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import goalEarlyWarningService from '../services/goalEarlyWarningService.js';

const router = express.Router();

/**
 * @swagger
 * /goal-early-warning/alerts:
 *   get:
 *     summary: Get alerts for authenticated user
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter alerts by goal ID
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *         description: Return only unread alerts
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

  const { goalId, unreadOnly, limit = 20, offset = 0 } = req.query;
  const userId = req.user.id;

  const alerts = await goalEarlyWarningService.getAlerts({
    userId,
    goalId,
    unreadOnly: unreadOnly === 'true',
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  return new ApiResponse(200, { alerts, pagination: { limit: parseInt(limit), offset: parseInt(offset), count: alerts.length } }, 'Alerts retrieved successfully').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/alerts/{alertId}/read:
 *   put:
 *     summary: Mark an alert as read
 *     tags: [Goal Early Warning]
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
  param('alertId').isUUID().withMessage('Invalid alert ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { alertId } = req.params;
  const userId = req.user.id;

  const alert = await goalEarlyWarningService.markAlertRead(alertId, userId);

  if (!alert) {
    return new ApiResponse(404, null, 'Alert not found').send(res);
  }

  return new ApiResponse(200, { alert }, 'Alert marked as read').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/alerts/{alertId}/dismiss:
 *   put:
 *     summary: Dismiss an alert
 *     tags: [Goal Early Warning]
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
 *         description: Alert dismissed
 */
router.put('/alerts/:alertId/dismiss', protect, [
  param('alertId').isUUID().withMessage('Invalid alert ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { alertId } = req.params;
  const userId = req.user.id;

  const alert = await goalEarlyWarningService.dismissAlert(alertId, userId);

  if (!alert) {
    return new ApiResponse(404, null, 'Alert not found').send(res);
  }

  return new ApiResponse(200, { alert }, 'Alert dismissed').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/alerts/{alertId}/action:
 *   post:
 *     summary: Record action taken on an alert
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 description: Action taken (e.g., "increase_contributions", "extend_deadline")
 *     responses:
 *       200:
 *         description: Action recorded successfully
 */
router.post('/alerts/:alertId/action', protect, [
  param('alertId').isUUID().withMessage('Invalid alert ID'),
  body('action').isString().notEmpty().withMessage('Action is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { alertId } = req.params;
  const { action } = req.body;
  const userId = req.user.id;

  const alert = await goalEarlyWarningService.recordAlertAction(alertId, userId, action);

  if (!alert) {
    return new ApiResponse(404, null, 'Alert not found').send(res);
  }

  return new ApiResponse(200, { alert }, 'Action recorded successfully').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/goals/{goalId}/risk:
 *   get:
 *     summary: Get current risk score for a goal
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Risk score retrieved successfully
 */
router.get('/goals/:goalId/risk', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;

  const riskData = await goalEarlyWarningService.calculateGoalRiskScore(goalId);

  if (!riskData) {
    return new ApiResponse(404, null, 'Goal not found or insufficient data').send(res);
  }

  return new ApiResponse(200, { risk: riskData }, 'Risk score retrieved successfully').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/goals/{goalId}/risk/track:
 *   post:
 *     summary: Manually trigger risk tracking for a goal
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Risk tracked successfully
 */
router.post('/goals/:goalId/risk/track', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const userId = req.user.id;

  const result = await goalEarlyWarningService.trackRiskScore(goalId, userId);

  if (!result) {
    return new ApiResponse(404, null, 'Goal not found or insufficient data').send(res);
  }

  return new ApiResponse(200, result, 'Risk tracked successfully').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/goals/{goalId}/risk/history:
 *   get:
 *     summary: Get risk score history for a goal
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Risk history retrieved successfully
 */
router.get('/goals/:goalId/risk/history', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const { limit = 30 } = req.query;

  const history = await goalEarlyWarningService.getRiskHistory(goalId, parseInt(limit));

  return new ApiResponse(200, { history, count: history.length }, 'Risk history retrieved successfully').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/goals/{goalId}/contribution-streak:
 *   post:
 *     summary: Update contribution streak (called when contribution is made or missed)
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contributionMade
 *             properties:
 *               contributionMade:
 *                 type: boolean
 *                 description: True if contribution was made, false if missed
 *     responses:
 *       200:
 *         description: Contribution streak updated
 */
router.post('/goals/:goalId/contribution-streak', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
  body('contributionMade').isBoolean().withMessage('contributionMade must be boolean'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const { contributionMade } = req.body;
  const userId = req.user.id;

  const streak = await goalEarlyWarningService.updateContributionStreak(goalId, userId, contributionMade);

  if (!streak) {
    return new ApiResponse(404, null, 'Goal not found').send(res);
  }

  return new ApiResponse(200, { streak }, 'Contribution streak updated').send(res);
}));

/**
 * @swagger
 * /goal-early-warning/monitor:
 *   post:
 *     summary: Monitor all active goals for the user (manual trigger)
 *     tags: [Goal Early Warning]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoring completed
 */
router.post('/monitor', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const results = await goalEarlyWarningService.monitorUserGoals(userId);

  return new ApiResponse(200, { results, monitored: results.length }, 'Goal monitoring completed').send(res);
}));

export default router;
