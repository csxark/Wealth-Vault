// Tax Optimization Engine - AI-powered tax strategy recommendations
// Issue #641: Real-Time Tax Optimization & Deduction Tracking

import { db } from '../db/index.js';
import { 
    taxOptimizationSuggestions, 
    taxProfiles, 
    taxEstimates,
    taxAdvantagedAccounts,
    taxDeductions,
    expenses 
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import taxCalculationEngine from './taxCalculationEngine.js';

class TaxOptimizationEngine {
    constructor() {
        // Tax-advantaged account limits (2026)
        this.accountLimits = {
            '401k': { limit: 23000, catchUp: 7500 },
            'roth_401k': { limit: 23000, catchUp: 7500 },
            'traditional_ira': { limit: 7000, catchUp: 1000 },
            'roth_ira': { limit: 7000, catchUp: 1000 },
            'hsa': { 
                individual: 4150, 
                family: 8300,
                catchUp: 1000 // Age 55+
            },
            'fsa': { limit: 3200 },
            '529': { limit: 18000 }, // Gift tax exclusion limit
        };
    }

    /**
     * Generate comprehensive tax optimization suggestions
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {array} Optimization suggestions
     */
    async generateOptimizationSuggestions(userId, taxYear = new Date().getFullYear()) {
        try {
            // Get user's tax profile
            const [profile] = await db.select()
                .from(taxProfiles)
                .where(and(
                    eq(taxProfiles.userId, userId),
                    eq(taxProfiles.taxYear, taxYear)
                ))
                .limit(1);

            if (!profile) {
                throw new Error('Tax profile not found');
            }

            // Get current tax estimate
            const estimate = await taxCalculationEngine.calculateTaxEstimate(userId, taxYear);

            const suggestions = [];

            // 1. Tax-advantaged account contributions
            const retirementSuggestions = await this.generateRetirementContributionSuggestions(
                userId, taxYear, profile, estimate
            );
            suggestions.push(...retirementSuggestions);

            // 2. Deduction timing strategies
            const timingSuggestions = await this.generateDeductionTimingSuggestions(
                userId, taxYear, profile, estimate
            );
            suggestions.push(...timingSuggestions);

            // 3. Income deferral strategies
            const incomeSuggestions = await this.generateIncomeDeferralSuggestions(
                userId, taxYear, profile, estimate
            );
            suggestions.push(...incomeSuggestions);

            // 4. Tax bracket management
            const bracketSuggestions = await this.generateBracketManagementSuggestions(
                userId, taxYear, profile, estimate
            );
            suggestions.push(...bracketSuggestions);

            // 5. Year-end tax moves
            const yearEndSuggestions = await this.generateYearEndSuggestions(
                userId, taxYear, profile, estimate
            );
            suggestions.push(...yearEndSuggestions);

            // Store suggestions in database
            for (const suggestion of suggestions) {
                await this.storeSuggestion(userId, taxYear, suggestion);
            }

            return {
                success: true,
                count: suggestions.length,
                suggestions: suggestions.sort((a, b) => b.priorityScore - a.priorityScore),
            };

        } catch (error) {
            console.error('Error generating optimization suggestions:', error);
            throw error;
        }
    }

    /**
     * Generate retirement contribution suggestions
     */
    async generateRetirementContributionSuggestions(userId, taxYear, profile, estimate) {
        const suggestions = [];

        // Get existing tax-advantaged accounts
        const accounts = await db.select()
            .from(taxAdvantagedAccounts)
            .where(and(
                eq(taxAdvantagedAccounts.userId, userId),
                eq(taxAdvantagedAccounts.taxYear, taxYear)
            ));

        for (const account of accounts) {
            const remaining = parseFloat(account.remainingContributionSpace || 0);
            
            if (remaining > 0) {
                const limit = this.accountLimits[account.accountType];
                if (!limit) continue;

                // Calculate tax savings from maxing out contribution
                const taxSavings = remaining * (parseFloat(estimate.summary.marginalTaxRate) / 100);

                suggestions.push({
                    suggestionType: 'contribution_increase',
                    category: 'retirement',
                    title: `Max out ${account.accountType.toUpperCase()} contributions`,
                    description: `You have $${remaining.toLocaleString()} remaining contribution space in your ${account.accountType.replace(/_/g, ' ')}. Contributing the maximum could save you approximately $${taxSavings.toLocaleString()} in taxes.`,
                    potentialSavings: taxSavings,
                    priorityScore: this.calculatePriorityScore(taxSavings, remaining, 'high'),
                    actionRequired: `Increase your ${account.accountType} contribution by $${remaining.toLocaleString()} before year-end`,
                    deadline: new Date(taxYear, 11, 31),
                    isTimeSensitive: true,
                    complexityLevel: 'easy',
                    requiresProfessional: false,
                    relatedAccountType: account.accountType,
                    suggestedAmount: remaining,
                    details: {
                        currentContribution: parseFloat(account.ytdContributions || 0),
                        limit: parseFloat(account.contributionLimit),
                        remaining,
                        marginalRate: estimate.summary.marginalTaxRate,
                    },
                });
            }
        }

        // Check for HSA eligibility
        if (profile.qbiEligible && !accounts.find(a => a.accountType === 'hsa')) {
            const hsaLimit = this.accountLimits.hsa.individual;
            const taxSavings = hsaLimit * (parseFloat(estimate.summary.marginalTaxRate) / 100);

            suggestions.push({
                suggestionType: 'account_setup',
                category: 'retirement',
                title: 'Open a Health Savings Account (HSA)',
                description: `An HSA offers triple tax advantages: tax-deductible contributions, tax-free growth, and tax-free withdrawals for qualified medical expenses. You could contribute up to $${hsaLimit.toLocaleString()} and save approximately $${taxSavings.toLocaleString()} in taxes.`,
                potentialSavings: taxSavings,
                priorityScore: this.calculatePriorityScore(taxSavings, hsaLimit, 'high'),
                actionRequired: 'Open an HSA account if you have a high-deductible health plan (HDHP)',
                deadline: new Date(taxYear, 11, 31),
                isTimeSensitive: true,
                complexityLevel: 'medium',
                requiresProfessional: false,
                relatedAccountType: 'hsa',
                suggestedAmount: hsaLimit,
                details: {
                    tripleAdvantage: true,
                    limit: hsaLimit,
                    requirement: 'High-deductible health plan (HDHP)',
                },
            });
        }

        return suggestions;
    }

    /**
     * Generate deduction timing suggestions
     */
    async generateDeductionTimingSuggestions(userId, taxYear, profile, estimate) {
        const suggestions = [];

        // Check if bunching itemized deductions makes sense
        const standardDeduction = taxCalculationEngine.getStandardDeduction(profile.filingStatus, taxYear);
        const currentItemized = parseFloat(estimate.details.deductions.itemized);

        if (currentItemized > standardDeduction * 0.7 && currentItemized < standardDeduction * 1.5) {
            // Bunching strategy could be beneficial
            const potentialSavings = (standardDeduction - currentItemized) * 0.5;

            suggestions.push({
                suggestionType: 'deduction_timing',
                category: 'deduction',
                title: 'Consider bunching itemized deductions',
                description: `Your itemized deductions ($${currentItemized.toLocaleString()}) are close to the standard deduction ($${standardDeduction.toLocaleString()}). Consider "bunching" deductions by paying two years of charitable donations or property taxes in one year, then taking the standard deduction next year.`,
                potentialSavings,
                priorityScore: this.calculatePriorityScore(potentialSavings, currentItemized, 'medium'),
                actionRequired: 'Review opportunities to accelerate or defer deductible expenses',
                deadline: new Date(taxYear, 11, 31),
                isTimeSensitive: true,
                complexityLevel: 'medium',
                requiresProfessional: false,
                suggestedAmount: null,
                details: {
                    currentItemized,
                    standardDeduction,
                    difference: standardDeduction - currentItemized,
                    strategy: 'bunching',
                },
            });
        }

        // Year-end expense acceleration
        const monthsRemaining = 12 - new Date().getMonth();
        if (monthsRemaining <= 3 && profile.isSelfEmployed) {
            suggestions.push({
                suggestionType: 'deduction_timing',
                category: 'deduction',
                title: 'Accelerate business expenses',
                description: `As a self-employed individual, consider purchasing business equipment, software subscriptions, or supplies before year-end to maximize this year's deductions. You have ${monthsRemaining} months remaining.`,
                potentialSavings: 5000 * (parseFloat(estimate.summary.marginalTaxRate) / 100),
                priorityScore: 70,
                actionRequired: 'Review planned business purchases and consider making them before December 31',
                deadline: new Date(taxYear, 11, 31),
                isTimeSensitive: true,
                complexityLevel: 'easy',
                requiresProfessional: false,
                details: {
                    monthsRemaining,
                    exampleDeductions: ['Equipment', 'Software', 'Supplies', 'Professional development'],
                },
            });
        }

        return suggestions;
    }

    /**
     * Generate income deferral suggestions
     */
    async generateIncomeDeferralSuggestions(userId, taxYear, profile, estimate) {
        const suggestions = [];

        // Check if user is approaching next tax bracket
        const marginalRate = parseFloat(estimate.summary.marginalTaxRate);
        const nextBracketThreshold = parseFloat(estimate.estimate.nextTaxBracketThreshold || 0);
        const currentIncome = parseFloat(estimate.summary.taxableIncome);
        const distanceToNextBracket = nextBracketThreshold - currentIncome;

        if (nextBracketThreshold && distanceToNextBracket > 0 && distanceToNextBracket < 50000) {
            suggestions.push({
                suggestionType: 'income_deferral',
                category: 'timing',
                title: 'Consider deferring income to avoid higher tax bracket',
                description: `You're $${distanceToNextBracket.toLocaleString()} away from the next tax bracket. If possible, consider deferring bonuses, freelance income, or retirement distributions to next year to stay in your current ${marginalRate}% bracket.`,
                potentialSavings: distanceToNextBracket * 0.03, // 3% difference between brackets (rough average)
                priorityScore: this.calculatePriorityScore(distanceToNextBracket * 0.03, distanceToNextBracket, 'high'),
                actionRequired: 'Negotiate with employer/clients to defer income to next year',
                deadline: new Date(taxYear, 11, 31),
                isTimeSensitive: true,
                complexityLevel: 'medium',
                requiresProfessional: true,
                details: {
                    currentIncome,
                    nextBracketThreshold,
                    distanceToNextBracket,
                    currentMarginalRate: marginalRate,
                    incomeTypes: ['Bonus', 'Freelance payments', 'Retirement distributions'],
                },
            });
        }

        return suggestions;
    }

    /**
     * Generate tax bracket management suggestions
     */
    async generateBracketManagementSuggestions(userId, taxYear, profile, estimate) {
        const suggestions = [];

        // Roth conversion opportunity in low-income year
        const currentIncome = parseFloat(estimate.summary.taxableIncome);
        const marginalRate = parseFloat(estimate.summary.marginalTaxRate);

        if (marginalRate <= 22 && currentIncome < 100000) {
            suggestions.push({
                suggestionType: 'tax_advantaged',
                category: 'tax_advantaged',
                title: 'Consider Roth IRA conversion',
                description: `Your current marginal tax rate is ${marginalRate}%, making this a good year for a Roth IRA conversion. You'll pay taxes now at a lower rate and enjoy tax-free withdrawals in retirement.`,
                potentialSavings: 10000, // Estimated future tax savings
                priorityScore: 65,
                actionRequired: 'Consult with a financial advisor about Roth conversion strategy',
                deadline: new Date(taxYear, 11, 31),
                isTimeSensitive: true,
                complexityLevel: 'hard',
                requiresProfessional: true,
                relatedAccountType: 'roth_ira',
                details: {
                    currentMarginalRate: marginalRate,
                    strategy: 'roth_conversion',
                    benefit: 'Pay taxes now at lower rate, withdraw tax-free later',
                },
            });
        }

        return suggestions;
    }

    /**
     * Generate year-end tax move suggestions
     */
    async generateYearEndSuggestions(userId, taxYear, profile, estimate) {
        const suggestions = [];
        const currentMonth = new Date().getMonth();

        // Only show these suggestions in Q4
        if (currentMonth >= 9) {
            // Tax-loss harvesting
            if (profile.hasInvestmentIncome) {
                suggestions.push({
                    suggestionType: 'tax_loss_harvest',
                    category: 'tax_advantaged',
                    title: 'Review tax-loss harvesting opportunities',
                    description: 'Sell losing investments to offset capital gains and reduce your tax bill by up to $3,000 against ordinary income. Be mindful of wash sale rules.',
                    potentialSavings: 3000 * (parseFloat(estimate.summary.marginalTaxRate) / 100),
                    priorityScore: 75,
                    actionRequired: 'Review investment portfolio for unrealized losses',
                    deadline: new Date(taxYear, 11, 31),
                    isTimeSensitive: true,
                    complexityLevel: 'medium',
                    requiresProfessional: true,
                    details: {
                        maxDeduction: 3000,
                        washSaleRule: '30 days before and after sale',
                    },
                });
            }

            // Charitable contributions
            suggestions.push({
                suggestionType: 'charitable_giving',
                category: 'deduction',
                title: 'Make charitable contributions before year-end',
                description: 'Charitable donations made by December 31 are deductible this year. Consider donating appreciated assets to avoid capital gains tax.',
                potentialSavings: 5000 * (parseFloat(estimate.summary.marginalTaxRate) / 100),
                priorityScore: 60,
                actionRequired: 'Complete charitable contributions by December 31',
                deadline: new Date(taxYear, 11, 31),
                isTimeSensitive: true,
                complexityLevel: 'easy',
                requiresProfessional: false,
                details: {
                    methods: ['Cash', 'Appreciated stock', 'Qualified charitable distribution (QCD)'],
                    proTip: 'Donate appreciated assets to avoid capital gains tax',
                },
            });
        }

        return suggestions;
    }

    /**
     * Calculate priority score for suggestions
     */
    calculatePriorityScore(savings, amount, urgency) {
        let score = 0;

        // Savings impact (0-40 points)
        if (savings > 5000) score += 40;
        else if (savings > 2000) score += 30;
        else if (savings > 1000) score += 20;
        else score += 10;

        // Amount impact (0-30 points)
        if (amount > 10000) score += 30;
        else if (amount > 5000) score += 20;
        else if (amount > 1000) score += 10;
        else score += 5;

        // Urgency (0-30 points)
        if (urgency === 'high') score += 30;
        else if (urgency === 'medium') score += 20;
        else score += 10;

        return Math.min(100, score);
    }

    /**
     * Store suggestion in database
     */
    async storeSuggestion(userId, taxYear, suggestion) {
        try {
            // Check if similar suggestion already exists
            const existing = await db.select()
                .from(taxOptimizationSuggestions)
                .where(and(
                    eq(taxOptimizationSuggestions.userId, userId),
                    eq(taxOptimizationSuggestions.taxYear, taxYear),
                    eq(taxOptimizationSuggestions.suggestionType, suggestion.suggestionType),
                    eq(taxOptimizationSuggestions.status, 'pending')
                ))
                .limit(1);

            if (existing.length > 0) {
                // Update existing suggestion
                await db.update(taxOptimizationSuggestions)
                    .set({
                        title: suggestion.title,
                        description: suggestion.description,
                        potentialSavings: suggestion.potentialSavings,
                        priorityScore: suggestion.priorityScore,
                        details: suggestion.details,
                        updatedAt: new Date(),
                    })
                    .where(eq(taxOptimizationSuggestions.id, existing[0].id));
                
                return existing[0];
            }

            // Create new suggestion
            const [stored] = await db.insert(taxOptimizationSuggestions).values({
                userId,
                taxYear,
                ...suggestion,
            }).returning();

            return stored;

        } catch (error) {
            console.error('Error storing suggestion:', error);
            throw error;
        }
    }

    /**
     * Get active suggestions for user
     */
    async getActiveSuggestions(userId, taxYear = new Date().getFullYear()) {
        try {
            const suggestions = await db.select()
                .from(taxOptimizationSuggestions)
                .where(and(
                    eq(taxOptimizationSuggestions.userId, userId),
                    eq(taxOptimizationSuggestions.taxYear, taxYear),
                    eq(taxOptimizationSuggestions.status, 'pending')
                ))
                .orderBy(desc(taxOptimizationSuggestions.priorityScore));

            return {
                success: true,
                count: suggestions.length,
                suggestions,
            };

        } catch (error) {
            console.error('Error getting active suggestions:', error);
            throw error;
        }
    }

    /**
     * Apply/accept a suggestion
     */
    async applySuggestion(userId, suggestionId, application Details = {}) {
        try {
            const [suggestion] = await db.select()
                .from(taxOptimizationSuggestions)
                .where(and(
                    eq(taxOptimizationSuggestions.id, suggestionId),
                    eq(taxOptimizationSuggestions.userId, userId)
                ))
                .limit(1);

            if (!suggestion) {
                throw new Error('Suggestion not found');
            }

            // Update suggestion status
            await db.update(taxOptimizationSuggestions)
                .set({
                    status: 'accepted',
                    appliedAt: new Date(),
                })
                .where(eq(taxOptimizationSuggestions.id, suggestionId));

            return {
                success: true,
                suggestion,
                message: 'Suggestion marked as accepted',
            };

        } catch (error) {
            console.error('Error applying suggestion:', error);
            throw error;
        }
    }

    /**
     * Dismiss a suggestion
     */
    async dismissSuggestion(userId, suggestionId) {
        try {
            await db.update(taxOptimizationSuggestions)
                .set({
                    status: 'dismissed',
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(taxOptimizationSuggestions.id, suggestionId),
                    eq(taxOptimizationSuggestions.userId, userId)
                ));

            return {
                success: true,
                message: 'Suggestion dismissed',
            };

        } catch (error) {
            console.error('Error dismissing suggestion:', error);
            throw error;
        }
    }
}

export default new TaxOptimizationEngine();
