import express from "express";
import { body, validationResult } from "express-validator";
import { protect } from "../middleware/auth.js";
import { asyncHandler, ValidationError } from "../middleware/errorHandler.js";
import forecastingService from "../services/forecastingService.js";

const router = express.Router();

/**
 * @swagger
 * /forecasting/cash-flow:
 *   post:
 *     summary: Generate cash flow forecast
 *     tags: [Forecasting]
 *     security:
 *       - bearerAuth: []
 */
router.post("/cash-flow", protect, [
  body("monthsAhead").optional().isInt({ min: 1, max: 24 }).withMessage('monthsAhead must be between 1 and 24'),
  body("scenario").optional().isIn(['baseline', 'optimistic', 'pessimistic', 'conservative']).withMessage('Invalid scenario'),
  body("externalFactors").optional().isArray().withMessage('externalFactors must be an array'),
  body("externalFactors.*").optional().isIn(['inflation', 'market_growth', 'economic_downturn']).withMessage('Invalid external factor')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const {
    monthsAhead = 6,
    scenario = 'baseline',
    externalFactors = []
  } = req.body;

  const forecast = await forecastingService.generateCashFlowForecast(
    req.user.id,
    monthsAhead,
    {
      scenario,
      externalFactors
    }
  );

  res.success(forecast, 'Cash flow forecast generated successfully');
}));

/**
 * @swagger
 * /forecasting/cash-flow/simulate:
 *   post:
 *     summary: Generate cash flow simulation with custom parameters
 *     tags: [Forecasting]
 *     security:
 *       - bearerAuth: []
 */
router.post("/cash-flow/simulate", protect, [
  body("monthsAhead").optional().isInt({ min: 1, max: 24 }),
  body("incomeChange").optional().isFloat({ min: -50, max: 100 }).withMessage('incomeChange must be between -50% and +100%'),
  body("expenseChanges").optional().isArray(),
  body("expenseChanges.*.category").optional().isString(),
  body("expenseChanges.*.percentage").optional().isFloat({ min: -50, max: 100 }),
  body("oneTimeEvents").optional().isArray(),
  body("oneTimeEvents.*.type").optional().isIn(['income', 'expense']),
  body("oneTimeEvents.*.amount").optional().isFloat({ min: 0 }),
  body("oneTimeEvents.*.month").optional().isInt({ min: 1, max: 24 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const {
    monthsAhead = 6,
    incomeChange = 0,
    expenseChanges = [],
    oneTimeEvents = []
  } = req.body;

  // Get baseline forecast
  const baselineForecast = await forecastingService.generateCashFlowForecast(
    req.user.id,
    monthsAhead,
    { scenario: 'baseline' }
  );

  // Apply simulation adjustments
  const simulatedPredictions = forecastingService.applyCashFlowSimulationAdjustments(
    baselineForecast.predictions,
    { incomeChange, expenseChanges, oneTimeEvents }
  );

  // Calculate new confidence intervals
  const confidenceIntervals = forecastingService.calculateCashFlowConfidenceIntervals(simulatedPredictions);

  const simulationResult = {
    forecastId: `sim_${Date.now()}`,
    predictions: simulatedPredictions,
    confidenceIntervals,
    baselineComparison: baselineForecast.predictions,
    simulationInputs: { incomeChange, expenseChanges, oneTimeEvents },
    accuracy: baselineForecast.accuracy,
    metadata: {
      simulationType: 'custom_parameters',
      basedOnForecastId: baselineForecast.forecastId
    }
  };

  res.success(simulationResult, 'Cash flow simulation generated successfully');
}));

/**
 * @swagger
 * /forecasting/cash-flow/history:
 *   get:
 *     summary: Get user's cash flow forecast history
 *     tags: [Forecasting]
 *     security:
 *       - bearerAuth: []
 */
router.get("/cash-flow/history", protect, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const forecasts = await forecastingService.getUserForecasts(
    req.user.id,
    'cash_flow',
    parseInt(limit)
  );

  res.success(forecasts, 'Cash flow forecast history retrieved successfully');
}));

/**
 * @swagger
 * /forecasting/cash-flow/:forecastId:
 *   get:
 *     summary: Get specific cash flow forecast by ID
 *     tags: [Forecasting]
 *     security:
 *       - bearerAuth: []
 */
router.get("/cash-flow/:forecastId", protect, asyncHandler(async (req, res) => {
  const { forecastId } = req.params;

  const forecast = await forecastingService.getForecastById(forecastId, req.user.id);

  if (!forecast) {
    throw new ValidationError('Forecast not found');
  }

  res.success(forecast, 'Cash flow forecast retrieved successfully');
}));

/**
 * @swagger
 * /forecasting/cash-flow/:forecastId:
 *   delete:
 *     summary: Delete cash flow forecast
 *     tags: [Forecasting]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/cash-flow/:forecastId", protect, asyncHandler(async (req, res) => {
  const { forecastId } = req.params;

  await forecastingService.deleteForecast(forecastId, req.user.id);

  res.success(null, 'Cash flow forecast deleted successfully');
}));

/**
 * @swagger
 * /forecasting/insights:
 *   get:
 *     summary: Get cash flow insights and recommendations
 *     tags: [Forecasting]
 *     security:
 *       - bearerAuth: []
 */
router.get("/insights", protect, asyncHandler(async (req, res) => {
  const { months = 6 } = req.query;

  // Get recent forecast
  const forecasts = await forecastingService.getUserForecasts(
    req.user.id,
    'cash_flow',
    1
  );

  if (forecasts.length === 0) {
    return res.success({
      insights: [],
      recommendations: ['Generate your first cash flow forecast to get personalized insights']
    }, 'No forecasts available for insights');
  }

  const latestForecast = forecasts[0];
  const insights = forecastingService.generateCashFlowInsights(latestForecast);

  res.success({
    forecastId: latestForecast.id,
    insights,
    recommendations: forecastingService.generateCashFlowRecommendations(latestForecast),
    lastUpdated: latestForecast.createdAt
  }, 'Cash flow insights retrieved successfully');
}));

export default router;
