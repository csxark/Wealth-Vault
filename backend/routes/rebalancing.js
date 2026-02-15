import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import rebalanceEngine from '../services/rebalanceEngine.js';
import { db } from '../db/index.js';
import { targetAllocations, rebalanceHistory, driftLogs } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { body, validationResult } from 'express-validator';
import asyncHandler from 'express-async-handler';

const router = express.Router();

/**
 * @desc Get target allocations for a portfolio
 * @route GET /api/rebalancing/:portfolioId/targets
 */
router.get('/:portfolioId/targets', protect, asyncHandler(async (req, res) => {
    const targets = await db.select()
        .from(targetAllocations)
        .where(and(
            eq(targetAllocations.userId, req.user.id),
            eq(targetAllocations.portfolioId, req.params.portfolioId)
        ));

    res.json({ success: true, data: targets });
}));

/**
 * @desc Update/Set target allocations
 * @route POST /api/rebalancing/:portfolioId/targets
 */
router.post('/:portfolioId/targets', protect, [
    body('targets').isArray().withMessage('Targets must be an array'),
    body('targets.*.symbol').notEmpty().withMessage('Symbol is required'),
    body('targets.*.targetPercentage').isFloat({ min: 0, max: 100 }).withMessage('Percentage must be 0-100')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { portfolioId } = req.params;
    const { targets } = req.body;

    // 1. Delete old targets
    await db.delete(targetAllocations).where(and(
        eq(targetAllocations.userId, req.user.id),
        eq(targetAllocations.portfolioId, portfolioId)
    ));

    // 2. Insert new targets
    const inserts = targets.map(t => ({
        userId: req.user.id,
        portfolioId,
        symbol: t.symbol,
        targetPercentage: t.targetPercentage.toString(),
        toleranceBand: (t.toleranceBand || 5).toString()
    }));

    await db.insert(targetAllocations).values(inserts);

    res.status(201).json({ success: true, message: 'Targets updated successfully' });
}));

/**
 * @desc Check drift and get a rebalance plan
 * @route GET /api/rebalancing/:portfolioId/drift
 */
router.get('/:portfolioId/drift', protect, asyncHandler(async (req, res) => {
    const driftData = await rebalanceEngine.calculatePortfolioDrift(req.user.id, req.params.portfolioId);
    res.json({ success: true, data: driftData });
}));

/**
 * @desc Generate and propose rebalance trades
 * @route POST /api/rebalancing/:portfolioId/propose
 */
router.post('/:portfolioId/propose', protect, asyncHandler(async (req, res) => {
    const plan = await rebalanceEngine.generateRebalancePlan(req.user.id, req.params.portfolioId);
    res.json({ success: true, data: plan });
}));

/**
 * @desc View execution history
 * @route GET /api/rebalancing/:portfolioId/history
 */
router.get('/:portfolioId/history', protect, asyncHandler(async (req, res) => {
    const history = await db.select()
        .from(rebalanceHistory)
        .where(and(
            eq(rebalanceHistory.userId, req.user.id),
            eq(rebalanceHistory.portfolioId, req.params.portfolioId)
        ))
        .orderBy(desc(rebalanceHistory.createdAt));

    res.json({ success: true, data: history });
}));

import yieldService from '../services/yieldService.js';
import { yieldStrategies, rebalanceExecutionLogs } from '../db/schema.js';

/**
 * @desc Get all yield strategies
 * @route GET /api/rebalancing/yield/strategies
 */
router.get('/yield/strategies', protect, asyncHandler(async (req, res) => {
    const strategies = await db.select().from(yieldStrategies).where(eq(yieldStrategies.userId, req.user.id));
    res.json({ success: true, data: strategies });
}));

/**
 * @desc Trigger manual yield optimization simulation
 * @route POST /api/rebalancing/yield/optimize
 */
router.post('/yield/optimize', protect, asyncHandler(async (req, res) => {
    const logs = await yieldService.optimizeYield(req.user.id);
    res.json({ success: true, message: 'Yield optimization cycle completed', rebalances: logs });
}));

/**
 * @desc Get execution logs for yield rebalancing
 * @route GET /api/rebalancing/yield/logs
 */
router.get('/yield/logs', protect, asyncHandler(async (req, res) => {
    const logs = await db.select()
        .from(rebalanceExecutionLogs)
        .where(eq(rebalanceExecutionLogs.userId, req.user.id))
        .orderBy(desc(rebalanceExecutionLogs.createdAt));
    res.json({ success: true, data: logs });
}));

export default router;
