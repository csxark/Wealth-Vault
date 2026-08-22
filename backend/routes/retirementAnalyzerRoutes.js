// retirementAnalyzerRoutes.js
// API endpoints for Personalized Retirement Readiness Analyzer

const express = require('express');
const router = express.Router();
const RetirementReadinessAnalyzerService = require('./RetirementReadinessAnalyzerService');

// Middleware to get userId (replace with real auth)
router.use((req, res, next) => {
    req.userId = req.headers['x-user-id'] || 'demoUser';
    next();
});

// POST /retirement/analyze
router.post('/analyze', async (req, res) => {
    try {
        const params = req.body;
        const service = new RetirementReadinessAnalyzerService(req.userId);
        const analyzerData = await service.getAnalyzerData(params);
        res.json(analyzerData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
