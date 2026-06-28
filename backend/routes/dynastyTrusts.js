import express from 'express';
import db from '../config/db.js';
import { trustStructures, beneficiaryClasses, irs7520Rates, taxExemptions } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import dynastyTrustSimulator from '../services/dynastyTrustSimulator.js';
import gratCalculator from '../services/gratCalculator.js';
import irsRateTracker from '../services/irsRateTracker.js';
import { logInfo, logError } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Dynasty Trust API (#511)
 * Manages the high-level orchestration of multi-generational wealth vehicles.
 */

// 1. Create a dynamic Trust Structure
router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
        trustName,
        trustType,
        initialFundingAmount,
        termYears,
        hurdleRate,
        annuityPayoutPrc,
        annuityPayerVaultId,
        expectedAnnualReturn
    } = req.body;

    try {
        const [trust] = await db.insert(trustStructures).values({
            userId,
            trustName,
            trustType,
            initialFundingAmount: initialFundingAmount.toString(),
            termYears,
            hurdleRate: (hurdleRate || await irsRateTracker.getCurrentRate()).toString(),
            annuityPayoutPrc: annuityPayoutPrc?.toString(),
            annuityPayerVaultId,
            expectedAnnualReturn: expectedAnnualReturn?.toString(),
            status: 'active'
        }).returning();

        logInfo(`[Dynasty App] Created trust architecture: ${trustName} ($${initialFundingAmount})`);
        res.status(201).json(trust);
    } catch (error) {
        logError('[Dynasty App] Create failed:', error);
        res.status(500).json({ error: 'Failed to initialize trust structure' });
    }
});

// 2. Fetch Section 7520 Current & Historical Rates
router.get('/irs-rates', authMiddleware, async (req, res) => {
    try {
        const current = await irsRateTracker.getCurrentRate();
        const historical = await irsRateTracker.getHistoricalRates(24);
        res.json({ current, historical });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch IRS data' });
    }
});

// 3. GRAT Zeroed-Out Modeling Endpoint
router.post('/model/grat', authMiddleware, async (req, res) => {
    const { principal, termYears, increasePct } = req.body;

    try {
        const annuityModel = await gratCalculator.calculateZeroedOutAnnuity(
            parseFloat(principal),
            parseInt(termYears),
            null, // Auto-fetch latest hurdle
            parseFloat(increasePct || 0)
        );

        res.json(annuityModel);
    } catch (error) {
        res.status(500).json({ error: 'GRAT modeling failed' });
    }
});

// 4. Run 100-Year Dynasty Simulation
router.post('/:id/simulate', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const trustId = req.params.id;

    try {
        const results = await dynastyTrustSimulator.simulate(userId, trustId);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Simulation execution failed' });
    }
});

// 5. Manage Beneficiary Allocations
router.post('/:id/beneficiaries', authMiddleware, async (req, res) => {
    const trustId = req.params.id;
    const beneficiaries = req.body; // Array of { name, type, allocation, generation, vaultId }

    try {
        const results = await db.insert(beneficiaryClasses).values(
            beneficiaries.map(b => ({
                trustId,
                beneficiaryName: b.name,
                beneficiaryType: b.type || 'individual',
                allocationPrc: b.allocation.toString(),
                generation: b.generation,
                vaultId: b.vaultId
            }))
        ).returning();

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Beneficiary setup failed' });
    }
});

export default router;
