// backend/services/taxFilingDeadlineAlertService.js

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
}

module.exports = TaxFilingDeadlineAlertService;
