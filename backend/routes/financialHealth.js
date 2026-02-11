import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import financialHealthService from '../services/financialHealthService.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route   GET /api/financial-health
 * @desc    Get current financial health score for authenticated user
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    let score = await financialHealthService.getCurrentFinancialHealthScore(userId);

    // If no score exists, calculate one
    if (!score) {
      logInfo('No existing financial health score found, calculating new one', { userId });
      score = await financialHealthService.recalculateAndSaveScore(userId);
    }

    res.json({
      success: true,
      message: 'Financial health score retrieved successfully',
      data: score
    });

  } catch (error) {
    logError('Error fetching financial health score', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve financial health score',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/financial-health/recalculate
 * @desc    Recalculate and update financial health score
 * @access  Private
 */
router.post('/recalculate', async (req, res) => {
  try {
    const userId = req.user.id;

    const score = await financialHealthService.recalculateAndSaveScore(userId);

    res.json({
      success: true,
      message: 'Financial health score recalculated successfully',
      data: score
    });

  } catch (error) {
    logError('Error recalculating financial health score', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate financial health score',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/history
 * @desc    Get historical financial health scores
 * @access  Private
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 12; // Default to 12 months

    const scores = await financialHealthService.getFinancialHealthScoreHistory(userId, limit);

    res.json({
      success: true,
      message: 'Financial health score history retrieved successfully',
      data: {
        scores,
        count: scores.length
      }
    });

  } catch (error) {
    logError('Error fetching financial health score history', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve financial health score history',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/calculate
 * @desc    Calculate financial health score without saving (preview)
 * @access  Private
 */
router.get('/calculate', async (req, res) => {
  try {
    const userId = req.user.id;

    const scoreData = await financialHealthService.calculateFinancialHealthScore(userId);

    res.json({
      success: true,
      message: 'Financial health score calculated successfully',
      data: scoreData
    });

  } catch (error) {
    logError('Error calculating financial health score', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to calculate financial health score',
      error: error.message
    });
  }
});

export default router;
