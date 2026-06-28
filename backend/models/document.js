// backend/models/document.js
const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true },
  lastUpdated: { type: Date },
  fileUrl: { type: String },
  // Add more fields as needed
});

DocumentSchema.statics.getUserDocuments = async function(userId) {
  return this.find({ userId });
};

module.exports = mongoose.model('Document', DocumentSchema);
