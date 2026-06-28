/**
 * Debt Reduction Advisor API Endpoint (Express.js)
 * Provides REST API for strategy recommendation and progress tracking
 */
const express = require('express');
const router = express.Router();
const DebtReductionAdvisor = require('../services/debtReductionAdvisor');

// POST /api/debt-advisor/recommend
// Body: { debts: [...], strategy: 'avalanche' | 'snowball' }
router.post('/recommend', (req, res) => {
    const { debts, strategy } = req.body;
    if (!Array.isArray(debts)) {
        return res.status(400).json({ error: 'Debts array required.' });
    }
    const order = DebtReductionAdvisor.recommendStrategy(debts, strategy);
    res.json({ recommendedOrder: order });
});

// POST /api/debt-advisor/track
// Body: { debts: [...], payments: {...}, userId: '...' }
router.post('/track', (req, res) => {
    const { debts, payments, userId } = req.body;
    if (!Array.isArray(debts) || typeof payments !== 'object' || !userId) {
        return res.status(400).json({ error: 'Debts, payments, and userId required.' });
    }
    const alerts = DebtReductionAdvisor.trackProgressAndAlert(debts, payments, userId);
    res.json({ alerts });
});

module.exports = router;
