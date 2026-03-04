// backend/services/emergencyFundHealthMonitorService.js

class EmergencyFundHealthMonitorService {
  constructor(fundRepo) {
    this.fundRepo = fundRepo;
  }

  /**
   * Analyze user's emergency fund health
   * @param {String} userId
   * @param {Object} options { scenarioType, adequacyThreshold }
   * @returns {Object} Fund health analysis, scenario modeling, alerts, recommendations, trends, summary
   */
  async analyzeFundHealth(userId, options = {}) {
    const funds = await this.fundRepo.getUserFunds(userId);
    const analysis = [];
    const scenarioModeling = [];
    const alerts = [];
    const recommendations = [];
    const trends = [];
    let insufficientFunds = 0;
    let highRiskFunds = 0;

    for (const fund of funds) {
      // Fund health analysis
      const adequacy = this.getAdequacy(fund, options.adequacyThreshold);
      const riskLevel = this.getRiskLevel(fund, adequacy);
      analysis.push({
        fundId: fund.id,
        balance: fund.balance,
        adequacy,
        riskLevel,
        lastUpdated: fund.lastUpdated
      });
      // Emergency scenario modeling
      const scenario = this.modelScenario(fund, options.scenarioType);
      scenarioModeling.push(scenario);
      // Alerts
      if (adequacy === "insufficient") {
        alerts.push({
          fundId: fund.id,
          message: "Emergency fund below recommended level. Increase savings."
        });
        insufficientFunds++;
        if (riskLevel === "high") highRiskFunds++;
      }
      // Recommendations
      recommendations.push(...this.generateRecommendations(fund, adequacy, scenario));
      // Trends
      trends.push({
        fundId: fund.id,
        balanceHistory: fund.balanceHistory || [],
        trend: this.getTrend(fund)
      });
    }
    return {
      analysis,
      scenarioModeling,
      alerts,
      recommendations,
      trends,
      summary: {
        totalFunds: funds.length,
        insufficientFunds,
        highRiskFunds,
        recommendations
      }
    };
  }

  getAdequacy(fund, threshold = 10000) {
    // Example: adequate if balance >= threshold
    return fund.balance >= threshold ? "adequate" : "insufficient";
  }

  getRiskLevel(fund, adequacy) {
    // Example: high risk if adequacy is insufficient and balance < 50% of threshold
    if (adequacy === "insufficient" && fund.balance < 5000) return "high";
    if (adequacy === "insufficient") return "medium";
    return "low";
  }

  modelScenario(fund, scenarioType = "job loss") {
    // Example: model required amount for scenario
    const scenarioMap = {
      "job loss": 12000,
      "medical": 8000,
      "natural disaster": 15000
    };
    const requiredAmount = scenarioMap[scenarioType] || 10000;
    const shortfall = requiredAmount - fund.balance;
    return {
      scenario: scenarioType,
      requiredAmount,
      currentBalance: fund.balance,
      shortfall: shortfall > 0 ? shortfall : 0,
      message: shortfall > 0 ? `Emergency fund is insufficient for ${scenarioType} scenario.` : `Emergency fund is adequate for ${scenarioType} scenario.`
    };
  }

  generateRecommendations(fund, adequacy, scenario) {
    const recs = [];
    if (adequacy === "insufficient") {
      recs.push(`Increase monthly savings by $500 to reach target in 12 months.`);
      recs.push(`Allocate bonus income to emergency fund.`);
    }
    if (scenario.shortfall > 0) {
      recs.push(`Consider reducing discretionary expenses to cover shortfall.`);
    }
    if (!recs.length) recs.push("Emergency fund is healthy.");
    return recs;
  }

  getTrend(fund) {
    // Example: stub for trend
    if (!fund.balanceHistory || fund.balanceHistory.length < 2) return "stable";
    const last = fund.balanceHistory[fund.balanceHistory.length - 1];
    const prev = fund.balanceHistory[fund.balanceHistory.length - 2];
    if (last > prev) return "improving";
    if (last < prev) return "declining";
    return "stable";
  }
}

module.exports = EmergencyFundHealthMonitorService;
