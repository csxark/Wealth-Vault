// backend/repositories/portfolioRepository.js
const Portfolio = require('../models/portfolio');

class PortfolioRepository {
  async getUserPortfolio(userId) {
    return Portfolio.findOne({ userId });
  }

  async createPortfolio(data) {
    const portfolio = new Portfolio(data);
    return portfolio.save();
  }

  async updatePortfolio(userId, updates) {
    return Portfolio.findOneAndUpdate({ userId }, updates, { new: true });
  }

  async getAllPortfolios() {
    return Portfolio.find({});
  }
}

module.exports = new PortfolioRepository();
