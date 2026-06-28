// backend/models/emergencyFund.js
const mongoose = require('mongoose');

const EmergencyFundSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  balance: { type: Number, required: true },
  lastUpdated: { type: Date },
  balanceHistory: [{ type: Number }],
  recommendedHistory: [{ type: Number }],
  transactions: [
    {
      date: { type: Date },
      amount: { type: Number },
      type: { type: String, enum: ["deposit", "withdrawal", "expense", "income"] },
      category: { type: String },
      description: { type: String },
      recurring: { type: Boolean, default: false },
      recurrencePattern: { type: String },
      linkedLifeEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'LifeEvent' }
    }
  ],
  riskProfile: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  recommendedFund: { type: Number, default: 0 }
});

EmergencyFundSchema.statics.getUserFunds = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('EmergencyFund', EmergencyFundSchema);
