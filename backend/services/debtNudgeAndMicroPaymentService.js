import db from '../config/db.js';
import { debts, transactions } from '../db/schema.js';
import { and, desc, eq, gte } from 'drizzle-orm';
import debtPaymentOrchestratorService from './debtPaymentOrchestratorService.js';

const DEFAULT_LOOKBACK_DAYS = 35;
const MAX_LOOKBACK_DAYS = 120;

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0))
});

class DebtNudgeAndMicroPaymentService {
    async getActiveDebts(userId) {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true)),
            orderBy: desc(debts.apr)
        });

        return userDebts.map(normalizeDebt).filter(debt => debt.balance > 0.01);
    }

    async getRecentTransactions(userId, lookbackDays = DEFAULT_LOOKBACK_DAYS) {
        const days = clamp(toNumber(lookbackDays, DEFAULT_LOOKBACK_DAYS), 7, MAX_LOOKBACK_DAYS);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        try {
            return await db.query.transactions.findMany({
                where: and(
                    eq(transactions.userId, userId),
                    gte(transactions.date, startDate)
                ),
                orderBy: desc(transactions.date)
            });
        } catch (err) {
            return [];
        }
    }

    summarizeWeeklySpend(transactionRows = []) {
        if (!transactionRows.length) {
            return {
                weeks: [],
                averageWeeklySpend: 0,
                lowSpendWeeks: [],
                spendingVolatility: 0
            };
        }

        const weeklyMap = {};

        for (const tx of transactionRows) {
            const txDate = new Date(tx.date || Date.now());
            if (Number.isNaN(txDate.getTime())) continue;

            const weekStart = new Date(txDate);
            weekStart.setDate(txDate.getDate() - txDate.getDay());
            weekStart.setHours(0, 0, 0, 0);

            const key = weekStart.toISOString().split('T')[0];
            const amount = Math.abs(toNumber(tx.amount, 0));
            const txType = String(tx.type || '').toLowerCase();
            const isIncome = txType === 'income' || txType === 'credit';

            if (!weeklyMap[key]) {
                weeklyMap[key] = {
                    weekStart: key,
                    spendTotal: 0,
                    incomeTotal: 0,
                    transactionCount: 0
                };
            }

            if (isIncome) {
                weeklyMap[key].incomeTotal += amount;
            } else {
                weeklyMap[key].spendTotal += amount;
            }

            weeklyMap[key].transactionCount += 1;
        }

        const weeks = Object.values(weeklyMap)
            .map(week => ({
                ...week,
                spendTotal: roundMoney(week.spendTotal),
                incomeTotal: roundMoney(week.incomeTotal)
            }))
            .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        const spendValues = weeks.map(week => week.spendTotal);
        const averageWeeklySpend = spendValues.length
            ? roundMoney(spendValues.reduce((sum, value) => sum + value, 0) / spendValues.length)
            : 0;

        const variance = spendValues.length > 1
            ? spendValues.reduce((sum, value) => sum + Math.pow(value - averageWeeklySpend, 2), 0) / spendValues.length
            : 0;

        const volatility = averageWeeklySpend > 0 ? Math.sqrt(variance) / averageWeeklySpend : 0;

        const lowSpendWeeks = weeks.filter(week => week.spendTotal <= averageWeeklySpend * 0.85);

        return {
            weeks,
            averageWeeklySpend,
            lowSpendWeeks,
            spendingVolatility: roundMoney(volatility)
        };
    }

    deriveMicroPaymentCapacity(payload, weeklySummary) {
        const monthlyIncome = toNumber(payload.monthlyIncome, 0);
        const monthlyExpenses = toNumber(payload.monthlyExpenses, 0);
        const minCashBuffer = toNumber(payload.minCashBuffer, 300);

        const explicitBudget = toNumber(payload.monthlyBudget, monthlyExpenses);
        const averageMonthlySpend = roundMoney(weeklySummary.averageWeeklySpend * 4.33);
        const effectiveSpend = explicitBudget > 0 ? explicitBudget : averageMonthlySpend;

        const spendUnderBudget = Math.max(0, roundMoney(effectiveSpend - averageMonthlySpend));
        const cashSurplus = Math.max(0, roundMoney(monthlyIncome - monthlyExpenses - minCashBuffer));

        const confidenceModifier = weeklySummary.lowSpendWeeks.length > 0
            ? clamp(weeklySummary.lowSpendWeeks.length / Math.max(1, weeklySummary.weeks.length), 0.15, 0.65)
            : 0.15;

        const safeCapacity = roundMoney(
            Math.min(
                spendUnderBudget * confidenceModifier + spendUnderBudget * 0.15,
                cashSurplus * 0.35
            )
        );

        return {
            monthlyIncome: roundMoney(monthlyIncome),
            monthlyExpenses: roundMoney(monthlyExpenses),
            monthlyBudget: roundMoney(effectiveSpend),
            averageMonthlySpend,
            spendUnderBudget,
            cashSurplus,
            confidenceModifier: roundMoney(confidenceModifier),
            safeMicroPaymentCapacity: Math.max(0, safeCapacity)
        };
    }

    rankDebtsForMicroPayments(activeDebts = [], strategy = 'avalanche') {
        const debtsCopy = [...activeDebts];

        if (strategy === 'snowball') {
            debtsCopy.sort((a, b) => a.balance - b.balance);
        } else if (strategy === 'hybrid') {
            debtsCopy.sort((a, b) => {
                const scoreA = (a.apr * 100) / Math.max(1, Math.sqrt(a.balance));
                const scoreB = (b.apr * 100) / Math.max(1, Math.sqrt(b.balance));
                return scoreB - scoreA;
            });
        } else {
            debtsCopy.sort((a, b) => b.apr - a.apr);
        }

        return debtsCopy;
    }

    buildMicroPaymentPlan(activeDebts, capacity, payload = {}) {
        const thresholdMin = clamp(toNumber(payload.thresholdMin, 10), 5, 250);
        const thresholdMax = clamp(toNumber(payload.thresholdMax, 100), thresholdMin, 500);
        const strategy = payload.strategy || 'avalanche';

        if (capacity < thresholdMin || activeDebts.length === 0) {
            return {
                suggestions: [],
                allocatedTotal: 0,
                unallocated: roundMoney(capacity),
                thresholdMin,
                thresholdMax,
                strategy
            };
        }

        const ranked = this.rankDebtsForMicroPayments(activeDebts, strategy);

        let remaining = capacity;
        const suggestions = [];

        for (const debt of ranked) {
            if (remaining < thresholdMin) break;

            const proposed = clamp(remaining * 0.45, thresholdMin, thresholdMax);
            const amount = roundMoney(Math.min(proposed, debt.balance * 0.25, remaining));

            if (amount < thresholdMin) continue;

            const monthlyInterestAvoided = roundMoney((amount * debt.apr) / 12);
            const annualizedSavings = roundMoney(monthlyInterestAvoided * 12);

            suggestions.push({
                debtId: debt.id,
                debtName: debt.name,
                apr: roundMoney(debt.apr * 100),
                suggestedMicroPayment: amount,
                estimatedMonthlyInterestAvoided: monthlyInterestAvoided,
                estimatedAnnualInterestAvoided: annualizedSavings,
                priority: suggestions.length + 1,
                reason: strategy === 'snowball'
                    ? 'Small balance debt for momentum boost'
                    : strategy === 'hybrid'
                        ? 'Balanced APR-to-balance impact'
                        : 'Highest APR debt for interest savings'
            });

            remaining = roundMoney(remaining - amount);
        }

        const allocatedTotal = roundMoney(suggestions.reduce((sum, item) => sum + item.suggestedMicroPayment, 0));

        return {
            suggestions,
            allocatedTotal,
            unallocated: roundMoney(capacity - allocatedTotal),
            thresholdMin,
            thresholdMax,
            strategy
        };
    }

    async previewNudges(userId, payload = {}) {
        try {
            const [activeDebts, recentTransactions] = await Promise.all([
                this.getActiveDebts(userId),
                this.getRecentTransactions(userId, payload.lookbackDays)
            ]);

            if (activeDebts.length === 0) {
                return {
                    success: false,
                    message: 'No active debts found',
                    preview: null
                };
            }

            const weeklySummary = this.summarizeWeeklySpend(recentTransactions);
            const capacity = this.deriveMicroPaymentCapacity(payload, weeklySummary);
            const plan = this.buildMicroPaymentPlan(activeDebts, capacity.safeMicroPaymentCapacity, payload);

            const projectedMonthlyInterestAvoided = roundMoney(
                plan.suggestions.reduce((sum, item) => sum + item.estimatedMonthlyInterestAvoided, 0)
            );

            return {
                success: true,
                message: 'Micro-payment nudge preview generated',
                preview: {
                    lookbackDays: clamp(toNumber(payload.lookbackDays, DEFAULT_LOOKBACK_DAYS), 7, MAX_LOOKBACK_DAYS),
                    transactionInsights: {
                        weeksAnalyzed: weeklySummary.weeks.length,
                        lowSpendWeeks: weeklySummary.lowSpendWeeks.length,
                        averageWeeklySpend: weeklySummary.averageWeeklySpend,
                        spendingVolatility: weeklySummary.spendingVolatility
                    },
                    capacity,
                    plan,
                    projectedImpact: {
                        monthlyInterestAvoided: projectedMonthlyInterestAvoided,
                        annualInterestAvoided: roundMoney(projectedMonthlyInterestAvoided * 12),
                        debtTargets: plan.suggestions.length
                    }
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error generating nudge preview: ${err.message}`,
                preview: null
            };
        }
    }

    async executeNudges(userId, payload = {}) {
        try {
            const previewResult = await this.previewNudges(userId, payload);

            if (!previewResult.success || !previewResult.preview) {
                return {
                    success: false,
                    message: previewResult.message || 'Unable to generate executable nudge plan',
                    execution: null
                };
            }

            const mode = payload.mode === 'immediate' ? 'immediate' : 'scheduled';
            const scheduleDate = payload.scheduleDate ? new Date(payload.scheduleDate) : new Date();
            const safeDate = Number.isNaN(scheduleDate.getTime()) ? new Date() : scheduleDate;

            let orchestrationRecommendation = null;
            try {
                const orchestration = await debtPaymentOrchestratorService.orchestratePayments(userId, {
                    monthlyIncome: payload.monthlyIncome,
                    monthlyExpenses: payload.monthlyExpenses,
                    minCashBuffer: payload.minCashBuffer,
                    strategy: payload.strategy || 'avalanche',
                    autoIncreasePercentage: toNumber(payload.autoIncreasePercentage, 0)
                });

                orchestrationRecommendation = orchestration.success
                    ? orchestration.orchestration?.nextMonthRecommendation || null
                    : null;
            } catch (err) {
                orchestrationRecommendation = null;
            }

            const executionItems = previewResult.preview.plan.suggestions.map(item => ({
                debtId: item.debtId,
                debtName: item.debtName,
                amount: item.suggestedMicroPayment,
                mode,
                scheduledFor: safeDate.toISOString(),
                status: mode === 'immediate' ? 'triggered' : 'queued'
            }));

            const totalAmount = roundMoney(executionItems.reduce((sum, item) => sum + item.amount, 0));

            return {
                success: true,
                message: mode === 'immediate'
                    ? 'Micro-payments triggered successfully'
                    : 'Micro-payments scheduled successfully',
                execution: {
                    mode,
                    scheduledFor: safeDate.toISOString(),
                    items: executionItems,
                    totalAmount,
                    projectedMonthlyInterestAvoided: previewResult.preview.projectedImpact.monthlyInterestAvoided,
                    projectedAnnualInterestAvoided: previewResult.preview.projectedImpact.annualInterestAvoided,
                    orchestrationRecommendation,
                    nextActions: [
                        'Review micro-payment outcomes in 7 days',
                        'Re-run nudge preview after next low-spend week',
                        'Adjust thresholdMin/thresholdMax to fit comfort level'
                    ]
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error executing micro-payments: ${err.message}`,
                execution: null
            };
        }
    }
}

export default new DebtNudgeAndMicroPaymentService();
