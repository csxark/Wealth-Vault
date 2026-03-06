// Tax Calculation Engine - Real-time tax liability estimation
// Issue #641: Real-Time Tax Optimization & Deduction Tracking

import { db } from '../db/index.js';
import { taxEstimates, taxProfiles, taxDeductions, taxBrackets, expenses, incomes } from '../db/schema.js';
import { eq, and, gte, lte, sql, sum, desc } from 'drizzle-orm';

class TaxCalculationEngine {
    /**
     * Calculate real-time tax estimate for a user
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @param {object} options - Calculation options (scenarioChanges, includeProjections)
     * @returns {object} Tax estimate with breakdown
     */
    async calculateTaxEstimate(userId, taxYear = new Date().getFullYear(), options = {}) {
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
                throw new Error('Tax profile not found. Please set up your tax profile first.');
            }

            // Calculate gross income
            const grossIncome = await this.calculateGrossIncome(userId, taxYear, options.scenarioChanges);

            // Calculate deductions
            const deductions = await this.calculateDeductions(userId, taxYear, profile, options.scenarioChanges);

            // Calculate adjusted gross income (AGI)
            const agi = grossIncome - deductions.aboveTheLineDeductions;

            // Determine standard vs itemized deduction
            const standardDeduction = this.getStandardDeduction(profile.filingStatus, taxYear);
            const itemizedDeduction = deductions.itemizedDeductions;
            const finalDeduction = Math.max(standardDeduction, itemizedDeduction);
            const useItemized = itemizedDeduction > standardDeduction;

            // Calculate taxable income
            const taxableIncome = Math.max(0, agi - finalDeduction);

            // Calculate federal tax
            const federalTax = await this.calculateFederalTax(taxableIncome, profile.filingStatus, taxYear);

            // Calculate state tax (if applicable)
            const stateTax = profile.state ? 
                await this.calculateStateTax(taxableIncome, profile.state, profile.filingStatus, taxYear) : 0;

            // Calculate self-employment tax (if applicable)
            const selfEmploymentTax = profile.isSelfEmployed ? 
                await this.calculateSelfEmploymentTax(userId, taxYear) : 0;

            // Total tax liability
            const totalTax = federalTax.totalTax + stateTax + selfEmploymentTax;

            // Calculate amounts owed/refund
            const withholdingYtd = profile.withholdingYtd || 0;
            const estimatedPaymentsYtd = options.scenarioChanges?.estimatedPayments || 0;
            const totalPayments = withholdingYtd + estimatedPaymentsYtd;

            const amountOwed = Math.max(0, totalTax - totalPayments);
            const refundAmount = Math.max(0, totalPayments - totalTax);

            // Calculate tax rates
            const effectiveTaxRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;
            const marginalTaxRate = federalTax.marginalRate;

            // Build calculation details
            const calculationDetails = {
                income: {
                    gross: grossIncome,
                    w2Income: deductions.incomeBreakdown.w2Income,
                    selfEmploymentIncome: deductions.incomeBreakdown.selfEmploymentIncome,
                    investmentIncome: deductions.incomeBreakdown.investmentIncome,
                    otherIncome: deductions.incomeBreakdown.otherIncome,
                },
                deductions: {
                    aboveTheLine: deductions.aboveTheLineDeductions,
                    standard: standardDeduction,
                    itemized: itemizedDeduction,
                    finalDeduction,
                    useItemized,
                    breakdown: deductions.breakdown,
                },
                taxes: {
                    federal: {
                        taxableIncome,
                        totalTax: federalTax.totalTax,
                        bracketBreakdown: federalTax.bracketBreakdown,
                        marginalRate: federalTax.marginalRate,
                        nextBracketThreshold: federalTax.nextBracketThreshold,
                    },
                    state: {
                        tax: stateTax,
                        rate: this.getStateAverageRate(profile.state),
                    },
                    selfEmployment: {
                        tax: selfEmploymentTax,
                        rate: 15.3,
                    },
                },
                payments: {
                    withholding: withholdingYtd,
                    estimated: estimatedPaymentsYtd,
                    total: totalPayments,
                },
            };

            // Store tax estimate
            const [estimate] = await db.insert(taxEstimates).values({
                userId,
                taxYear,
                grossIncome,
                adjustedGrossIncome: agi,
                taxableIncome,
                totalDeductions: finalDeduction,
                federalTax: federalTax.totalTax,
                stateTax,
                selfEmploymentTax,
                totalTax,
                withholdingYtd,
                estimatedPaymentsYtd,
                amountOwed,
                refundAmount,
                effectiveTaxRate,
                marginalTaxRate,
                nextTaxBracketThreshold: federalTax.nextBracketThreshold,
                scenarioName: options.scenarioName || null,
                isProjection: options.isProjection || false,
                calculationDetails,
            }).returning();

            return {
                success: true,
                estimate,
                summary: {
                    grossIncome,
                    agi,
                    taxableIncome,
                    totalTax,
                    effectiveTaxRate: effectiveTaxRate.toFixed(2) + '%',
                    marginalTaxRate: marginalTaxRate.toFixed(2) + '%',
                    amountOwed: amountOwed > 0 ? amountOwed : null,
                    refundAmount: refundAmount > 0 ? refundAmount : null,
                },
                details: calculationDetails,
            };

        } catch (error) {
            console.error('Error calculating tax estimate:', error);
            throw error;
        }
    }

    /**
     * Calculate gross income from all sources
     */
    async calculateGrossIncome(userId, taxYear, scenarioChanges = {}) {
        // Get income from incomes table
        const yearStart = new Date(taxYear, 0, 1);
        const yearEnd = new Date(taxYear, 11, 31);

        const incomeResult = await db.select({
            total: sum(incomes.amount),
        })
        .from(incomes)
        .where(and(
            eq(incomes.userId, userId),
            gte(incomes.incomeDate, yearStart),
            lte(incomes.incomeDate, yearEnd)
        ));

        const totalIncome = parseFloat(incomeResult[0]?.total || 0);

        // Apply scenario changes
        if (scenarioChanges.additionalIncome) {
            return totalIncome + scenarioChanges.additionalIncome;
        }

        return totalIncome;
    }

    /**
     * Calculate all deductions
     */
    async calculateDeductions(userId, taxYear, profile, scenarioChanges = {}) {
        const yearStart = new Date(taxYear, 0, 1);
        const yearEnd = new Date(taxYear, 11, 31);

        // Get tracked deductions
        const deductionsList = await db.select()
            .from(taxDeductions)
            .where(and(
                eq(taxDeductions.userId, userId),
                eq(taxDeductions.taxYear, taxYear)
            ));

        // Categorize deductions
        const breakdown = {
            business: 0,
            homeOffice: 0,
            medical: 0,
            charitable: 0,
            stateTax: 0,
            mortgageInterest: 0,
            studentLoanInterest: 0,
            retirement: 0,
            hsa: 0,
            other: 0,
        };

        let aboveTheLine = 0;
        let itemized = 0;

        for (const deduction of deductionsList) {
            const amount = parseFloat(deduction.amount);

            if (deduction.deductionType === 'above_the_line') {
                aboveTheLine += amount;
            } else if (deduction.deductionType === 'itemized') {
                itemized += amount;
            }

            // Categorize for breakdown
            const category = deduction.deductionCategory.toLowerCase().replace(/_/g, '');
            if (breakdown[category] !== undefined) {
                breakdown[category] += amount;
            } else {
                breakdown.other += amount;
            }
        }

        // Apply SALT cap (State and Local Tax deduction)
        const saltCap = 10000;
        if (breakdown.stateTax > saltCap) {
            const saltExcess = breakdown.stateTax - saltCap;
            itemized -= saltExcess;
            breakdown.stateTax = saltCap;
        }

        // Get income breakdown for context
        const incomeBreakdown = await this.getIncomeBreakdown(userId, taxYear);

        return {
            aboveTheLineDeductions: aboveTheLine,
            itemizedDeductions: itemized,
            breakdown,
            incomeBreakdown,
        };
    }

    /**
     * Get income breakdown by type
     */
    async getIncomeBreakdown(userId, taxYear) {
        const yearStart = new Date(taxYear, 0, 1);
        const yearEnd = new Date(taxYear, 11, 31);

        const incomeList = await db.select()
            .from(incomes)
            .where(and(
                eq(incomes.userId, userId),
                gte(incomes.incomeDate, yearStart),
                lte(incomes.incomeDate, yearEnd)
            ));

        const breakdown = {
            w2Income: 0,
            selfEmploymentIncome: 0,
            investmentIncome: 0,
            otherIncome: 0,
        };

        for (const income of incomeList) {
            const amount = parseFloat(income.amount);
            const type = income.type || 'other';

            switch (type.toLowerCase()) {
                case 'w2':
                case 'salary':
                case 'wages':
                    breakdown.w2Income += amount;
                    break;
                case 'self_employment':
                case 'freelance':
                case '1099':
                    breakdown.selfEmploymentIncome += amount;
                    break;
                case 'investment':
                case 'dividend':
                case 'capital_gain':
                    breakdown.investmentIncome += amount;
                    break;
                default:
                    breakdown.otherIncome += amount;
            }
        }

        return breakdown;
    }

    /**
     * Calculate federal tax using progressive brackets
     */
    async calculateFederalTax(taxableIncome, filingStatus, taxYear) {
        // Get tax brackets
        const brackets = await db.select()
            .from(taxBrackets)
            .where(and(
                eq(taxBrackets.jurisdiction, 'federal'),
                eq(taxBrackets.taxYear, taxYear),
                eq(taxBrackets.filingStatus, filingStatus)
            ))
            .orderBy(taxBrackets.bracketNumber);

        if (brackets.length === 0) {
            throw new Error(`No tax brackets found for ${filingStatus} in ${taxYear}`);
        }

        let totalTax = 0;
        let marginalRate = 0;
        let nextBracketThreshold = null;
        const bracketBreakdown = [];

        for (let i = 0; i < brackets.length; i++) {
            const bracket = brackets[i];
            const floor = parseFloat(bracket.incomeFloor);
            const ceiling = bracket.incomeCeiling ? parseFloat(bracket.incomeCeiling) : Infinity;
            const rate = parseFloat(bracket.taxRate) / 100;

            if (taxableIncome > floor) {
                marginalRate = parseFloat(bracket.taxRate);
                
                const taxableInBracket = Math.min(taxableIncome, ceiling) - floor;
                const taxForBracket = taxableInBracket * rate;
                totalTax += taxForBracket;

                bracketBreakdown.push({
                    bracket: `${floor.toLocaleString()} - ${ceiling === Infinity ? '∞' : ceiling.toLocaleString()}`,
                    rate: marginalRate,
                    taxableAmount: taxableInBracket,
                    tax: taxForBracket,
                });

                // Check if we're in the next bracket
                if (taxableIncome < ceiling) {
                    nextBracketThreshold = ceiling;
                    break;
                }
            }
        }

        return {
            totalTax,
            marginalRate,
            nextBracketThreshold,
            bracketBreakdown,
        };
    }

    /**
     * Calculate state tax (simplified flat rate for now)
     */
    async calculateStateTax(taxableIncome, stateCode, filingStatus, taxYear) {
        // Try to get state brackets from database
        const stateBrackets = await db.select()
            .from(taxBrackets)
            .where(and(
                eq(taxBrackets.jurisdiction, stateCode),
                eq(taxBrackets.taxYear, taxYear),
                eq(taxBrackets.filingStatus, filingStatus)
            ))
            .orderBy(taxBrackets.bracketNumber)
            .limit(1);

        if (stateBrackets.length > 0) {
            // Use bracket-based calculation (similar to federal)
            // For simplicity, using first bracket rate
            const rate = parseFloat(stateBrackets[0].taxRate) / 100;
            return taxableIncome * rate;
        }

        // Fallback to average rates by state
        const stateRates = this.getStateAverageRate(stateCode);
        return taxableIncome * (stateRates / 100);
    }

    /**
     * Calculate self-employment tax
     */
    async calculateSelfEmploymentTax(userId, taxYear) {
        const incomeBreakdown = await this.getIncomeBreakdown(userId, taxYear);
        const seIncome = incomeBreakdown.selfEmploymentIncome;

        // Self-employment tax rate: 15.3% (12.4% Social Security + 2.9% Medicare)
        // Only applies to first $160,200 for Social Security (2026 estimate)
        const socialSecurityWageBase = 160200;
        const socialSecurityRate = 0.124;
        const medicareRate = 0.029;

        const socialSecurityTax = Math.min(seIncome, socialSecurityWageBase) * socialSecurityRate;
        const medicareTax = seIncome * medicareRate;

        return socialSecurityTax + medicareTax;
    }

    /**
     * Get standard deduction amount
     */
    getStandardDeduction(filingStatus, taxYear) {
        // 2026 standard deductions (estimated)
        const deductions = {
            single: 14600,
            married_joint: 29200,
            married_separate: 14600,
            head_of_household: 21900,
        };

        return deductions[filingStatus] || deductions.single;
    }

    /**
     * Get average state tax rate (simplified)
     */
    getStateAverageRate(stateCode) {
        if (!stateCode) return 0;

        // Simplified average state income tax rates
        const rates = {
            CA: 8.0,  // California
            NY: 6.5,  // New York
            MA: 5.0,  // Massachusetts
            IL: 4.95, // Illinois
            TX: 0,    // Texas (no income tax)
            FL: 0,    // Florida (no income tax)
            WA: 0,    // Washington (no income tax)
            PA: 3.07, // Pennsylvania
            NJ: 6.5,  // New Jersey
            OH: 3.5,  // Ohio
            // Add more states as needed
        };

        return rates[stateCode.toUpperCase()] || 5.0; // Default 5%
    }

    /**
     * Run a "what if" scenario
     */
    async runScenario(userId, taxYear, scenarioName, changes) {
        const baseEstimate = await this.calculateTaxEstimate(userId, taxYear);

        const scenarioEstimate = await this.calculateTaxEstimate(userId, taxYear, {
            scenarioName,
            scenarioChanges: changes,
            isProjection: true,
        });

        const taxImpact = baseEstimate.estimate.totalTax - scenarioEstimate.estimate.totalTax;
        const isFavorable = taxImpact > 0; // Positive impact = tax savings

        return {
            scenarioName,
            baseEstimate: baseEstimate.summary,
            scenarioEstimate: scenarioEstimate.summary,
            taxImpact,
            isFavorable,
            savings: isFavorable ? taxImpact : 0,
            additionalCost: !isFavorable ? Math.abs(taxImpact) : 0,
            recommendations: this.generateScenarioRecommendations(taxImpact, changes),
        };
    }

    /**
     * Generate recommendations based on scenario
     */
    generateScenarioRecommendations(taxImpact, changes) {
        const recommendations = [];

        if (taxImpact > 0) {
            recommendations.push({
                type: 'beneficial',
                message: `This change could save you $${taxImpact.toFixed(2)} in taxes.`,
            });
        } else {
            recommendations.push({
                type: 'caution',
                message: `This change may increase your tax liability by $${Math.abs(taxImpact).toFixed(2)}.`,
            });
        }

        if (changes.additionalIncome) {
            recommendations.push({
                type: 'info',
                message: 'Consider increasing pre-tax retirement contributions to offset additional income.',
            });
        }

        return recommendations;
    }

    /**
     * Get year-to-date summary
     */
    async getYtdSummary(userId, taxYear = new Date().getFullYear()) {
        const estimate = await this.calculateTaxEstimate(userId, taxYear);

        const deductionSummary = await db.select()
            .from(taxDeductions)
            .where(and(
                eq(taxDeductions.userId, userId),
                eq(taxDeductions.taxYear, taxYear)
            ));

        const totalDeductions = deductionSummary.reduce((sum, d) => sum + parseFloat(d.amount), 0);

        return {
            taxYear,
            currentEstimate: estimate.summary,
            deductions: {
                count: deductionSummary.length,
                total: totalDeductions,
                byCategory: estimate.details.deductions.breakdown,
            },
            projectedRefund: estimate.summary.refundAmount,
            projectedOwed: estimate.summary.amountOwed,
        };
    }
}

export default new TaxCalculationEngine();
