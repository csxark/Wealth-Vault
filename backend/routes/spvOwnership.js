import express from 'express';
import db from '../config/db.js';
import { spvEntities, lpCommitments, waterfallTiers, capitalCalls, companies, entities } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import spvManagerService from '../services/spvManagerService.js';
import waterfallDistributionEngine from '../services/waterfallDistributionEngine.js';
import lpContributionTracker from '../services/lpContributionTracker.js';
import { logInfo, logError } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * SPV Ownership and Waterfall API (#510)
 * Manages LP/GP partnerships, capital calls, and asymmetric profit distributions.
 */

// 1. Create a new SPV vehicle with GP and initial waterfall tiers
router.post('/create', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
        name,
        description,
        gpEntityId,
        initialAssetValue,
        tiers
    } = req.body;

    try {
        const spv = await spvManagerService.createSPV(userId, {
            name,
            description,
            gpEntityId,
            initialAssetValue,
            tiers
        });

        logInfo(`[SPV Route] Vehicle created: ${name} (GP: ${gpEntityId})`);
        res.status(201).json(spv);
    } catch (error) {
        logError('[SPV Route] Creation failed:', error);
        res.status(500).json({ error: 'Failed to create SPV structure' });
    }
});

// 2. Add an LP to the SPV (Capital Commitment)
router.post('/:id/commitment', authMiddleware, async (req, res) => {
    const spvId = req.params.id;
    const { lpEntityId, committedAmount } = req.body;

    try {
        const commitment = await spvManagerService.addLPCommitment(spvId, {
            lpEntityId,
            committedAmount
        });

        res.status(201).json(commitment);
    } catch (error) {
        res.status(500).json({ error: 'LP Commitment failed' });
    }
});

// 3. Issue a Capital Call for the SPV LPs
router.post('/:id/capital-call', authMiddleware, async (req, res) => {
    const spvId = req.params.id;
    const { amount, dueDate } = req.body;

    try {
        const call = await spvManagerService.issueCapitalCall(spvId, amount, dueDate);
        res.status(201).json(call);
    } catch (error) {
        res.status(500).json({ error: 'Capital call issuance failed' });
    }
});

// 4. Fund a Capital Call (LP Side)
router.post('/commitment/:id/fund', authMiddleware, async (req, res) => {
    const commitmentId = req.params.id;
    const { callId, amount } = req.body;
    const userId = req.user.id;

    try {
        const result = await lpContributionTracker.fundCapitalCall(userId, commitmentId, callId, amount);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Funding failed' });
    }
});

// 5. Run & Preview Waterfall Distribution (Liquidity Event)
router.post('/:id/distribution', authMiddleware, async (req, res) => {
    const spvId = req.params.id;
    const { exitProceeds, execute = false } = req.body;
    const userId = req.user.id;

    try {
        if (execute) {
            const result = await waterfallDistributionEngine.executeDistribution(userId, spvId, exitProceeds);
            res.json(result);
        } else {
            const preview = await waterfallDistributionEngine.calculateDistribution(spvId, exitProceeds);
            res.json(preview);
        }
    } catch (error) {
        res.status(500).json({ error: 'Waterfall distribution failed' });
    }
});

// 6. Get Performance Metrics for a commitment (IRR/MOIC)
router.get('/commitment/:id/performance', authMiddleware, async (req, res) => {
    const commitmentId = req.params.id;

    try {
        const metrics = await lpContributionTracker.getLPMetrics(commitmentId);
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
});

export default router;
