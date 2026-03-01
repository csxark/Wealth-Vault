import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import currencyManager from '../services/currencyManager.js';
import fxConverter from '../services/fxConverter.js';
import db from '../config/db.js';
import { currencyHedgingPositions, userCurrencies } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/currency-portfolio/preferences
 * @desc    Get user currency preferences
 * @access  Private
 */
router.get(
    '/preferences',
    protect,
    asyncHandler(async (req, res) => {
        const currencies = await currencyManager.getUserCurrencies(req.user.id);
        const base = await currencyManager.getBaseCurrency(req.user.id);
        res.json({ success: true, data: { currencies, baseCurrency: base } });
    })
);

/**
 * @route   POST /api/currency-portfolio/base
 * @desc    Set user base currency
 * @access  Private
 */
router.post(
    '/base',
    protect,
    [body('currencyCode').isLength({ min: 3, max: 3 }).isUppercase()],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const result = await currencyManager.setBaseCurrency(req.user.id, req.body.currencyCode);
        res.json({ success: true, data: result });
    })
);

/**
 * @route   POST /api/currency-portfolio/convert
 * @desc    Convert amount between currencies
 * @access  Private
 */
router.post(
    '/convert',
    protect,
    [
        body('amount').isFloat({ min: 0 }),
        body('from').isLength({ min: 3, max: 3 }),
        body('to').isLength({ min: 3, max: 3 })
    ],
    asyncHandler(async (req, res) => {
        const { amount, from, to } = req.body;
        const converted = await fxConverter.convert(amount, from, to);
        const rate = await fxConverter.getRate(from, to);

        res.json({
            success: true,
            data: {
                originalAmount: amount,
                convertedAmount: converted,
                rate,
                from,
                to
            }
        });
    })
);

/**
 * @route   GET /api/currency-portfolio/hedges
 * @desc    Get currency hedging positions
 * @access  Private
 */
router.get(
    '/hedges',
    protect,
    asyncHandler(async (req, res) => {
        const hedges = await db.select()
            .from(currencyHedgingPositions)
            .where(eq(currencyHedgingPositions.userId, req.user.id));
        res.json({ success: true, data: hedges });
    })
);

/**
 * @route   POST /api/currency-portfolio/hedges
 * @desc    Create a new hedging position
 * @access  Private
 */
router.post(
    '/hedges',
    protect,
    [
        body('baseCurrency').isLength({ min: 3, max: 3 }),
        body('targetCurrency').isLength({ min: 3, max: 3 }),
        body('notionalAmount').isFloat({ min: 0.01 }),
        body('hedgeType').isIn(['forward', 'option', 'swap']),
        body('entryRate').isFloat({ min: 0.000001 })
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const [hedge] = await db.insert(currencyHedgingPositions)
            .values({ ...req.body, userId: req.user.id })
            .returning();

        res.status(201).json({ success: true, data: hedge });
    })
);

export default router;
