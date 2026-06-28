import express from 'express';
import { protect } from '../middleware/auth.js';
import fxSettlement from '../services/fxSettlement.js';
import liquidityBridge from '../services/liquidityBridge.js';
import db from '../config/db.js';
import { internalClearingLogs, liquidityPools, marketRatesOracle } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @desc Get global liquidity pool status
 * @route GET /api/clearing/pools
 */
router.get('/pools', protect, asyncHandler(async (req, res) => {
    const pools = await liquidityBridge.refreshPools(req.user.id);
    return new ApiResponse(200, pools, "Liquidity pools retrieved and refreshed").send(res);
}));

/**
 * @desc Get internal clearing logs
 * @route GET /api/clearing/history
 */
router.get('/history', protect, asyncHandler(async (req, res) => {
    const logs = await db.select().from(internalClearingLogs)
        .where(eq(internalClearingLogs.userId, req.user.id))
        .orderBy(desc(internalClearingLogs.createdAt));

    return new ApiResponse(200, logs, "Internal clearing history retrieved").send(res);
}));

/**
 * @desc Execute an internal currency swap (Ledger Offset)
 * @route POST /api/clearing/swap
 */
router.post('/swap', protect, asyncHandler(async (req, res) => {
    const { fromVaultId, toVaultId, fromCurrency, toCurrency, amount } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json(new ApiResponse(400, null, "Invalid amount for swap."));
    }

    const result = await fxSettlement.settleInternally(
        req.user.id,
        fromVaultId,
        toVaultId,
        fromCurrency,
        toCurrency,
        amount
    );

    return new ApiResponse(200, result, "Internal swap executed successfully").send(res);
}));

/**
 * @desc Get high-frequency market rates from oracle
 * @route GET /api/clearing/rates
 */
router.get('/rates', protect, asyncHandler(async (req, res) => {
    const rates = await db.select().from(marketRatesOracle);
    return new ApiResponse(200, rates, "Live market rates retrieved from oracle").send(res);
}));

export default router;
