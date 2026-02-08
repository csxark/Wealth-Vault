import express from 'express';
import { protect } from '../middleware/auth.js';
import fxEngine from '../services/fxEngine.js';
import arbitrageAI from '../services/arbitrageAI.js';
import { validateConversion } from '../middleware/fxValidator.js';
import db from '../config/db.js';
import { fxTransactions } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/fx/convert
 * @desc    Convert currency between user wallets
 */
router.post('/convert', protect, validateConversion, async (req, res) => {
    try {
        const { sourceCurrency, targetCurrency, amount, metadata } = req.body;
        const result = await fxEngine.convertCurrency(
            req.user.id,
            sourceCurrency,
            targetCurrency,
            amount,
            metadata
        );
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/fx/history
 * @desc    Get FX conversion history
 */
router.get('/history', protect, async (req, res) => {
    try {
        const history = await db.query.fxTransactions.findMany({
            where: eq(fxTransactions.userId, req.user.id),
            orderBy: [desc(fxTransactions.createdAt)],
            limit: 50
        });
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/fx/rates
 * @desc    Get live FX rates
 */
router.get('/rates', protect, async (req, res) => {
    try {
        const rates = await fxEngine.getLiveRates();
        res.json({ success: true, data: rates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/fx/scan-arbitrage
 * @desc    Trigger AI scan for arbitrage opportunities
 */
router.post('/scan-arbitrage', protect, async (req, res) => {
    try {
        const opportunities = await arbitrageAI.scanForOpportunities(req.user.id);
        res.json({ success: true, data: opportunities });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
