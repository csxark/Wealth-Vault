import express from 'express';
import { param, body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import deadlineReforecastService from '../services/deadlineReforecastService.js';

const router = express.Router();

/**
 * @swagger
 * /deadline-reforecast/{goalId}:
 *   get:
 *     summary: Get adaptive reforecast for a goal
 *     tags: [Deadline Reforecast]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Goal ID to reforecast
 *     responses:
 *       200:
 *         description: Reforecast generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     reforecast:
 *                       type: object
 *       404:
 *         description: Goal not found
 */
router.get('/:goalId', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const userId = req.user.id;

  const reforecast = await deadlineReforecastService.generateReforecast(goalId, userId);

  return new ApiResponse(
    200, 
    { reforecast }, 
    'Reforecast generated successfully'
  ).send(res);
}));

/**
 * @swagger
 * /deadline-reforecast/{goalId}/capacity-analysis:
 *   get:
 *     summary: Get contribution capacity analysis for a goal
 *     tags: [Deadline Reforecast]
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
 *         description: Capacity analysis retrieved
 */
router.get('/:goalId/capacity-analysis', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const userId = req.user.id;

  const analysis = await deadlineReforecastService.analyzeContributionCapacity(goalId, userId);

  if (!analysis) {
    return new ApiResponse(404, null, 'Goal not found or insufficient data').send(res);
  }

  return new ApiResponse(
    200, 
    { analysis }, 
    'Capacity analysis completed'
  ).send(res);
}));

/**
 * @swagger
 * /deadline-reforecast/{goalId}/accept-path:
 *   post:
 *     summary: Accept a reforecast recovery path
 *     tags: [Deadline Reforecast]
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
 *               - pathId
 *               - pathData
 *             properties:
 *               pathId:
 *                 type: string
 *                 description: ID of the recovery path (e.g., "increase_contributions", "extend_deadline")
 *                 enum: [increase_contributions, extend_deadline, hybrid_approach, reduce_target]
 *               pathData:
 *                 type: object
 *                 description: Full path data object from reforecast
 *     responses:
 *       200:
 *         description: Recovery path accepted and goal updated
 *       400:
 *         description: Invalid request data
 */
router.post('/:goalId/accept-path', protect, [
  param('goalId').isUUID().withMessage('Invalid goal ID'),
  body('pathId').isString().notEmpty().withMessage('Path ID is required'),
  body('pathData').isObject().withMessage('Path data is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Validation failed', errors.array()).send(res);
  }

  const { goalId } = req.params;
  const { pathId, pathData } = req.body;
  const userId = req.user.id;

  const result = await deadlineReforecastService.acceptReforecastPath(
    goalId,
    userId,
    pathId,
    pathData
  );

  return new ApiResponse(
    200,
    result,
    'Recovery path accepted and goal updated successfully'
  ).send(res);
}));

export default router;
