// backend/tests/adaptiveEmergencyFundForecaster.test.js
const AdaptiveEmergencyFundForecaster = require('../services/adaptiveEmergencyFundForecaster');
const EmergencyFund = require('../models/emergencyFund');
const Transaction = require('../models/transaction');
const recommendationUtils = require('../utils/recommendationUtils');
const forecastMath = require('../utils/forecastMath');

describe('AdaptiveEmergencyFundForecaster', () => {
  let forecaster;
  beforeAll(() => {
    forecaster = new AdaptiveEmergencyFundForecaster();
  });

  test('should calculate monthly expenses', () => {
    const transactions = [
      { date: new Date('2025-01-01'), amount: 1000, type: 'withdrawal' },
      { date: new Date('2025-02-01'), amount: 1200, type: 'withdrawal' },
      { date: new Date('2025-03-01'), amount: 1100, type: 'withdrawal' }
    ];
    const result = forecaster._calcMonthlyExpenses(transactions);
    expect(result).toBeCloseTo(1100);
  });

  test('should calculate income volatility', () => {
    const incomeHistory = [
      { date: new Date('2025-01-01'), amount: 3000 },
      { date: new Date('2025-02-01'), amount: 2500 },
      { date: new Date('2025-03-01'), amount: 3500 }
    ];
    const result = forecaster._calcIncomeVolatility(incomeHistory);
    expect(result).toBeGreaterThan(0);
  });

  test('should compute fund target', () => {
    const monthlyExpenses = 1200;
    const incomeVolatility = 300;
    const eventImpact = { totalUncertainty: 0.2, totalExpenseFactor: 1.1 };
    const result = forecaster._computeFundTarget(monthlyExpenses, incomeVolatility, eventImpact);
    expect(result).toBeGreaterThan(0);
  });

  test('should generate savings plan', () => {
    const plan = recommendationUtils.generateSavingsPlan(2000, 5000, 3500, 1200);
    expect(plan.monthlyTarget).toBeGreaterThan(0);
    expect(typeof plan.advice).toBe('string');
  });

  test('should simulate expenses', () => {
    const transactions = [
      { date: new Date('2025-01-01'), amount: 1000, type: 'expense', category: 'food' },
      { date: new Date('2025-02-01'), amount: 1200, type: 'expense', category: 'housing' }
    ];
    const lifeEvents = [
      { type: 'baby', costMin: 500, costMax: 2000, date: new Date('2025-02-01') }
    ];
    const projections = forecastMath.simulateExpenses(transactions, lifeEvents, 6);
    expect(projections.length).toBe(6);
  });
});
