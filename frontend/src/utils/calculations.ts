import type { Expense } from '../types';

/**
 * Financial calculation utilities for the Wealth-Vault application.
 * These pure functions are extracted from SpendingAnalytics for testability.
 */

export interface MonthlyTrendItem {
    month: string;
    amount: number;
}

export interface AnalyticsResult {
    categorySpending: Record<string, number>;
    prevCategorySpending: Record<string, number>;
    topCategories: [string, number][];
    monthlyTrend: MonthlyTrendItem[];
    currentTotal: number;
    prevTotal: number;
}

/**
 * Filters expenses to only include those from a specific month and year.
 * @param expenses - Array of expense objects
 * @param month - Month (0-11, where 0 is January)
 * @param year - Full year (e.g., 2026)
 * @returns Filtered array of expenses
 */
export function filterExpensesByMonth(
    expenses: Expense[],
    month: number,
    year: number
): Expense[] {
    return expenses.filter((exp) => {
        const expDate = new Date(exp.date);
        return expDate.getMonth() === month && expDate.getFullYear() === year;
    });
}

/**
 * Calculates total spending per category from an array of expenses.
 * Uses absolute values to handle both income and expense amounts.
 * @param expenses - Array of expense objects
 * @returns Record mapping category names to total amounts
 */
export function calculateCategorySpending(
    expenses: Expense[]
): Record<string, number> {
    return expenses.reduce((acc, exp) => {
        const category = exp.category || 'Other';
        acc[category] = (acc[category] || 0) + Math.abs(exp.amount);
        return acc;
    }, {} as Record<string, number>);
}

/**
 * Gets the top N categories by spending amount.
 * @param categorySpending - Record of category spending totals
 * @param limit - Maximum number of categories to return (default: 5)
 * @returns Array of [category, amount] tuples sorted by amount descending
 */
export function calculateTopCategories(
    categorySpending: Record<string, number>,
    limit: number = 5
): [string, number][] {
    return Object.entries(categorySpending)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit);
}

/**
 * Calculates monthly spending trend for the last N months.
 * @param expenses - Array of expense objects
 * @param referenceDate - The reference date (defaults to current date)
 * @param months - Number of months to include (default: 6)
 * @returns Array of monthly trend items with month label and total amount
 */
export function calculateMonthlyTrend(
    expenses: Expense[],
    referenceDate: Date = new Date(),
    months: number = 6
): MonthlyTrendItem[] {
    const currentMonth = referenceDate.getMonth();
    const currentYear = referenceDate.getFullYear();
    const trend: MonthlyTrendItem[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - i, 1);
        const monthExpenses = filterExpensesByMonth(
            expenses,
            date.getMonth(),
            date.getFullYear()
        );
        const total = monthExpenses.reduce(
            (sum, exp) => sum + Math.abs(exp.amount),
            0
        );
        trend.push({
            month: date.toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit',
            }),
            amount: total,
        });
    }

    return trend;
}

/**
 * Calculates the percentage change between two values.
 * Returns 0 if the previous value is 0 to avoid division by zero.
 * @param currentTotal - Current period total
 * @param prevTotal - Previous period total
 * @returns Percentage change (positive = increase, negative = decrease)
 */
export function calculateMonthlyChange(
    currentTotal: number,
    prevTotal: number
): number {
    if (prevTotal === 0) {
        return 0;
    }
    return ((currentTotal - prevTotal) / prevTotal) * 100;
}

/**
 * Calculates the sum of all values in a category spending record.
 * @param categorySpending - Record of category spending totals
 * @returns Total sum of all category amounts
 */
export function calculateTotalFromCategories(
    categorySpending: Record<string, number>
): number {
    return Object.values(categorySpending).reduce((sum, val) => sum + val, 0);
}

/**
 * Gets the previous month and year given a reference month/year.
 * Handles year boundary (January -> December of previous year).
 * @param month - Current month (0-11)
 * @param year - Current year
 * @returns Object with prevMonth and prevYear
 */
export function getPreviousMonth(
    month: number,
    year: number
): { prevMonth: number; prevYear: number } {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    return { prevMonth, prevYear };
}

/**
 * Computes complete analytics from an array of expenses.
 * This is the main entry point that combines all calculation functions.
 * @param expenses - Array of expense objects
 * @param referenceDate - Optional reference date (defaults to current date)
 * @returns Complete analytics result object
 */
export function computeAnalytics(
    expenses: Expense[],
    referenceDate: Date = new Date()
): AnalyticsResult {
    const currentMonth = referenceDate.getMonth();
    const currentYear = referenceDate.getFullYear();

    // Current month expenses
    const currentMonthExpenses = filterExpensesByMonth(
        expenses,
        currentMonth,
        currentYear
    );

    // Previous month expenses
    const { prevMonth, prevYear } = getPreviousMonth(currentMonth, currentYear);
    const prevMonthExpenses = filterExpensesByMonth(expenses, prevMonth, prevYear);

    // Category spending
    const categorySpending = calculateCategorySpending(currentMonthExpenses);
    const prevCategorySpending = calculateCategorySpending(prevMonthExpenses);

    // Top categories
    const topCategories = calculateTopCategories(categorySpending);

    // Monthly trend
    const monthlyTrend = calculateMonthlyTrend(expenses, referenceDate);

    // Totals
    const currentTotal = calculateTotalFromCategories(categorySpending);
    const prevTotal = calculateTotalFromCategories(prevCategorySpending);

    return {
        categorySpending,
        prevCategorySpending,
        topCategories,
        monthlyTrend,
        currentTotal,
        prevTotal,
    };
}
