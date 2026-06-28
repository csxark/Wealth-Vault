/**
 * incomeVolatilityScenarioSimulator.js
 * Advanced scenario simulation for income volatility, payment risk, and mitigation strategies.
 */

/**
 * Advanced: Multi-year income volatility simulation
 */
function simulateMultiYearVolatility(incomeHistory, debts, years = 3) {
  // Simulate income and payment risk over multiple years
  const months = years * 12;
  const scenarios = [];
  for (let i = 0; i < months; i++) {
    const income = incomeHistory[Math.floor(Math.random() * incomeHistory.length)];
    const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
    const missedPayment = income < paymentDue;
    scenarios.push({
      month: i + 1,
      year: Math.floor(i / 12) + 1,
      income,
      paymentDue,
      missedPayment
    });
  }
  return scenarios;
}

/**
 * Advanced: Mitigation strategy effectiveness
 */
function simulateMitigationStrategies(incomeHistory, debts, reserveFund, insuranceCoverage, gigDiversification = 1) {
  // Simulate how reserve, insurance, and gig diversification reduce risk
  const months = 12;
  let fund = reserveFund;
  let insurance = insuranceCoverage;
  let gigs = gigDiversification;
  const results = [];
  for (let i = 0; i < months; i++) {
    const income = incomeHistory[Math.floor(Math.random() * incomeHistory.length)] * gigs;
    const paymentDue = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
    let missed = false;
    if (income < paymentDue) {
      if (fund >= paymentDue) {
        fund -= paymentDue;
        missed = false;
      } else if (insurance >= paymentDue) {
        insurance -= paymentDue;
        missed = false;
      } else {
        missed = true;
      }
    }
    results.push({
      month: i + 1,
      income,
      paymentDue,
      reserveFund: fund,
      insuranceCoverage: insurance,
      gigs,
      missedPayment: missed
    });
  }
  return results;
}

/**
 * Advanced: Forecasts for payment risk and emergency fund depletion
 */
function forecastPaymentRiskAndFundDepletion(results) {
  // Count missed payments and months until fund/insurance depletion
  const missed = results.filter(r => r.missedPayment).length;
  const fundDepletionMonth = results.findIndex(r => r.reserveFund <= 0);
  const insuranceDepletionMonth = results.findIndex(r => r.insuranceCoverage <= 0);
  return {
    missedPayments: missed,
    fundDepletionMonth: fundDepletionMonth >= 0 ? fundDepletionMonth + 1 : null,
    insuranceDepletionMonth: insuranceDepletionMonth >= 0 ? insuranceDepletionMonth + 1 : null
  };
}

/**
 * Advanced: Recommendations for income smoothing and risk reduction
 */
function recommendAdvancedMitigation(results) {
  // Recommend based on simulation results
  const missed = results.filter(r => r.missedPayment).length;
  if (missed === 0) return 'Current mitigation strategies are sufficient.';
  if (results.some(r => r.reserveFund <= 0)) return 'Increase reserve fund to avoid depletion.';
  if (results.some(r => r.insuranceCoverage <= 0)) return 'Increase insurance coverage to avoid depletion.';
  if (results.some(r => r.gigs < 2)) return 'Diversify gig income sources for stability.';
  return 'Consider all mitigation strategies for best results.';
}

class IncomeVolatilityScenarioSimulator {
  async simulateAdvancedScenarios(userData) {
    const { incomeHistory, debts, reserveFund = 0, insuranceCoverage = 0, gigDiversification = 1, years = 3 } = userData;
    // Multi-year income volatility simulation
    const multiYearScenarios = simulateMultiYearVolatility(incomeHistory, debts, years);
    // Mitigation strategy effectiveness
    const mitigationResults = simulateMitigationStrategies(incomeHistory, debts, reserveFund, insuranceCoverage, gigDiversification);
    // Forecasts for payment risk and emergency fund depletion
    const forecasts = forecastPaymentRiskAndFundDepletion(mitigationResults);
    // Recommendations for income smoothing and risk reduction
    const recommendations = [recommendAdvancedMitigation(mitigationResults)];
    return {
      multiYearScenarios,
      mitigationResults,
      forecasts,
      recommendations
    };
  }
}

export default new IncomeVolatilityScenarioSimulator();
