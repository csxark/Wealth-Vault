import express from 'express';
import { param, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import incomeVolatilityAdaptivePlannerService from '../services/incomeVolatilityAdaptivePlannerService.js';

const router = express.Router();

/**
 * @swagger
 * /income-volatility-planner/plans:
 *   get:
 *     summary: Get adaptive contribution plans for all active goals
 *     tags: [Income Volatility Planner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Adaptive plans generated
 */
router.get('/plans', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const plans = await incomeVolatilityAdaptivePlannerService.generateAdaptivePlans(userId);

  return new ApiResponse(
    200,
    { plans },
    'Adaptive goal plans generated successfully'
  ).send(res);
}));

/**
 * @swagger
 * /income-volatility-planner/plans/{goalId}:
 *   get:
 *     summary: Get adaptive contribution plan for one goal
 *     tags: [Income Volatility Planner]
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
 *         description: Goal adaptive plan generated
 */
router.get('/plans/:goalId', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const userId = req.user.id;
  const { goalId } = req.params;

  const goalPlan = await incomeVolatilityAdaptivePlannerService.generateSingleGoalPlan(userId, goalId);

  if (!goalPlan) {
    return new ApiResponse(404, null, 'Goal not found in active adaptive planning scope').send(res);
  }

  return new ApiResponse(
    200,
    { goalPlan },
    'Adaptive plan generated for goal successfully'
  ).send(res);
}));

/**
 * @swagger
 * /income-volatility-planner/refresh-monthly:
 *   post:
 *     summary: Force monthly recommendation refresh using latest income variance
 *     tags: [Income Volatility Planner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monthly adaptive recommendations refreshed
 */
router.post('/refresh-monthly', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const refreshed = await incomeVolatilityAdaptivePlannerService.generateAdaptivePlans(userId);

  return new ApiResponse(
    200,
    {
      refreshedAt: new Date(),
      monthlyCycle: refreshed.monthlyCycle,
      volatilityProfile: refreshed.volatilityProfile,
      summary: refreshed.summary,
      plans: refreshed.plans
    },
    'Monthly adaptive recommendations refreshed successfully'
  ).send(res);
}));

/**
 * @swagger
 * /income-volatility-planner/volatility-profile:
 *   get:
 *     summary: Get current income volatility classification and capacity bands
 *     tags: [Income Volatility Planner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Volatility profile returned
 */
router.get('/volatility-profile', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const data = await incomeVolatilityAdaptivePlannerService.generateAdaptivePlans(userId);

  return new ApiResponse(
    200,
    {
      volatilityProfile: data.volatilityProfile,
      adaptiveCapacity: data.adaptiveCapacity,
      monthlyCycle: data.monthlyCycle
    },
    'Income volatility profile retrieved successfully'
  ).send(res);
}));

export default router;
