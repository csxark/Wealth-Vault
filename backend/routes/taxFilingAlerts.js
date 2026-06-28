// backend/routes/taxFilingAlerts.js
const express = require('express');
const router = express.Router();
const TaxFilingAnalyticsService = require('../services/taxFilingAnalyticsService');
const TaxFilingRepository = require('../repositories/taxFilingRepository');
const AlertNotificationService = require('../services/alertNotificationService');

// GET /api/tax/alerts/:userId
router.get('/alerts/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const analyticsService = new TaxFilingAnalyticsService(TaxFilingRepository);
    const analytics = await analyticsService.getAnalytics(userId);
    // Generate alerts based on analytics
    const alerts = analytics.filingTrends.map(trend => {
      return AlertNotificationService.generateBillAlerts({
        userId,
        taxYear: trend.taxYear,
        dueDate: trend.filedDate || trend.deadline,
        status: trend.status,
        amount: trend.penalties,
        vaultId: null,
        recurringTransactionId: null
      }, { merchant: 'Tax Authority' });
    }).flat();
    res.json({ analytics, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
