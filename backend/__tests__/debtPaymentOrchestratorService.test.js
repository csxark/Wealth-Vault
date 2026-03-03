import { describe, it, expect } from '@jest/globals';
import debtPaymentOrchestratorService from '../services/debtPaymentOrchestratorService.js';

describe('Debt Payment Orchestrator Service', () => {
    describe('calculateAvailableCashFlow', () => {
        it('calculates available cash flow with safety buffer', async () => {
            const result = await debtPaymentOrchestratorService.calculateAvailableCashFlow('user-1', {
                monthlyIncome: 6000,
                monthlyExpenses: 4200,
                minCashBuffer: 300
            });

            expect(result.monthlyIncome).toBe(6000);
            expect(result.monthlyExpenses).toBe(4200);
            expect(result.minCashBuffer).toBe(300);
            expect(result.availableCashFlow).toBe(1500);
            expect(result.timestamp).toBeDefined();
        });

        it('never returns negative available cash flow', async () => {
            const result = await debtPaymentOrchestratorService.calculateAvailableCashFlow('user-1', {
                monthlyIncome: 2000,
                monthlyExpenses: 2200,
                minCashBuffer: 300
            });

            expect(result.availableCashFlow).toBe(0);
        });
    });

    describe('calculateTotalMinimumPayment', () => {
        it('sums minimum payments for active debts only', () => {
            const result = debtPaymentOrchestratorService.calculateTotalMinimumPayment([
                { id: 'd1', balance: 1200, minimumPayment: 50 },
                { id: 'd2', balance: 4500, minimumPayment: 120 },
                { id: 'd3', balance: 0, minimumPayment: 999 }
            ]);

            expect(result).toBe(170);
        });
    });

    describe('allocateExtraPayment', () => {
        const sampleDebts = [
            { id: 'd1', name: 'Card A', apr: 0.24, balance: 4000, minimumPayment: 120 },
            { id: 'd2', name: 'Loan B', apr: 0.12, balance: 1000, minimumPayment: 60 },
            { id: 'd3', name: 'Card C', apr: 0.18, balance: 2500, minimumPayment: 90 }
        ];

        it('prioritizes highest APR first for avalanche', () => {
            const result = debtPaymentOrchestratorService.allocateExtraPayment(sampleDebts, 600, 'avalanche');

            expect(result.length).toBeGreaterThan(0);
            expect(result[0].debtId).toBe('d1');
            expect(result[0].priority).toBe(1);
        });

        it('prioritizes smallest balance first for snowball', () => {
            const result = debtPaymentOrchestratorService.allocateExtraPayment(sampleDebts, 600, 'snowball');

            expect(result.length).toBeGreaterThan(0);
            expect(result[0].debtId).toBe('d2');
            expect(result[0].priority).toBe(1);
        });

        it('returns empty allocation when no extra payment exists', () => {
            const result = debtPaymentOrchestratorService.allocateExtraPayment(sampleDebts, 0, 'avalanche');
            expect(result).toEqual([]);
        });

        it('does not allocate more than 50% of a debt balance in one pass', () => {
            const result = debtPaymentOrchestratorService.allocateExtraPayment([
                { id: 'x1', name: 'Small Debt', apr: 0.3, balance: 100, minimumPayment: 10 }
            ], 1000, 'avalanche');

            expect(result[0].extraPayment).toBeLessThanOrEqual(50);
        });
    });

    describe('generateAlerts', () => {
        it('adds high-severity cash-flow alert for very low available cash', () => {
            const alerts = debtPaymentOrchestratorService.generateAlerts([], [], { availableCashFlow: 80 });

            expect(alerts.some(a => a.type === 'low-cash-flow' && a.severity === 'high')).toBe(true);
        });

        it('adds high-interest debt alert when APR is above threshold', () => {
            const alerts = debtPaymentOrchestratorService.generateAlerts([], [
                { id: 'd1', name: 'Card A', apr: 0.19, balance: 2000 }
            ], { availableCashFlow: 1000 });

            expect(alerts.some(a => a.type === 'high-interest-debt')).toBe(true);
        });

        it('adds high rate-change alert when a large APR jump is detected', () => {
            const alerts = debtPaymentOrchestratorService.generateAlerts([
                {
                    debtId: 'd1',
                    debtName: 'Card A',
                    previousAPR: 14,
                    currentAPR: 19,
                    change: 5,
                    alert: 'high'
                }
            ], [], { availableCashFlow: 1000 });

            expect(alerts.some(a => a.type === 'rate-change-high' && a.severity === 'high')).toBe(true);
        });
    });
});
