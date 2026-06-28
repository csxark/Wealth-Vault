import { describe, it, expect } from 'vitest';
import {
    filterExpensesByMonth,
    calculateCategorySpending,
    calculateTopCategories,
    calculateMonthlyTrend,
    calculateMonthlyChange,
    calculateTotalFromCategories,
    getPreviousMonth,
    computeAnalytics,
} from '../utils/calculations';
import type { Expense } from '../types';

// Helper to create mock expense objects
function createMockExpense(
    overrides: Partial<Expense> = {}
): Expense {
    return {
        id: 'test-id',
        userId: 'user-1',
        amount: 100,
        currency: 'INR',
        description: 'Test expense',
        category: 'Food',
        date: '2026-02-15',
        paymentMethod: 'UPI',
        isRecurring: false,
        status: 'completed',
        created_at: '2026-02-15T10:00:00Z',
        updated_at: '2026-02-15T10:00:00Z',
        ...overrides,
    };
}

describe('filterExpensesByMonth', () => {
    it('should filter expenses for a specific month and year', () => {
        const expenses: Expense[] = [
            createMockExpense({ id: '1', date: '2026-02-10' }),
            createMockExpense({ id: '2', date: '2026-02-20' }),
            createMockExpense({ id: '3', date: '2026-01-15' }),
            createMockExpense({ id: '4', date: '2026-03-05' }),
        ];

        const result = filterExpensesByMonth(expenses, 1, 2026); // February
        expect(result).toHaveLength(2);
        expect(result.map((e) => e.id)).toEqual(['1', '2']);
    });

    it('should return empty array when no expenses match', () => {
        const expenses: Expense[] = [
            createMockExpense({ date: '2026-02-10' }),
        ];

        const result = filterExpensesByMonth(expenses, 5, 2026); // June
        expect(result).toHaveLength(0);
    });

    it('should handle empty expense array', () => {
        const result = filterExpensesByMonth([], 1, 2026);
        expect(result).toHaveLength(0);
    });

    it('should correctly handle year boundaries (January)', () => {
        const expenses: Expense[] = [
            createMockExpense({ id: '1', date: '2025-12-15' }),
            createMockExpense({ id: '2', date: '2026-01-05' }),
        ];

        const result = filterExpensesByMonth(expenses, 11, 2025); // December 2025
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });
});

describe('calculateCategorySpending', () => {
    it('should aggregate spending by category', () => {
        const expenses: Expense[] = [
            createMockExpense({ category: 'Food', amount: 100 }),
            createMockExpense({ category: 'Food', amount: 50 }),
            createMockExpense({ category: 'Transport', amount: 200 }),
        ];

        const result = calculateCategorySpending(expenses);
        expect(result).toEqual({
            Food: 150,
            Transport: 200,
        });
    });

    it('should use absolute values for amounts', () => {
        const expenses: Expense[] = [
            createMockExpense({ category: 'Food', amount: -100 }),
            createMockExpense({ category: 'Food', amount: 50 }),
        ];

        const result = calculateCategorySpending(expenses);
        expect(result.Food).toBe(150); // 100 + 50 (absolute values)
    });

    it('should default to "Other" for expenses without category', () => {
        const expenses: Expense[] = [
            createMockExpense({ category: '', amount: 100 }),
            createMockExpense({ category: undefined as unknown as string, amount: 50 }),
        ];

        const result = calculateCategorySpending(expenses);
        expect(result.Other).toBe(150);
    });

    it('should handle empty expense array', () => {
        const result = calculateCategorySpending([]);
        expect(result).toEqual({});
    });

    it('should handle single expense', () => {
        const expenses: Expense[] = [
            createMockExpense({ category: 'Shopping', amount: 500 }),
        ];

        const result = calculateCategorySpending(expenses);
        expect(result).toEqual({ Shopping: 500 });
    });
});

describe('calculateTopCategories', () => {
    it('should return top 5 categories by default', () => {
        const spending: Record<string, number> = {
            Food: 500,
            Transport: 300,
            Shopping: 800,
            Entertainment: 200,
            Utilities: 150,
            Healthcare: 100,
        };

        const result = calculateTopCategories(spending);
        expect(result).toHaveLength(5);
        expect(result[0]).toEqual(['Shopping', 800]);
        expect(result[1]).toEqual(['Food', 500]);
    });

    it('should respect custom limit', () => {
        const spending: Record<string, number> = {
            Food: 500,
            Transport: 300,
            Shopping: 800,
        };

        const result = calculateTopCategories(spending, 2);
        expect(result).toHaveLength(2);
        expect(result).toEqual([
            ['Shopping', 800],
            ['Food', 500],
        ]);
    });

    it('should handle fewer categories than limit', () => {
        const spending: Record<string, number> = {
            Food: 500,
            Transport: 300,
        };

        const result = calculateTopCategories(spending, 5);
        expect(result).toHaveLength(2);
    });

    it('should handle empty spending record', () => {
        const result = calculateTopCategories({});
        expect(result).toHaveLength(0);
    });
});

describe('calculateMonthlyTrend', () => {
    it('should calculate 6-month trend by default', () => {
        const referenceDate = new Date('2026-02-15');
        const expenses: Expense[] = [
            createMockExpense({ date: '2026-02-10', amount: 100 }),
            createMockExpense({ date: '2026-01-15', amount: 200 }),
            createMockExpense({ date: '2025-12-20', amount: 150 }),
        ];

        const result = calculateMonthlyTrend(expenses, referenceDate);
        expect(result).toHaveLength(6);

        // Check that February (current month) has correct amount
        const febEntry = result.find((item) => item.month.includes('Feb'));
        expect(febEntry?.amount).toBe(100);

        // Check that January has correct amount
        const janEntry = result.find((item) => item.month.includes('Jan'));
        expect(janEntry?.amount).toBe(200);
    });

    it('should handle months with no expenses', () => {
        const referenceDate = new Date('2026-02-15');
        const expenses: Expense[] = [];

        const result = calculateMonthlyTrend(expenses, referenceDate);
        expect(result).toHaveLength(6);
        result.forEach((item) => {
            expect(item.amount).toBe(0);
        });
    });

    it('should use absolute values for amounts', () => {
        const referenceDate = new Date('2026-02-15');
        const expenses: Expense[] = [
            createMockExpense({ date: '2026-02-10', amount: -100 }),
        ];

        const result = calculateMonthlyTrend(expenses, referenceDate);
        const febEntry = result.find((item) => item.month.includes('Feb'));
        expect(febEntry?.amount).toBe(100);
    });
});

describe('calculateMonthlyChange', () => {
    it('should calculate positive percentage change (increase)', () => {
        const result = calculateMonthlyChange(150, 100);
        expect(result).toBe(50);
    });

    it('should calculate negative percentage change (decrease)', () => {
        const result = calculateMonthlyChange(75, 100);
        expect(result).toBe(-25);
    });

    it('should return 0 when previous total is 0', () => {
        const result = calculateMonthlyChange(100, 0);
        expect(result).toBe(0);
    });

    it('should handle zero current total', () => {
        const result = calculateMonthlyChange(0, 100);
        expect(result).toBe(-100);
    });

    it('should handle identical values', () => {
        const result = calculateMonthlyChange(100, 100);
        expect(result).toBe(0);
    });

    it('should handle floating-point precision correctly', () => {
        // 33.33% increase
        const result = calculateMonthlyChange(400, 300);
        expect(result).toBeCloseTo(33.33, 1);
    });
});

describe('calculateTotalFromCategories', () => {
    it('should sum all category values', () => {
        const spending: Record<string, number> = {
            Food: 100,
            Transport: 200,
            Shopping: 300,
        };

        const result = calculateTotalFromCategories(spending);
        expect(result).toBe(600);
    });

    it('should return 0 for empty record', () => {
        const result = calculateTotalFromCategories({});
        expect(result).toBe(0);
    });

    it('should handle single category', () => {
        const result = calculateTotalFromCategories({ Food: 500 });
        expect(result).toBe(500);
    });
});

describe('getPreviousMonth', () => {
    it('should return previous month for mid-year', () => {
        const result = getPreviousMonth(5, 2026); // June
        expect(result).toEqual({ prevMonth: 4, prevYear: 2026 }); // May
    });

    it('should handle January -> December year boundary', () => {
        const result = getPreviousMonth(0, 2026); // January
        expect(result).toEqual({ prevMonth: 11, prevYear: 2025 }); // December 2025
    });
});

describe('computeAnalytics', () => {
    it('should compute complete analytics for expenses', () => {
        const referenceDate = new Date('2026-02-15');
        const expenses: Expense[] = [
            createMockExpense({ category: 'Food', amount: 100, date: '2026-02-10' }),
            createMockExpense({ category: 'Food', amount: 50, date: '2026-02-20' }),
            createMockExpense({ category: 'Transport', amount: 200, date: '2026-02-05' }),
            createMockExpense({ category: 'Food', amount: 300, date: '2026-01-15' }),
        ];

        const result = computeAnalytics(expenses, referenceDate);

        expect(result.currentTotal).toBe(350); // 100 + 50 + 200
        expect(result.prevTotal).toBe(300);
        expect(result.categorySpending).toEqual({
            Food: 150,
            Transport: 200,
        });
        expect(result.prevCategorySpending).toEqual({
            Food: 300,
        });
        expect(result.topCategories).toHaveLength(2);
        expect(result.monthlyTrend).toHaveLength(6);
    });

    it('should handle empty expenses array', () => {
        const result = computeAnalytics([]);

        expect(result.currentTotal).toBe(0);
        expect(result.prevTotal).toBe(0);
        expect(result.categorySpending).toEqual({});
        expect(result.topCategories).toHaveLength(0);
        expect(result.monthlyTrend).toHaveLength(6);
    });
});
