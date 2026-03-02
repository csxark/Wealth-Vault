import express from 'express';
import db from '../config/db.js';
import { charitableTrusts, crtPayouts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crtOptimizer from '../services/crtOptimizer.js';
import taxDeductionCalculator from '../services/taxDeductionCalculator.js';
import crtImpactTracker from '../services/crtImpactTracker.js';
import { logInfo, logError } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Philanthropic "Alpha" API (#535)
 * Manages Charitable Remainder Trusts and Tax-Aware Giving.
 */

// 1. Model a CRT and check IRS Compliance
router.post('/model-crt', authMiddleware, async (req, res) => {
    const { initialValue, payoutRate, term, irsRate, type } = req.body;

    try {
        const model = await crtOptimizer.modelCRT({
            initialValue: parseFloat(initialValue),
            payoutRate: parseFloat(payoutRate),
            term: parseInt(term),
            irsRate: parseFloat(irsRate),
            type
        });

        res.json(model);
    } catch (error) {
        logError('[Philanthropy API] Modeling failed:', error);
        res.status(500).json({ error: 'Failed to model CRT' });
    }
});

// 2. Project Tax Deduction
router.post('/project-deduction', authMiddleware, async (req, res) => {
    try {
        const projection = await taxDeductionCalculator.projectDeduction(req.body);
        res.json(projection);
    } catch (error) {
        res.status(500).json({ error: 'Tax projection failed' });
    }
});

// 3. Create/Register a CRT in the Vault
router.post('/create-trust', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { name, type, initialContribution, payoutRate, termYears, irsRate, vaultId } = req.body;

    try {
        const [trust] = await db.insert(charitableTrusts).values({
            userId,
            name,
            trustType: type,
            initialContribution: initialContribution.toString(),
            currentValue: initialContribution.toString(),
            payoutRate: payoutRate.toString(),
            termYears,
            irsRate: irsRate.toString(),
            vaultId,
            status: 'active'
        }).returning();

        // Initialize Projections
        await crtImpactTracker.generateProjections(trust.id);

        res.status(201).json(trust);
    } catch (error) {
        logError('[Philanthropy API] Trust creation failed:', error);
        res.status(500).json({ error: 'Failed to create charitable trust' });
    }
});

// 4. Get Impact Summary for an existing trust
router.get('/trust/:id/impact', authMiddleware, async (req, res) => {
    try {
        const summary = await crtImpactTracker.getImpactSummary(req.params.id);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch impact summary' });
    }
});

export default router;
