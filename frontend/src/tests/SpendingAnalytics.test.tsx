import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpendingAnalytics from '../components/Dashboard/SpendingAnalytics';
import type { Expense } from '../types';

// Mock Chart.js to avoid canvas rendering issues in tests
vi.mock('react-chartjs-2', () => ({
    Pie: () => <div data-testid="pie-chart">Pie Chart</div>,
    Bar: () => <div data-testid="bar-chart">Bar Chart</div>,
    Line: () => <div data-testid="line-chart">Line Chart</div>,
}));

// Helper to create mock expense objects
function createMockExpense(overrides: Partial<Expense> = {}): Expense {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];

    return {
        id: 'test-id',
        userId: 'user-1',
        amount: 100,
        currency: 'INR',
        description: 'Test expense',
        category: 'Food',
        date: currentDate,
        paymentMethod: 'UPI',
        isRecurring: false,
        status: 'completed',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        ...overrides,
    };
}

// Mock formatAmount function
const mockFormatAmount = (amount: number) => `₹${amount.toLocaleString()}`;

describe('SpendingAnalytics Component', () => {
    it('should render the "This Month" summary card with correct total', () => {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];

        const expenses: Expense[] = [
            createMockExpense({ amount: 1000, date: currentDate }),
            createMockExpense({ amount: 500, date: currentDate }),
            createMockExpense({ amount: 250, date: currentDate }),
        ];

        render(
            <SpendingAnalytics expenses={expenses} formatAmount={mockFormatAmount} />
        );

        // Check that the "This Month" label exists
        expect(screen.getByText('This Month')).toBeInTheDocument();

        // Check that the formatted total is displayed somewhere in the document
        // The total should be 1750 for current month expenses
        const container = screen.getByText('This Month').closest('div')?.parentElement;
        expect(container).toBeTruthy();
        expect(container?.textContent).toMatch(/1,?750/);
    });

    it('should render the "Monthly Change" section', () => {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];

        // Get previous month date
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
        const prevDate = prevMonth.toISOString().split('T')[0];

        const expenses: Expense[] = [
            createMockExpense({ amount: 150, date: currentDate }),
            createMockExpense({ amount: 100, date: prevDate }),
        ];

        render(
            <SpendingAnalytics expenses={expenses} formatAmount={mockFormatAmount} />
        );

        expect(screen.getByText('Monthly Change')).toBeInTheDocument();
    });

    it('should render the "Categories" count correctly', () => {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];

        const expenses: Expense[] = [
            createMockExpense({ category: 'Food', amount: 100, date: currentDate }),
            createMockExpense({ category: 'Transport', amount: 200, date: currentDate }),
            createMockExpense({ category: 'Shopping', amount: 300, date: currentDate }),
        ];

        render(
            <SpendingAnalytics expenses={expenses} formatAmount={mockFormatAmount} />
        );

        expect(screen.getByText('Categories')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should render chart sections', () => {
        const expenses: Expense[] = [
            createMockExpense({ amount: 100 }),
        ];

        render(
            <SpendingAnalytics expenses={expenses} formatAmount={mockFormatAmount} />
        );

        expect(screen.getByText('Category Distribution')).toBeInTheDocument();
        expect(screen.getByText('Category Breakdown')).toBeInTheDocument();
        expect(screen.getByText('6-Month Spending Trend')).toBeInTheDocument();
        expect(screen.getByText('Top Spending Categories')).toBeInTheDocument();
    });

    it('should handle empty expenses array gracefully', () => {
        render(
            <SpendingAnalytics expenses={[]} formatAmount={mockFormatAmount} />
        );

        expect(screen.getByText('This Month')).toBeInTheDocument();
        expect(screen.getByText('₹0')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument(); // Categories count
    });

    it('should render mocked charts', () => {
        const expenses: Expense[] = [
            createMockExpense({ amount: 100 }),
        ];

        render(
            <SpendingAnalytics expenses={expenses} formatAmount={mockFormatAmount} />
        );

        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should display top categories with correct formatting', () => {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];

        const expenses: Expense[] = [
            createMockExpense({ category: 'Food', amount: 500, date: currentDate }),
            createMockExpense({ category: 'Transport', amount: 300, date: currentDate }),
        ];

        render(
            <SpendingAnalytics expenses={expenses} formatAmount={mockFormatAmount} />
        );

        // Category names should appear in the top categories section
        expect(screen.getAllByText('Food')).toHaveLength(1);
        expect(screen.getAllByText('Transport')).toHaveLength(1);
    });
});
