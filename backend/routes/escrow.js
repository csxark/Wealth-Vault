import express from 'express';
import { protect } from '../middleware/auth.js';
import escrowEngine from '../services/escrowEngine.js';
import stochasticHedgingService from '../services/stochasticHedgingService.js';
import marginCallMitigator from '../services/marginCallMitigator.js';
import db from '../config/db.js';
import { escrowContracts, activeHedges, trancheReleases, escrowAuditLogs } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from 'express-async-handler';
import { body, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @desc Initialize a high-value multi-currency escrow
 * @route POST /api/escrow
 */
router.post('/', protect, [
    body('title').notEmpty(),
    body('totalAmount').isNumeric(),
    body('escrowCurrency').isLength({ min: 3, max: 3 }),
    body('tranches').isArray()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const contract = await escrowEngine.createEscrow(req.user.id, req.body);

    // Auto-trigger stochastic hedge calculation
    await stochasticHedgingService.calculateRequiredHedge(contract.id);

    return new ApiResponse(201, contract, 'Smart Escrow initialized and hedged').send(res);
}));

/**
 * @desc Get all escrow contracts for user
 * @route GET /api/escrow
 */
router.get('/', protect, asyncHandler(async (req, res) => {
    const contracts = await db.select().from(escrowContracts).where(eq(escrowContracts.userId, req.user.id));
    return new ApiResponse(200, contracts).send(res);
}));

/**
 * @desc Release a fund tranche via signature
 * @route POST /api/escrow/:contractId/tranches/:trancheId/sign
 */
router.post('/:contractId/tranches/:trancheId/sign', protect, asyncHandler(async (req, res) => {
    const result = await escrowEngine.castTrancheSignature(
        req.params.contractId,
        req.params.trancheId,
        req.user.id
    );
    return new ApiResponse(200, result, 'Signature recorded').send(res);
}));

/**
 * @desc Get real-time hedge valuated data
 * @route GET /api/escrow/hedges/:hedgeId
 */
router.get('/hedges/:hedgeId', protect, asyncHandler(async (req, res) => {
    const reval = await stochasticHedgingService.revalueHedge(req.params.hedgeId);
    new ApiResponse(200, reval, 'Real-time hedge revaluation complete').send(res);
}));

export default router;
