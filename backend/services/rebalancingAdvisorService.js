// backend/services/rebalancingAdvisorService.js
const PortfolioRepository = require('../repositories/portfolioRepository');
const RebalancingRepository = require('../repositories/rebalancingRepository');
const { calculateDrift, generateRebalancingStrategy } = require('../utils/driftCalculator');

class RebalancingAdvisorService {
  constructor(portfolioRepo = PortfolioRepository, rebalancingRepo = RebalancingRepository) {
    this.portfolioRepo = portfolioRepo;
    this.rebalancingRepo = rebalancingRepo;
  }

  /**
   * Analyze portfolio drift and recommend rebalancing actions
   * @param {String} userId
   * @returns {Object} Drift analysis, recommendations, actions
   */
  async analyzePortfolio(userId) {
    const portfolio = await this.portfolioRepo.getUserPortfolio(userId);
    if (!portfolio) throw new Error('Portfolio not found');
    const drift = calculateDrift(portfolio.assets);
    const strategy = generateRebalancingStrategy(portfolio.assets);
    return {
      drift,
      strategy,
      actions: strategy.actions,
      nextRebalance: strategy.nextRebalance,
      notes: strategy.notes
    };
  }

  /**
   * Automate rebalancing for user
   * @param {String} userId
   * @returns {Object} Result of automation
   */
  async automateRebalancing(userId) {
    const analysis = await this.analyzePortfolio(userId);
    const history = await this.rebalancingRepo.addRebalancingAction({
      userId,
      date: new Date(),
      actions: analysis.actions,
      notes: analysis.notes
    });
    await this.portfolioRepo.updatePortfolio(userId, { lastRebalanced: new Date(), drift: analysis.drift });
    return { success: true, history, analysis };
  }

  /**
   * Get rebalancing history for user
   * @param {String} userId
   * @returns {Array} History records
   */
  async getRebalancingHistory(userId) {
    return this.rebalancingRepo.getUserRebalancingHistory(userId);
  }
}

module.exports = RebalancingAdvisorService;
