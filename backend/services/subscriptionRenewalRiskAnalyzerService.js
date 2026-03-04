// backend/services/subscriptionRenewalRiskAnalyzerService.js

class SubscriptionRenewalRiskAnalyzerService {
  constructor(subscriptionRepo) {
    this.subscriptionRepo = subscriptionRepo;
  }

  /**
   * Analyze user's subscription renewal risk
   * @param {String} userId
   * @param {Object} options { lookbackMonths, renewalRiskThreshold }
   * @returns {Object} Renewal analysis, alerts, recommendations, trends, summary
   */
  async analyzeRenewalRisk(userId, options = {}) {
    const subscriptions = await this.subscriptionRepo.getUserSubscriptions(userId);
    const analysis = [];
    const upcomingAlerts = [];
    const riskAlerts = [];
    const recommendations = [];
    const trends = [];
    let unwantedRenewals = 0;
    let highRiskSubscriptions = 0;

    for (const sub of subscriptions) {
      // Renewal analysis
      const missedRenewals = this.getMissedRenewals(sub, options.lookbackMonths);
      const unwantedRenewalsCount = this.getUnwantedRenewals(sub, options.lookbackMonths);
      analysis.push({
        subscriptionId: sub.id,
        name: sub.name,
        renewalDate: sub.renewalDate,
        status: sub.status,
        missedRenewals,
        unwantedRenewals: unwantedRenewalsCount,
        lastAction: sub.lastAction
      });
      // Upcoming renewal alerts
      if (this.isUpcoming(sub.renewalDate)) {
        upcomingAlerts.push({
          subscriptionId: sub.id,
          name: sub.name,
          nextRenewal: sub.renewalDate,
          message: `Upcoming renewal for ${sub.name}: ${sub.renewalDate}`
        });
      }
      // Unwanted renewal risk alerts
      const riskLevel = this.getRiskLevel(sub, unwantedRenewalsCount, options.renewalRiskThreshold);
      if (riskLevel === "high") {
        riskAlerts.push({
          subscriptionId: sub.id,
          name: sub.name,
          riskLevel,
          message: `High risk of unwanted renewal for ${sub.name}. Consider cancellation.`
        });
        highRiskSubscriptions++;
        unwantedRenewals += unwantedRenewalsCount;
      }
      // Recommendations
      if (riskLevel === "high") {
        recommendations.push(`Cancel ${sub.name} before next renewal to avoid charges.`);
      } else if (sub.status === "inactive") {
        recommendations.push(`Renew ${sub.name} to maintain service.`);
      }
      // Renewal trends
      trends.push({
        subscriptionId: sub.id,
        name: sub.name,
        renewalRate: this.getRenewalRate(sub, options.lookbackMonths),
        trend: this.getTrend(sub)
      });
    }
    return {
      analysis,
      upcomingAlerts,
      riskAlerts,
      recommendations,
      trends,
      summary: {
        totalSubscriptions: subscriptions.length,
        unwantedRenewals,
        highRiskSubscriptions,
        recommendations
      }
    };
  }

  getMissedRenewals(sub, lookbackMonths = 12) {
    // Example: count missed renewals in lookback period
    return sub.history ? sub.history.filter(h => h.action === "missed" && this.inLookback(h.date, lookbackMonths)).length : 0;
  }

  getUnwantedRenewals(sub, lookbackMonths = 12) {
    // Example: count unwanted renewals in lookback period
    return sub.history ? sub.history.filter(h => h.action === "unwanted" && this.inLookback(h.date, lookbackMonths)).length : 0;
  }

  isUpcoming(renewalDate) {
    if (!renewalDate) return false;
    const now = new Date();
    const renewal = new Date(renewalDate);
    const diffDays = (renewal - now) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 30;
  }

  getRiskLevel(sub, unwantedRenewals, threshold = 1) {
    // Example: high risk if unwantedRenewals >= threshold
    return unwantedRenewals >= threshold ? "high" : "low";
  }

  getRenewalRate(sub, lookbackMonths = 12) {
    // Example: renewal rate = renewals / total
    if (!sub.history || !sub.history.length) return 0;
    const total = sub.history.filter(h => this.inLookback(h.date, lookbackMonths)).length;
    const renewals = sub.history.filter(h => h.action === "renewed" && this.inLookback(h.date, lookbackMonths)).length;
    return total ? renewals / total : 0;
  }

  getTrend(sub) {
    // Example: stub for renewal trend
    return "stable";
  }

  inLookback(date, lookbackMonths) {
    const now = new Date();
    const d = new Date(date);
    const diffMonths = (now - d) / (1000 * 60 * 60 * 24 * 30);
    return diffMonths <= lookbackMonths;
  }
}

module.exports = SubscriptionRenewalRiskAnalyzerService;
