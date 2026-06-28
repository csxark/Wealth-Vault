const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const roundMoney = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const roundPercent = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const MARKET_APR_BENCHMARKS = {
  'credit-card': {
    excellent: 12.99,
    good: 15.99,
    fair: 19.99,
    poor: 24.99
  },
  'personal-loan': {
    excellent: 8.49,
    good: 11.99,
    fair: 16.99,
    poor: 24.99
  },
  'auto-loan': {
    excellent: 5.49,
    good: 7.99,
    fair: 11.99,
    poor: 17.99
  },
  'student-loan': {
    excellent: 5.5,
    good: 6.5,
    fair: 8.5,
    poor: 10.5
  },
  mortgage: {
    excellent: 6.25,
    good: 6.75,
    fair: 7.5,
    poor: 8.5
  },
  heloc: {
    excellent: 7.5,
    good: 8.5,
    fair: 10,
    poor: 12
  },
  default: {
    excellent: 10,
    good: 13,
    fair: 17,
    poor: 22
  }
};

class RateArbitrageEngineService {
  normalizeDebt(debt = {}) {
    return {
      id: debt.id,
      name: debt.name || 'Debt',
      type: debt.type || 'other',
      apr: clamp(toNumber(debt.apr, 0), 0, 100),
      balance: roundMoney(toNumber(debt.balance ?? debt.currentBalance, 0)),
      minimumPayment: roundMoney(Math.max(0, toNumber(debt.minimumPayment, 0)))
    };
  }

  normalizeOffer(offer = {}) {
    return {
      offerId: offer.offerId || offer.id,
      provider: offer.provider || 'Offer Provider',
      productType: offer.productType || 'balance-transfer',
      apr: clamp(toNumber(offer.apr, 0), 0, 100),
      promoApr: clamp(toNumber(offer.promoApr, 0), 0, 100),
      promoMonths: Math.max(0, Math.round(toNumber(offer.promoMonths, 0))),
      transferFeePercent: clamp(toNumber(offer.transferFeePercent, offer.feePercent), 0, 10),
      transferFeeFlat: roundMoney(Math.max(0, toNumber(offer.transferFeeFlat, 0))),
      maxTransferAmount: roundMoney(Math.max(0, toNumber(offer.maxTransferAmount, 0))),
      minCreditScore: Math.round(clamp(toNumber(offer.minCreditScore, 300), 300, 850)),
      eligible: offer.eligible !== false
    };
  }

  creditTier(creditScore = 680) {
    const score = clamp(toNumber(creditScore, 680), 300, 850);
    if (score >= 740) return 'excellent';
    if (score >= 680) return 'good';
    if (score >= 620) return 'fair';
    return 'poor';
  }

  benchmarkDebt(debt, creditScore = 680) {
    const tier = this.creditTier(creditScore);
    const table = MARKET_APR_BENCHMARKS[debt.type] || MARKET_APR_BENCHMARKS.default;
    const benchmarkApr = toNumber(table[tier], debt.apr);
    const spread = roundPercent(debt.apr - benchmarkApr);

    const annualInterestCurrent = roundMoney(debt.balance * debt.apr / 100);
    const annualInterestBenchmark = roundMoney(debt.balance * benchmarkApr / 100);
    const annualSavingsPotential = roundMoney(Math.max(0, annualInterestCurrent - annualInterestBenchmark));

    return {
      debtId: debt.id,
      debtName: debt.name,
      debtType: debt.type,
      currentApr: debt.apr,
      benchmarkApr,
      aprSpread: spread,
      annualSavingsPotential,
      negotiationOpportunity: spread >= 1.5
    };
  }

  offerEligibleForDebt(offer, debt, creditScore = 680) {
    if (!offer.eligible) return false;
    if (creditScore < offer.minCreditScore) return false;
    if (offer.maxTransferAmount > 0 && offer.maxTransferAmount < 100) return false;
    if (offer.productType !== 'balance-transfer' && offer.productType !== 'personal-loan' && offer.productType !== 'refinance') return false;
    return debt.balance > 0;
  }

  calculateOfferEffectiveApr(offer) {
    if (offer.promoMonths <= 0) return offer.apr;

    const remainingMonths = Math.max(0, 12 - offer.promoMonths);
    const weightedApr = ((offer.promoApr * offer.promoMonths) + (offer.apr * remainingMonths)) / 12;
    return roundPercent(weightedApr);
  }

  rankTransferTargets(debts = []) {
    return [...debts]
      .filter((debt) => debt.balance > 0)
      .sort((a, b) => {
        if (b.apr !== a.apr) return b.apr - a.apr;
        return b.balance - a.balance;
      });
  }

  buildTransferSequence(offers = [], debts = [], creditScore = 680) {
    const rankedDebts = this.rankTransferTargets(debts);
    const viableOffers = (offers || []).filter((offer) => offer.eligible && creditScore >= offer.minCreditScore);

    const sequence = [];

    for (const offer of viableOffers) {
      let remainingCap = offer.maxTransferAmount > 0 ? offer.maxTransferAmount : Number.MAX_SAFE_INTEGER;
      const effectiveApr = this.calculateOfferEffectiveApr(offer);

      for (const debt of rankedDebts) {
        if (remainingCap <= 0) break;
        if (!this.offerEligibleForDebt(offer, debt, creditScore)) continue;
        if (effectiveApr >= debt.apr) continue;

        const transferAmount = roundMoney(Math.min(remainingCap, debt.balance));
        if (transferAmount <= 0) continue;

        const feeCost = roundMoney((transferAmount * offer.transferFeePercent / 100) + offer.transferFeeFlat);
        const annualCurrentInterest = roundMoney(transferAmount * debt.apr / 100);
        const annualOfferedInterest = roundMoney(transferAmount * effectiveApr / 100);
        const annualSavings = roundMoney(Math.max(0, annualCurrentInterest - annualOfferedInterest - feeCost));

        sequence.push({
          debtId: debt.id,
          debtName: debt.name,
          fromApr: debt.apr,
          toApr: effectiveApr,
          offerId: offer.offerId,
          provider: offer.provider,
          transferAmount,
          transferFeeCost: feeCost,
          annualSavings,
          promoMonths: offer.promoMonths,
          priorityScore: roundPercent((debt.apr - effectiveApr) * Math.max(1, transferAmount / 1000))
        });

        remainingCap = roundMoney(remainingCap - transferAmount);
      }
    }

    return sequence
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .map((item, index) => ({ ...item, step: index + 1 }));
  }

  simulatePayoff(balance, apr, monthlyPayment, maxMonths = 600) {
    let months = 0;
    let remaining = roundMoney(balance);
    let interestPaid = 0;

    const payment = Math.max(1, toNumber(monthlyPayment, 1));
    const monthlyRate = clamp(toNumber(apr, 0), 0, 100) / 100 / 12;

    while (remaining > 0.009 && months < maxMonths) {
      const interest = monthlyRate > 0 ? roundMoney(remaining * monthlyRate) : 0;
      let duePayment = payment;

      if (monthlyRate > 0 && duePayment <= interest) {
        duePayment = roundMoney(interest + Math.max(1, remaining * 0.001));
      }

      duePayment = Math.min(duePayment, roundMoney(remaining + interest));
      const principalPaid = roundMoney(duePayment - interest);

      remaining = roundMoney(Math.max(0, remaining - principalPaid));
      interestPaid = roundMoney(interestPaid + interest);
      months += 1;
    }

    return {
      months,
      interestPaid,
      fullyPaid: remaining <= 0.009
    };
  }

  calculateAprReductionImpact(debts = [], opportunities = []) {
    const opportunityMap = new Map();
    opportunities.forEach((item) => {
      if (!opportunityMap.has(item.debtId)) {
        opportunityMap.set(item.debtId, item);
      }
    });

    const debtImpacts = debts.map((debt) => {
      const opportunity = opportunityMap.get(debt.id);
      const improvedApr = opportunity ? Math.min(debt.apr, opportunity.targetApr ?? opportunity.toApr ?? debt.apr) : debt.apr;

      const current = this.simulatePayoff(debt.balance, debt.apr, Math.max(1, debt.minimumPayment || 1));
      const improved = this.simulatePayoff(debt.balance, improvedApr, Math.max(1, debt.minimumPayment || 1));

      return {
        debtId: debt.id,
        debtName: debt.name,
        currentApr: debt.apr,
        improvedApr,
        currentTimelineMonths: current.months,
        improvedTimelineMonths: improved.months,
        monthsSaved: Math.max(0, current.months - improved.months),
        currentInterest: current.interestPaid,
        improvedInterest: improved.interestPaid,
        interestSaved: roundMoney(Math.max(0, current.interestPaid - improved.interestPaid))
      };
    });

    return {
      debtImpacts,
      totalMonthsSaved: debtImpacts.reduce((sum, item) => sum + item.monthsSaved, 0),
      totalInterestSaved: roundMoney(debtImpacts.reduce((sum, item) => sum + item.interestSaved, 0))
    };
  }

  discover(userId, debts = [], eligibleOffers = [], options = {}) {
    const normalizedDebts = (debts || []).map((debt) => this.normalizeDebt(debt)).filter((debt) => debt.balance > 0);
    if (normalizedDebts.length === 0) return { error: 'No eligible debts provided' };

    const creditScore = clamp(toNumber(options.creditScore, 680), 300, 850);
    const offers = (eligibleOffers || []).map((offer) => this.normalizeOffer(offer));

    const benchmarks = normalizedDebts.map((debt) => this.benchmarkDebt(debt, creditScore));

    const negotiationOpportunities = benchmarks
      .filter((item) => item.negotiationOpportunity)
      .map((item) => ({
        debtId: item.debtId,
        debtName: item.debtName,
        currentApr: item.currentApr,
        targetApr: item.benchmarkApr,
        aprReduction: roundPercent(item.currentApr - item.benchmarkApr),
        annualSavingsPotential: item.annualSavingsPotential,
        message: `You may qualify for ~${item.benchmarkApr}% on ${item.debtName}; current APR is ${item.currentApr}%`
      }))
      .sort((a, b) => b.annualSavingsPotential - a.annualSavingsPotential);

    const transferSequence = this.buildTransferSequence(offers, normalizedDebts, creditScore);
    const transferTopOpportunities = transferSequence.slice(0, 10);

    const mergedOpportunities = [
      ...negotiationOpportunities,
      ...transferTopOpportunities
    ];

    const impact = this.calculateAprReductionImpact(normalizedDebts, mergedOpportunities);

    const totalPotentialAnnualSavings = roundMoney(
      negotiationOpportunities.reduce((sum, item) => sum + item.annualSavingsPotential, 0) +
      transferTopOpportunities.reduce((sum, item) => sum + item.annualSavings, 0)
    );

    return {
      userId,
      discoveryDate: new Date().toISOString(),
      creditProfile: {
        creditScore,
        tier: this.creditTier(creditScore)
      },
      benchmarkAnalysis: benchmarks,
      negotiationOpportunities,
      balanceTransfer: {
        offersAnalyzed: offers.length,
        transferSequence: transferTopOpportunities,
        estimatedTransferSavings: roundMoney(transferTopOpportunities.reduce((sum, item) => sum + item.annualSavings, 0))
      },
      payoffImpact: impact,
      summary: {
        debtsAnalyzed: normalizedDebts.length,
        opportunitiesFound: negotiationOpportunities.length + transferTopOpportunities.length,
        totalPotentialAnnualSavings,
        topAction: transferTopOpportunities[0]
          ? `Start with transferring ${transferTopOpportunities[0].debtName} via ${transferTopOpportunities[0].provider}`
          : negotiationOpportunities[0]
            ? `Negotiate ${negotiationOpportunities[0].debtName} from ${negotiationOpportunities[0].currentApr}% toward ${negotiationOpportunities[0].targetApr}%`
            : 'No strong arbitrage opportunities detected under current assumptions'
      }
    };
  }
}

export default new RateArbitrageEngineService();
