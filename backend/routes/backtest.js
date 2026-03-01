import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import backtestService from '../services/backtestService.js';
import { historicalMarketData } from '../db/schema.js';
import db from '../config/db.js';
import { eq, and, gte, lte } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/backtest/run
 * @desc    Run a backtest for a scenario
 * @access  Private
 */
router.post(
    '/run',
    protect,
    [
        body('scenarioId').isUUID().withMessage('Valid scenario ID is required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { scenarioId } = req.body;

        const results = await backtestService.runBacktest(scenarioId);

        res.json({
            success: true,
            data: results,
            message: 'Backtest completed successfully'
        });
    })
);

/**
 * @route   GET /api/backtest/historical-prices/:symbol
 * @desc    Get historical price data for an asset
 * @access  Private
 */
router.get(
    '/historical-prices/:symbol',
    protect,
    [
        param('symbol').trim().notEmpty().withMessage('Symbol is required'),
        query('startDate').isISO8601().withMessage('Valid start date is required'),
        query('endDate').isISO8601().withMessage('Valid end date is required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { symbol } = req.params;
        const { startDate, endDate } = req.query;

        const priceData = await backtestService.getHistoricalPrices(
            symbol.toUpperCase(),
            new Date(startDate),
            new Date(endDate)
        );

        res.json({
            success: true,
            data: priceData,
            count: priceData.length
        });
    })
);

/**
 * @route   GET /api/backtest/performance-metrics/:scenarioId
 * @desc    Get performance metrics for a completed backtest
 * @access  Private
 */
router.get(
    '/performance-metrics/:scenarioId',
    protect,
    [param('scenarioId').isUUID().withMessage('Invalid scenario ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { scenarioId } = req.params;

        const [result] = await db.select()
            .from(backtestResults)
            .where(eq(backtestResults.scenarioId, scenarioId));

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Backtest results not found'
            });
        }

        res.json({
            success: true,
            data: {
                scenarioId,
                performanceMetrics: result.performanceMetrics,
                actualNetWorth: result.actualNetWorth,
                simulatedNetWorth: result.simulatedNetWorth,
                difference: result.difference,
                differencePercent: result.differencePercent
            }
        });
    })
);

/**
 * @route   POST /api/backtest/cache-prices
 * @desc    Manually cache historical prices for an asset
 * @access  Private (Admin only in production)
 */
router.post(
    '/cache-prices',
    protect,
    [
        body('symbol').trim().notEmpty().withMessage('Symbol is required'),
        body('startDate').isISO8601().withMessage('Valid start date is required'),
        body('endDate').isISO8601().withMessage('Valid end date is required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { symbol, startDate, endDate } = req.body;

        // Fetch and cache prices
        const priceData = await backtestService.getHistoricalPrices(
            symbol.toUpperCase(),
            new Date(startDate),
            new Date(endDate)
        );

        res.json({
            success: true,
            message: `Cached ${priceData.length} price points for ${symbol}`,
            data: {
                symbol,
                startDate,
                endDate,
                dataPoints: priceData.length
            }
        });
    })
);

/**
 * @route   GET /api/backtest/available-assets
 * @desc    Get list of assets with cached historical data
 * @access  Private
 */
router.get(
    '/available-assets',
    protect,
    asyncHandler(async (req, res) => {
        const assets = await db.selectDistinct({ symbol: historicalMarketData.symbol })
            .from(historicalMarketData);

        res.json({
            success: true,
            data: assets.map(a => a.symbol),
            count: assets.length
        });
    })
);

export default router;
