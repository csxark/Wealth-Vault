// backend/services/investmentFeeOptimizationEngineService.js

class InvestmentFeeOptimizationEngineService {
  constructor(accountRepo) {
    this.accountRepo = accountRepo;
  }

  /**
   * Analyze investment account fees and optimize
   * @param {String} userId
   * @param {Object} options { feeThreshold, simulationYears }
   * @returns {Object} Fee analysis, alerts, recommendations, trends, summary
   */
  async analyzeFees(userId, options = {}) {
    const accounts = await this.accountRepo.getUserAccounts(userId);
    const analysis = [];
    const alerts = [];
    const recommendations = [];
    const trends = [];
    let highFeeAccounts = 0;

    for (const account of accounts) {
      // Fee analysis
      const projectedImpact = this.simulateFeeImpact(account, options.simulationYears);
      const highFee = account.feeRate >= (options.feeThreshold || 1.0);
      analysis.push({
        accountId: account.id,
        accountName: account.accountName,
        feeRate: account.feeRate,
        balance: account.balance,
        projectedImpact,
        highFee
      });
      // Alerts
      if (highFee) {
        alerts.push({
          accountId: account.id,
          message: `High fee detected for ${account.accountName}. Consider switching to a lower-fee provider.`
        });
        highFeeAccounts++;
      }
      // Recommendations
      if (highFee) {
        recommendations.push(`Switch ${account.accountName} to ProviderX for a 0.5% fee rate.`);
        recommendations.push(`Review index fund options for lower fees.`);
      }
      // Trends
      trends.push({
        accountId: account.id,
        feeHistory: account.feeHistory || [],
        trend: this.getTrend(account)
      });
    }
    return {
      analysis,
      alerts,
      recommendations,
      trends,
      summary: {
        totalAccounts: accounts.length,
        highFeeAccounts,
        recommendations
      }
    };
  }

  simulateFeeImpact(account, years = 10) {
    // Example: simulate long-term fee impact
    const annualFee = account.balance * (account.feeRate / 100);
    return annualFee * years;
  }

  getTrend(account) {
    if (!account.feeHistory || account.feeHistory.length < 2) return "stable";
    const last = account.feeHistory[account.feeHistory.length - 1];
    const prev = account.feeHistory[account.feeHistory.length - 2];
    if (last < prev) return "declining";
    if (last > prev) return "rising";
    return "stable";
  }
}

module.exports = InvestmentFeeOptimizationEngineService;
