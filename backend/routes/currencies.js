import express from 'express';
import { body, validationResult } from 'express-validator';
import fxEngine from '../services/fxEngine.js';
import arbitrageAI from '../services/arbitrageAI.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { fxRates } from '../db/schema.js';

import { validateCurrencySupport } from '../middleware/currencyValidator.js';

const router = express.Router();

/**
 * @route   GET /api/currencies/wallets
 * @desc    Get currency balances (personal or vault)
 */
router.get('/wallets', protect, asyncHandler(async (req, res, next) => {
    const { vaultId } = req.query;
    // Add logic to check vault access if vaultId is present

    const balances = await fxEngine.getBalances(req.user.id, vaultId);
    return new ApiResponse(200, balances, 'Currency balances retrieved successfully').send(res);
}));

/**
 * @route   GET /api/currencies/rates
 * @desc    Get live FX rates
 */
router.get('/rates', protect, asyncHandler(async (req, res, next) => {
    const rates = await db.select().from(fxRates);
    return new ApiResponse(200, rates, 'FX rates retrieved successfully').send(res);
}));

/**
 * @route   POST /api/currencies/swap
 * @desc    Execute a currency swap
 */
router.post('/swap', protect, validateCurrencySupport, [
    body('amount').isFloat({ gt: 0 }),
], asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { sourceCurrency, targetCurrency, amount, vaultId } = req.body;

    const transaction = await fxEngine.executeSwap(
        req.user.id,
        sourceCurrency,
        targetCurrency,
        amount,
        vaultId
    );

    return new ApiResponse(200, transaction, 'Swap executed successfully').send(res);
}));

/**
 * @route   GET /api/currencies/arbitrage
 * @desc    Get active arbitrage opportunities
 */
router.get('/arbitrage', protect, asyncHandler(async (req, res, next) => {
    // We can filter by user preference later
    const opportunities = await db.query.arbitrageOpportunities.findMany({
        where: (opps, { gt, eq }) => req.query.all ? undefined : eq(opps.status, 'active'),
        orderBy: (opps, { desc }) => [desc(opps.confidence)],
        limit: 10
    });

    return new ApiResponse(200, opportunities, 'Arbitrage opportunities retrieved successfully').send(res);
}));

export default router;
