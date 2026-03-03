/**
 * incomeVolatilityRiskForecasterService.js
 * Models income volatility, simulates payment risk, and recommends emergency fund and smoothing strategies.
 */

/**
 * Helper: Model income volatility
 */
function modelIncomeVolatility(incomeHistory) {
  // Calculate mean, stddev, min, max, volatility index
  const n = incomeHistory.length;
  if (n === 0) return {};
  const mean = incomeHistory.reduce((sum, v) => sum + v, 0) / n;
  const variance = incomeHistory.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  const min = Math.min(...incomeHistory);
  const max = Math.max(...incomeHistory);
  const volatilityIndex = stddev / mean;
  return { mean, stddev, min, max, volatilityIndex };
}

/**
 * Helper: Simulate stress scenarios (income drops, missed payments)
 */
function simulateStressScenarios(incomeHistory, debts, months = 12) {
  // Simulate random income drops and missed payments
  const scenarios = [];
  for (let i = 0; i < months; i++) {
    const income = incomeHistory[Math.floor(Math.random() * incomeHistory.length)];
    const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
    const missedPayment = income < paymentDue;
    scenarios.push({
      month: i + 1,
      income,
      paymentDue,
      missedPayment
    });
  }
  return scenarios;
}

/**
 * Helper: Project risk of default and credit impact
 */
function projectRiskProjections(scenarios) {
  // Count missed payments, estimate default risk and credit impact
  const missed = scenarios.filter(s => s.missedPayment).length;
  const defaultRisk = missed / scenarios.length;
  const creditImpact = -missed * 20; // -20 points per missed payment
  return { missedPayments: missed, defaultRisk, creditImpact };
}

/**
 * Helper: Recommend emergency fund targets
 */
function recommendEmergencyFund(incomeHistory, debts) {
  // Recommend 3-6 months of minimum payments as emergency fund
  const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  const minIncome = Math.min(...incomeHistory);
  const fund3 = paymentDue * 3;
  const fund6 = paymentDue * 6;
  return {
    recommendedFund3: fund3,
    recommendedFund6: fund6,
    minIncome,
    paymentDue
  };
}

/**
 * Helper: Recommend payment smoothing strategies
 */
function recommendPaymentSmoothing(incomeHistory, debts) {
  // Suggest autopay, income averaging, or reserve account
  const meanIncome = incomeHistory.reduce((sum, v) => sum + v, 0) / incomeHistory.length;
  const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  const smoothing = meanIncome > paymentDue ? 'Autopay recommended' : 'Reserve account needed';
  return {
    meanIncome,
    paymentDue,
    smoothing
  };
}

/**
 * Helper: Generate alerts for high-risk periods
 */
function generateAlerts(scenarios) {
  return scenarios.filter(s => s.missedPayment).map(s => ({
    month: s.month,
    message: `High risk: income $${s.income} insufficient for payment $${s.paymentDue}`
  }));
}

/**
 * Advanced: Income volatility clustering and risk scoring
 */
function clusterIncomePeriods(incomeHistory) {
  // Group income periods by volatility (low, medium, high)
  const mean = incomeHistory.reduce((sum, v) => sum + v, 0) / incomeHistory.length;
  return incomeHistory.map(v => {
    if (v < mean * 0.7) return 'low';
    if (v < mean * 1.2) return 'medium';
    return 'high';
  });
}

function scoreVolatilityRisk(incomeHistory, debts) {
  // Score risk based on frequency of low income periods and payment coverage
  const clusters = clusterIncomePeriods(incomeHistory);
  const lowPeriods = clusters.filter(c => c === 'low').length;
  const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  const meanIncome = incomeHistory.reduce((sum, v) => sum + v, 0) / incomeHistory.length;
  const riskScore = (lowPeriods / clusters.length) * (paymentDue / meanIncome);
  return { riskScore, lowPeriods, clusters };
}

/**
 * Advanced: Income smoothing simulation
 */
function simulateIncomeSmoothing(incomeHistory, smoothingFund = 0) {
  // Simulate using a smoothing fund to cover low income periods
  const mean = incomeHistory.reduce((sum, v) => sum + v, 0) / incomeHistory.length;
  let fund = smoothingFund;
  const results = incomeHistory.map((v, i) => {
    let covered = false;
    if (v < mean && fund > 0) {
      fund -= (mean - v);
      covered = true;
    }
    return { month: i + 1, income: v, covered, fundRemaining: fund };
  });
  return results;
}

/**
 * Advanced: Emergency fund depletion forecasting
 */
function forecastEmergencyFundDepletion(incomeHistory, debts, initialFund) {
  // Forecast how many months the emergency fund will last
  let fund = initialFund;
  const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  let months = 0;
  for (let i = 0; i < incomeHistory.length; i++) {
    if (incomeHistory[i] < paymentDue) {
      fund -= (paymentDue - incomeHistory[i]);
      if (fund < 0) break;
    }
    months++;
  }
  return { monthsUntilDepletion: months, fundRemaining: fund };
}

/**
 * Advanced: Generate volatility risk report
 */
function generateVolatilityRiskReport(incomeHistory, debts, smoothingFund, emergencyFund) {
  const clustering = clusterIncomePeriods(incomeHistory);
  const risk = scoreVolatilityRisk(incomeHistory, debts);
  const smoothing = simulateIncomeSmoothing(incomeHistory, smoothingFund);
  const emergencyDepletion = forecastEmergencyFundDepletion(incomeHistory, debts, emergencyFund);
  return {
    clustering,
    risk,
    smoothing,
    emergencyDepletion
  };
}

class IncomeVolatilityRiskForecasterService {
  /**
   * Forecast income volatility risk for a user
   * @param {Object} userData - User's income history, debts, and payment schedule
   * @returns {Object} Risk forecast: stress scenarios, risk projections, recommendations, alerts
   */
  async forecastIncomeVolatilityRisk(userData) {
    const { incomeHistory, debts, months = 12 } = userData;
    // Model income volatility
    const volatilitySummary = modelIncomeVolatility(incomeHistory);
    // Simulate stress scenarios
    const stressScenarios = simulateStressScenarios(incomeHistory, debts, months);
    // Project risk of default and credit impact
    const riskProjections = projectRiskProjections(stressScenarios);
    // Recommend emergency fund targets
    const recommendations = [
      recommendEmergencyFund(incomeHistory, debts),
      recommendPaymentSmoothing(incomeHistory, debts)
    ];
    // Generate alerts for high-risk periods
    const alerts = generateAlerts(stressScenarios);
    return {
      volatilitySummary,
      stressScenarios,
      riskProjections,
      recommendations,
      alerts
    };
  }

  /**
   * Cluster income periods by volatility
   * @param {Array} incomeHistory - User's income history
   * @returns {Array} Clustered income periods
   */
  clusterIncomePeriods(incomeHistory) {
    return clusterIncomePeriods(incomeHistory);
  }

  /**
   * Score volatility risk
   * @param {Array} incomeHistory - User's income history
   * @param {Array} debts - User's debts
   * @returns {Object} Risk score, low periods, clusters
   */
  scoreVolatilityRisk(incomeHistory, debts) {
    return scoreVolatilityRisk(incomeHistory, debts);
  }

  /**
   * Simulate income smoothing
   * @param {Array} incomeHistory - User's income history
   * @param {Number} smoothingFund - Smoothing fund amount
   * @returns {Array} Simulated income smoothing results
   */
  simulateIncomeSmoothing(incomeHistory, smoothingFund) {
    return simulateIncomeSmoothing(incomeHistory, smoothingFund);
  }

  /**
   * Forecast emergency fund depletion
   * @param {Array} incomeHistory - User's income history
   * @param {Array} debts - User's debts
   * @param {Number} initialFund - Initial emergency fund amount
   * @returns {Object} Months until depletion, fund remaining
   */
  forecastEmergencyFundDepletion(incomeHistory, debts, initialFund) {
    return forecastEmergencyFundDepletion(incomeHistory, debts, initialFund);
  }

  /**
   * Generate volatility risk report
   * @param {Array} incomeHistory - User's income history
   * @param {Array} debts - User's debts
   * @param {Number} smoothingFund - Smoothing fund amount
   * @param {Number} emergencyFund - Emergency fund amount
   * @returns {Object} Volatility risk report
   */
  generateVolatilityRiskReport(incomeHistory, debts, smoothingFund, emergencyFund) {
    return generateVolatilityRiskReport(incomeHistory, debts, smoothingFund, emergencyFund);
  }
}

export default new IncomeVolatilityRiskForecasterService();
