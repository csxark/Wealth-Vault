// backend/routes/investmentFeeAnalytics.js
const express = require('express');
const router = express.Router();
const InvestmentFeeAnalyticsService = require('../services/investmentFeeAnalyticsService');
const InvestmentAccount = require('../models/investmentAccount');

// POST /api/investments/fee/analytics
router.post('/fee/analytics', async (req, res) => {
  const { userId, simulationYears } = req.body;
  const service = new InvestmentFeeAnalyticsService(InvestmentAccount);
  try {
    const result = await service.getAnalytics(userId, { simulationYears });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
