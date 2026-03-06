import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const DEFAULT_HORIZON_MONTHS = 120;
const MAX_HORIZON_MONTHS = 360;

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

class DebtSequencingOptimizerService {
    /**
     * Apply constraints to debt list
     * Constraints: minimumBalance (to maintain), noTouch (never pay off), priority (pay off first)
     */
    applyConstraints(debts, constraints = {}) {
        const minBalances = constraints.minimumBalance || {};
        const noTouches = Array.isArray(constraints.noTouch) ? constraints.noTouch : [];
        const priorities = Array.isArray(constraints.priority) ? constraints.priority : [];

        return debts.map(debt => ({
            ...debt,
            minBalanceToMaintain: toNumber(minBalances[debt.id], 0),
            isNoTouch: noTouches.includes(debt.id),
            isPriority: priorities.includes(debt.id),
            payableBalance: Math.max(0, debt.balance - (minBalances[debt.id] || 0))
        }));
    }

    /**
     * Simulate avalanche sequence: highest APR first
     */
    simulateAvalanche(debts, constraints = {}, horizonMonths = 120) {
        const constrainedDebts = this.applyConstraints(debts, constraints);
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);

        let debtSequence = constrainedDebts
            .filter(d => !d.isNoTouch && d.payableBalance > 0.01)
            .sort((a, b) => b.apr - a.apr); // Highest APR first

        const sequence = [];
        let totalInterestPaid = 0;
        let sequenceMonth = 0;

        for (const debt of debtSequence) {
            // Estimate months to payoff for this debt
            const monthlyRate = debt.apr / 12;
            let balance = debt.payableBalance;
            let debtInterest = 0;
            let debtMonths = 0;

            while (balance > 0.01 && debtMonths < months) {
                const interest = roundMoney(balance * monthlyRate);
                const minPayment = debt.minimumPayment;
                balance = roundMoney(balance + interest - minPayment);
                debtInterest += interest;
                debtMonths++;
            }

            sequenceMonth += debtMonths;
            totalInterestPaid += debtInterest;

            sequence.push({
                debtId: debt.id,
                debtName: debt.name,
                balance: roundMoney(debt.payableBalance),
                apr: roundMoney(debt.apr * 100),
                minimumPayment: roundMoney(debt.minimumPayment),
                estimatedMonthsToPayoff: debtMonths,
                estimatedInterest: roundMoney(debtInterest),
                sequencePosition: sequence.length + 1
            });
        }

        return {
            strategy: 'avalanche',
            payoffSequence: sequence,
            totalMonths: sequenceMonth,
            totalInterestPaid: roundMoney(totalInterestPaid),
            constraintsApplied: Object.keys(constraints).length > 0,
            debtsCovered: sequence.length
        };
    }

    /**
     * Simulate snowball sequence: smallest balance first
     */
    simulateSnowball(debts, constraints = {}, horizonMonths = 120) {
        const constrainedDebts = this.applyConstraints(debts, constraints);
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);

        let debtSequence = constrainedDebts
            .filter(d => !d.isNoTouch && d.payableBalance > 0.01)
            .sort((a, b) => a.payableBalance - b.payableBalance); // Smallest balance first

        const sequence = [];
        let totalInterestPaid = 0;
        let sequenceMonth = 0;

        for (const debt of debtSequence) {
            const monthlyRate = debt.apr / 12;
            let balance = debt.payableBalance;
            let debtInterest = 0;
            let debtMonths = 0;

            while (balance > 0.01 && debtMonths < months) {
                const interest = roundMoney(balance * monthlyRate);
                const minPayment = debt.minimumPayment;
                balance = roundMoney(balance + interest - minPayment);
                debtInterest += interest;
                debtMonths++;
            }

            sequenceMonth += debtMonths;
            totalInterestPaid += debtInterest;

            sequence.push({
                debtId: debt.id,
                debtName: debt.name,
                balance: roundMoney(debt.payableBalance),
                apr: roundMoney(debt.apr * 100),
                minimumPayment: roundMoney(debt.minimumPayment),
                estimatedMonthsToPayoff: debtMonths,
                estimatedInterest: roundMoney(debtInterest),
                sequencePosition: sequence.length + 1
            });
        }

        return {
            strategy: 'snowball',
            payoffSequence: sequence,
            totalMonths: sequenceMonth,
            totalInterestPaid: roundMoney(totalInterestPaid),
            constraintsApplied: Object.keys(constraints).length > 0,
            debtsCovered: sequence.length
        };
    }

    /**
     * Simulate custom sequence: user-provided debt order
     */
    simulateCustomSequence(debts, customSequence, constraints = {}, horizonMonths = 120) {
        const constrainedDebts = this.applyConstraints(debts, constraints);
        const months = clamp(horizonMonths, 1, MAX_HORIZON_MONTHS);

        const sequenceIds = Array.isArray(customSequence) ? customSequence : [];
        let debtSequence = sequenceIds
            .map(debtId => constrainedDebts.find(d => d.id === debtId))
            .filter(d => d && !d.isNoTouch && d.payableBalance > 0.01);

        const sequence = [];
        let totalInterestPaid = 0;
        let sequenceMonth = 0;

        for (const debt of debtSequence) {
            const monthlyRate = debt.apr / 12;
            let balance = debt.payableBalance;
            let debtInterest = 0;
            let debtMonths = 0;

            while (balance > 0.01 && debtMonths < months) {
                const interest = roundMoney(balance * monthlyRate);
                const minPayment = debt.minimumPayment;
                balance = roundMoney(balance + interest - minPayment);
                debtInterest += interest;
                debtMonths++;
            }

            sequenceMonth += debtMonths;
            totalInterestPaid += debtInterest;

            sequence.push({
                debtId: debt.id,
                debtName: debt.name,
                balance: roundMoney(debt.payableBalance),
                apr: roundMoney(debt.apr * 100),
                minimumPayment: roundMoney(debt.minimumPayment),
                estimatedMonthsToPayoff: debtMonths,
                estimatedInterest: roundMoney(debtInterest),
                sequencePosition: sequence.length + 1
            });
        }

        return {
            strategy: 'custom',
            payoffSequence: sequence,
            totalMonths: sequenceMonth,
            totalInterestPaid: roundMoney(totalInterestPaid),
            constraintsApplied: Object.keys(constraints).length > 0,
            debtsCovered: sequence.length
        };
    }

    /**
     * Calculate breakeven analysis: when to switch from one debt to next
     */
    calculateBreakevenPoints(avalanches, snowball, custom) {
        const strategies = [
            { ...avalanche, sequence: snowball.payoffSequence },
            { ...snowball, sequence: snowball.payoffSequence },
            { ...custom, sequence: custom.payoffSequence }
        ];

        // Compare avalanche vs snowball interest at each sequence position
        const breakevens = [];

        for (let i = 1; i < Math.max(avalanche.payoffSequence.length, snowball.payoffSequence.length); i++) {
            const avDebt = avalanche.payoffSequence[i - 1];
            const sbDebt = snowball.payoffSequence[i - 1];

            if (avDebt && sbDebt && avDebt.debtId !== sbDebt.debtId) {
                const interestDiff = Math.abs(avDebt.estimatedInterest - sbDebt.estimatedInterest);
                const monthDiff = Math.abs(avDebt.estimatedMonthsToPayoff - sbDebt.estimatedMonthsToPayoff);

                breakevens.push({
                    position: i,
                    avalancheDebt: avDebt.debtName,
                    snowballDebt: sbDebt.debtName,
                    interestDifference: roundMoney(interestDiff),
                    monthsDifference: monthDiff,
                    recommendation: interestDiff > 500 ? `Avalanche saves $${roundMoney(interestDiff)} on debt ${i}` :
                        monthDiff > 3 ? `Snowball closes debt ${i} ${monthDiff} months earlier` :
                        'Strategies roughly equivalent at this position'
                });
            }
        }

        return breakevens;
    }

    /**
     * Rank sequences by interest paid and timeline
     */
    rankSequences(avalanche, snowball, custom) {
        const sequences = [avalanche, snowball, custom].filter(s => s.debtsCovered > 0);

        sequences.sort((a, b) => {
            // Primary: total interest (lower is better)
            if (Math.abs(a.totalInterestPaid - b.totalInterestPaid) > 100) {
                return a.totalInterestPaid - b.totalInterestPaid;
            }
            // Secondary: timeline (shorter is better)
            return a.totalMonths - b.totalMonths;
        });

        return sequences.map((seq, idx) => ({
            ...seq,
            rank: idx + 1,
            savings: roundMoney(Math.max(0, sequences[sequences.length - 1].totalInterestPaid - seq.totalInterestPaid))
        }));
    }

    /**
     * Main entry point: Optimize debt sequencing with constraints
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
            const horizonMonths = clamp(toNumber(payload.horizonMonths, DEFAULT_HORIZON_MONTHS), 1, MAX_HORIZON_MONTHS);
            const constraints = payload.constraints || {};
            const customSequence = payload.customSequence || [];

            // Validate constraints structure
            const validatedConstraints = {
                minimumBalance: constraints.minimumBalance || {},
                noTouch: Array.isArray(constraints.noTouch) ? constraints.noTouch : [],
                priority: Array.isArray(constraints.priority) ? constraints.priority : []
            };

            // Run all three simulations
            const avalanche = this.simulateAvalanche(normalizedDebts, validatedConstraints, horizonMonths);
            const snowball = this.simulateSnowball(normalizedDebts, validatedConstraints, horizonMonths);
            const custom = customSequence.length > 0
                ? this.simulateCustomSequence(normalizedDebts, customSequence, validatedConstraints, horizonMonths)
                : { strategy: 'custom', payoffSequence: [], totalMonths: 0, totalInterestPaid: 0, debtsCovered: 0, constraintsApplied: false };

            // Calculate breakevens
            const breakevens = this.calculateBreakevenPoints(avalanche, snowball, custom);

            // Rank sequences
            const ranked = this.rankSequences(avalanche, snowball, custom);

            // Get constrained debts for analysis
            const constrainedDebts = this.applyConstraints(normalizedDebts, validatedConstraints);
            const noTouchDebts = constrainedDebts.filter(d => d.isNoTouch);
            const priorityDebts = constrainedDebts.filter(d => d.isPriority);

            return {
                success: true,
                message: 'Debt sequencing optimization complete',
                analysis: {
                    totalDebts: normalizedDebts.length,
                    debtsToBePaidOff: normalizedDebts.filter(d => d.balance > 0.01).length,
                    constraintSummary: {
                        minimumBalancesRequested: Object.keys(validatedConstraints.minimumBalance).length,
                        noTouchDebts: noTouchDebts.length,
                        priorityDebts: priorityDebts.length
                    },
                    constraintedDebtsInfo: {
                        noTouch: noTouchDebts.map(d => ({ id: d.id, name: d.name, balance: roundMoney(d.balance) })),
                        priority: priorityDebts.map(d => ({ id: d.id, name: d.name, balance: roundMoney(d.balance) }))
                    }
                },
                sequences: ranked,
                breakeven: {
                    points: breakevens,
                    summary: breakevens.length > 0 ?
                        `${breakevens.length} switching points identified between strategies` :
                        'Strategies align closely; choose based on preference'
                },
                recommendation: {
                    recommendedStrategy: ranked[0]?.strategy || 'avalanche',
                    reason: ranked[0]?.strategy === 'avalanche' ?
                        'Avalanche minimizes total interest paid' :
                        ranked[0]?.strategy === 'snowball' ?
                        'Snowball provides psychological wins with competitive interest cost' :
                        'Custom sequence meets user preferences with reasonable cost',
                    monthsToComplete: ranked[0]?.totalMonths || 0,
                    totalInterestCost: roundMoney(ranked[0]?.totalInterestPaid || 0),
                    savings: roundMoney(ranked[0]?.savings || 0)
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error optimizing sequences: ${err.message}`
            };
        }
    }
}

export default new DebtSequencingOptimizerService();
