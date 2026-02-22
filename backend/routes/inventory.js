import express from 'express';
import { protect } from '../middleware/auth.js';
import taxLotManager from '../services/taxLotManager.js';
import valuationEngine from '../services/valuationEngine.js';
import { validateLotAvailability } from '../middleware/taxGuard.js';
import db from '../config/db.js';
import { taxLotInventory, costBasisAdjustments, liquidationQueues } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @desc Get all open tax lots for an investment
 * @route GET /api/inventory/lots/:investmentId
 */
router.get('/lots/:investmentId', protect, asyncHandler(async (req, res) => {
    const lots = await db.select().from(taxLotInventory)
        .where(and(
            eq(taxLotInventory.userId, req.user.id),
            eq(taxLotInventory.investmentId, req.params.investmentId),
            eq(taxLotInventory.lotStatus, 'open')
        ))
        .orderBy(desc(taxLotInventory.purchaseDate));

    return new ApiResponse(200, lots, "Tax lots retrieved successfully").send(res);
}));

/**
 * @desc Get valuation of a portfolio based on individual lots
 * @route GET /api/inventory/valuation/:portfolioId
 */
router.get('/valuation/:portfolioId', protect, asyncHandler(async (req, res) => {
    const valuation = await valuationEngine.calculateGranularValue(req.user.id, req.params.portfolioId);
    return new ApiResponse(200, valuation, "Lot-based valuation calculated").send(res);
}));

/**
 * @desc Manually adjust cost basis of a lot
 * @route POST /api/inventory/adjust/:lotId
 */
router.post('/adjust/:lotId', protect, asyncHandler(async (req, res) => {
    const { amount, type, description } = req.body;
    const newBasis = await taxLotManager.adjustLotBasis(req.params.lotId, amount, type, description);
    return new ApiResponse(200, { newBasis }, "Cost basis adjusted successfully").send(res);
}));

/**
 * @desc Queue a liquidation using a specific method (HIFO, FIFO, etc)
 * @route POST /api/inventory/liquidate
 */
router.post('/liquidate', protect, validateLotAvailability, asyncHandler(async (req, res) => {
    const { investmentId, quantityToSell, method } = req.body;

    // 1. Queue for processing
    const [queueItem] = await db.insert(liquidationQueues).values({
        userId: req.user.id,
        investmentId,
        totalQuantityToLiquidate: quantityToSell.toString(),
        method: method || 'HIFO',
        status: 'processing'
    }).returning();

    // 2. Immediate processing for this demo logic
    const matchedLots = await taxLotManager.processLiquidation(req.user.id, investmentId, quantityToSell, method);

    await db.update(liquidationQueues)
        .set({ status: 'completed', metadata: { matchedLots } })
        .where(eq(liquidationQueues.id, queueItem.id));

    return new ApiResponse(200, { matchedLots }, "Liquidation processed using granular tax lots").send(res);
}));

export default router;
