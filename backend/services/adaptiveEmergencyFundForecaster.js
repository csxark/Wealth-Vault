// Adaptive Emergency Fund Forecaster Service
// Dynamically models emergency fund requirements based on user spending, income volatility, and life events

const EmergencyFund = require('../models/emergencyFund');
const Transaction = require('../models/transaction');
const NotificationService = require('./alertNotificationService');
const LifeEventDebtStrategyService = require('./lifeEventDebtStrategyService');
const forecastMath = require('../utils/forecastMath');
const riskMath = require('../utils/riskMath');
const recommendationUtils = require('../utils/recommendationUtils');

class AdaptiveEmergencyFundForecaster {
  constructor() {
    this.lifeEventService = new LifeEventDebtStrategyService();
    this.notificationService = NotificationService;
  }

  /**
   * Main entry: Forecast emergency fund needs and trigger alerts
   * @param {string} userId
   * @param {Array} transactions - [{date, amount, type}]
   * @param {Array} lifeEvents - [{type, costMin, costMax, date}]
   * @param {Array} incomeHistory - [{date, amount}]
   */
  async forecast(userId, transactions, lifeEvents, incomeHistory) {
    // 1. Calculate average monthly expenses
    const monthlyExpenses = this._calcMonthlyExpenses(transactions);
    // 2. Assess income volatility
    const incomeVolatility = this._calcIncomeVolatility(incomeHistory);
    // 3. Integrate life event impact
    const eventImpact = this._calcLifeEventImpact(lifeEvents);
    // 4. Compute recommended fund size
    const recommendedFund = this._computeFundTarget(monthlyExpenses, incomeVolatility, eventImpact);
    // 5. Get current fund balance
    const fund = await EmergencyFund.getUserFunds(userId);
    const currentBalance = fund?.[0]?.balance || 0;
    const balanceHistory = fund?.[0]?.balanceHistory || [];
    const recommendedHistory = fund?.[0]?.recommendedHistory || [];
    // 6. Scenario simulation & stress testing
    const projections = forecastMath.simulateExpenses(transactions, lifeEvents, 12);
    const stressTest = forecastMath.stressTestFund(currentBalance, projections);
    // 7. Risk scoring & trend detection
    const riskScore = riskMath.emergencyFundRiskScore(currentBalance, recommendedFund, incomeVolatility, eventImpact.totalUncertainty);
    const riskTrend = riskMath.detectRiskTrend(balanceHistory, recommendedHistory);
    // 8. Recommendations
    const monthlyIncome = incomeHistory.length ? (incomeHistory.reduce((sum, tx) => sum + tx.amount, 0) / incomeHistory.length) : 0;
    const plan = recommendationUtils.generateSavingsPlan(currentBalance, recommendedFund, monthlyIncome, monthlyExpenses);
    const progress = recommendationUtils.trackProgress(balanceHistory, recommendedFund);
    // 9. Multi-level risk alert
    const riskAlert = await this.notificationService.sendRiskAlert(userId, currentBalance, recommendedFund, { riskScore, riskTrend });
    // 10. Progress notification
    const progressNotification = await this.notificationService.sendProgressNotification(userId, progress.progressPercent, progress.monthsToGoal);
    // 11. Update recommendedFund in DB
    if (fund?.[0]) {
      fund[0].recommendedFund = recommendedFund;
      await fund[0].save();
    }
    return {
      recommendedFund,
      currentBalance,
      monthlyExpenses,
      incomeVolatility,
      eventImpact,
      projections,
      stressTest,
      riskScore,
      riskTrend,
      plan,
      progress,
      riskAlert,
      progressNotification
    };
  }

  _calcMonthlyExpenses(transactions) {
    // Group by month, sum withdrawals
    const monthly = {};
    transactions.forEach(tx => {
      if (tx.type === 'withdrawal') {
        const key = `${tx.date.getFullYear()}-${tx.date.getMonth()}`;
        monthly[key] = (monthly[key] || 0) + Math.abs(tx.amount);
      }
    });
    const values = Object.values(monthly);
    return values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;
  }

  _calcIncomeVolatility(incomeHistory) {
    // Standard deviation of monthly income
    const monthly = {};
    incomeHistory.forEach(tx => {
      const key = `${tx.date.getFullYear()}-${tx.date.getMonth()}`;
      monthly[key] = (monthly[key] || 0) + tx.amount;
    });
    const values = Object.values(monthly);
    if (values.length < 2) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  _calcLifeEventImpact(lifeEvents) {
    // Aggregate uncertainty and expense factors
    let totalUncertainty = 0, totalExpenseFactor = 1;
    lifeEvents.forEach(event => {
      const model = this.lifeEventService.normalizeEvent(event);
      totalUncertainty += model.uncertainty;
      totalExpenseFactor *= model.expenseFactor;
    });
    return { totalUncertainty, totalExpenseFactor };
  }

  _computeFundTarget(monthlyExpenses, incomeVolatility, eventImpact) {
    // Base: 3 months expenses, adjust for volatility and events
    let base = monthlyExpenses * 3;
    base += incomeVolatility * 2; // Add buffer for volatility
    base *= eventImpact.totalExpenseFactor;
    base *= (1 + eventImpact.totalUncertainty); // Add uncertainty buffer
    return Math.round(base);
  }
}

module.exports = AdaptiveEmergencyFundForecaster;
