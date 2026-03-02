/**
 * Lifestyle Inflation Detection API Routes
 * 
 * Endpoints for detecting and managing lifestyle inflation
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import lifestyleInflationService from '../services/lifestyleInflationService.js';
import logger from '../utils/logger.js';
import ApiResponse from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @swagger
 * /lifestyle-inflation/analyze:
 *   post:
 *     summary: Analyze lifestyle inflation for the current user
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Comprehensive lifestyle inflation analysis
 *       400:
 *         description: Invalid request
 */
router.post('/analyze', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const analysis = await lifestyleInflationService.analyzeLifestyleInflation(userId, tenantId);

    return res.status(200).json(
      ApiResponse.success(analysis, 'Lifestyle inflation analysis completed')
    );
  } catch (error) {
    logger.error('Error analyzing lifestyle inflation:', error);
    return res.status(500).json(
      ApiResponse.error('Failed to analyze lifestyle inflation', 500)
    );
  }
});

/**
 * @swagger
 * /lifestyle-inflation/history:
 *   get:
 *     summary: Get lifestyle inflation analysis history
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of historical snapshots to retrieve
 *     responses:
 *       200:
 *         description: Historical inflation snapshots
 */
router.get('/history', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const limit = parseInt(req.query.limit) || 10;

    const history = await lifestyleInflationService.getInflationHistory(userId, tenantId, limit);

    return res.status(200).json(
      ApiResponse.success(history, 'Inflation history retrieved')
    );
  } catch (error) {
    logger.error('Error fetching inflation history:', error);
    return res.status(500).json(
      ApiResponse.error('Failed to fetch inflation history', 500)
    );
  }
});

/**
 * @swagger
 * /lifestyle-inflation/alerts:
 *   get:
 *     summary: Get active lifestyle inflation alerts
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active inflation alerts
 */
router.get('/alerts', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const alerts = await lifestyleInflationService.getInflationAlerts(userId, tenantId);

    return res.status(200).json(
      ApiResponse.success(alerts, 'Inflation alerts retrieved')
    );
  } catch (error) {
    logger.error('Error fetching inflation alerts:', error);
    return res.status(500).json(
      ApiResponse.error('Failed to fetch inflation alerts', 500)
    );
  }
});

/**
 * @swagger
 * /lifestyle-inflation/alerts/{alertId}/acknowledge:
 *   put:
 *     summary: Acknowledge an inflation alert
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Alert ID to acknowledge
 *     responses:
 *       200:
 *         description: Alert acknowledged successfully
 *       404:
 *         description: Alert not found
 */
router.put(
  '/alerts/:alertId/acknowledge',
  protect,
  [param('alertId').isUUID().withMessage('Invalid alert ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          ApiResponse.error('Validation failed', 400, errors.array())
        );
      }

      const { alertId } = req.params;
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      const alert = await lifestyleInflationService.acknowledgeAlert(alertId, userId, tenantId);

      if (!alert) {
        return res.status(404).json(
          ApiResponse.error('Alert not found', 404)
        );
      }

      return res.status(200).json(
        ApiResponse.success(alert, 'Alert acknowledged successfully')
      );
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to acknowledge alert', 500)
      );
    }
  }
);

/**
 * @swagger
 * /lifestyle-inflation/income:
 *   post:
 *     summary: Record income change manually
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newIncome
 *             properties:
 *               newIncome:
 *                 type: number
 *                 description: New monthly income amount
 *     responses:
 *       201:
 *         description: Income change recorded successfully
 *       400:
 *         description: Invalid request
 */
router.post(
  '/income',
  protect,
  [
    body('newIncome')
      .isFloat({ min: 0 })
      .withMessage('New income must be a positive number')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          ApiResponse.error('Validation failed', 400, errors.array())
        );
      }

      const { newIncome } = req.body;
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      const record = await lifestyleInflationService.recordIncomeChange(
        userId,
        tenantId,
        newIncome
      );

      return res.status(201).json(
        ApiResponse.success(record, 'Income change recorded successfully')
      );
    } catch (error) {
      logger.error('Error recording income change:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to record income change', 500)
      );
    }
  }
);

/**
 * @swagger
 * /lifestyle-inflation/detect-income-increase:
 *   get:
 *     summary: Detect if there has been a recent income increase
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Income increase detection result
 */
router.get('/detect-income-increase', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const incomeIncrease = await lifestyleInflationService.detectIncomeIncrease(userId, tenantId);

    if (!incomeIncrease) {
      return res.status(200).json(
        ApiResponse.success(
          { detected: false },
          'No significant income increase detected'
        )
      );
    }

    return res.status(200).json(
      ApiResponse.success(
        { detected: true, ...incomeIncrease },
        'Income increase detected'
      )
    );
  } catch (error) {
    logger.error('Error detecting income increase:', error);
    return res.status(500).json(
      ApiResponse.error('Failed to detect income increase', 500)
    );
  }
});

/**
 * @swagger
 * /lifestyle-inflation/spending-analysis:
 *   get:
 *     summary: Get detailed spending pattern analysis
 *     tags: [Lifestyle Inflation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: incomeIncreaseDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Date of income increase for analysis
 *     responses:
 *       200:
 *         description: Spending pattern analysis
 *       400:
 *         description: Invalid date or insufficient data
 */
router.get(
  '/spending-analysis',
  protect,
  [query('incomeIncreaseDate').isISO8601().withMessage('Invalid date format')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          ApiResponse.error('Validation failed', 400, errors.array())
        );
      }

      const userId = req.user.id;
      const tenantId = req.user.tenantId;
      const incomeIncreaseDate = new Date(req.query.incomeIncreaseDate);

      const analysis = await lifestyleInflationService.analyzeSpendingPatterns(
        userId,
        tenantId,
        incomeIncreaseDate
      );

      if (!analysis) {
        return res.status(400).json(
          ApiResponse.error('Insufficient data for analysis (need 90 days post-increase)', 400)
        );
      }

      return res.status(200).json(
        ApiResponse.success(analysis, 'Spending analysis completed')
      );
    } catch (error) {
      logger.error('Error analyzing spending patterns:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to analyze spending patterns', 500)
      );
    }
  }
);

export default router;
