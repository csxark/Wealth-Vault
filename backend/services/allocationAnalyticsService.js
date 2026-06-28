// backend/services/allocationAnalyticsService.js
const PortfolioRepository = require('../repositories/portfolioRepository');

class AllocationAnalyticsService {
  constructor(portfolioRepo = PortfolioRepository) {
    this.portfolioRepo = portfolioRepo;
  }

  /**
   * Get allocation trends for user
   * @param {String} userId
   * @returns {Array} Trend data
   */
  async getAllocationTrends(userId) {
    const portfolio = await this.portfolioRepo.getUserPortfolio(userId);
    if (!portfolio) throw new Error('Portfolio not found');
    // Mock trend: last 6 months
    const trends = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      trends.push({
        date,
        assets: portfolio.assets.map(a => ({ symbol: a.symbol, allocation: a.allocation }))
      });
    }
    return trends;
  }
}

module.exports = AllocationAnalyticsService;
