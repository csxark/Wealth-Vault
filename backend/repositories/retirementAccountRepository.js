// backend/repositories/retirementAccountRepository.js
const RetirementAccount = require('../models/retirementAccount');

class RetirementAccountRepository {
  async getUserAccounts(userId) {
    return RetirementAccount.find({ userId });
  }

  async createAccount(data) {
    const account = new RetirementAccount(data);
    return account.save();
  }

  async updateAccount(accountId, updates) {
    return RetirementAccount.findByIdAndUpdate(accountId, updates, { new: true });
  }

  async getAllAccounts() {
    return RetirementAccount.find({});
  }
}

module.exports = new RetirementAccountRepository();
