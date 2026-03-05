/**
 * hardshipProgramNegotiationEngineService.js
 * Assesses hardship eligibility, models relief programs, and generates negotiation materials for borrowers in crisis.
 */

/**
 * Hardship Program Models
 */
const HARDSHIP_PROGRAMS = [
  {
    id: 'forbearance',
    name: 'Forbearance',
    description: 'Temporary pause on payments due to hardship. Interest may accrue.',
    type: 'pause',
    interestAccrues: true,
    documentation: ['Proof of hardship', 'Income statement', 'Letter of explanation'],
    applicableTo: ['federal', 'private'],
    maxDurationMonths: 12
  },
  {
    id: 'deferment',
    name: 'Deferment',
    description: 'Temporary suspension of payments. Interest may or may not accrue.',
    type: 'pause',
    interestAccrues: false,
    documentation: ['Proof of hardship', 'Medical/job loss documentation'],
    applicableTo: ['federal'],
    maxDurationMonths: 36
  },
  {
    id: 'income_driven',
    name: 'Income-Driven Repayment',
    description: 'Payments based on income. May lead to forgiveness after 20-25 years.',
    type: 'reduction',
    interestAccrues: true,
    documentation: ['Income verification', 'Tax returns'],
    applicableTo: ['federal'],
    maxDurationMonths: 300
  },
  {
    id: 'hardship_reduction',
    name: 'Hardship Payment Reduction',
    description: 'Reduced payments for a set period. Interest accrues.',
    type: 'reduction',
    interestAccrues: true,
    documentation: ['Income statement', 'Letter of hardship'],
    applicableTo: ['private'],
    maxDurationMonths: 24
  }
];

/**
 * Helper: Assess eligibility for hardship programs
 */
function assessEligibility(userData) {
  const { incomeDropPercent, dtiRatio, lifeEvent, debts } = userData;
  const eligible = [];
  if (incomeDropPercent >= 20 || dtiRatio >= 0.4 || lifeEvent) {
    // Forbearance and deferment
    eligible.push('forbearance');
    if (debts.some(d => d.type === 'student_loan' && d.lender === 'federal')) {
      eligible.push('deferment');
      eligible.push('income_driven');
    }
    if (debts.some(d => d.type !== 'student_loan' && d.lender !== 'federal')) {
      eligible.push('hardship_reduction');
    }
  }
  return [...new Set(eligible)];
}

/**
 * Helper: Model program impact
 */
function modelProgramImpact(program, userData) {
  // Simulate impact: payment reduction, interest accrual, forgiveness timeline, credit score
  const { debts, income, hardshipMonths = 6 } = userData;
  let totalInterest = 0;
  let totalForgiven = 0;
  let cashFlowRelief = 0;
  let creditScoreImpact = 0;
  let timelineMonths = hardshipMonths;
  let interestPaused = !program.interestAccrues;
  let monthlyPayment = 0;

  if (program.type === 'pause') {
    monthlyPayment = 0;
    cashFlowRelief = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0) * hardshipMonths;
    totalInterest = program.interestAccrues
      ? debts.reduce((sum, d) => sum + (parseFloat(d.currentBalance) * (d.interestRate / 100 / 12) * hardshipMonths), 0)
      : 0;
    creditScoreImpact = -10; // Slight negative for paused payments
  } else if (program.type === 'reduction') {
    monthlyPayment = Math.max(0, Math.floor(income / 10)); // 10% of income
    cashFlowRelief = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0) * hardshipMonths - monthlyPayment * hardshipMonths;
    totalInterest = debts.reduce((sum, d) => sum + (parseFloat(d.currentBalance) * (d.interestRate / 100 / 12) * hardshipMonths), 0);
    creditScoreImpact = -5; // Less negative
  }

  if (program.id === 'income_driven') {
    timelineMonths = 240; // 20 years
    totalForgiven = debts.filter(d => d.lender === 'federal').reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
  }

  return {
    programId: program.id,
    monthlyPayment,
    cashFlowRelief,
    totalInterest,
    totalForgiven,
    creditScoreImpact,
    timelineMonths,
    interestPaused
  };
}

/**
 * Helper: Rank programs
 */
function rankPrograms(impacts) {
  // Rank by cash flow relief, then by lowest long-term cost
  return impacts.sort((a, b) => {
    if (b.cashFlowRelief !== a.cashFlowRelief) {
      return b.cashFlowRelief - a.cashFlowRelief;
    }
    return a.totalInterest - b.totalInterest;
  });
}

/**
 * Helper: Generate application letter
 */
function generateApplicationLetter(program, userData) {
  const { name, lifeEvent, incomeDropPercent } = userData;
  return `To Whom It May Concern,\n\nI am writing to request enrollment in the ${program.name} program due to a recent financial hardship. My income has dropped by ${incomeDropPercent}% due to ${lifeEvent || 'unforeseen circumstances'}. I am seeking relief as outlined in your program documentation.\n\nThank you for your consideration.\n\nSincerely,\n${name}`;
}

/**
 * Helper: Generate documentation checklist
 */
function generateDocumentationChecklist(program) {
  return program.documentation;
}

/**
 * Helper: Simulate recovery timeline
 */
function simulateRecovery(userData, programImpact) {
  // Assume re-employment after hardshipMonths, then normal payments
  const { debts, hardshipMonths = 6, income } = userData;
  let recoveryMonths = 0;
  let totalPaid = 0;
  let balance = debts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
  let monthlyPayment = debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  if (programImpact.monthlyPayment > 0) monthlyPayment = programImpact.monthlyPayment;
  // After hardship, resume normal payments
  while (balance > 0 && recoveryMonths < 120) {
    balance -= monthlyPayment;
    totalPaid += monthlyPayment;
    recoveryMonths++;
  }
  return {
    recoveryMonths,
    totalPaid
  };
}

/**
 * Helper: Flag interest accrual/capitalization
 */
function flagInterest(program) {
  return program.interestAccrues ? 'Interest accrues during hardship.' : 'Interest is paused during hardship.';
}

/**
 * Helper: Recommend account prioritization
 */
function recommendAccounts(userData) {
  // Prioritize federal loans, high-APR debts first
  const { debts } = userData;
  const federal = debts.filter(d => d.lender === 'federal');
  const highApr = debts.filter(d => d.interestRate >= 10);
  return {
    prioritize: [
      ...federal.map(d => d.id),
      ...highApr.map(d => d.id)
    ],
    notes: 'Prioritize federal loans and high-APR debts for hardship programs.'
  };
}

/**
 * Advanced: Multi-program scenario simulation
 */
function simulateMultiProgramScenarios(userData) {
  // Try combinations of programs for best outcome
  const scenarios = [];
  const eligibleIds = assessEligibility(userData);
  const eligiblePrograms = HARDSHIP_PROGRAMS.filter(p => eligibleIds.includes(p.id));
  for (let i = 0; i < eligiblePrograms.length; i++) {
    for (let j = 0; j < eligiblePrograms.length; j++) {
      if (i !== j) {
        const first = eligiblePrograms[i];
        const second = eligiblePrograms[j];
        // Apply first program for half the hardship period, then second
        const halfMonths = Math.floor((userData.hardshipMonths || 6) / 2);
        const impactFirst = modelProgramImpact(first, { ...userData, hardshipMonths: halfMonths });
        const impactSecond = modelProgramImpact(second, { ...userData, hardshipMonths: halfMonths });
        const totalRelief = impactFirst.cashFlowRelief + impactSecond.cashFlowRelief;
        const totalInterest = impactFirst.totalInterest + impactSecond.totalInterest;
        scenarios.push({
          sequence: [first.name, second.name],
          totalRelief,
          totalInterest,
          details: [impactFirst, impactSecond]
        });
      }
    }
  }
  // Sort by best relief, then lowest interest
  return scenarios.sort((a, b) => b.totalRelief - a.totalRelief || a.totalInterest - b.totalInterest);
}

/**
 * Advanced: Custom hardship program builder
 */
function buildCustomHardshipProgram(options) {
  // Allow user to specify custom terms
  return {
    id: 'custom',
    name: options.name || 'Custom Hardship Program',
    description: options.description || 'User-defined hardship relief.',
    type: options.type || 'pause',
    interestAccrues: options.interestAccrues ?? true,
    documentation: options.documentation || ['Custom documentation'],
    applicableTo: options.applicableTo || ['federal', 'private'],
    maxDurationMonths: options.maxDurationMonths || 6
  };
}

/**
 * Advanced: Generate negotiation script for phone calls
 */
function generateNegotiationScript(program, userData) {
  return `Hello, my name is ${userData.name}. I am experiencing financial hardship due to ${userData.lifeEvent || 'unforeseen circumstances'}. I would like to discuss options for the ${program.name} program, including payment relief and interest terms. Can you guide me through the application process and required documentation? Thank you.`;
}

/**
 * Advanced: Generate timeline visualization data
 */
function generateTimelineData(programImpact, userData) {
  // Output array of { month, balance, payment, interest }
  const { debts, hardshipMonths = 6 } = userData;
  let timeline = [];
  let balance = debts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
  let monthlyPayment = programImpact.monthlyPayment || debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);
  for (let m = 1; m <= hardshipMonths; m++) {
    const interest = programImpact.interestPaused ? 0 : balance * 0.01; // Approximate
    timeline.push({ month: m, balance, payment: monthlyPayment, interest });
    balance += interest - monthlyPayment;
    if (balance < 0) balance = 0;
  }
  return timeline;
}

class HardshipProgramNegotiationEngineService {
  async evaluateHardshipPrograms(userData) {
    // Assess eligibility
    const eligibleIds = assessEligibility(userData);
    const eligiblePrograms = HARDSHIP_PROGRAMS.filter(p => eligibleIds.includes(p.id));
    // Model impact for each program
    const impacts = eligiblePrograms.map(p => modelProgramImpact(p, userData));
    // Rank programs
    const ranked = rankPrograms(impacts);
    // Generate application materials
    const applicationMaterials = {};
    ranked.forEach(impact => {
      const program = HARDSHIP_PROGRAMS.find(p => p.id === impact.programId);
      applicationMaterials[program.id] = {
        letter: generateApplicationLetter(program, userData),
        checklist: generateDocumentationChecklist(program)
      };
    });
    // Simulate recovery for top program
    const recoverySimulation = simulateRecovery(userData, ranked[0] || {});
    // Flag interest accrual/capitalization
    const interestFlags = ranked.map(impact => {
      const program = HARDSHIP_PROGRAMS.find(p => p.id === impact.programId);
      return { programId: program.id, flag: flagInterest(program) };
    });
    // Recommend account prioritization
    const recommendations = [recommendAccounts(userData)];
    return {
      eligiblePrograms: eligiblePrograms.map(p => p.name),
      impactAnalysis: ranked,
      recommendations,
      applicationMaterials,
      recoverySimulation,
      interestFlags
    };
  }

  /**
   * Simulate multi-program scenarios
   */
  simulateMultiProgramScenarios(userData) {
    return simulateMultiProgramScenarios(userData);
  }

  /**
   * Build custom hardship program
   */
  buildCustomHardshipProgram(options) {
    return buildCustomHardshipProgram(options);
  }

  /**
   * Generate negotiation script
   */
  generateNegotiationScript(program, userData) {
    return generateNegotiationScript(program, userData);
  }

  /**
   * Generate timeline data
   */
  generateTimelineData(programImpact, userData) {
    return generateTimelineData(programImpact, userData);
  }
}

export default new HardshipProgramNegotiationEngineService();
