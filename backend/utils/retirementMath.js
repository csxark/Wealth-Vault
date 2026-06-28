// backend/utils/retirementMath.js
function calculateProgress(goal, accounts) {
  let totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  let yearsToGoal = goal.targetAge - goal.currentAge;
  let annualContribution = accounts.reduce((sum, acc) => sum + acc.annualContribution, 0);
  let expectedReturn = accounts.length ? accounts[0].expectedReturn : 0.06;
  // Compound growth projection
  let projected = totalBalance;
  for (let i = 0; i < yearsToGoal; i++) {
    projected = (projected + annualContribution) * (1 + expectedReturn);
  }
  return {
    totalBalance,
    projected,
    yearsToGoal,
    percentToGoal: Math.min(100, (projected / goal.targetAmount) * 100)
  };
}

function detectGap(goal, progress) {
  if (progress.projected < goal.targetAmount) {
    return {
      gap: goal.targetAmount - progress.projected,
      percentShortfall: 100 - progress.percentToGoal
    };
  }
  return null;
}

function generateCatchUpStrategy(goal, progress, gap) {
  if (!gap) return ['On track for retirement goal.'];
  // Suggest increased contributions or delayed retirement
  let extraNeeded = gap.gap / progress.yearsToGoal;
  return [
    `Increase annual contributions by $${extraNeeded.toFixed(2)} to close gap.`,
    'Consider delaying retirement age or adjusting target amount.'
  ];
}

module.exports = { calculateProgress, detectGap, generateCatchUpStrategy };
