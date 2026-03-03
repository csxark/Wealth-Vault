import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Income tier categories
const INCOME_TIERS = {
    'base': { name: 'Base Income', frequency: 'monthly', stability: 'high', description: 'Regular salary or recurring income' },
    'bonus': { name: 'Bonus Income', frequency: 'periodic', stability: 'medium', description: 'Annual bonus, performance bonus, or lump-sum payments' },
    'sidegig': { name: 'Side Gig Income', frequency: 'variable', stability: 'low', description: 'Freelance, gig work, or side business income' },
    'seasonal': { name: 'Seasonal Income', frequency: 'seasonal', stability: 'medium', description: 'Income that varies by season (e.g., tax prep, holiday retail)' },
    'windfalls': { name: 'Windfalls', frequency: 'irregular', stability: 'very-low', description: 'Unexpected income (tax refunds, inheritance, gifts)' }
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPercent = (value) => Math.round(value * 10000) / 100;

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    type: debt.type || 'personal-loan',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0))
});

class IncomeBasedPaymentFlexibilityService {
    /**
     * Define and normalize income tiers
     */
    defineIncomeTiers(rawTiers = {}) {
        const tiers = {
            base: {
                amount: Math.max(0, toNumber(rawTiers.base?.amount, 0)),
                frequency: 'monthly',
                variability: 0, // No variability for base income
                ...INCOME_TIERS['base']
            },
            bonus: {
                amount: Math.max(0, toNumber(rawTiers.bonus?.amount, 0)),
                frequency: toNumber(rawTiers.bonus?.frequencyMonths, 12), // Default annual
                probabilityPercent: clamp(toNumber(rawTiers.bonus?.probabilityPercent, 80), 0, 100),
                variability: 0.2, // 20% variability in bonus amounts
                ...INCOME_TIERS['bonus']
            },
            sidegig: {
                monthlyAverage: Math.max(0, toNumber(rawTiers.sidegig?.monthlyAverage, 0)),
                monthlyMin: Math.max(0, toNumber(rawTiers.sidegig?.monthlyMin, 0)),
                monthlyMax: Math.max(0, toNumber(rawTiers.sidegig?.monthlyMax, 0)),
                frequency: 'variable',
                variability: 0.5, // 50% variability
                ...INCOME_TIERS['sidegig']
            },
            seasonal: {
                baseMonthly: Math.max(0, toNumber(rawTiers.seasonal?.baseMonthly, 0)),
                peakMonths: Array.isArray(rawTiers.seasonal?.peakMonths) ? rawTiers.seasonal.peakMonths : [],
                peakMultiplier: clamp(toNumber(rawTiers.seasonal?.peakMultiplier, 1.5), 1, 3),
                frequency: 'seasonal',
                variability: 0.4,
                ...INCOME_TIERS['seasonal']
            },
            windfalls: {
                expectedAnnually: Math.max(0, toNumber(rawTiers.windfalls?.expectedAnnually, 0)),
                frequency: 'irregular',
                probabilityPercent: clamp(toNumber(rawTiers.windfalls?.probabilityPercent, 50), 0, 100),
                variability: 1.0, // Highly variable
                ...INCOME_TIERS['windfalls']
            }
        };

        return tiers;
    }

    /**
     * Calculate monthly cash flow in different scenarios
     */
    calculateMonthlyScenarios(tiers = {}, month = 1) {
        // Scenario 1: Conservative (only base income)
        const conservative = tiers.base?.amount || 0;

        // Scenario 2: Expected (average variable income)
        let expected = conservative;
        if (tiers.bonus?.amount && month % tiers.bonus.frequencyMonths === 0) {
            expected += tiers.bonus.amount;
        }
        if (tiers.sidegig?.monthlyAverage) {
            expected += tiers.sidegig.monthlyAverage;
        }
        if (tiers.seasonal?.peakMonths?.includes(month)) {
            expected += roundMoney(tiers.seasonal.baseMonthly * tiers.seasonal.peakMultiplier);
        } else if (tiers.seasonal?.baseMonthly) {
            expected += tiers.seasonal.baseMonthly;
        }

        // Scenario 3: Optimistic (max variable income)
        let optimistic = conservative;
        if (tiers.bonus?.amount && month % tiers.bonus.frequencyMonths === 0) {
            optimistic += roundMoney(tiers.bonus.amount * (1 + tiers.bonus.variability));
        }
        if (tiers.sidegig?.monthlyMax) {
            optimistic += tiers.sidegig.monthlyMax;
        }
        if (tiers.seasonal?.peakMonths?.includes(month)) {
            optimistic += roundMoney(tiers.seasonal.baseMonthly * tiers.seasonal.peakMultiplier);
        } else if (tiers.seasonal?.baseMonthly) {
            optimistic += tiers.seasonal.baseMonthly;
        }
        if (tiers.windfalls?.expectedAnnually && month === 1) {
            optimistic += roundMoney(tiers.windfalls.expectedAnnually / 12);
        }

        return {
            month,
            conservativeIncome: roundMoney(conservative),
            expectedIncome: roundMoney(expected),
            optimisticIncome: roundMoney(optimistic),
            incomeRange: roundMoney(optimistic - conservative)
        };
    }

    /**
     * Generate adaptive payment schedule
     * Suggests minimum in low-income months, extra in high-income months
     */
    generateAdaptivePaymentSchedule(debts = [], monthlyExpenses = 0, tiers = {}, horizonMonths = 60) {
        const minCashBuffer = 500;
        let schedule = [];
        let totalPayoffMonths = 0;
        let projectedPayoffMonths = horizonMonths;

        for (let month = 1; month <= horizonMonths; month++) {
            const scenarios = this.calculateMonthlyScenarios(tiers, month);
            
            // Available for debt payment after expenses and buffer
            const availableConservative = Math.max(0, scenarios.conservativeIncome - monthlyExpenses - minCashBuffer);
            const availableExpected = Math.max(0, scenarios.expectedIncome - monthlyExpenses - minCashBuffer);
            const availableOptimistic = Math.max(0, scenarios.optimisticIncome - monthlyExpenses - minCashBuffer);

            // Suggested payment tiers
            const minimumPayment = roundMoney(debts.reduce((sum, d) => sum + d.minimumPayment, 0));
            const recommendedPayment = roundMoney(minimumPayment + (availableExpected * 0.3)); // 30% extra
            const aggressivePayment = Math.max(recommendedPayment, roundMoney(minimumPayment + availableOptimistic * 0.5)); // 50% extra

            schedule.push({
                month,
                incomeScenarios: scenarios,
                availableForDebtPayment: {
                    conservative: availableConservative,
                    expected: availableExpected,
                    optimistic: availableOptimistic
                },
                suggestedPaymentTiers: {
                    minimumOnly: minimumPayment,
                    recommended: recommendedPayment,
                    aggressive: aggressivePayment
                },
                guidedByIncome: this.guidanceByIncomeLevel(availableExpected, minimumPayment),
                recommendation: this.selectPaymentTier(availableExpected, minimumPayment, month, horizonMonths)
            });

            totalPayoffMonths++;
        }

        // Calculate payoff acceleration from flexible income strategy
        const baselinePayoff = this.estimatePayoffMonths(roundMoney(debts.reduce((sum, d) => sum + d.minimumPayment, 0) + (tiers.base?.amount - monthlyExpenses) * 0.3), debts);
        const flexiblePayoff = totalPayoffMonths;
        const accelerationMonths = Math.max(0, baselinePayoff - flexiblePayoff);

        return {
            schedule: schedule.slice(0, Math.min(12, horizonMonths)), // Return first 12 months
            fullScheduleMonths: horizonMonths,
            totalDebtPayment: roundMoney(schedule.reduce((sum, s) => sum + s.suggestedPaymentTiers.recommended, 0)),
            payoffAcceleration: {
                baselinePayoffMonths: baselinePayoff,
                flexiblePayoffMonths: flexiblePayoff,
                acceleratedMonths: accelerationMonths,
                percentFaster: accelerationMonths > 0 ? roundPercent((accelerationMonths / baselinePayoff) * 100) : 0
            }
        };
    }

    /**
     * Provide guidance based on available income vs. minimum payment
     */
    guidanceByIncomeLevel(available = 0, minimumPayment = 0) {
        const ratio = minimumPayment > 0 ? available / minimumPayment : 0;

        if (ratio < 0) {
            return { level: 'critical', message: 'Income insufficient to cover minimum payments; consider hardship program' };
        }
        if (ratio < 0.25) {
            return { level: 'tight', message: 'Limited funds above minimums; pay only minimum to preserve buffer' };
        }
        if (ratio < 0.75) {
            return { level: 'moderate', message: 'Moderate extra capacity; add 20-30% to minimums when possible' };
        }
        if (ratio < 1.5) {
            return { level: 'healthy', message: 'Healthy cash flow; add 40-50% to minimums, accelerate payoff' };
        }
        return { level: 'abundant', message: 'Strong cash flow; aggressive extra payments recommended' };
    }

    /**
     * Select optimal payment tier based on guidance
     */
    selectPaymentTier(available = 0, minimumPayment = 0, month, horizonMonths) {
        const guidance = this.guidanceByIncomeLevel(available, minimumPayment);
        
        if (guidance.level === 'critical' || guidance.level === 'tight') {
            return { tier: 'minimumOnly', reason: 'Income tight; preserve emergency buffer' };
        }
        if (guidance.level === 'moderate') {
            return { tier: 'recommended', reason: 'Balanced approach; build extra payments without stress' };
        }
        if (guidance.level === 'healthy') {
            return { tier: 'aggressive', reason: 'Strong cash flow; accelerate payoff' };
        }
        return { tier: 'aggressive', reason: 'Abundant income; maximize debt elimination' };
    }

    /**
     * Estimate payoff months from fixed monthly payment
     */
    estimatePayoffMonths(monthlyPayment = 0, debts = []) {
        if (monthlyPayment === 0) return 999;
        
        let totalBalance = debts.reduce((sum, d) => sum + d.balance, 0);
        let avgApr = debts.length > 0 
            ? debts.reduce((sum, d) => sum + d.apr, 0) / debts.length 
            : 0;
        
        // Simple estimation: (balance / payment) months, adjusted for interest
        const monthlyRate = avgApr / 12;
        let months = 0;
        let remaining = totalBalance;

        for (let i = 0; i < 600; i++) {
            if (remaining <= 0) break;
            const interest = remaining * monthlyRate;
            remaining = remaining + interest - monthlyPayment;
            months++;
        }

        return months;
    }

    /**
     * Model payoff scenarios: conservative, expected, optimistic
     */
    modelPayoffScenarios(debts = [], monthlyExpenses = 0, tiers = {}, horizonMonths = 60) {
        const scenarios = {
            conservative: { totalPayment: 0, payoffMonths: 0, description: 'Base income only, minimum payments' },
            expected: { totalPayment: 0, payoffMonths: 0, description: 'Average variable income, flexible payments' },
            optimistic: { totalPayment: 0, payoffMonths: 0, description: 'Max variable income, aggressive payments' }
        };

        let conservativeBalance = debts.reduce((sum, d) => sum + d.balance, 0);
        let expectedBalance = debts.reduce((sum, d) => sum + d.balance, 0);
        let optimisticBalance = debts.reduce((sum, d) => sum + d.balance, 0);

        const minimumPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
        const avgApr = debts.length > 0 ? debts.reduce((sum, d) => sum + d.apr, 0) / debts.length : 0;

        for (let month = 1; month <= horizonMonths; month++) {
            const incomeScenarios = this.calculateMonthlyScenarios(tiers, month);
            const monthlyRate = avgApr / 12;

            // Conservative scenario: minimum payments only
            const conservativePayment = minimumPayment;
            const conservativeInterest = conservativeBalance * monthlyRate;
            conservativeBalance = Math.max(0, conservativeBalance + conservativeInterest - conservativePayment);
            scenarios.conservative.totalPayment += conservativePayment;
            if (conservativeBalance === 0 && scenarios.conservative.payoffMonths === 0) {
                scenarios.conservative.payoffMonths = month;
            }

            // Expected scenario: minimum + 30% of available
            const expectedAvailable = Math.max(0, incomeScenarios.expectedIncome - monthlyExpenses - 500);
            const expectedPayment = roundMoney(minimumPayment + expectedAvailable * 0.3);
            const expectedInterest = expectedBalance * monthlyRate;
            expectedBalance = Math.max(0, expectedBalance + expectedInterest - expectedPayment);
            scenarios.expected.totalPayment += expectedPayment;
            if (expectedBalance === 0 && scenarios.expected.payoffMonths === 0) {
                scenarios.expected.payoffMonths = month;
            }

            // Optimistic scenario: minimum + 50% of available
            const optimisticAvailable = Math.max(0, incomeScenarios.optimisticIncome - monthlyExpenses - 500);
            const optimisticPayment = roundMoney(minimumPayment + optimisticAvailable * 0.5);
            const optimisticInterest = optimisticBalance * monthlyRate;
            optimisticBalance = Math.max(0, optimisticBalance + optimisticInterest - optimisticPayment);
            scenarios.optimistic.totalPayment += optimisticPayment;
            if (optimisticBalance === 0 && scenarios.optimistic.payoffMonths === 0) {
                scenarios.optimistic.payoffMonths = month;
            }
        }

        return {
            conservative: {
                ...scenarios.conservative,
                totalPayment: roundMoney(scenarios.conservative.totalPayment),
                remaining: roundMoney(conservativeBalance)
            },
            expected: {
                ...scenarios.expected,
                totalPayment: roundMoney(scenarios.expected.totalPayment),
                remaining: roundMoney(expectedBalance)
            },
            optimistic: {
                ...scenarios.optimistic,
                totalPayment: roundMoney(scenarios.optimistic.totalPayment),
                remaining: roundMoney(optimisticBalance)
            },
            acceleration: {
                monthsSaved: Math.max(0, scenarios.conservative.payoffMonths - scenarios.expected.payoffMonths),
                interestSaved: Math.max(0, (scenarios.conservative.totalPayment - scenarios.expected.totalPayment) * 0.15) // Rough estimate
            }
        };
    }

    /**
     * Main method: Generate full flexible payment plan
     */
    async optimize(userId, debts = [], monthlyExpenses = 0, rawTiers = {}, options = {}) {
        try {
            if (!userId || debts.length === 0) {
                return {
                    success: false,
                    message: 'User ID and debts array required',
                    optimization: null
                };
            }

            const normalizedDebts = debts.map(normalizeDebt);
            const tiers = this.defineIncomeTiers(rawTiers);
            const horizonMonths = Math.min(60, Math.max(6, toNumber(options.horizonMonths, 24)));

            // Generate adaptive payment schedule
            const schedule = this.generateAdaptivePaymentSchedule(
                normalizedDebts,
                monthlyExpenses,
                tiers,
                horizonMonths
            );

            // Model payoff scenarios
            const scenarios = this.modelPayoffScenarios(
                normalizedDebts,
                monthlyExpenses,
                tiers,
                horizonMonths
            );

            return {
                success: true,
                optimization: {
                    userId,
                    optimizationDate: new Date().toISOString(),
                    incomeProfile: {
                        baseMonthly: tiers.base?.amount || 0,
                        bonusInfo: tiers.bonus ? { amount: tiers.bonus.amount, frequencyMonths: tiers.bonus.frequencyMonths, probability: `${tiers.bonus.probabilityPercent}%` } : null,
                        sidegigAverage: tiers.sidegig?.monthlyAverage || 0,
                        seasonalInfo: tiers.seasonal ? { baseMonthly: tiers.seasonal.baseMonthly, peakMonths: tiers.seasonal.peakMonths, peakMultiplier: tiers.seasonal.peakMultiplier } : null,
                        windfalExpected: tiers.windfalls?.expectedAnnually || 0,
                        totalExpectedMonthly: roundMoney(
                            (tiers.base?.amount || 0) + 
                            (tiers.sidegig?.monthlyAverage || 0) + 
                            (tiers.seasonal?.baseMonthly || 0) +
                            ((tiers.bonus?.amount || 0) / (tiers.bonus?.frequencyMonths || 12)) +
                            ((tiers.windfalls?.expectedAnnually || 0) / 12)
                        )
                    },
                    monthlyExpenses: roundMoney(monthlyExpenses),
                    adaptivePaymentSchedule: schedule,
                    payoffScenarios: scenarios,
                    recommendation: {
                        strategy: 'Income-Flexible Payoff',
                        approach: 'Adjust payments based on actual monthly income; prioritize building emergency buffer in lean months',
                        expectedPayoffMonths: scenarios.expected.payoffMonths || horizonMonths,
                        accelerationPotential: scenarios.acceleration.monthsSaved,
                        guidanceText: this.generateGuidanceText(scenarios, schedule)
                    }
                },
                message: 'Income-based payment flexibility analysis complete'
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
     * Generate human-readable guidance
     */
    generateGuidanceText(scenarios, schedule) {
        const payoffMonthsExpected = scenarios.expected.payoffMonths || 60;
        const acceleration = scenarios.acceleration.monthsSaved || 0;

        let text = `With flexible income strategy, you can pay off debts in ~${payoffMonthsExpected} months. `;
        
        if (acceleration > 0) {
            text += `By taking advantage of high-income months, you could accelerate payoff by ${acceleration} months. `;
        }

        text += `In tight months, stick to minimum payments to protect your emergency buffer. `;
        text += `In strong income months, allocate extra earnings to debt elimination. `;
        text += `This approach balances debt reduction with financial stability.`;

        return text;
    }
}

export default new IncomeBasedPaymentFlexibilityService();
