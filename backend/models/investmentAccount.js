// backend/models/investmentAccount.js
const mongoose = require('mongoose');

const InvestmentAccountSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  accountName: { type: String, required: true },
  feeRate: { type: Number, required: true },
  balance: { type: Number, required: true },
  provider: { type: String },
  feeHistory: [{ type: Number }],
  transactions: [
    {
      date: { type: Date },
      amount: { type: Number },
      type: { type: String, enum: ["deposit", "withdrawal", "fee"] }
    }
  ]
});

InvestmentAccountSchema.statics.getUserAccounts = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('InvestmentAccount', InvestmentAccountSchema);
