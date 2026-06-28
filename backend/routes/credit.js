/**
 * Credit Utilization Alert Engine API Route
 * POST /api/credit/utilization/analyze
 * Author: Ayaanshaikh12243
 * Date: 2026-03-04
 */

const express = require('express');
const router = express.Router();
const CreditUtilizationAlertEngineService = require('../services/creditUtilizationAlertEngineService');

/**
 * @route POST /api/credit/utilization/analyze
 * @desc Analyze credit utilization, simulate score impact, generate alerts, recommend paydown strategies, and visualize trends
 * @access Public
 */
router.post('/utilization/analyze', async (req, res) => {
    try {
        const { creditAccounts, options } = req.body;
        if (!Array.isArray(creditAccounts) || creditAccounts.length === 0) {
            return res.status(400).json({ error: 'creditAccounts is required and must be a non-empty array.' });
        }
        const engine = new CreditUtilizationAlertEngineService(creditAccounts, options);
        const result = engine.runCompleteAnalysis();
        res.json(result);
    } catch (err) {
        console.error('Credit utilization analysis error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
