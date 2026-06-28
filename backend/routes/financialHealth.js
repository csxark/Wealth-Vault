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

// ============================================================================
// ISSUE #667: Financial Health Scoring & Insights - New Advanced Features
// ============================================================================

import healthScoringService from '../services/healthScoringService.js';
import spendingHeatmapService from '../services/spendingHeatmapService.js';
import wellnessTrendsService from '../services/wellnessTrendsService.js';
import { financialHealthScores, healthRecommendations, peerBenchmarks } from '../db/schema.js';
import db from '../config/db.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * @route   GET /api/financial-health/score/detailed
 * @desc    Get detailed financial health score (0-850) with component breakdowns
 * @access  Private
 */
router.get('/score/detailed', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    let score = await healthScoringService.getHealthScore(userId, tenantId);

    // If no score exists, calculate it
    if (!score) {
      logInfo('Calculating new detailed health score', { userId });
      score = await healthScoringService.calculateHealthScore(userId, tenantId);
    }

    res.json({
      success: true,
      message: 'Detailed financial health score retrieved',
      data: score
    });
  } catch (error) {
    logError('Error fetching detailed health score', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch detailed health score',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/recommendations
 * @desc    Get personalized financial recommendations
 * @access  Private
 */
router.get('/recommendations', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const { status, category } = req.query;

    let query = db.select()
      .from(healthRecommendations)
      .where(and(
        eq(healthRecommendations.userId, userId),
        eq(healthRecommendations.tenantId, tenantId)
      ));

    if (status) {
      query = query.where(eq(healthRecommendations.status, status));
    }
    if (category) {
      query = query.where(eq(healthRecommendations.category, category));
    }

    const recommendations = await query;

    res.json({
      success: true,
      message: 'Recommendations retrieved successfully',
      data: recommendations
    });
  } catch (error) {
    logError('Error fetching recommendations', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/financial-health/recommendations/:id/status
 * @desc    Update recommendation status
 * @access  Private
 */
router.patch('/recommendations/:id/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'in_progress', 'completed', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const updated = await healthScoringService.updateRecommendationStatus(id, status, userId);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }

    res.json({
      success: true,
      message: 'Recommendation status updated',
      data: updated
    });
  } catch (error) {
    logError('Error updating recommendation', { userId: req.user.id, recommendationId: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update recommendation',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/heatmap
 * @desc    Get spending heatmap with patterns and insights
 * @access  Private
 */
router.get('/heatmap', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const period = req.query.period || 'monthly';

    let heatmap = await spendingHeatmapService.getHeatmap(userId, tenantId, period);

    // If no heatmap exists, generate it
    if (!heatmap) {
      logInfo('Generating new spending heatmap', { userId, period });
      heatmap = await spendingHeatmapService.generateHeatmap(userId, tenantId, period);
    }

    res.json({
      success: true,
      message: 'Spending heatmap retrieved successfully',
      data: heatmap
    });
  } catch (error) {
    logError('Error fetching spending heatmap', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch spending heatmap',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/financial-health/heatmap/generate
 * @desc    Generate/regenerate spending heatmap
 * @access  Private
 */
router.post('/heatmap/generate', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const { period = 'monthly', startDate, endDate } = req.body;

    const heatmap = await spendingHeatmapService.generateHeatmap(
      userId, 
      tenantId, 
      period, 
      startDate, 
      endDate
    );

    res.json({
      success: true,
      message: 'Heatmap generated successfully',
      data: heatmap
    });
  } catch (error) {
    logError('Error generating heatmap', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate heatmap',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/wellness
 * @desc    Get wellness trends over time
 * @access  Private
 */
router.get('/wellness', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const limit = parseInt(req.query.limit) || 30;

    const trends = await wellnessTrendsService.getTrends(userId, tenantId, limit);

    res.json({
      success: true,
      message: 'Wellness trends retrieved successfully',
      data: trends
    });
  } catch (error) {
    logError('Error fetching wellness trends', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wellness trends',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/wellness/summary
 * @desc    Get wellness trend summary with insights
 * @access  Private
 */
router.get('/wellness/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const summary = await wellnessTrendsService.getTrendSummary(userId, tenantId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'No wellness data available'
      });
    }

    res.json({
      success: true,
      message: 'Wellness summary retrieved successfully',
      data: summary
    });
  } catch (error) {
    logError('Error fetching wellness summary', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wellness summary',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/financial-health/wellness/record
 * @desc    Record wellness trend data point
 * @access  Private
 */
router.post('/wellness/record', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const trendDate = req.body.trendDate ? new Date(req.body.trendDate) : new Date();

    const trend = await wellnessTrendsService.recordTrend(userId, tenantId, trendDate);

    res.json({
      success: true,
      message: 'Wellness trend recorded successfully',
      data: trend
    });
  } catch (error) {
    logError('Error recording wellness trend', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to record wellness trend',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/dashboard
 * @desc    Get complete financial health dashboard
 * @access  Private
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    logInfo('Fetching financial health dashboard', { userId });

    // Fetch all dashboard data in parallel
    const [score, recommendations, heatmap, wellnessSummary] = await Promise.all([
      healthScoringService.getHealthScore(userId, tenantId)
        .then(s => s || healthScoringService.calculateHealthScore(userId, tenantId)),
      healthScoringService.getRecommendations(userId, tenantId, 'pending'),
      spendingHeatmapService.getHeatmap(userId, tenantId, 'monthly')
        .then(h => h || spendingHeatmapService.generateHeatmap(userId, tenantId, 'monthly').catch(() => null)),
      wellnessTrendsService.getTrendSummary(userId, tenantId).catch(() => null)
    ]);

    res.json({
      success: true,
      message: 'Financial health dashboard retrieved successfully',
      data: {
        healthScore: score,
        recommendations: recommendations?.slice(0, 5) || [], // Top 5 recommendations
        spendingHeatmap: heatmap,
        wellnessTrends: wellnessSummary
      }
    });
  } catch (error) {
    logError('Error fetching dashboard data', { userId: req.user.id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-health/benchmarks
 * @desc    Get peer benchmark data for comparison
 * @access  Private
 */
router.get('/benchmarks', async (req, res) => {
  try {
    const { age, income, region } = req.query;

    let query = db.select()
      .from(peerBenchmarks)
      .where(sql`${peerBenchmarks.validUntil} > NOW()`);

    // Filter by age range
    if (age) {
      const ageNum = parseInt(age);
      query = query.where(and(
        sql`${peerBenchmarks.ageMin} <= ${ageNum}`,
        sql`${peerBenchmarks.ageMax} >= ${ageNum}`
      ));
    }

    // Filter by income range
    if (income) {
      const incomeNum = parseInt(income);
      query = query.where(and(
        sql`${peerBenchmarks.incomeMin} <= ${incomeNum}`,
        sql`${peerBenchmarks.incomeMax} >= ${incomeNum}`
      ));
    }

    // Filter by region
    if (region) {
      query = query.where(eq(peerBenchmarks.region, region));
    }

    const benchmarks = await query.limit(10);

    res.json({
      success: true,
      message: 'Peer benchmarks retrieved successfully',
      data: benchmarks
    });
  } catch (error) {
    logError('Error fetching benchmarks', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch benchmarks',
      error: error.message
    });
  }
});

export default router;

