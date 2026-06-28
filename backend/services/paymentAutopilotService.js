import { db } from '../db/index.js';
import { debts, paymentHistory, transactions } from '../db/schema.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const roundMoney = (value) => Math.round(value * 100) / 100;

const roundPercent = (value) => Math.round(value * 100) / 100;

// Payment adjustment guardrails
const AUTOPILOT_GUARDRAILS = {
  SAFETY_BUFFER: 500,        // Min cash reserves before triggering pause
  MIN_PAYMENT_PERCENT: 0.5,  // Min % of base payment (50% of configured)
  MAX_PAYMENT_PERCENT: 2.0,  // Max % of base payment (200% during windfalls)
  SHORTFALL_LOOKAHEAD_DAYS: 30,
  INCOME_VARIABILITY_WINDOW: 90, // Days to analyze for income patterns
  WINDFALL_THRESHOLD: 1000,  // Amount to trigger windfall acceleration
  LOW_INCOME_THRESHOLD: 0.75, // Income below 75% of average triggers reduction
  HIGH_INCOME_THRESHOLD: 1.25 // Income above 125% of average triggers acceleration
};

// Alert severity levels
const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

class PaymentAutopilotService {
  /**
   * Analyze recent income patterns
   */
  async analyzeIncomeVariability(userId) {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - AUTOPILOT_GUARDRAILS.INCOME_VARIABILITY_WINDOW);

    try {
      const recentTransactions = await db
        .select()
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          gte(transactions.date, lookbackDate),
          eq(transactions.type, 'income')
        ))
        .orderBy(desc(transactions.date));

      if (recentTransactions.length === 0) {
        return {
          averageMonthlyIncome: 0,
          incomeVariance: 0,
          variabilityPercent: 0,
          incomeLevel: 'unknown',
          recentTransactions: 0
        };
      }

      // Group by month
      const monthlyTotals = {};
      recentTransactions.forEach(tx => {
        const monthKey = new Date(tx.date).toISOString().slice(0, 7);
        monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + toNumber(tx.amount, 0);
      });

      const monthlyValues = Object.values(monthlyTotals);
      const avgIncome = roundMoney(monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length);

      // Calculate variance
      const variance = monthlyValues.reduce((sum, val) => sum + Math.pow(val - avgIncome, 2), 0) / monthlyValues.length;
      const stdDev = Math.sqrt(variance);
      const variabilityPercent = avgIncome > 0 ? roundPercent((stdDev / avgIncome) * 100) : 0;

      // Classify income level
      let incomeLevel = 'stable';
      if (variabilityPercent < 10) incomeLevel = 'stable';
      else if (variabilityPercent < 25) incomeLevel = 'moderate';
      else if (variabilityPercent < 50) incomeLevel = 'variable';
      else incomeLevel = 'highly-variable';

      return {
        averageMonthlyIncome: avgIncome,
        incomeVariance: roundMoney(variance),
        variabilityPercent,
        incomeLevel,
        recentTransactions: recentTransactions.length,
        monthlyValues
      };
    } catch (error) {
      console.error('Error analyzing income variability:', error);
      return {
        averageMonthlyIncome: 0,
        incomeVariance: 0,
        variabilityPercent: 0,
        incomeLevel: 'unknown',
        recentTransactions: 0
      };
    }
  }

  /**
   * Calculate current cash flow position
   */
  async calculateCashFlowPosition(userId, monthlyExpenses = 0) {
    try {
      // Get current account balances (sum of positive balances; estimate from last known)
      const recentCashFlow = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.date))
        .limit(50);

      let estimatedCash = 0;
      recentCashFlow.forEach(tx => {
        if (tx.type === 'income') estimatedCash += toNumber(tx.amount, 0);
        if (tx.type === 'expense' || tx.type === 'payment') estimatedCash -= toNumber(tx.amount, 0);
      });

      estimatedCash = Math.max(0, estimatedCash); // Floor at 0

      return {
        estimatedCashBalance: roundMoney(estimatedCash),
        monthlyExpenses: toNumber(monthlyExpenses, 0),
        availableForDebt: roundMoney(estimatedCash - toNumber(monthlyExpenses, 0)),
        isSufficient: estimatedCash > (toNumber(monthlyExpenses, 0) + AUTOPILOT_GUARDRAILS.SAFETY_BUFFER)
      };
    } catch (error) {
      return {
        estimatedCashBalance: 0,
        monthlyExpenses: toNumber(monthlyExpenses, 0),
        availableForDebt: 0,
        isSufficient: false
      };
    }
  }

  /**
   * Detect imminent cash shortfalls
   */
  detectCashShortfall(estimatedBalance, monthlyExpenses, proposedPayment) {
    const balanceAfterExpenses = roundMoney(estimatedBalance - toNumber(monthlyExpenses, 0));
    const balanceAfterPayment = roundMoney(balanceAfterExpenses - toNumber(proposedPayment, 0));

    return {
      projectedBalance: balanceAfterPayment,
      wouldTriggerShortfall: balanceAfterPayment < AUTOPILOT_GUARDRAILS.SAFETY_BUFFER,
      safetyBufferMissing: roundMoney(AUTOPILOT_GUARDRAILS.SAFETY_BUFFER - balanceAfterPayment),
      riskLevel: balanceAfterPayment < 0 ? 'critical' : balanceAfterPayment < AUTOPILOT_GUARDRAILS.SAFETY_BUFFER ? 'warning' : 'safe'
    };
  }

  /**
   * Scale payment based on income level
   */
  scalePaymentForIncomeLevel(basePayment, incomeAnalysis, incomeVariability) {
    const avgIncome = incomeAnalysis.averageMonthlyIncome;
    const currentIncome = incomeVariability || avgIncome; // Use provided current income if available

    if (avgIncome === 0) {
      return {
        scaledPayment: basePayment,
        scaleFactor: 1.0,
        reason: 'Insufficient income data; maintaining base payment'
      };
    }

    const incomeRatio = currentIncome / avgIncome;

    // determine scaling factor
    let scaleFactor = 1.0;
    let reason = 'Income at expected levels';

    if (incomeRatio < AUTOPILOT_GUARDRAILS.LOW_INCOME_THRESHOLD) {
      scaleFactor = clamp(incomeRatio, AUTOPILOT_GUARDRAILS.MIN_PAYMENT_PERCENT, 1.0);
      reason = `Low income month (${roundPercent(incomeRatio * 100)}% of average); reducing payment`;
    } else if (incomeRatio > AUTOPILOT_GUARDRAILS.HIGH_INCOME_THRESHOLD) {
      scaleFactor = clamp(incomeRatio, 1.0, AUTOPILOT_GUARDRAILS.MAX_PAYMENT_PERCENT);
      reason = `High income month (${roundPercent(incomeRatio * 100)}% of average); accelerating payment`;
    }

    return {
      scaledPayment: roundMoney(basePayment * scaleFactor),
      scaleFactor: roundPercent(scaleFactor),
      reason,
      incomeRatio: roundPercent(incomeRatio * 100)
    };
  }

  /**
   * Detect windfall and accelerate payment
   */
  detectWindfallAndAccelerate(basePayment, recentTransactions = [], incomeAnalysis = {}) {
    const avgIncome = incomeAnalysis.averageMonthlyIncome || 0;

    // Check for large single transactions in past 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const windfalls = (recentTransactions || []).filter(tx => {
      const txDate = new Date(tx.date || new Date());
      return txDate >= sevenDaysAgo && toNumber(tx.amount, 0) >= AUTOPILOT_GUARDRAILS.WINDFALL_THRESHOLD;
    });

    if (windfalls.length === 0) {
      return {
        windfallDetected: false,
        windfallAmount: 0,
        acceleratedPayment: basePayment,
        accelerationRatio: 1.0,
        reason: 'No windfall detected'
      };
    }

    const totalWindfall = windfalls.reduce((sum, w) => sum + toNumber(w.amount, 0), 0);
    
    // Accelerate by allocating 50-100% of windfall to debt
    const accelerationAmount = roundMoney(totalWindfall * 0.75); // Aggressive: 75% of windfall
    const acceleratedPayment = roundMoney(basePayment + accelerationAmount);
    const accelerationRatio = acceleratedPayment / basePayment;

    return {
      windfallDetected: true,
      windfallAmount: roundMoney(totalWindfall),
      acceleratedPayment,
      accelerationRatio: roundPercent(accelerationRatio * 100),
      reason: `Windfall of $${roundMoney(totalWindfall).toLocaleString()} detected; allocating $${roundMoney(accelerationAmount).toLocaleString()} to accelerate payoff`,
      windfallCount: windfalls.length
    };
  }

  /**
   * Generate alert for adjustment
   */
  generateAlert(adjustmentType, reason, severity = ALERT_SEVERITY.INFO, metadata = {}) {
    const now = new Date();
    return {
      timestamp: now.toISOString(),
      adjustmentType,
      reason,
      severity,
      alertId: `${adjustmentType}-${now.getTime()}`,
      metadata,
      allowsOverride: true
    };
  }

  /**
   * Configure autopayment rules
   */
  configureAutopayment(debt, configuration = {}) {
    const basePaymentAmount = toNumber(configuration.amount, 0) || toNumber(debt.minimumPayment, 0);
    const basePaymentPercent = configuration.percentage || 5; // Default 5% of balance
    const adjustmentEnabled = configuration.adjustmentEnabled !== false; // Default enabled
    const accelerationEnabled = configuration.accelerationEnabled !== false; // Default enabled

    const basePayment = Math.max(
      basePaymentAmount,
      roundMoney(toNumber(debt.balance, 1000) * basePaymentPercent / 100)
    );

    return {
      debtId: debt.id,
      debtName: debt.name,
      basePaymentAmount: roundMoney(basePaymentAmount),
      basePaymentPercent,
      derivedBasePayment: roundMoney(basePayment),
      adjustmentEnabled,
      accelerationEnabled,
      minPayment: roundMoney(basePayment * AUTOPILOT_GUARDRAILS.MIN_PAYMENT_PERCENT),
      maxPayment: roundMoney(basePayment * AUTOPILOT_GUARDRAILS.MAX_PAYMENT_PERCENT),
      safetyBuffer: AUTOPILOT_GUARDRAILS.SAFETY_BUFFER,
      shortfallLookahead: AUTOPILOT_GUARDRAILS.SHORTFALL_LOOKAHEAD_DAYS
    };
  }

  /**
   * Calculate adjusted payment for current conditions
   */
  async calculateAdjustedPayment(userId, debt, configuration, currentConditions = {}) {
    const autopilotConfig = this.configureAutopayment(debt, configuration);
    const basePayment = autopilotConfig.derivedBasePayment;

    // Analyze income
    const incomeAnalysis = await this.analyzeIncomeVariability(userId);

    // Get cash position
    const cashFlow = await this.calculateCashFlowPosition(userId, currentConditions.monthlyExpenses || 0);

    // Detect shortfall
    const shortfall = this.detectCashShortfall(
      cashFlow.estimatedCashBalance,
      currentConditions.monthlyExpenses || 0,
      basePayment
    );

    let adjustedPayment = basePayment;
    const adjustments = [];

    // Apply adjustment 1: Income-based scaling
    if (configuration.adjustmentEnabled !== false) {
      const incomeScaling = this.scalePaymentForIncomeLevel(basePayment, incomeAnalysis, currentConditions.currentIncome);
      adjustedPayment = incomeScaling.scaledPayment;
      adjustments.push({
        type: 'income-scaling',
        factor: incomeScaling.scaleFactor,
        reason: incomeScaling.reason
      });
    }

    // Apply adjustment 2: Shortfall detection
    if (shortfall.wouldTriggerShortfall && configuration.adjustmentEnabled !== false) {
      // Reduce payment to safe level
      const safePayment = roundMoney(shortfall.projectedBalance + AUTOPILOT_GUARDRAILS.SAFETY_BUFFER);
      adjustedPayment = Math.min(adjustedPayment, Math.max(0, safePayment));
      adjustments.push({
        type: 'shortfall-prevention',
        reason: `Reducing payment to prevent shortfall (projected: $${shortfall.projectedBalance})`,
        riskLevel: shortfall.riskLevel
      });
    }

    // Apply adjustment 3: Windfall acceleration
    if (configuration.accelerationEnabled !== false) {
      const windfall = this.detectWindfallAndAccelerate(
        adjustedPayment,
        currentConditions.recentTransactions || [],
        incomeAnalysis
      );
      if (windfall.windfallDetected) {
        adjustedPayment = windfall.acceleratedPayment;
        adjustments.push({
          type: 'windfall-acceleration',
          windfallAmount: windfall.windfallAmount,
          reason: windfall.reason
        });
      }
    }

    // Enforce guardrails
    adjustedPayment = clamp(adjustedPayment, autopilotConfig.minPayment, autopilotConfig.maxPayment);

    return {
      debtId: debt.id,
      basePayment,
      adjustedPayment,
      adjustmentRatio: roundPercent((adjustedPayment / basePayment) * 100),
      adjustments,
      incomeProfile: {
        averageMonthly: incomeAnalysis.averageMonthlyIncome,
        variability: incomeAnalysis.variabilityPercent,
        level: incomeAnalysis.incomeLevel
      },
      cashFlowProfile: {
        estimatedBalance: cashFlow.estimatedCashBalance,
        availableForDebt: cashFlow.availableForDebt,
        isSufficient: cashFlow.isSufficient
      },
      shortfallRisk: shortfall.riskLevel,
      guardrails: {
        min: autopilotConfig.minPayment,
        max: autopilotConfig.maxPayment,
        safetyBuffer: AUTOPILOT_GUARDRAILS.SAFETY_BUFFER
      }
    };
  }

  /**
   * Generate alerts for user
   */
  generateAutopilotAlerts(adjustedPaymentAnalysis) {
    const alerts = [];

    // Alert 1: Major payment adjustment
    const adjustmentRatio = toNumber(adjustedPaymentAnalysis.adjustmentRatio, 100);
    if (adjustmentRatio < 70) {
      alerts.push(this.generateAlert(
        'payment-reduction',
        `Payment reduced to $${adjustedPaymentAnalysis.adjustedPayment} (${adjustmentRatio}% of base) due to income or cash flow conditions`,
        ALERT_SEVERITY.WARNING,
        { basePayment: adjustedPaymentAnalysis.basePayment, adjustedPayment: adjustedPaymentAnalysis.adjustedPayment }
      ));
    } else if (adjustmentRatio > 130) {
      alerts.push(this.generateAlert(
        'payment-acceleration',
        `Payment accelerated to $${adjustedPaymentAnalysis.adjustedPayment} (${adjustmentRatio}% of base) due to windfall or high income`,
        ALERT_SEVERITY.INFO,
        { basePayment: adjustedPaymentAnalysis.basePayment, adjustedPayment: adjustedPaymentAnalysis.adjustedPayment }
      ));
    }

    // Alert 2: Shortfall risk
    if (adjustedPaymentAnalysis.shortfallRisk === 'critical') {
      alerts.push(this.generateAlert(
        'shortfall-critical',
        'Critical: Payment adjusted to prevent overdraft. Consider manual override if able.',
        ALERT_SEVERITY.CRITICAL,
        { cashBalance: adjustedPaymentAnalysis.cashFlowProfile.estimatedBalance }
      ));
    } else if (adjustedPaymentAnalysis.shortfallRisk === 'warning') {
      alerts.push(this.generateAlert(
        'shortfall-warning',
        'Warning: Cash balance will be tight after payment. Safety buffer activated.',
        ALERT_SEVERITY.WARNING,
        { cashBalance: adjustedPaymentAnalysis.cashFlowProfile.estimatedBalance }
      ));
    }

    // Alert 3: Income variability notice
    if (adjustedPaymentAnalysis.incomeProfile.variability > 50) {
      alerts.push(this.generateAlert(
        'high-income-variability',
        `High income variability detected (${adjustedPaymentAnalysis.incomeProfile.variability}%). Autopilot will continue adjusting based on actual income.`,
        ALERT_SEVERITY.INFO,
        { variability: adjustedPaymentAnalysis.incomeProfile.variability }
      ));
    }

    return alerts;
  }

  /**
   * Main optimization method
   */
  async optimize(userId, debts = [], configuration = {}, currentConditions = {}) {
    if (!debts || debts.length === 0) {
      return { error: 'No debts provided' };
    }

    try {
      const adjustedPayments = [];
      const allAlerts = [];

      // Analyze each debt
      for (const debt of debts) {
        const debtConfig = configuration[debt.id] || configuration; // Allow per-debt or global config
        
        const adjusted = await this.calculateAdjustedPayment(
          userId,
          debt,
          debtConfig,
          currentConditions
        );

        adjustedPayments.push(adjusted);

        // Generate alerts
        const alerts = this.generateAutopilotAlerts(adjusted);
        allAlerts.push(...alerts);
      }

      // Aggregate metrics
      const totalBasePayment = roundMoney(adjustedPayments.reduce((sum, a) => sum + toNumber(a.basePayment, 0), 0));
      const totalAdjustedPayment = roundMoney(adjustedPayments.reduce((sum, a) => sum + toNumber(a.adjustedPayment, 0), 0));
      const paymentDifference = roundMoney(totalAdjustedPayment - totalBasePayment);

      return {
        userId,
        configurationDate: new Date().toISOString(),
        autopilotEnabled: true,
        debtPayments: adjustedPayments,
        aggregatedMetrics: {
          totalBasePayment,
          totalAdjustedPayment,
          paymentDifference,
          adjustmentPercent: roundPercent((totalAdjustedPayment / totalBasePayment) * 100),
          debtsWithAdjustment: adjustedPayments.filter(a => a.adjustmentRatio !== 100).length,
          debtsWithAcceleration: adjustedPayments.filter(a => a.adjustmentRatio > 120).length
        },
        alerts: allAlerts,
        recommendation: {
          strategy: 'Smart Autopilot',
          description: 'Payments will automatically adjust based on your income and cash flow. You\'ll receive alerts before major adjustments.',
          frequency: 'Evaluated monthly or when significant income/expense changes detected',
          overrideOption: 'You can manually override any adjustment at any time'
        }
      };
    } catch (error) {
      throw new Error(`Payment autopilot optimization failed: ${error.message}`);
    }
  }
}

export default new PaymentAutopilotService();
