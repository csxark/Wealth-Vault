// backend/services/esgAnalyticsService.js
const PortfolioRepository = require('../repositories/portfolioRepository');
const ESGRepository = require('../repositories/esgRepository');

class ESGAnalyticsService {
  constructor(portfolioRepo = PortfolioRepository, esgRepo = ESGRepository) {
    this.portfolioRepo = portfolioRepo;
    this.esgRepo = esgRepo;
  }

  /**
   * Get ESG compliance trends for user
   * @param {String} userId
   * @returns {Array} Trend data
   */
  async getComplianceTrends(userId) {
    const portfolio = await this.portfolioRepo.getUserPortfolio(userId);
    if (!portfolio) throw new Error('Portfolio not found');
    // Mock trend: last 6 months
    const trends = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      // Mock: compliance score random for demo
      trends.push({
        date,
        complianceScore: Math.floor(Math.random() * 40) + 60
      });
    }
    return trends;
  }
}

module.exports = ESGAnalyticsService;
