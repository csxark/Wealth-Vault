import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundMoney = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const roundPercent = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 10000) / 100;

const normalizeAprPercent = (apr) => {
    const value = toNumber(apr, 0);
    if (value <= 0) return 0;
    if (value > 0 && value < 1) return value * 100;
    return value;
};

const amortizedPayment = (principal, aprPercent, termMonths) => {
    const p = Math.max(0, toNumber(principal, 0));
    const months = Math.max(1, Math.round(toNumber(termMonths, 1)));
    const monthlyRate = clamp(normalizeAprPercent(aprPercent), 0, 100) / 100 / 12;

    if (p <= 0) return 0;
    if (monthlyRate <= 0) return roundMoney(p / months);

    const numerator = p * monthlyRate * Math.pow(1 + monthlyRate, months);
    const denominator = Math.pow(1 + monthlyRate, months) - 1;
    if (denominator <= 0) return roundMoney(p / months);

    return roundMoney(numerator / denominator);
};

const simulateLoan = (principal, aprPercent, monthlyPayment, maxMonths = 600) => {
    let balance = roundMoney(principal);
    let interestPaid = 0;
    let months = 0;
    const paymentFloor = Math.max(1, roundMoney(monthlyPayment));
    const monthlyRate = clamp(normalizeAprPercent(aprPercent), 0, 100) / 100 / 12;

    while (balance > 0.01 && months < maxMonths) {
        months += 1;
        const interest = roundMoney(balance * monthlyRate);
        let payment = paymentFloor;

        if (payment <= interest && monthlyRate > 0) {
            payment = roundMoney(interest + Math.max(1, balance * 0.002));
        }

        payment = Math.min(payment, roundMoney(balance + interest));
        const principalPaid = roundMoney(payment - interest);
        balance = roundMoney(Math.max(0, balance - principalPaid));
        interestPaid = roundMoney(interestPaid + interest);
    }

    return {
        months,
        interestPaid,
        remainingBalance: balance,
        fullyPaid: balance <= 0.01
    };
};

class MultiLoanConsolidationRecommenderService {
    async getUserLoans(userId) {
        return db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true))
        });
    }

    normalizeLoan(loan = {}) {
        return {
            id: loan.id || `loan_${Math.random().toString(36).slice(2, 8)}`,
            name: loan.name || 'Loan',
            type: (loan.debtType || loan.type || 'other').toLowerCase(),
            balance: roundMoney(toNumber(loan.currentBalance ?? loan.balance, 0)),
            minimumPayment: roundMoney(Math.max(0, toNumber(loan.minimumPayment, 0))),
            apr: clamp(normalizeAprPercent(loan.apr), 0, 100),
            monthsRemaining: clamp(toNumber(loan.monthsRemaining ?? loan.termMonths, 60), 1, 480),
            hasFederalBenefits: loan.hasFederalBenefits === true || loan.loanProgram === 'federal',
            hasRateDiscountBenefits: loan.hasRateDiscountBenefits === true,
            promoAprEndMonths: clamp(toNumber(loan.promoAprEndMonths, 0), 0, 240)
        };
    }

    assessEligibility(loan) {
        const reasons = [];

        if (loan.balance <= 0) reasons.push('No active balance');
        if (loan.hasFederalBenefits) reasons.push('Federal protections/forgiveness may be lost');
        if (loan.apr < 4) reasons.push('Low APR loan often not a consolidation target');
        if (loan.type === 'mortgage') reasons.push('Mortgage is typically evaluated separately');

        return {
            loanId: loan.id,
            loanName: loan.name,
            eligible: reasons.length === 0,
            reasons
        };
    }

    buildDefaultScenarios(weightedApr) {
        return [
            {
                name: 'Conservative Personal Loan',
                apr: Math.max(5.9, weightedApr - 2.5),
                termMonths: 36,
                originationFeePercent: 2,
                fixedFees: 0
            },
            {
                name: 'Balanced Personal Loan',
                apr: Math.max(6.5, weightedApr - 1.75),
                termMonths: 48,
                originationFeePercent: 3,
                fixedFees: 0
            },
            {
                name: 'Cash-Flow Relief Loan',
                apr: Math.max(7.25, weightedApr - 1),
                termMonths: 60,
                originationFeePercent: 3.5,
                fixedFees: 150
            }
        ];
    }

    buildTimingRecommendation(bestScenario, context = {}) {
        if (!bestScenario) {
            return {
                recommendedTiming: 'Not applicable',
                timingScore: 0,
                rationale: 'No beneficial scenario found'
            };
        }

        const expectedRateShiftBps = toNumber(context.expectedRateShiftBps, 0);
        const urgentPromoExpiry = context.eligibleLoans.some((loan) => loan.promoAprEndMonths > 0 && loan.promoAprEndMonths <= 3);
        const highAprPressure = context.weightedApr >= 16;

        let timingScore = 55;
        const rationale = [];

        if (urgentPromoExpiry) {
            timingScore += 20;
            rationale.push('Existing promotional APR ends soon');
        }

        if (highAprPressure) {
            timingScore += 10;
            rationale.push('Current weighted APR is high');
        }

        if (expectedRateShiftBps <= -75) {
            timingScore -= 18;
            rationale.push('Rates are expected to decline materially');
        } else if (expectedRateShiftBps >= 50) {
            timingScore += 12;
            rationale.push('Rates are expected to rise');
        }

        if (bestScenario.totalSavings > 1000) {
            timingScore += 10;
            rationale.push('Projected savings are significant');
        }

        const boundedScore = clamp(Math.round(timingScore), 0, 100);
        const recommendationLabel = boundedScore >= 70
            ? 'Apply in the next 30 days'
            : boundedScore >= 45
                ? 'Monitor for 1-3 months and apply on a competitive offer'
                : 'Wait for better rates or improved credit profile';

        return {
            recommendedTiming: recommendationLabel,
            timingScore: boundedScore,
            rationale
        };
    }

    recommendAction(bestScenario, risks, timing) {
        if (!bestScenario) {
            return {
                action: 'do_not_consolidate',
                reason: 'No scenario improves total cost meaningfully.'
            };
        }

        const hasSevereRisk = risks.some((r) => r.severity === 'high');
        if (hasSevereRisk || bestScenario.totalSavings <= 0) {
            return {
                action: 'do_not_consolidate',
                reason: hasSevereRisk
                    ? 'Risk profile is unfavorable for consolidation right now.'
                    : 'Consolidation does not reduce total cost.'
            };
        }

        if (timing.timingScore < 45) {
            return {
                action: 'wait',
                reason: 'Scenario is beneficial, but timing outlook suggests waiting for a better rate window.'
            };
        }

        return {
            action: 'consolidate_now',
            reason: 'Best scenario improves monthly cash flow and lowers projected total cost.'
        };
    }

    async recommend(userId, payload = {}) {
        const rawLoans = Array.isArray(payload.loans) && payload.loans.length > 0
            ? payload.loans
            : await this.getUserLoans(userId);

        const loans = rawLoans.map((loan) => this.normalizeLoan(loan)).filter((loan) => loan.balance > 0);
        if (!loans.length) {
            return {
                success: true,
                summary: null,
                eligibility: [],
                scenarios: [],
                recommendation: {
                    action: 'do_not_consolidate',
                    reason: 'No active loans available.'
                }
            };
        }

        const eligibility = loans.map((loan) => this.assessEligibility(loan));
        const eligibleLoanIds = new Set(eligibility.filter((e) => e.eligible).map((e) => e.loanId));
        const eligibleLoans = loans.filter((loan) => eligibleLoanIds.has(loan.id));
        const ineligibleLoans = loans.filter((loan) => !eligibleLoanIds.has(loan.id));

        if (!eligibleLoans.length) {
            return {
                success: true,
                summary: {
                    totalLoans: loans.length,
                    eligibleLoans: 0,
                    ineligibleLoans: ineligibleLoans.length
                },
                eligibility,
                scenarios: [],
                recommendation: {
                    action: 'do_not_consolidate',
                    reason: 'No loans meet consolidation eligibility criteria.'
                }
            };
        }

        const eligibleBalance = roundMoney(eligibleLoans.reduce((sum, loan) => sum + loan.balance, 0));
        const currentMonthlyPayment = roundMoney(eligibleLoans.reduce((sum, loan) => sum + loan.minimumPayment, 0));
        const weightedApr = roundPercent(
            eligibleBalance > 0
                ? eligibleLoans.reduce((sum, loan) => sum + (loan.balance * loan.apr), 0) / eligibleBalance
                : 0
        );

        const baselineByLoan = eligibleLoans.map((loan) => ({
            loanId: loan.id,
            name: loan.name,
            ...simulateLoan(loan.balance, loan.apr, Math.max(1, loan.minimumPayment), 600)
        }));

        const baselineInterest = roundMoney(baselineByLoan.reduce((sum, loan) => sum + loan.interestPaid, 0));
        const baselineTimeline = baselineByLoan.length ? Math.max(...baselineByLoan.map((loan) => loan.months)) : 0;

        const scenarioInputs = Array.isArray(payload.scenarioOptions) && payload.scenarioOptions.length > 0
            ? payload.scenarioOptions
            : this.buildDefaultScenarios(weightedApr);

        const scenarios = scenarioInputs.map((scenario, index) => {
            const apr = clamp(normalizeAprPercent(scenario.apr), 0, 100);
            const termMonths = clamp(toNumber(scenario.termMonths, 48), 1, 480);
            const originationFeePercent = clamp(toNumber(scenario.originationFeePercent, 0), 0, 10);
            const fixedFees = Math.max(0, toNumber(scenario.fixedFees, 0));
            const fees = roundMoney((eligibleBalance * originationFeePercent / 100) + fixedFees);
            const principal = roundMoney(eligibleBalance + fees);
            const monthlyPayment = amortizedPayment(principal, apr, termMonths);
            const consolidatedSimulation = simulateLoan(principal, apr, monthlyPayment, termMonths + 24);

            const interest = roundMoney(consolidatedSimulation.interestPaid);
            const totalCost = roundMoney(interest + fees);
            const interestSavings = roundMoney(baselineInterest - interest);
            const totalSavings = roundMoney(baselineInterest - totalCost);
            const timelineChangeMonths = baselineTimeline - consolidatedSimulation.months;
            const monthlyPaymentDelta = roundMoney(currentMonthlyPayment - monthlyPayment);

            const riskFlags = [];
            if (apr > weightedApr) {
                riskFlags.push('APR is higher than current weighted APR');
            }
            if (totalSavings < 0) {
                riskFlags.push('Total projected cost is higher than current path');
            }
            if (timelineChangeMonths < 0) {
                riskFlags.push('Payoff timeline is extended');
            }
            if (originationFeePercent >= 4.5) {
                riskFlags.push('High origination fee');
            }
            if (monthlyPayment > currentMonthlyPayment * 1.2) {
                riskFlags.push('Monthly payment may strain cash flow');
            }

            return {
                name: scenario.name || `Scenario ${index + 1}`,
                apr: roundPercent(apr),
                termMonths,
                principal,
                fees,
                monthlyPayment,
                monthlyPaymentDelta,
                payoffMonths: consolidatedSimulation.months,
                interest,
                totalCost,
                interestSavings,
                totalSavings,
                timelineChangeMonths,
                riskFlags,
                score: roundMoney((totalSavings * 0.7) + (monthlyPaymentDelta * 8) + (timelineChangeMonths * 12) - (riskFlags.length * 100))
            };
        }).sort((a, b) => b.score - a.score);

        const topScenario = scenarios[0] || null;

        const globalRisks = [];
        if (ineligibleLoans.some((loan) => loan.hasFederalBenefits)) {
            globalRisks.push({
                severity: 'high',
                risk: 'Benefit loss risk',
                detail: 'One or more loans have federal protections and should stay separate.'
            });
        }
        if (topScenario && topScenario.totalSavings < 0) {
            globalRisks.push({
                severity: 'high',
                risk: 'Negative savings',
                detail: 'Best available scenario raises total projected cost.'
            });
        }
        if (topScenario && topScenario.timelineChangeMonths < 0) {
            globalRisks.push({
                severity: 'medium',
                risk: 'Longer payoff',
                detail: 'Consolidation extends payoff duration versus the current path.'
            });
        }

        const timing = this.buildTimingRecommendation(topScenario, {
            expectedRateShiftBps: payload?.timing?.expectedRateShiftBps,
            eligibleLoans,
            weightedApr
        });

        const action = this.recommendAction(topScenario, globalRisks, timing);

        return {
            success: true,
            summary: {
                totalLoans: loans.length,
                eligibleLoans: eligibleLoans.length,
                ineligibleLoans: ineligibleLoans.length,
                eligibleBalance,
                currentMonthlyPayment,
                weightedApr,
                baselineInterest,
                baselineTimelineMonths: baselineTimeline
            },
            eligibility,
            scenarios,
            risks: globalRisks,
            recommendation: {
                ...action,
                bestScenario: topScenario
                    ? {
                        name: topScenario.name,
                        totalSavings: topScenario.totalSavings,
                        monthlyPaymentDelta: topScenario.monthlyPaymentDelta,
                        timelineChangeMonths: topScenario.timelineChangeMonths
                    }
                    : null,
                timing
            }
        };
    }
}

export default new MultiLoanConsolidationRecommenderService();
