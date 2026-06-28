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
 * Loan Prepayment Penalty Optimizer
 * Analyzes prepayment penalties and optimizes debt acceleration strategy:
 * - Detects penalty types (fixed, percent-of-balance, declining)
 * - Calculates penalty costs and expiration dates
 * - Models penalty cost vs interest savings tradeoff (2-5 year horizon)
 * - Prioritizes acceleration (avoid high-penalty debts until expiration)
 * - Recommends minimum accelerated amounts to avoid penalties
 * - Flags when penalty outweighs acceleration benefit
 */
class LoanPrepaymentPenaltyOptimizerService {
  /**
   * Normalize debt input with penalty details
   */
  normalizeDebt(debt) {
    return {
      id: debt.id || `debt_${Math.random()}`,
      name: debt.name || 'Loan',
      balance: roundMoney(debt.balance),
      currentBalance: roundMoney(debt.currentBalance || debt.balance),
      apr: roundPercent(debt.apr),
      monthlyPayment: roundMoney(debt.monthlyPayment),
      monthsRemaining: clamp(toNumber(debt.monthsRemaining), 1, 360),
      type: debt.type || 'auto-loan', // auto-loan, mortgage, student-loan, personal-loan, heloc
      // Prepayment penalty details
      hasPrepaymentPenalty: debt.hasPrepaymentPenalty === true,
      penaltyType: debt.penaltyType || 'none', // fixed, percent-of-balance, declining-schedule
      penaltyAmount: roundMoney(debt.penaltyAmount || 0), // Fixed dollar amount
      penaltyPercent: roundPercent(debt.penaltyPercent || 0), // % of remaining balance
      penaltyExpirationMonths: clamp(toNumber(debt.penaltyExpirationMonths), 0, 360), // Months until penalty expires
      penaltySchedule: Array.isArray(debt.penaltySchedule) ? debt.penaltySchedule : [], // Declining schedule [{month: X, percent: Y}]
      penaltyStartDate: debt.penaltyStartDate || null,
      penaltyEndDate: debt.penaltyEndDate || null,
      estimatedInterestSavingsPerMonth: roundMoney(debt.estimatedInterestSavingsPerMonth || 0)
    };
  }

  /**
   * Calculate prepayment penalty amount for given payoff scenario
   */
  calculatePenaltyAmount(debt, accelerationPayment) {
    if (!debt.hasPrepaymentPenalty) return 0;

    let penalty = 0;

    if (debt.penaltyType === 'fixed') {
      // Fixed dollar amount (e.g., $500 flat fee)
      penalty = debt.penaltyAmount;
    } else if (debt.penaltyType === 'percent-of-balance') {
      // Percent of remaining balance (e.g., 2% of remaining balance)
      const balanceAfterAcceleration = Math.max(0, debt.currentBalance - accelerationPayment);
      penalty = roundMoney(balanceAfterAcceleration * (debt.penaltyPercent / 100));
    } else if (debt.penaltyType === 'declining-schedule') {
      // Declining schedule based on payoff timeline
      // Schedule: [{month: 0-12, percent: 2.5}, {month: 12-24, percent: 1.5}, ...]
      if (debt.penaltySchedule.length > 0) {
        // Find applicable rate based on months of acceleration
        const accelerationMonths = Math.ceil(accelerationPayment / debt.monthlyPayment);
        let applicableRate = debt.penaltySchedule[0].percent || 0;
        
        for (const schedule of debt.penaltySchedule) {
          if (accelerationMonths <= schedule.month) {
            applicableRate = schedule.percent;
            break;
          }
        }

        const balanceAfterAcceleration = Math.max(0, debt.currentBalance - accelerationPayment);
        penalty = roundMoney(balanceAfterAcceleration * (applicableRate / 100));
      }
    }

    return Math.max(0, roundMoney(penalty));
  }

  /**
   * Analyze penalty cost vs interest savings over time horizon
   */
  analyzePenaltyTradeoff(debt, accelerationMonths) {
    const accelerationPayment = debt.monthlyPayment * accelerationMonths;
    const penaltyCost = this.calculatePenaltyAmount(debt, accelerationPayment);
    
    // Model interest savings from acceleration
    let interestSaved = 0;
    let balance = debt.currentBalance;
    const monthlyRate = debt.apr / 100 / 12;

    for (let month = 1; month <= debt.monthsRemaining; month++) {
      const interestCharge = balance * monthlyRate;
      
      // With acceleration
      const yearInAccelerationWindow = month <= accelerationMonths;
      const acceleratedPayment = yearInAccelerationWindow 
        ? debt.monthlyPayment + (accelerationPayment / accelerationMonths)
        : debt.monthlyPayment;

      const basePrincipal = debt.monthlyPayment - interestCharge;
      const acceleratedPrincipal = acceleratedPayment - interestCharge;
      const principalDifference = acceleratedPrincipal - basePrincipal;

      // Interest saved is approx: future months' worth of interest on extra principal paid
      const monthsRemaining = debt.monthsRemaining - month;
      interestSaved += principalDifference * monthlyRate * monthsRemaining;

      balance = Math.max(0, balance - acceleratedPayment);
      if (balance <= 0) break;
    }

    const netBenefit = roundMoney(interestSaved - penaltyCost);
    const breakeven = penaltyCost > 0 && interestSaved > 0
      ? Math.ceil((penaltyCost / (interestSaved / accelerationMonths)))
      : 0;

    return {
      accelerationMonths,
      accelerationAmount: roundMoney(accelerationPayment),
      penaltyCost,
      interestSaved: roundMoney(interestSaved),
      netBenefit,
      netBenefitPercent: roundPercent((netBenefit / (penaltyCost + interestSaved)) * 100 || 0),
      breakevenMonths: Math.max(0, breakeven),
      payoffTimeline: Math.max(0, debt.monthsRemaining - accelerationMonths),
      worthIt: netBenefit > 0,
      recommendation: netBenefit > 0
        ? `Accelerate for ${accelerationMonths} months. Net benefit: $${netBenefit}`
        : `Skip acceleration. Penalty cost ($${penaltyCost}) exceeds interest savings ($${interestSaved})`
    };
  }

  /**
   * Recommend optimal acceleration strategy considering penalties
   */
  recommendAccelerationStrategy(debt) {
    // Strategy 1: Accelerate before penalty expires (if applicable)
    let strategy1 = null;
    if (debt.hasPrepaymentPenalty && debt.penaltyExpirationMonths > 0) {
      // Accelerate after penalty expires
      const monthsUntilFree = debt.penaltyExpirationMonths;
      strategy1 = {
        priority: 1,
        strategy: 'Wait for penalty expiration, then accelerate',
        timeline: `In ${monthsUntilFree} months`,
        rationale: `Penalty expires after ${monthsUntilFree} months. Accelerate after expiration to avoid $${this.calculatePenaltyAmount(debt, debt.monthlyPayment)} cost.`,
        benefit: 'Zero penalty cost, full interest savings'
      };
    }

    // Strategy 2: Accelerate now despite penalty (if benefit > penalty)
    const tradeoff = this.analyzePenaltyTradeoff(debt, 12); // 12-month acceleration test
    if (tradeoff.worthIt && (!debt.hasPrepaymentPenalty || !strategy1)) {
      strategy1 = {
        priority: 1,
        strategy: 'Accelerate immediately',
        timeline: 'Now',
        accelerationAmount: tradeoff.accelerationAmount,
        penaltyCost: tradeoff.penaltyCost,
        interestSaved: tradeoff.interestSaved,
        netBenefit: tradeoff.netBenefit,
        rationale: `Net benefit of $${tradeoff.netBenefit} justifies acceleration despite $${tradeoff.penaltyCost} penalty.`,
        benefit: `Save $${tradeoff.netBenefit} in net interest`
      };
    }

    // Strategy 3: Minimal acceleration (avoid penalty trigger)
    if (debt.hasPrepaymentPenalty && debt.penaltyType !== 'none') {
      const minPayment = debt.monthlyPayment; // No acceleration
      const noAccelPenalty = this.calculatePenaltyAmount(debt, 0);
      
      strategy1 = strategy1 || {
        priority: 2,
        strategy: 'Stick with regular payments (avoid penalty)',
        timeline: 'Current plan',
        penaltyCost: 0,
        rationale: 'Penalty cost too high relative to savings. Maintain regular payment schedule.',
        benefit: 'No penalty, predictable timeline'
      };
    }

    return strategy1 || {
      priority: 1,
      strategy: 'Accelerate freely (no penalty)',
      timeline: 'Anytime',
      rationale: 'No prepayment penalty. Accelerate to save interest.',
      benefit: 'Maximum interest savings'
    };
  }

  /**
   * Prioritize debts by acceleration opportunity (no-penalty high-APR first)
   */
  prioritizeDebts(debts) {
    return debts
      .map(debt => {
        const strategy = this.recommendAccelerationStrategy(debt);
        
        // Priority score: no penalty + high APR = highest priority
        let priorityScore = 0;
        
        // Bonus for no penalty (easy to accelerate)
        if (!debt.hasPrepaymentPenalty) priorityScore += 100;
        
        // Bonus for high APR (savings worth more)
        priorityScore += debt.apr * 10;
        
        // Penalty if high penalty amount relative to balance
        if (debt.hasPrepaymentPenalty) {
          const penaltyRatio = debt.penaltyAmount / debt.currentBalance;
          priorityScore -= penaltyRatio * 50;
        }

        return {
          ...debt,
          strategy,
          priorityScore,
          canAccelerateSafely: !debt.hasPrepaymentPenalty || strategy.netBenefit > 0
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Calculate penalty expiration date
   */
  getPenaltyExpirationDate(debt) {
    if (!debt.hasPrepaymentPenalty || debt.penaltyExpirationMonths <= 0) {
      return null;
    }

    const today = new Date();
    const expirationDate = new Date(today.getFullYear(), today.getMonth() + debt.penaltyExpirationMonths, today.getDate());
    
    return {
      expiresInMonths: debt.penaltyExpirationMonths,
      expirationDate: expirationDate.toISOString().split('T')[0],
      recommendation: `Penalty expires in ${debt.penaltyExpirationMonths} months. Consider accelerating after expiration to avoid costs.`
    };
  }

  /**
   * Flag red flags for penalty avoidance
   */
  flagPenaltyRedFlags(debts) {
    const redFlags = [];

    for (const debt of debts) {
      if (!debt.hasPrepaymentPenalty) continue;

      // Red flag 1: High penalty relative to balance
      const penaltyRatio = debt.penaltyAmount / debt.currentBalance;
      if (penaltyRatio > 0.05) {
        redFlags.push({
          severity: 'HIGH',
          debtName: debt.name,
          flag: `High prepayment penalty (${roundPercent(penaltyRatio * 100)}% of balance)`,
          penaltyAmount: debt.penaltyAmount,
          impact: `Avoid acceleration for next ${debt.penaltyExpirationMonths} months`,
          recommendation: 'Wait for penalty expiration before accelerating'
        });
      }

      // Red flag 2: Penalty never expires
      if (debt.penaltyExpirationMonths === 0 || debt.penaltyExpirationMonths > 120) {
        redFlags.push({
          severity: 'MEDIUM',
          debtName: debt.name,
          flag: 'Prepayment penalty has no expiration date',
          impact: 'Penalty applies whenever you accelerate',
          recommendation: 'Evaluate if acceleration benefit exceeds penalty cost'
        });
      }

      // Red flag 3: Penalty expires soon but high amount
      if (debt.penaltyExpirationMonths > 0 && debt.penaltyExpirationMonths <= 6 && debt.penaltyAmount > 1000) {
        redFlags.push({
          severity: 'LOW',
          debtName: debt.name,
          flag: 'Penalty expires in less than 6 months',
          impact: 'Fast-approaching penalty-free window',
          recommendation: `Plan acceleration for after month ${debt.penaltyExpirationMonths}`
        });
      }
    }

    return redFlags;
  }

  /**
   * Main orchestrator: Optimize prepayment strategy
   */
  optimize(debts) {
    // Normalize inputs
    const normalizedDebts = debts.map(d => this.normalizeDebt(d));

    if (normalizedDebts.length === 0) {
      return {
        debts: [],
        error: 'No debts provided'
      };
    }

    // Prioritize debts
    const prioritizedDebts = this.prioritizeDebts(normalizedDebts);

    // Analyze each debt
    const analysis = prioritizedDebts.map(debt => {
      const strategy = this.recommendAccelerationStrategy(debt);
      const expiration = this.getPenaltyExpirationDate(debt);
      
      // Analyze 4 acceleration scenarios (3mo, 6mo, 12mo, 24mo)
      const scenarios = [3, 6, 12, 24].map(months => 
        Math.min(months, debt.monthsRemaining) > 0
          ? this.analyzePenaltyTradeoff(debt, Math.min(months, debt.monthsRemaining))
          : null
      ).filter(Boolean);

      return {
        debtId: debt.id,
        debtName: debt.name,
        type: debt.type,
        currentBalance: debt.currentBalance,
        apr: debt.apr,
        monthsRemaining: debt.monthsRemaining,
        hasPrepaymentPenalty: debt.hasPrepaymentPenalty,
        penaltyDetails: debt.hasPrepaymentPenalty ? {
          type: debt.penaltyType,
          amount: debt.penaltyAmount,
          percent: debt.penaltyPercent,
          expirationMonths: debt.penaltyExpirationMonths,
          expirationDate: expiration?.expirationDate
        } : null,
        recommendedStrategy: strategy,
        accelerationScenarios: scenarios,
        priorityScore: debt.priorityScore,
        canAccelerateSafely: debt.canAccelerateSafely
      };
    });

    // Get red flags
    const redFlags = this.flagPenaltyRedFlags(normalizedDebts);

    // Summary
    const debtsSafeToAccelerate = analysis.filter(a => a.canAccelerateSafely).length;
    const totalPotentialSavings = roundMoney(
      analysis
        .filter(a => a.accelerationScenarios.length > 0)
        .reduce((sum, a) => sum + (a.accelerationScenarios[a.accelerationScenarios.length - 1]?.netBenefit || 0), 0)
    );

    return {
      analysis,
      summary: {
        totalDebts: normalizedDebts.length,
        debtsWithPenalties: normalizedDebts.filter(d => d.hasPrepaymentPenalty).length,
        debtsSafeToAccelerate,
        totalPotentialSavings,
        redFlags: redFlags.length,
        nextStep: debtsSafeToAccelerate > 0 
          ? `Accelerate ${debtsSafeToAccelerate} debts without penalties`
          : redFlags.some(f => f.flag.includes('expires soon'))
          ? 'Wait for upcoming penalty expirations, then accelerate'
          : 'Review penalty costs before accelerating any debts'
      },
      redFlags,
      actionPlan: {
        immediate: analysis
          .filter(a => a.canAccelerateSafely && !a.hasPrepaymentPenalty)
          .map(a => ({
            debtName: a.debtName,
            action: `Accelerate ${a.debtName}`,
            expectedSavings: a.accelerationScenarios[a.accelerationScenarios.length - 1]?.netBenefit,
            timeline: 'Start immediately'
          })),
        planned: analysis
          .filter(a => a.hasPrepaymentPenalty && a.penaltyDetails?.expirationMonths > 0)
          .map(a => ({
            debtName: a.debtName,
            action: `Accelerate after penalty expires`,
            penaltyExpiresMonth: a.penaltyDetails.expirationMonths,
            expectedSavings: a.accelerationScenarios[a.accelerationScenarios.length - 1]?.netBenefit,
            timeline: `In ${a.penaltyDetails.expirationMonths} months`
          })),
        avoidAcceleration: analysis
          .filter(a => !a.canAccelerateSafely)
          .map(a => ({
            debtName: a.debtName,
            reason: 'Penalty cost exceeds interest savings benefit',
            penaltyAmount: a.penaltyDetails?.amount,
            recommendation: 'Continue regular payments until penalty expires'
          }))
      }
    };
  }
}

module.exports = new LoanPrepaymentPenaltyOptimizerService();
