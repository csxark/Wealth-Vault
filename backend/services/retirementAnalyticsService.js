// backend/services/retirementAnalyticsService.js
const RetirementGoalRepository = require('../repositories/retirementGoalRepository');
const RetirementAccountRepository = require('../repositories/retirementAccountRepository');

class RetirementAnalyticsService {
  constructor(goalRepo = RetirementGoalRepository, accountRepo = RetirementAccountRepository) {
    this.goalRepo = goalRepo;
    this.accountRepo = accountRepo;
  }

  /**
   * Get retirement progress trends for user
   * @param {String} userId
   * @returns {Array} Trend data
   */
  async getProgressTrends(userId) {
    const goal = await this.goalRepo.getUserGoal(userId);
    if (!goal) throw new Error('Retirement goal not found');
    // Mock trend: last 6 years
    const trends = [];
    let balance = 10000;
    for (let i = 0; i < 6; i++) {
      balance += 5000 + balance * 0.06;
      trends.push({
        year: new Date().getFullYear() - (5 - i),
        balance,
        percentToGoal: Math.min(100, (balance / goal.targetAmount) * 100)
      });
    }
    return trends;
  }
}

module.exports = RetirementAnalyticsService;
