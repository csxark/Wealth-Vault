// backend/models/retirementAccount.js
const mongoose = require('mongoose');

const RetirementAccountSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  accountType: { type: String, required: true }, // e.g., IRA, 401k
  balance: { type: Number, default: 0 },
  annualContribution: { type: Number, default: 0 },
  expectedReturn: { type: Number, default: 0.06 }, // default 6%
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RetirementAccount', RetirementAccountSchema);
