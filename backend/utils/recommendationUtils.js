// backend/utils/recommendationUtils.js
/**
 * Recommendation Utilities for Adaptive Emergency Fund Forecaster
 * Generates personalized savings plans and actionable advice
 */

/**
 * Generate savings plan based on forecast and risk
 * @param {number} currentBalance
 * @param {number} recommendedFund
 * @param {number} monthlyIncome
 * @param {number} monthlyExpenses
 * @returns {Object} - {monthlyTarget, advice}
 */
function generateSavingsPlan(currentBalance, recommendedFund, monthlyIncome, monthlyExpenses) {
  const gap = recommendedFund - currentBalance;
  let monthlyTarget = Math.ceil(gap / 6); // Aim to close gap in 6 months
  if (monthlyTarget > (monthlyIncome - monthlyExpenses)) {
    monthlyTarget = Math.max(0, monthlyIncome - monthlyExpenses - 50); // leave buffer
  }
  let advice = '';
  if (gap <= 0) {
    advice = 'Your emergency fund is on track. Maintain regular contributions.';
  } else if (monthlyTarget === 0) {
    advice = 'Expenses exceed income. Reduce discretionary spending or seek additional income.';
  } else {
    advice = `Save at least $${monthlyTarget} per month to reach your emergency fund goal in 6 months.`;
  }
  return { monthlyTarget, advice };
}

/**
 * Track progress toward savings goal
 * @param {Array} balanceHistory - [Number]
 * @param {number} recommendedFund
 * @returns {Object} - {progressPercent, monthsToGoal}
 */
function trackProgress(balanceHistory, recommendedFund) {
  const latest = balanceHistory[balanceHistory.length - 1] || 0;
  const progressPercent = Math.min(100, Math.round((latest / recommendedFund) * 100));
  let monthsToGoal = 0;
  if (latest < recommendedFund) {
    const avgMonthly = (balanceHistory[balanceHistory.length - 1] - balanceHistory[0]) / balanceHistory.length;
    monthsToGoal = avgMonthly > 0 ? Math.ceil((recommendedFund - latest) / avgMonthly) : -1;
  }
  return { progressPercent, monthsToGoal };
}

module.exports = {
  generateSavingsPlan,
  trackProgress
};
