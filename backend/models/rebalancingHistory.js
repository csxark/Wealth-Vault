// backend/models/rebalancingHistory.js
const mongoose = require('mongoose');

const RebalancingHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, required: true },
  actions: [
    {
      symbol: { type: String, required: true },
      fromAllocation: { type: Number, required: true },
      toAllocation: { type: Number, required: true },
      amountMoved: { type: Number, required: true },
    }
  ],
  notes: { type: String },
});

module.exports = mongoose.model('RebalancingHistory', RebalancingHistorySchema);
