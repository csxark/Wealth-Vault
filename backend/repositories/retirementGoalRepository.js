// backend/repositories/retirementGoalRepository.js
const RetirementGoal = require('../models/retirementGoal');

class RetirementGoalRepository {
  async getUserGoal(userId) {
    return RetirementGoal.findOne({ userId });
  }

  async createGoal(data) {
    const goal = new RetirementGoal(data);
    return goal.save();
  }

  async updateGoal(userId, updates) {
    return RetirementGoal.findOneAndUpdate({ userId }, updates, { new: true });
  }

  async getAllGoals() {
    return RetirementGoal.find({});
  }
}

module.exports = new RetirementGoalRepository();
