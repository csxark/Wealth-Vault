import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const DEFAULT_MARGINAL_TAX_RATE = 0.24; // 24% federal bracket
const DEFAULT_STUDENT_LOAN_DEDUCTION_CAP = 2500; // per IRS
const DEFAULT_401K_CONTRIBUTION_LIMIT = 23500; // 2024
const DEFAULT_IRA_CONTRIBUTION_LIMIT = 7000; // 2024
const DEFAULT_HSA_CONTRIBUTION_LIMIT = 4150; // 2024 individual

// Deductibility mapping for debt types
const DEBT_DEDUCTIBILITY = {
    'mortgage': { deductible: true, rate: 1.0, description: 'Mortgage interest fully deductible' },
    'student-loan': { deductible: true, rate: 0.5, description: 'Student loan interest partially deductible (up to $2,500/year)' },
    'heloc': { deductible: true, rate: 0.8, description: 'HELOC interest deductible (if used for home improvement)' },
    'credit-card': { deductible: false, rate: 0, description: 'Credit card interest not deductible' },
    'auto-loan': { deductible: false, rate: 0, description: 'Auto loan interest not deductible' },
    'personal-loan': { deductible: false, rate: 0, description: 'Personal loan interest not deductible' },
    'medical': { deductible: false, rate: 0, description: 'Medical debt interest not deductible' }
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    type: debt.type || 'personal-loan',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0))
});

class TaxEfficientDebtCoordinatorService {
    /**
     * Calculate monthly interest charge for a debt
     */
    calculateMonthlyInterest(balance, apr) {
        const monthlyRate = apr / 12;
        return roundMoney(balance * monthlyRate);
    }

    /**
     * Calculate after-tax cost of debt interest
     * Takes into account tax deductibility and marginal rate
     */
    calculateAfterTaxDebtCost(debt, marginaltaxRate = DEFAULT_MARGINAL_TAX_RATE) {
        const deductibilityInfo = DEBT_DEDUCTIBILITY[debt.type] || DEBT_DEDUCTIBILITY['personal-loan'];
        const monthlyInterest = this.calculateMonthlyInterest(debt.balance, debt.apr);
        
        const deductiblePortion = deductibilityInfo.deductible ? deductibilityInfo.rate : 0;
        const taxBenefit = roundMoney(monthlyInterest * deductiblePortion * marginaltaxRate);
        const afterTaxCost = roundMoney(monthlyInterest - taxBenefit);

        return {
            debtId: debt.id,
            debtName: debt.name,
            debtType: debt.type,
            monthlyInterest,
            deductiblePortion: roundMoney(deductiblePortion * 100),
            taxBenefit,
            afterTaxCost,
            deductibilityStatus: deductibilityInfo.description,
            effectiveCostRatio: debt.apr > 0 ? roundMoney((afterTaxCost / monthlyInterest) * 100) : 100
        };
    }

    /**
     * Calculate after-tax return of retirement/savings options
     */
    calculateSavingsReturn(savingsOption = {}, monthlyContribution = 0, marginalTaxRate = DEFAULT_MARGINAL_TAX_RATE) {
        const optionType = savingsOption.type || 'none';
        const employerMatch = toNumber(savingsOption.employerMatch, 0); // per $ contributed
        const fundedBalance = toNumber(savingsOption.fundedBalance, 0);
        const contributionLimit = toNumber(savingsOption.contributionLimit, 0);
        const estimatedReturn = toNumber(savingsOption.estimatedReturn, 0.07); // 7% annual default

        if (monthlyContribution === 0) {
            return {
                optionType,
                monthlyContribution: 0,
                employerMatch: 0,
                taxDeductionBenefit: 0,
                estimatedGrowth: 0,
                totalMonthlyValue: 0,
                priority: 'none'
            };
        }

        // Employer match is "free money" (100% immediate return)
        const employerMatchAmount = roundMoney(monthlyContribution * employerMatch);

        // Tax deduction benefit (traditional 401k, IRA, HSA)
        const isTaxDeferred = ['401k', 'traditional-ira', 'hsa'].includes(optionType);
        const taxDeductionBenefit = isTaxDeferred ? roundMoney(monthlyContribution * marginalTaxRate) : 0;

        // Estimated growth on employee contribution (0.583% monthly for 7% annual)
        const monthlyGrowthRate = Math.pow(1 + estimatedReturn, 1/12) - 1;
        const estimatedGrowth = roundMoney(monthlyContribution * monthlyGrowthRate);

        // Total monthly value = contribution + match + tax benefit + growth
        const totalMonthlyValue = roundMoney(employerMatchAmount + taxDeductionBenefit + estimatedGrowth);

        return {
            optionType,
            monthlyContribution,
            employerMatch: employerMatchAmount,
            taxDeductionBenefit,
            estimatedGrowth,
            totalMonthlyValue,
            priority: employerMatch > 0 ? 'high' : 'medium'
        };
    }

    /**
     * Run scenario: Max employer match first, then debt payoff
     */
    scenarioMaxMatchFirst(monthlySurplus = 0, debts = [], savingsOptions = [], marginaltaxRate = DEFAULT_MARGINAL_TAX_RATE) {
        let allocations = { debts: {}, savings: {}, unallocated: monthlySurplus };

        // Step 1: Allocate to 401k up to employer match
        const match401k = savingsOptions.find(s => s.type === '401k') || {};
        if (match401k.employerMatch && match401k.employerMatch > 0) {
            // To maximize match, calculate required contribution
            const matchedContribution = Math.min(
                monthlySurplus,
                toNumber(match401k.matchCap, monthlySurplus) // Many plans cap match at 5-6%
            );
            allocations.savings['401k'] = {
                contribution: roundMoney(matchedContribution),
                matchedAmount: roundMoney(matchedContribution * match401k.employerMatch),
                reason: 'Max employer match (100% immediate return)'
            };
            allocations.unallocated = roundMoney(allocations.unallocated - matchedContribution);
        }

        // Step 2: Allocate remaining to highest after-tax-cost debt (avalanche priority)
        const debtsByAfterTaxCost = debts
            .map(d => ({
                ...d,
                afterTaxCost: this.calculateAfterTaxDebtCost(d, marginaltaxRate)
            }))
            .sort((a, b) => b.afterTaxCost.afterTaxCost - a.afterTaxCost.afterTaxCost);

        if (debtsByAfterTaxCost.length > 0 && allocations.unallocated > 0) {
            const targetDebt = debtsByAfterTaxCost[0];
            const extraPayment = Math.min(allocations.unallocated, allocations.unallocated);
            allocations.debts[targetDebt.id] = {
                debtName: targetDebt.name,
                extraPayment: roundMoney(extraPayment),
                totalPayment: roundMoney(targetDebt.minimumPayment + extraPayment),
                reason: 'Highest after-tax cost debt'
            };
            allocations.unallocated = 0;
        }

        return {
            scenario: 'Max Match First',
            allocations,
            rationale: 'Prioritize employer match, then attack high-interest debt'
        };
    }

    /**
     * Run scenario: Max debt payoff first, then remaining to match
     */
    scenarioMaxDebtFirst(monthlySurplus = 0, debts = [], savingsOptions = [], marginaltaxRate = DEFAULT_MARGINAL_TAX_RATE) {
        let allocations = { debts: {}, savings: {}, unallocated: monthlySurplus };

        // Step 1: Allocate to highest after-tax-cost debt
        const debtsByAfterTaxCost = debts
            .map(d => ({
                ...d,
                afterTaxCost: this.calculateAfterTaxDebtCost(d, marginaltaxRate)
            }))
            .sort((a, b) => b.afterTaxCost.afterTaxCost - a.afterTaxCost.afterTaxCost);

        if (debtsByAfterTaxCost.length > 0 && allocations.unallocated > 0) {
            const targetDebt = debtsByAfterTaxCost[0];
            const extraPayment = Math.min(allocations.unallocated, allocations.unallocated);
            allocations.debts[targetDebt.id] = {
                debtName: targetDebt.name,
                extraPayment: roundMoney(extraPayment),
                totalPayment: roundMoney(targetDebt.minimumPayment + extraPayment),
                reason: 'Highest after-tax cost debt first'
            };
            allocations.unallocated = 0;
        }

        // Step 2: After debt, allocate to employer match
        const match401k = savingsOptions.find(s => s.type === '401k') || {};
        if (match401k.employerMatch && match401k.employerMatch > 0 && allocations.unallocated > 0) {
            const matchedContribution = Math.min(allocations.unallocated, toNumber(match401k.matchCap, allocations.unallocated));
            allocations.savings['401k'] = {
                contribution: roundMoney(matchedContribution),
                matchedAmount: roundMoney(matchedContribution * match401k.employerMatch),
                reason: 'Employer match (after debt payoff)'
            };
            allocations.unallocated = roundMoney(allocations.unallocated - matchedContribution);
        }

        return {
            scenario: 'Max Debt First',
            allocations,
            rationale: 'Attack high-interest debt, then capture employer match'
        };
    }

    /**
     * Run scenario: Blended approach (balanced allocation)
     */
    scenarioBlended(monthlySurplus = 0, debts = [], savingsOptions = [], marginaltaxRate = DEFAULT_MARGINAL_TAX_RATE) {
        let allocations = { debts: {}, savings: {}, unallocated: monthlySurplus };

        // Allocate 50% to match, 50% to debt
        const match401k = savingsOptions.find(s => s.type === '401k') || {};
        if (match401k.employerMatch && match401k.employerMatch > 0) {
            const matchContrib = roundMoney(monthlySurplus * 0.5);
            allocations.savings['401k'] = {
                contribution: roundMoney(Math.min(matchContrib, toNumber(match401k.matchCap, matchContrib))),
                matchedAmount: roundMoney(Math.min(matchContrib, toNumber(match401k.matchCap, matchContrib)) * match401k.employerMatch),
                reason: 'Blended: 50% to match'
            };
            allocations.unallocated = roundMoney(monthlySurplus * 0.5);
        }

        // 50% to debt payoff
        const debtsByAfterTaxCost = debts
            .map(d => ({
                ...d,
                afterTaxCost: this.calculateAfterTaxDebtCost(d, marginaltaxRate)
            }))
            .sort((a, b) => b.afterTaxCost.afterTaxCost - a.afterTaxCost.afterTaxCost);

        if (debtsByAfterTaxCost.length > 0 && allocations.unallocated > 0) {
            const targetDebt = debtsByAfterTaxCost[0];
            const extraPayment = allocations.unallocated;
            allocations.debts[targetDebt.id] = {
                debtName: targetDebt.name,
                extraPayment: roundMoney(extraPayment),
                totalPayment: roundMoney(targetDebt.minimumPayment + extraPayment),
                reason: 'Blended: 50% to debt'
            };
            allocations.unallocated = 0;
        }

        return {
            scenario: 'Blended',
            allocations,
            rationale: 'Balance between capturing match and reducing high-interest debt'
        };
    }

    /**
     * Project year-end outcomes for a scenario
     */
    projectYearEnd(scenario, debts = [], marginaltaxRate = DEFAULT_MARGINAL_TAX_RATE) {
        const { allocations } = scenario;
        
        // Debt projections
        let projectedDebtReduction = 0;
        Object.keys(allocations.debts || {}).forEach(debtId => {
            const alloc = allocations.debts[debtId];
            projectedDebtReduction += roundMoney(alloc.extraPayment * 12);
        });

        // Savings projections
        let projectedSavingsGrowth = 0;
        let projectedEmployerMatch = 0;
        let projectedTaxBenefit = 0;
        Object.keys(allocations.savings || {}).forEach(savingType => {
            const alloc = allocations.savings[savingType];
            projectedEmployerMatch += roundMoney(alloc.matchedAmount * 12);
            // Tax benefit on contribution
            const isTaxDeferred = ['401k', 'traditional-ira', 'hsa'].includes(savingType);
            if (isTaxDeferred) {
                projectedTaxBenefit += roundMoney(alloc.contribution * 12 * marginaltaxRate);
            }
            // Growth estimate: 7% annual
            projectedSavingsGrowth += roundMoney((alloc.contribution * 12) * 0.07);
        });

        return {
            scenario: scenario.scenario,
            projectedDebtReduction,
            projectedSavingsGrowth,
            projectedEmployerMatch,
            projectedTaxBenefit,
            projectedNetWorth: roundMoney(projectedEmployerMatch + projectedSavingsGrowth + projectedTaxBenefit - projectedDebtReduction) // Net benefit
        };
    }

    /**
     * Main method: Optimize tax-efficient allocation across debts and savings
     */
    async optimize(userId, payload = {}) {
        try {
            if (!userId) {
                return {
                    success: false,
                    message: 'User ID required',
                    optimization: null
                };
            }

            const debts = (payload.debts || []).map(normalizeDebt);
            const monthlySurplus = Math.max(0, toNumber(payload.monthlySurplus, 0));
            const marginaltaxRate = clamp(toNumber(payload.marginaltaxRate, DEFAULT_MARGINAL_TAX_RATE), 0, 0.45);
            const savingsOptions = payload.savingsOptions || [];

            if (debts.length === 0 || monthlySurplus === 0) {
                return {
                    success: false,
                    message: 'Debts and monthly surplus required',
                    optimization: null
                };
            }

            // Calculate after-tax cost of each debt
            const debtCostAnalysis = debts.map(d => this.calculateAfterTaxDebtCost(d, marginaltaxRate));

            // Run three scenarios
            const scenario1 = this.scenarioMaxMatchFirst(monthlySurplus, debts, savingsOptions, marginaltaxRate);
            const scenario2 = this.scenarioMaxDebtFirst(monthlySurplus, debts, savingsOptions, marginaltaxRate);
            const scenario3 = this.scenarioBlended(monthlySurplus, debts, savingsOptions, marginaltaxRate);

            // Project year-end outcomes
            const projections = [
                this.projectYearEnd(scenario1, debts, marginaltaxRate),
                this.projectYearEnd(scenario2, debts, marginaltaxRate),
                this.projectYearEnd(scenario3, debts, marginaltaxRate)
            ];

            // Determine recommendation (highest net benefit)
            const recommendation = projections.reduce((best, current) => 
                current.projectedNetWorth > best.projectedNetWorth ? current : best
            );

            return {
                success: true,
                optimization: {
                    userId,
                    optimizationDate: new Date().toISOString(),
                    userProfile: {
                        marginaltaxRate: roundMoney(marginaltaxRate * 100),
                        monthlySurplus,
                        annualSurplus: roundMoney(monthlySurplus * 12),
                        debtCount: debts.length,
                        savingsOptionsCount: savingsOptions.length
                    },
                    debtCostAnalysis,
                    scenarios: [scenario1, scenario2, scenario3],
                    projections,
                    recommendedScenario: recommendation.scenario,
                    recommendation: {
                        scenario: recommendation.scenario,
                        reasoning: this.explainRecommendation(recommendation, projections),
                        yearEndImpact: {
                            debtReduction: recommendation.projectedDebtReduction,
                            savingsGrowth: recommendation.projectedSavingsGrowth,
                            employerMatch: recommendation.projectedEmployerMatch,
                            taxBenefit: recommendation.projectedTaxBenefit,
                            netBenefit: recommendation.projectedNetWorth
                        }
                    }
                },
                message: 'Tax-efficient optimization complete'
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
     * Generate human-readable explanation of recommendation
     */
    explainRecommendation(recommendation, projections) {
        const scenarios = ['Max Match First', 'Max Debt First', 'Blended'];
        const idx = scenarios.indexOf(recommendation.scenario);
        
        let explanation = '';
        if (idx === 0) {
            explanation = 'Recommended: Capture employer match first (100% immediate return), then attack high-interest debt. This maximizes free money and provides balanced debt reduction.';
        } else if (idx === 1) {
            explanation = 'Recommended: Prioritize high-interest debt elimination. The tax savings and faster debt payoff outweigh the employer match capture in your situation.';
        } else {
            explanation = 'Recommended: Balance between capturing retirement match and debt payoff. This hedges between savings growth and interest cost reduction.';
        }

        return explanation;
    }
}

export default new TaxEfficientDebtCoordinatorService();
