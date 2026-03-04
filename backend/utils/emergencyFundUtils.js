// backend/utils/emergencyFundUtils.js

function modelScenario(fund, scenarioType = "job loss") {
  const scenarioMap = {
    "job loss": 12000,
    "medical": 8000,
    "natural disaster": 15000
  };
  const requiredAmount = scenarioMap[scenarioType] || 10000;
  const shortfall = requiredAmount - fund.balance;
  return {
    scenario: scenarioType,
    requiredAmount,
    currentBalance: fund.balance,
    shortfall: shortfall > 0 ? shortfall : 0,
    message: shortfall > 0 ? `Emergency fund is insufficient for ${scenarioType} scenario.` : `Emergency fund is adequate for ${scenarioType} scenario.`
  };
}

function calculateAdequacy(balance, threshold = 10000) {
  return balance >= threshold ? "adequate" : "insufficient";
}

function riskScore(balance, threshold = 10000) {
  if (balance < threshold / 2) return "high";
  if (balance < threshold) return "medium";
  return "low";
}

module.exports = { modelScenario, calculateAdequacy, riskScore };
