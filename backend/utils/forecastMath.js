// backend/utils/forecastMath.js
/**
 * Forecast Math Utilities for Adaptive Emergency Fund Forecaster
 * Includes scenario simulation, stress testing, and historical analysis
 */

/**
 * Simulate future expenses based on historical transactions and life events
 * @param {Array} transactions - [{date, amount, type, category}]
 * @param {Array} lifeEvents - [{type, costMin, costMax, date}]
 * @param {number} months - Number of months to forecast
 * @returns {Array} - [{month, projectedExpense}]
 */
function simulateExpenses(transactions, lifeEvents, months = 12) {
  // ...implementation...
  // Placeholder: returns flat projection
  const avgMonthly = transactions.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0) / months;
  const projections = [];
  for (let i = 0; i < months; i++) {
    let eventCost = 0;
    lifeEvents.forEach(event => {
      if (event.date && new Date(event.date).getMonth() === i) {
        eventCost += (event.costMin + event.costMax) / 2;
      }
    });
    projections.push({ month: i + 1, projectedExpense: avgMonthly + eventCost });
  }
  return projections;
}

/**
 * Stress test emergency fund against simulated scenarios
 * @param {number} startingBalance
 * @param {Array} projections - [{month, projectedExpense}]
 * @returns {Array} - [{month, endingBalance, atRisk}]
 */
function stressTestFund(startingBalance, projections) {
  let balance = startingBalance;
  return projections.map(({ month, projectedExpense }) => {
    balance -= projectedExpense;
    return {
      month,
      endingBalance: balance,
      atRisk: balance < 0
    };
  });
}

/**
 * Analyze historical fund adequacy
 * @param {Array} balanceHistory - [Number]
 * @param {Array} recommendedHistory - [Number]
 * @returns {Object} - {adequacyRate, underfundedMonths}
 */
function analyzeFundAdequacy(balanceHistory, recommendedHistory) {
  let underfunded = 0;
  for (let i = 0; i < balanceHistory.length; i++) {
    if (balanceHistory[i] < (recommendedHistory[i] || 0)) underfunded++;
  }
  return {
    adequacyRate: 1 - underfunded / balanceHistory.length,
    underfundedMonths: underfunded
  };
}

module.exports = {
  simulateExpenses,
  stressTestFund,
  analyzeFundAdequacy
};
