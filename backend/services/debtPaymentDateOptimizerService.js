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
 * Debt Payment Date Optimizer
 * Optimizes payment timing to maximize interest savings and reduce late fees by:
 * - Analyzing paycheck cadence (weekly, biweekly, monthly)
 * - Aligning payments with statement cycles
 * - Detecting late-fee risk windows
 * - Recommending split-pay strategies for biweekly income
 * - Simulating interest impact of date shifts
 */
class DebtPaymentDateOptimizerService {
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
      type: debt.type || 'credit-card', // credit-card, auto-loan, student-loan, personal-loan, mortgage
      dueDate: clamp(toNumber(debt.dueDate), 1, 31), // day of month (1-31)
      statementCloseDate: clamp(toNumber(debt.statementCloseDate), 1, 31), // day of month (1-31)
      gracePeriodDays: clamp(toNumber(debt.gracePeriodDays) || 21, 0, 60),
      dailyInterestRate: roundPercent(debt.apr / 365)
    };
  }

  /**
   * Normalize income/paycheck schedule
   */
  normalizeIncomeSchedule(schedule) {
    return {
      frequency: schedule.frequency || 'biweekly', // weekly, biweekly, semimonthly, monthly
      paycheckAmount: roundMoney(schedule.paycheckAmount),
      nextPaycheckDate: clamp(toNumber(schedule.nextPaycheckDate), 1, 31),
      paycheckDates: Array.isArray(schedule.paycheckDates) 
        ? schedule.paycheckDates.map(d => clamp(toNumber(d), 1, 31))
        : [],
      variableIncome: roundMoney(Math.abs(toNumber(schedule.variableIncome))),
      paymentCapacity: roundMoney(schedule.paymentCapacity || schedule.paycheckAmount * 0.4) // % of paycheck available for debt
    };
  }

  /**
   * Calculate days until due date from reference date
   */
  daysUntilDue(referenceDay, dueDay) {
    if (dueDay >= referenceDay) {
      return dueDay - referenceDay;
    }
    return 30 - referenceDay + dueDay; // assume 30-day month
  }

  /**
   * Calculate late fee risk based on days before due date
   */
  calculateLateFeeRisk(debt, paymentDay) {
    const daysBefore = this.daysUntilDue(paymentDay, debt.dueDate);
    const daysAfterGracePeriod = Math.max(0, debt.gracePeriodDays - daysBefore);

    return {
      paymentDay,
      daysBefore,
      isBefore: daysBefore >= 0,
      isInGracePeriod: daysBefore >= 0 && daysBefore <= debt.gracePeriodDays,
      daysAfterGracePeriod,
      lateFeeRisk: daysAfterGracePeriod > 0 ? 'HIGH' : (daysBefore < 5 ? 'MEDIUM' : 'LOW'),
      estimatedLateFee: daysAfterGracePeriod > 0 ? Math.min(35, debt.minimumPayment * 0.05) : 0
    };
  }

  /**
   * Analyze statement cycle and recommend pre-statement payment window
   */
  analyzeStatementCycle(debt) {
    // Best practice: pay before statement close to reduce reported balance (credit score benefit)
    // Alternative: pay after statement close to reduce interest accrual before closing
    const daysBeforeStatementClose = debt.statementCloseDate > 1 ? debt.statementCloseDate - 1 : 30;

    return {
      statementCloseDate: debt.statementCloseDate,
      creditScoreBenefitWindow: `Day 1 to Day ${Math.max(1, debt.statementCloseDate - 3)}`,
      creditScoreBenefit: 'Lower reported balance at statement close = higher credit score',
      interestMinimizationWindow: `Day ${debt.statementCloseDate + 1} to end of month`,
      interestMinimizationBenefit: 'Pay after close to reduce days of interest accrual',
      recommendedWindow: `Days ${Math.max(1, debt.statementCloseDate - 5)} to ${debt.statementCloseDate - 1}`,
      recommendation: 'Pay 5 days before statement close for balance reporting benefit'
    };
  }

  /**
   * Suggest optimal payment dates based on paycheck schedule
   */
  recommendOptimalPaymentDates(debt, incomeSchedule) {
    const recommendations = [];

    // Strategy 1: Pay immediately after paycheck
    for (const paycheckDay of incomeSchedule.paycheckDates) {
      const lateRisk = this.calculateLateFeeRisk(debt, paycheckDay);
      recommendations.push({
        strategy: 'Pay immediately after paycheck',
        paymentDay: paycheckDay,
        timing: `${paycheckDay}${paycheckDay % 10 === 1 ? 'st' : paycheckDay % 10 === 2 ? 'nd' : paycheckDay % 10 === 3 ? 'rd' : 'th'} of month`,
        daysBeforeDue: lateRisk.daysBefore,
        lateFeeRisk: lateRisk.lateFeeRisk,
        lateFeeProbability: lateRisk.estimatedLateFee > 0 ? 'HIGH' : 'LOW',
        creditScoreBenefit: lateRisk.isInGracePeriod ? 'Moderate (within grace period)' : 'High (before due date)',
        priorityScore: (lateRisk.isInGracePeriod ? 100 : 0) + (lateRisk.daysBefore >= 5 ? 50 : 0),
        rationale: `Ensures payment arrives before grace period ends (${debt.gracePeriodDays} days)`
      });
    }

    // Strategy 2: Pay on statement close date (for credit score optimization)
    if (incomeSchedule.paycheckDates.some(d => d <= debt.statementCloseDate)) {
      recommendations.push({
        strategy: 'Pay before statement close',
        paymentDay: Math.min(...incomeSchedule.paycheckDates.filter(d => d <= debt.statementCloseDate)),
        timing: `On or before statement close (Day ${debt.statementCloseDate})`,
        daysBeforeDue: this.daysUntilDue(Math.min(...incomeSchedule.paycheckDates), debt.dueDate),
        lateFeeRisk: 'LOW',
        creditScoreBenefit: 'High (reported balance reduced)',
        priorityScore: 150,
        rationale: 'Reduces reported balance for credit score; pay after paycheck but before statement close'
      });
    }

    // Strategy 3: Pay 2-3 days before due date (safety margin)
    const safePaymentDay = Math.max(1, debt.dueDate - 3);
    recommendations.push({
      strategy: 'Pay before due date (safety margin)',
      paymentDay: safePaymentDay,
      timing: `${safePaymentDay}${safePaymentDay % 10 === 1 ? 'st' : safePaymentDay % 10 === 2 ? 'nd' : safePaymentDay % 10 === 3 ? 'rd' : 'th'} of month`,
      daysBeforeDue: 3,
      lateFeeRisk: 'LOW',
      creditScoreBenefit: 'Moderate',
      priorityScore: 120,
      rationale: 'Provides 2-3 day buffer before due date; accommodation for mail delays'
    });

    return recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Recommend split-pay strategy for biweekly income
   */
  recommendSplitPayStrategy(debt, incomeSchedule) {
    if (incomeSchedule.frequency !== 'biweekly' && incomeSchedule.frequency !== 'weekly') {
      return {
        strategyApplicable: false,
        reason: 'Split-pay strategy recommended only for weekly/biweekly income',
        recommendations: []
      };
    }

    const paymentCapacityPerPaycheck = incomeSchedule.paymentCapacity / incomeSchedule.paycheckDates.length;
    const minimumPaymentPerPaycheck = debt.minimumPayment / Math.ceil(incomeSchedule.paycheckDates.length);

    // Strategy: Split minimum payment into 2-4 micro-payments
    return {
      strategyApplicable: true,
      frequency: incomeSchedule.frequency,
      paycheckDates: incomeSchedule.paycheckDates,
      recommendedSplitCount: Math.min(incomeSchedule.paycheckDates.length, Math.ceil(debt.minimumPayment / paymentCapacityPerPaycheck)),
      recommendations: [
        {
          splitCount: 2,
          paymentPerSplit: roundMoney(debt.monthlyPayment / 2),
          paymentDates: incomeSchedule.paycheckDates.slice(0, 2),
          benefit: 'Reduces balance faster → lower interest accrual',
          interestSavingsPercent: roundPercent(2 * debt.apr / 365 / 30 * 100), // rough estimate
          creditScoreBenefit: 'Multiple low utilization reports per month',
          complexity: 'Low (2 payments/month)',
          feasibility: paymentCapacityPerPaycheck >= debt.monthlyPayment / 2 ? 'HIGH' : 'MEDIUM'
        },
        {
          splitCount: 4,
          paymentPerSplit: roundMoney(debt.monthlyPayment / 4),
          paymentDates: incomeSchedule.paycheckDates,
          benefit: 'Maximizes interest savings; best for high-APR debt',
          interestSavingsPercent: roundPercent(4 * debt.apr / 365 / 30 * 100), // rough estimate
          creditScoreBenefit: 'Excellent utilization reports; multiple payment activity',
          complexity: 'Medium (4 payments/month)',
          feasibility: paymentCapacityPerPaycheck >= debt.monthlyPayment / 4 ? 'HIGH' : 'MEDIUM'
        }
      ],
      monthlyMinimumFullyMet: debt.monthlyPayment,
      monthlyOptimalWithSplits: roundMoney(debt.monthlyPayment * 1.25),
      riskMitigation: 'Failed payment easier to recover from (4 small payments vs 1 large)'
    };
  }

  /**
   * Simulate interest impact of different payment dates
   */
  simulatePaymentDateImpact(debt, paymentDates) {
    const scenarios = [];

    for (const paymentDay of paymentDates) {
      // Calculate average daily balance and interest
      let cumulativeInterest = 0;
      let daysInCycle = 0;

      // Simulate 12-month cycle
      for (let month = 1; month <= 12; month++) {
        const daysBeforePayment = paymentDay - 1; // days interest accrues before payment
        const daysAfterPayment = 30 - paymentDay; // days at reduced balance

        const interestBeforePayment = (debt.balance * (debt.dailyInterestRate / 100) * daysBeforePayment);
        const balanceAfterPayment = Math.max(0, debt.balance - debt.monthlyPayment);
        const interestAfterPayment = (balanceAfterPayment * (debt.dailyInterestRate / 100) * daysAfterPayment);

        cumulativeInterest += interestBeforePayment + interestAfterPayment;
        daysInCycle += 30;

        if (balanceAfterPayment <= 0) break;
      }

      scenarios.push({
        paymentDay,
        monthlyInterestCost: roundMoney(cumulativeInterest / 12),
        annualInterestCost: roundMoney(cumulativeInterest),
        comparisonToEarliestDay: roundMoney(cumulativeInterest - (scenarios[0]?.annualInterestCost || cumulativeInterest))
      });
    }

    // Find optimal day (lowest interest)
    const optimal = scenarios.reduce((best, current) => 
      current.annualInterestCost < best.annualInterestCost ? current : best
    );

    return {
      scenarios,
      optimalDay: optimal.paymentDay,
      annualInterestSavings: roundMoney(
        Math.max(...scenarios.map(s => s.annualInterestCost)) - optimal.annualInterestCost
      ),
      monthlyInterestSavings: roundMoney(
        Math.max(...scenarios.map(s => s.monthlyInterestCost)) - optimal.monthlyInterestCost
      )
    };
  }

  /**
   * Flag critical dates and risk windows
   */
  flagRiskWindows(debt, incomeSchedule) {
    const risks = [];

    // Risk 1: Payment arrives after due date
    const lastPaycheckDay = Math.max(...incomeSchedule.paycheckDates);
    if (lastPaycheckDay + 2 > debt.dueDate) {
      // 2-day processing window assumed
      risks.push({
        severity: 'HIGH',
        riskType: 'Late Payment Risk',
        description: `Last paycheck (Day ${lastPaycheckDay}) may not clear before due date (Day ${debt.dueDate}) with standard 2-3 day processing`,
        affectedDebtName: debt.name,
        estimatedLateFee: Math.min(35, debt.minimumPayment * 0.05),
        creditScore: 'Can drop 40-100 points',
        mitigation: `Switch to earliest paycheck (Day ${Math.min(...incomeSchedule.paycheckDates)}) or request due date change`
      });
    }

    // Risk 2: Large payment drain before next paycheck
    const maxPaymentCapacity = incomeSchedule.paymentCapacity;
    if (debt.monthlyPayment > maxPaymentCapacity) {
      risks.push({
        severity: 'MEDIUM',
        riskType: 'Inadequate Income Coverage',
        description: `Monthly payment (${roundPercent(debt.monthlyPayment / incomeSchedule.paycheckAmount * 100)}% of paycheck) may strain budget`,
        affectedDebtName: debt.name,
        paymentAsPercentOfIncome: roundPercent(debt.monthlyPayment / incomeSchedule.paycheckAmount * 100),
        recommendation: `Consider split-pay (2x per month) to spread payment across paychecks`,
        alternative: 'Request payment reduction or extend loan term'
      });
    }

    // Risk 3: Multiple large payments clustered
    if (debt.dueDate >= 20 && debt.dueDate <= 28) {
      risks.push({
        severity: 'LOW',
        riskType: 'End-of-Month Payment Cluster',
        description: `Payment due near end of month; other bills may also cluster here`,
        affectedDebtName: debt.name,
        recommendation: `Request due date change to earlier in month (Day 5-10) to spread payment schedule`,
        alternative: 'Use split-pay strategy to move some payment to earlier in cycle'
      });
    }

    return risks;
  }

  /**
   * Main orchestrator: Generate optimized payment schedule
   */
  optimize(debts, incomeSchedule, paymentDateOverrides = {}) {
    // Normalize inputs
    const normalizedDebts = debts.map(d => this.normalizeDebt(d));
    const normalizedSchedule = this.normalizeIncomeSchedule(incomeSchedule);

    if (normalizedDebts.length === 0 || !normalizedSchedule.paycheckAmount) {
      return {
        debts: [],
        incomeSchedule: normalizedSchedule,
        error: 'Invalid input: provide debts and income schedule'
      };
    }

    // Analyze statement cycles
    const statementAnalysis = normalizedDebts.map(d => ({
      debtId: d.id,
      debtName: d.name,
      cycle: this.analyzeStatementCycle(d)
    }));

    // Recommend optimal payment dates
    const paymentRecommendations = normalizedDebts.map(d => ({
      debtId: d.id,
      debtName: d.name,
      apr: d.apr,
      dueDate: d.dueDate,
      recommendations: this.recommendOptimalPaymentDates(d, normalizedSchedule).slice(0, 3)
    }));

    // Simulate interest impact
    const interestSimulations = normalizedDebts.map(d => ({
      debtId: d.id,
      debtName: d.name,
      balance: d.balance,
      simulation: this.simulatePaymentDateImpact(d, normalizedSchedule.paycheckDates)
    }));

    // Recommend split-pay strategies
    const splitPayRecommendations = normalizedDebts.map(d => ({
      debtId: d.id,
      debtName: d.name,
      strategy: this.recommendSplitPayStrategy(d, normalizedSchedule)
    }));

    // Flag risk windows
    const riskAssessment = normalizedDebts.map(d => ({
      debtId: d.id,
      debtName: d.name,
      risks: this.flagRiskWindows(d, normalizedSchedule)
    }));

    // Calculate total annual interest savings potential
    const totalAnnualInterestSavings = roundMoney(
      interestSimulations.reduce((sum, sim) => sum + sim.simulation.annualInterestSavings, 0)
    );

    return {
      debts: normalizedDebts,
      incomeSchedule: normalizedSchedule,
      analysis: {
        statementCycles: statementAnalysis,
        optimalPaymentDates: paymentRecommendations,
        interestImpactSimulations: interestSimulations,
        splitPayStrategies: splitPayRecommendations,
        riskAssessment: riskAssessment,
        priorityRanking: normalizedDebts
          .map((d, idx) => ({
            rank: idx + 1,
            debtId: d.id,
            debtName: d.name,
            apr: d.apr,
            balance: d.balance,
            recommendation: (interestSimulations[idx]?.simulation?.optimal || {}).paymentDay,
            lateFeeRisk: (riskAssessment[idx]?.risks?.length || 0) > 0 ? 'HIGH' : 'LOW'
          }))
          .sort((a, b) => {
            // Sort by risk first, then by APR
            const riskA = a.lateFeeRisk === 'HIGH' ? 1 : 0;
            const riskB = b.lateFeeRisk === 'HIGH' ? 1 : 0;
            if (riskA !== riskB) return riskB - riskA;
            return b.apr - a.apr;
          })
      },
      actionPlan: {
        summary: [
          {
            priority: 1,
            title: 'Align Payment Dates with Paycheck',
            description: `Pay debts within 1-2 days of paycheck receipt to ensure funds availability`,
            affectedDebts: normalizedDebts.map(d => d.name).join(', '),
            expectedBenefit: `Avoid late fees and payment failures`
          },
          {
            priority: 2,
            title: 'Optimize for Credit Score',
            description: `For credit-card debts, pay before statement close for lower reported balance`,
            affectedDebts: normalizedDebts.filter(d => d.type === 'credit-card').map(d => d.name).join(', ') || 'None',
            expectedBenefit: `Potential 10-40 point credit score improvement`
          },
          {
            priority: 3,
            title: 'Implement Split-Pay for High-APR Debt',
            description: `Split monthly payment into 2-4 micro-payments aligned with paycheck dates`,
            affectedDebts: normalizedDebts.filter(d => d.apr > 10).map(d => d.name).join(', ') || 'None',
            expectedBenefit: `Reduce annual interest by ${totalAnnualInterestSavings}`,
            exampleDebt: normalizedDebts.length > 0 ? normalizedDebts[0].name : null
          },
          {
            priority: 4,
            title: 'Negotiate Due Date Changes (if needed)',
            description: `Request creditors move due dates to align with your paycheck schedule`,
            requiredFor: riskAssessment.filter(r => r.risks.length > 0).map(r => r.debtName).join(', ') || 'None',
            expectedBenefit: `Eliminate late payment risk`
          }
        ],
        estimatedOutcomes: {
          annualInterestSavings: totalAnnualInterestSavings,
          monthlyInterestSavings: roundMoney(totalAnnualInterestSavings / 12),
          lateFeesAvoided: riskAssessment
            .filter(r => r.risks.length > 0)
            .reduce((sum, r) => sum + (r.risks[0]?.estimatedLateFee || 0), 0),
          creditScoreImprovementDays: 30,
          potentialCreditScoreGain: riskAssessment.filter(r => r.risks.length === 0).length * 15
        }
      }
    };
  }
}

module.exports = new DebtPaymentDateOptimizerService();
