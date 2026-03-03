import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const DEFAULT_HORIZON_MONTHS = 120;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeApr = (apr) => {
    const value = toNumber(apr, 0);
    if (value <= 0) return 0;
    if (value > 1 && value <= 100) return value / 100;
    return value;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPct = (value) => Math.round((value + Number.EPSILON) * 10000) / 100;

const getRiskPenalty = (riskAssumptions = {}) => {
    const tier = (riskAssumptions.creditRiskTier || 'medium').toLowerCase();
    const latePaymentProbability = clamp(toNumber(riskAssumptions.latePaymentProbability, 0.08), 0, 1);

    const tierPenaltyMap = {
        low: 0,
        medium: 0.01,
        high: 0.025,
        very_high: 0.04
    };

    const tierPenalty = tierPenaltyMap[tier] ?? tierPenaltyMap.medium;
    const behavioralPenalty = latePaymentProbability * 0.03;

    return tierPenalty + behavioralPenalty;
};

const estimateAmortizedPayment = (principal, annualRate, termMonths) => {
    if (principal <= 0) return 0;
    if (termMonths <= 0) return principal;

    const monthlyRate = annualRate / 12;
    if (monthlyRate <= 0) return principal / termMonths;

    const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
    const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
    if (denominator <= 0) return principal / termMonths;

    return numerator / denominator;
};

const buildDebtModel = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    balance: Math.max(0, toNumber(debt.currentBalance, 0)),
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment, 0)),
    apr: normalizeApr(debt.apr),
    termMonths: toNumber(debt.termMonths, null),
    debtType: debt.debtType || debt.type || 'other',
    monthlyRateByMonth: () => normalizeApr(debt.apr) / 12
});

const applyPaymentCycle = (activeDebts, monthlyBudget) => {
    const debtsWithInterest = activeDebts.map((debt) => {
        const monthlyRate = debt.monthlyRateByMonth();
        const interest = debt.balance * monthlyRate;
        return {
            ...debt,
            monthlyRate,
            interest,
            startingBalance: debt.balance,
            payment: 0
        };
    });

    let remainingBudget = Math.max(0, monthlyBudget);

    const byPriority = [...debtsWithInterest].sort((a, b) => b.monthlyRate - a.monthlyRate);

    for (const debt of byPriority) {
        if (debt.balance <= 0 || remainingBudget <= 0) continue;
        const requiredPayment = Math.min(debt.minimumPayment, debt.balance + debt.interest);
        const payment = Math.min(requiredPayment, remainingBudget);
        debt.payment += payment;
        remainingBudget -= payment;
    }

    for (const debt of byPriority) {
        if (debt.balance <= 0 || remainingBudget <= 0) continue;
        const remainingDue = Math.max(0, debt.balance + debt.interest - debt.payment);
        if (remainingDue <= 0) continue;
        const extraPayment = Math.min(remainingDue, remainingBudget);
        debt.payment += extraPayment;
        remainingBudget -= extraPayment;
    }

    let interestThisMonth = 0;
    let uncoveredMinimum = 0;

    const updatedDebts = debtsWithInterest.map((debt) => {
        interestThisMonth += debt.interest;

        if (debt.payment < debt.minimumPayment) {
            uncoveredMinimum += (debt.minimumPayment - debt.payment);
        }

        const endingBalance = Math.max(0, debt.balance + debt.interest - debt.payment);
        return {
            ...debt,
            balance: endingBalance,
            minimumPayment: debt.minimumPayment
        };
    });

    return {
        updatedDebts,
        interestThisMonth,
        uncoveredMinimum
    };
};

const simulatePlan = (debtsInput, monthlyBudget, horizonMonths) => {
    let activeDebts = debtsInput.map((debt) => ({ ...debt }));
    const budget = Math.max(0, toNumber(monthlyBudget, 0));
    const months = Math.max(1, Math.trunc(toNumber(horizonMonths, DEFAULT_HORIZON_MONTHS)));

    let totalInterest = 0;
    let totalPayments = 0;
    let totalUncoveredMinimum = 0;
    let payoffMonth = null;

    for (let month = 1; month <= months; month += 1) {
        const outstanding = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
        if (outstanding <= 0.01) {
            payoffMonth = month - 1;
            break;
        }

        const cycle = applyPaymentCycle(activeDebts, budget);
        activeDebts = cycle.updatedDebts;

        totalInterest += cycle.interestThisMonth;
        totalPayments += budget;
        totalUncoveredMinimum += cycle.uncoveredMinimum;
    }

    const remainingBalance = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);

    return {
        payoffMonths: payoffMonth,
        totalInterest: roundMoney(totalInterest),
        totalPayments: roundMoney(totalPayments),
        remainingBalance: roundMoney(remainingBalance),
        monthlyBudget: roundMoney(budget),
        totalUncoveredMinimum: roundMoney(totalUncoveredMinimum),
        projectedToFullyPayoff: remainingBalance <= 0.01
    };
};

class DebtConsolidationRecommenderService {
    async getUserDebts(userId) {
        return db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true))
        });
    }

    buildScenarioDebts(baseDebts, scenario, riskPenaltyApr) {
        const targetIds = Array.isArray(scenario.targetDebtIds)
            ? new Set(scenario.targetDebtIds)
            : new Set(baseDebts.map((debt) => debt.id));

        const targetedDebts = baseDebts.filter((debt) => targetIds.has(debt.id));
        const untouchedDebts = baseDebts.filter((debt) => !targetIds.has(debt.id));

        const totalTargetBalance = targetedDebts.reduce((sum, debt) => sum + debt.balance, 0);
        if (totalTargetBalance <= 0) {
            return {
                scenarioDebts: untouchedDebts,
                fees: 0,
                consolidatedDebt: null,
                targetDebtCount: 0
            };
        }

        const originationFee = totalTargetBalance * clamp(toNumber(scenario.originationFeePct, 0), 0, 1)
            + Math.max(0, toNumber(scenario.originationFeeFixed, 0));
        const transferFee = totalTargetBalance * clamp(toNumber(scenario.transferFeePct, 0), 0, 1)
            + Math.max(0, toNumber(scenario.transferFeeFixed, 0));
        const totalFees = originationFee + transferFee;

        const consolidatedPrincipal = totalTargetBalance + totalFees;
        const termMonths = Math.max(1, Math.trunc(toNumber(scenario.termMonths, 60)));

        const standardApr = normalizeApr(
            scenario.loanApr ?? scenario.postPromoApr ?? scenario.apr ?? 0.12
        );

        const promoApr = normalizeApr(scenario.promoApr);
        const promoMonths = Math.max(0, Math.trunc(toNumber(scenario.promoMonths, 0)));

        const riskAdjustedStandardApr = standardApr + riskPenaltyApr + Math.max(0, toNumber(scenario.additionalRiskApr, 0));
        const riskAdjustedPromoApr = Math.max(0, promoApr + (riskPenaltyApr * 0.35));

        const minimumPayment = Math.max(
            toNumber(scenario.minimumPayment, 0),
            estimateAmortizedPayment(consolidatedPrincipal, riskAdjustedStandardApr, termMonths)
        );

        const consolidatedDebt = {
            id: `scenario-${scenario.name || 'consolidated-loan'}`,
            name: scenario.name || 'Consolidated Debt',
            balance: consolidatedPrincipal,
            minimumPayment,
            apr: riskAdjustedStandardApr,
            termMonths,
            debtType: scenario.type || 'consolidation_loan',
            monthlyRateByMonth: (month = 1) => {
                if (promoMonths > 0 && month <= promoMonths) {
                    return riskAdjustedPromoApr / 12;
                }
                return riskAdjustedStandardApr / 12;
            }
        };

        return {
            scenarioDebts: [...untouchedDebts, consolidatedDebt],
            fees: totalFees,
            consolidatedDebt,
            targetDebtCount: targetedDebts.length,
            targetBalance: totalTargetBalance
        };
    }

    generateDefaultScenarios(baseDebts) {
        const weightedApr = (() => {
            const total = baseDebts.reduce((sum, debt) => sum + debt.balance, 0);
            if (total <= 0) return 0.18;
            return baseDebts.reduce((sum, debt) => sum + (debt.balance / total) * debt.apr, 0);
        })();

        return [
            {
                name: 'Personal Loan (36m)',
                type: 'personal_loan',
                loanApr: Math.max(0.05, weightedApr - 0.04),
                termMonths: 36,
                originationFeePct: 0.03,
                transferFeePct: 0,
                promoMonths: 0
            },
            {
                name: 'Personal Loan (60m)',
                type: 'personal_loan',
                loanApr: Math.max(0.05, weightedApr - 0.03),
                termMonths: 60,
                originationFeePct: 0.02,
                transferFeePct: 0,
                promoMonths: 0
            },
            {
                name: 'Balance Transfer 0% Promo',
                type: 'balance_transfer',
                promoApr: 0,
                promoMonths: 12,
                postPromoApr: Math.max(0.12, weightedApr - 0.02),
                termMonths: 48,
                transferFeePct: 0.03,
                originationFeePct: 0
            }
        ];
    }

    buildRecommendation(rankedScenarios, baseline) {
        if (!rankedScenarios.length) {
            return {
                primary: 'keep_current_debts',
                reason: 'No valid consolidation scenarios available.',
                confidence: 'low'
            };
        }

        const best = rankedScenarios[0];
        const meaningfulSavings = best.riskAdjustedSavings > Math.max(200, baseline.totalInterest * 0.05);
        const noCoverageRisk = best.totalUncoveredMinimum > 0;

        if (!meaningfulSavings || noCoverageRisk || !best.projectedToFullyPayoff) {
            return {
                primary: 'keep_current_debts',
                reason: noCoverageRisk
                    ? 'Consolidation scenarios increase payment stress under current budget.'
                    : 'Projected savings are not strong enough after fees and risk adjustments.',
                confidence: noCoverageRisk ? 'high' : 'medium'
            };
        }

        return {
            primary: 'consolidate',
            recommendedScenario: best.name,
            reason: 'Best scenario lowers total cost after fees, promo expiry, and risk penalties.',
            confidence: best.riskAdjustedSavings > baseline.totalInterest * 0.12 ? 'high' : 'medium'
        };
    }

    async recommend(userId, payload = {}) {
        const userDebts = Array.isArray(payload.debts) && payload.debts.length > 0
            ? payload.debts
            : await this.getUserDebts(userId);

        const baseDebts = userDebts.map(buildDebtModel).filter((debt) => debt.balance > 0);

        if (!baseDebts.length) {
            return {
                success: true,
                baseline: null,
                scenarios: [],
                recommendation: {
                    primary: 'none',
                    reason: 'No active debts available for consolidation analysis.',
                    confidence: 'high'
                }
            };
        }

        const baseMinimum = baseDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
        const monthlyBudget = Math.max(toNumber(payload.monthlyBudget, baseMinimum), 0);
        const horizonMonths = Math.max(1, Math.trunc(toNumber(payload.horizonMonths, DEFAULT_HORIZON_MONTHS)));

        const baseline = simulatePlan(baseDebts, monthlyBudget, horizonMonths);
        const riskPenaltyApr = getRiskPenalty(payload.riskAssumptions);

        const scenariosInput = Array.isArray(payload.scenarios) && payload.scenarios.length > 0
            ? payload.scenarios
            : this.generateDefaultScenarios(baseDebts);

        const scenarioResults = scenariosInput.map((scenario, index) => {
            const normalizedScenario = {
                name: scenario.name || `Scenario ${index + 1}`,
                ...scenario
            };

            const built = this.buildScenarioDebts(baseDebts, normalizedScenario, riskPenaltyApr);
            const simulation = simulatePlan(built.scenarioDebts, monthlyBudget, horizonMonths);

            const totalCost = simulation.totalInterest + built.fees;
            const baselineCost = baseline.totalInterest;
            const rawSavings = baselineCost - totalCost;
            const uncoveredMinimumPenalty = simulation.totalUncoveredMinimum * 0.5;
            const riskAdjustedSavings = rawSavings - uncoveredMinimumPenalty;

            return {
                name: normalizedScenario.name,
                type: normalizedScenario.type || 'custom',
                includesDebts: built.targetDebtCount,
                consolidatedPrincipal: roundMoney(toNumber(built.consolidatedDebt?.balance, 0)),
                monthlyPayment: roundMoney(toNumber(built.consolidatedDebt?.minimumPayment, 0)),
                promoMonths: Math.max(0, Math.trunc(toNumber(normalizedScenario.promoMonths, 0))),
                fees: roundMoney(built.fees),
                payoffMonths: simulation.payoffMonths,
                projectedToFullyPayoff: simulation.projectedToFullyPayoff,
                totalInterest: simulation.totalInterest,
                totalCost: roundMoney(totalCost),
                rawSavings: roundMoney(rawSavings),
                riskAdjustedSavings: roundMoney(riskAdjustedSavings),
                totalUncoveredMinimum: simulation.totalUncoveredMinimum,
                score: roundMoney(riskAdjustedSavings - (simulation.remainingBalance * 0.2))
            };
        });

        const rankedScenarios = [...scenarioResults].sort((a, b) => b.score - a.score);

        return {
            success: true,
            baseline: {
                ...baseline,
                debtCount: baseDebts.length,
                totalBalance: roundMoney(baseDebts.reduce((sum, debt) => sum + debt.balance, 0)),
                weightedApr: roundPct(
                    baseDebts.reduce((sum, debt) => sum + debt.balance, 0) > 0
                        ? baseDebts.reduce((sum, debt) => sum + (debt.balance * debt.apr), 0)
                        / baseDebts.reduce((sum, debt) => sum + debt.balance, 0)
                        : 0
                )
            },
            assumptions: {
                monthlyBudget: roundMoney(monthlyBudget),
                horizonMonths,
                riskPenaltyApr: roundPct(riskPenaltyApr),
                riskAssumptions: payload.riskAssumptions || {
                    creditRiskTier: 'medium',
                    latePaymentProbability: 0.08
                }
            },
            scenarios: rankedScenarios,
            recommendation: this.buildRecommendation(rankedScenarios, baseline)
        };
    }
}

export default new DebtConsolidationRecommenderService();