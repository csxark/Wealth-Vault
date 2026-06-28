// backend/repositories/esgRepository.js
const ESGRating = require('../models/esgRating');

class ESGRepository {
  async getRating(symbol) {
    return ESGRating.findOne({ symbol });
  }

  async getRatingsForSymbols(symbols) {
    return ESGRating.find({ symbol: { $in: symbols } });
  }

  async addOrUpdateRating(data) {
    return ESGRating.findOneAndUpdate(
      { symbol: data.symbol },
      data,
      { upsert: true, new: true }
    );
  }

  async getAllRatings() {
    return ESGRating.find({});
  }
}

module.exports = new ESGRepository();
