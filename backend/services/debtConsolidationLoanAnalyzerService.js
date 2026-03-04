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
 * Debt Consolidation Loan Analyzer
 * Compares consolidation loan offers against stay-the-course baseline:
 * - Models do-nothing baseline (sequential payoff of current debts)
 * - Calculates total consolidation cost (fees, origination, closing, interest)
 * - Compares timelines and total interest paid
 * - Identifies red flags (excessive fees, extended terms, higher APR)
 * - Recommends debt kill-order alternative to consolidation
 * - Quantifies psychology benefit (single payment) vs cost penalty
 */
class DebtConsolidationLoanAnalyzerService {
  /**
   * Normalize debt input
   */
  normalizeDebt(debt) {
    return {
      id: debt.id || `debt_${Math.random()}`,
      name: debt.name || 'Debt',
      balance: roundMoney(debt.balance || debt.currentBalance),
      currentBalance: roundMoney(debt.currentBalance || debt.balance),
      apr: roundPercent(debt.apr),
      minimumPayment: roundMoney(debt.minimumPayment),
      monthsRemaining: clamp(toNumber(debt.monthsRemaining), 1, 360),
      type: debt.type || 'personal-loan'
    };
  }

  /**
   * Calculate weighted average APR across all debts
   */
  calculateWeightedAverageAPR(debts) {
    if (debts.length === 0) return 0;

    const totalBalance = debts.reduce((sum, d) => sum + d.currentBalance, 0);
    if (totalBalance === 0) return 0;

    const weightedAPR = debts.reduce((sum, d) => {
      return sum + (d.apr * (d.currentBalance / totalBalance));
    }, 0);

    return roundPercent(weightedAPR);
  }

  /**
   * Calculate total minimum payment across all debts
   */
  calculateTotalMinimumPayment(debts) {
    return roundMoney(debts.reduce((sum, d) => sum + d.minimumPayment, 0));
  }

  /**
   * Simulate do-nothing baseline: current debts paid sequentially
   */
  simulateDoNothingBaseline(debts, monthlyExtraPayment = 0) {
    // Sort by APR descending (avalanche strategy as baseline)
    const sorted = [...debts].map(d => ({ ...d })).sort((a, b) => b.apr - a.apr);
    
    let totalInterestPaid = 0;
    let monthsPassed = 0;
    const payoffTimeline = [];
    const debtsPaidOff = [];

    // Simulate month by month
    while (sorted.some(d => d.currentBalance > 0.01) && monthsPassed < 600) {
      monthsPassed++;

      // Calculate interest and payments
      for (const debt of sorted) {
        if (debt.currentBalance > 0.01) {
          const monthlyRate = debt.apr / 100 / 12;
          const interest = roundMoney(debt.currentBalance * monthlyRate);
          const payment = Math.min(debt.currentBalance + interest, debt.minimumPayment + monthlyExtraPayment);
          
          totalInterestPaid += interest;
          debt.currentBalance = Math.max(0, roundMoney(debt.currentBalance + interest - payment));

          if (debt.currentBalance <= 0.01 && !debtsPaidOff.find(d => d.id === debt.id)) {
            debtsPaidOff.push({
              debtId: debt.id,
              debtName: debt.name,
              paidOffMonth: monthsPassed
            });
          }
        }
      }

      // Record yearly milestones
      if (monthsPassed % 12 === 0 || debtsPaidOff.length > 0) {
        payoffTimeline.push({
          month: monthsPassed,
          year: Math.ceil(monthsPassed / 12),
          totalInterest: roundMoney(totalInterestPaid),
          debtsPaidOff: debtsPaidOff.length
        });
      }
    }

    return {
      totalInterestPaid: roundMoney(totalInterestPaid),
      payoffTimelineMonths: monthsPassed,
      payoffTimelineYears: roundPercent(monthsPassed / 12),
      debtsPaidOffCount: debtsPaidOff.length,
      payoffTimeline,
      monthlyPaymentRequired: this.calculateTotalMinimumPayment(debts)
    };
  }

  /**
   * Simulate consolidation loan scenario
   */
  simulateConsolidationLoan(debts, consolidationOffer, monthlyExtraPayment = 0) {
    // Total consolidated balance
    const totalBalance = debts.reduce((sum, d) => sum + d.currentBalance, 0);
    
    // Calculate fees
    const originationFee = roundMoney(totalBalance * (consolidationOffer.originationFeePercent / 100));
    const closingCosts = roundMoney(consolidationOffer.closingCosts || 0);
    const totalFees = roundMoney(originationFee + closingCosts);

    // Create consolidation loan
    const consolidatedBalance = roundMoney(totalBalance + totalFees);
    const consolidationAPR = roundPercent(consolidationOffer.apr);
    const consolidationTermMonths = clamp(toNumber(consolidationOffer.termMonths), 1, 360);

    // Calculate consolidation monthly payment
    const monthlyRate = consolidationAPR / 100 / 12;
    const monthlyPayment = consolidatedBalance > 0
      ? roundMoney(
          consolidatedBalance * 
          (monthlyRate * Math.pow(1 + monthlyRate, consolidationTermMonths)) / 
          (Math.pow(1 + monthlyRate, consolidationTermMonths) - 1)
        )
      : 0;

    // Simulate payoff
    let balance = consolidatedBalance;
    let totalInterestPaid = 0;
    let monthsPassed = 0;
    const payoffTimeline = [];

    while (balance > 0.01 && monthsPassed < consolidationTermMonths) {
      monthsPassed++;
      const interest = roundMoney(balance * monthlyRate);
      const payment = Math.min(monthlyPayment + monthlyExtraPayment, balance + interest);
      
      totalInterestPaid += interest;
      balance = Math.max(0, roundMoney(balance + interest - payment));

      if (monthsPassed % 12 === 0) {
        payoffTimeline.push({
          month: monthsPassed,
          year: Math.ceil(monthsPassed / 12),
          remainingBalance: balance,
          totalInterest: roundMoney(totalInterestPaid)
        });
      }
    }

    // Total cost of consolidation: fees + interest
    const totalConsolidationCost = roundMoney(totalFees + totalInterestPaid);

    return {
      consolidationAPR,
      consolidationTermMonths,
      consolidatedBalance,
      originationFee,
      closingCosts,
      totalFees,
      monthlyPayment,
      totalInterestPaid: roundMoney(totalInterestPaid),
      totalCost: totalConsolidationCost,
      payoffTimelineMonths: monthsPassed,
      payoffTimelineYears: roundPercent(monthsPassed / 12),
      payoffTimeline
    };
  }

  /**
   * Identify red flags in consolidation offer
   */
  flagConsolidationRedFlags(debts, consolidationOffer, baseline) {
    const flags = [];

    // Red flag 1: High fees (>5%)
    const originationFee = toNumber(consolidationOffer.originationFeePercent) || 0;
    const totalBalance = debts.reduce((sum, d) => sum + d.currentBalance, 0);
    const feePercent = (originationFee + (consolidationOffer.closingCosts || 0) / totalBalance * 100);
    
    if (originationFee > 5) {
      flags.push({
        severity: 'HIGH',
        flag: `High origination fee (${originationFee}%)`,
        impact: `Add $${roundMoney(totalBalance * (originationFee / 100))} to loan balance`,
        recommendation: 'Negotiate lower fee or seek alternative consolidator'
      });
    }

    if (feePercent > 8) {
      flags.push({
        severity: 'HIGH',
        flag: `Total fees exceed 8% of balance (${roundPercent(feePercent)}%)`,
        impact: 'Fees eating into savings benefit',
        recommendation: 'Compare with other offers'
      });
    }

    // Red flag 2: Extended term
    const termExtension = consolidationOffer.termMonths - baseline.payoffTimelineMonths;
    if (termExtension > 10) {
      flags.push({
        severity: 'MEDIUM',
        flag: `Term extended by ${termExtension} months`,
        impact: `Payoff delayed from ${baseline.payoffTimelineMonths} to ${consolidationOffer.termMonths} months`,
        recommendation: `More interest accrual over extended timeline. Consider paying more monthly.`
      });
    }

    // Red flag 3: APR higher than weighted average
    const weightedAPR = this.calculateWeightedAverageAPR(debts);
    const consolidationAPR = roundPercent(consolidationOffer.apr);
    if (consolidationAPR > weightedAPR + 0.5) {
      flags.push({
        severity: 'HIGH',
        flag: `APR higher than current average (${consolidationAPR}% vs ${weightedAPR}%)`,
        impact: `Paying more interest despite consolidation benefit`,
        recommendation: 'Reject offer, seek lower-rate consolidator'
      });
    }

    // Red flag 4: Total cost of consolidation vs baseline
    const consolidationCost = this.simulateConsolidationLoan(debts, consolidationOffer);
    const baselineCost = baseline.totalInterestPaid;
    const additionalCost = consolidationCost.totalCost - baselineCost;

    if (additionalCost > 0) {
      flags.push({
        severity: 'MEDIUM',
        flag: `Consolidation costs MORE than staying course`,
        impact: `Additional $${roundMoney(additionalCost)} in fees + interest vs baseline`,
        recommendation: 'Reject consolidation, maintain current payoff plan or refinance high-APR debts'
      });
    }

    return flags;
  }

  /**
   * Compare consolidation to alternative: aggressive payoff of highest-APR debts
   */
  compareToDebtKillOrder(debts, consolidationOffer, monthlyExtraPayment = 0) {
    // Model: pay down high-APR debts aggressively with same monthly budget
    const consolidation = this.simulateConsolidationLoan(debts, consolidationOffer, monthlyExtraPayment);
    const baseline = this.simulateDoNothingBaseline(debts, monthlyExtraPayment);

    const savings = roundMoney(consolidation.totalCost - baseline.totalInterestPaid);
    const timeDifference = consolidation.payoffTimelineMonths - baseline.payoffTimelineMonths;

    return {
      consolidationTotalCost: roundMoney(consolidation.totalCost),
      baselineTotalCost: baseline.totalInterestPaid,
      savingsWithConsolidation: savings > 0 ? 0 : roundMoney(Math.abs(savings)),
      costWithConsolidation: savings < 0 ? roundMoney(Math.abs(savings)) : 0,
      consolidationMonths: consolidation.payoffTimelineMonths,
      baselineMonths: baseline.payoffTimelineMonths,
      timeDifference,
      recommendation: savings > 100
        ? `Consolidation saves $${savings} vs aggressive payoff - worth considering`
        : `Aggressive debt payoff saves $${Math.abs(savings)} vs consolidation - better strategy`
    };
  }

  /**
   * Calculate psychology benefit of consolidation (single payment)
   */
  calculatePsychologyBenefit(debts, consolidationOffer) {
    const currentPaymentCount = debts.length;
    const consolidatedPaymentCount = 1;
    const paymentReduction = currentPaymentCount - consolidatedPaymentCount;

    // Estimate psychology benefit value
    // Assumption: each additional payment to track = 5-10% likelihood of being late/missed
    const currentMissPaymentRisk = (currentPaymentCount - 1) * 0.05; // Each extra payment = 5% miss risk
    const consolidatedMissPaymentRisk = 0; // Single payment easier to track

    const psychologyBenefit = {
      reducedPaymentCount: paymentReduction,
      easierTracking: 'Single payment vs multiple',
      missPaymentRiskReduction: roundPercent(currentMissPaymentRisk * 100),
      estimatedPsychologyValue: `Reduced $${roundMoney(100 * paymentReduction)} in "mental cost"`,
      recommendation: `Psychology benefit worth ~$${roundMoney(100 * paymentReduction)}/month for some users`
    };

    return psychologyBenefit;
  }

  /**
   * Generate consolidation analysis summary
   */
  analyze(debts, consolidationOffer, monthlyExtraPayment = 0) {
    // Normalize inputs
    const normalizedDebts = debts.map(d => this.normalizeDebt(d));

    if (normalizedDebts.length === 0) {
      return { error: 'No debts provided' };
    }

    if (!consolidationOffer || !consolidationOffer.apr) {
      return { error: 'Consolidation offer with APR required' };
    }

    // Calculate baseline (do-nothing)
    const baseline = this.simulateDoNothingBaseline(normalizedDebts, monthlyExtraPayment);

    // Simulate consolidation
    const consolidation = this.simulateConsolidationLoan(normalizedDebts, consolidationOffer, monthlyExtraPayment);

    // Calculate net benefit
    const totalBaselineCost = baseline.totalInterestPaid;
    const totalConsolidationCost = consolidation.totalCost;
    const netBenefit = roundMoney(totalBaselineCost - totalConsolidationCost);
    const breakeven = consolidation.payoffTimelineMonths;

    // Red flags
    const redFlags = this.flagConsolidationRedFlags(normalizedDebts, consolidationOffer, baseline);

    // Alternative strategy
    const comparison = this.compareToDebtKillOrder(normalizedDebts, consolidationOffer, monthlyExtraPayment);

    // Psychology benefit
    const psychologyBenefit = this.calculatePsychologyBenefit(normalizedDebts, consolidationOffer);

    // Weighted average APR
    const weightedAPR = this.calculateWeightedAverageAPR(normalizedDebts);

    // Recommendation
    let recommendation = 'REJECT';
    let rationale = '';

    if (netBenefit > 500) {
      recommendation = 'ACCEPT';
      rationale = `Consolidation saves $${netBenefit} despite ${consolidationOffer.originationFeePercent}% fee`;
    } else if (netBenefit > 0 && redFlags.filter(f => f.severity === 'HIGH').length === 0) {
      recommendation = 'CONSIDER';
      rationale = `Modest savings of $${netBenefit} + psychology benefit (single payment)`;
    } else if (redFlags.some(f => f.flag.includes('higher'))) {
      recommendation = 'REJECT';
      rationale = 'APR higher than current average - refinance high-APR debts instead';
    } else if (redFlags.some(f => f.flag.includes('extended'))) {
      recommendation = 'REJECT';
      rationale = 'Extended term outweighs savings - maintain aggressive payoff';
    } else {
      recommendation = 'REJECT';
      rationale = redFlags.length > 0 
        ? `Multiple red flags: ${redFlags.map(f => f.flag).join(', ')}`
        : 'Debt kill-order strategy better than consolidation';
    }

    return {
      debts: normalizedDebts.map(d => ({
        id: d.id,
        name: d.name,
        balance: d.currentBalance,
        apr: d.apr,
        minimumPayment: d.minimumPayment
      })),
      baseline: {
        strategy: 'Stay-the-Course (Avalanche)',
        totalInterestPaid: baseline.totalInterestPaid,
        payoffTimelineMonths: baseline.payoffTimelineMonths,
        payoffTimelineYears: baseline.payoffTimelineYears,
        monthlyPaymentRequired: baseline.monthlyPaymentRequired,
        debtsPaidOffCount: baseline.debtsPaidOffCount,
        payoffTimeline: baseline.payoffTimeline.slice(0, 5) // First 5 years
      },
      consolidationOffer: {
        apr: consolidation.consolidationAPR,
        termMonths: consolidation.consolidationTermMonths,
        consolidatedBalance: consolidation.consolidatedBalance,
        originationFee: consolidation.originationFee,
        closingCosts: consolidation.closingCosts,
        totalFees: consolidation.totalFees,
        monthlyPayment: consolidation.monthlyPayment,
        totalInterestPaid: consolidation.totalInterestPaid,
        totalCost: consolidation.totalCost,
        payoffTimeline: consolidation.payoffTimeline.slice(0, 5) // First 5 years
      },
      comparison: {
        baselineTotalCost: totalBaselineCost,
        consolidationTotalCost: totalConsolidationCost,
        netBenefit: netBenefit > 0 ? netBenefit : 0,
        netCost: netBenefit < 0 ? roundMoney(Math.abs(netBenefit)) : 0,
        timelineDifference: consolidation.payoffTimelineMonths - baseline.payoffTimelineMonths,
        breakeven: breakeven > 0 ? breakeven : null
      },
      redFlags: redFlags.length > 0 ? redFlags : [],
      psychologyBenefit,
      recommendation: {
        decision: recommendation,
        rationale,
        netBenefit,
        expectedMonthlyPayment: consolidation.monthlyPayment,
        alternativeStrategyBenefit: comparison.recommendation
      },
      summary: {
        currentWeightedAPR: weightedAPR,
        consolidationAPR: consolidation.consolidationAPR,
        aprComparison: consolidation.consolidationAPR < weightedAPR ? 'Lower' : 'Higher/Same',
        baselinePayoffMonths: baseline.payoffTimelineMonths,
        consolidationPayoffMonths: consolidation.payoffTimelineMonths,
        savesByConsolidating: netBenefit > 0 ? netBenefit : 0,
        costByConsolidating: netBenefit < 0 ? roundMoney(Math.abs(netBenefit)) : 0,
        highRiskFlags: redFlags.filter(f => f.severity === 'HIGH').length,
        mediumRiskFlags: redFlags.filter(f => f.severity === 'MEDIUM').length
      }
    };
  }
}

module.exports = new DebtConsolidationLoanAnalyzerService();
