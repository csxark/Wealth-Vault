import express from 'express';
import { protect } from '../middleware/auth.js';
import { simulationGuard } from '../middleware/simulationGuard.js';
import simulationEngine from '../services/simulationEngine.js';
import riskEngine from '../services/riskEngine.js';
import rebalancer from '../services/rebalancer.js';
import db from '../config/db.js';
import { riskProfiles, simulationResults } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/simulations/run
 * @desc    Run a new Monte Carlo simulation
 */
router.post('/run', protect, simulationGuard, async (req, res) => {
    try {
        const result = await simulationEngine.runMonteCarlo(req.user.id, req.body);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/simulations/history
 * @desc    Get previous simulation results
 */
router.get('/history', protect, async (req, res) => {
    try {
        const history = await db.query.simulationResults.findMany({
            where: eq(simulationResults.userId, req.user.id),
            orderBy: [desc(simulationResults.createdAt)],
            limit: 10
        });
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/simulations/risk-metrics
 * @desc    Get aggregate portfolio risk (VaR & Beta)
 */
router.get('/risk-metrics', protect, async (req, res) => {
    try {
        const [varResult, beta] = await Promise.all([
            riskEngine.calculatePortfolioVaR(req.user.id),
            riskEngine.calculatePortfolioBeta(req.user.id)
        ]);

        res.json({
            success: true,
            data: {
                valueAtRisk: varResult,
                portfolioBeta: beta,
                riskLabel: beta > 1.2 ? 'High' : beta < 0.8 ? 'Low' : 'Market'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/simulations/rebalance-advice
 * @desc    Get AI portfolio rebalancing suggestions
 */
router.get('/rebalance-advice', protect, async (req, res) => {
    try {
        const advice = await rebalancer.suggestRebalance(req.user.id);
        res.json({ success: true, data: advice });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/simulations/risk-profile
 * @desc    Set or update user risk profile
 */
router.post('/risk-profile', protect, async (req, res) => {
    try {
        const { riskTolerance, targetReturn, maxDrawdown, preferredAssetMix } = req.body;

        const [profile] = await db.insert(riskProfiles)
            .values({
                userId: req.user.id,
                riskTolerance,
                targetReturn,
                maxDrawdown,
                preferredAssetMix,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: riskProfiles.userId,
                set: { riskTolerance, targetReturn, maxDrawdown, preferredAssetMix, updatedAt: new Date() }
            })
            .returning();

        res.json({ success: true, data: profile });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
