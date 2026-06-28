// backend/models/taxFiling.js
const mongoose = require('mongoose');

const TaxFilingSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  taxYear: { type: Number, required: true },
  deadline: { type: Date, required: true },
  filedDate: { type: Date },
  status: { type: String, enum: ["pending", "on-time", "late"], default: "pending" },
  penalties: { type: Number, default: 0 },
  filingHistory: [
    {
      year: { type: Number },
      filedDate: { type: Date },
      status: { type: String },
      penalties: { type: Number }
    }
  ]
});

TaxFilingSchema.statics.getUserFilings = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('TaxFiling', TaxFilingSchema);
