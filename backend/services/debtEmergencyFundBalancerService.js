import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';

const DEFAULT_HORIZON_MONTHS = 60;
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
    debtType: debt.debtType || debt.type || 'other',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0))
});

class DebtEmergencyFundBalancerService {
    /**
     * Calculate recommended emergency fund target based on expenses and job stability
     * Returns target in months of expenses (e.g., 3 months, 6 months, 12 months)
     */
    assessJobStability(payload = {}) {
        const jobType = payload.jobType || 'stable'; // stable, moderate, volatile
        const employmentHistory = toNumber(payload.yearsEmployed, 2);
        const industryVolatility = payload.industryVolatility || 'moderate'; // low, moderate, high

        // Calculate stability score (0-1, where 1 = very stable)
        let stabilityScore = 0.5;

        // Job type contribution
        if (jobType === 'stable') {
            stabilityScore += 0.25;
        } else if (jobType === 'moderate') {
            stabilityScore += 0.15;
        } else if (jobType === 'volatile') {
            stabilityScore += 0.05;
        }

        // Employment history contribution
        const historyScore = Math.min(0.2, employmentHistory * 0.1);
        stabilityScore += historyScore;

        // Industry volatility contribution
        if (industryVolatility === 'low') {
            stabilityScore += 0.1;
        } else if (industryVolatility === 'moderate') {
            stabilityScore += 0.05;
        }

        return Math.min(1, Math.max(0, stabilityScore));
    }

    /**
     * Calculate recommended emergency fund target in months of expenses
     */
    calculateEmergencyFundTarget(monthlyExpenses, stabilityScore) {
        const expenses = toNumber(monthlyExpenses, 3000);
        const stability = clamp(stabilityScore, 0, 1);

        // Higher stability = lower emergency fund target needed
        // Very stable (1.0): 3 months, Stable (0.75): 4 months, Moderate (0.5): 6 months, Volatile (0.25): 9 months, Very volatile (0): 12 months
        const targetMonths = 12 - stability * 9; // Range 3-12

        return {
            targetMonths: roundMoney(targetMonths),
            targetAmount: roundMoney(expenses * targetMonths),
            stabilityBasis: stability
        };
    }

    /**
     * Simulate "debt-first" strategy: pay debt aggressively, build fund slowly
     */
    simulateDebtFirst(debts, monthlyIncome, monthlyExpenses, horizonMonths) {
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);
        let emergencyFund = 0;
        let totalDebtBalance = debts.reduce((sum, d) => sum + d.balance, 0);
        let totalInterestPaid = 0;
        let allDebtsCleared = false;
        let debtClearMonth = null;

        // Allocation: 80% to debt, 20% to emergency fund
        const availableMonthly = Math.max(0, monthlyIncome - monthlyExpenses);

        for (let month = 1; month <= months; month++) {
            // Allocate: 80% debt, 20% emergency fund
            const debtPaymentCapacity = availableMonthly * 0.8;
            const emergencyAllocation = availableMonthly * 0.2;

            // Add to emergency fund
            emergencyFund = roundMoney(emergencyFund + emergencyAllocation);

            // Pay debt (minimum + extra)
            if (totalDebtBalance > 0.01) {
                const minimumPayments = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
                const extraPayment = Math.max(0, debtPaymentCapacity - minimumPayments);

                // Simple interest accrual
                let debtPayment = minimumPayments + extraPayment;
                let interestAccrued = roundMoney(totalDebtBalance * 0.01); // Approximate monthly interest
                totalInterestPaid += interestAccrued;
                totalDebtBalance = roundMoney(Math.max(0, totalDebtBalance + interestAccrued - debtPayment));

                if (totalDebtBalance < 0.01 && !allDebtsCleared) {
                    allDebtsCleared = true;
                    debtClearMonth = month;
                }
            }
        }

        return {
            strategy: 'debt-first',
            timelineMonths: Math.min(debtClearMonth || months, months),
            debtClearedMonth: debtClearMonth,
            finalEmergencyFund: roundMoney(emergencyFund),
            totalInterestPaid: roundMoney(totalInterestPaid),
            debtCleared: allDebtsCleared,
            allocationRatio: '80% debt / 20% emergency fund'
        };
    }

    /**
     * Simulate "emergency-fund-first" strategy: build fund first, then aggressively pay debt
     */
    simulateEmergencyFundFirst(debts, monthlyIncome, monthlyExpenses, targetEmergencyFund, horizonMonths) {
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);
        let emergencyFund = 0;
        let totalDebtBalance = debts.reduce((sum, d) => sum + d.balance, 0);
        let totalInterestPaid = 0;
        let fundCompleteMonth = null;
        let allDebtsCleared = false;
        let debtClearMonth = null;

        const availableMonthly = Math.max(0, monthlyIncome - monthlyExpenses);
        const targetFund = toNumber(targetEmergencyFund, monthlyExpenses * 6);

        for (let month = 1; month <= months; month++) {
            // Phase 1: Build emergency fund to target (minimum debt payments only)
            if (emergencyFund < targetFund) {
                const minimumPayments = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
                const emergencyAllocation = Math.min(availableMonthly - minimumPayments, targetFund - emergencyFund);

                emergencyFund = roundMoney(emergencyFund + emergencyAllocation);

                if (emergencyFund >= targetFund && !fundCompleteMonth) {
                    fundCompleteMonth = month;
                }

                // Accrue interest on debt
                if (totalDebtBalance > 0.01) {
                    let interestAccrued = roundMoney(totalDebtBalance * 0.01);
                    totalInterestPaid += interestAccrued;
                    totalDebtBalance = roundMoney(Math.max(0, totalDebtBalance + interestAccrued - minimumPayments));
                }
            } else {
                // Phase 2: Aggressively pay debt (minimum + all extra)
                if (totalDebtBalance > 0.01) {
                    const minimumPayments = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
                    const debtPayment = availableMonthly;

                    let interestAccrued = roundMoney(totalDebtBalance * 0.01);
                    totalInterestPaid += interestAccrued;
                    totalDebtBalance = roundMoney(Math.max(0, totalDebtBalance + interestAccrued - debtPayment));

                    if (totalDebtBalance < 0.01 && !allDebtsCleared) {
                        allDebtsCleared = true;
                        debtClearMonth = month;
                    }
                }
            }
        }

        return {
            strategy: 'emergency-fund-first',
            timelineMonths: Math.min(debtClearMonth || months, months),
            fundCompleteMonth,
            debtClearedMonth: debtClearMonth,
            finalEmergencyFund: roundMoney(emergencyFund),
            totalInterestPaid: roundMoney(totalInterestPaid),
            debtCleared: allDebtsCleared,
            allocationRatio: 'Fund first (minimum debt), then aggressive debt'
        };
    }

    /**
     * Simulate "parallel-building" strategy: balance both simultaneously
     */
    simulateParallelBuilding(debts, monthlyIncome, monthlyExpenses, targetEmergencyFund, horizonMonths) {
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);
        let emergencyFund = 0;
        let totalDebtBalance = debts.reduce((sum, d) => sum + d.balance, 0);
        let totalInterestPaid = 0;
        let allDebtsCleared = false;
        let debtClearMonth = null;
        let fundReachedMonth = null;

        const availableMonthly = Math.max(0, monthlyIncome - monthlyExpenses);
        const targetFund = toNumber(targetEmergencyFund, monthlyExpenses * 6);

        // Dynamic allocation: prioritize fund until 50% of target, then balance
        for (let month = 1; month <= months; month++) {
            const fundPercentage = (emergencyFund / targetFund) * 100;
            let debtAllocation, fundAllocation;

            if (fundPercentage < 50) {
                // First half of fund: 50% fund, 50% debt
                fundAllocation = availableMonthly * 0.5;
                debtAllocation = availableMonthly * 0.5;
            } else if (fundPercentage < 100) {
                // Second half: 40% fund, 60% debt
                fundAllocation = availableMonthly * 0.4;
                debtAllocation = availableMonthly * 0.6;
            } else {
                // Fund complete: 100% debt
                fundAllocation = 0;
                debtAllocation = availableMonthly;
            }

            // Add to emergency fund
            emergencyFund = roundMoney(emergencyFund + fundAllocation);
            if (emergencyFund >= targetFund && !fundReachedMonth) {
                fundReachedMonth = month;
            }

            // Pay debt
            if (totalDebtBalance > 0.01) {
                const interestAccrued = roundMoney(totalDebtBalance * 0.01);
                totalInterestPaid += interestAccrued;
                totalDebtBalance = roundMoney(Math.max(0, totalDebtBalance + interestAccrued - debtAllocation));

                if (totalDebtBalance < 0.01 && !allDebtsCleared) {
                    allDebtsCleared = true;
                    debtClearMonth = month;
                }
            }
        }

        return {
            strategy: 'parallel-building',
            timelineMonths: Math.min(debtClearMonth || months, months),
            fundCompleteMonth: fundReachedMonth,
            debtClearedMonth: debtClearMonth,
            finalEmergencyFund: roundMoney(emergencyFund),
            totalInterestPaid: roundMoney(totalInterestPaid),
            debtCleared: allDebtsCleared,
            allocationRatio: 'Dynamic: 50/50 initially, 40/60 mid-fund, 0/100 after fund complete'
        };
    }

    /**
     * Calculate financial stress metrics: what happens if emergency occurs
     */
    calculateStressMetrics(emergencyFund, monthlyExpenses, totalDebtBalance) {
        const expenses = toNumber(monthlyExpenses, 3000);
        const fund = toNumber(emergencyFund, 0);
        const debt = toNumber(totalDebtBalance, 0);

        // Coverage ratio: how many months can be covered by emergency fund
        const coverageMonths = expenses > 0 ? fund / expenses : 0;

        // Debt-to-income ratio: annual debt vs annual income
        const annualDebt = debt;
        const annualIncome = expenses * 12; // Assumption: expenses = income for simulation
        const debtToIncomeRatio = annualIncome > 0 ? annualDebt / annualIncome : 999;

        // Financial stress level
        let stressLevel = 'safe'; // safe, moderate, stressed, critical
        if (coverageMonths >= 6 && debtToIncomeRatio < 2) {
            stressLevel = 'safe';
        } else if (coverageMonths >= 3 && debtToIncomeRatio < 4) {
            stressLevel = 'moderate';
        } else if (coverageMonths >= 1 && debtToIncomeRatio < 6) {
            stressLevel = 'stressed';
        } else {
            stressLevel = 'critical';
        }

        return {
            emergencyFundCoverageMonths: roundMoney(coverageMonths),
            debtToIncomeRatio: roundMoney(debtToIncomeRatio),
            stressLevel,
            assessment: stressLevel === 'safe' ? 'Strong financial position; can handle emergencies' :
                stressLevel === 'moderate' ? 'Acceptable position; modest emergency buffer' :
                stressLevel === 'stressed' ? 'Limited buffer; emergency would cause hardship' :
                'Critical: emergency would require additional borrowing'
        };
    }

    /**
     * Main entry point: Compare all three strategies and recommend best approach
     */
    async optimize(userId, payload = {}) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) {
                return {
                    success: false,
                    message: 'No active debts found'
                };
            }

            const normalizedDebts = userDebts.map(normalizeDebt);
            const monthlyIncome = toNumber(payload.monthlyIncome, 5000);
            const monthlyExpenses = toNumber(payload.monthlyExpenses, 3000);
            const horizonMonths = clamp(toNumber(payload.horizonMonths, DEFAULT_HORIZON_MONTHS), 1, MAX_HORIZON_MONTHS);

            // Assess job stability and determine emergency fund target
            const stabilityScore = this.assessJobStability(payload);
            const fundTarget = this.calculateEmergencyFundTarget(monthlyExpenses, stabilityScore);

            // Simulate all three strategies
            const debtFirstResult = this.simulateDebtFirst(normalizedDebts, monthlyIncome, monthlyExpenses, horizonMonths);
            const fundFirstResult = this.simulateEmergencyFundFirst(
                normalizedDebts,
                monthlyIncome,
                monthlyExpenses,
                fundTarget.targetAmount,
                horizonMonths
            );
            const parallelResult = this.simulateParallelBuilding(
                normalizedDebts,
                monthlyIncome,
                monthlyExpenses,
                fundTarget.targetAmount,
                horizonMonths
            );

            // Rank strategies by combined score: interest paid + stress level
            const results = [debtFirstResult, fundFirstResult, parallelResult];
            const stressMetrics = results.map(r => this.calculateStressMetrics(r.finalEmergencyFund, monthlyExpenses, 0));

            // Scoring: lower interest is better, better stress level is better
            const scores = results.map((r, idx) => ({
                strategy: r.strategy,
                score: r.totalInterestPaid + (stressMetrics[idx].stressLevel === 'safe' ? 0 :
                    stressMetrics[idx].stressLevel === 'moderate' ? 5000 :
                    stressMetrics[idx].stressLevel === 'stressed' ? 15000 : 50000),
                details: r
            }));

            scores.sort((a, b) => a.score - b.score);

            return {
                success: true,
                message: 'Emergency fund and debt payoff optimization complete',
                analysis: {
                    jobStabilityScore: roundMoney(stabilityScore),
                    recommendedEmergencyFundTarget: fundTarget,
                    availableCashFlow: roundMoney(monthlyIncome - monthlyExpenses),
                    totalDebtBalance: roundMoney(normalizedDebts.reduce((sum, d) => sum + d.balance, 0))
                },
                scenarios: [
                    {
                        rank: 1,
                        ...debtFirstResult,
                        stressMetrics: stressMetrics[0],
                        score: scores[0].score
                    },
                    {
                        rank: 2,
                        ...fundFirstResult,
                        stressMetrics: stressMetrics[1],
                        score: scores[1].score
                    },
                    {
                        rank: 3,
                        ...parallelResult,
                        stressMetrics: stressMetrics[2],
                        score: scores[2].score
                    }
                ],
                recommendation: {
                    recommendedStrategy: scores[0].details.strategy,
                    reason: scores[0].details.strategy === 'parallel-building' ?
                        'Parallel building balances both goals safely' :
                        scores[0].details.strategy === 'debt-first' ?
                        'Debt-first minimizes total interest with acceptable emergency coverage' :
                        'Emergency fund first provides maximum financial security',
                    months: scores[0].details.timelineMonths,
                    yearOfCompletion: new Date().getFullYear() + Math.ceil(scores[0].details.timelineMonths / 12)
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error optimizing strategy: ${err.message}`
            };
        }
    }
}

export default new DebtEmergencyFundBalancerService();
