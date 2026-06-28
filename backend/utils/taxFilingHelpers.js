// backend/utils/taxFilingHelpers.js
const { calculateDeadline, riskScore, generateStrategy } = require('./taxFilingUtils');

function getFilingStatus(filing) {
  if (!filing.filedDate) return 'pending';
  const filedOnTime = new Date(filing.filedDate) <= new Date(filing.deadline);
  return filedOnTime ? 'on-time' : 'late';
}

function summarizeFilingHistory(filingHistory) {
  return filingHistory.map(h => ({
    year: h.year,
    status: h.status,
    penalties: h.penalties || 0
  }));
}

module.exports = {
  getFilingStatus,
  summarizeFilingHistory,
  calculateDeadline,
  riskScore,
  generateStrategy
};
