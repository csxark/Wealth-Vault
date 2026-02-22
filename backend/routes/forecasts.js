import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import projectionEngine from '../services/projectionEngine.js';
import scenarioRunner from '../services/scenarioRunner.js';
import liquidityReportService from '../services/liquidityReportService.js';
import db from '../config/db.js';
import { stressTestScenarios, liquidityVelocityLogs, cashFlowProjections, simulationScenarios, simulationResults } from '../db/schema.js';
import simulationAI from '../services/simulationAI.js';
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

/**
 * @desc Get the "Probability Cloud" for 30-year wealth projections
 * @route GET /api/forecasts/butterfly/global
 */
router.get('/butterfly/global', protect, asyncHandler(async (req, res) => {
  const [latest] = await db.select().from(simulationResults)
    .where(eq(simulationResults.userId, req.user.id))
    .orderBy(desc(simulationResults.simulatedOn))
    .limit(1);

  if (!latest) {
    const fresh = await simulationAI.runGlobalSimulation(req.user.id);
    return new ApiResponse(200, fresh, "Generated fresh simulation probability cloud").send(res);
  }

  new ApiResponse(200, latest).send(res);
}));

/**
 * @desc Evaluate the opportunity cost of a recurring expense (Butterfly Effect)
 * @route POST /api/forecasts/butterfly/habit
 */
router.post('/butterfly/habit', protect, asyncHandler(async (req, res) => {
  const { habitName, dailyCost } = req.body;
  const impact = await simulationAI.evaluateHabitImpact(req.user.id, habitName, dailyCost);
  new ApiResponse(200, impact, "Habit opportunity cost evaluated").send(res);
}));

/**
 * @desc Manage simulation scenarios
 * @route GET /api/forecasts/butterfly/scenarios
 */
router.get('/butterfly/scenarios', protect, asyncHandler(async (req, res) => {
  const scenarios = await db.select().from(simulationScenarios)
    .where(eq(simulationScenarios.userId, req.user.id));
  new ApiResponse(200, scenarios).send(res);
}));

export default router;
