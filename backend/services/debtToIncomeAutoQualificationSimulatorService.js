/**
 * debtToIncomeAutoQualificationSimulatorService.js
 * Calculates DTI, models loan qualification, simulates DTI reduction, and recommends payoff actions for borrowers.
 */

/**
 * Loan Program Models
 */
const LOAN_PROGRAMS = [
  {
    id: 'conventional',
    name: 'Conventional Mortgage',
    maxDTI: 0.43,
    minCreditScore: 620,
    minDownPayment: 0.05,
    interestRate: 0.065,
    maxLoanAmount: 726200
  },
  {
    id: 'fha',
    name: 'FHA Mortgage',
    maxDTI: 0.50,
    minCreditScore: 580,
    minDownPayment: 0.035,
    interestRate: 0.062,
    maxLoanAmount: 472030
  },
  {
    id: 'va',
    name: 'VA Mortgage',
    maxDTI: 0.41,
    minCreditScore: 620,
    minDownPayment: 0.0,
    interestRate: 0.061,
    maxLoanAmount: 726200
  },
  {
    id: 'auto',
    name: 'Auto Loan',
    maxDTI: 0.50,
    minCreditScore: 600,
    minDownPayment: 0.0,
    interestRate: 0.075,
    maxLoanAmount: 100000
  },
  {
    id: 'personal',
    name: 'Personal Loan',
    maxDTI: 0.45,
    minCreditScore: 600,
    minDownPayment: 0.0,
    interestRate: 0.12,
    maxLoanAmount: 50000
  }
];

/**
 * Helper: Calculate DTI ratio
 */
function calculateDTI(debts, income) {
  const totalMonthlyDebtPayments = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  return income > 0 ? totalMonthlyDebtPayments / income : 0;
}

/**
 * Helper: Model loan program qualification
 */
function modelLoanQualification(dti, creditScore, downPayment, requestedAmount) {
  return LOAN_PROGRAMS.filter(p =>
    dti <= p.maxDTI &&
    creditScore >= p.minCreditScore &&
    downPayment >= p.minDownPayment &&
    requestedAmount <= p.maxLoanAmount
  );
}

/**
 * Helper: Simulate DTI reduction scenarios
 */
function simulateDTIReductionScenarios(debts, income, targetDTI) {
  // Try paying off debts, increasing income, refinancing
  const scenarios = [];
  // Pay off each debt one by one
  for (let i = 0; i < debts.length; i++) {
    const newDebts = debts.filter((_, idx) => idx !== i);
    const newDTI = calculateDTI(newDebts, income);
    scenarios.push({
      action: `Pay off ${debts[i].name}`,
      resultingDTI: newDTI,
      debtsPaidOff: [debts[i].id],
      impact: debts[i].minimumPayment
    });
  }
  // Increase income by 10%
  const increasedIncome = income * 1.1;
  scenarios.push({
    action: 'Increase income by 10%',
    resultingDTI: calculateDTI(debts, increasedIncome),
    debtsPaidOff: [],
    impact: increasedIncome - income
  });
  // Refinance highest APR debt
  const highestAPR = debts.reduce((max, d) => d.interestRate > max.interestRate ? d : max, debts[0]);
  if (highestAPR) {
    const newDebts = debts.map(d =>
      d.id === highestAPR.id ? { ...d, interestRate: d.interestRate * 0.7 } : d
    );
    scenarios.push({
      action: `Refinance ${highestAPR.name} to lower rate`,
      resultingDTI: calculateDTI(newDebts, income),
      debtsPaidOff: [],
      impact: highestAPR.interestRate * 0.3
    });
  }
  // Filter scenarios that reach target DTI
  return scenarios.filter(s => s.resultingDTI <= targetDTI);
}

/**
 * Helper: Rank payoff actions by impact
 */
function rankPayoffActions(scenarios) {
  // Rank by largest reduction in DTI
  return scenarios.sort((a, b) => b.impact - a.impact);
}

/**
 * Helper: Project eligible loan amounts
 */
function projectLoanAmounts(dti, income) {
  // Estimate max loan based on DTI and program limits
  return LOAN_PROGRAMS.map(p => {
    const maxPayment = p.maxDTI * income;
    const maxLoan = Math.min(p.maxLoanAmount, maxPayment / p.interestRate);
    return {
      program: p.name,
      maxLoanAmount: Math.round(maxLoan),
      interestRate: p.interestRate
    };
  });
}

/**
 * Helper: Calculate interest savings from better rates
 */
function calculateInterestSavings(debts, newRate) {
  // Compare current interest vs. new rate for all debts
  const currentInterest = debts.reduce((sum, d) => sum + (parseFloat(d.currentBalance) * d.interestRate / 100), 0);
  const newInterest = debts.reduce((sum, d) => sum + (parseFloat(d.currentBalance) * newRate / 100), 0);
  return currentInterest - newInterest;
}

/**
 * Helper: Identify gateway debts
 */
function identifyGatewayDebts(debts, income, targetDTI) {
  // Debts whose payoff moves user to next DTI tier
  const gateway = [];
  for (let i = 0; i < debts.length; i++) {
    const newDebts = debts.filter((_, idx) => idx !== i);
    const newDTI = calculateDTI(newDebts, income);
    if (newDTI <= targetDTI) {
      gateway.push(debts[i]);
    }
  }
  return gateway;
}

/**
 * Helper: Recommend payoff sequence
 */
function recommendPayoffSequence(debts, income, targetDTI) {
  // Greedy: pay off debts with highest payment first
  const sorted = [...debts].sort((a, b) => parseFloat(b.minimumPayment) - parseFloat(a.minimumPayment));
  const sequence = [];
  let currentDebts = [...debts];
  for (let i = 0; i < sorted.length; i++) {
    currentDebts = currentDebts.filter(d => d.id !== sorted[i].id);
    const newDTI = calculateDTI(currentDebts, income);
    sequence.push({
      payOff: sorted[i].name,
      resultingDTI: newDTI
    });
    if (newDTI <= targetDTI) break;
  }
  return sequence;
}

/**
 * Helper: Model cost-benefit of extra payments
 */
function modelCostBenefit(debts, income, extraPayment, targetDTI) {
  // Simulate paying extra to reach target DTI
  let months = 0;
  let currentDebts = debts.map(d => ({ ...d }));
  let dti = calculateDTI(currentDebts, income);
  let totalExtraPaid = 0;
  while (dti > targetDTI && months < 60) {
    // Apply extra payment to highest payment debt
    const highest = currentDebts.sort((a, b) => parseFloat(b.minimumPayment) - parseFloat(a.minimumPayment))[0];
    if (!highest) break;
    const payment = Math.min(extraPayment, parseFloat(highest.currentBalance));
    highest.currentBalance -= payment;
    totalExtraPaid += payment;
    months++;
    currentDebts = currentDebts.filter(d => d.currentBalance > 0);
    dti = calculateDTI(currentDebts, income);
  }
  return {
    months,
    totalExtraPaid,
    reachedTargetDTI: dti <= targetDTI
  };
}

class DebtToIncomeAutoQualificationSimulatorService {
  async simulateDTIQualification(userData) {
    const { debts, income, creditScore, downPayment, requestedAmount, targetDTI = 0.43, extraPayment = 0 } = userData;
    // Calculate current DTI
    const dtiRatio = calculateDTI(debts, income);
    // Model loan program qualification
    const qualifiedPrograms = modelLoanQualification(dtiRatio, creditScore, downPayment, requestedAmount);
    // Simulate DTI reduction scenarios
    const reductionScenarios = simulateDTIReductionScenarios(debts, income, targetDTI);
    // Rank payoff actions
    const rankedActions = rankPayoffActions(reductionScenarios);
    // Project loan amounts
    const loanProjections = projectLoanAmounts(dtiRatio, income);
    // Calculate interest savings
    const interestSavings = calculateInterestSavings(debts, Math.min(...qualifiedPrograms.map(p => p.interestRate)) || 0.12);
    // Identify gateway debts
    const gatewayDebts = identifyGatewayDebts(debts, income, targetDTI);
    // Recommend payoff sequence
    const payoffSequence = recommendPayoffSequence(debts, income, targetDTI);
    // Model cost-benefit
    const costBenefit = modelCostBenefit(debts, income, extraPayment, targetDTI);
    return {
      dtiRatio,
      qualifiedPrograms: qualifiedPrograms.map(p => p.name),
      reductionScenarios,
      rankedActions,
      loanProjections,
      interestSavings,
      gatewayDebts: gatewayDebts.map(d => d.name),
      payoffSequence,
      costBenefit
    };
  }
}

export default new DebtToIncomeAutoQualificationSimulatorService();
