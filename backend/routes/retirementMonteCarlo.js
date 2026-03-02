/**
 * Multi-Scenario Retirement Planning API Routes (ISSUE-737)
 * 
 * Monte Carlo simulation endpoints for advanced retirement planning
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import retirementMonteCarloService from '../services/retirementMonteCarloService.js';
import logger from '../utils/logger.js';
import ApiResponse from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @swagger
 * /retirement-monte-carlo/simulate:
 *   post:
 *     summary: Run Monte Carlo retirement simulation
 *     tags: [Retirement Monte Carlo]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentAge
 *               - retirementAge
 *               - currentSavings
 *               - annualExpenses
 *             properties:
 *               currentAge:
 *                 type: number
 *               retirementAge:
 *                 type: number
 *               currentSavings:
 *                 type: number
 *               monthlyContribution:
 *                 type: number
 *               annualExpenses:
 *                 type: number
 *               gender:
 *                 type: string
 *                 enum: [male, female]
 *               withdrawalStrategy:
 *                 type: string
 *                 enum: [fixed_real, percentage, floor_ceiling, dynamic]
 *               numSimulations:
 *                 type: number
 *                 default: 10000
 *               includeHealthcare:
 *                 type: boolean
 *               healthcareExpenses:
 *                 type: number
 *               includeSocialSecurity:
 *                 type: boolean
 *               socialSecurityAmount:
 *                 type: number
 *               expectedReturn:
 *                 type: number
 *               includeRecession:
 *                 type: boolean
 *               lifespanPercentile:
 *                 type: number
 *     responses:
 *       200:
 *         description: Simulation results with success rate and recommendations
 *       400:
 *         description: Invalid parameters
 */
router.post(
  '/simulate',
  protect,
  [
    body('currentAge').isInt({ min: 18, max: 100 }).withMessage('Current age must be between 18-100'),
    body('retirementAge').isInt({ min: 50, max: 100 }).withMessage('Retirement age must be between 50-100'),
    body('currentSavings').isFloat({ min: 0 }).withMessage('Current savings must be non-negative'),
    body('monthlyContribution').optional().isFloat({ min: 0 }).withMessage('Monthly contribution must be non-negative'),
    body('annualExpenses').isFloat({ min: 0 }).withMessage('Annual expenses must be non-negative'),
    body('gender').optional().isIn(['male', 'female']).withMessage('Gender must be male or female'),
    body('withdrawalStrategy').optional().isIn(['fixed_real', 'percentage', 'floor_ceiling', 'dynamic']),
    body('numSimulations').optional().isInt({ min: 100, max: 50000 }).withMessage('Simulations must be 100-50000')
  ],
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
      const params = req.body;

      // Validate retirement age > current age
      if (params.retirementAge <= params.currentAge) {
        return res.status(400).json(
          ApiResponse.error('Retirement age must be greater than current age', 400)
        );
      }

      const results = await retirementMonteCarloService.runMonteCarloSimulation(
        userId,
        tenantId,
        params
      );

      return res.status(200).json(
        ApiResponse.success(results, 'Retirement simulation completed successfully')
      );
    } catch (error) {
      logger.error('[Retirement API] Simulation failed:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to complete retirement simulation', 500)
      );
    }
  }
);

/**
 * @swagger
 * /retirement-monte-carlo/history:
 *   get:
 *     summary: Get retirement simulation history
 *     tags: [Retirement Monte Carlo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of simulations to retrieve
 *     responses:
 *       200:
 *         description: Historical simulation results
 */
router.get('/history', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const limit = parseInt(req.query.limit) || 10;

    const history = await retirementMonteCarloService.getSimulationHistory(
      userId,
      tenantId,
      limit
    );

    return res.status(200).json(
      ApiResponse.success(history, 'Simulation history retrieved')
    );
  } catch (error) {
    logger.error('[Retirement API] Failed to fetch history:', error);
    return res.status(500).json(
      ApiResponse.error('Failed to fetch simulation history', 500)
    );
  }
});

/**
 * @swagger
 * /retirement-monte-carlo/simulation/{simulationId}:
 *   get:
 *     summary: Get specific simulation details
 *     tags: [Retirement Monte Carlo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: simulationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Simulation ID
 *     responses:
 *       200:
 *         description: Detailed simulation results
 *       404:
 *         description: Simulation not found
 */
router.get(
  '/simulation/:simulationId',
  protect,
  [param('simulationId').isUUID().withMessage('Invalid simulation ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          ApiResponse.error('Validation failed', 400, errors.array())
        );
      }

      const { simulationId } = req.params;
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      const simulation = await retirementMonteCarloService.getSimulationDetails(
        simulationId,
        userId,
        tenantId
      );

      if (!simulation) {
        return res.status(404).json(
          ApiResponse.error('Simulation not found', 404)
        );
      }

      return res.status(200).json(
        ApiResponse.success(simulation, 'Simulation details retrieved')
      );
    } catch (error) {
      logger.error('[Retirement API] Failed to fetch simulation:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to fetch simulation details', 500)
      );
    }
  }
);

/**
 * @swagger
 * /retirement-monte-carlo/compare-strategies:
 *   post:
 *     summary: Compare different withdrawal strategies
 *     tags: [Retirement Monte Carlo]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentAge
 *               - retirementAge
 *               - currentSavings
 *               - annualExpenses
 *             properties:
 *               currentAge:
 *                 type: number
 *               retirementAge:
 *                 type: number
 *               currentSavings:
 *                 type: number
 *               monthlyContribution:
 *                 type: number
 *               annualExpenses:
 *                 type: number
 *     responses:
 *       200:
 *         description: Comparison of all withdrawal strategies
 */
router.post(
  '/compare-strategies',
  protect,
  [
    body('currentAge').isInt({ min: 18, max: 100 }),
    body('retirementAge').isInt({ min: 50, max: 100 }),
    body('currentSavings').isFloat({ min: 0 }),
    body('annualExpenses').isFloat({ min: 0 })
  ],
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
      const params = req.body;

      const comparison = await retirementMonteCarloService.compareWithdrawalStrategies(
        userId,
        tenantId,
        params
      );

      return res.status(200).json(
        ApiResponse.success(comparison, 'Withdrawal strategies compared')
      );
    } catch (error) {
      logger.error('[Retirement API] Strategy comparison failed:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to compare withdrawal strategies', 500)
      );
    }
  }
);

/**
 * @swagger
 * /retirement-monte-carlo/quick-estimate:
 *   post:
 *     summary: Get quick retirement estimate with fewer simulations
 *     tags: [Retirement Monte Carlo]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentAge
 *               - retirementAge
 *               - currentSavings
 *               - annualExpenses
 *     responses:
 *       200:
 *         description: Quick retirement estimate
 */
router.post(
  '/quick-estimate',
  protect,
  [
    body('currentAge').isInt({ min: 18, max: 100 }),
    body('retirementAge').isInt({ min: 50, max: 100 }),
    body('currentSavings').isFloat({ min: 0 }),
    body('annualExpenses').isFloat({ min: 0 })
  ],
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
      const params = {
        ...req.body,
        numSimulations: 1000, // Quick estimate with 1000 simulations
        includeRecession: false // Faster without recession modeling
      };

      const results = await retirementMonteCarloService.runMonteCarloSimulation(
        userId,
        tenantId,
        params
      );

      return res.status(200).json(
        ApiResponse.success(results, 'Quick retirement estimate completed')
      );
    } catch (error) {
      logger.error('[Retirement API] Quick estimate failed:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to generate quick estimate', 500)
      );
    }
  }
);

export default router;
