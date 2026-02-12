import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import liquidityService from '../services/liquidityService.js';
import runwayEngine from '../services/runwayEngine.js';

const router = express.Router();

/**
 * @route   GET /api/liquidity/health
 * @desc    Get liquidity health score and status
 * @access  Private
 */
router.get(
    '/health',
    protect,
    asyncHandler(async (req, res) => {
        const health = await liquidityService.getLiquidityHealth(req.user.id);

        res.json({
            success: true,
            data: health
        });
    })
);

/**
 * @route   GET /api/liquidity/runway
 * @desc    Get current cash flow runway
 * @access  Private
 */
router.get(
    '/runway',
    protect,
    asyncHandler(async (req, res) => {
        const runway = await runwayEngine.calculateCurrentRunway(req.user.id);

        res.json({
            success: true,
            data: runway
        });
    })
);

/**
 * @route   POST /api/liquidity/monitor
 * @desc    Monitor liquidity and trigger rescue if needed
 * @access  Private
 */
router.post(
    '/monitor',
    protect,
    asyncHandler(async (req, res) => {
        const result = await liquidityService.monitorLiquidity(req.user.id);

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @route   GET /api/liquidity/rescues
 * @desc    Get rescue history
 * @access  Private
 */
router.get(
    '/rescues',
    protect,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const limit = parseInt(req.query.limit) || 10;
        const rescues = await liquidityService.getRescueHistory(req.user.id, limit);

        res.json({
            success: true,
            data: rescues,
            count: rescues.length
        });
    })
);

/**
 * @route   POST /api/liquidity/forecast
 * @desc    Generate cash flow forecast
 * @access  Private
 */
router.post(
    '/forecast',
    protect,
    [
        body('daysAhead').optional().isInt({ min: 1, max: 365 }).withMessage('Days ahead must be between 1 and 365')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const daysAhead = req.body.daysAhead || 90;
        const forecast = await runwayEngine.generateForecast(req.user.id, daysAhead);

        res.json({
            success: true,
            data: forecast,
            count: forecast.length
        });
    })
);

/**
 * @route   POST /api/liquidity/simulate-impact
 * @desc    Simulate impact of scenario on runway
 * @access  Private
 */
router.post(
    '/simulate-impact',
    protect,
    [
        body('incomeReduction').optional().isFloat({ min: 0, max: 100 }).withMessage('Income reduction must be 0-100%'),
        body('expenseIncrease').optional().isFloat({ min: 0, max: 100 }).withMessage('Expense increase must be 0-100%')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const currentRunway = await runwayEngine.calculateCurrentRunway(req.user.id);
        const impact = runwayEngine.simulateScenarioImpact(currentRunway, req.body);

        res.json({
            success: true,
            data: impact
        });
    })
);

/**
 * @route   PUT /api/liquidity/rescue-rules
 * @desc    Configure rescue rules
 * @access  Private
 */
router.put(
    '/rescue-rules',
    protect,
    [
        body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
        body('minTransferAmount').optional().isFloat({ min: 0 }).withMessage('Min transfer must be positive'),
        body('maxTransferAmount').optional().isFloat({ min: 0 }).withMessage('Max transfer must be positive'),
        body('cooldownHours').optional().isInt({ min: 1, max: 168 }).withMessage('Cooldown must be 1-168 hours')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const rules = await liquidityService.configureRescueRules(req.user.id, req.body);

        res.json({
            success: true,
            data: rules,
            message: 'Rescue rules updated successfully'
        });
    })
);

/**
 * @route   GET /api/liquidity/status
 * @desc    Get comprehensive liquidity status
 * @access  Private
 */
router.get(
    '/status',
    protect,
    asyncHandler(async (req, res) => {
        const [health, runway, recentRescues] = await Promise.all([
            liquidityService.getLiquidityHealth(req.user.id),
            runwayEngine.calculateCurrentRunway(req.user.id),
            liquidityService.getRescueHistory(req.user.id, 5)
        ]);

        const runwayStatus = runwayEngine.getRunwayStatus(runway.runwayDays);

        res.json({
            success: true,
            data: {
                health,
                runway: {
                    ...runway,
                    status: runwayStatus
                },
                recentRescues
            }
        });
    })
);

export default router;
