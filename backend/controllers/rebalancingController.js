// backend/controllers/rebalancingController.js
const RebalancingAdvisorService = require('../services/rebalancingAdvisorService');
const AllocationAnalyticsService = require('../services/allocationAnalyticsService');
const AlertNotificationService = require('../services/alertNotificationService');

class RebalancingController {
  static async analyzePortfolio(req, res) {
    try {
      const userId = req.params.userId;
      const advisor = new RebalancingAdvisorService();
      const analysis = await advisor.analyzePortfolio(userId);
      const alert = AlertNotificationService.generateRebalancingAlert(userId, analysis.drift, analysis.actions);
      res.json({ analysis, alert });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async automateRebalancing(req, res) {
    try {
      const userId = req.params.userId;
      const advisor = new RebalancingAdvisorService();
      const result = await advisor.automateRebalancing(userId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getRebalancingHistory(req, res) {
    try {
      const userId = req.params.userId;
      const advisor = new RebalancingAdvisorService();
      const history = await advisor.getRebalancingHistory(userId);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getAllocationTrends(req, res) {
    try {
      const userId = req.params.userId;
      const analytics = new AllocationAnalyticsService();
      const trends = await analytics.getAllocationTrends(userId);
      res.json(trends);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = RebalancingController;
