
import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateConversion } from '../middleware/fxValidator.js';
import fxEngine from '../services/fxEngine.js';
import arbitrageAI from '../services/arbitrageAI.js';

const router = express.Router();

// Convert currency
router.post('/convert', protect, validateConversion, async (req, res) => {
    try {
        const transaction = await fxEngine.convertCurrency(req.user.id, req.body);
        res.json({ success: true, data: transaction });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get conversion history
router.get('/history', protect, async (req, res) => {
    const history = await fxEngine.getHistory(req.user.id);
    res.json({ success: true, data: history });
});

// Get AI arbitrage signals
router.get('/signals', protect, async (req, res) => {
    const signals = await arbitrageAI.getActiveSignals();
    res.json({ success: true, data: signals });
});

export default router;
