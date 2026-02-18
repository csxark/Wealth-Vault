import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import anomalyDetector from '../services/anomalyDetector.js';
import syntheticPivotService from '../services/syntheticPivotService.js';
import hedgeEngine from '../services/hedgeEngine.js';
import db from '../config/db.js';
import { marketAnomalyDefinitions, hedgeExecutionHistory, syntheticVaultMappings } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/risk-lab/status
 * @desc    Get current anomaly and protection status
 */
router.get('/status', protect, asyncHandler(async (req, res) => {
    const activeAnomalies = await anomalyDetector.getActiveAnomalies(req.user.id);
    const definitions = await db.query.marketAnomalyDefinitions.findMany({
        where: eq(marketAnomalyDefinitions.userId, req.user.id)
    });
    new ApiResponse(200, { activeAnomalies, definitions }).send(res);
}));

/**
 * @route   POST /api/risk-lab/panic
 * @desc    Manual "Panic Button" - Immediately activates all safe-haven shields
 */
router.post('/panic', protect, asyncHandler(async (req, res) => {
    const { reason = 'Manual UI Trigger' } = req.body;
    const execution = await anomalyDetector.manualTrigger(req.user.id, 'MANUAL_PANIC', { reason });
    await syntheticPivotService.executeShieldUp(req.user.id, null, 'MANUAL_PANIC', 'emergency');
    new ApiResponse(200, execution, 'EMERGENCY SHIELD ACTIVATED').send(res);
}));

/**
 * @route   POST /api/risk-lab/restore
 * @desc    Deactivate protection and restore normal operations
 */
router.post('/restore', protect, asyncHandler(async (req, res) => {
    const { executionIds } = req.body;
    const result = await syntheticPivotService.executeShieldDown(req.user.id, executionIds);
    new ApiResponse(200, result, 'Shield deactivated. Assets restoring...').send(res);
}));

/**
 * @route   POST /api/risk-lab/simulate
 * @desc    Monte-Carlo simulation for a black-swan event
 */
router.post('/simulate', protect, asyncHandler(async (req, res) => {
    const { scenarioType, marketDrop = 0.20 } = req.body;

    // Simulate pivot impact
    const pivotPlan = await hedgeEngine.calculatePivot(req.user.id, scenarioType, 'high');
    const totalShielded = pivotPlan.reduce((sum, p) => sum + p.amountToPivot, 0);
    const estimatedBenefit = await hedgeEngine.estimateHedgeImpact(totalShielded, 30, -marketDrop);

    new ApiResponse(200, {
        scenarioType,
        totalCapitalAtRisk: 100000,
        shieldedCapital: totalShielded,
        projectedLossWithoutShield: 100000 * marketDrop,
        projectedLossWithShield: (100000 - totalShielded) * marketDrop,
        netPreservationBenefit: estimatedBenefit
    }).send(res);
}));

/**
 * @route   POST /api/risk-lab/mappings
 * @desc    Configure safe-haven vault mappings
 */
router.post('/mappings', protect, asyncHandler(async (req, res) => {
    const { sourceVaultId, safeHavenVaultId, ratio } = req.body;
    const [mapping] = await db.insert(syntheticVaultMappings).values({
        userId: req.user.id,
        sourceVaultId,
        safeHavenVaultId,
        pivotTriggerRatio: ratio.toString()
    }).returning();
    new ApiResponse(201, mapping).send(res);
}));

export default router;
