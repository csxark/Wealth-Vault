import express from 'express';
import aiInsightsService from '../services/aiInsightsService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Get AI-powered financial insights for the authenticated user
 * GET /api/insights
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const insights = await aiInsightsService.generateInsights(userId);

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate insights',
      error: error.message,
    });
  }
});

export default router;
