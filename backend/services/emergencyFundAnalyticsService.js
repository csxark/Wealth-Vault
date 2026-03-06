// backend/services/emergencyFundAnalyticsService.js

class EmergencyFundAnalyticsService {
  constructor(fundRepo) {
    this.fundRepo = fundRepo;
  }

  /**
   * Advanced analytics for emergency fund
   * @param {String} userId
   * @param {Object} options
   * @returns {Object} Analytics results
   */
  async getAnalytics(userId, options = {}) {
    const funds = await this.fundRepo.getUserFunds(userId);
    const analytics = {
      adequacyTrends: [],
      scenarioSimulations: [],
      riskScores: {},
      forecast: [],
      savingsPatterns: []
    };
    for (const fund of funds) {
      // Adequacy trends
      analytics.adequacyTrends.push({
        fundId: fund.id,
        balanceHistory: fund.balanceHistory || [],
        trend: this.getTrend(fund)
      });
      // Scenario simulations
      analytics.scenarioSimulations.push(this.simulateScenario(fund, options.scenarioType));
      // Risk scores
      analytics.riskScores[fund.id] = this.getRiskScore(fund);
      // Forecast
      analytics.forecast.push(this.forecastBalance(fund));
      // Savings patterns
      analytics.savingsPatterns.push(this.getSavingsPattern(fund));
    }
    return analytics;
  }

  getTrend(fund) {
    if (!fund.balanceHistory || fund.balanceHistory.length < 2) return "stable";
    const last = fund.balanceHistory[fund.balanceHistory.length - 1];
    const prev = fund.balanceHistory[fund.balanceHistory.length - 2];
    if (last > prev) return "improving";
    if (last < prev) return "declining";
    return "stable";
  }

  simulateScenario(fund, scenarioType = "job loss") {
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
      shortfall: shortfall > 0 ? shortfall : 0
    };
  }

  getRiskScore(fund) {
    if (fund.balance < 5000) return "high";
    if (fund.balance < 10000) return "medium";
    return "low";
  }

  forecastBalance(fund) {
    // Example: stub for forecast
    return fund.balance + 500;
  }

  getSavingsPattern(fund) {
    // Example: stub for savings pattern
    return "monthly";
  }
}

module.exports = EmergencyFundAnalyticsService;
