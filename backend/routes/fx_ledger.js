
import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateConversion } from '../middleware/fxValidator.js';
import fxEngine from '../services/fxEngine.js';
import arbitrageAI from '../services/arbitrageAI.js';

const router = express.Router();

// Convert currency
router.post('/convert', protect, validateConversion, async (req, res) => {
    try {
        const transaction = await fxEngine.convertCurrency(req.user.id, req.body);
        res.json({ success: true, data: transaction });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get conversion history
router.get('/history', protect, async (req, res) => {
    const history = await fxEngine.getHistory(req.user.id);
    res.json({ success: true, data: history });
});

import ledgerService from '../services/ledgerService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// Get AI arbitrage signals
router.get('/signals', protect, asyncHandler(async (req, res) => {
    const opportunities = await fxEngine.detectTriangularArbitrage();
    new ApiResponse(200, opportunities).send(res);
}));

/**
 * @desc Get optimal settlement path for inter-entity transfer
 */
router.get('/optimize-path', protect, asyncHandler(async (req, res) => {
    const { fromEntityId, toEntityId, amountUSD } = req.query;
    const path = await ledgerService.optimizeSettlementPath(req.user.id, fromEntityId, toEntityId, parseFloat(amountUSD));
    new ApiResponse(200, path).send(res);
}));

/**
 * @desc Create/Update Hedging Rule
 */
router.post('/hedging', protect, asyncHandler(async (req, res) => {
    const rule = await fxEngine.upsertHedgingRule(req.user.id, req.body);
    new ApiResponse(201, rule).send(res);
}));

export default router;
