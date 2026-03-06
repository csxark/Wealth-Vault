// backend/services/taxFilingDeadlineAlertService.js

const AlertNotificationService = require('./alertNotificationService');
const { calculateDeadline, riskScore, generateStrategy } = require('../utils/taxFilingUtils');

class TaxFilingDeadlineAlertService {
  constructor(taxRepo) {
    this.taxRepo = taxRepo;
  }

  /**
   * Analyze tax filing deadlines and generate alerts
   * @param {String} userId
   * @param {Object} options { riskThreshold, lookbackYears }
   * @returns {Object} Deadline analysis, alerts, recommendations, trends, summary
   */
  async analyzeDeadlines(userId, options = {}) {
    const filings = await this.taxRepo.getUserFilings(userId);
    const analysis = [];
    const alerts = [];
    const recommendations = [];
    const trends = [];
    let lateFilings = 0;
    let highRiskYears = 0;

    for (const filing of filings) {
      // Deadline analysis
      const riskLevel = this.getRiskLevel(filing, options.riskThreshold);
      analysis.push({
        taxYear: filing.taxYear,
        deadline: filing.deadline,
        filedDate: filing.filedDate,
        status: filing.status,
        riskLevel
      });
      // Alerts
      if (riskLevel === "high") {
        alerts.push({
          taxYear: filing.taxYear,
          message: `Tax filing deadline approaching: ${filing.deadline}. High risk of late filing.`
        });
        highRiskYears++;
      }
      if (filing.status === "late") lateFilings++;
      // Recommendations
      recommendations.push(...this.generateRecommendations(filing, riskLevel));
      // Trends
      trends.push({
        taxYear: filing.taxYear,
        filedDate: filing.filedDate,
        status: filing.status,
        penalties: filing.penalties,
        trend: this.getTrend(filing)
      });
    }
    return {
      analysis,
      alerts,
      recommendations,
      trends,
      summary: {
        totalYears: filings.length,
        lateFilings,
        highRiskYears,
        recommendations
      }
    };
  }

  getRiskLevel(filing, threshold = 0.5) {
    // Example: high risk if not filed and deadline within 30 days
    if (filing.status === "pending") {
      const now = new Date();
      const deadline = new Date(filing.deadline);
      const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);
      if (diffDays <= 30) return "high";
      if (diffDays <= 60) return "medium";
    }
    return "low";
  }

  generateRecommendations(filing, riskLevel) {
    const recs = [];
    if (riskLevel === "high") {
      recs.push(`File taxes by ${this.getEarlyDate(filing.deadline)} to avoid last-minute issues.`);
      recs.push("Set up calendar reminders for future deadlines.");
    }
    if (filing.status === "late") {
      recs.push("Contact tax advisor to resolve penalties.");
    }
    if (!recs.length) recs.push("Tax filing is compliant.");
    return recs;
  }

  getEarlyDate(deadline) {
    const d = new Date(deadline);
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  }

  getTrend(filing) {
    if (filing.status === "on-time") return "compliant";
    if (filing.status === "late") return "non-compliant";
    return "pending";
  }

  /**
   * Batch analyze all users' filings for admin dashboard
   * @param {Array} userIds
   * @returns {Array} Batch analysis results
   */
  async batchAnalyzeDeadlines(userIds, options = {}) {
    const results = [];
    for (const userId of userIds) {
      const result = await this.analyzeDeadlines(userId, options);
      results.push({ userId, ...result });
    }
    return results;
  }

  /**
   * Export alerts to JSON/CSV for reporting
   * @param {Array} alerts
   * @param {String} format
   * @returns {String}
   */
  exportAlerts(alerts, format = 'json') {
    if (format === 'csv') {
      return AlertNotificationService.exportToCSV(alerts);
    }
    return AlertNotificationService.exportToJSON(alerts);
  }

  /**
   * Escalate unresolved alerts for compliance
   * @param {Array} alerts
   * @returns {Array} Escalation steps
   */
  escalateAlerts(alerts) {
    return alerts.map(alert => ({
      ...alert,
      escalation: AlertNotificationService.getEscalationPath(alert)
    }));
  }

  /**
   * Mark alerts as read/resolved in batch
   * @param {Array} alerts
   * @param {String} action
   * @returns {Array} Updated alerts
   */
  markAlerts(alerts, action = 'read') {
    return alerts.map(alert =>
      action === 'resolved'
        ? AlertNotificationService.markAsResolved(alert, 'Auto batch resolve')
        : AlertNotificationService.markAsRead(alert)
    );
  }

  /**
   * Generate filing summary for dashboard
   * @param {Array} filings
   * @returns {Object} Summary stats
   */
  getFilingSummary(filings) {
    const summary = {
      total: filings.length,
      onTime: filings.filter(f => f.status === 'on-time').length,
      late: filings.filter(f => f.status === 'late').length,
      pending: filings.filter(f => f.status === 'pending').length,
      penalties: filings.reduce((sum, f) => sum + (f.penalties || 0), 0)
    };
    return summary;
  }

  /**
   * Utility: Calculate next filing deadline for user
   * @param {Array} filings
   * @returns {Date|null}
   */
  getNextDeadline(filings) {
    const pending = filings.filter(f => f.status === 'pending');
    if (!pending.length) return null;
    return pending.reduce((min, f) =>
      new Date(f.deadline) < new Date(min.deadline) ? f : min
    ).deadline;
  }

  /**
   * Utility: Generate filing strategies for all years
   * @param {Array} filings
   * @returns {Array} Strategies
   */
  getAllStrategies(filings) {
    return filings.map(f => generateStrategy(f));
  }
}

module.exports = TaxFilingDeadlineAlertService;
