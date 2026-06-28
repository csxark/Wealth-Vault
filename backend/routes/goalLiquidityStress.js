import express from 'express';
import { param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import goalLiquidityStressTesterService from '../services/goalLiquidityStressTesterService.js';

const router = express.Router();

/**
 * @swagger
 * /goal-liquidity-stress/test:
 *   get:
 *     summary: Run liquidity stress test (30/60/90 day shocks)
 *     tags: [Goal Liquidity Stress]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stress test completed
 */
router.get('/test', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const stressTest = await goalLiquidityStressTesterService.runStressTest(userId);

  return new ApiResponse(
    200,
    { stressTest },
    'Goal liquidity stress test completed successfully'
  ).send(res);
}));

/**
 * @swagger
 * /goal-liquidity-stress/summary:
 *   get:
 *     summary: Get compact stress summary for dashboard use
 *     tags: [Goal Liquidity Stress]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stress summary generated
 */
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const stressTest = await goalLiquidityStressTesterService.runStressTest(userId);

  return new ApiResponse(
    200,
    {
      summary: stressTest.summary,
      stressScore: stressTest.stressScore,
      survivableAllocation: stressTest.survivableAllocation,
      recommendedBufferTarget: stressTest.recommendedBufferTarget
    },
    'Goal liquidity stress summary generated successfully'
  ).send(res);
}));

/**
 * @swagger
 * /goal-liquidity-stress/goals/{goalId}/risk:
 *   get:
 *     summary: Get stress risk map for one goal across 30/60/90 scenarios
 *     tags: [Goal Liquidity Stress]
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
 *         description: Goal stress risk returned
 */
router.get('/goals/:goalId/risk', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const userId = req.user.id;
  const { goalId } = req.params;

  const stressTest = await goalLiquidityStressTesterService.runStressTest(userId);
  const goalRisk = stressTest.goalDelayRiskMap.find(goal => goal.goalId === goalId);

  if (!goalRisk) {
    return new ApiResponse(404, null, 'Goal not found in stress analysis').send(res);
  }

  return new ApiResponse(
    200,
    {
      goalRisk,
      stressScore: stressTest.stressScore,
      survivableAllocation: stressTest.survivableAllocation
    },
    'Goal stress risk map retrieved successfully'
  ).send(res);
}));

/**
 * @swagger
 * /goal-liquidity-stress/scenarios:
 *   get:
 *     summary: Get full scenario matrix (30/60/90)
 *     tags: [Goal Liquidity Stress]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scenario matrix retrieved
 */
router.get('/scenarios', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const stressTest = await goalLiquidityStressTesterService.runStressTest(userId);

  return new ApiResponse(
    200,
    {
      scenarios: stressTest.scenarios,
      baseline: stressTest.baseline,
      stressScore: stressTest.stressScore
    },
    'Liquidity stress scenarios retrieved successfully'
  ).send(res);
}));

export default router;
