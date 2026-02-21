import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import projectionEngine from '../services/projectionEngine.js';
import scenarioRunner from '../services/scenarioRunner.js';
import liquidityReportService from '../services/liquidityReportService.js';
import db from '../config/db.js';
import { stressTestScenarios, liquidityVelocityLogs, cashFlowProjections } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/forecasts/projections/summary
 * @desc    Get 12-month Monte Carlo liquidity projections
 */
router.get('/projections/summary', protect, asyncHandler(async (req, res) => {
  const summary = await projectionEngine.getForecastSummary(req.user.id);

  // If no summary exists, trigger an immediate generation (L3 proactiveness)
  if (!summary || summary.length === 0) {
    const freshForecast = await projectionEngine.generateForecast(req.user.id);
    return new ApiResponse(200, freshForecast).send(res);
  }

  new ApiResponse(200, summary).send(res);
}));

/**
 * @route   POST /api/forecasts/projections/generate
 * @desc    Trigger a fresh Monte Carlo simulation
 */
router.post('/projections/generate', protect, asyncHandler(async (req, res) => {
  const forecast = await projectionEngine.generateForecast(req.user.id);
  new ApiResponse(200, forecast).send(res);
}));

/**
 * @route   GET /api/forecasts/scenarios
 * @desc    Get available stress test scenarios
 */
router.get('/scenarios', protect, asyncHandler(async (req, res) => {
  let scenarios = await db.query.stressTestScenarios.findMany({
    where: eq(stressTestScenarios.userId, req.user.id)
  });

  if (scenarios.length === 0) {
    await scenarioRunner.seedScenarios(req.user.id);
    scenarios = await db.query.stressTestScenarios.findMany({
      where: eq(stressTestScenarios.userId, req.user.id)
    });
  }

  new ApiResponse(200, scenarios).send(res);
}));

/**
 * @route   POST /api/forecasts/scenarios/run/:id
 * @desc    Run a specific stress test scenario
 */
router.post('/scenarios/run/:id', protect, asyncHandler(async (req, res) => {
  const result = await scenarioRunner.runStressTest(req.user.id, req.params.id);
  new ApiResponse(200, result).send(res);
}));

/**
 * @route   GET /api/forecasts/health/velocity
 * @desc    Get real-time liquidity velocity and burn rates
 */
router.get('/health/velocity', protect, asyncHandler(async (req, res) => {
  const history = await db.query.liquidityVelocityLogs.findMany({
    where: eq(liquidityVelocityLogs.userId, req.user.id),
    orderBy: [desc(liquidityVelocityLogs.measuredAt)],
    limit: 20
  });
  new ApiResponse(200, history).send(res);
}));

/**
 * @route   GET /api/forecasts/health/report
 * @desc    Generate a comprehensive liquidity health audit
 */
router.get('/health/report', protect, asyncHandler(async (req, res) => {
  const report = await liquidityReportService.generateReport(req.user.id);
  new ApiResponse(200, report).send(res);
}));

export default router;
