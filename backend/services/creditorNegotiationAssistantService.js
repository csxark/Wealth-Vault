import { db } from '../db/index.js';
import { debts, paymentHistory, creditAccounts } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const roundMoney = (value) => Math.round(value * 100) / 100;

const roundPercent = (value) => Math.round(value * 100) / 100;

// Negotiation leverage factors
const NEGOTIATION_LEVERAGE = {
  EXCELLENT_CREDIT: 0.9,
  GOOD_CREDIT: 0.7,
  FAIR_CREDIT: 0.5,
  POOR_CREDIT: 0.3,
  VERY_POOR_CREDIT: 0.1
};

// Creditor-specific negotiation benchmarks
const CREDITOR_BENCHMARKS = {
  'credit-card': {
    avgApr: 22.5,
    minNegotiable: 15,
    maxReduction: 8,
    settlementRange: [0.5, 0.75],
    successRate: 0.65,
    responseTime: '2-3 weeks'
  },
  'personal-loan': {
    avgApr: 12.0,
    minNegotiable: 7,
    maxReduction: 5,
    settlementRange: [0.7, 0.85],
    successRate: 0.45,
    responseTime: '3-4 weeks'
  },
  'auto-loan': {
    avgApr: 8.5,
    minNegotiable: 4,
    maxReduction: 4,
    settlementRange: [0.85, 0.95],
    successRate: 0.25,
    responseTime: '4-6 weeks'
  },
  'student-loan': {
    avgApr: 6.0,
    minNegotiable: 3,
    maxReduction: 3,
    settlementRange: [0.8, 0.95],
    successRate: 0.3,
    responseTime: '4-8 weeks'
  },
  'mortgage': {
    avgApr: 7.0,
    minNegotiable: 4,
    maxReduction: 3,
    settlementRange: [0.9, 0.98],
    successRate: 0.2,
    responseTime: '6-8 weeks'
  },
  'heloc': {
    avgApr: 9.5,
    minNegotiable: 6,
    maxReduction: 3.5,
    settlementRange: [0.75, 0.9],
    successRate: 0.5,
    responseTime: '2-3 weeks'
  }
};

// Payment history quality scoring
const PAYMENT_QUALITY = {
  PERFECT: { score: 100, label: 'Perfect (0 late payments)' },
  EXCELLENT: { score: 85, label: 'Excellent (1-2 minor lates)' },
  GOOD: { score: 70, label: 'Good (occasional lates)' },
  FAIR: { score: 50, label: 'Fair (frequent lates)' },
  POOR: { score: 25, label: 'Poor (chronic delinquency)' }
};

// Account tenure value
const ACCOUNT_TENURE_MULTIPLIER = {
  'new': 0.3,        // 0-6 months
  'established': 0.6, // 6 months - 2 years
  'valued': 1.0,      // 2-5 years
  'loyal': 1.3        // 5+ years
};

class CreditorNegotiationAssistantService {
  /**
   * Assess negotiation strength based on credit score
   */
  assessCreditStrength(creditScore = 600) {
    const score = clamp(toNumber(creditScore, 600), 300, 850);

    if (score >= 750) return { level: 'excellent', score: NEGOTIATION_LEVERAGE.EXCELLENT_CREDIT, message: 'Strong negotiating position due to excellent credit' };
    if (score >= 700) return { level: 'good', score: NEGOTIATION_LEVERAGE.GOOD_CREDIT, message: 'Good negotiating position; creditors value your business' };
    if (score >= 650) return { level: 'fair', score: NEGOTIATION_LEVERAGE.FAIR_CREDIT, message: 'Moderate negotiating position; selective negotiation recommended' };
    if (score >= 600) return { level: 'poor', score: NEGOTIATION_LEVERAGE.POOR_CREDIT, message: 'Limited leverage; focus on hardship angle' };
    return { level: 'very-poor', score: NEGOTIATION_LEVERAGE.VERY_POOR_CREDIT, message: 'Minimal leverage without hardship justification' };
  }

  /**
   * Score payment history quality
   */
  scorePaymentQuality(latePaymentCount = 0, totalPayments = 12) {
    const latePercent = (latePaymentCount / Math.max(totalPayments, 1)) * 100;

    if (latePercent === 0) return { score: PAYMENT_QUALITY.PERFECT.score, label: PAYMENT_QUALITY.PERFECT.label };
    if (latePercent <= 5) return { score: PAYMENT_QUALITY.EXCELLENT.score, label: PAYMENT_QUALITY.EXCELLENT.label };
    if (latePercent <= 15) return { score: PAYMENT_QUALITY.GOOD.score, label: PAYMENT_QUALITY.GOOD.label };
    if (latePercent <= 30) return { score: PAYMENT_QUALITY.FAIR.score, label: PAYMENT_QUALITY.FAIR.label };
    return { score: PAYMENT_QUALITY.POOR.score, label: PAYMENT_QUALITY.POOR.label };
  }

  /**
   * Calculate account tenure multiplier
   */
  calculateTenureMultiplier(openedDate) {
    const opened = new Date(openedDate);
    const now = new Date();
    const monthsOld = (now.getFullYear() - opened.getFullYear()) * 12 + (now.getMonth() - opened.getMonth());

    if (monthsOld < 6) return { period: 'new', multiplier: ACCOUNT_TENURE_MULTIPLIER.new, months: monthsOld };
    if (monthsOld < 24) return { period: 'established', multiplier: ACCOUNT_TENURE_MULTIPLIER.established, months: monthsOld };
    if (monthsOld < 60) return { period: 'valued', multiplier: ACCOUNT_TENURE_MULTIPLIER.valued, months: monthsOld };
    return { period: 'loyal', multiplier: ACCOUNT_TENURE_MULTIPLIER.loyal, months: monthsOld };
  }

  /**
   * Generate negotiation scripts
   */
  generateNegotiationScript(debt, creditStrength, paymentQuality, tenureInfo) {
    const scripts = {
      aprReduction: this._generateAprScript(debt, creditStrength, paymentQuality),
      feeWaiver: this._generateFeeWaiverScript(debt, creditStrength),
      settlement: this._generateSettlementScript(debt, creditStrength, paymentQuality),
      hardship: this._generateHardshipScript(tenureInfo)
    };
    return scripts;
  }

  _generateAprScript(debt, creditStrength, paymentQuality) {
    const benchmark = CREDITOR_BENCHMARKS[debt.type] || CREDITOR_BENCHMARKS['credit-card'];
    const targetApr = Math.max(benchmark.minNegotiable, toNumber(debt.apr, 15) - benchmark.maxReduction);
    const savings = roundMoney((toNumber(debt.apr, 15) - targetApr) * toNumber(debt.balance, 1000) / 100);

    return {
      opening: `Hello, I've been a loyal customer for ${Math.floor(toNumber(debt.accountMonths, 12) / 12)} years with an excellent payment history. I'd like to discuss reducing my APR from ${toNumber(debt.apr, 15).toFixed(1)}% to ${targetApr.toFixed(1)}%.`,
      rationale: `I've consistently made on-time payments and maintain a ${creditStrength.level} credit score. Recent competitors are offering rates as low as ${benchmark.minNegotiable}% for accounts like mine.`,
      closing: `I'd like to keep my business with you. A rate reduction to ${targetApr.toFixed(1)}% would save me approximately $${savings.toLocaleString()} and allow me to pay down my balance faster.`,
      expectedSavings: savings,
      targetRate: targetApr
    };
  }

  _generateFeeWaiverScript(debt, creditStrength) {
    const hasLateFeePotential = creditStrength.score >= NEGOTIATION_LEVERAGE.GOOD_CREDIT;

    return {
      opening: `I noticed I've been charged ${hasLateFeePotential ? 'late fees' : 'annual fees'} on this account. I'd like to request a one-time waiver given my good payment history.`,
      rationale: hasLateFeePotential
        ? "While I had a recent late payment, this was uncharacteristic and I've since set up automatic payments to prevent recurrence."
        : 'As a long-standing customer with excellent payment history, I believe I qualify for an annual fee waiver.',
      closing: `Removing these fees would help me redirect funds to paying down my balance. Can you help make this adjustment?`,
      feeType: hasLateFeePotential ? 'late-fee' : 'annual-fee'
    };
  }

  _generateSettlementScript(debt, creditStrength, paymentQuality) {
    const benchmark = CREDITOR_BENCHMARKS[debt.type] || CREDITOR_BENCHMARKS['credit-card'];
    const [lowEnd, highEnd] = benchmark.settlementRange;
    
    // Adjust range based on credit strength (worse credit = lower settlement offer can go)
    const adjustedLowEnd = lowEnd - (1 - creditStrength.score) * 0.15;
    const adjustedHighEnd = highEnd - (1 - creditStrength.score) * 0.1;

    const settlementOffer = roundMoney(toNumber(debt.balance, 1000) * clamp(highEnd - (creditStrength.score * 0.1), adjustedLowEnd, adjustedHighEnd));
    const savings = roundMoney(toNumber(debt.balance, 1000) - settlementOffer);

    return {
      opening: `I'm experiencing financial hardship and would like to discuss settling this account. I can offer a lump-sum payment to close the account.`,
      rationale: `Rather than risk prolonged delinquency, I'd like to settle at ${roundPercent((settlementOffer / toNumber(debt.balance, 1000)) * 100)}% of the balance today.`,
      offerAmount: settlementOffer,
      closing: `I can provide the settlement amount of $${settlementOffer.toLocaleString()} within 30 days in exchange for marking this account "paid in full" and removing negative reporting.`,
      expectedSavings: savings,
      savingsPercent: roundPercent((savings / toNumber(debt.balance, 1000)) * 100),
      negotiationRange: [Math.round(adjustedLowEnd * 100) / 100, Math.round(adjustedHighEnd * 100) / 100]
    };
  }

  _generateHardshipScript(tenureInfo) {
    const loyaltyDesc = tenureInfo.period === 'loyal' ? 'long-standing' : tenureInfo.period === 'valued' ? 'established' : 'accounts with';

    return {
      opening: `I'm reaching out because I'm experiencing temporary financial hardship and need assistance with my account.`,
      background: `I've been a customer for ${tenureInfo.months} months and want to work with you to find a solution that works for both of us.`,
      request: `Would you be open to discussing a temporary payment reduction, hardship program, or other options to help me get through this period?`,
      closing: `I'm committed to resolving this and working toward full repayment. I appreciate your willingness to work with me.`,
      accountAge: tenureInfo.months,
      accountPeriod: tenureInfo.period
    };
  }

  /**
   * Rank debts by negotiation feasibility
   */
  rankDebtsByFeasibility(debts = [], creditScore = 600, paymentHistories = {}) {
    const creditStrength = this.assessCreditStrength(creditScore);

    const rankedDebts = (debts || []).map(debt => {
      const history = paymentHistories[debt.id] || {};
      const paymentQuality = this.scorePaymentQuality(history.latePaymentCount || 0, history.totalPayments || 12);
      const tenureInfo = this.calculateTenureMultiplier(debt.openedDate || new Date());
      const benchmark = CREDITOR_BENCHMARKS[debt.type] || CREDITOR_BENCHMARKS['credit-card'];

      // Feasibility score: 0-100
      const feasibilityScore = roundPercent(
        (paymentQuality.score * 0.4) +
        (creditorStrength.score * 100 * 0.35) +
        (tenureInfo.multiplier * 100 * 0.25)
      );

      const potentialAprSavings = roundMoney(
        (toNumber(debt.apr, 15) - benchmark.minNegotiable) *
        toNumber(debt.balance, 1000) / 100
      );

      return {
        debtId: debt.id,
        name: debt.name,
        type: debt.type,
        balance: toNumber(debt.balance, 1000),
        apr: toNumber(debt.apr, 15),
        minimumPayment: toNumber(debt.minimumPayment, 0),
        feasibilityScore,
        feasibilityRank: feasibilityScore >= 75 ? 'high' : feasibilityScore >= 50 ? 'moderate' : 'low',
        paymentQuality: paymentQuality.label,
        accountAge: tenureInfo.months,
        accountTenure: tenureInfo.period,
        potentialAprSavings,
        estimatedSettlementRange: [
          roundMoney(toNumber(debt.balance, 1000) * benchmark.settlementRange[0]),
          roundMoney(toNumber(debt.balance, 1000) * benchmark.settlementRange[1])
        ],
        negotiationSuccessProbability: roundPercent(benchmark.successRate * (feasibilityScore / 100)),
        expectedResponseTime: benchmark.responseTime
      };
    });

    return rankedDebts.sort((a, b) => b.feasibilityScore - a.feasibilityScore);
  }

  /**
   * Generate full negotiation playbook
   */
  generatePlaybook(debt, creditScore = 600, paymentHistory = {}) {
    const creditStrength = this.assessCreditStrength(creditScore);
    const paymentQuality = this.scorePaymentQuality(paymentHistory.latePaymentCount || 0, paymentHistory.totalPayments || 12);
    const tenureInfo = this.calculateTenureMultiplier(debt.openedDate || new Date());
    const benchmark = CREDITOR_BENCHMARKS[debt.type] || CREDITOR_BENCHMARKS['credit-card'];

    const scripts = this.generateNegotiationScript(debt, creditStrength, paymentQuality, tenureInfo);

    return {
      debtId: debt.id,
      debtName: debt.name,
      debtType: debt.type,
      balance: toNumber(debt.balance, 1000),
      currentApr: toNumber(debt.apr, 15),
      negotiationProfile: {
        creditScore: creditScore,
        creditStrength: creditStrength.level,
        paymentQuality: paymentQuality.label,
        accountAge: `${tenureInfo.months} months (${tenureInfo.period})`,
        overallNegotiationStrength: roundPercent((creditStrength.score * 100 * 0.4) + (paymentQuality.score * 0.6))
      },
      negotiationOptions: {
        aprReduction: {
          script: scripts.aprReduction.opening,
          rationale: scripts.aprReduction.rationale,
          closingStatement: scripts.aprReduction.closing,
          targetApr: scripts.aprReduction.targetRate,
          expectedMonthlySavings: roundMoney(scripts.aprReduction.expectedSavings / (toNumber(debt.minimumPayment, 0) ? 48 : 60)),
          successProbability: roundPercent(benchmark.successRate * 0.9),
          difficulty: 'moderate'
        },
        feeWaiver: {
          script: scripts.feeWaiver.opening,
          rationale: scripts.feeWaiver.rationale,
          closingStatement: scripts.feeWaiver.closing,
          feeType: scripts.feeWaiver.feeType,
          successProbability: roundPercent(benchmark.successRate * 0.7),
          difficulty: 'easy'
        },
        settlement: {
          script: scripts.settlement.opening,
          rationale: scripts.settlement.rationale,
          settlementOffer: scripts.settlement.offerAmount,
          settlementPercent: roundPercent((scripts.settlement.offerAmount / toNumber(debt.balance, 1000)) * 100),
          closingStatement: scripts.settlement.closing,
          expectedSavings: scripts.settlement.expectedSavings,
          successProbability: roundPercent(benchmark.successRate * 0.5),
          difficulty: 'hard',
          warning: 'Settlement will negatively impact credit score; use only if cash flow is critical'
        }
      },
      recommendedApproach: {
        strategy: this._recommendStrategy(creditStrength, paymentQuality),
        stepByStep: [
          {
            step: 1,
            action: 'Request a call with the creditor\'s retention team',
            timing: 'This week',
            expectedOutcome: 'Speak with someone authorized to negotiate'
          },
          {
            step: 2,
            action: creditorStrength.score >= NEGOTIATION_LEVERAGE.GOOD_CREDIT ? 'Lead with APR reduction request' : 'Emphasize your account history and commitment',
            timing: 'During call',
            expectedOutcome: creditorStrength.score >= NEGOTIATION_LEVERAGE.GOOD_CREDIT ? 'APR reduction of 2-5%' : 'Goodwill consideration'
          },
          {
            step: 3,
            action: creditorStrength.score >= NEGOTIATION_LEVERAGE.FAIR_CREDIT ? 'Request fee waivers if applicable' : 'Ask about hardship programs',
            timing: 'If APR discussion goes well',
            expectedOutcome: creditorStrength.score >= NEGOTIATION_LEVERAGE.FAIR_CREDIT ? '$25-100 in fee reversals' : 'Temporary payment relief'
          },
          {
            step: 4,
            action: 'Get all agreements in writing before hanging up',
            timing: 'End of call',
            expectedOutcome: 'Email confirmation of changes'
          },
          {
            step: 5,
            action: 'Follow up in 30 days to confirm changes were applied',
            timing: '30 days after call',
            expectedOutcome: 'Verification of rate change or fee reversal'
          }
        ]
      },
      timelineEstimate: {
        decisionTime: benchmark.responseTime,
        implementationTime: '3-5 business days after approval',
        overallTimeline: `${benchmark.responseTime} to see impact on next statement`
      },
      successFactors: [
        creditorStrength.message,
        paymentQuality.label,
        `Account in good standing for ${tenureInfo.months} months`,
        `Negotiating ${debt.type} with ${roundPercent(benchmark.successRate * 100)}% industry success rate`
      ]
    };
  }

  _recommendStrategy(creditStrength, paymentQuality) {
    if (creditStrength.score >= NEGOTIATION_LEVERAGE.GOOD_CREDIT && paymentQuality.score >= 70) {
      return 'Lead with APR reduction, then request fee waivers. Strong position.';
    }
    if (creditStrength.score >= NEGOTIATION_LEVERAGE.FAIR_CREDIT && paymentQuality.score >= 50) {
      return 'Request fee waivers first to build goodwill, then request APR reduction.';
    }
    if (paymentQuality.score >= 70) {
      return 'Emphasize your excellent payment history and request APR reduction.';
    }
    return 'Explore hardship programs or settlement options given limited leverage.';
  }

  /**
   * Main optimization method
   */
  async optimize(userId, debts = [], creditScore = 600, options = {}) {
    if (!debts || debts.length === 0) {
      return {
        error: 'No debts provided'
      };
    }

    try {
      // Fetch payment history for user debts
      const paymentHistories = {};
      for (const debt of debts) {
        const history = await db
          .select()
          .from(paymentHistory)
          .where(eq(paymentHistory.debtId, debt.id))
          .limit(24);

        const latePayments = history.filter(p => p.daysLate > 0).length;
        paymentHistories[debt.id] = {
          latePaymentCount: latePayments,
          totalPayments: history.length || 1
        };
      }

      // Rank debts by negotiation feasibility
      const rankedDebts = this.rankDebtsByFeasibility(debts, creditScore, paymentHistories);

      // Generate full playbooks for top 3 debts
      const playbooks = rankedDebts.slice(0, 3).map(ranked => {
        const fullDebt = debts.find(d => d.id === ranked.debtId);
        return this.generatePlaybook(
          fullDebt,
          creditScore,
          paymentHistories[ranked.debtId] || {}
        );
      });

      // Calculate aggregate savings potential
      const totalCurrentAprCost = roundMoney(
        debts.reduce((sum, d) => sum + (toNumber(d.balance, 1000) * toNumber(d.apr, 15) / 100), 0)
      );

      const estimatedAnnualSavings = roundMoney(
        rankedDebts.slice(0, 1).reduce((sum, ranked) => sum + (ranked.potentialAprSavings / 12), 0) * 12
      );

      return {
        userId,
        negotiationDate: new Date().toISOString(),
        creditProfile: {
          creditScore,
          ...this.assessCreditStrength(creditScore)
        },
        debtRanking: rankedDebts,
        topNegotiationTargets: playbooks,
        aggregatedMetrics: {
          totalDebtBalance: roundMoney(debts.reduce((sum, d) => sum + toNumber(d.balance, 1000), 0)),
          currentTotalAprCost: totalCurrentAprCost,
          estimatedAnnualSavings: estimatedAnnualSavings,
          potentialMultipleDebtSavings: roundMoney(estimatedAnnualSavings * 3),
          averageFeasibilityScore: roundPercent(rankedDebts.reduce((sum, d) => sum + d.feasibilityScore, 0) / rankedDebts.length),
          highFeasibilityCount: rankedDebts.filter(d => d.feasibilityRank === 'high').length,
          estimatedPayoffAcceleration: roundMoney(estimatedAnnualSavings / 12)
        },
        recommendation: {
          strategy: 'Sequential Negotiation',
          approach: 'Start with highest-feasibility debts; deploy APR reduction wins to accelerate payoff',
          priority: rankedDebts.length > 0 ? `${rankedDebts[0].name} (${roundPercent(rankedDebts[0].feasibilityScore)}% feasibility)` : 'N/A',
          timelineWeeks: 4,
          expectedOutcome: `Potential APR reductions saving $${estimatedAnnualSavings.toLocaleString()} annually`
        }
      };
    } catch (error) {
      throw new Error(`Negotiation optimization failed: ${error.message}`);
    }
  }
}

export default new CreditorNegotiationAssistantService();
