import { describe, it, expect } from '@jest/globals';
import {
  calculateDTI,
  calculateSavingsRate,
  calculateSpendingVolatility,
  calculateEmergencyFundAdequacy,
  calculateBudgetAdherence,
  calculateGoalProgress,
  calculateFinancialHealthScore,
  predictCashFlow,
  analyzeSpendingByDayOfWeek,
  calculateCategoryConcentration,
} from '../../utils/financialCalculations.js';

describe('Financial Calculations Utility', () => {
  describe('calculateDTI', () => {
    it('should calculate debt-to-income ratio correctly', () => {
      const dti = calculateDTI(1500, 5000);
      expect(dti).toBe(30);
    });

    it('should return 0 for zero income', () => {
      const dti = calculateDTI(1500, 0);
      expect(dti).toBe(0);
    });

    it('should return 0 for negative income', () => {
      const dti = calculateDTI(1500, -1000);
      expect(dti).toBe(0);
    });

    it('should handle zero debt', () => {
      const dti = calculateDTI(0, 5000);
      expect(dti).toBe(0);
    });
  });

  describe('calculateSavingsRate', () => {
    it('should calculate savings rate correctly', () => {
      const rate = calculateSavingsRate(5000, 3000);
      expect(rate).toBe(40);
    });

    it('should return 0 for zero income', () => {
      const rate = calculateSavingsRate(0, 3000);
      expect(rate).toBe(0);
    });

    it('should handle negative savings (overspending)', () => {
      const rate = calculateSavingsRate(5000, 6000);
      expect(rate).toBe(-20);
    });

    it('should handle 100% savings', () => {
      const rate = calculateSavingsRate(5000, 0);
      expect(rate).toBe(100);
    });
  });

  describe('calculateSpendingVolatility', () => {
    it('should calculate volatility for consistent spending', () => {
      const spending = [1000, 1000, 1000, 1000];
      const result = calculateSpendingVolatility(spending);
      expect(result.volatility).toBe(0);
      expect(result.average).toBe(1000);
      expect(result.stdDev).toBe(0);
    });

    it('should calculate volatility for variable spending', () => {
      const spending = [500, 1000, 1500, 2000];
      const result = calculateSpendingVolatility(spending);
      expect(result.volatility).toBeGreaterThan(0);
      expect(result.average).toBe(1250);
    });

    it('should return zeros for empty array', () => {
      const result = calculateSpendingVolatility([]);
      expect(result.volatility).toBe(0);
      expect(result.average).toBe(0);
      expect(result.stdDev).toBe(0);
    });

    it('should handle null input', () => {
      const result = calculateSpendingVolatility(null);
      expect(result.volatility).toBe(0);
    });

    it('should handle single value', () => {
      const result = calculateSpendingVolatility([1000]);
      expect(result.average).toBe(1000);
      expect(result.stdDev).toBe(0);
    });
  });

  describe('calculateEmergencyFundAdequacy', () => {
    it('should return adequate for 6+ months coverage', () => {
      const result = calculateEmergencyFundAdequacy(18000, 3000);
      expect(result).toHaveProperty('months');
      expect(result).toHaveProperty('status');
      expect(result.months).toBe(6);
      expect(result.status).toBe('adequate');
    });

    it('should return needs_improvement for 3-5 months', () => {
      const result = calculateEmergencyFundAdequacy(12000, 3000);
      expect(result.months).toBe(4);
      expect(result.status).toBe('needs_improvement');
    });

    it('should return critical for less than 3 months', () => {
      const result = calculateEmergencyFundAdequacy(6000, 3000);
      expect(result.months).toBe(2);
      expect(result.status).toBe('critical');
    });

    it('should handle zero monthly expenses', () => {
      const result = calculateEmergencyFundAdequacy(10000, 0);
      expect(result.months).toBe(0);
    });
  });

  describe('calculateBudgetAdherence', () => {
    it('should calculate under-budget spending', () => {
      const result = calculateBudgetAdherence(800, 1000);
      expect(result).toHaveProperty('adherencePercentage');
      expect(result).toHaveProperty('status');
      expect(result.adherencePercentage).toBe(80);
      expect(result.status).toBe('good');
    });

    it('should calculate over-budget spending', () => {
      const result = calculateBudgetAdherence(1200, 1000);
      expect(result.adherencePercentage).toBe(120);
      expect(result.status).toBe('over_budget');
    });

    it('should handle zero budget', () => {
      const result = calculateBudgetAdherence(500, 0);
      expect(result.adherencePercentage).toBe(0);
    });
  });

  describe('calculateGoalProgress', () => {
    it('should calculate progress for multiple goals', () => {
      const goals = [
        { targetAmount: 10000, currentAmount: 5000, name: 'Emergency Fund' },
        { targetAmount: 5000, currentAmount: 2500, name: 'Vacation' },
      ];
      const result = calculateGoalProgress(goals);
      expect(result).toHaveProperty('totalProgress');
      expect(result).toHaveProperty('goals');
      expect(result.goals).toHaveLength(2);
    });

    it('should handle completed goals', () => {
      const goals = [
        { targetAmount: 1000, currentAmount: 1000, name: 'Completed Goal' },
      ];
      const result = calculateGoalProgress(goals);
      expect(result.goals[0].progress).toBe(100);
    });

    it('should handle empty goals array', () => {
      const result = calculateGoalProgress([]);
      expect(result.totalProgress).toBe(0);
    });
  });

  describe('calculateFinancialHealthScore', () => {
    it('should calculate overall health score', () => {
      const metrics = {
        savingsRate: 20,
        dti: 25,
        emergencyFund: 6,
        spendingVolatility: 15,
      };
      const score = calculateFinancialHealthScore(metrics);
      expect(score).toHaveProperty('overallScore');
      expect(score).toHaveProperty('category');
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    it('should categorize excellent health', () => {
      const metrics = {
        savingsRate: 30,
        dti: 15,
        emergencyFund: 8,
        spendingVolatility: 10,
      };
      const score = calculateFinancialHealthScore(metrics);
      expect(score.category).toBe('excellent');
    });
  });

  describe('predictCashFlow', () => {
    it('should predict future cash flow', () => {
      const monthlyData = [
        { income: 5000, expenses: 3000, month: '2024-01' },
        { income: 5000, expenses: 3200, month: '2024-02' },
        { income: 5000, expenses: 2800, month: '2024-03' },
      ];
      const recurringExpenses = 1500;
      const monthlyIncome = 5000;
      
      const prediction = predictCashFlow(monthlyData, recurringExpenses, monthlyIncome);
      expect(prediction).toHaveProperty('predictedSurplus');
      expect(prediction).toHaveProperty('confidence');
    });

    it('should handle empty monthly data', () => {
      const prediction = predictCashFlow([], 1000, 5000);
      expect(prediction).toBeDefined();
    });
  });

  describe('analyzeSpendingByDayOfWeek', () => {
    it('should analyze spending patterns by day', () => {
      const expenses = [
        { amount: 100, date: new Date('2024-01-01') }, // Monday
        { amount: 150, date: new Date('2024-01-02') }, // Tuesday
        { amount: 200, date: new Date('2024-01-06') }, // Saturday
      ];
      
      const analysis = analyzeSpendingByDayOfWeek(expenses);
      expect(analysis).toHaveProperty('weekdayTotal');
      expect(analysis).toHaveProperty('weekendTotal');
      expect(analysis).toHaveProperty('byDay');
    });

    it('should handle empty expenses', () => {
      const analysis = analyzeSpendingByDayOfWeek([]);
      expect(analysis.weekdayTotal).toBe(0);
      expect(analysis.weekendTotal).toBe(0);
    });
  });

  describe('calculateCategoryConcentration', () => {
    it('should calculate spending concentration', () => {
      const categorySpending = [
        { category: 'Groceries', amount: 500 },
        { category: 'Entertainment', amount: 200 },
        { category: 'Transport', amount: 300 },
      ];
      
      const concentration = calculateCategoryConcentration(categorySpending);
      expect(concentration).toHaveProperty('topCategories');
      expect(concentration).toHaveProperty('concentrationIndex');
      expect(concentration.topCategories).toHaveLength(3);
    });

    it('should handle single category', () => {
      const categorySpending = [
        { category: 'Groceries', amount: 500 },
      ];
      
      const concentration = calculateCategoryConcentration(categorySpending);
      expect(concentration.concentrationIndex).toBe(100);
    });

    it('should handle empty categories', () => {
      const concentration = calculateCategoryConcentration([]);
      expect(concentration.topCategories).toHaveLength(0);
    });
  });
});
