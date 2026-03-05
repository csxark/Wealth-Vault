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
 * Debt Recast vs Refinance Analyzer
 * Compares strategic lump-sum deployment across three scenarios:
 * - Recast: Apply lump sum to principal, keep APR/term, lower payment
 * - Refinance: New loan with potentially lower APR, possibly shorter term
 * - Acceleration: Extra principal payments to pay off faster
 */
class DebtRecastVsRefinanceAnalyzerService {
  /**
   * Normalize debt input
   */
  normalizeDebt(debt) {
    return {
      id: debt.id || `debt_${Math.random()}`,
      name: debt.name || 'Loan',
      originalBalance: roundMoney(debt.originalBalance || debt.balance),
      currentBalance: roundMoney(debt.currentBalance || debt.balance),
      apr: roundPercent(debt.apr),
      monthsRemaining: clamp(toNumber(debt.monthsRemaining), 1, 360),
      monthlyPayment: roundMoney(debt.monthlyPayment),
      type: debt.type || 'mortgage', // mortgage, auto-loan, personal-loan, student-loan, heloc
      loanOriginalTerm: clamp(toNumber(debt.loanOriginalTerm), 1, 360),
      prepaymentPenalty: roundMoney(debt.prepaymentPenalty || 0),
      lumpSumAmount: roundMoney(debt.lumpSumAmount || 0)
    };
  }

  /**
   * Normalize refinance offer/quotes
   */
  normalizeRefinanceOffer(offer) {
    return {
      id: offer.id || `offer_${Math.random()}`,
      provider: offer.provider || 'Lender',
      apr: roundPercent(offer.apr),
      termMonths: clamp(toNumber(offer.termMonths), 1, 360),
      originationFeePercent: roundPercent(offer.originationFeePercent || 0.5),
      originationFeeFixed: roundMoney(offer.originationFeeFixed || 0),
      appraisalFee: roundMoney(offer.appraisalFee || 0),
      titleInsurance: roundMoney(offer.titleInsurance || 0),
      closingCosts: roundMoney(offer.closingCosts || 0), // total other costs
      assumedCreditScore: clamp(toNumber(offer.assumedCreditScore), 300, 850)
    };
  }

  /**
   * Calculate monthly payment using amortization formula
   */
  calculateMonthlyPayment(principal, apr, months) {
    if (months <= 0 || principal <= 0) return 0;

    const monthlyRate = apr / 100 / 12;
    if (monthlyRate === 0) return principal / months;

    const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, months);
    const denominator = Math.pow(1 + monthlyRate, months) - 1;
    return numerator / denominator;
  }

  /**
   * Scenario 1: Recast - apply lump sum, keep APR and term
   */
  scenarioRecast(debt) {
    const newBalance = Math.max(0, debt.currentBalance - debt.lumpSumAmount);
    const newMonthlyPayment = this.calculateMonthlyPayment(newBalance, debt.apr, debt.monthsRemaining);

    // Simulate remaining payoff
    let totalInterest = 0;
    let balance = newBalance;
    for (let month = 1; month <= debt.monthsRemaining; month++) {
      const interestCharge = balance * (debt.apr / 100 / 12);
      totalInterest += interestCharge;
      balance = Math.max(0, balance + interestCharge - newMonthlyPayment);
    }

    const paymentReduction = debt.monthlyPayment - newMonthlyPayment;
    const currentTotalPayment = debt.monthlyPayment * debt.monthsRemaining;
    const recastTotalPayment = newMonthlyPayment * debt.monthsRemaining;
    const interestSaved = roundMoney(currentTotalPayment - (newBalance + totalInterest));

    return {
      scenario: 'Recast',
      lumpSumApplied: debt.lumpSumAmount,
      closingCosts: 0, // Recast typically has minimal or no fees
      fees: 0,
      newBalance: roundMoney(newBalance),
      newMonthlyPayment: roundMoney(newMonthlyPayment),
      paymentReduction: roundMoney(paymentReduction),
      paymentReductionPercent: debt.monthlyPayment > 0 ? roundPercent((paymentReduction / debt.monthlyPayment) * 100) : 0,
      remainingTerm: debt.monthsRemaining,
      apr: debt.apr,
      totalInterestRemaining: roundMoney(totalInterest),
      interestSaved: roundMoney(interestSaved),
      totalCostOfLoan: roundMoney(newBalance + totalInterest),
      timelineMonths: debt.monthsRemaining,
      netBenefit: roundMoney(interestSaved), // No closing costs
      pros: [
        'Immediate payment reduction',
        'No refinance approval needed',
        'Minimal/no closing costs',
        'Same APR guaranteed'
      ],
      cons: [
        'Does not improve APR',
        'Does not shorten loan term (if desired)',
        'Limited eligibility (must have equity/account standing)'
      ],
      bestFor: 'Cash flow improvement; users wanting low-cost solution'
    };
  }

  /**
   * Scenario 2: Refinance - new loan with new APR and term
   */
  scenarioRefinance(debt, offer) {
    const loanAmount = debt.currentBalance - debt.lumpSumAmount;
    
    // Calculate fees
    const originationFee = roundMoney((loanAmount * offer.originationFeePercent / 100) + offer.originationFeeFixed);
    const totalClosingCosts = roundMoney(originationFee + offer.appraisalFee + offer.titleInsurance + offer.closingCosts);
    const totalLoanAmount = loanAmount + totalClosingCosts;

    // New payment
    const newMonthlyPayment = this.calculateMonthlyPayment(totalLoanAmount, offer.apr, offer.termMonths);

    // Simulate payoff
    let totalInterest = 0;
    let balance = totalLoanAmount;
    for (let month = 1; month <= offer.termMonths; month++) {
      const interestCharge = balance * (offer.apr / 100 / 12);
      totalInterest += interestCharge;
      balance = Math.max(0, balance + interestCharge - newMonthlyPayment);
    }

    // Calculate savings vs current trajectory
    const currentRemaining = (debt.monthlyPayment * debt.monthsRemaining) - (debt.currentBalance - debt.lumpSumAmount);
    const refinanceCost = totalInterest + totalClosingCosts;
    const interestSaved = roundMoney(Math.max(0, currentRemaining - refinanceCost));
    const breakevenMonths = totalClosingCosts > 0 
      ? Math.ceil((totalClosingCosts / (debt.monthlyPayment - newMonthlyPayment)) * 12)
      : 0;

    const paymentReduction = debt.monthlyPayment - newMonthlyPayment;
    const timelineMonths = offer.termMonths;
    const timelineShorter = debt.monthsRemaining - timelineMonths;

    return {
      scenario: 'Refinance',
      provider: offer.provider,
      lumpSumApplied: debt.lumpSumAmount,
      loanAmount: roundMoney(loanAmount),
      closingCosts: roundMoney(totalClosingCosts),
      fees: {
        origination: roundMoney(originationFee),
        appraisal: offer.appraisalFee,
        titleInsurance: offer.titleInsurance,
        other: offer.closingCosts
      },
      newMonthlyPayment: roundMoney(newMonthlyPayment),
      paymentReduction: roundMoney(paymentReduction),
      paymentReductionPercent: debt.monthlyPayment > 0 ? roundPercent((paymentReduction / debt.monthlyPayment) * 100) : 0,
      newApr: offer.apr,
      aprChange: roundPercent(offer.apr - debt.apr),
      newTerm: offer.termMonths,
      termChange: timelineShorter,
      termChangeMonths: timelineShorter,
      totalInterestRemaining: roundMoney(totalInterest),
      interestSaved: roundMoney(interestSaved),
      totalCostOfLoan: roundMoney(totalLoanAmount + totalInterest),
      timelineMonths: timelineMonths,
      breakevenMonths: Math.max(0, breakevenMonths),
      breakevenMonthsNote: breakevenMonths > 0 
        ? `Savings exceed closing costs after ${breakevenMonths} months`
        : 'No closing costs or immediate cash flow benefit',
      netBenefit: roundMoney(interestSaved - totalClosingCosts),
      pros: [
        offer.apr < debt.apr ? `APR improvement (${debt.apr}% → ${offer.apr}%)` : 'No APR benefit',
        timelineMonths < debt.monthsRemaining ? `Shorter term (${timelineMonths} vs ${debt.monthsRemaining} months)` : 'Same payoff timeline',
        paymentReduction > 0 ? `Monthly payment reduction ($${paymentReduction})` : 'No monthly reduction',
        'Potential credit score recovery (new positive account)'
      ],
      cons: [
        `Closing costs: $${totalClosingCosts}`,
        'Refinance approval required (credit check)',
        'New loan = restart amortization (more early-term interest)',
        'Opportunity cost (capital tied to fees)'
      ],
      bestFor: offer.apr < debt.apr ? 'Lower APR and shorter payoff' : 'Shorter payoff timeline with cash flow flexibility',
      creditScoreImpact: 'Temporary dip (hard inquiry); recovery in 3-6 months'
    };
  }

  /**
   * Scenario 3: Acceleration - extra principal payments, keep current loan
   */
  scenarioAcceleration(debt) {
    let balance = debt.currentBalance;
    let totalInterest = 0;
    let monthsToPayoff = 0;
    const accelerationPayment = (debt.lumpSumAmount / debt.monthsRemaining); // Spread over remaining term

    for (let month = 1; month <= debt.monthsRemaining; month++) {
      const interestCharge = balance * (debt.apr / 100 / 12);
      totalInterest += interestCharge;
      const totalPayment = debt.monthlyPayment + accelerationPayment;
      balance = Math.max(0, balance + interestCharge - totalPayment);
      monthsToPayoff = month;

      if (balance <= 0) break;
    }

    const currentTrajectory = debt.monthlyPayment * debt.monthsRemaining;
    const acceleratedTrajectory = currentTrajectory - debt.lumpSumAmount + totalInterest;
    const interestSaved = roundMoney(Math.max(0, currentTrajectory - acceleratedTrajectory));
    const timelineReduction = debt.monthsRemaining - monthsToPayoff;

    return {
      scenario: 'Acceleration',
      lumpSumApplied: debt.lumpSumAmount,
      monthlyAcceleration: roundMoney(accelerationPayment),
      totalMonthlyPayment: roundMoney(debt.monthlyPayment + accelerationPayment),
      closingCosts: 0,
      fees: 0,
      apr: debt.apr, // No change
      paymentReduction: 0, // Regular payment stays same, but acceleration added
      timelineReduction: timelineReduction,
      newTimelineMonths: monthsToPayoff,
      monthsFasterPayoff: timelineReduction,
      percentFasterPayoff: roundPercent((timelineReduction / debt.monthsRemaining) * 100),
      totalInterestRemaining: roundMoney(totalInterest),
      interestSaved: roundMoney(interestSaved),
      totalCostOfLoan: roundMoney(debt.lumpSumAmount + totalInterest),
      netBenefit: roundMoney(interestSaved), // No costs
      pros: [
        `Payoff ${timelineReduction} months faster`,
        `Save $${interestSaved} in interest`,
        'No refinance or recast approval needed',
        'No closing costs or fees',
        'Flexible (can adjust acceleration amount)'
      ],
      cons: [
        `Requires sustained ${accelerationPayment.toFixed(0)}/month extra payments`,
        'No monthly payment reduction (still full original payment)',
        'Less financial flexibility during acceleration period',
        'Emergency needs could force pause'
      ],
      bestFor: 'Users with surplus cash flow wanting fastest payoff and maximum interest savings',
      psychologicalBenefit: 'Earlier debt freedom; visible progress monthly'
    };
  }

  /**
   * Rank scenarios by user preference
   */
  rankScenarios(recast, refinance, acceleration, preferences = {}) {
    // Default preferences
    const pref = {
      priority: preferences.priority || 'balanced', // cash-flow, speed, savings, balanced
      riskTolerance: preferences.riskTolerance || 'moderate', // conservative, moderate, aggressive
      timeHorizon: preferences.timeHorizon || 60 // months to payoff
    };

    const scoringMap = {
      cash_flow: 0,
      speed: 0,
      savings: 0,
      zero_risk: 0
    };

    // Score recast
    const recastScore = (
      (pref.priority === 'cash-flow' ? recast.paymentReduction * 10 : 0) +
      (pref.priority === 'balanced' ? recast.paymentReduction * 5 : 0) +
      (pref.riskTolerance === 'conservative' ? 100 : 0) + // No approval risk
      50 // Low fees
    );

    // Score refinance
    const refinanceScore = (
      (refinance.apr < 0 ? Math.abs(refinance.apr) * 50 : 0) + // APR improvement bonus
      (pref.priority === 'savings' ? refinance.interestSaved : 0) +
      (pref.priority === 'speed' ? refinance.termChangeMonths * 2 : 0) +
      (pref.priority === 'balanced' ? refinance.netBenefit / 100 : 0) -
      (refinance.closingCosts / 100) // Penalize fees
    );

    // Score acceleration
    const accelerationScore = (
      (pref.priority === 'speed' ? acceleration.monthsFasterPayoff * 15 : 0) +
      (pref.priority === 'savings' ? acceleration.interestSaved : 0) +
      (pref.priority === 'balanced' ? (acceleration.interestSaved + acceleration.monthsFasterPayoff * 10) : 0) +
      (pref.riskTolerance === 'conservative' ? 75 : 0) // No approval or fee risk
    );

    const scenarios = [
      { ...recast, rank: 1, score: recastScore, rationale: 'Low-cost, minimal risk, immediate payment relief' },
      { ...refinance, rank: 2, score: refinanceScore, rationale: refinance.apr < 0 ? 'Lower APR + potential savings' : 'Flexible term management' },
      { ...acceleration, rank: 3, score: accelerationScore, rationale: 'Fastest payoff, highest interest savings, no approval needed' }
    ].sort((a, b) => b.score - a.score);

    return scenarios.map((s, idx) => ({
      ...s,
      rank: idx + 1,
      scoreReason: this.getScoreLabelByPriority(pref.priority, s.scenario)
    }));
  }

  /**
   * Get recommendation label
   */
  getScoreLabelByPriority(priority, scenario) {
    if (priority === 'cash-flow') return `${scenario} offers best monthly payment relief`;
    if (priority === 'speed') return `${scenario} pays off fastest`;
    if (priority === 'savings') return `${scenario} saves most in interest`;
    return `${scenario} balances all factors`;
  }

  /**
   * Main orchestrator
   */
  analyze(debt, refinanceOffers = [], preferences = {}) {
    // Normalize inputs
    const normalizedDebt = this.normalizeDebt(debt);
    const normalizedOffers = Array.isArray(refinanceOffers) 
      ? refinanceOffers.map(o => this.normalizeRefinanceOffer(o))
      : [];

    if (!normalizedDebt.lumpSumAmount || normalizedDebt.lumpSumAmount <= 0) {
      return {
        error: 'Lump sum amount required and must be positive'
      };
    }

    // Calculate scenarios
    const recast = this.scenarioRecast(normalizedDebt);
    const acceleration = this.scenarioAcceleration(normalizedDebt);

    // Use best refinance offer or default
    const bestOffer = normalizedOffers.length > 0
      ? normalizedOffers.reduce((best, offer) => {
          const bestScore = best.apr - normalizedDebt.apr;
          const offerScore = offer.apr - normalizedDebt.apr;
          return offerScore < bestScore ? offer : best;
        })
      : {
          id: 'default_offer',
          provider: 'Market Average',
          apr: normalizedDebt.apr - 0.5, // Assume modest 0.5% improvement possible
          termMonths: normalizedDebt.monthsRemaining,
          originationFeePercent: 0.5,
          closingCosts: 2000
        };

    const refinance = this.scenarioRefinance(normalizedDebt, bestOffer);

    // Rank scenarios
    const rankedScenarios = this.rankScenarios(recast, refinance, acceleration, preferences);

    return {
      debt: normalizedDebt,
      lumpSumAmount: normalizedDebt.lumpSumAmount,
      currentMonthlyPayment: normalizedDebt.monthlyPayment,
      monthsRemaining: normalizedDebt.monthsRemaining,
      currentApr: normalizedDebt.apr,
      scenarios: rankedScenarios,
      comparisonTable: {
        headers: ['Scenario', 'New Payment', 'Payment Change', 'Interest Saved', 'Closing Costs', 'Net Benefit', 'Timeline'],
        rows: rankedScenarios.map(s => ({
          scenario: s.scenario,
          newPayment: s.scenario === 'Recast' ? s.newMonthlyPayment : s.scenario === 'Refinance' ? s.newMonthlyPayment : s.totalMonthlyPayment,
          paymentChange: s.paymentReduction > 0 ? `-$${s.paymentReduction}` : 'No change',
          interestSaved: `$${s.interestSaved}`,
          closingCosts: `$${s.closingCosts}`,
          netBenefit: `$${s.netBenefit}`,
          timeline: s.scenario === 'Recast' 
            ? `${s.timelineMonths} months` 
            : s.scenario === 'Refinance' 
            ? `${s.timelineMonths} months ${s.termChangeMonths < 0 ? `(${s.termChangeMonths} shorter)` : ''}`
            : `${s.newTimelineMonths} months (${s.monthsFasterPayoff} faster)`
        }))
      },
      recommendation: {
        bestScenario: rankedScenarios[0].scenario,
        reasoning: rankedScenarios[0].rationale + '. ' + this.getRecommendationDetail(rankedScenarios[0]),
        secondBest: rankedScenarios[1].scenario,
        alternativeIf: this.getAlternativeGuidance(rankedScenarios),
        implementationSteps: this.getImplementationSteps(rankedScenarios[0])
      },
      riskAssessment: {
        recast: 'Lowest risk (no approval, no fees)',
        refinance: 'Moderate risk (approval required, closing costs, potential rate worse)',
        acceleration: 'Low risk (no approval, flexible, requires discipline)'
      }
    };
  }

  /**
   * Get recommendation detail
   */
  getRecommendationDetail(topScenario) {
    if (topScenario.scenario === 'Recast') {
      return `Your payment would drop to $${topScenario.newMonthlyPayment}/month with zero approval friction.`;
    } else if (topScenario.scenario === 'Refinance') {
      const aprImprovement = topScenario.aprChange < 0 ? `APR improves to ${topScenario.newApr}%. ` : '';
      return `${aprImprovement}Payoff in ${topScenario.timelineMonths} months. Breakeven on fees in ${topScenario.breakevenMonths} months.`;
    } else {
      return `Pay off ${topScenario.monthsFasterPayoff} months early (${topScenario.percentFasterPayoff}% faster) while saving $${topScenario.interestSaved} in interest.`;
    }
  }

  /**
   * Get alternative guidance
   */
  getAlternativeGuidance(ranked) {
    const alts = [];
    if (ranked.length > 1) {
      alts.push(`Consider ${ranked[1].scenario} if you prioritize ${this.getPriorityLabel(ranked[1].scenario)}.`);
    }
    if (ranked.length > 2) {
      alts.push(`Or try ${ranked[2].scenario} for ${this.getPriorityLabel(ranked[2].scenario)}.`);
    }
    return alts.join(' ');
  }

  /**
   * Get priority label
   */
  getPriorityLabel(scenario) {
    if (scenario === 'Recast') return 'immediate payment relief without approval friction';
    if (scenario === 'Refinance') return 'a lower interest rate and flexible term';
    if (scenario === 'Acceleration') return 'fastest debt freedom and maximum interest savings';
    return 'debt payoff optimization';
  }

  /**
   * Get implementation steps
   */
  getImplementationSteps(scenario) {
    if (scenario.scenario === 'Recast') {
      return [
        '1. Contact current lender (servicer) and request recast',
        '2. Provide lump sum amount and proof of funds',
        '3. Complete recast paperwork (typically minimal)',
        '4. New payment effective next cycle',
        '5. Confirm updated loan documents show new payment'
      ];
    } else if (scenario.scenario === 'Refinance') {
      return [
        '1. Gather financial documents (pay stubs, tax returns, assets)',
        '2. Submit refinance application to chosen lender',
        '3. Complete home appraisal (if required)',
        '4. Lock in APR and obtain final loan estimate',
        '5. Go through underwriting and approval process',
        '6. Schedule closing and wire lump sum funds',
        '7. Sign loan documents and finalize closing',
        '8. New loan funds and old loan is paid off'
      ];
    } else {
      return [
        '1. Calculate monthly acceleration amount (lump sum / remaining months or custom)',
        '2. Set up automatic transfers to debt account',
        '3. Confirm additional payments are applied to principal (not future interest)',
        '4. Monitor account to track accelerated payoff progress',
        '5. Adjust acceleration if cash flow changes, but try to maintain cadence',
        '6. Celebrate early payoff date!'
      ];
    }
  }
}

module.exports = new DebtRecastVsRefinanceAnalyzerService();
