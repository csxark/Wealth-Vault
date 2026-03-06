import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const DEFAULT_HORIZON_MONTHS = 360;
const MAX_HORIZON_MONTHS = 600;

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeApr = (value) => {
    const parsed = toNumber(value, 0);
    if (parsed <= 0) return 0;
    if (parsed > 1 && parsed <= 100) return parsed / 100;
    return parsed;
};

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    debtType: debt.debtType || debt.type || 'other',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: normalizeApr(debt.apr ?? debt.annualRate ?? debt.interestRate),
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0))
});

class DebtVariableAprOptimizerService {
    async getActiveDebts(userId) {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true))
        });

        return userDebts.map(normalizeDebt).filter((debt) => debt.balance > 0);
    }

    /**
     * Get the effective APR for a debt at a given month based on rate schedule
     */
    getEffectiveApr(baseApr, rateSchedule = [], month = 1) {
        if (!Array.isArray(rateSchedule) || rateSchedule.length === 0) {
            return baseApr;
        }

        // Sort by month and find the applicable rate
        const sortedSchedule = rateSchedule
            .filter(r => r && toNumber(r.month, 0) > 0)
            .sort((a, b) => toNumber(a.month, 0) - toNumber(b.month, 0));

        let effectiveApr = baseApr;
        for (const rateChange of sortedSchedule) {
            const changeMonth = Math.trunc(toNumber(rateChange.month, 0));
            if (changeMonth > month) break;
            effectiveApr = normalizeApr(rateChange.apr);
        }

        return effectiveApr;
    }

    /**
     * Apply rate schedule adjustment to create stress band scenarios
     */
    createStressBandDebts(baseDebts, stressBand = 'base') {
        return baseDebts.map(debt => {
            let adjustment = 0;
            if (stressBand === 'pessimistic') {
                adjustment = 0.02; // +2% APR
            } else if (stressBand === 'optimistic') {
                adjustment = -0.01; // -1% APR
            }
            // base has 0 adjustment

            return {
                ...debt,
                apr: Math.max(0, debt.apr + adjustment)
            };
        });
    }

    /**
     * Simulate debt payoff using a specific strategy
     */
    simulatePayoffStrategy(debts, strategy = 'avalanche', rateSchedules = {}, horizonMonths = 360) {
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);
        const debtStates = debts.map(d => ({
            ...d,
            balance: d.balance,
            totalInterest: 0,
            closedMonth: null,
            schedule: rateSchedules[d.id] || []
        }));

        const monthlyBreakdown = [];

        for (let month = 1; month <= months; month++) {
            const monthState = {
                month,
                debts: [],
                totalPayment: 0,
                totalInterest: 0,
                activeDebts: 0
            };

            // Step 1: Accrue interest for all active debts
            for (const debt of debtStates) {
                if (debt.closedMonth) continue;

                const effectiveApr = this.getEffectiveApr(debt.apr, debt.schedule, month);
                const monthlyRate = effectiveApr / 12;
                const interest = roundMoney(debt.balance * monthlyRate);

                debt.balance += interest;
                debt.totalInterest += interest;
                monthState.totalInterest += interest;

                if (debt.balance > 0.01) {
                    monthState.activeDebts++;
                }
            }

            // Step 2: Allocate payments based on strategy
            const totalMinPayment = roundMoney(
                debtStates
                    .filter(d => !d.closedMonth && d.balance > 0.01)
                    .reduce((sum, d) => sum + d.minimumPayment, 0)
            );

            // Apply minimum payments first
            for (const debt of debtStates) {
                if (debt.closedMonth || debt.balance < 0.01) continue;

                const payment = Math.min(debt.minimumPayment, debt.balance);
                debt.balance = roundMoney(Math.max(0, debt.balance - payment));
                monthState.totalPayment += payment;

                if (debt.balance < 0.01) {
                    debt.closedMonth = month;
                }
            }

            // Step 3: Apply extra payment using strategy
            const extraordinaryPayment = Math.max(0, totalMinPayment * 0.1); // 10% buffer for strategic allocation

            if (extraordinaryPayment > 0.01) {
                const activeDebts = debtStates.filter(d => !d.closedMonth && d.balance > 0.01);

                if (strategy === 'avalanche') {
                    // Highest APR first
                    activeDebts.sort((a, b) => {
                        const aprA = this.getEffectiveApr(a.apr, a.schedule, month);
                        const aprB = this.getEffectiveApr(b.apr, b.schedule, month);
                        return aprB - aprA;
                    });
                } else if (strategy === 'snowball') {
                    // Smallest balance first
                    activeDebts.sort((a, b) => a.balance - b.balance);
                } else if (strategy === 'hybrid') {
                    // Balance APR impact with balance size
                    activeDebts.sort((a, b) => {
                        const aprA = this.getEffectiveApr(a.apr, a.schedule, month);
                        const aprB = this.getEffectiveApr(b.apr, b.schedule, month);
                        const scoreA = (aprA * 100 + a.balance) / 1000;
                        const scoreB = (aprB * 100 + b.balance) / 1000;
                        return scoreB - scoreA;
                    });
                }

                let remaining = extraordinaryPayment;
                for (const debt of activeDebts) {
                    if (remaining < 0.01) break;

                    const payment = Math.min(remaining, debt.balance);
                    debt.balance = roundMoney(Math.max(0, debt.balance - payment));
                    remaining = roundMoney(remaining - payment);
                    monthState.totalPayment += payment;

                    if (debt.balance < 0.01) {
                        debt.closedMonth = month;
                    }
                }
            }

            // Step 4: Record month state
            for (const debt of debtStates) {
                monthState.debts.push({
                    id: debt.id,
                    name: debt.name,
                    balance: roundMoney(debt.balance),
                    totalInterest: roundMoney(debt.totalInterest),
                    closedMonth: debt.closedMonth
                });
            }

            monthlyBreakdown.push(monthState);

            // Stop if all debts closed
            if (debtStates.every(d => d.closedMonth)) break;
        }

        const totalInterestPaid = roundMoney(debtStates.reduce((sum, d) => sum + d.totalInterest, 0));
        const monthsToPayoff = Math.max(...debtStates.map(d => d.closedMonth || months));
        const totalPayments = roundMoney(debtStates.reduce((sum, d) => sum + d.balance + d.totalInterest, 0));

        return {
            strategy,
            monthsToPayoff,
            totalInterestPaid,
            totalPayments,
            monthlyBreakdown: monthlyBreakdown.slice(0, monthsToPayoff)
        };
    }

    /**
     * Recommend best strategy for each stress band scenario
     */
    recommendStrategy(baseDebts, strategies = ['avalanche', 'snowball', 'hybrid'], rateSchedules = {}, horizonMonths = 360) {
        const stressBands = ['base', 'optimistic', 'pessimistic'];
        const scenarios = [];

        for (const band of stressBands) {
            const bandDebts = this.createStressBandDebts(baseDebts, band);

            const results = [];
            for (const strategy of strategies) {
                const result = this.simulatePayoffStrategy(
                    bandDebts,
                    strategy,
                    rateSchedules,
                    horizonMonths
                );
                results.push(result);
            }

            // Find best strategy (lowest interest paid)
            const bestStrategy = results.reduce((best, curr) =>
                curr.totalInterestPaid < best.totalInterestPaid ? curr : best
            );

            scenarios.push({
                stressBand: band,
                description: band === 'base' ? 'Base case (current rates)' :
                    band === 'optimistic' ? 'Optimistic case (rates down)' :
                    'Pessimistic case (rates up)',
                strategies: results,
                recommended: {
                    strategy: bestStrategy.strategy,
                    monthsToPayoff: bestStrategy.monthsToPayoff,
                    totalInterestPaid: bestStrategy.totalInterestPaid,
                    estimatedSavings: results
                        .filter(r => r.strategy !== bestStrategy.strategy)
                        .map(r => ({
                            strategy: r.strategy,
                            additionalInterest: roundMoney(r.totalInterestPaid - bestStrategy.totalInterestPaid),
                            monthsAdditional: r.monthsToPayoff - bestStrategy.monthsToPayoff
                        }))
                }
            });
        }

        return scenarios;
    }

    /**
     * Main entry point for variable APR optimization
     */
    async optimize(userId, payload = {}) {
        const baseDebts = await this.getActiveDebts(userId);

        if (baseDebts.length === 0) {
            return {
                success: false,
                message: 'No active debts found',
                scenarios: []
            };
        }

        const horizonMonths = clamp(toNumber(payload.horizonMonths, DEFAULT_HORIZON_MONTHS), 1, MAX_HORIZON_MONTHS);
        const rateSchedules = payload.rateSchedules || {};
        const strategies = (payload.strategies && Array.isArray(payload.strategies))
            ? payload.strategies.filter(s => ['avalanche', 'snowball', 'hybrid'].includes(s))
            : ['avalanche', 'snowball', 'hybrid'];

        if (strategies.length === 0) {
            return {
                success: false,
                message: 'No valid strategies specified',
                scenarios: []
            };
        }

        // Validate rate schedules structure
        const validatedSchedules = {};
        for (const [debtId, schedule] of Object.entries(rateSchedules)) {
            if (Array.isArray(schedule)) {
                validatedSchedules[debtId] = schedule.filter(r =>
                    r && toNumber(r.month, 0) > 0 && (r.apr !== undefined && r.apr !== null)
                ).map(r => ({
                    month: Math.trunc(toNumber(r.month, 0)),
                    apr: normalizeApr(r.apr)
                }));
            }
        }

        const scenarios = this.recommendStrategy(
            baseDebts,
            strategies,
            validatedSchedules,
            horizonMonths
        );

        // Calculate baseline (no optimization, just minimum payments)
        const baselineResult = this.simulatePayoffStrategy(
            baseDebts,
            'avalanche',
            validatedSchedules,
            horizonMonths
        );

        return {
            success: true,
            message: 'Variable APR optimization complete',
            baseline: {
                monthsToPayoff: baselineResult.monthsToPayoff,
                totalInterestPaid: baselineResult.totalInterestPaid,
                strategy: 'current_minimum_payments'
            },
            scenarios,
            analysis: {
                debtCount: baseDebts.length,
                totalBalance: roundMoney(baseDebts.reduce((sum, d) => sum + d.balance, 0)),
                averageAPR: roundMoney(
                    baseDebts.reduce((sum, d) => sum + d.apr, 0) / baseDebts.length * 100
                ),
                rateScheduleCount: Object.keys(validatedSchedules).length
            }
        };
    }
}

export default new DebtVariableAprOptimizerService();
