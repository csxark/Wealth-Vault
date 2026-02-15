import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import liquidityOptimizerService from '../services/liquidityOptimizerService.js';
import db from '../config/db.js';
import { creditLines, liquidityProjections, liquidityOptimizerActions } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/liquidity/simulate
 * @desc    Run Monte Carlo liquidity simulation to predict crunches
 * @access  Private
 */
router.post('/simulate', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { iterations, daysAhead } = req.body;

    const projections = await liquidityOptimizerService.simulateLiquidity(userId, iterations, daysAhead);

    return new ApiResponse(200, projections, 'Liquidity simulation completed successfully').send(res);
}));

/**
 * @route   GET /api/liquidity/projections
 * @desc    Get latest liquidity projections with percentile analysis
 * @access  Private
 */
router.get('/projections', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const projections = await db.select()
        .from(liquidityProjections)
        .where(eq(liquidityProjections.userId, userId))
        .orderBy(liquidityProjections.projectionDate);

    return new ApiResponse(200, projections, 'Projections retrieved successfully').send(res);
}));

/**
 * @route   GET /api/liquidity/actions/proposed
 * @desc    Suggest and get proposed optimization actions (arbitrage/liquidation)
 * @access  Private
 */
router.get('/actions/proposed', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const actions = await liquidityOptimizerService.suggestActions(userId);

    return new ApiResponse(200, actions, 'Proposed actions generated successfully').send(res);
}));

/**
 * @route   POST /api/liquidity/actions/:id/execute
 * @desc    Execute a proposed re-routing or liquidation action
 * @access  Private
 */
router.post('/actions/:id/execute', protect, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const actionId = req.params.id;

    const result = await liquidityOptimizerService.executeAction(userId, actionId);

    return new ApiResponse(200, result, 'Action executed successfully').send(res);
}));

/**
 * @route   GET /api/liquidity/credit-lines
 * @desc    Get all active lines of credit
 * @access  Private
 */
router.get('/credit-lines', protect, asyncHandler(async (req, res) => {
    const lines = await db.select()
        .from(creditLines)
        .where(eq(creditLines.userId, req.user.id))
        .orderBy(desc(creditLines.createdAt));

    return new ApiResponse(200, lines, 'Credit lines retrieved successfully').send(res);
}));

/**
 * @route   POST /api/liquidity/credit-lines
 * @desc    Add a new line of credit for arbitrage analysis
 * @access  Private
 */
router.post('/credit-lines', protect, [
    body('provider').notEmpty().withMessage('Provider is required'),
    body('type').notEmpty().withMessage('Type is required'),
    body('creditLimit').isNumeric().withMessage('Limit must be a number'),
    body('interestRate').isNumeric().withMessage('Interest rate must be a number')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new AppError(400, 'Validation failed', errors.array());

    const [line] = await db.insert(creditLines).values({
        userId: req.user.id,
        ...req.body
    }).returning();

    return new ApiResponse(201, line, 'Credit line added successfully').send(res);
}));

/**
 * @route   DELETE /api/liquidity/credit-lines/:id
 * @desc    Remove a credit line
 * @access  Private
 */
router.delete('/credit-lines/:id', protect, asyncHandler(async (req, res) => {
    const result = await db.delete(creditLines)
        .where(and(
            eq(creditLines.id, req.params.id),
            eq(creditLines.userId, req.user.id)
        ));

    return new ApiResponse(200, null, 'Credit line removed successfully').send(res);
}));

/**
 * @route   GET /api/liquidity/arbitrage/strategy
 * @desc    Get user arbitrage strategy
 */
router.get('/arbitrage/strategy', protect, asyncHandler(async (req, res) => {
    const { arbitrageStrategies } = await import('../db/schema.js');
    const [strategy] = await db.select().from(arbitrageStrategies).where(eq(arbitrageStrategies.userId, req.user.id));
    return new ApiResponse(200, strategy, 'Arbitrage strategy retrieved').send(res);
}));

/**
 * @route   POST /api/liquidity/arbitrage/strategy
 * @desc    Update/Create arbitrage strategy
 */
router.post('/arbitrage/strategy', protect, asyncHandler(async (req, res) => {
    const { arbitrageStrategies } = await import('../db/schema.js');
    let [strategy] = await db.select().from(arbitrageStrategies).where(eq(arbitrageStrategies.userId, req.user.id));

    if (strategy) {
        [strategy] = await db.update(arbitrageStrategies)
            .set({ ...req.body, updatedAt: new Date() })
            .where(eq(arbitrageStrategies.id, strategy.id))
            .returning();
    } else {
        [strategy] = await db.insert(arbitrageStrategies)
            .values({ ...req.body, userId: req.user.id })
            .returning();
    }
    return new ApiResponse(200, strategy, 'Arbitrage strategy updated').send(res);
}));

/**
 * @route   GET /api/liquidity/arbitrage/events
 * @desc    Get detected arbitrage events
 */
router.get('/arbitrage/events', protect, asyncHandler(async (req, res) => {
    const { arbitrageEvents } = await import('../db/schema.js');
    const events = await db.select().from(arbitrageEvents)
        .where(eq(arbitrageEvents.userId, req.user.id))
        .orderBy(desc(arbitrageEvents.createdAt));
    return new ApiResponse(200, events, 'Arbitrage events retrieved').send(res);
}));

/**
 * @route   POST /api/liquidity/arbitrage/rebalance
 * @desc    Manual trigger for a user optimization scan
 */
router.post('/arbitrage/rebalance', protect, asyncHandler(async (req, res) => {
    const { default: arbitrageEngine } = await import('../services/arbitrageEngine.js');
    const { arbitrageStrategies } = await import('../db/schema.js');

    const [strategy] = await db.select().from(arbitrageStrategies).where(eq(arbitrageStrategies.userId, req.user.id));
    if (!strategy) throw new AppError(404, 'Strategy not found. Please create one first.');

    await arbitrageEngine.optimizeForUser(req.user.id, strategy);
    return new ApiResponse(200, null, 'Arbitrage rebalance cycle completed').send(res);
}));

export default router;
