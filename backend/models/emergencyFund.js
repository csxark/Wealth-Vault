// backend/models/emergencyFund.js
const mongoose = require('mongoose');

const EmergencyFundSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  balance: { type: Number, required: true },
  lastUpdated: { type: Date },
  balanceHistory: [{ type: Number }],
  transactions: [
    {
      date: { type: Date },
      amount: { type: Number },
      type: { type: String, enum: ["deposit", "withdrawal"] }
    }
  ],
  riskProfile: { type: String, enum: ["low", "medium", "high"], default: "medium" }
});

EmergencyFundSchema.statics.getUserFunds = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('EmergencyFund', EmergencyFundSchema);
