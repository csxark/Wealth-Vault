// backend/utils/investmentFeeUtils.js

function simulateFeeImpact(balance, feeRate, years = 10) {
  const annualFee = balance * (feeRate / 100);
  return annualFee * years;
}

function findLowerFeeAlternatives(account, providers) {
  // Example: stub for finding lower-fee providers
  return providers.filter(p => p.feeRate < account.feeRate);
}

function calculateFeeTrend(feeHistory) {
  if (!feeHistory || feeHistory.length < 2) return "stable";
  const last = feeHistory[feeHistory.length - 1];
  const prev = feeHistory[feeHistory.length - 2];
  if (last < prev) return "declining";
  if (last > prev) return "rising";
  return "stable";
}

module.exports = { simulateFeeImpact, findLowerFeeAlternatives, calculateFeeTrend };
