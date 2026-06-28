// backend/models/retirementGoal.js
const mongoose = require('mongoose');

const RetirementGoalSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  targetAmount: { type: Number, required: true },
  targetAge: { type: Number, required: true },
  currentAge: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RetirementGoal', RetirementGoalSchema);
