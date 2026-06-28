// backend/repositories/rebalancingRepository.js
const RebalancingHistory = require('../models/rebalancingHistory');

class RebalancingRepository {
  async getUserRebalancingHistory(userId) {
    return RebalancingHistory.find({ userId }).sort({ date: -1 });
  }

  async addRebalancingAction(data) {
    const history = new RebalancingHistory(data);
    return history.save();
  }

  async getAllRebalancingHistory() {
    return RebalancingHistory.find({});
  }
}

module.exports = new RebalancingRepository();
