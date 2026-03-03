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

const isActiveInWindow = (month, startMonth, endMonth) => {
    const start = Math.max(1, Math.trunc(toNumber(startMonth, 1)));
    const end = Math.max(start, Math.trunc(toNumber(endMonth, MAX_HORIZON_MONTHS)));
    return month >= start && month <= end;
};

class DebtWhatIfSimulatorService {
    async getActiveDebts(userId) {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true))
        });

        return userDebts.map(normalizeDebt).filter((debt) => debt.balance > 0);
    }

    splitScenarioRules(scenario = {}) {
        return {
            oneTimeLumpSums: Array.isArray(scenario.oneTimeLumpSums) ? scenario.oneTimeLumpSums : [],
            recurringExtraPayments: Array.isArray(scenario.recurringExtraPayments) ? scenario.recurringExtraPayments : [],
            paymentPauses: Array.isArray(scenario.paymentPauses) ? scenario.paymentPauses : [],
            paymentIncreaseSchedules: Array.isArray(scenario.paymentIncreaseSchedules) ? scenario.paymentIncreaseSchedules : []
        };
    }

    isPaused(debtId, month, pauses) {
        return pauses.some((pause) => {
            const appliesToDebt = !pause.debtId || pause.debtId === debtId;
            return appliesToDebt && isActiveInWindow(month, pause.startMonth, pause.endMonth);
        });
    }

    resolveRecurringExtra(month, recurringExtraPayments) {
        const global = recurringExtraPayments
            .filter((item) => !item.debtId && isActiveInWindow(month, item.startMonth, item.endMonth))
            .reduce((sum, item) => sum + Math.max(0, toNumber(item.amount, 0)), 0);

        const byDebt = recurringExtraPayments
            .filter((item) => item.debtId && isActiveInWindow(month, item.startMonth, item.endMonth))
            .reduce((map, item) => {
                map[item.debtId] = (map[item.debtId] || 0) + Math.max(0, toNumber(item.amount, 0));
                return map;
            }, {});

        return { global, byDebt };
    }

    resolveLumpSums(month, oneTimeLumpSums) {
        const thisMonth = oneTimeLumpSums.filter((item) => Math.trunc(toNumber(item.month, -1)) === month);

        const global = thisMonth
            .filter((item) => !item.debtId)
            .reduce((sum, item) => sum + Math.max(0, toNumber(item.amount, 0)), 0);

        const byDebt = thisMonth
            .filter((item) => item.debtId)
            .reduce((map, item) => {
                map[item.debtId] = (map[item.debtId] || 0) + Math.max(0, toNumber(item.amount, 0));
                return map;
            }, {});

        return { global, byDebt };
    }

    resolveIncrease(month, paymentIncreaseSchedules) {
        let global = 0;
        const byDebt = {};

        for (const schedule of paymentIncreaseSchedules) {
            const startMonth = Math.max(1, Math.trunc(toNumber(schedule.startMonth, 1)));
            if (month < startMonth) continue;

            const frequency = Math.max(1, Math.trunc(toNumber(schedule.frequencyMonths, 1)));
            const increments = Math.floor((month - startMonth) / frequency) + 1;
            const increaseAmount = Math.max(0, toNumber(schedule.incrementAmount, 0)) * increments;

            if (schedule.debtId) {
                byDebt[schedule.debtId] = (byDebt[schedule.debtId] || 0) + increaseAmount;
            } else {
                global += increaseAmount;
            }
        }

        return { global, byDebt };
    }

    applyTargetedPrincipal(stateByDebt, targetedByDebt) {
        let applied = 0;

        Object.entries(targetedByDebt).forEach(([debtId, amount]) => {
            const debt = stateByDebt[debtId];
            if (!debt || debt.balance <= 0) return;

            const principalPayment = Math.min(debt.balance, Math.max(0, amount));
            debt.balance = roundMoney(debt.balance - principalPayment);
            debt.totalPayment += principalPayment;
            debt.principalPaid += principalPayment;
            debt.extraPayment += principalPayment;
            applied += principalPayment;
        });

        return applied;
    }

    applyGlobalExtra(stateByDebt, amount) {
        let remaining = Math.max(0, amount);
        let applied = 0;

        while (remaining > 0.01) {
            const target = Object.values(stateByDebt)
                .filter((debt) => debt.balance > 0)
                .sort((a, b) => b.apr - a.apr)[0];

            if (!target) break;

            const payment = Math.min(target.balance, remaining);
            target.balance = roundMoney(target.balance - payment);
            target.totalPayment += payment;
            target.principalPaid += payment;
            target.extraPayment += payment;
            remaining = roundMoney(remaining - payment);
            applied += payment;
        }

        return applied;
    }

    buildMilestoneTimeline(closeEvents) {
        const grouped = closeEvents.reduce((acc, event) => {
            if (!acc[event.month]) {
                acc[event.month] = { month: event.month, debtsClosed: [] };
            }
            acc[event.month].debtsClosed.push({
                debtId: event.debtId,
                debtName: event.debtName
            });
            return acc;
        }, {});

        return Object.values(grouped).sort((a, b) => a.month - b.month);
    }

    simulateScenario(baseDebts, options = {}) {
        const horizonMonths = clamp(
            Math.trunc(toNumber(options.horizonMonths, DEFAULT_HORIZON_MONTHS)),
            1,
            MAX_HORIZON_MONTHS
        );

        const baseMinimumBudget = baseDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
        const monthlyBudget = Math.max(toNumber(options.monthlyBudget, baseMinimumBudget), 0);

        const {
            oneTimeLumpSums,
            recurringExtraPayments,
            paymentPauses,
            paymentIncreaseSchedules
        } = this.splitScenarioRules(options);

        const stateByDebt = baseDebts.reduce((map, debt) => {
            map[debt.id] = {
                ...debt,
                startingBalance: debt.balance,
                totalInterest: 0,
                totalPrincipal: 0,
                totalPayments: 0
            };
            return map;
        }, {});

        const monthlyAmortization = [];
        const closeEvents = [];
        const closedDebtIds = new Set();
        let totalInterest = 0;
        let totalPaid = 0;
        let payoffMonth = null;

        for (let month = 1; month <= horizonMonths; month += 1) {
            const activeDebts = Object.values(stateByDebt).filter((debt) => debt.balance > 0.01);
            if (activeDebts.length === 0) {
                payoffMonth = month - 1;
                break;
            }

            const recurring = this.resolveRecurringExtra(month, recurringExtraPayments);
            const lumpSums = this.resolveLumpSums(month, oneTimeLumpSums);
            const increases = this.resolveIncrease(month, paymentIncreaseSchedules);

            const monthState = {
                month,
                interestPaid: 0,
                principalPaid: 0,
                minimumPayment: 0,
                extraPayment: 0,
                totalPayment: 0,
                remainingBalance: 0,
                debtsClosedThisMonth: []
            };

            // 1) Accrue interest
            activeDebts.forEach((debt) => {
                const interest = roundMoney(debt.balance * (debt.apr / 12));
                debt.balance = roundMoney(debt.balance + interest);
                debt.interestPaid = interest;
                debt.principalPaid = 0;
                debt.totalPayment = 0;
                debt.extraPayment = 0;

                debt.totalInterest += interest;
                totalInterest += interest;
                monthState.interestPaid += interest;
            });

            // 2) Apply minimum/base budget payments
            let remainingBudget = monthlyBudget;

            const minimumPlan = activeDebts.map((debt) => {
                const paused = this.isPaused(debt.id, month, paymentPauses);
                const target = paused ? 0 : Math.min(debt.minimumPayment, debt.balance);
                return { debt, target };
            });

            for (const plan of minimumPlan) {
                if (remainingBudget <= 0) break;
                const payment = Math.min(plan.target, remainingBudget, plan.debt.balance);
                plan.debt.balance = roundMoney(plan.debt.balance - payment);
                plan.debt.totalPayment += payment;
                remainingBudget = roundMoney(remainingBudget - payment);
                monthState.minimumPayment += payment;
            }

            // 3) Apply schedule-based targeted increases
            const targetedIncreases = { ...increases.byDebt };
            this.applyTargetedPrincipal(stateByDebt, targetedIncreases);

            // 4) Apply schedule-based global increases (as avalanche extra)
            if (increases.global > 0) {
                this.applyGlobalExtra(stateByDebt, increases.global);
            }

            // 5) Apply recurring targeted extras
            this.applyTargetedPrincipal(stateByDebt, recurring.byDebt);

            // 6) Apply recurring global extras
            if (recurring.global > 0) {
                this.applyGlobalExtra(stateByDebt, recurring.global);
            }

            // 7) Apply one-time targeted lump sums
            this.applyTargetedPrincipal(stateByDebt, lumpSums.byDebt);

            // 8) Apply one-time global lump sums
            if (lumpSums.global > 0) {
                this.applyGlobalExtra(stateByDebt, lumpSums.global);
            }

            // 9) Apply any leftover monthly budget as avalanche extra
            if (remainingBudget > 0) {
                this.applyGlobalExtra(stateByDebt, remainingBudget);
            }

            // 10) Month summary + closure milestones
            Object.values(stateByDebt).forEach((debt) => {
                const principalPaid = roundMoney(debt.totalPayment - debt.interestPaid);
                debt.totalPrincipal += Math.max(0, principalPaid);
                debt.totalPayments += debt.totalPayment;

                monthState.principalPaid += Math.max(0, principalPaid);
                monthState.extraPayment += debt.extraPayment;
                monthState.totalPayment += debt.totalPayment;
                monthState.remainingBalance += debt.balance;

                if (debt.balance <= 0.01 && !closedDebtIds.has(debt.id)) {
                    closedDebtIds.add(debt.id);
                    closeEvents.push({ month, debtId: debt.id, debtName: debt.name });
                    monthState.debtsClosedThisMonth.push({ debtId: debt.id, debtName: debt.name });
                }
            });

            monthState.remainingBalance = roundMoney(monthState.remainingBalance);
            monthState.interestPaid = roundMoney(monthState.interestPaid);
            monthState.principalPaid = roundMoney(monthState.principalPaid);
            monthState.minimumPayment = roundMoney(monthState.minimumPayment);
            monthState.extraPayment = roundMoney(monthState.extraPayment);
            monthState.totalPayment = roundMoney(monthState.totalPayment);

            totalPaid = roundMoney(totalPaid + monthState.totalPayment);
            monthlyAmortization.push(monthState);
        }

        if (payoffMonth === null && Object.values(stateByDebt).every((debt) => debt.balance <= 0.01)) {
            payoffMonth = monthlyAmortization.length;
        }

        const remainingBalance = roundMoney(
            Object.values(stateByDebt).reduce((sum, debt) => sum + debt.balance, 0)
        );

        return {
            monthsToPayoff: payoffMonth,
            fullyPaid: remainingBalance <= 0.01,
            totalInterestPaid: roundMoney(totalInterest),
            totalPaid,
            remainingBalance,
            monthlyAmortization,
            milestoneTimeline: this.buildMilestoneTimeline(closeEvents),
            debtSnapshots: Object.values(stateByDebt).map((debt) => ({
                debtId: debt.id,
                debtName: debt.name,
                startingBalance: roundMoney(debt.startingBalance),
                endingBalance: roundMoney(debt.balance),
                totalInterestPaid: roundMoney(debt.totalInterest),
                totalPrincipalPaid: roundMoney(debt.totalPrincipal),
                totalPaid: roundMoney(debt.totalPayments)
            }))
        };
    }

    async simulate(userId, payload = {}) {
        const baseDebts = Array.isArray(payload.debts) && payload.debts.length > 0
            ? payload.debts.map(normalizeDebt).filter((debt) => debt.balance > 0)
            : await this.getActiveDebts(userId);

        if (!baseDebts.length) {
            return {
                success: true,
                baseline: null,
                scenarios: [],
                message: 'No active debts found for simulation.'
            };
        }

        const baseline = this.simulateScenario(baseDebts, {
            monthlyBudget: payload.monthlyBudget,
            horizonMonths: payload.horizonMonths
        });

        const scenariosInput = Array.isArray(payload.scenarios) ? payload.scenarios : [];

        const scenarios = scenariosInput.map((scenario, index) => {
            const result = this.simulateScenario(baseDebts, {
                ...scenario,
                monthlyBudget: scenario.monthlyBudget ?? payload.monthlyBudget,
                horizonMonths: scenario.horizonMonths ?? payload.horizonMonths
            });

            const interestDeltaVsBaseline = roundMoney(baseline.totalInterestPaid - result.totalInterestPaid);
            const monthsSaved = baseline.monthsToPayoff && result.monthsToPayoff
                ? baseline.monthsToPayoff - result.monthsToPayoff
                : null;

            return {
                scenarioId: scenario.id || `scenario-${index + 1}`,
                scenarioName: scenario.name || `Scenario ${index + 1}`,
                assumptions: {
                    monthlyBudget: scenario.monthlyBudget ?? payload.monthlyBudget ?? null,
                    horizonMonths: scenario.horizonMonths ?? payload.horizonMonths ?? DEFAULT_HORIZON_MONTHS
                },
                result,
                deltas: {
                    interestDeltaVsBaseline,
                    monthsSaved,
                    payoffFaster: monthsSaved !== null ? monthsSaved > 0 : false,
                    remainingBalanceDeltaVsBaseline: roundMoney(baseline.remainingBalance - result.remainingBalance)
                }
            };
        });

        return {
            success: true,
            assumptions: {
                debtCount: baseDebts.length,
                totalStartingBalance: roundMoney(baseDebts.reduce((sum, debt) => sum + debt.balance, 0)),
                monthlyBudget: payload.monthlyBudget ?? roundMoney(baseDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0)),
                horizonMonths: payload.horizonMonths ?? DEFAULT_HORIZON_MONTHS
            },
            baseline,
            scenarios
        };
    }
}

export default new DebtWhatIfSimulatorService();
