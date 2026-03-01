import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import arbitrageScout from '../services/arbitrageScout.js';
import waccCalculator from '../services/waccCalculator.js';
import optimalPayoffEngine from '../services/optimalPayoffEngine.js';
import debtMigrationService from '../services/debtMigrationService.js';
import { validateLeverage } from '../middleware/leverageValidator.js';
import db from '../config/db.js';
import { debtArbitrageLogs, capitalCostSnapshots, refinanceRoiMetrics } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/arbitrage/wacc
 * @desc    Get current WACC and capital cost breakdown
 */
router.get('/wacc', protect, asyncHandler(async (req, res) => {
    const wacc = await waccCalculator.calculateUserWACC(req.user.id);
    new ApiResponse(200, wacc).send(res);
}));

/**
 * @route   GET /api/arbitrage/wacc/history
 * @desc    Get historical WACC snapshots
 */
router.get('/wacc/history', protect, asyncHandler(async (req, res) => {
    const history = await waccCalculator.getWACCHistory(req.user.id);
    new ApiResponse(200, history).send(res);
}));

/**
 * @route   GET /api/arbitrage/opportunities
 * @desc    Scan for and retrieve arbitrage opportunities
 */
router.get('/opportunities', protect, asyncHandler(async (req, res) => {
    const opportunities = await arbitrageScout.scanForArbitrage(req.user.id);
    new ApiResponse(200, opportunities).send(res);
}));

/**
 * @route   POST /api/arbitrage/execute/:logId
 * @desc    Execute a specific arbitrage recommendation
 */
router.post('/execute/:logId', protect, asyncHandler(async (req, res) => {
    const result = await arbitrageScout.executeArbitrage(req.params.logId);
    new ApiResponse(200, result).send(res);
}));

/**
 * @route   GET /api/arbitrage/payoff-strategy
 * @desc    Get optimal debt payoff order for extra cash
 */
router.get('/payoff-strategy', protect, asyncHandler(async (req, res) => {
    const { amount = 0 } = req.query;
    const strategy = await optimalPayoffEngine.determineOptimalPayoff(req.user.id, parseFloat(amount));
    new ApiResponse(200, strategy).send(res);
}));

/**
 * @route   POST /api/arbitrage/refinance/analyze
 * @desc    Analyze a potential refinance offer
 */
router.post('/refinance/analyze', protect, asyncHandler(async (req, res) => {
    const { debtId, proposedRate, closingCosts } = req.body;
    const analysis = await debtMigrationService.analyzeRefinance(
        req.user.id,
        debtId,
        parseFloat(proposedRate),
        parseFloat(closingCosts)
    );
    new ApiResponse(200, analysis).send(res);
}));

/**
 * @route   POST /api/arbitrage/refinance/complete/:metricId
 * @desc    Complete a refinance migration
 */
router.post('/refinance/complete/:metricId', protect, validateLeverage, asyncHandler(async (req, res) => {
    const result = await debtMigrationService.completeMigration(req.params.metricId);
    new ApiResponse(200, result, 'Debt successfully migrated/refinanced').send(res);
}));

/**
 * @route   GET /api/arbitrage/roi-metrics
 * @desc    Get all historical refinance ROI metrics
 */
router.get('/roi-metrics', protect, asyncHandler(async (req, res) => {
    const metrics = await db.query.refinanceRoiMetrics.findMany({
        where: eq(refinanceRoiMetrics.userId, req.user.id),
        orderBy: [desc(refinanceRoiMetrics.createdAt)]
    });
    new ApiResponse(200, metrics).send(res);
}));

export default router;
