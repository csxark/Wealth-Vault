// backend/services/retirementProgressService.js
const RetirementGoalRepository = require('../repositories/retirementGoalRepository');
const RetirementAccountRepository = require('../repositories/retirementAccountRepository');
const { calculateProgress, detectGap, generateCatchUpStrategy } = require('../utils/retirementMath');

class RetirementProgressService {
  constructor(goalRepo = RetirementGoalRepository, accountRepo = RetirementAccountRepository) {
    this.goalRepo = goalRepo;
    this.accountRepo = accountRepo;
  }

  /**
   * Track retirement goal progress and detect gaps
   * @param {String} userId
   * @returns {Object} Progress report, gap alerts, recommendations
   */
  async trackProgress(userId) {
    const goal = await this.goalRepo.getUserGoal(userId);
    if (!goal) throw new Error('Retirement goal not found');
    const accounts = await this.accountRepo.getUserAccounts(userId);
    const progress = calculateProgress(goal, accounts);
    const gap = detectGap(goal, progress);
    const recommendations = generateCatchUpStrategy(goal, progress, gap);
    return {
      progress,
      gap,
      recommendations
    };
  }
}

module.exports = RetirementProgressService;
