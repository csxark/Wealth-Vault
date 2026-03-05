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
 * Payoff Order Optimization Engine
 * Analyzes and ranks optimal debt payoff sequences:
 * - Models 4 strategies: Avalanche, Snowball, Hybrid, Custom
 * - Calculates total interest, payoff timeline, psychological wins per strategy
 * - Identifies sweet-spot hybrid (small debts for motivation, then avalanche)
 * - Tests robustness with variable income scenarios
 * - Ranks by user preference weights (interest vs speed vs early wins)
 * - Generates month-by-month payoff calendar with milestones
 */
class PayoffOrderOptimizationEngineService {
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
      type: debt.type || 'personal-loan', // auto-loan, mortgage, student-loan, personal-loan, heloc, credit-card
      priority: toNumber(debt.priority) || 0 // For custom ordering
    };
  }

  /**
   * Simulate Avalanche strategy (highest APR first)
   */
  simulateAvalanche(debts, monthlyExtraPayment = 0) {
    // Sort by APR descending (highest APR first)
    const sorted = [...debts].sort((a, b) => b.apr - a.apr);
    return this.simulatePayoffSequence(sorted, monthlyExtraPayment, 'Avalanche');
  }

  /**
   * Simulate Snowball strategy (smallest balance first)
   */
  simulateSnowball(debts, monthlyExtraPayment = 0) {
    // Sort by balance ascending (smallest first)
    const sorted = [...debts].sort((a, b) => a.currentBalance - b.currentBalance);
    return this.simulatePayoffSequence(sorted, monthlyExtraPayment, 'Snowball');
  }

  /**
   * Simulate Hybrid strategy (small debts first for wins, then avalanche)
   * - Identify debts < $5,000 and pay them off first for psychological wins
   * - Then switch to avalanche for remaining debts
   */
  simulateHybrid(debts, monthlyExtraPayment = 0) {
    const smallDebts = debts.filter(d => d.currentBalance < 5000);
    const largeDebts = debts.filter(d => d.currentBalance >= 5000);
    
    // Sort small debts by balance (payoff quickly for wins)
    const sortedSmall = smallDebts.sort((a, b) => a.currentBalance - b.currentBalance);
    
    // Sort large debts by APR (optimize interest)
    const sortedLarge = largeDebts.sort((a, b) => b.apr - a.apr);
    
    // Combine: small first, then avalanche
    const sorted = [...sortedSmall, ...sortedLarge];
    return this.simulatePayoffSequence(sorted, monthlyExtraPayment, 'Hybrid');
  }

  /**
   * Simulate Custom strategy (user-specified priority order)
   */
  simulateCustom(debts, monthlyExtraPayment = 0) {
    // Sort by priority field (lower priority number = first to pay)
    const sorted = [...debts].sort((a, b) => a.priority - b.priority);
    return this.simulatePayoffSequence(sorted, monthlyExtraPayment, 'Custom');
  }

  /**
   * Core payoff simulation algorithm
   */
  simulatePayoffSequence(debtOrder, monthlyExtraPayment = 0, strategyName = 'Unknown') {
    const debts = debtOrder.map(d => ({ ...d })); // Clone
    let totalInterestPaid = 0;
    let monthsPassed = 0;
    const payoffTimeline = [];
    const debtsPaidOff = [];
    let currentExtraPayment = monthlyExtraPayment;

    // Simulate month by month until all debts paid off
    while (debts.some(d => d.currentBalance > 0.01)) {
      monthsPassed++;
      
      if (monthsPassed > 600) break; // Safety limit (50 years)

      let monthlyInterest = 0;
      let monthlyPayments = 0;

      // Calculate interest for all debts
      for (const debt of debts) {
        if (debt.currentBalance > 0.01) {
          const monthlyRate = debt.apr / 100 / 12;
          const interestCharge = roundMoney(debt.currentBalance * monthlyRate);
          monthlyInterest += interestCharge;
          totalInterestPaid += interestCharge;
          debt.currentBalance = roundMoney(debt.currentBalance + interestCharge);
        }
      }

      // Allocate payment to highest-priority debt first
      let remainingPayment = currentExtraPayment;

      for (const debt of debts) {
        if (debt.currentBalance > 0.01) {
          const owe = Math.max(debt.minimumPayment, debt.currentBalance); // Pay minimum or remaining balance
          const payment = Math.min(owe, remainingPayment + debt.minimumPayment);
          
          debt.currentBalance = Math.max(0, roundMoney(debt.currentBalance - payment));
          monthlyPayments += payment;

          if (debt.currentBalance <= 0.01 && !debtsPaidOff.find(d => d.id === debt.id)) {
            debtsPaidOff.push({
              debtId: debt.id,
              debtName: debt.name,
              paidOffMonth: monthsPassed
            });
          }

          remainingPayment = Math.max(0, remainingPayment + debt.minimumPayment - payment);

          if (remainingPayment <= 0) break;
        }
      }

      // Record monthly milestone
      if (monthsPassed % 12 === 0 || debtsPaidOff.length > 0) {
        payoffTimeline.push({
          month: monthsPassed,
          debtsPaidOff: debtsPaidOff.length,
          totalInterestPaid: roundMoney(totalInterestPaid),
          debtJustPaidOff: debtsPaidOff.filter(d => d.paidOffMonth === monthsPassed)
        });
      }
    }

    return {
      strategyName,
      totalInterestPaid: roundMoney(totalInterestPaid),
      payoffTimelineMonths: monthsPassed,
      payoffTimelineYears: roundPercent(monthsPassed / 12),
      psychologicalWins: debtsPaidOff.length, // Number of debts completely paid off
      debtsPaidOffOrder: debtsPaidOff,
      payoffTimeline,
      debtOrder: debtOrder.map(d => ({
        debtId: d.id,
        debtName: d.name,
        originalBalance: d.currentBalance,
        apr: d.apr
      }))
    };
  }

  /**
   * Identify early wins (debts that could be paid off in first 12 months)
   */
  identifyEarlyWins(debts) {
    const earlyWins = [];
    
    for (const debt of debts) {
      // Can we pay off this debt in 12 months with minimum payments?
      let balance = debt.currentBalance;
      for (let month = 0; month < 12; month++) {
        const monthlyRate = debt.apr / 100 / 12;
        balance = balance + (balance * monthlyRate) - debt.minimumPayment;
        if (balance <= 0) {
          earlyWins.push({
            debtId: debt.id,
            debtName: debt.name,
            balance: debt.currentBalance,
            monthsToPayoff: month + 1,
            isEarlyWin: true
          });
          break;
        }
      }
    }

    return earlyWins.sort((a, b) => a.monthsToPayoff - b.monthsToPayoff);
  }

  /**
   * Test strategy robustness with variable income scenarios
   */
  simulateVariableIncomeScenarios(debts, baseExtraPayment) {
    const scenarios = [
      { name: 'Optimistic', multiplier: 1.2 }, // 20% more extra payment
      { name: 'Base Case', multiplier: 1.0 },
      { name: 'Pessimistic', multiplier: 0.7 } // 30% less extra payment
    ];

    const results = {};

    for (const scenario of scenarios) {
      const adjustedPayment = baseExtraPayment * scenario.multiplier;
      const avalanche = this.simulateAvalanche(debts, adjustedPayment);
      const snowball = this.simulateSnowball(debts, adjustedPayment);
      const hybrid = this.simulateHybrid(debts, adjustedPayment);

      results[scenario.name] = {
        scenarioName: scenario.name,
        extraPaymentMultiplier: scenario.multiplier,
        avalanche: {
          totalInterest: avalanche.totalInterestPaid,
          payoffMonths: avalanche.payoffTimelineMonths,
          wins: avalanche.psychologicalWins
        },
        snowball: {
          totalInterest: snowball.totalInterestPaid,
          payoffMonths: snowball.payoffTimelineMonths,
          wins: snowball.psychologicalWins
        },
        hybrid: {
          totalInterest: hybrid.totalInterestPaid,
          payoffMonths: hybrid.payoffTimelineMonths,
          wins: hybrid.psychologicalWins
        }
      };
    }

    return results;
  }

  /**
   * Rank strategies by user preferences
   */
  rankStrategies(strategies, preferences = {}) {
    const weights = {
      minimizeInterest: Math.max(0, Math.min(1, toNumber(preferences.minimizeInterest) || 0.33)),
      fastestCompletion: Math.max(0, Math.min(1, toNumber(preferences.fastestCompletion) || 0.33)),
      earlyWins: Math.max(0, Math.min(1, toNumber(preferences.earlyWins) || 0.34))
    };

    // Normalize weights to sum to 1
    const totalWeight = weights.minimizeInterest + weights.fastestCompletion + weights.earlyWins;
    if (totalWeight > 0) {
      weights.minimizeInterest /= totalWeight;
      weights.fastestCompletion /= totalWeight;
      weights.earlyWins /= totalWeight;
    }

    // Find min/max for normalization
    const interestValues = strategies.map(s => s.totalInterestPaid);
    const timelineValues = strategies.map(s => s.payoffTimelineMonths);
    const wins = strategies.map(s => s.psychologicalWins);

    const minInterest = Math.min(...interestValues);
    const maxInterest = Math.max(...interestValues);
    const minTime = Math.min(...timelineValues);
    const maxTime = Math.max(...timelineValues);
    const minWins = Math.min(...wins);
    const maxWins = Math.max(...wins);

    // Score each strategy (0-100)
    const ranked = strategies.map(strategy => {
      // Interest score: lower is better (100 = minimum interest)
      const interestRange = maxInterest - minInterest;
      const interestScore = interestRange > 0
        ? ((maxInterest - strategy.totalInterestPaid) / interestRange) * 100
        : 50;

      // Timeline score: lower is better (100 = minimum timeline)
      const timeRange = maxTime - minTime;
      const timeScore = timeRange > 0
        ? ((maxTime - strategy.payoffTimelineMonths) / timeRange) * 100
        : 50;

      // Wins score: higher is better (100 = maximum wins)
      const winsRange = maxWins - minWins;
      const winsScore = winsRange > 0
        ? ((strategy.psychologicalWins - minWins) / winsRange) * 100
        : 50;

      // Weighted score
      const weightedScore = roundPercent(
        (interestScore * weights.minimizeInterest) +
        (timeScore * weights.fastestCompletion) +
        (winsScore * weights.earlyWins)
      );

      return {
        strategyName: strategy.strategyName,
        totalInterestPaid: strategy.totalInterestPaid,
        payoffTimelineMonths: strategy.payoffTimelineMonths,
        psychologicalWins: strategy.psychologicalWins,
        interestScore,
        timeScore,
        winsScore,
        weightedScore,
        debtOrder: strategy.debtOrder
      };
    });

    // Sort by weighted score descending
    return ranked.sort((a, b) => b.weightedScore - a.weightedScore);
  }

  /**
   * Generate month-by-month payoff calendar with milestones
   */
  generatePayoffCalendar(debts, debtOrder, extraPayment = 0) {
    const debtsClone = debtOrder.map(d => ({ ...d }));
    const calendar = [];
    let totalInterest = 0;
    let month = 0;

    while (debtsClone.some(d => d.currentBalance > 0.01) && month < 600) {
      month++;
      const monthData = {
        month,
        year: Math.ceil(month / 12),
        debts: []
      };

      // Calculate interest and payments
      for (const debt of debtsClone) {
        if (debt.currentBalance > 0.01) {
          const monthlyRate = debt.apr / 100 / 12;
          const interest = roundMoney(debt.currentBalance * monthlyRate);
          const payment = Math.min(debt.currentBalance + interest, debt.minimumPayment + extraPayment);
          
          totalInterest += interest;
          debt.currentBalance = Math.max(0, roundMoney(debt.currentBalance + interest - payment));

          monthData.debts.push({
            debtId: debt.id,
            debtName: debt.name,
            balance: debt.currentBalance,
            interest,
            payment
          });
        }
      }

      monthData.totalMonthlyInterest = roundMoney(
        monthData.debts.reduce((sum, d) => sum + d.interest, 0)
      );
      monthData.totalMonthlyPayments = roundMoney(
        monthData.debts.reduce((sum, d) => sum + d.payment, 0)
      );
      monthData.cumulativeInterest = roundMoney(totalInterest);

      // Record milestones (yearly + debt payoff)
      if (month % 12 === 0 || monthData.debts.some(d => d.balance === 0)) {
        calendar.push(monthData);
      }
    }

    return {
      totalMonths: month,
      totalYears: roundPercent(month / 12),
      totalInterestPaid: roundMoney(totalInterest),
      calendar: calendar.slice(0, 60) // Return first 5 years worth
    };
  }

  /**
   * Generate sweet-spot hybrid recommendation
   */
  generateSweetSpotHybrid(debts) {
    const smallDebts = debts.filter(d => d.currentBalance < 5000);
    const largeDebts = debts.filter(d => d.currentBalance >= 5000);

    if (smallDebts.length === 0) {
      return {
        reason: 'No small debts found for early wins',
        recommendation: 'Consider regular Avalanche strategy'
      };
    }

    // Calculate how long to pay off small debts
    const smallDebtTotalBalance = smallDebts.reduce((sum, d) => sum + d.currentBalance, 0);
    const smallDebtTotalMinPayment = smallDebts.reduce((sum, d) => sum + d.minimumPayment, 0);
    const monthsForSmallDebts = Math.ceil(smallDebtTotalBalance / smallDebtTotalMinPayment);

    // By paying off small debts first, how much interest is avoided on large debts?
    const largeDebtInterestSavings = largeDebts.reduce((sum, d) => {
      const monthlyRate = d.apr / 100 / 12;
      const monthlyInterest = d.currentBalance * monthlyRate;
      return sum + (monthlyInterest * monthsForSmallDebts);
    }, 0);

    return {
      reason: `Eliminate ${smallDebts.length} small debts for psychological motivation`,
      estimatedMonthsPhase1: monthsForSmallDebts,
      debtsInPhase1: smallDebts.map(d => ({ id: d.id, name: d.name, balance: d.currentBalance })),
      phase2Strategy: 'Avalanche on remaining large debts',
      estimatedInterestSavingsFromWins: roundMoney(largeDebtInterestSavings),
      psychologicalBenefit: `Clear ${smallDebts.length} debts quickly, build momentum for larger debts`,
      recommendation: 'Consider Hybrid strategy for optimal balance of motivation and savings'
    };
  }

  /**
   * Main orchestrator: Optimize payoff order
   */
  optimize(debts, preferences = {}, monthlyExtraPayment = 0) {
    // Normalize inputs
    const normalizedDebts = debts.map(d => this.normalizeDebt(d));

    if (normalizedDebts.length === 0) {
      return { error: 'No debts provided' };
    }

    if (normalizedDebts.length === 1) {
      return {
        debts: normalizedDebts,
        message: 'Only one debt - no optimization needed',
        recommendation: {
          strategyName: 'Single Debt',
          totalInterestPaid: roundMoney(normalizedDebts[0].currentBalance * (normalizedDebts[0].apr / 100)),
          payoffTimelineMonths: normalizedDebts[0].monthsRemaining,
          psychologicalWins: 1
        }
      };
    }

    // Simulate all strategies
    const avalanche = this.simulateAvalanche(normalizedDebts, monthlyExtraPayment);
    const snowball = this.simulateSnowball(normalizedDebts, monthlyExtraPayment);
    const hybrid = this.simulateHybrid(normalizedDebts, monthlyExtraPayment);
    const custom = this.simulateCustom(normalizedDebts, monthlyExtraPayment);

    const allStrategies = [avalanche, snowball, hybrid, custom];

    // Rank by user preferences
    const ranked = this.rankStrategies(allStrategies, preferences);

    // Identify early wins
    const earlyWins = this.identifyEarlyWins(normalizedDebts);

    // Generate sweet-spot hybrid
    const sweetSpot = this.generateSweetSpotHybrid(normalizedDebts);

    // Test variable income scenarios
    const incomeScenarios = this.simulateVariableIncomeScenarios(normalizedDebts, monthlyExtraPayment);

    // Generate payoff calendar for top recommendation
    const topRecommendation = ranked[0];
    const payoffCalendar = this.generatePayoffCalendar(
      normalizedDebts,
      normalizedDebts.sort((a, b) => {
        if (topRecommendation.strategyName === 'Avalanche') return b.apr - a.apr;
        if (topRecommendation.strategyName === 'Snowball') return a.currentBalance - b.currentBalance;
        if (topRecommendation.strategyName === 'Hybrid') {
          const aSmall = a.currentBalance < 5000;
          const bSmall = b.currentBalance < 5000;
          if (aSmall !== bSmall) return bSmall - aSmall;
          return a.currentBalance - b.currentBalance;
        }
        return a.priority - b.priority;
      }),
      monthlyExtraPayment
    );

    return {
      debts: normalizedDebts.map(d => ({
        id: d.id,
        name: d.name,
        balance: d.currentBalance,
        apr: d.apr,
        monthlyPayment: d.minimumPayment,
        type: d.type
      })),
      strategies: ranked,
      topRecommendation: {
        ...ranked[0],
        payoffCalendar: payoffCalendar.calendar.slice(0, 12), // First year detailed
        totalBenefit: `Save $${roundMoney(ranked[2]?.totalInterestPaid - ranked[0]?.totalInterestPaid || 0)} vs worst strategy`
      },
      earlyWins,
      sweetSpotHybrid: sweetSpot,
      variableIncomeScenarios: incomeScenarios,
      summary: {
        totalDebtPortfolio: roundMoney(normalizedDebts.reduce((sum, d) => sum + d.currentBalance, 0)),
        recommendedStrategy: ranked[0].strategyName,
        estimatedTotalInterest: ranked[0].totalInterestPaid,
        estimatedPayoffMonths: ranked[0].payoffTimelineMonths,
        estimatedPayoffYears: roundPercent(ranked[0].payoffTimelineMonths / 12),
        expectedDebtPayOffCount: ranked[0].psychologicalWins,
        savingsVsWorstStrategy: roundMoney(ranked[ranked.length - 1].totalInterestPaid - ranked[0].totalInterestPaid),
        monthlyExtraPayment: monthlyExtraPayment
      }
    };
  }
}

module.exports = new PayoffOrderOptimizationEngineService();
