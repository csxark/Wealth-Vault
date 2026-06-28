import express from 'express';
import { protect } from '../middleware/auth.js';
import marginEngine from '../services/marginEngine.js';
import stressTesterAI from '../services/stressTesterAI.js';
import db from '../config/db.js';
import { collateralSnapshots, stressTestScenarios } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @desc Get current margin and LTV status
 * @route GET /api/margin/status
 */
router.get('/status', protect, asyncHandler(async (req, res) => {
    const status = await marginEngine.calculateRiskPosition(req.user.id);
    return new ApiResponse(200, status, "Margin status retrieved").send(res);
}));

/**
 * @desc Run a liquidity stress test simulation
 * @route POST /api/margin/stress-test
 */
router.post('/stress-test', protect, asyncHandler(async (req, res) => {
    const { scenarioId } = req.body;
    const results = await stressTesterAI.runSimulation(req.user.id, scenarioId);
    return new ApiResponse(200, results, "Stress test simulation complete").send(res);
}));

/**
 * @desc Get historical collateral snapshots
 * @route GET /api/margin/history
 */
router.get('/history', protect, asyncHandler(async (req, res) => {
    const history = await db.select().from(collateralSnapshots)
        .where(eq(collateralSnapshots.userId, req.user.id))
        .orderBy(desc(collateralSnapshots.timestamp))
        .limit(30);

    return new ApiResponse(200, history, "Historical snapshots retrieved").send(res);
}));

/**
 * @desc Get available stress test scenarios
 * @route GET /api/margin/scenarios
 */
router.get('/scenarios', protect, asyncHandler(async (req, res) => {
    const scenarios = await db.select().from(stressTestScenarios);
    return new ApiResponse(200, scenarios, "Stress test scenarios retrieved").send(res);
}));

export default router;
