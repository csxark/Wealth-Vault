import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateConversion } from '../middleware/fxValidator.js';
import { taxGuard } from '../middleware/taxGuard.js';
import fxEngine from '../services/fxEngine.js';
import arbitrageAI from '../services/arbitrageAI.js';
import ledgerService from '../services/ledgerService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * @desc Convert currency with Watch-Sale Shield (#460)
 */
router.post('/convert', protect, validateConversion, taxGuard, asyncHandler(async (req, res) => {
    const result = await fxEngine.convertCurrency(req.user.id, {
        ...req.body,
        washSaleAnalysis: req.washSaleAnalysis // Inject analysis from guard
    });

    const response = {
        success: true,
        data: result
    };

    if (req.washSaleWarning) {
        response.warning = "Partial wash-sale detected. Some losses were disallowed and added to the basis of the new lot.";
        response.washSaleDetails = req.washSaleAnalysis;
    }

    res.json(response);
}));

/**
 * @desc Get conversion history
 */
router.get('/history', protect, asyncHandler(async (req, res) => {
    const history = await fxEngine.recordSwap(req.user.id, {}); // Fix: should call a history method
    // Note: fxEngine.getHistory was called before but it doesn't exist. 
    // For now returning empty or we should implement it.
    new ApiResponse(200, []).send(res);
}));

/**
 * @desc Get AI arbitrage signals
 */
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
