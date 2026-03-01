import express from 'express';
import { protect } from '../middleware/auth.js';
import cascadeStressTester from '../services/cascadeStressTester.js';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { stressTestSimulations, topologySnapshots } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

/**
 * @desc Generate and retrieve D3-compatible node-link representation of network
 * @route GET /api/interlock/topology
 */
router.get('/topology', protect, asyncHandler(async (req, res) => {
    // Freshly generate the topology with all stress test metrics included
    const snapshot = await cascadeStressTester.generateTopology(req.user.id);
    new ApiResponse(200, snapshot, 'Interlocking network topology generated').send(res);
}));

/**
 * @desc Run what-if cascade stress test simulation (#465)
 * @route POST /api/interlock/simulate-shock
 */
router.post('/simulate-shock', protect, [
    body('targetVaultId').isUUID().withMessage('targetVaultId must be a valid UUID'),
    body('shockPercentage').isFloat({ min: 0.1, max: 100 }).withMessage('shockPercentage must be between 0.1 and 100'),
    validateRequest
], asyncHandler(async (req, res) => {
    const { targetVaultId, shockPercentage } = req.body;

    const simulation = await cascadeStressTester.simulateShock(
        req.user.id,
        targetVaultId,
        parseFloat(shockPercentage),
        false // User-triggered
    );

    new ApiResponse(201, simulation, `Stress test completed: ${simulation.insolventVaultsCount} vaults rendered insolvent`).send(res);
}));

/**
 * @desc Get historical stress tests for analysis
 * @route GET /api/interlock/stress-tests
 */
router.get('/stress-tests', protect, asyncHandler(async (req, res) => {
    const simulations = await db.select()
        .from(stressTestSimulations)
        .where(eq(stressTestSimulations.userId, req.user.id))
        .orderBy(desc(stressTestSimulations.createdAt))
        .limit(20);

    new ApiResponse(200, simulations, 'Historical stress tests retrieved').send(res);
}));

import insolvencyMitigator from '../services/insolvencyMitigator.js';

/**
 * @desc Auto-generate an intervention plan for a failing vault
 * @route POST /api/interlock/mitigate-insolvency
 */
router.post('/mitigate-insolvency', protect, [
    body('failedVaultId').isUUID().withMessage('failedVaultId must be a valid UUID'),
    body('requiredLiquidityDelta').isFloat({ min: 0 }).withMessage('requiredLiquidityDelta must be a positive number'),
    validateRequest
], asyncHandler(async (req, res) => {
    const { failedVaultId, requiredLiquidityDelta } = req.body;

    const plan = await insolvencyMitigator.generateMitigationPlan(
        req.user.id,
        failedVaultId,
        parseFloat(requiredLiquidityDelta)
    );

    new ApiResponse(200, plan, `Mitigation plan generated for Vault ${failedVaultId}`).send(res);
}));

export default router;
