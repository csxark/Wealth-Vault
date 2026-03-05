// backend/controllers/retirementGoalController.js
const RetirementProgressService = require('../services/retirementProgressService');
const RetirementAnalyticsService = require('../services/retirementAnalyticsService');
const AlertNotificationService = require('../services/alertNotificationService');

class RetirementGoalController {
  static async getProgress(req, res) {
    try {
      const userId = req.params.userId;
      const service = new RetirementProgressService();
      const report = await service.trackProgress(userId);
      const alert = report.gap ? AlertNotificationService.generateRetirementGapAlert(userId, report.gap.gap, report.gap.percentShortfall) : null;
      res.json({ report, alert });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getTrends(req, res) {
    try {
      const userId = req.params.userId;
      const analytics = new RetirementAnalyticsService();
      const trends = await analytics.getProgressTrends(userId);
      res.json(trends);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = RetirementGoalController;
