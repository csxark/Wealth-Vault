// backend/models/retirementContribution.js
const mongoose = require('mongoose');

const RetirementContributionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'RetirementAccount', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RetirementContribution', RetirementContributionSchema);
