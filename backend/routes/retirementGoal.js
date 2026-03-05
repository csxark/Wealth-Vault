// backend/routes/retirementGoal.js
const express = require('express');
const router = express.Router();
const RetirementProgressService = require('../services/retirementProgressService');
const RetirementAnalyticsService = require('../services/retirementAnalyticsService');
const AlertNotificationService = require('../services/alertNotificationService');

// GET /api/retirement/progress/:userId
router.get('/progress/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const service = new RetirementProgressService();
    const report = await service.trackProgress(userId);
    const alert = report.gap ? AlertNotificationService.generateRetirementGapAlert(userId, report.gap.gap, report.gap.percentShortfall) : null;
    res.json({ report, alert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retirement/trends/:userId
router.get('/trends/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const analytics = new RetirementAnalyticsService();
    const trends = await analytics.getProgressTrends(userId);
    res.json(trends);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
