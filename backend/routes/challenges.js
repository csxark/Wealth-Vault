import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import challengeService from '../services/challengeService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/challenges:
 *   post:
 *     summary: Create a new challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - targetType
 *               - targetAmount
 *               - endDate
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               targetType: { type: string, enum: [save_amount, reduce_expense, increase_income] }
 *               targetAmount: { type: number }
 *               targetCategoryId: { type: string, format: uuid }
 *               currency: { type: string, default: USD }
 *               startDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time }
 *               isPublic: { type: boolean, default: true }
 *               maxParticipants: { type: integer }
 *               rules: { type: object }
 *               tags: { type: array, items: { type: string } }
 *               difficulty: { type: string, enum: [easy, medium, hard] }
 *               category: { type: string }
 *     responses:
 *       201:
 *         description: Challenge created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', [
  body('title').trim().isLength({ min: 1, max: 100 }).withMessage('Title is required and must be less than 100 characters'),
  body('targetType').isIn(['save_amount', 'reduce_expense', 'increase_income']).withMessage('Invalid target type'),
  body('targetAmount').isFloat({ min: 0.01 }).withMessage('Target amount must be greater than 0'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('targetCategoryId').optional().isUUID().withMessage('Invalid category ID'),
  body('maxParticipants').optional().isInt({ min: 1 }).withMessage('Max participants must be at least 1'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const challengeData = {
      ...req.body,
      creatorId: req.user.id,
      startDate: req.body.startDate || new Date(),
    };

    const challenge = await challengeService.createChallenge(challengeData);

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: challenge
    });
  } catch (error) {
    console.error('Error creating challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create challenge',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/challenges/public:
 *   get:
 *     summary: Get public challenges
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: difficulty
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: List of public challenges
 */
router.get('/public', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { category, difficulty, limit = 20, offset = 0 } = req.query;

    const challenges = await challengeService.getPublicChallenges({
      category,
      difficulty,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: challenges
    });
  } catch (error) {
    console.error('Error fetching public challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenges',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/challenges/my:
 *   get:
 *     summary: Get user's active challenges
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's active challenges
 */
router.get('/my', async (req, res) => {
  try {
    const challenges = await challengeService.getUserChallenges(req.user.id);

    res.json({
      success: true,
      data: challenges
    });
  } catch (error) {
    console.error('Error fetching user challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenges',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/challenges/{id}/join:
 *   post:
 *     summary: Join a challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetProgress
 *             properties:
 *               targetProgress: { type: number, minimum: 0.01 }
 *     responses:
 *       200:
 *         description: Successfully joined challenge
 *       400:
 *         description: Validation error
 *       404:
 *         description: Challenge not found
 */
router.post('/:id/join', [
  param('id').isUUID().withMessage('Invalid challenge ID'),
  body('targetProgress').isFloat({ min: 0.01 }).withMessage('Target progress must be greater than 0'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { targetProgress } = req.body;

    const participant = await challengeService.joinChallenge(id, req.user.id, targetProgress);

    res.json({
      success: true,
      message: 'Successfully joined challenge',
      data: participant
    });
  } catch (error) {
    console.error('Error joining challenge:', error);

    if (error.message.includes('not found') || error.message.includes('not active')) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found or not available'
      });
    }

    if (error.message.includes('already participating') || error.message.includes('full')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to join challenge',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/challenges/{id}/progress:
 *   post:
 *     summary: Update progress for a challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - progressAmount
 *             properties:
 *               progressAmount: { type: number, minimum: 0.01 }
 *     responses:
 *       200:
 *         description: Progress updated successfully
 */
router.post('/:id/progress', [
  param('id').isUUID().withMessage('Invalid challenge ID'),
  body('progressAmount').isFloat({ min: 0.01 }).withMessage('Progress amount must be greater than 0'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { progressAmount } = req.body;

    const participant = await challengeService.updateProgress(id, req.user.id, progressAmount);

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: participant
    });
  } catch (error) {
    console.error('Error updating progress:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Challenge participation not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update progress',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/challenges/{id}/leaderboard:
 *   get:
 *     summary: Get challenge leaderboard
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Challenge leaderboard
 *       404:
 *         description: Challenge not found
 */
router.get('/:id/leaderboard', [
  param('id').isUUID().withMessage('Invalid challenge ID'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const leaderboard = await challengeService.getChallengeLeaderboard(id);

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboard',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/challenges/{id}/calculate-progress:
 *   post:
 *     summary: Calculate automatic progress for a challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Progress calculated successfully
 */
router.post('/:id/calculate-progress', [
  param('id').isUUID().withMessage('Invalid challenge ID'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('endDate').optional().isISO8601().withMessage('Invalid end date'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { startDate, endDate } = req.body;

    // Default to last 30 days if not specified
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    await challengeService.calculateAutomaticProgress(req.user.id, start, end);

    res.json({
      success: true,
      message: 'Progress calculated successfully'
    });
  } catch (error) {
    console.error('Error calculating progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate progress',
      error: error.message
    });
  }
});

export default router;
