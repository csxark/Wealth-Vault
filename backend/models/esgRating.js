// backend/models/esgRating.js
const mongoose = require('mongoose');

const ESGRatingSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  provider: { type: String, required: true },
  environment: { type: Number, min: 0, max: 100 },
  social: { type: Number, min: 0, max: 100 },
  governance: { type: Number, min: 0, max: 100 },
  overall: { type: Number, min: 0, max: 100 },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ESGRating', ESGRatingSchema);
