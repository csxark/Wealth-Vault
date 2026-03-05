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

// Global leaderboard endpoint
router.get('/global-leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const timeframe = req.query.timeframe as string || 'all';
    const leaderboard = await challengeService.getGlobalLeaderboard({ limit, timeframe });
    res.json({ success: true, data: leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Challenge categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await challengeService.getChallengeCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Challenge templates
router.get('/templates', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const difficulty = req.query.difficulty as string | undefined;
    const templates = await challengeService.getChallengeTemplates({ category, difficulty });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create from template
router.post('/from-template/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const challenge = await challengeService.createChallengeFromTemplate(templateId, req.user.id, req.body);
    res.status(201).json({ success: true, data: challenge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// User stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await challengeService.getUserChallengeStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Recommended challenges
router.get('/recommended', async (req, res) => {
  try {
    const recommended = await challengeService.getRecommendedChallenges(req.user.id);
    res.json({ success: true, data: recommended });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Comments
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const comments = await challengeService.getChallengeComments(id);
    res.json({ success: true, data: comments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const comment = await challengeService.addChallengeComment(id, req.user.id, content);
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Likes
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    await challengeService.likeChallenge(id, req.user.id);
    res.json({ success: true, message: 'Liked' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    await challengeService.unlikeChallenge(id, req.user.id);
    res.json({ success: true, message: 'Unliked' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id/likes', async (req, res) => {
  try {
    const { id } = req.params;
    const likes = await challengeService.getChallengeLikes(id, req.user.id);
    res.json({ success: true, data: likes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Activity
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await challengeService.getChallengeActivity(id);
    res.json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Invitations
router.post('/:id/invite', async (req, res) => {
  try {
    const { id } = req.params;
    const { inviteeId } = req.body;
    await challengeService.inviteToChallenge(id, req.user.id, inviteeId);
    res.json({ success: true, message: 'Invitation sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/invitations', async (req, res) => {
  try {
    const invitations = await challengeService.getUserInvitations(req.user.id);
    res.json({ success: true, data: invitations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/invitations/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;
    await challengeService.respondToInvitation(id, req.user.id, accept);
    res.json({ success: true, message: accept ? 'Accepted' : 'Declined' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
