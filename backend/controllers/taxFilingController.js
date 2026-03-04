// backend/controllers/taxFilingController.js
const TaxFilingRepository = require('../repositories/taxFilingRepository');
const TaxFilingAnalyticsService = require('../services/taxFilingAnalyticsService');
const AlertNotificationService = require('../services/alertNotificationService');

class TaxFilingController {
  static async getUserAnalytics(req, res) {
    try {
      const userId = req.params.userId;
      const analyticsService = new TaxFilingAnalyticsService(TaxFilingRepository);
      const analytics = await analyticsService.getAnalytics(userId);
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getUserAlerts(req, res) {
    try {
      const userId = req.params.userId;
      const analyticsService = new TaxFilingAnalyticsService(TaxFilingRepository);
      const analytics = await analyticsService.getAnalytics(userId);
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
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = TaxFilingController;
