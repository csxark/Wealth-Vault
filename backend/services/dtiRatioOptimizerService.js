import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// DTI thresholds by loan product
const DTI_THRESHOLDS = {
    'conventional-mortgage': { targetDti: 0.43, idealDti: 0.36, description: 'Conventional mortgages typically require ≤43% DTI; 36% is ideal' },
    'fha-mortgage': { targetDti: 0.50, idealDti: 0.40, description: 'FHA mortgages allow up to 50% DTI; 40% is optimal' },
    'va-mortgage': { targetDti: 0.60, idealDti: 0.50, description: 'VA mortgages allow up to 60% DTI (no hard cap)' },
    'auto-loan': { targetDti: 0.50, idealDti: 0.36, description: 'Auto lenders prefer ≤50% DTI' },
    'personal-loan': { targetDti: 0.43, idealDti: 0.36, description: 'Personal loans typically require ≤43% DTI' },
    'refinance': { targetDti: 0.43, idealDti: 0.36, description: 'Refinancing requires ≤43% DTI for best rates' }
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPercent = (value) => Math.round(value * 10000) / 100; // 2 decimal places

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    type: debt.type || 'personal-loan',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0)),
    remainingMonths: Math.max(0, toNumber(debt.remainingMonths, 999))
});

class DtiRatioOptimizerService {
    /**
     * Calculate current DTI ratio
     * DTI = Total monthly debt payments / Gross monthly income
     */
    calculateCurrentDti(debts = [], grossMonthlyIncome = 0) {
        if (grossMonthlyIncome === 0) {
            return {
                grossMonthlyIncome: 0,
                totalMonthlyPayment: 0,
                dtiRatio: 100,
                dtiPercent: '100.00%',
                status: 'insufficient-income'
            };
        }

        const totalMonthlyPayment = roundMoney(debts.reduce((sum, d) => sum + d.minimumPayment, 0));
        const dtiRatio = totalMonthlyPayment / grossMonthlyIncome;
        const dtiPercent = roundPercent(dtiRatio);

        return {
            grossMonthlyIncome: roundMoney(grossMonthlyIncome),
            totalMonthlyPayment,
            dtiRatio: roundPercent(dtiRatio * 100),
            dtiPercent: `${roundPercent(dtiRatio * 100)}%`,
            status: dtiRatio > 0.50 ? 'critical' : dtiRatio > 0.43 ? 'elevated' : dtiRatio > 0.36 ? 'moderate' : 'healthy'
        };
    }

    /**
     * Calculate DTI impact of eliminating a single debt
     */
    calculateDebtEliminationImpact(debt, currentDti, grossMonthlyIncome = 0) {
        const paymentSavings = debt.minimumPayment;
        const newTotalPayment = roundMoney(currentDti.totalMonthlyPayment - paymentSavings);
        const newDtiRatio = grossMonthlyIncome > 0 ? newTotalPayment / grossMonthlyIncome : 0;
        const newDtiPercent = roundPercent(newDtiRatio * 100);
        const dtiImprovement = roundPercent((currentDti.dtiRatio - newDtiPercent) * 100);

        return {
            debtId: debt.id,
            debtName: debt.name,
            currentPayment: debt.minimumPayment,
            paymentSavings,
            newTotalPayment,
            newDtiPercent,
            dtiImprovement,
            improvementRatio: dtiImprovement > 0 ? roundPercent((dtiImprovement / currentDti.dtiRatio) * 100) : 0
        };
    }

    /**
     * Rank debts by DTI improvement impact (highest impact first)
     */
    rankDebtsByDtiImpact(debts = [], currentDti, grossMonthlyIncome = 0) {
        const impacts = debts.map(d => this.calculateDebtEliminationImpact(d, currentDti, grossMonthlyIncome));
        return impacts.sort((a, b) => b.dtiImprovement - a.dtiImprovement);
    }

    /**
     * Generate optimal payoff paths to reach target DTI
     * Returns sequences: aggressive, balanced, moderate
     */
    generatePayoffPaths(debts = [], grossMonthlyIncome = 0, targetDtiPercent = 36) {
        const currentDti = this.calculateCurrentDti(debts, grossMonthlyIncome);
        const rankedByImpact = this.rankDebtsByDtiImpact(debts, currentDti, grossMonthlyIncome);

        // Path 1: Aggressive - eliminate debts in order of DTI impact
        const aggressivePath = {
            name: 'Aggressive',
            strategy: 'Eliminate highest-DTI-impact debts first',
            debtSequence: rankedByImpact.slice(0, Math.ceil(rankedByImpact.length / 2)).map(d => d.debtId),
            projectedDtiReduction: roundPercent(rankedByImpact.slice(0, Math.ceil(rankedByImpact.length / 2)).reduce((sum, d) => sum + d.dtiImprovement, 0)),
            timeToTargetDti: this.estimatePayoffMonths(rankedByImpact, targetDtiPercent, true)
        };

        // Path 2: Balanced - eliminate debts by impact, but mix sizes
        const balancedPath = {
            name: 'Balanced',
            strategy: 'Mix high-impact and quick-win debts',
            debtSequence: rankedByImpact.slice(0, Math.ceil(rankedByImpact.length * 0.6)).map(d => d.debtId),
            projectedDtiReduction: roundPercent(rankedByImpact.slice(0, Math.ceil(rankedByImpact.length * 0.6)).reduce((sum, d) => sum + d.dtiImprovement, 0)),
            timeToTargetDti: this.estimatePayoffMonths(rankedByImpact, targetDtiPercent, false)
        };

        // Path 3: Moderate - conservative, with buffer for emergencies
        const moderatePath = {
            name: 'Moderate',
            strategy: 'Conservative payoff with emergency buffer',
            debtSequence: rankedByImpact.slice(0, Math.min(2, rankedByImpact.length)).map(d => d.debtId),
            projectedDtiReduction: roundPercent(rankedByImpact.slice(0, Math.min(2, rankedByImpact.length)).reduce((sum, d) => sum + d.dtiImprovement, 0)),
            timeToTargetDti: this.estimatePayoffMonths(rankedByImpact, targetDtiPercent, false)
        };

        return [aggressivePath, balancedPath, moderatePath];
    }

    /**
     * Estimate months to reach target DTI
     */
    estimatePayoffMonths(rankedDebtsByImpact = [], targetDtiPercent = 36, speedAggressive = true) {
        // Simple heuristic: estimate months based on total impact needed
        const firstImpact = rankedDebtsByImpact[0]?.dtiImprovement || 0;
        if (firstImpact === 0) return null;

        const improvementMonthsEstimate = speedAggressive ? 12 : 18;
        return Math.max(6, improvementMonthsEstimate);
    }

    /**
     * Project DTI over time for a given payoff strategy
     */
    projectDtiOverTime(debts = [], grossMonthlyIncome = 0, payoffMonths = [6, 12, 24]) {
        const currentDti = this.calculateCurrentDti(debts, grossMonthlyIncome);
        
        // Simulate declining debts over time (proportional paydown)
        const projections = payoffMonths.map(months => {
            // Estimate debt reduction: assume 20% paydown per 12 months (varies by debt)
            const paydownRate = Math.min(1.0, (months / 12) * 0.2);
            const reducedDebts = debts.map(d => ({
                ...d,
                minimumPayment: roundMoney(d.minimumPayment * (1 - paydownRate))
            }));

            const projectedDti = this.calculateCurrentDti(reducedDebts, grossMonthlyIncome);
            const dtiImprovement = roundPercent((currentDti.dtiRatio - projectedDti.dtiRatio) * 100);

            return {
                monthsFromNow: months,
                projectedDtiPercent: projectedDti.dtiPercent,
                projectedDtiRatio: projectedDti.dtiRatio,
                dtiImprovement,
                timelineStatus: months === 6 ? 'short-term' : months === 12 ? 'mid-term' : 'long-term'
            };
        });

        return projections;
    }

    /**
     * Score debts by their "DTI efficiency" - payment reduction per month to payoff
     */
    scoreDtiEfficiency(debts = []) {
        return debts.map(debt => {
            const payoffMonths = debt.balance > 0 && debt.apr > 0
                ? Math.ceil(debt.balance / (debt.minimumPayment * 12))
                : Math.max(1, Math.ceil(debt.remainingMonths));
            
            const dtiEfficiency = debt.minimumPayment / Math.max(1, payoffMonths);
            
            return {
                debtId: debt.id,
                debtName: debt.name,
                monthlyPayment: debt.minimumPayment,
                estimatedPayoffMonths: payoffMonths,
                dtiEfficiencyScore: roundPercent(dtiEfficiency),
                efficiency: dtiEfficiency > 500 ? 'high' : dtiEfficiency > 250 ? 'medium' : 'low'
            };
        }).sort((a, b) => b.dtiEfficiencyScore - a.dtiEfficiencyScore);
    }

    /**
     * Analyze loan eligibility at current DTI vs target DTI
     */
    analyzeLoanEligibility(currentDtiRatio = 0, loanProducts = ['conventional-mortgage']) {
        return loanProducts.map(product => {
            const threshold = DTI_THRESHOLDS[product] || DTI_THRESHOLDS['conventional-mortgage'];
            const currentPercent = roundPercent(currentDtiRatio * 100);
            const isEligible = currentPercent <= threshold.targetDti * 100;
            const improvementNeeded = Math.max(0, roundPercent((currentPercent - threshold.targetDti * 100)));

            return {
                product,
                targetDti: `${roundPercent(threshold.targetDti * 100)}%`,
                idealDti: `${roundPercent(threshold.idealDti * 100)}%`,
                currentDti: `${currentPercent}%`,
                eligible: isEligible,
                improvementNeeded: `${improvementNeeded}%`,
                description: threshold.description
            };
        });
    }

    /**
     * Main method: Full DTI optimization analysis
     */
    async optimize(userId, debts = [], grossMonthlyIncome = 0, options = {}) {
        try {
            if (!userId || debts.length === 0) {
                return {
                    success: false,
                    message: 'User ID and debts array required',
                    optimization: null
                };
            }

            if (grossMonthlyIncome === 0) {
                return {
                    success: false,
                    message: 'Gross monthly income required and must be positive',
                    optimization: null
                };
            }

            const normalizedDebts = debts.map(normalizeDebt);
            const targetDtiPercent = Math.max(10, Math.min(50, toNumber(options.targetDtiPercent, 36)));
            const loanProducts = Array.isArray(options.loanProducts) ? options.loanProducts : ['conventional-mortgage'];
            const projectionMonths = Array.isArray(options.projectionMonths) ? options.projectionMonths : [6, 12, 24];

            // Current DTI analysis
            const currentDti = this.calculateCurrentDti(normalizedDebts, grossMonthlyIncome);

            // Debt ranking by DTI impact
            const debtImpactRanking = this.rankDebtsByDtiImpact(normalizedDebts, currentDti, grossMonthlyIncome);

            // DTI efficiency scoring
            const dtiEfficiency = this.scoreDtiEfficiency(normalizedDebts);

            // Optimal payoff paths
            const payoffPaths = this.generatePayoffPaths(normalizedDebts, grossMonthlyIncome, targetDtiPercent);

            // DTI projections over time
            const dtiProjections = this.projectDtiOverTime(normalizedDebts, grossMonthlyIncome, projectionMonths);

            // Loan eligibility analysis
            const loanEligibility = this.analyzeLoanEligibility(currentDti.dtiRatio / 100, loanProducts);

            // Determine recommendation
            const recommendation = this.selectOptimalPath(payoffPaths, currentDti, targetDtiPercent);

            return {
                success: true,
                optimization: {
                    userId,
                    optimizationDate: new Date().toISOString(),
                    currentDtiAnalysis: currentDti,
                    targetDtiPercent,
                    debtImpactRanking,
                    dtiEfficiencyScoring: dtiEfficiency,
                    payoffPaths,
                    dtiProjections,
                    loanEligibilityAnalysis: loanEligibility,
                    recommendation: {
                        optimalPath: recommendation.name,
                        strategy: recommendation.strategy,
                        debtSequence: recommendation.debtSequence,
                        estimatedMonthsToTarget: recommendation.timeToTargetDti,
                        projectedDtiReduction: recommendation.projectedDtiReduction,
                        reasoning: this.explainRecommendation(recommendation, currentDti)
                    }
                },
                message: 'DTI optimization analysis complete'
            };
        } catch (error) {
            return {
                success: false,
                message: `Optimization failed: ${error.message}`,
                optimization: null
            };
        }
    }

    /**
     * Select optimal payoff path based on current DTI and target
     */
    selectOptimalPath(paths = [], currentDti, targetDtiPercent) {
        const currentPercent = roundPercent(currentDti.dtiRatio * 100);
        
        // If already at target, recommend moderate (preserve flexibility)
        if (currentPercent <= targetDtiPercent) {
            return paths.find(p => p.name === 'Moderate') || paths[1];
        }

        // If significantly above target (>45%), recommend aggressive
        if (currentPercent > 45) {
            return paths.find(p => p.name === 'Aggressive') || paths[0];
        }

        // Otherwise balanced
        return paths.find(p => p.name === 'Balanced') || paths[1];
    }

    /**
     * Generate human-readable explanation of recommendation
     */
    explainRecommendation(recommendation, currentDti) {
        const safetyMargin = 5; // DTI points
        const targetPlus = (currentDti.dtiRatio * 100) + safetyMargin;

        if (recommendation.name === 'Aggressive') {
            return `Your DTI is elevated at ${currentDti.dtiPercent}. Aggressive payoff recommended to reach healthy levels quickly. Focus on eliminating highest-impact debts first.`;
        } else if (recommendation.name === 'Balanced') {
            return `Your DTI is moderate at ${currentDti.dtiPercent}. Balanced approach balances debt reduction with flexibility for unexpected expenses.`;
        } else {
            return `Your DTI is manageable at ${currentDti.dtiPercent}. Conservative approach maintains emergency buffer while gradually improving your credit profile.`;
        }
    }
}

export default new DtiRatioOptimizerService();
