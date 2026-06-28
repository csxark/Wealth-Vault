// backend/routes/documents.js
const express = require('express');
const router = express.Router();
const FinancialDocumentReadinessCheckerService = require('../services/financialDocumentReadinessCheckerService');
const documentRepo = require('../models/document');

// POST /api/documents/readiness/check
router.post('/readiness/check', async (req, res) => {
  const { userId, documentTypes, urgencyLevel } = req.body;
  const service = new FinancialDocumentReadinessCheckerService(documentRepo);
  try {
    const result = await service.analyzeReadiness(userId, { documentTypes, urgencyLevel });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
