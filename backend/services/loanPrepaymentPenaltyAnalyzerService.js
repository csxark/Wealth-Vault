/**
 * loanPrepaymentPenaltyAnalyzerService.js
 * Identifies loans with prepayment penalties, calculates cost vs. savings, and recommends optimal payoff schedule.
 */

/**
 * Helper: Identify loans with prepayment penalties
 */
function identifyPenaltyLoans(loans) {
  return loans.filter(loan => loan.prepaymentPenalty && loan.prepaymentPenalty.amount > 0);
}

/**
 * Helper: Calculate penalty cost vs. interest savings for early payoff
 */
function calculatePenaltyVsSavings(loan, payoffMonth) {
  // Calculate remaining interest if paid as scheduled
  let remainingBalance = parseFloat(loan.currentBalance);
  let totalInterest = 0;
  let monthsLeft = loan.termMonths - loan.monthsPaid;
  let monthlyRate = loan.interestRate / 100 / 12;
  for (let m = 0; m < monthsLeft; m++) {
    let interest = remainingBalance * monthlyRate;
    totalInterest += interest;
    let payment = Math.min(loan.monthlyPayment, remainingBalance + interest);
    remainingBalance = Math.max(0, remainingBalance + interest - payment);
    if (remainingBalance <= 0) break;
  }
  // Calculate interest if paid off at payoffMonth
  let payoffInterest = 0;
  let balance = parseFloat(loan.currentBalance);
  for (let m = 0; m < payoffMonth; m++) {
    let interest = balance * monthlyRate;
    payoffInterest += interest;
    let payment = Math.min(loan.monthlyPayment, balance + interest);
    balance = Math.max(0, balance + interest - payment);
    if (balance <= 0) break;
  }
  // Add penalty
  let penalty = loan.prepaymentPenalty.amount;
  let totalCost = payoffInterest + penalty;
  let savings = totalInterest - totalCost;
  return {
    loanId: loan.id,
    loanName: loan.name,
    payoffMonth,
    penalty,
    payoffInterest,
    totalCost,
    savings
  };
}

/**
 * Helper: Simulate payoff timing scenarios
 */
function simulatePayoffScenarios(loans) {
  const scenarios = [];
  loans.forEach(loan => {
    if (loan.prepaymentPenalty && loan.prepaymentPenalty.amount > 0) {
      // Try paying off at 3, 6, 12, 24 months
      [3, 6, 12, 24].forEach(months => {
        scenarios.push(calculatePenaltyVsSavings(loan, months));
      });
    }
  });
  return scenarios;
}

/**
 * Helper: Recommend optimal payoff schedule
 */
function recommendOptimalPayoff(scenarios) {
  // Recommend payoff month with highest savings
  const recommendations = [];
  const grouped = {};
  scenarios.forEach(s => {
    if (!grouped[s.loanId]) grouped[s.loanId] = [];
    grouped[s.loanId].push(s);
  });
  Object.values(grouped).forEach(arr => {
    const best = arr.reduce((max, s) => s.savings > max.savings ? s : max, arr[0]);
    recommendations.push({
      loanId: best.loanId,
      loanName: best.loanName,
      recommendedPayoffMonth: best.payoffMonth,
      savings: best.savings,
      penalty: best.penalty,
      totalCost: best.totalCost
    });
  });
  return recommendations;
}

/**
 * Helper: Flag loans where prepayment is not beneficial
 */
function flagNonBeneficialLoans(recommendations) {
  return recommendations.filter(r => r.savings <= 0).map(r => ({
    loanId: r.loanId,
    loanName: r.loanName,
    reason: 'Prepayment penalty outweighs interest savings'
  }));
}

/**
 * Advanced: Multi-loan payoff strategy simulation
 */
function simulateMultiLoanPayoff(loans, totalBudget) {
  // Distribute budget to minimize total cost (interest + penalty)
  let remaining = totalBudget;
  const sorted = [...loans].sort((a, b) => (b.prepaymentPenalty.amount - a.prepaymentPenalty.amount));
  const actions = [];
  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    const pay = Math.min(remaining, sorted[i].currentBalance);
    actions.push({
      loanId: sorted[i].id,
      loanName: sorted[i].name,
      payAmount: pay,
      newBalance: sorted[i].currentBalance - pay,
      penalty: sorted[i].prepaymentPenalty.amount
    });
    remaining -= pay;
  }
  // Calculate new total cost
  const newTotalCost = actions.reduce((sum, a) => sum + a.penalty, 0) + actions.reduce((sum, a) => sum + a.payAmount, 0);
  return {
    actions,
    newTotalCost
  };
}

/**
 * Advanced: Payoff calendar generation
 */
function generatePayoffCalendar(loans, monthlyBudget) {
  // Plan monthly payments to minimize penalties and interest
  const calendar = [];
  let month = 1;
  let currentLoans = loans.map(l => ({ ...l }));
  while (currentLoans.some(l => l.currentBalance > 0) && month <= 36) {
    const sorted = [...currentLoans].sort((a, b) => (b.prepaymentPenalty.amount - a.prepaymentPenalty.amount));
    let remaining = monthlyBudget;
    const payments = [];
    for (let i = 0; i < sorted.length && remaining > 0; i++) {
      const pay = Math.min(remaining, sorted[i].currentBalance);
      sorted[i].currentBalance -= pay;
      payments.push({ loanId: sorted[i].id, loanName: sorted[i].name, payAmount: pay, newBalance: sorted[i].currentBalance });
      remaining -= pay;
    }
    calendar.push({ month, payments });
    currentLoans = sorted;
    month++;
  }
  return calendar;
}

/**
 * Advanced: Custom penalty analysis
 */
function analyzeCustomPenalties(loans, customPenaltyRules) {
  // For each loan, analyze penalty under custom rules
  return loans.map(loan => {
    const rule = customPenaltyRules[loan.id];
    if (rule) {
      const penalty = rule.type === 'percent' ? loan.currentBalance * rule.value : rule.value;
      return {
        loanId: loan.id,
        loanName: loan.name,
        customPenalty: penalty
      };
    }
    return null;
  }).filter(Boolean);
}

/**
 * Advanced: Payoff trend forecasting
 */
function forecastPayoffTrends(loans, months = 12, monthlyPaydown = 0) {
  // Forecast payoff for each loan over time
  const forecasts = loans.map(loan => {
    let balance = loan.currentBalance;
    const trend = [];
    for (let m = 1; m <= months; m++) {
      balance = Math.max(0, balance - monthlyPaydown);
      trend.push({ month: m, balance });
    }
    return {
      loanId: loan.id,
      loanName: loan.name,
      trend
    };
  });
  return forecasts;
}

class LoanPrepaymentPenaltyAnalyzerService {
  /**
   * Analyze prepayment penalty scenarios for a user
   * @param {Object} userData - User's loans and payoff preferences
   * @returns {Object} Analysis result: penalty details, savings, recommendations
   */
  async analyzePrepaymentPenalties(userData) {
    const { loans } = userData;
    // Identify loans with prepayment penalties
    const penaltyLoans = identifyPenaltyLoans(loans);
    // Simulate payoff timing scenarios
    const payoffScenarios = simulatePayoffScenarios(penaltyLoans);
    // Recommend optimal payoff schedule
    const recommendations = recommendOptimalPayoff(payoffScenarios);
    // Flag loans where prepayment is not beneficial
    const flaggedLoans = flagNonBeneficialLoans(recommendations);
    return {
      penaltyLoans,
      payoffScenarios,
      recommendations,
      flaggedLoans
    };
  }

  /**
   * Simulate multi-loan payoff strategy
   * @param {Object} loans - User's loans
   * @param {Number} totalBudget - Total budget for payoff
   * @returns {Object} - Actions and new total cost
   */
  simulateMultiLoanPayoff(loans, totalBudget) {
    return simulateMultiLoanPayoff(loans, totalBudget);
  }

  /**
   * Generate payoff calendar
   * @param {Object} loans - User's loans
   * @param {Number} monthlyBudget - Monthly budget for payoff
   * @returns {Object} - Calendar of monthly payments
   */
  generatePayoffCalendar(loans, monthlyBudget) {
    return generatePayoffCalendar(loans, monthlyBudget);
  }

  /**
   * Analyze custom penalties
   * @param {Object} loans - User's loans
   * @param {Object} customPenaltyRules - Custom penalty rules
   * @returns {Object} - Custom penalty analysis
   */
  analyzeCustomPenalties(loans, customPenaltyRules) {
    return analyzeCustomPenalties(loans, customPenaltyRules);
  }

  /**
   * Forecast payoff trends
   * @param {Object} loans - User's loans
   * @param {Number} months - Forecast period
   * @param {Number} monthlyPaydown - Monthly paydown
   * @returns {Object} - Payoff trends
   */
  forecastPayoffTrends(loans, months, monthlyPaydown) {
    return forecastPayoffTrends(loans, months, monthlyPaydown);
  }
}

export default new LoanPrepaymentPenaltyAnalyzerService();
