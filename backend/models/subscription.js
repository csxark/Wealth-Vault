// backend/models/subscription.js
const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  renewalDate: { type: Date },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  lastAction: { type: String },
  history: [
    {
      date: { type: Date },
      action: { type: String, enum: ["renewed", "missed", "unwanted", "cancelled"] }
    }
  ]
});

SubscriptionSchema.statics.getUserSubscriptions = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('Subscription', SubscriptionSchema);
