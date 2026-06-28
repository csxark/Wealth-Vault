// backend/services/sustainableScreenerService.js
const ESGRepository = require('../repositories/esgRepository');
const PortfolioRepository = require('../repositories/portfolioRepository');
const { calculateCompliance, findAlternatives } = require('../utils/esgMath');

class SustainableScreenerService {
  constructor(esgRepo = ESGRepository, portfolioRepo = PortfolioRepository) {
    this.esgRepo = esgRepo;
    this.portfolioRepo = portfolioRepo;
  }

  /**
   * Screen portfolio for ESG compliance
   * @param {String} userId
   * @returns {Object} Compliance report, flagged assets, recommendations
   */
  async screenPortfolio(userId) {
    const portfolio = await this.portfolioRepo.getUserPortfolio(userId);
    if (!portfolio) throw new Error('Portfolio not found');
    const symbols = portfolio.assets.map(a => a.symbol);
    const ratings = await this.esgRepo.getRatingsForSymbols(symbols);
    const compliance = calculateCompliance(portfolio.assets, ratings);
    const flagged = compliance.flagged;
    const recommendations = await findAlternatives(flagged);
    return {
      compliance,
      flagged,
      recommendations
    };
  }
}

module.exports = SustainableScreenerService;
