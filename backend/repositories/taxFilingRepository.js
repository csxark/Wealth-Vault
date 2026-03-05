// backend/repositories/taxFilingRepository.js
const TaxFiling = require('../models/taxFiling');

class TaxFilingRepository {
  async getUserFilings(userId) {
    return TaxFiling.getUserFilings(userId);
  }

  async getFilingByYear(userId, taxYear) {
    return TaxFiling.findOne({ userId, taxYear });
  }

  async createFiling(data) {
    const filing = new TaxFiling(data);
    return filing.save();
  }

  async updateFiling(userId, taxYear, updates) {
    return TaxFiling.findOneAndUpdate({ userId, taxYear }, updates, { new: true });
  }

  async getAllFilings() {
    return TaxFiling.find({});
  }
}

module.exports = new TaxFilingRepository();
