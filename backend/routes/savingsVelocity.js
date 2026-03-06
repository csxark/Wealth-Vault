import express from 'express';
import { param, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import savingsVelocityOptimizer from '../services/savingsVelocityOptimizer.js';

const router = express.Router();

/**
 * @swagger
 * /savings-velocity/{goalId}/optimize:
 *   get:
 *     summary: Get optimal savings velocity recommendations for a goal
 *     tags: [Savings Velocity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Goal ID to optimize
 *     responses:
 *       200:
 *         description: Velocity optimization completed
 *       404:
 *         description: Goal not found
 */
router.get('/:goalId/optimize', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const userId = req.user.id;

  const optimization = await savingsVelocityOptimizer.optimizeGoalVelocity(goalId, userId);

  return new ApiResponse(
    200,
    { optimization },
    'Velocity optimization completed successfully'
  ).send(res);
}));

/**
 * @swagger
 * /savings-velocity/income-trajectory:
 *   get:
 *     summary: Get income trajectory analysis for user
 *     tags: [Savings Velocity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Income trajectory analysis completed
 */
router.get('/income-trajectory', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const trajectory = await savingsVelocityOptimizer.analyzeIncomeTrajectory(userId);

  return new ApiResponse(
    200,
    { trajectory },
    'Income trajectory analyzed successfully'
  ).send(res);
}));

/**
 * @swagger
 * /savings-velocity/debt-obligations:
 *   get:
 *     summary: Get debt obligations analysis for user
 *     tags: [Savings Velocity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Debt obligations calculated
 */
router.get('/debt-obligations', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const obligations = await savingsVelocityOptimizer.calculateDebtObligations(userId);

  return new ApiResponse(
    200,
    { obligations },
    'Debt obligations calculated successfully'
  ).send(res);
}));

export default router;
