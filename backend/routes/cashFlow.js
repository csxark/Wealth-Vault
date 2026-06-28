import express from 'express';
import { protect } from '../middleware/auth.js';
import { cashFlowForecastService } from '../services/cashFlowForecastService.js';
import { seasonalPatternDetectionService } from '../services/seasonalPatternDetectionService.js';
import { budgetVarianceService } from '../services/budgetVarianceService.js';
import { spendingPredictionService } from '../services/spendingPredictionService.js';
import { irregularExpenseService } from '../services/irregularExpenseService.js';
import { sensitivityAnalysisService } from '../services/sensitivityAnalysisService.js';
import { forecastAlertService } from '../services/forecastAlertService.js';
import { forecastAccuracyService } from '../services/forecastAccuracyService.js';
import { cashFlowTrackerService } from '../services/cashFlowTrackerService.js';

const router = express.Router();

// FORECAST ENDPOINTS
/**
 * @route   POST /api/cash-flow/forecast/:period
 * @desc    Generate cash flow forecast for specified period
 * @access  Private
 */
router.post('/forecast/:period', protect, async (req, res) => {
  try {
    const { period } = req.params;
    const validPeriods = ['30_days', '60_days', '90_days'];

    if (!validPeriods.includes(period)) {
      return res
        .status(400)
        .json({ error: 'Invalid period. Use 30_days, 60_days, or 90_days' });
    }

    const forecast = await cashFlowForecastService.generateForecast(
      req.user.id,
      req.user.tenantId,
      period
    );

    // Generate alerts for this forecast
    const alerts = await forecastAlertService.generateAlertsFromForecast(
      req.user.id,
      req.user.tenantId,
      forecast[0]
    );

    res.status(201).json({
      success: true,
      forecast: forecast[0],
      alerts: alerts.alerts,
      message: `${period} cash flow forecast generated successfully`,
    });
  } catch (error) {
    console.error('Error generating forecast:', error);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

/**
 * @route   GET /api/cash-flow/forecast/:forecastId
 * @desc    Get specific forecast details
 * @access  Private
 */
router.get('/forecast/:forecastId', protect, async (req, res) => {
  try {
    const forecast = await cashFlowForecastService.getForecastAccuracy(
      req.user.id,
      req.user.tenantId
    );

    if (!forecast) {
      return res.status(404).json({ error: 'Forecast not found' });
    }

    res.json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error('Error fetching forecast:', error);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

/**
 * @route   POST /api/cash-flow/seasonal-analysis
 * @desc    Detect seasonal spending patterns
 * @access  Private
 */
router.post('/seasonal-analysis', protect, async (req, res) => {
  try {
    const { category } = req.body;

    const patterns = await seasonalPatternDetectionService.detectSeasonalPatterns(
      req.user.id,
      req.user.tenantId,
      category
    );

    res.status(201).json({
      success: true,
      patterns,
      message: 'Seasonal analysis completed',
    });
  } catch (error) {
    console.error('Error detecting seasonal patterns:', error);
    res.status(500).json({ error: 'Failed to analyze seasonal patterns' });
  }
});

/**
 * @route   GET /api/cash-flow/seasonal-adjustment/:date
 * @desc    Get seasonal adjustment factor for a date
 * @access  Private
 */
router.get('/seasonal-adjustment/:date', protect, async (req, res) => {
  try {
    const { date } = req.params;
    const { category } = req.query;

    const adjustment = await seasonalPatternDetectionService.getSeasonalAdjustment(
      req.user.id,
      req.user.tenantId,
      new Date(date),
      category
    );

    res.json({
      success: true,
      date,
      seasonalFactor: adjustment,
    });
  } catch (error) {
    console.error('Error getting seasonal adjustment:', error);
    res.status(500).json({ error: 'Failed to get seasonal adjustment' });
  }
});

/**
 * @route   POST /api/cash-flow/budget-variance
 * @desc    Analyze budget vs actual spending
 * @access  Private
 */
router.post('/budget-variance', protect, async (req, res) => {
  try {
    const { period } = req.body;

    const variance = await budgetVarianceService.analyzeBudgetVariance(
      req.user.id,
      req.user.tenantId,
      period || 'current_month'
    );

    res.status(201).json({
      success: true,
      variance,
      message: 'Budget variance analysis completed',
    });
  } catch (error) {
    console.error('Error analyzing budget variance:', error);
    res.status(500).json({ error: 'Failed to analyze budget variance' });
  }
});

/**
 * @route   GET /api/cash-flow/budget-variance/category-breakdown
 * @desc    Get category breakdown with variance
 * @access  Private
 */
router.get('/budget-variance/category-breakdown', protect, async (req, res) => {
  try {
    const { period } = req.query;

    const breakdown = await budgetVarianceService.getCategoryBreakdown(
      req.user.id,
      req.user.tenantId,
      period || 'current_month'
    );

    res.json({
      success: true,
      breakdown,
    });
  } catch (error) {
    console.error('Error getting category breakdown:', error);
    res.status(500).json({ error: 'Failed to get category breakdown' });
  }
});

/**
 * @route   GET /api/cash-flow/budget-variance/recommendations
 * @desc    Get variance recommendations
 * @access  Private
 */
router.get('/budget-variance/recommendations', protect, async (req, res) => {
  try {
    const recommendations = await budgetVarianceService.getVarianceRecommendations(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

/**
 * @route   POST /api/cash-flow/spending-predictions
 * @desc    Generate spending predictions by category
 * @access  Private
 */
router.post('/spending-predictions', protect, async (req, res) => {
  try {
    const { days } = req.body;

    const predictions = await spendingPredictionService.generateCategoryPredictions(
      req.user.id,
      req.user.tenantId,
      days || 30
    );

    res.status(201).json({
      success: true,
      predictions,
      message: 'Category spending predictions generated',
    });
  } catch (error) {
    console.error('Error generating predictions:', error);
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

/**
 * @route   GET /api/cash-flow/spending-predictions
 * @desc    Get current spending predictions
 * @access  Private
 */
router.get('/spending-predictions', protect, async (req, res) => {
  try {
    const predictions = await spendingPredictionService.getSpendingPredictions(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      predictions,
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

/**
 * @route   POST /api/cash-flow/irregular-expenses
 * @desc    Track upcoming irregular expense
 * @access  Private
 */
router.post('/irregular-expenses', protect, async (req, res) => {
  try {
    const { categoryId, description, expectedAmount, expectedDate } = req.body;

    if (!categoryId || !expectedAmount || !expectedDate) {
      return res
        .status(400)
        .json({ error: 'Missing required fields' });
    }

    const tracked = await irregularExpenseService.trackUpcomingExpense(
      req.user.id,
      req.user.tenantId,
      {
        categoryId,
        description,
        expectedAmount,
        expectedDate,
      }
    );

    res.status(201).json({
      success: true,
      expense: tracked[0],
      message: 'Irregular expense tracked',
    });
  } catch (error) {
    console.error('Error tracking irregular expense:', error);
    res.status(500).json({ error: 'Failed to track expense' });
  }
});

/**
 * @route   GET /api/cash-flow/irregular-expenses/upcoming
 * @desc    Get upcoming irregular expenses
 * @access  Private
 */
router.get('/irregular-expenses/upcoming', protect, async (req, res) => {
  try {
    const { nextDays } = req.query;

    const upcoming = await irregularExpenseService.getUpcomingExpenses(
      req.user.id,
      req.user.tenantId,
      parseInt(nextDays) || 90
    );

    res.json({
      success: true,
      upcoming,
    });
  } catch (error) {
    console.error('Error fetching upcoming expenses:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming expenses' });
  }
});

/**
 * @route   POST /api/cash-flow/sensitivity-analysis
 * @desc    Run what-if scenario analysis
 * @access  Private
 */
router.post('/sensitivity-analysis', protect, async (req, res) => {
  try {
    const { currentCashFlow } = req.body;

    if (!currentCashFlow) {
      return res.status(400).json({ error: 'Current cash flow required' });
    }

    const analysis = await sensitivityAnalysisService.runSensitivityAnalysis(
      req.user.id,
      req.user.tenantId,
      currentCashFlow
    );

    res.status(201).json({
      success: true,
      analysis,
      message: 'Sensitivity analysis completed',
    });
  } catch (error) {
    console.error('Error running sensitivity analysis:', error);
    res.status(500).json({ error: 'Failed to run sensitivity analysis' });
  }
});

/**
 * @route   GET /api/cash-flow/sensitivity-analysis/scenarios
 * @desc    Get critical scenarios
 * @access  Private
 */
router.get('/sensitivity-analysis/scenarios', protect, async (req, res) => {
  try {
    const scenarios = await sensitivityAnalysisService.getCriticalScenarios(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      scenarios,
    });
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

/**
 * @route   GET /api/cash-flow/alerts
 * @desc    Get active forecast alerts
 * @access  Private
 */
router.get('/alerts', protect, async (req, res) => {
  try {
    const alerts = await forecastAlertService.getActiveAlerts(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * @route   PATCH /api/cash-flow/alerts/:alertId/acknowledge
 * @desc    Acknowledge an alert
 * @access  Private
 */
router.patch('/alerts/:alertId/acknowledge', protect, async (req, res) => {
  try {
    const { alertId } = req.params;

    const acknowledged = await forecastAlertService.acknowledgeAlert(
      alertId,
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      alert: acknowledged[0],
      message: 'Alert acknowledged',
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

/**
 * @route   GET /api/cash-flow/alerts/recommendations
 * @desc    Get alert recommendations
 * @access  Private
 */
router.get('/alerts/recommendations', protect, async (req, res) => {
  try {
    const recommendations = await forecastAlertService.getAlertRecommendations(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

/**
 * @route   GET /api/cash-flow/accuracy
 * @desc    Get forecast accuracy metrics
 * @access  Private
 */
router.get('/accuracy', protect, async (req, res) => {
  try {
    const accuracy = await forecastAccuracyService.getUserAverageAccuracy(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      accuracy,
    });
  } catch (error) {
    console.error('Error fetching accuracy metrics:', error);
    res.status(500).json({ error: 'Failed to fetch accuracy metrics' });
  }
});

/**
 * @route   GET /api/cash-flow/accuracy/quality-assessment
 * @desc    Get forecast quality assessment
 * @access  Private
 */
router.get('/accuracy/quality-assessment', protect, async (req, res) => {
  try {
    const assessment = await forecastAccuracyService.getQualityAssessment(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      assessment,
    });
  } catch (error) {
    console.error('Error getting quality assessment:', error);
    res.status(500).json({ error: 'Failed to get quality assessment' });
  }
});

/**
 * @route   GET /api/cash-flow/accuracy/improvements
 * @desc    Get improvement areas for forecasting
 * @access  Private
 */
router.get('/accuracy/improvements', protect, async (req, res) => {
  try {
    const improvements = await forecastAccuracyService.getImprovementAreas(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      improvements,
    });
  } catch (error) {
    console.error('Error getting improvement areas:', error);
    res.status(500).json({ error: 'Failed to get improvement areas' });
  }
});

/**
 * @route   GET /api/cash-flow/tracker/snapshot
 * @desc    Get current cash flow snapshot
 * @access  Private
 */
router.get('/tracker/snapshot', protect, async (req, res) => {
  try {
    const snapshot = await cashFlowTrackerService.getCurrentCashFlowSnapshot(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      snapshot,
    });
  } catch (error) {
    console.error('Error getting snapshot:', error);
    res.status(500).json({ error: 'Failed to get snapshot' });
  }
});

/**
 * @route   GET /api/cash-flow/tracker/upcoming
 * @desc    Get upcoming activity for next 7 days
 * @access  Private
 */
router.get('/tracker/upcoming', protect, async (req, res) => {
  try {
    const upcoming = await cashFlowTrackerService.getUpcomingActivity(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      upcoming,
    });
  } catch (error) {
    console.error('Error getting upcoming activity:', error);
    res.status(500).json({ error: 'Failed to get upcoming activity' });
  }
});

/**
 * @route   GET /api/cash-flow/tracker/weekly-comparison
 * @desc    Compare current week to previous week
 * @access  Private
 */
router.get('/tracker/weekly-comparison', protect, async (req, res) => {
  try {
    const comparison = await cashFlowTrackerService.getWeeklyComparison(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error('Error getting weekly comparison:', error);
    res.status(500).json({ error: 'Failed to get weekly comparison' });
  }
});

/**
 * @route   GET /api/cash-flow/tracker/history
 * @desc    Get historical cash flow snapshots
 * @access  Private
 */
router.get('/tracker/history', protect, async (req, res) => {
  try {
    const { days } = req.query;

    const history = await cashFlowTrackerService.getHistoricalSnapshots(
      req.user.id,
      req.user.tenantId,
      parseInt(days) || 30
    );

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

/**
 * @route   GET /api/cash-flow/dashboard
 * @desc    Get comprehensive cash flow dashboard
 * @access  Private
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
    const snapshot = await cashFlowTrackerService.getCurrentCashFlowSnapshot(
      req.user.id,
      req.user.tenantId
    );

    const forecast = await cashFlowForecastService.generateForecast(
      req.user.id,
      req.user.tenantId,
      '30_days'
    );

    const alerts = await forecastAlertService.getActiveAlerts(
      req.user.id,
      req.user.tenantId
    );

    const predictions = await spendingPredictionService.getSpendingPredictions(
      req.user.id,
      req.user.tenantId
    );

    const accuracy = await forecastAccuracyService.getQualityAssessment(
      req.user.id,
      req.user.tenantId
    );

    res.json({
      success: true,
      dashboard: {
        timestamp: new Date(),
        snapshot: snapshot.snapshot,
        forecast: forecast[0] || null,
        alerts: alerts.alerts,
        predictions,
        accuracy,
      },
    });
  } catch (error) {
    console.error('Error generating dashboard:', error);
    res.status(500).json({ error: 'Failed to generate dashboard' });
  }
});

export default router;
