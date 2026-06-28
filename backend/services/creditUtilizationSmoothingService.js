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
 * Credit Utilization Smoothing Engine
 * Optimizes credit utilization to maximize credit score by:
 * - Forecasting statement-time utilization
 * - Recommending pre-close micro-payments
 * - Prioritizing high-impact cards
 * - Estimating score improvement potential
 * - Building monthly utilization control plans
 */
class CreditUtilizationSmoothingService {
  /**
   * Credit score impact model by utilization level
   * Based on empirical credit scoring research
   */
  getUtilizationImpactModel() {
    return {
      benchmarks: {
        excellent: { threshold: 10, scoreContribution: 95 },
        veryGood: { threshold: 30, scoreContribution: 85 },
        good: { threshold: 50, scoreContribution: 70 },
        fair: { threshold: 70, scoreContribution: 50 },
        poor: { threshold: 90, scoreContribution: 20 },
        maxed: { threshold: 100, scoreContribution: 0 }
      },
      scoreMultiplier: {
        // Each 1% reduction in utilization improves score by ~X points (varies by tier)
        excellent_to_veryGood: 1.5, // Very sensitive
        veryGood_to_good: 1.2,
        good_to_fair: 0.8,
        fair_to_poor: 0.5,
        poor_to_maxed: 0.2
      }
    };
  }

  /**
   * Normalize credit card data
   */
  normalizeCard(card) {
    return {
      id: card.id || `card_${Math.random()}`,
      name: card.name || 'Card',
      issuer: card.issuer || 'Unknown',
      creditLimit: roundMoney(card.creditLimit),
      currentBalance: roundMoney(card.currentBalance),
      statementCloseDate: clamp(toNumber(card.statementCloseDate), 1, 31),
      daysUntilStatementClose: clamp(toNumber(card.daysUntilStatementClose), 0, 30),
      recentTransactions: Array.isArray(card.recentTransactions) 
        ? card.recentTransactions.map(t => ({ amount: roundMoney(t.amount), type: t.type || 'purchase' }))
        : [],
      paymentsPending: roundMoney(card.paymentsPending || 0),
      estimatedMonthlySpend: roundMoney(card.estimatedMonthlySpend || card.creditLimit * 0.3)
    };
  }

  /**
   * Calculate current utilization percentage
   */
  calculateCurrentUtilization(balance, creditLimit) {
    if (creditLimit <= 0) return 0;
    return roundPercent((balance / creditLimit) * 100);
  }

  /**
   * Forecast utilization at statement close based on pending transactions
   */
  forecastUtilization(card) {
    // Sum pending/recent transactions
    const pendingTransactions = card.recentTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    // Estimate additional spending until statement close (pro-rata based on days remaining)
    const daysInMonth = 30;
    const dailySpendRate = card.estimatedMonthlySpend / daysInMonth;
    const projectedTransactions = dailySpendRate * card.daysUntilStatementClose;

    // Total projected balance at statement close
    const projectedBalance = card.currentBalance + pendingTransactions + projectedTransactions - card.paymentsPending;
    const projectedBalanceAdjusted = Math.max(0, roundMoney(projectedBalance));

    const forecastedUtilization = this.calculateCurrentUtilization(projectedBalanceAdjusted, card.creditLimit);

    return {
      currentUtilization: this.calculateCurrentUtilization(card.currentBalance, card.creditLimit),
      currentBalance: card.currentBalance,
      pendingTransactions: roundMoney(pendingTransactions),
      projectedSpend: roundMoney(projectedTransactions),
      forecastedBalance: projectedBalanceAdjusted,
      forecastedUtilization: forecastedUtilization,
      daysUntilStatementClose: card.daysUntilStatementClose,
      riskLevel: forecastedUtilization > 50 ? 'HIGH' : forecastedUtilization > 30 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Recommend micro-payment to hit target utilization
   */
  recommendMicroPaymentTarget(currentUtilization, targetUtilization, balance, creditLimit) {
    if (currentUtilization <= targetUtilization) {
      return {
        paymentNeeded: 0,
        newUtilization: currentUtilization,
        recommendation: 'No payment needed - already below target'
      };
    }

    // Solve for payment: (balance - payment) / creditLimit = targetUtilization / 100
    const paymentNeeded = balance - (creditLimit * targetUtilization / 100);
    const paymentAdjusted = Math.max(0, roundMoney(paymentNeeded));
    const newUtilization = this.calculateCurrentUtilization(balance - paymentAdjusted, creditLimit);

    return {
      paymentNeeded: paymentAdjusted,
      newUtilization: newUtilization,
      utilizationReduction: roundPercent(currentUtilization - newUtilization),
      recommendation: paymentAdjusted > 0 
        ? `Pay ${roundMoney(paymentAdjusted)} to reduce utilization from ${currentUtilization}% to ${newUtilization}%`
        : 'Already at or below target utilization'
    };
  }

  /**
   * Calculate credit score impact from utilization change
   */
  calculateScoreImpact(utilizationBefore, utilizationAfter) {
    const model = this.getUtilizationImpactModel();
    const benchmarks = Object.values(model.benchmarks).sort((a, b) => a.threshold - b.threshold);

    // Find score contribution for before and after
    const findScore = (util) => {
      for (let i = benchmarks.length - 1; i >= 0; i--) {
        if (util >= benchmarks[i].threshold) {
          return benchmarks[i].scoreContribution;
        }
      }
      return 0;
    };

    const scoreBefore = findScore(utilizationBefore);
    const scoreAfter = findScore(utilizationAfter);
    const scoreImprovement = scoreAfter - scoreBefore;

    // Estimate variability (±10 points due to other factors)
    return {
      scoreBefore,
      scoreAfter,
      scoreImprovement,
      estimatedRange: {
        min: Math.max(0, scoreImprovement - 10),
        max: scoreImprovement + 10
      },
      confidence: 'MEDIUM (utilization is ~30% of score; other factors apply)',
      observation: utilizationAfter < 10 
        ? 'Excellent utilization - highest score tier'
        : utilizationAfter < 30 
        ? 'Very good utilization - strong score contribution'
        : utilizationAfter < 50 
        ? 'Good utilization - moderate score benefit'
        : 'Fair utilization - limited score benefit from reduction'
    };
  }

  /**
   * Prioritize cards by score-improvement potential
   */
  prioritizeCardsByScoreImpact(cards) {
    return cards
      .map(card => {
        const forecast = this.forecastUtilization(card);
        
        // Target utilization strategy: aim for <30% for very good score
        const targetUtilization = 30;
        const microPayment = this.recommendMicroPaymentTarget(
          forecast.forecastedUtilization,
          targetUtilization,
          forecast.forecastedBalance,
          card.creditLimit
        );

        const scoreImpact = this.calculateScoreImpact(
          forecast.forecastedUtilization,
          microPayment.newUtilization
        );

        // Priority score: higher improvement + higher risk = higher priority
        const utilizationGap = Math.max(0, forecast.forecastedUtilization - targetUtilization);
        const improvementPotential = scoreImpact.scoreImprovement;
        const priorityScore = (improvementPotential * 10) + (utilizationGap * 2);

        return {
          ...card,
          forecast,
          microPayment,
          scoreImpact,
          priorityScore: roundPercent(priorityScore)
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Build monthly utilization control plan
   */
  buildUtilizationControlPlan(cards, targetUtilizations = {}) {
    const prioritizedCards = this.prioritizeCardsByScoreImpact(cards);

    // Default targets if not provided
    const defaultTargets = {
      excellent: 10,
      veryGood: 30,
      good: 50
    };

    const plan = {
      cards: prioritizedCards,
      timeline: {
        today: new Date().toISOString().split('T')[0],
        statementCloseWindow: 'Next 0-30 days (varies by card)',
        implementationPhase: '3-5 days before statement close'
      },
      strategies: []
    };

    // Strategy 1: Urgent micro-payments (HIGH risk cards)
    const highRiskCards = prioritizedCards.filter(c => c.forecast.riskLevel === 'HIGH');
    if (highRiskCards.length > 0) {
      plan.strategies.push({
        priority: 1,
        strategy: 'Urgent Utilization Control',
        targetUtilization: defaultTargets.veryGood,
        affectedCards: highRiskCards.map(c => ({
          name: c.name,
          issuer: c.issuer,
          currentUtilization: `${c.forecast.currentUtilization}%`,
          forecastedUtilization: `${c.forecast.forecastedUtilization}%`,
          microPaymentNeeded: c.microPayment.paymentNeeded,
          targetUtilization: defaultTargets.veryGood,
          newUtilization: `${c.microPayment.newUtilization}%`,
          scoreImprovement: `${c.scoreImpact.scoreImprovement} points (±10)`
        })),
        timeline: '3-5 days before statement close (urgent)',
        expectedScoreGain: highRiskCards.reduce((sum, c) => sum + c.scoreImpact.scoreImprovement, 0),
        totalPaymentRequired: roundMoney(highRiskCards.reduce((sum, c) => sum + c.microPayment.paymentNeeded, 0))
      });
    }

    // Strategy 2: Preventive micro-payments (MEDIUM risk cards)
    const mediumRiskCards = prioritizedCards.filter(c => c.forecast.riskLevel === 'MEDIUM');
    if (mediumRiskCards.length > 0) {
      plan.strategies.push({
        priority: 2,
        strategy: 'Preventive Utilization Reduction',
        targetUtilization: defaultTargets.good,
        affectedCards: mediumRiskCards.map(c => ({
          name: c.name,
          issuer: c.issuer,
          currentUtilization: `${c.forecast.currentUtilization}%`,
          forecastedUtilization: `${c.forecast.forecastedUtilization}%`,
          microPaymentNeeded: c.microPayment.paymentNeeded,
          targetUtilization: defaultTargets.good,
          newUtilization: `${c.microPayment.newUtilization}%`,
          scoreImprovement: `${c.scoreImpact.scoreImprovement} points (±10)`
        })),
        timeline: '1-2 weeks before statement close',
        expectedScoreGain: mediumRiskCards.reduce((sum, c) => sum + c.scoreImpact.scoreImprovement, 0),
        totalPaymentRequired: roundMoney(mediumRiskCards.reduce((sum, c) => sum + c.microPayment.paymentNeeded, 0))
      });
    }

    // Strategy 3: Optimization micro-payments (LOW risk cards)
    const lowRiskCards = prioritizedCards.filter(c => c.forecast.riskLevel === 'LOW');
    if (lowRiskCards.length > 0) {
      plan.strategies.push({
        priority: 3,
        strategy: 'Score Optimization',
        targetUtilization: defaultTargets.excellent,
        affectedCards: lowRiskCards.map(c => ({
          name: c.name,
          issuer: c.issuer,
          currentUtilization: `${c.forecast.currentUtilization}%`,
          forecastedUtilization: `${c.forecast.forecastedUtilization}%`,
          microPaymentNeeded: c.microPayment.paymentNeeded,
          targetUtilization: defaultTargets.excellent,
          newUtilization: `${c.microPayment.newUtilization}%`,
          scoreImprovement: `${c.scoreImpact.scoreImprovement} points (±10)`
        })),
        timeline: 'Flexible - any time before statement close',
        expectedScoreGain: lowRiskCards.reduce((sum, c) => sum + c.scoreImpact.scoreImprovement, 0),
        totalPaymentRequired: roundMoney(lowRiskCards.reduce((sum, c) => sum + c.microPayment.paymentNeeded, 0))
      });
    }

    // Calculate totals
    const totalPaymentRequired = roundMoney(
      plan.strategies.reduce((sum, s) => sum + s.totalPaymentRequired, 0)
    );
    const totalScoreGain = Math.round(
      plan.strategies.reduce((sum, s) => sum + s.expectedScoreGain, 0)
    );

    plan.summary = {
      totalCards: cards.length,
      cardsAtRisk: highRiskCards.length,
      strategiesToImplement: plan.strategies.length,
      totalMicroPaymentsNeeded: totalPaymentRequired,
      estimatedScoreImprovement: totalScoreGain,
      implementationEffort: highRiskCards.length > 0 ? 'High (requires immediate action)' : 'Medium (planned action)',
      recurringMonthly: true,
      monthlyEffort: 'Low (set calendar reminder for statement close)'
    };

    // Add recommendations
    plan.recommendations = [
      {
        priority: 1,
        recommendation: 'Set calendar reminder for 5 days before statement close',
        action: 'Review forecasted utilization and execute micro-payments',
        benefit: 'Prevents last-minute scrambling; stays ahead of credit reporting'
      },
      {
        priority: 2,
        recommendation: 'Automate micro-payments where possible',
        action: 'Use online banking to schedule payments on specific dates',
        benefit: 'Eliminates manual effort; ensures consistency'
      },
      {
        priority: 3,
        recommendation: 'Monitor actual vs. forecasted spending',
        action: 'Adjust projected spend estimate if actual varies significantly',
        benefit: 'Improves forecast accuracy over time'
      },
      {
        priority: 4,
        recommendation: 'Request credit limit increases',
        action: 'Higher limits reduce utilization % without spending less',
        benefit: 'Automatic score improvement; gives payment flexibility'
      }
    ];

    return plan;
  }

  /**
   * Main orchestrator: Generate smooth utilization plan
   */
  smooth(cards, targetUtilizations = {}) {
    // Normalize inputs
    const normalizedCards = cards.map(c => this.normalizeCard(c));

    if (normalizedCards.length === 0) {
      return {
        cards: [],
        error: 'No credit cards provided'
      };
    }

    const plan = this.buildUtilizationControlPlan(normalizedCards, targetUtilizations);

    return {
      success: true,
      cards: normalizedCards,
      plan,
      disclaimers: [
        'Score estimates based on utilization impact; actual scores depend on multiple factors',
        'Implementation requires disciplined payment execution 5 days before statement close',
        'Results typically visible within 1-2 billing cycles after implementation',
        'Credit score improvements may be offset by new credit inquiries or other factors'
      ]
    };
  }
}

module.exports = new CreditUtilizationSmoothingService();
