// backend/routes/documentAnalytics.js
const express = require('express');
const router = express.Router();
const FinancialDocumentAnalyticsService = require('../services/financialDocumentAnalyticsService');
const documentRepo = require('../models/document');

// POST /api/documents/analytics
router.post('/analytics', async (req, res) => {
  const { userId, options } = req.body;
  const service = new FinancialDocumentAnalyticsService(documentRepo);
  try {
    const result = await service.getAnalytics(userId, options);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
