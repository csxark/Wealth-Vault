// backend/utils/taxFilingUtils.js

function calculateDeadline(taxYear) {
  // Example: US tax deadline is April 15 of next year
  return new Date(`${taxYear + 1}-04-15`);
}

function riskScore(filing, threshold = 0.5) {
  if (filing.status === "pending") {
    const now = new Date();
    const deadline = new Date(filing.deadline);
    const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);
    if (diffDays <= 30) return "high";
    if (diffDays <= 60) return "medium";
  }
  return "low";
}

function generateStrategy(filing) {
  if (filing.status === "pending") return "File early to avoid penalties.";
  if (filing.status === "late") return "Contact tax advisor to resolve penalties.";
  return "Maintain compliance for future years.";
}

module.exports = { calculateDeadline, riskScore, generateStrategy };
