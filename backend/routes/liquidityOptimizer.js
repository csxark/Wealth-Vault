import express from 'express';
import { protect } from '../middleware/auth.js';
import liquidityOptimizerService from '../services/liquidityOptimizerService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from 'express-async-handler';
import { body, validationResult } from 'express-validator';
import db from '../config/db.js';
import { optimizationRuns } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @desc Calculate optimal liquidity move
 * @route POST /api/liquidity/optimize
 */
router.post('/optimize', protect, [
    body('destinationVaultId').isUUID(),
    body('amountUSD').isNumeric()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const result = await liquidityOptimizerService.findOptimalPath(
        req.user.id,
        req.body.destinationVaultId,
        parseFloat(req.body.amountUSD)
    );

    return new ApiResponse(200, result, 'Optimal liquidity path calculated').send(res);
}));

/**
 * @desc Get optimization history
 * @route GET /api/liquidity/history
 */
router.get('/history', protect, asyncHandler(async (req, res) => {
    const history = await db.select()
        .from(optimizationRuns)
        .where(eq(optimizationRuns.userId, req.user.id))
        .orderBy(desc(optimizationRuns.createdAt))
        .limit(20);

    return new ApiResponse(200, history).send(res);
}));

export default router;
