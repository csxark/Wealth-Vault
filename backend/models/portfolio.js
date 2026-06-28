// backend/models/portfolio.js
const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  name: { type: String },
  allocation: { type: Number, required: true }, // % allocation
  currentValue: { type: Number, default: 0 },
  targetAllocation: { type: Number, required: true },
});

const PortfolioSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  assets: [AssetSchema],
  lastRebalanced: { type: Date },
  drift: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Portfolio', PortfolioSchema);
