import express from 'express';
import db from '../config/db.js';
import { passionAssets, assetAppraisals, provenanceRecords, passionLoanContracts } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import passionAppraiser from '../services/passionAppraiser.js';
import passionLTVEngine from '../services/passionLTVEngine.js';
import provenanceSealer from '../services/provenanceSealer.js';
import { logInfo, logError } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Passion Assets API (#536)
 * Manages luxury collectibles, appraisals, and lending against passion assets.
 */

// 1. Register a new Passion Asset
router.post('/register', authMiddleware, async (req, res) => {
    const { name, category, description, cost, acquisitionDate, vaultId, metadata } = req.body;
    const userId = req.user.id;

    try {
        const [asset] = await db.insert(passionAssets).values({
            userId,
            name,
            assetCategory: category,
            description,
            acquisitionCost: cost?.toString(),
            currentEstimatedValue: cost?.toString(), // Start with cost
            acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : new Date(),
            vaultId,
            metadata: metadata || {}
        }).returning();

        // Log initial provenance
        await provenanceSealer.logProvenanceEvent(asset.id, {
            type: 'acquisition',
            description: `Initial registration of ${name}`,
            actor: 'System/User'
        });

        res.status(201).json(asset);
    } catch (error) {
        logError('[Passion API] Registration failed:', error);
        res.status(500).json({ error: 'Failed to register asset' });
    }
});

// 2. Fetch all Passion Assets for a user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const assets = await db.select().from(passionAssets).where(eq(passionAssets.userId, req.user.id));
        res.json(assets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// 3. Model and Originate a Loan
router.post('/:id/loan', authMiddleware, async (req, res) => {
    const assetId = req.params.id;
    const { amount, vaultId } = req.body;
    const userId = req.user.id;

    try {
        const loan = await passionLTVEngine.originateLoan(userId, assetId, amount, vaultId);

        // Log provenance
        await provenanceSealer.logProvenanceEvent(assetId, {
            type: 'collateralization',
            description: `Asset used as collateral for $${amount} loan`,
            actor: 'LTV Engine'
        });

        res.status(201).json(loan);
    } catch (error) {
        logError('[Passion API] Loan origination failed:', error);
        res.status(500).json({ error: 'Failed to originate loan against asset' });
    }
});

// 4. Force a valuation refresh
router.post('/:id/revalue', authMiddleware, async (req, res) => {
    const assetId = req.params.id;

    try {
        const appraisal = await passionAppraiser.refreshAppraisal(assetId);
        res.json(appraisal);
    } catch (error) {
        res.status(500).json({ error: 'Valuation refresh failed' });
    }
});

// 5. Get full Provenance History
router.get('/:id/history', authMiddleware, async (req, res) => {
    const assetId = req.params.id;

    try {
        const history = await provenanceSealer.getAssetHistory(assetId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

export default router;
