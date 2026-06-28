// backend/models/transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["deposit", "withdrawal", "expense", "income"], required: true },
  category: { type: String }, // e.g., "healthcare", "housing", "transportation", "food", "utilities", "entertainment", "other"
  description: { type: String },
  recurring: { type: Boolean, default: false },
  recurrencePattern: { type: String }, // e.g., "monthly", "weekly", "yearly"
  linkedLifeEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'LifeEvent' }
});

TransactionSchema.statics.getUserTransactions = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('Transaction', TransactionSchema);
