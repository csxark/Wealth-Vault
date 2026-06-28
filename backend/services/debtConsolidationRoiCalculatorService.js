const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const roundMoney = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const roundPercent = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const MAX_SIM_MONTHS = 600;

const DEFAULT_CONSOLIDATION_OPTIONS = {
  personalLoan: {
    apr: 11.99,
    termMonths: 48,
    originationFeePercent: 4,
    fixedFees: 0
  },
  balanceTransfer: {
    apr: 18.99,
    termMonths: 36,
    promoApr: 0,
    promoMonths: 15,
    transferFeePercent: 3,
    fixedFees: 0
  },
  heloc: {
    apr: 8.25,
    termMonths: 120,
    originationFeePercent: 1,
    fixedFees: 250,
    risk: 'variable'
  },
  refinance: {
    apr: 7.5,
    termMonths: 60,
    originationFeePercent: 2,
    fixedFees: 500
  }
};

const RISK_BASE_SCORE = {
  personalLoan: 35,
  balanceTransfer: 55,
  heloc: 70,
  refinance: 45
};

class DebtConsolidationRoiCalculatorService {
  normalizeDebt(debt = {}) {
    const balance = roundMoney(toNumber(debt.balance ?? debt.currentBalance, 0));
    const minimumPayment = roundMoney(toNumber(debt.minimumPayment, 0));
    const apr = clamp(toNumber(debt.apr, 0), 0, 100);

    return {
      id: debt.id,
      name: debt.name || 'Debt',
      type: debt.type || 'other',
      apr,
      balance,
      minimumPayment,
      isFederalStudentLoan: debt.isFederalStudentLoan === true || debt.loanProgram === 'federal'
    };
  }

  shouldKeepSeparate(debt) {
    if (debt.isFederalStudentLoan) {
      return {
        keepSeparate: true,
        reason: 'Federal student loan benefits may be lost if consolidated privately'
      };
    }

    if (debt.apr <= 2.5) {
      return {
        keepSeparate: true,
        reason: 'Existing APR is already very low; consolidation likely reduces ROI'
      };
    }

    return { keepSeparate: false, reason: null };
  }

  calculateMonthlyPayment(principal, apr, termMonths) {
    const p = toNumber(principal, 0);
    const months = Math.max(1, Math.round(toNumber(termMonths, 1)));

    if (p <= 0) return 0;

    const monthlyRate = clamp(toNumber(apr, 0), 0, 100) / 100 / 12;
    if (monthlyRate === 0) return roundMoney(p / months);

    const payment = p * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    return roundMoney(payment);
  }

  simulateLoan(principal, apr, monthlyPayment, maxMonths = MAX_SIM_MONTHS) {
    let balance = roundMoney(principal);
    let interestPaid = 0;
    let totalPaid = 0;
    let months = 0;

    const monthlyRate = clamp(toNumber(apr, 0), 0, 100) / 100 / 12;

    while (balance > 0.009 && months < maxMonths) {
      const interest = monthlyRate > 0 ? roundMoney(balance * monthlyRate) : 0;
      let payment = roundMoney(monthlyPayment);

      if (payment <= interest && monthlyRate > 0) {
        payment = roundMoney(interest + Math.max(1, balance * 0.001));
      }

      payment = Math.min(payment, roundMoney(balance + interest));
      const principalPaid = roundMoney(payment - interest);

      balance = roundMoney(Math.max(0, balance - principalPaid));
      interestPaid = roundMoney(interestPaid + interest);
      totalPaid = roundMoney(totalPaid + payment);
      months += 1;
    }

    return {
      months,
      interestPaid,
      totalPaid,
      remainingBalance: roundMoney(balance),
      fullyPaid: balance <= 0.009
    };
  }

  calculateCurrentTrajectory(debts = []) {
    const debtResults = (debts || []).map((debt) => {
      const effectivePayment = Math.max(1, toNumber(debt.minimumPayment, 0));
      const simulation = this.simulateLoan(debt.balance, debt.apr, effectivePayment);
      return {
        debtId: debt.id,
        name: debt.name,
        type: debt.type,
        balance: debt.balance,
        apr: debt.apr,
        minimumPayment: effectivePayment,
        ...simulation
      };
    });

    const totalInterest = roundMoney(debtResults.reduce((sum, debt) => sum + debt.interestPaid, 0));
    const totalPaid = roundMoney(debtResults.reduce((sum, debt) => sum + debt.totalPaid, 0));
    const combinedMonthlyMinimum = roundMoney(debtResults.reduce((sum, debt) => sum + debt.minimumPayment, 0));
    const timelineMonths = debtResults.length > 0 ? Math.max(...debtResults.map((d) => d.months)) : 0;

    return {
      debtResults,
      combinedMonthlyMinimum,
      timelineMonths,
      totalInterest,
      totalPaid
    };
  }

  buildOptionInputs(options = {}) {
    return {
      personalLoan: { ...DEFAULT_CONSOLIDATION_OPTIONS.personalLoan, ...(options.personalLoan || {}) },
      balanceTransfer: { ...DEFAULT_CONSOLIDATION_OPTIONS.balanceTransfer, ...(options.balanceTransfer || {}) },
      heloc: { ...DEFAULT_CONSOLIDATION_OPTIONS.heloc, ...(options.heloc || {}) },
      refinance: { ...DEFAULT_CONSOLIDATION_OPTIONS.refinance, ...(options.refinance || {}) }
    };
  }

  calculateConsolidationScenario(optionName, option, includedDebts, baseline) {
    const principal = roundMoney(includedDebts.reduce((sum, debt) => sum + debt.balance, 0));
    const termMonths = Math.max(1, Math.round(toNumber(option.termMonths, 1)));
    const apr = clamp(toNumber(option.apr, 0), 0, 100);

    const feePercent = toNumber(option.originationFeePercent ?? option.transferFeePercent, 0);
    const percentFees = roundMoney(principal * Math.max(0, feePercent) / 100);
    const fixedFees = roundMoney(toNumber(option.fixedFees, 0));
    const totalFees = roundMoney(percentFees + fixedFees);

    const financedPrincipal = roundMoney(principal + totalFees);

    let monthlyPayment = this.calculateMonthlyPayment(financedPrincipal, apr, termMonths);
    let simulation;

    if (optionName === 'balanceTransfer' && toNumber(option.promoMonths, 0) > 0) {
      const promoMonths = Math.max(0, Math.round(toNumber(option.promoMonths, 0)));
      const promoApr = clamp(toNumber(option.promoApr, 0), 0, 100);

      const promoMonthlyRate = promoApr / 100 / 12;
      let balanceAfterPromo = financedPrincipal;
      let promoInterestPaid = 0;

      for (let month = 0; month < Math.min(promoMonths, termMonths); month += 1) {
        const interest = roundMoney(balanceAfterPromo * promoMonthlyRate);
        const payment = Math.min(monthlyPayment, roundMoney(balanceAfterPromo + interest));
        const principalPaid = roundMoney(payment - interest);
        balanceAfterPromo = roundMoney(Math.max(0, balanceAfterPromo - principalPaid));
        promoInterestPaid = roundMoney(promoInterestPaid + interest);
      }

      const remainingTerm = Math.max(1, termMonths - promoMonths);
      const reamortizedPayment = this.calculateMonthlyPayment(balanceAfterPromo, apr, remainingTerm);
      const postPromoSimulation = this.simulateLoan(balanceAfterPromo, apr, reamortizedPayment, remainingTerm + 1);

      simulation = {
        months: Math.min(termMonths, promoMonths + postPromoSimulation.months),
        interestPaid: roundMoney(promoInterestPaid + postPromoSimulation.interestPaid),
        totalPaid: roundMoney((monthlyPayment * Math.min(promoMonths, termMonths)) + postPromoSimulation.totalPaid),
        remainingBalance: postPromoSimulation.remainingBalance,
        fullyPaid: postPromoSimulation.fullyPaid
      };

      monthlyPayment = roundMoney((monthlyPayment + reamortizedPayment) / 2);
    } else {
      simulation = this.simulateLoan(financedPrincipal, apr, monthlyPayment, termMonths + 1);
    }

    const baselineInterest = roundMoney(includedDebts.reduce((sum, debt) => {
      const result = baseline.debtResults.find((d) => d.debtId === debt.id);
      return sum + (result ? result.interestPaid : 0);
    }, 0));

    const baselineMonthly = roundMoney(includedDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0));
    const totalCost = roundMoney(simulation.interestPaid + totalFees);
    const netSavings = roundMoney(baselineInterest - totalCost);
    const monthlySavings = roundMoney(baselineMonthly - monthlyPayment);
    const breakEvenMonth = monthlySavings > 0 && totalFees > 0
      ? Math.ceil(totalFees / monthlySavings)
      : totalFees === 0 ? 0 : null;

    const timelineDeltaMonths = roundMoney((includedDebts.length ? Math.max(...includedDebts.map((d) => {
      const result = baseline.debtResults.find((r) => r.debtId === d.id);
      return result ? result.months : 0;
    })) : 0) - simulation.months);

    const riskScore = this.calculateRiskScore(optionName, option, breakEvenMonth, netSavings);

    return {
      option: optionName,
      apr,
      termMonths,
      principal,
      fees: {
        percentFees,
        fixedFees,
        totalFees
      },
      payment: {
        currentMonthly: baselineMonthly,
        consolidatedMonthly: monthlyPayment,
        monthlySavings
      },
      payoff: {
        currentTimelineMonths: includedDebts.length ? Math.max(...includedDebts.map((d) => {
          const result = baseline.debtResults.find((r) => r.debtId === d.id);
          return result ? result.months : 0;
        })) : 0,
        consolidatedTimelineMonths: simulation.months,
        timelineDeltaMonths
      },
      costs: {
        baselineInterest,
        consolidatedInterest: simulation.interestPaid,
        totalConsolidationCost: totalCost,
        netSavings
      },
      roi: {
        breakEvenMonth,
        roiPercent: principal > 0 ? roundPercent((netSavings / principal) * 100) : 0,
        positive: netSavings > 0
      },
      riskProfile: riskScore
    };
  }

  calculateRiskScore(optionName, option, breakEvenMonth, netSavings) {
    let score = toNumber(RISK_BASE_SCORE[optionName], 50);

    if (optionName === 'heloc' || option.risk === 'variable') score += 15;
    if (optionName === 'balanceTransfer' && toNumber(option.promoMonths, 0) > 0) score += 10;
    if (breakEvenMonth === null) score += 15;
    if (toNumber(breakEvenMonth, 0) > 24) score += 10;
    if (netSavings <= 0) score += 20;

    score = clamp(score, 0, 100);

    let level = 'low';
    if (score >= 70) level = 'high';
    else if (score >= 45) level = 'moderate';

    return {
      score,
      level,
      notes: [
        optionName === 'heloc' ? 'Secured by home equity and often variable rate' : null,
        optionName === 'balanceTransfer' ? 'Promo window discipline required to avoid reversion APR' : null,
        netSavings <= 0 ? 'Negative or neutral savings versus current trajectory' : null,
        breakEvenMonth === null ? 'Fees not recovered from monthly savings under current assumptions' : null
      ].filter(Boolean)
    };
  }

  rankScenarios(scenarios = []) {
    return [...scenarios].sort((a, b) => {
      if (b.costs.netSavings !== a.costs.netSavings) {
        return b.costs.netSavings - a.costs.netSavings;
      }
      return a.riskProfile.score - b.riskProfile.score;
    }).map((scenario, index) => ({
      ...scenario,
      rank: index + 1
    }));
  }

  optimize(userId, debts = [], options = {}) {
    const normalizedDebts = (debts || []).map((debt) => this.normalizeDebt(debt)).filter((debt) => debt.balance > 0);

    if (normalizedDebts.length === 0) {
      return { error: 'No eligible debts provided' };
    }

    const partitioned = normalizedDebts.reduce((acc, debt) => {
      const decision = this.shouldKeepSeparate(debt);
      if (decision.keepSeparate) {
        acc.keepSeparate.push({
          ...debt,
          reason: decision.reason
        });
      } else {
        acc.eligibleForConsolidation.push(debt);
      }
      return acc;
    }, { keepSeparate: [], eligibleForConsolidation: [] });

    if (partitioned.eligibleForConsolidation.length === 0) {
      return {
        userId,
        analysisDate: new Date().toISOString(),
        keepSeparateDebts: partitioned.keepSeparate,
        message: 'All debts are better kept separate under current assumptions',
        scenarios: []
      };
    }

    const baselineTrajectory = this.calculateCurrentTrajectory(normalizedDebts);
    const optionInputs = this.buildOptionInputs(options);

    const scenarioResults = Object.entries(optionInputs).map(([optionName, option]) =>
      this.calculateConsolidationScenario(optionName, option, partitioned.eligibleForConsolidation, baselineTrajectory)
    );

    const rankedScenarios = this.rankScenarios(scenarioResults);
    const bestScenario = rankedScenarios[0] || null;

    return {
      userId,
      analysisDate: new Date().toISOString(),
      baseline: {
        totalDebtBalance: roundMoney(normalizedDebts.reduce((sum, debt) => sum + debt.balance, 0)),
        totalInterest: baselineTrajectory.totalInterest,
        totalPaid: baselineTrajectory.totalPaid,
        timelineMonths: baselineTrajectory.timelineMonths,
        monthlyMinimum: baselineTrajectory.combinedMonthlyMinimum
      },
      keepSeparateDebts: partitioned.keepSeparate,
      consolidatedDebts: partitioned.eligibleForConsolidation,
      scenarios: rankedScenarios,
      recommendation: bestScenario
        ? {
            bestOption: bestScenario.option,
            rank: bestScenario.rank,
            netSavings: bestScenario.costs.netSavings,
            monthlySavings: bestScenario.payment.monthlySavings,
            breakEvenMonth: bestScenario.roi.breakEvenMonth,
            riskLevel: bestScenario.riskProfile.level,
            message: bestScenario.costs.netSavings > 0
              ? `Best option is ${bestScenario.option} with estimated net savings of $${bestScenario.costs.netSavings.toLocaleString()}`
              : `No positive ROI option found; keep current strategy or adjust assumptions`
          }
        : null
    };
  }
}

export default new DebtConsolidationRoiCalculatorService();
