import express from 'express';
import db from '../config/db.js';
import { optionsPositions, strategyLegs, impliedVolSurfaces, investments } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import optionsStrategyEngine from '../services/optionsStrategyEngine.js';
import collateralRequirementService from '../services/collateralRequirementService.js';
import impliedVolTracker from '../services/impliedVolTracker.js';
import { logInfo, logError } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Derivatives API (#509)
 * Manages options strategies, collars, and covered calls.
 */

// 1. Model a Zero-Cost Collar (HEDGE downside, CAP upside)
router.post('/model/collar', authMiddleware, async (req, res) => {
    const { investmentId, underlyingPrice, downsideHedgeLimit, tenorDays } = req.body;

    try {
        const collar = await optionsStrategyEngine.constructZeroCostCollar(
            req.user.id,
            investmentId,
            parseFloat(underlyingPrice),
            parseFloat(downsideHedgeLimit || 0.90),
            parseInt(tenorDays || 30)
        );

        res.json(collar);
    } catch (error) {
        logError('[Derivatives App] Modeling failed:', error);
        res.status(500).json({ error: 'Failed to model collar strategy' });
    }
});

// 2. Execute a Strategy (Collar / Covered Call)
router.post('/execute', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { investmentId, vaultId, strategyParams } = req.body;

    try {
        // 1. Check Collateral First (Prevent Naked positions)
        const coverage = await collateralRequirementService.checkCoverage(
            vaultId,
            investmentId,
            parseFloat(strategyParams.call?.contracts || strategyParams.contracts || -1.0)
        );

        if (!coverage.isCovered) {
            return res.status(400).json({
                error: 'Insufficient collateral detected (Short position is naked)',
                shortfall: coverage.shortfall
            });
        }

        const strategy = await optionsStrategyEngine.executeCollar(userId, investmentId, vaultId, strategyParams);
        res.status(201).json(strategy);
    } catch (error) {
        res.status(500).json({ error: 'Strategy execution failed' });
    }
});

// 3. Implied Volatility Surface Data
router.get('/vol-surface/:investmentId', authMiddleware, async (req, res) => {
    const investmentId = req.params.investmentId;

    try {
        const current = await impliedVolTracker.getLatestVol(investmentId);
        const history = await impliedVolTracker.getVolTrend(investmentId);
        res.json({ current, history });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vol data' });
    }
});

// 4. List Active Derivatives for the account
router.get('/positions', authMiddleware, async (req, res) => {
    const userId = req.user.id;

    try {
        const positions = await db.select()
            .from(optionsPositions)
            .where(and(eq(optionsPositions.userId, userId), eq(optionsPositions.status, 'open')));

        res.json(positions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
});

export default router;
