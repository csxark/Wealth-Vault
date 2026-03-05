// backend/routes/esgScreening.js
const express = require('express');
const router = express.Router();
const SustainableScreenerService = require('../services/sustainableScreenerService');
const ESGAnalyticsService = require('../services/esgAnalyticsService');
const AlertNotificationService = require('../services/alertNotificationService');

// GET /api/esg/screen/:userId
router.get('/screen/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const screener = new SustainableScreenerService();
    const report = await screener.screenPortfolio(userId);
    const alert = AlertNotificationService.generateESGAlert(userId, report.compliance.complianceScore, report.flagged);
    res.json({ report, alert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/esg/trends/:userId
router.get('/trends/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const analytics = new ESGAnalyticsService();
    const trends = await analytics.getComplianceTrends(userId);
    res.json(trends);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
