import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const DEFAULT_HORIZON_MONTHS = 24;
const MAX_HORIZON_MONTHS = 120;

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

const EVENT_IMPACT_MODELS = {
    wedding: { expenseFactor: 1.0, incomeDeltaPct: 0, uncertainty: 0.2 },
    relocation: { expenseFactor: 0.9, incomeDeltaPct: 0, uncertainty: 0.3 },
    'layoff-risk': { expenseFactor: 0.5, incomeDeltaPct: -0.3, uncertainty: 0.8 },
    education: { expenseFactor: 0.7, incomeDeltaPct: -0.08, uncertainty: 0.4 },
    baby: { expenseFactor: 0.8, incomeDeltaPct: -0.1, uncertainty: 0.5 },
    'home-purchase': { expenseFactor: 1.2, incomeDeltaPct: -0.05, uncertainty: 0.35 },
    'career-change': { expenseFactor: 0.4, incomeDeltaPct: -0.12, uncertainty: 0.55 },
    medical: { expenseFactor: 1.1, incomeDeltaPct: -0.1, uncertainty: 0.7 },
    other: { expenseFactor: 0.6, incomeDeltaPct: 0, uncertainty: 0.5 }
};

const STRATEGY_PROFILES = {
    avalanche: { stabilityBase: 0.68, bufferBias: 0.15, payoffEfficiency: 1.0, stressTolerance: 0.45 },
    snowball: { stabilityBase: 0.74, bufferBias: 0.35, payoffEfficiency: 0.88, stressTolerance: 0.65 },
    hybrid: { stabilityBase: 0.79, bufferBias: 0.3, payoffEfficiency: 0.93, stressTolerance: 0.6 }
};

class LifeEventDebtStrategyService {
    monthsUntil(dateValue) {
        const target = new Date(dateValue);
        if (Number.isNaN(target.getTime())) return null;

        const today = new Date();
        const yearDiff = target.getFullYear() - today.getFullYear();
        const monthDiff = target.getMonth() - today.getMonth();
        const rawMonths = yearDiff * 12 + monthDiff;
        return Math.max(0, rawMonths);
    }

    normalizeEvent(rawEvent = {}) {
        const eventType = typeof rawEvent.type === 'string' ? rawEvent.type : 'other';
        const model = EVENT_IMPACT_MODELS[eventType] || EVENT_IMPACT_MODELS.other;

        const expectedCost = roundMoney(
            (toNumber(rawEvent.costMin, 0) + toNumber(rawEvent.costMax, toNumber(rawEvent.costMin, 0))) / 2
        );

        const confidence = clamp(toNumber(rawEvent.confidence, 0.7), 0, 1);
        const eventMonth = this.monthsUntil(rawEvent.date);
        const incomeImpactPct = toNumber(rawEvent.incomeImpactPct, model.incomeDeltaPct);

        return {
            name: rawEvent.name || eventType,
            type: eventType,
            date: rawEvent.date || null,
            eventMonth,
            expectedCost,
            confidence,
            incomeImpactPct,
            uncertainty: model.uncertainty,
            weightedShock: roundMoney(expectedCost * model.expenseFactor * (1 + (1 - confidence) * 0.5))
        };
    }

    summarizeEventRisk(events = [], monthlyIncome = 0) {
        const validEvents = events.filter(e => e.eventMonth !== null);

        const totalShock = roundMoney(validEvents.reduce((sum, event) => sum + event.weightedShock, 0));
        const cumulativeIncomeImpactPct = roundMoney(validEvents.reduce((sum, event) => sum + event.incomeImpactPct, 0));
        const averageUncertainty = validEvents.length > 0
            ? validEvents.reduce((sum, event) => sum + event.uncertainty * (1 - event.confidence + 0.5), 0) / validEvents.length
            : 0;

        const shockVsIncomeRatio = monthlyIncome > 0
            ? roundMoney(totalShock / (monthlyIncome * Math.max(1, validEvents.length)))
            : 1;

        return {
            eventCount: validEvents.length,
            totalShock,
            cumulativeIncomeImpactPct,
            averageUncertainty: roundMoney(averageUncertainty),
            shockVsIncomeRatio
        };
    }

    scoreStrategy(profile, context) {
        const {
            shockVsIncomeRatio,
            averageUncertainty,
            emergencyBufferMonths,
            highAprDebtWeight,
            debtServiceRatio
        } = context;

        const bufferSupport = clamp(emergencyBufferMonths / 6, 0, 1);

        const score =
            profile.stabilityBase +
            profile.bufferBias * 0.18 +
            profile.payoffEfficiency * highAprDebtWeight * 0.14 +
            bufferSupport * 0.2 -
            shockVsIncomeRatio * (1 - profile.stressTolerance) * 0.25 -
            averageUncertainty * 0.18 -
            debtServiceRatio * 0.12;

        return clamp(roundMoney(score), 0, 1);
    }

    buildTimeline(events = [], recommendedStrategy, baseBufferMonths) {
        const sorted = [...events]
            .filter(e => e.eventMonth !== null)
            .sort((a, b) => a.eventMonth - b.eventMonth);

        const timeline = [];

        for (const event of sorted) {
            const highRisk = event.uncertainty > 0.6 || event.incomeImpactPct < -0.2;
            const preEventStrategy = highRisk ? 'snowball' : recommendedStrategy;
            const postEventStrategy = highRisk ? 'hybrid' : recommendedStrategy;

            timeline.push({
                eventName: event.name,
                eventType: event.type,
                eventDate: event.date,
                window: {
                    preparationStartMonth: Math.max(0, event.eventMonth - 2),
                    eventMonth: event.eventMonth,
                    stabilizationEndMonth: event.eventMonth + 2
                },
                recommendations: {
                    preEvent: {
                        strategy: preEventStrategy,
                        paymentMode: highRisk ? 'conservative' : 'standard',
                        minCashBufferAdjustment: roundMoney(event.weightedShock * 0.12),
                        targetEmergencyFundMonths: roundMoney(baseBufferMonths + (highRisk ? 1.5 : 0.75))
                    },
                    eventMonth: {
                        strategy: highRisk ? 'snowball' : 'hybrid',
                        paymentMode: highRisk ? 'minimums-plus-small-extra' : 'minimums-plus-moderate-extra',
                        pauseExtraPayments: highRisk,
                        expenseShockReserve: roundMoney(event.weightedShock * 0.35)
                    },
                    postEvent: {
                        strategy: postEventStrategy,
                        paymentMode: 'rebuild-and-accelerate',
                        targetEmergencyFundMonths: roundMoney(baseBufferMonths),
                        checkpoint: 'monthly'
                    }
                }
            });
        }

        return timeline;
    }

    async recommendStrategyForLifeEvents(userId, payload = {}) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) {
                return {
                    success: false,
                    message: 'No active debts found',
                    recommendation: null
                };
            }

            const horizonMonths = clamp(toNumber(payload.horizonMonths, DEFAULT_HORIZON_MONTHS), 1, MAX_HORIZON_MONTHS);
            const monthlyIncome = Math.max(0, toNumber(payload.monthlyIncome, 0));
            const monthlyExpenses = Math.max(0, toNumber(payload.monthlyExpenses, 0));
            const minCashBuffer = Math.max(0, toNumber(payload.minCashBuffer, 500));

            const normalizedDebts = userDebts.map(normalizeDebt);
            const totalDebt = roundMoney(normalizedDebts.reduce((sum, debt) => sum + debt.balance, 0));
            const totalMinimumPayment = roundMoney(normalizedDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0));
            const weightedApr = totalDebt > 0
                ? roundMoney((normalizedDebts.reduce((sum, debt) => sum + debt.balance * debt.apr, 0) / totalDebt) * 100)
                : 0;

            const highAprDebtWeight = clamp(
                normalizedDebts.filter(d => d.apr >= 0.16 && d.balance > 0.01).length / Math.max(1, normalizedDebts.length),
                0,
                1
            );

            const debtServiceRatio = monthlyIncome > 0 ? clamp(totalMinimumPayment / monthlyIncome, 0, 1) : 1;
            const emergencyBufferMonths = monthlyExpenses > 0
                ? roundMoney(minCashBuffer / monthlyExpenses)
                : 0;

            const inputEvents = Array.isArray(payload.events) ? payload.events : [];
            const normalizedEvents = inputEvents.map(event => this.normalizeEvent(event));
            const riskSummary = this.summarizeEventRisk(normalizedEvents, monthlyIncome);

            const scoringContext = {
                shockVsIncomeRatio: riskSummary.shockVsIncomeRatio,
                averageUncertainty: riskSummary.averageUncertainty,
                emergencyBufferMonths,
                highAprDebtWeight,
                debtServiceRatio
            };

            const strategyScores = Object.entries(STRATEGY_PROFILES).map(([strategy, profile]) => ({
                strategy,
                resilienceScore: this.scoreStrategy(profile, scoringContext),
                scoreBreakdown: {
                    riskToleranceFit: roundMoney(profile.stressTolerance),
                    payoffEfficiency: roundMoney(profile.payoffEfficiency),
                    bufferCompatibility: roundMoney(profile.bufferBias),
                    eventShockPenalty: roundMoney(riskSummary.shockVsIncomeRatio * (1 - profile.stressTolerance))
                }
            })).sort((a, b) => b.resilienceScore - a.resilienceScore);

            const best = strategyScores[0];
            const timeline = this.buildTimeline(normalizedEvents, best.strategy, Math.max(1, emergencyBufferMonths));

            return {
                success: true,
                message: 'Life-event strategy recommendation generated',
                recommendation: {
                    primaryStrategy: best.strategy,
                    resilienceScore: best.resilienceScore,
                    explanation: best.strategy === 'hybrid'
                        ? 'Hybrid balances risk resilience with payoff efficiency around life-event volatility'
                        : best.strategy === 'snowball'
                            ? 'Snowball improves consistency during high-uncertainty periods'
                            : 'Avalanche maximizes interest savings where event risk is manageable',
                    strategyRanking: strategyScores
                },
                eventAnalysis: {
                    horizonMonths,
                    eventCount: riskSummary.eventCount,
                    totalProjectedShock: riskSummary.totalShock,
                    cumulativeIncomeImpactPct: riskSummary.cumulativeIncomeImpactPct,
                    averageUncertainty: riskSummary.averageUncertainty,
                    normalizedEvents
                },
                financialContext: {
                    monthlyIncome: roundMoney(monthlyIncome),
                    monthlyExpenses: roundMoney(monthlyExpenses),
                    minCashBuffer: roundMoney(minCashBuffer),
                    emergencyBufferMonths,
                    totalDebt,
                    weightedApr,
                    debtServiceRatio: roundMoney(debtServiceRatio)
                },
                timeline,
                actionPlan: {
                    immediate: [
                        'Set strategy guardrails for high-risk event months',
                        'Create dedicated sinking funds for dated life events',
                        'Enable monthly strategy checkpoint notifications'
                    ],
                    next30Days: [
                        `Increase cash buffer by ${roundMoney(riskSummary.totalShock * 0.1)} if feasible`,
                        'Review debt minimums and autopay coverage',
                        'Validate event confidence and adjust assumptions'
                    ]
                },
                metrics: {
                    generatedAt: new Date().toISOString(),
                    debtCount: normalizedDebts.length,
                    strategyCountEvaluated: strategyScores.length
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error generating life-event strategy recommendation: ${err.message}`,
                recommendation: null
            };
        }
    }
}

export default new LifeEventDebtStrategyService();
