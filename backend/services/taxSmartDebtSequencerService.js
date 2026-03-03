const db = require('../database/db');

// Helper utilities
const toNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const roundMoney = (amount) => Math.round(toNumber(amount) * 100) / 100;

const roundPercent = (percent) => {
  const p = Math.max(0, Math.min(100, toNumber(percent)));
  return Math.round(p * 100) / 100;
};

const clamp = (val, min, max) => Math.max(min, Math.min(max, toNumber(val)));

/**
 * Tax-Smart Debt Payoff Sequencer
 * Optimizes debt repayment strategy based on:
 * - Tax profile (income, deductions, losses)
 * - Student loan interest deduction benefits
 * - Tax refund timing and deployment
 * - Tax bracket optimization for lump-sum payments
 */
class TaxSmartDebtSequencerService {
  /**
   * Normalize debt input
   */
  normalizeDebt(debt) {
    return {
      id: debt.id || `debt_${Math.random()}`,
      name: debt.name || 'Debt',
      balance: roundMoney(debt.balance),
      apr: roundPercent(debt.apr),
      minimumPayment: roundMoney(debt.minimumPayment),
      monthlyPayment: roundMoney(debt.monthlyPayment || debt.minimumPayment),
      type: debt.type || 'credit-card', // credit-card, personal-loan, student-loan, auto-loan, other
      isStudentLoan: debt.type === 'student-loan' || debt.isStudentLoan === true,
      monthsToPayoff: Math.ceil(toNumber(debt.monthsToPayoff) || 36),
      annualInterestDue: roundMoney(debt.annualInterestDue || debt.balance * debt.apr / 100)
    };
  }

  /**
   * Normalize tax profile
   */
  normalizeTaxProfile(profile) {
    return {
      filingStatus: profile.filingStatus || 'single', // single, married-joint, married-sep, head-household
      grossAnnualIncome: roundMoney(profile.grossAnnualIncome),
      taxableIncome: roundMoney(profile.taxableIncome || profile.grossAnnualIncome),
      investmentLosses: roundMoney(Math.abs(toNumber(profile.investmentLosses))), // positive value
      studentLoanDebtOwnedByUser: profile.studentLoanDebtOwnedByUser === true,
      otherDeductions: roundMoney(profile.otherDeductions || 0),
      estimatedTaxRatePercent: roundPercent(profile.estimatedTaxRatePercent || 24),
      expectedRefundAmount: roundMoney(profile.expectedRefundAmount || 0),
      refundMonth: clamp(toNumber(profile.refundMonth) || 4, 1, 12), // April default
      historicalRefundTiming: toNumber(profile.historicalRefundTiming) || 45 // days after filing
    };
  }

  /**
   * Determine effective tax benefit from paying down debt strategically
   */
  calculateTaxBenefitProfile(debts, taxProfile) {
    const studentLoans = debts.filter(d => d.isStudentLoan);
    const nonStudentLoans = debts.filter(d => !d.isStudentLoan);

    // Student loan interest deduction (max $2,500/year, phase-out at higher incomes)
    let studentLoanInterestDeduction = 0;
    if (studentLoans.length > 0 && taxProfile.studentLoanDebtOwnedByUser) {
      const totalStudentLoanInterest = studentLoans.reduce((sum, d) => sum + d.annualInterestDue, 0);
      studentLoanInterestDeduction = Math.min(2500, totalStudentLoanInterest);
      
      // Phase-out: reduce by 25% for each $10k over threshold (varies by filing status)
      const incomeThreshold = taxProfile.filingStatus === 'married-joint' ? 150000 : 75000;
      if (taxProfile.grossAnnualIncome > incomeThreshold) {
        const overage = taxProfile.grossAnnualIncome - incomeThreshold;
        const phaseoutReduction = Math.floor(overage / 10000) * 0.25;
        studentLoanInterestDeduction = Math.max(0, studentLoanInterestDeduction * (1 - phaseoutReduction));
      }
    }

    // Investment loss offsets (max $3,000/year, carry forward indefinitely)
    let investmentLossDeduction = Math.min(3000, taxProfile.investmentLosses);

    // Capital gains tax advantage from paying high-APR debt before investment gains realized
    const capitalGainsTaxRate = taxProfile.estimatedTaxRatePercent > 32 ? 0.20 : 0.15; // simplified

    return {
      studentLoanInterestDeduction: roundMoney(studentLoanInterestDeduction),
      investmentLossDeduction: roundMoney(investmentLossDeduction),
      totalDeductionAvailable: roundMoney(studentLoanInterestDeduction + investmentLossDeduction),
      taxSavingsFromDeductions: roundMoney((studentLoanInterestDeduction + investmentLossDeduction) * taxProfile.estimatedTaxRatePercent / 100),
      capitalGainsTaxRate: roundPercent(capitalGainsTaxRate * 100),
      effectiveMarginalRate: roundPercent(taxProfile.estimatedTaxRatePercent + (capitalGainsTaxRate * 100))
    };
  }

  /**
   * Calculate net-of-tax cost for each debt payoff strategy
   */
  calculateNetDebtCost(debt, taxProfile, includeStudentLoanBenefit = false) {
    let totalInterest = debt.balance * Math.pow(1 + debt.apr / 100 / 12, debt.monthsToPayoff) - debt.balance;
    totalInterest = Math.max(0, totalInterest); // should be positive

    let taxBenefit = 0;
    if (includeStudentLoanBenefit && debt.isStudentLoan) {
      // Student loan interest deduction reduces taxable income
      taxBenefit = Math.min(debt.annualInterestDue, 2500) * taxProfile.estimatedTaxRatePercent / 100;
    }

    const netCost = roundMoney(totalInterest - taxBenefit);
    return {
      totalInterest: roundMoney(totalInterest),
      taxBenefit: roundMoney(taxBenefit),
      netCost: netCost,
      netCostPercent: debt.balance > 0 ? roundPercent((netCost / debt.balance) * 100) : 0
    };
  }

  /**
   * Rank debts by tax-efficient payoff priority
   * High APR non-student = highest priority (no tax benefit lost)
   * Low APR student = lowest priority (maximize deduction retention)
   * Medium APR mixed = moderate priority
   */
  rankDebtsByTaxEfficiency(debts, taxProfile) {
    const taxBenefits = this.calculateTaxBenefitProfile(debts, taxProfile);

    return debts
      .map(debt => {
        const costProfile = this.calculateNetDebtCost(debt, taxProfile, true);

        // Priority score: higher APR = higher priority, except for student loans with low APR
        let priorityScore = debt.apr * 100; // APR * 100 for sorting

        // Penalty for student loans: reduce priority if we'd lose tax benefit
        if (debt.isStudentLoan && taxBenefits.studentLoanInterestDeduction > 0) {
          priorityScore *= 0.5; // student loans worth less due to deduction benefit
        }

        return {
          ...debt,
          costProfile,
          priorityScore,
          recommendations: []
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Recommend refund deployment timing and targeting
   */
  recommendRefundDeployment(rankedDebts, taxProfile) {
    if (taxProfile.expectedRefundAmount <= 0) {
      return {
        refundAmount: 0,
        recommendations: [
          {
            priority: 1,
            action: 'No refund expected',
            targetDebtId: null,
            deploymentAmount: 0,
            estimatedInterestSavings: 0,
            taxSavings: 0
          }
        ]
      };
    }

    const recommendations = [];
    let remainingRefund = taxProfile.expectedRefundAmount;

    // Deploy refund to highest-priority debts first
    for (let i = 0; i < rankedDebts.length && remainingRefund > 0; i++) {
      const debt = rankedDebts[i];
      const deploymentAmount = Math.min(remainingRefund, debt.balance);

      if (deploymentAmount > 0) {
        // Calculate interest saved by paying down this debt early
        const remainingBalance = debt.balance - deploymentAmount;
        const newMonthsToPayoff = remainingBalance > 0 ? Math.ceil(remainingBalance / debt.monthlyPayment) : 0;
        const interestWithPaydown = remainingBalance * Math.pow(1 + debt.apr / 100 / 12, newMonthsToPayoff) - remainingBalance;
        const currentInterest = debt.annualInterestDue;
        const interestSaved = currentInterest - Math.max(0, interestWithPaydown);

        let studentLoanTaxBenefit = 0;
        if (!debt.isStudentLoan) {
          // Paying non-student loan doesn't affect deductions
          studentLoanTaxBenefit = 0;
        }

        recommendations.push({
          priority: i + 1,
          action: `Deploy to ${debt.name}`,
          targetDebtId: debt.id,
          debtName: debt.name,
          debtAPR: debt.apr,
          deploymentAmount: roundMoney(deploymentAmount),
          estimatedInterestSavings: roundMoney(interestSaved),
          studentLoanTaxBenefit: roundMoney(studentLoanTaxBenefit),
          totalBenefit: roundMoney(interestSaved + studentLoanTaxBenefit),
          refundReceivedMonth: taxProfile.refundMonth
        });

        remainingRefund = roundMoney(remainingRefund - deploymentAmount);
      }
    }

    // If refund remains after all debts, suggest emergency fund
    if (remainingRefund > 0) {
      recommendations.push({
        priority: recommendations.length + 1,
        action: 'Build emergency fund',
        targetDebtId: null,
        deploymentAmount: roundMoney(remainingRefund),
        estimatedInterestSavings: 0,
        studentLoanTaxBenefit: 0,
        totalBenefit: 0
      });
    }

    return {
      refundAmount: taxProfile.expectedRefundAmount,
      expectedRefundMonth: taxProfile.refundMonth,
      recommendations
    };
  }

  /**
   * Suggest lump-sum payment timing for tax bracket optimization
   * If deploying large payment, timing can affect marginal tax rate
   */
  recommendLumpSumTiming(debt, taxProfile, lumpSumAmount = 0) {
    lumpSumAmount = Math.min(toNumber(lumpSumAmount), debt.balance);

    // Simplified tax bracket optimization
    const currentBracketIncome = taxProfile.taxableIncome;
    
    // Standard tax brackets (2026 estimates, single filer)
    const brackets = [
      { min: 0, max: 11600, rate: 10 },
      { min: 11600, max: 47150, rate: 12 },
      { min: 47150, max: 100525, rate: 22 },
      { min: 100525, max: 191950, rate: 24 },
      { min: 191950, max: 243725, rate: 32 },
      { min: 243725, max: 609350, rate: 35 },
      { min: 609350, max: Infinity, rate: 37 }
    ];

    // Find current bracket
    const currentBracket = brackets.find(b => currentBracketIncome >= b.min && currentBracketIncome < b.max);
    const currentRate = currentBracket?.rate || 37;

    // If paying back in next tax year, consider Dec vs Jan timing
    return {
      debtId: debt.id,
      debtName: debt.name,
      lumpSumAmount: roundMoney(lumpSumAmount),
      scenarios: [
        {
          timing: 'Current year (Dec)',
          taxImpact: 'No change - no new income generated',
          recommendation: 'Pay now if cash available',
          estimatedTaxSavings: 0
        },
        {
          timing: 'Next year (Jan)',
          taxImpact: 'Consider if high-income year ahead',
          recommendation: 'Defer if expecting lower income next year',
          estimatedTaxSavings: 0
        }
      ],
      note: 'Tax bracket optimization most beneficial for large lump sums (>$10k) with variable income'
    };
  }

  /**
   * Model student loan payment deferral if income drops
   * Identifies when deferring improves after-tax position
   */
  recommendStudentLoanDeferralImpact(studentLoans, taxProfile, projectedIncomeDrop = 0) {
    if (studentLoans.length === 0) {
      return {
        shouldConsiderDeferral: false,
        reason: 'No student loans in portfolio',
        recommendations: []
      };
    }

    const totalStudentLoanInterest = studentLoans.reduce((sum, d) => sum + d.annualInterestDue, 0);
    const projectedIncome = Math.max(0, taxProfile.grossAnnualIncome - projectedIncomeDrop);

    // Deferral benefits if income < student loan deduction phase-out threshold
    const phaseoutThreshold = taxProfile.filingStatus === 'married-joint' ? 150000 : 75000;

    return {
      shouldConsiderDeferral: projectedIncome < phaseoutThreshold && studentLoanInterest > 0,
      currentIncomeLevel: taxProfile.grossAnnualIncome,
      projectedIncomeLevel: projectedIncome,
      phaseoutThreshold,
      totalStudentLoanInterest: roundMoney(totalStudentLoanInterest),
      recommendations: [
        {
          action: 'Continue full payments',
          when: projectedIncome >= phaseoutThreshold,
          benefit: 'Maintain full $2,500 deduction',
          estimatedTaxSavings: roundMoney(Math.min(totalStudentLoanInterest, 2500) * taxProfile.estimatedTaxRatePercent / 100)
        },
        {
          action: 'Consider income-driven repayment',
          when: projectedIncome < phaseoutThreshold,
          benefit: 'Lower payments + full deduction at lower bracket',
          estimatedTaxSavings: roundMoney(Math.min(totalStudentLoanInterest, 2500) * Math.max(10, taxProfile.estimatedTaxRatePercent - 5) / 100)
        }
      ]
    };
  }

  /**
   * Simulate different payoff sequences and calculate tax impact
   */
  simulatePayoffSequence(debts, taxProfile, sequence) {
    let totalInterest = 0;
    let totalTaxBenefit = 0;
    const timeline = [];

    for (let month = 1; month <= 360; month++) {
      let monthlyInterest = 0;
      let monthlyPayment = 0;

      debts.forEach(debt => {
        if (debt.balance > 0) {
          const monthlyRate = debt.apr / 100 / 12;
          const monthlyInterestAmount = debt.balance * monthlyRate;
          monthlyInterest += monthlyInterestAmount;
          monthlyPayment += debt.monthlyPayment;
          debt.balance = roundMoney(debt.balance + monthlyInterestAmount - debt.monthlyPayment);
        }
      });

      totalInterest = roundMoney(totalInterest + monthlyInterest);

      // Student loan interest deduction benefit (simplified annual)
      if (month % 12 === 0) {
        const studentLoanInterest = debts
          .filter(d => d.isStudentLoan && d.balance > 0)
          .reduce((sum, d) => sum + d.annualInterestDue, 0);
        const deduction = Math.min(studentLoanInterest, 2500);
        const taxBenefit = deduction * taxProfile.estimatedTaxRatePercent / 100;
        totalTaxBenefit = roundMoney(totalTaxBenefit + taxBenefit);
      }

      if (debts.every(d => d.balance <= 0)) {
        break;
      }
    }

    return {
      sequenceName: sequence || 'Current',
      totalInterest: roundMoney(totalInterest),
      totalTaxBenefit: roundMoney(totalTaxBenefit),
      netCost: roundMoney(totalInterest - totalTaxBenefit),
      months: timeline.length,
      studentLoanTaxAdvantage: roundMoney(totalTaxBenefit)
    };
  }

  /**
   * Main orchestrator: Build comprehensive tax-smart payoff plan
   */
  plan(debts, taxProfile, refunds = {}, lumpSumPlans = {}) {
    // Normalize inputs
    const normalizedDebts = debts.map(d => this.normalizeDebt(d));
    const normalizedTaxProfile = this.normalizeTaxProfile(taxProfile);

    if (normalizedDebts.length === 0) {
      return {
        debts: [],
        taxProfile: normalizedTaxProfile,
        plan: null,
        error: 'No debts provided'
      };
    }

    // Analyze tax profile benefits
    const taxBenefits = this.calculateTaxBenefitProfile(normalizedDebts, normalizedTaxProfile);

    // Rank debts by tax efficiency
    const rankedDebts = this.rankDebtsByTaxEfficiency(normalizedDebts, normalizedTaxProfile);

    // Recommend refund deployment
    const refundStrategy = this.recommendRefundDeployment(
      rankedDebts,
      normalizedTaxProfile
    );

    // Check student loan deferral opportunities
    const studentLoans = normalizedDebts.filter(d => d.isStudentLoan);
    const deferralOpportunities = this.recommendStudentLoanDeferralImpact(
      studentLoans,
      normalizedTaxProfile
    );

    // Build lump-sum timing recommendations
    const lumpSumRecommendations = rankedDebts.map(debt => 
      this.recommendLumpSumTiming(debt, normalizedTaxProfile, lumpSumPlans[debt.id] || 0)
    );

    return {
      debts: rankedDebts,
      taxProfile: normalizedTaxProfile,
      plan: {
        strategySummary: {
          priorityRanking: rankedDebts.map((d, idx) => ({
            rank: idx + 1,
            debtId: d.id,
            debtName: d.name,
            type: d.type,
            apr: d.apr,
            balance: d.balance,
            priorityScore: roundPercent(d.priorityScore),
            reason: d.isStudentLoan ? 'Student loan - preserve deduction benefit' : `High APR (${d.apr}%) - prioritize payoff`
          })),
          taxBenefits,
          refundDeploymentStrategy: refundStrategy,
          studentLoanConsiderations: deferralOpportunities,
          lumpSumTiming: lumpSumRecommendations
        },
        recommendations: [
          {
            priority: 1,
            title: 'Payoff Sequence',
            description: `Pay debts in order: ${rankedDebts.map(d => d.name).join(' → ')}`,
            expectedInterestSavings: roundMoney(rankedDebts.reduce((sum, d) => sum + d.costProfile.totalInterest, 0)),
            taxBenefitsRetained: taxBenefits.taxSavingsFromDeductions
          },
          {
            priority: 2,
            title: 'Deploy Tax Refund',
            description: refundStrategy.recommendations.map((r, i) => 
              `${i + 1}. ${r.action}${r.deploymentAmount ? ` ($${r.deploymentAmount})` : ''}`
            ).join('; '),
            estimatedSavings: refundStrategy.recommendations.reduce((sum, r) => sum + (r.totalBenefit || 0), 0)
          },
          {
            priority: 3,
            title: 'Student Loan Strategy',
            description: deferralOpportunities.shouldConsiderDeferral 
              ? 'Consider income-driven repayment if income drops'
              : 'Maintain current payment level - good deduction benefit',
            estimatedTaxBenefit: taxBenefits.studentLoanInterestDeduction
          },
          {
            priority: 4,
            title: 'Lump-Sum Payment Timing',
            description: 'Year-end (December) preferred for annual deduction tracking',
            note: 'Engage tax professional for large payments (>$10k) in variable income years'
          }
        ],
        estimatedOutcome: {
          totalDebtBalance: roundMoney(normalizedDebts.reduce((sum, d) => sum + d.balance, 0)),
          totalInterestWithoutOptimization: roundMoney(normalizedDebts.reduce((sum, d) => sum + d.annualInterestDue * 10, 0)), // rough 10-year estimate
          totalTaxBenefitsAvailable: taxBenefits.taxSavingsFromDeductions,
          taxRefundDeploymentValue: refundStrategy.recommendations.reduce((sum, r) => sum + (r.totalBenefit || 0), 0),
          netSavingsFromTaxOptimization: roundMoney(
            taxBenefits.taxSavingsFromDeductions + 
            refundStrategy.recommendations.reduce((sum, r) => sum + (r.totalBenefit || 0), 0)
          )
        }
      }
    };
  }
}

module.exports = new TaxSmartDebtSequencerService();
