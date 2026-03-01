import express from 'express';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import db from '../config/db.js';
import { savingsRoundups, goals, users } from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import savingsService from '../services/savingsService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/savings/settings
 * Get user's savings round-up settings
 */
router.get('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await savingsService.getUserSavingsSettings(userId);
    res.json({ data: settings });
  } catch (error) {
    console.error('Error fetching savings settings:', error);
    res.status(500).json({ error: 'Failed to fetch savings settings' });
  }
});

/**
 * PUT /api/savings/settings
 * Update user's savings round-up settings
 */
router.put('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const { savingsRoundUpEnabled, savingsGoalId, roundUpToNearest } = req.body;

    const updatedSettings = await savingsService.updateUserSavingsSettings(userId, {
      savingsRoundUpEnabled,
      savingsGoalId,
      roundUpToNearest
    });

    res.json({ data: updatedSettings });
  } catch (error) {
    console.error('Error updating savings settings:', error);
    res.status(500).json({ error: 'Failed to update savings settings' });
  }
});

/**
 * GET /api/savings/goals
 * Get user's savings goals for round-up selection
 */
router.get('/goals', async (req, res) => {
  try {
    const userId = req.user.id;
    const goals = await savingsService.getUserSavingsGoals(userId);
    res.json({ data: goals });
  } catch (error) {
    console.error('Error fetching savings goals:', error);
    res.status(500).json({ error: 'Failed to fetch savings goals' });
  }
});

/**
 * GET /api/savings/history
 * Get user's round-up history
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      minAmount,
      maxAmount
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      minAmount: minAmount ? parseFloat(minAmount) : null,
      maxAmount: maxAmount ? parseFloat(maxAmount) : null
    };

    const history = await savingsService.getRoundUpHistory(userId, options);
    res.json(history);
  } catch (error) {
    console.error('Error fetching round-up history:', error);
    res.status(500).json({ error: 'Failed to fetch round-up history' });
  }
});

/**
 * GET /api/savings/stats
 * Get user's round-up statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'month' } = req.query; // 'week', 'month', 'year', 'all'

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
      default:
        startDate = null;
        break;
    }

    // Get round-up records
    let whereConditions = [eq(savingsRoundups.userId, userId)];
    if (startDate) {
      whereConditions.push(gte(savingsRoundups.createdAt, startDate));
    }

    const roundUps = await db
      .select()
      .from(savingsRoundups)
      .where(and(...whereConditions))
      .orderBy(desc(savingsRoundups.createdAt));

    // Calculate statistics
    const totalRoundUps = roundUps.length;
    const totalAmount = roundUps.reduce((sum, record) => sum + parseFloat(record.roundUpAmount), 0);
    const averageRoundUp = totalRoundUps > 0 ? totalAmount / totalRoundUps : 0;

    // Group by date for chart data
    const chartData = roundUps.reduce((acc, record) => {
      const date = record.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += parseFloat(record.roundUpAmount);
      return acc;
    }, {});

    const chartDataArray = Object.entries(chartData)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      data: {
        totalRoundUps,
        totalAmount: totalAmount.toFixed(2),
        averageRoundUp: averageRoundUp.toFixed(2),
        period,
        chartData: chartDataArray
      }
    });
  } catch (error) {
    console.error('Error fetching round-up stats:', error);
    res.status(500).json({ error: 'Failed to fetch round-up statistics' });
  }
});

/**
 * GET /api/savings/challenges
 * Get user's challenges
 */
router.get('/challenges', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'all', status = 'active' } = req.query;

    const challenges = await savingsService.getUserChallenges(userId, { type, status });
    res.json({ data: challenges });
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

/**
 * POST /api/savings/challenges
 * Create a new challenge
 */
router.post('/challenges', async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeData = {
      ...req.body,
      creatorId: userId,
    };

    const challenge = await savingsService.createChallenge(challengeData);
    res.status(201).json({ data: challenge });
  } catch (error) {
    console.error('Error creating challenge:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

/**
 * POST /api/savings/challenges/:id/join
 * Join a challenge
 */
router.post('/challenges/:id/join', async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = req.params.id;

    const participant = await savingsService.joinChallenge(challengeId, userId);
    res.status(201).json({ data: participant });
  } catch (error) {
    console.error('Error joining challenge:', error);
    if (error.message.includes('already participating')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to join challenge' });
    }
  }
});

/**
 * PUT /api/savings/challenges/:id/progress
 * Update challenge progress
 */
router.put('/challenges/:id/progress', async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = req.params.id;
    const { progressAmount } = req.body;

    if (!progressAmount || progressAmount <= 0) {
      return res.status(400).json({ error: 'Valid progress amount is required' });
    }

    const participant = await savingsService.updateChallengeProgress(challengeId, userId, progressAmount);
    res.json({ data: participant });
  } catch (error) {
    console.error('Error updating challenge progress:', error);
    res.status(500).json({ error: 'Failed to update challenge progress' });
  }
});

/**
 * GET /api/savings/challenges/:id/leaderboard
 * Get challenge leaderboard
 */
router.get('/challenges/:id/leaderboard', async (req, res) => {
  try {
    const challengeId = req.params.id;

    const leaderboard = await savingsService.getChallengeLeaderboard(challengeId);
    res.json({ data: leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
