import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  projectCashFlow,
  calculateProjectedBalance,
  identifyNegativeMonths,
  saveForecastSnapshot,
  getForecastHistory
} from '../services/forecastEngine.js';
import {
  generateSpendingInsights,
  detectSeasonalAnomalies,
  predictFinancialRisks
} from '../services/predictiveAI.js';
import { parseHistoricalData, identifyRecurringPatterns } from '../services/trendAnalyzer.js';
import { body, query, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @route   GET /api/forecasts/generate
 * @desc    Generate cash flow forecast
 * @access  Private
 */
router.get(
  '/generate',
  protect,
  [
    query('days')
      .optional()
      .isInt({ min: 7, max: 365 })
      .withMessage('Days must be between 7 and 365')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const days = parseInt(req.query.days) || 30;

      // Generate forecast
      const forecast = await projectCashFlow(userId, days);
      
      // Identify danger zones
      const dangerZoneAnalysis = await identifyNegativeMonths(userId, days);
      
      // Get recurring patterns
      const recurringPatterns = await identifyRecurringPatterns(userId);
      
      // Detect anomalies
      const anomalies = await detectSeasonalAnomalies(userId);

      // Combine all data
      const forecastData = {
        ...forecast,
        dangerZones: dangerZoneAnalysis.dangerZones,
        hasDangerZones: dangerZoneAnalysis.hasDangerZones,
        overallRisk: dangerZoneAnalysis.overallRisk,
        recurringPatterns: recurringPatterns.slice(0, 10),
        anomalies: anomalies.slice(0, 10)
      };

      // Generate AI insights
      const aiInsights = await generateSpendingInsights(userId, forecastData);
      forecastData.aiInsights = aiInsights;

      // Save snapshot
      const snapshot = await saveForecastSnapshot(userId, forecastData);

      res.json({
        success: true,
        forecast: forecastData,
        snapshotId: snapshot.id,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error generating forecast:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate forecast',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/forecasts/danger-zones
 * @desc    Get danger zones (periods of potential negative balance)
 * @access  Private
 */
router.get(
  '/danger-zones',
  protect,
  [
    query('days')
      .optional()
      .isInt({ min: 7, max: 365 })
      .withMessage('Days must be between 7 and 365')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const days = parseInt(req.query.days) || 60;

      const dangerZoneAnalysis = await identifyNegativeMonths(userId, days);
      
      // Get risk assessment
      const forecast = await projectCashFlow(userId, days);
      const riskAssessment = await predictFinancialRisks(userId, {
        ...forecast,
        dangerZones: dangerZoneAnalysis.dangerZones
      });

      res.json({
        success: true,
        ...dangerZoneAnalysis,
        riskAssessment,
        analyzedDays: days,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error analyzing danger zones:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze danger zones',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/forecasts/history
 * @desc    Get historical forecasts
 * @access  Private
 */
router.get(
  '/history',
  protect,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 10;

      const history = await getForecastHistory(userId, limit);

      res.json({
        success: true,
        count: history.length,
        forecasts: history
      });
    } catch (error) {
      console.error('Error retrieving forecast history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve forecast history',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/forecasts/insights
 * @desc    Get AI-powered spending insights
 * @access  Private
 */
router.get('/insights', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get recent forecast or generate new one
    const history = await getForecastHistory(userId, 1);
    let forecastData;

    if (history.length > 0) {
      const lastForecast = history[0];
      // Use cached forecast if less than 24 hours old
      const ageHours = (Date.now() - new Date(lastForecast.createdAt).getTime()) / (1000 * 60 * 60);
      
      if (ageHours < 24) {
        forecastData = {
          summary: {
            endBalance: lastForecast.projectedBalance
          },
          dangerZones: lastForecast.dangerZones
        };
      }
    }

    // Generate fresh forecast if needed
    if (!forecastData) {
      const forecast = await projectCashFlow(userId, 30);
      const dangerZones = await identifyNegativeMonths(userId, 60);
      forecastData = {
        ...forecast,
        dangerZones: dangerZones.dangerZones
      };
    }

    const insights = await generateSpendingInsights(userId, forecastData);
    const anomalies = await detectSeasonalAnomalies(userId);
    const risks = await predictFinancialRisks(userId, forecastData);

    res.json({
      success: true,
      insights,
      anomalies: anomalies.slice(0, 5),
      risks,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate insights',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/forecasts/projected-balance
 * @desc    Calculate projected balance on a specific date
 * @access  Private
 */
router.post(
  '/projected-balance',
  protect,
  [
    body('targetDate')
      .notEmpty()
      .isISO8601()
      .withMessage('Valid target date is required (ISO 8601 format)')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { targetDate } = req.body;

      const projection = await calculateProjectedBalance(userId, new Date(targetDate));

      res.json({
        success: true,
        projection
      });
    } catch (error) {
      console.error('Error calculating projected balance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate projected balance',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/forecasts/trends
 * @desc    Get historical trends and patterns
 * @access  Private
 */
router.get('/trends', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const historicalData = await parseHistoricalData(userId, 12);
    const recurringPatterns = await identifyRecurringPatterns(userId);

    res.json({
      success: true,
      historical: historicalData.summary,
      monthlyBreakdown: historicalData.monthlyData,
      recurringPatterns: recurringPatterns.slice(0, 15),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrieving trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve trends',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/forecasts/anomalies
 * @desc    Detect spending anomalies
 * @access  Private
 */
router.get('/anomalies', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const anomalies = await detectSeasonalAnomalies(userId);

    res.json({
      success: true,
      count: anomalies.length,
      anomalies,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect anomalies',
      message: error.message
    });
  }
});

export default router;
