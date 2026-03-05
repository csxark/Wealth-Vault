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
 * Minimum Payment Shock Predictor
 * Predicts and prevents sudden minimum payment jumps by:
 * - Forecasting next 3-6 months of minimum payments
 * - Detecting APR change triggers
 * - Quantifying cash-flow impact
 * - Triggering early-warning alerts
 * - Recommending preventive actions
 */
class MinimumPaymentShockPredictorService {
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
      type: debt.type || 'credit-card', // credit-card, auto-loan, student-loan, heloc, personal-loan
      minimumPaymentPercent: roundPercent(debt.minimumPaymentPercent || 2), // % of balance
      gracePeriod: clamp(toNumber(debt.gracePeriod), 0, 12), // months until APR change
      variableApr: debt.variableApr === true,
      aprChangeHistory: Array.isArray(debt.aprChangeHistory) ? debt.aprChangeHistory : [],
      lastAprChangeDate: debt.lastAprChangeDate || null,
      nextAprReviewDate: debt.nextAprReviewDate || null,
      balanceGrowthRate: roundPercent(debt.balanceGrowthRate || 0) // monthly growth if only making min payment
    };
  }

  /**
   * Calculate minimum payment for given balance and APR
   */
  calculateMinimumPayment(balance, apr, minimumPaymentPercent) {
    // Typical formula: max(interest + 1% principal, fixed minimum)
    const monthlyRate = apr / 100 / 12;
    const interestCharge = balance * monthlyRate;
    const principalComponent = balance * (minimumPaymentPercent / 100);
    const calculatedMinimum = interestCharge + principalComponent;

    // Minimum floor: $25-35 typical for credit cards
    return Math.max(25, calculatedMinimum);
  }

  /**
   * Forecast minimum payment for given month
   */
  forecastMinimumPayment(debt, month) {
    let forecastBalance = debt.balance;
    let forecastApr = debt.apr;

    // Simulate month-by-month balance growth (if only making min payment)
    for (let m = 1; m < month; m++) {
      const minPayment = this.calculateMinimumPayment(forecastBalance, forecastApr, debt.minimumPaymentPercent);
      const monthlyRate = forecastApr / 100 / 12;
      const interestCharge = forecastBalance * monthlyRate;
      
      // Balance grows if minimum payment < interest (trapped in debt)
      const newBalance = forecastBalance + interestCharge - minPayment;
      forecastBalance = Math.max(0, newBalance);

      // Simulate APR changes
      if (m === Math.floor(debt.gracePeriod) && debt.variableApr) {
        // APR increases by 2-5% on variable cards (worst case: 5%)
        forecastApr = Math.min(100, forecastApr + 5);
      }
    }

    const minimumPayment = this.calculateMinimumPayment(forecastBalance, forecastApr, debt.minimumPaymentPercent);

    return {
      month,
      forecastBalance: roundMoney(forecastBalance),
      forecastApr: roundPercent(forecastApr),
      minimumPayment: roundMoney(minimumPayment),
      interestComponent: roundMoney(forecastBalance * (forecastApr / 100 / 12)),
      principalComponent: roundMoney(minimumPayment - (forecastBalance * (forecastApr / 100 / 12)))
    };
  }

  /**
   * Detect payment shock and classify severity
   */
  detectPaymentShock(debt) {
    const currentMinimum = debt.minimumPayment;

    // Forecast 6 months of payments
    const forecast = [];
    let maxPayment = currentMinimum;
    let maxMonth = 0;
    let totalShockAmount = 0;

    for (let month = 1; month <= 6; month++) {
      const forecast_m = this.forecastMinimumPayment(debt, month);
      forecast.push(forecast_m);

      if (forecast_m.minimumPayment > maxPayment) {
        maxPayment = forecast_m.minimumPayment;
        maxMonth = month;
        totalShockAmount = forecast_m.minimumPayment - currentMinimum;
      }
    }

    // Classify shock severity
    const shockPercent = ((maxPayment - currentMinimum) / currentMinimum) * 100;
    let severity = 'NONE';
    let alert = null;

    if (shockPercent >= 30) {
      severity = 'CRITICAL';
      alert = `CRITICAL: Minimum payment could jump ${shockPercent.toFixed(0)}% in month ${maxMonth}`;
    } else if (shockPercent >= 15) {
      severity = 'HIGH';
      alert = `HIGH: Minimum payment could increase ${shockPercent.toFixed(0)}% in month ${maxMonth}`;
    } else if (shockPercent >= 5) {
      severity = 'MEDIUM';
      alert = `MEDIUM: Minimum payment may increase ${shockPercent.toFixed(0)}% in month ${maxMonth}`;
    } else if (shockPercent > 0) {
      severity = 'LOW';
      alert = `LOW: Minor minimum payment increase (${shockPercent.toFixed(1)}%) possible`;
    }

    return {
      currentMinimum,
      maxPayment: roundMoney(maxPayment),
      maxPaymentMonth: maxMonth,
      shockAmount: roundMoney(totalShockAmount),
      shockPercent: roundPercent(shockPercent),
      severity,
      alert: alert || 'No shock detected',
      forecast
    };
  }

  /**
   * Quantify cash-flow impact and required buffer
   */
  calculateCashFlowImpact(shock, currentAvailableCashFlow) {
    const requiredBuffer = Math.max(0, shock.shockAmount);
    const bufferAsPercentOfIncome = (requiredBuffer / currentAvailableCashFlow) * 100;

    let riskLevel = 'LOW';
    let impact = 'Manageable';

    if (bufferAsPercentOfIncome >= 30) {
      riskLevel = 'CRITICAL';
      impact = 'Payment shock would severely strain budget';
    } else if (bufferAsPercentOfIncome >= 15) {
      riskLevel = 'HIGH';
      impact = 'Payment shock would strain budget significantly';
    } else if (bufferAsPercentOfIncome >= 5) {
      riskLevel = 'MEDIUM';
      impact = 'Payment shock would require budget adjustment';
    } else if (shock.shockAmount > 0) {
      riskLevel = 'LOW';
      impact = 'Minor payment shock easily absorbed';
    }

    return {
      shockAmount: shock.shockAmount,
      currentCashFlow: roundMoney(currentAvailableCashFlow),
      requiredBuffer: roundMoney(requiredBuffer),
      bufferAsPercentOfIncome: roundPercent(bufferAsPercentOfIncome),
      riskLevel,
      impact,
      recommendation: riskLevel === 'CRITICAL' 
        ? 'Immediate action required: execute preventive strategy'
        : riskLevel === 'HIGH'
        ? 'Urgent action recommended: prepare buffer or refinance'
        : riskLevel === 'MEDIUM'
        ? 'Plan ahead: monitor closely and consider preventive actions'
        : 'No immediate action needed'
    };
  }

  /**
   * Recommend preventive actions
   */
  recommendPreventiveActions(debt, shock, cashFlowImpact) {
    const actions = [];

    // Action 1: Extra principal payments (reduce balance to lower min payment)
    if (shock.shockAmount > 0) {
      const extraPrincipalNeeded = debt.balance * 0.15; // 15% balance reduction prevents most shocks
      actions.push({
        priority: 1,
        action: 'Aggressive principal reduction',
        description: `Pay extra $${roundMoney(extraPrincipalNeeded)} toward principal over next ${shock.maxPaymentMonth} months`,
        timeline: `Complete before month ${shock.maxPaymentMonth}`,
        costSavings: `Prevent $${shock.shockAmount} payment shock + save interest`,
        effort: 'High (requires sustained extra payments)',
        feasibility: cashFlowImpact.bufferAsPercentOfIncome < 10 ? 'HIGH' : 'MEDIUM'
      });
    }

    // Action 2: Balance transfer (escape variable APR or high rate)
    if (debt.variableApr || debt.apr > 18) {
      actions.push({
        priority: 2,
        action: 'Balance transfer',
        description: `Transfer ${debt.name} to 0% APR card or lower-rate personal loan`,
        timeline: `Execute before APR change in month ${shock.maxPaymentMonth}`,
        costSavings: `Lock in fixed payment + save interest on variable APR`,
        effort: 'Medium (requires new credit application)',
        feasibility: 'MEDIUM (depends on credit score and available offers)'
      });
    }

    // Action 3: Refinance to fixed payment
    if (debt.type !== 'credit-card') {
      actions.push({
        priority: 3,
        action: 'Refinance loan',
        description: `Refinance ${debt.name} to fixed-rate loan with stable payment`,
        timeline: `Execute within next 60 days`,
        costSavings: `Eliminate payment shock + potentially lower APR`,
        effort: 'Medium (refinance application and closing)',
        feasibility: 'MEDIUM (depends on credit score and home equity)'
      });
    }

    // Action 4: Payment plan negotiation
    actions.push({
      priority: 4,
      action: 'Negotiate with creditor',
      description: `Request fixed payment plan or hardship program to stabilize payments`,
      timeline: `Contact creditor immediately if shock detected`,
      costSavings: `Possible APR reduction or interest waiver`,
      effort: 'Low (phone call to creditor)',
      feasibility: 'MEDIUM (depends on account history and creditor policies)'
    });

    // Action 5: Build emergency fund buffer
    actions.push({
      priority: 5,
      action: 'Build cash flow buffer',
      description: `Save $${roundMoney(cashFlowImpact.requiredBuffer)} to cover payment shock`,
      timeline: `Build buffer over next ${shock.maxPaymentMonth - 1} months`,
      costSavings: `Provides safety margin; no cost difference`,
      effort: 'Medium (disciplined savings)',
      feasibility: 'HIGH (always executable)'
    });

    return actions;
  }

  /**
   * Generate early-warning alerts
   */
  generateAlerts(shock, debt) {
    const alerts = [];

    if (shock.severity === 'CRITICAL') {
      alerts.push({
        severity: 'CRITICAL',
        alert: shock.alert,
        daysUntilShock: (shock.maxPaymentMonth - 1) * 30,
        message: `${debt.name} minimum payment could jump $${shock.shockAmount} in ${shock.maxPaymentMonth} months. IMMEDIATE ACTION REQUIRED.`
      });
    }

    if (shock.severity === 'HIGH') {
      alerts.push({
        severity: 'HIGH',
        alert: shock.alert,
        daysUntilShock: (shock.maxPaymentMonth - 1) * 30,
        message: `${debt.name} minimum payment increase detected. Recommend implementing preventive strategy.`
      });
    }

    if (shock.severity === 'MEDIUM') {
      alerts.push({
        severity: 'MEDIUM',
        alert: shock.alert,
        daysUntilShock: (shock.maxPaymentMonth - 1) * 30,
        message: `${debt.name} payment may increase. Monitor closely over next ${shock.maxPaymentMonth} months.`
      });
    }

    if (debt.variableApr && debt.gracePeriod > 0 && debt.gracePeriod <= 3) {
      alerts.push({
        severity: 'HIGH',
        alert: `APR REVIEW APPROACHING on ${debt.name}`,
        daysUntilShock: debt.gracePeriod * 30,
        message: `Variable APR review in ${debt.gracePeriod} months. Prepare for potential rate increase.`
      });
    }

    if (debt.apr >= 20) {
      alerts.push({
        severity: 'HIGH',
        alert: 'High interest rate detected',
        daysUntilShock: 0,
        message: `${debt.name} APR (${debt.apr}%) is very high. Prioritize refinance or balance transfer.`
      });
    }

    return alerts;
  }

  /**
   * Main orchestrator: Predict payment shocks
   */
  predict(debts, availableCashFlow) {
    // Normalize inputs
    const normalizedDebts = debts.map(d => this.normalizeDebt(d));
    const normalizedCashFlow = roundMoney(availableCashFlow);

    if (normalizedDebts.length === 0 || normalizedCashFlow <= 0) {
      return {
        debts: [],
        error: 'Provide debts array and positive available cash flow'
      };
    }

    // Analyze each debt
    const predictions = normalizedDebts.map(debt => {
      const shock = this.detectPaymentShock(debt);
      const cashFlowImpact = this.calculateCashFlowImpact(shock, normalizedCashFlow);
      const preventiveActions = this.recommendPreventiveActions(debt, shock, cashFlowImpact);
      const alerts = this.generateAlerts(shock, debt);

      return {
        debtId: debt.id,
        debtName: debt.name,
        type: debt.type,
        currentBalance: debt.balance,
        currentApr: debt.apr,
        currentMinimumPayment: debt.minimumPayment,
        shock,
        cashFlowImpact,
        preventiveActions,
        alerts
      };
    });

    // Portfolio-level risk assessment
    const totalShockAmount = roundMoney(predictions.reduce((sum, p) => sum + p.shock.shockAmount, 0));
    const criticalCount = predictions.filter(p => p.shock.severity === 'CRITICAL').length;
    const highCount = predictions.filter(p => p.shock.severity === 'HIGH').length;
    const portfolioRisk = criticalCount > 0 ? 'CRITICAL' : highCount > 1 ? 'HIGH' : 'MEDIUM';

    const summary = {
      totalDebts: normalizedDebts.length,
      debtsAtRisk: predictions.filter(p => p.shock.severity !== 'NONE').length,
      criticalShocks: criticalCount,
      highShocks: highCount,
      totalPotentialShock: totalShockAmount,
      averageShockPercent: roundPercent(predictions.reduce((sum, p) => sum + p.shock.shockPercent, 0) / normalizedDebts.length),
      portfolioRiskLevel: portfolioRisk,
      availableCashFlow: normalizedCashFlow,
      bufferRequired: roundMoney(totalShockAmount),
      bufferAsPercentOfIncome: roundPercent((totalShockAmount / normalizedCashFlow) * 100)
    };

    // Consolidated alerts (worst first)
    const allAlerts = predictions.flatMap(p => p.alerts)
      .sort((a, b) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

    const recommendations = [
      {
        priority: 1,
        title: 'Critical Shock Prevention',
        description: criticalCount > 0 
          ? `${criticalCount} debt(s) show CRITICAL shock risk. Execute preventive actions immediately.`
          : 'No critical shocks detected.',
        actionItems: predictions
          .filter(p => p.shock.severity === 'CRITICAL')
          .map(p => p.preventiveActions[0])
          .filter(Boolean)
      },
      {
        priority: 2,
        title: 'Build Payment Shock Buffer',
        description: `Reserve $${summary.bufferRequired} (${summary.bufferAsPercentOfIncome}% of cash flow) for potential payment increases`,
        timeline: `Build over next 3-6 months`,
        savingsMechanism: 'Automatic transfer to dedicated savings account'
      },
      {
        priority: 3,
        title: 'Monitor High-Risk Accounts',
        description: `${highCount} debt(s) have HIGH shock potential. Monitor closely and be ready to refinance.`,
        frequency: 'Monthly review'
      }
    ];

    return {
      predictions,
      summary,
      alerts: allAlerts.slice(0, 10), // Top 10 alerts
      recommendations,
      nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }
}

module.exports = new MinimumPaymentShockPredictorService();
