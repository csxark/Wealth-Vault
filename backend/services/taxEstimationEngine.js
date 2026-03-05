/**
 * Tax Estimation Engine
 * Issue #692: Real-Time Tax Optimization & Deduction Tracking
 * 
 * Calculates estimated tax liability with deductions and credits,
 * provides scenario-based "what-if" projections and optimization strategies.
 */

import db from '../config/database.js';
import { users, expenses } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import deductionTrackingService from './deductionTrackingService.js';
import AppError from '../utils/AppError.js';

class TaxEstimationEngine {
    /**
     * 2024 Tax brackets (single filer)
     */
    TAX_BRACKETS_2024 = [
        { min: 0, max: 11600, rate: 0.10 },
        { min: 11600, max: 47150, rate: 0.12 },
        { min: 47150, max: 100525, rate: 0.22 },
        { min: 100525, max: 191950, rate: 0.24 },
        { min: 191950, max: 243725, rate: 0.32 },
        { min: 243725, max: 609350, rate: 0.35 },
        { min: 609350, max: Infinity, rate: 0.37 }
    ];

    /**
     * Long-term capital gains rates (single filer, 2024)
     */
    LTCG_BRACKETS_2024 = [
        { min: 0, max: 47025, rate: 0.0 },
        { min: 47025, max: 518900, rate: 0.15 },
        { min: 518900, max: Infinity, rate: 0.20 }
    ];

    /**
     * Standard deduction (single filer, 2024)
     */
    STANDARD_DEDUCTION_2024 = 14600;

    /**
     * Estimate federal income tax for a user
     */
    async estimateFederalIncomeTax(userId, taxYear = new Date().getFullYear()) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || user.length === 0) throw new AppError('User not found', 404);

        const profile = user[0];
        const grossIncome = parseFloat(profile.monthlyIncome || 0) * 12;

        // Get deductions
        const deductionSummary = await deductionTrackingService.getDeductionSummary(userId, taxYear);
        const totalDeductions = Math.max(deductionSummary.totalDeductions, this.STANDARD_DEDUCTION_2024);

        // Calculate taxable income
        const taxableIncome = Math.max(0, grossIncome - totalDeductions);

        // Calculate tax
        const federalTax = this._calculateIncomeTax(taxableIncome);

        // Estimate self-employment tax (if applicable, assume 15.3% for self-employed)
        const isSelfEmployed = profile.incomeRange === 'Self-Employed' || profile.incomeRange?.includes('Freelance');
        const seaTax = isSelfEmployed ? grossIncome * 0.153 * 0.92 * 0.5 * 0.029 : 0; // Simplified

        // Estimate FICA (employee portion: 7.65%)
        const ficaTax = isSelfEmployed ? 0 : grossIncome * 0.0765;

        return {
            grossIncome: parseFloat(grossIncome.toFixed(2)),
            deductions: parseFloat(totalDeductions.toFixed(2)),
            taxableIncome: parseFloat(taxableIncome.toFixed(2)),
            federalIncomeTax: parseFloat(federalTax.toFixed(2)),
            ficaTax: parseFloat(ficaTax.toFixed(2)),
            selfEmploymentTax: parseFloat(seaTax.toFixed(2)),
            estimatedTotalTax: parseFloat((federalTax + ficaTax + seaTax).toFixed(2)),
            effectiveTaxRate: parseFloat((federalTax / grossIncome * 100).toFixed(2)),
            riskFactors: this._identifyRiskFactors(grossIncome, totalDeductions)
        };
    }

    /**
     * Calculate estimated quarterly tax payments
     */
    async estimateQuarterlyTaxPayments(userId, taxYear = new Date().getFullYear()) {
        const estimate = await this.estimateFederalIncomeTax(userId, taxYear);
        const quarterlyPayment = estimate.estimatedTotalTax / 4;

        return {
            taxYear,
            annualEstimate: estimate.estimatedTotalTax,
            quarterlyPayment: parseFloat(quarterlyPayment.toFixed(2)),
            dueDate1: `${taxYear}-04-15`,
            dueDate2: `${taxYear}-06-17`,
            dueDate3: `${taxYear}-09-16`,
            dueDate4: `${taxYear + 1}-01-16`,
            penalties: this._calculateUnderpaymentPenalty(estimate.estimatedTotalTax)
        };
    }

    /**
     * Generate "what-if" tax scenarios by adjusting income/deductions
     */
    async generateTaxScenarios(userId, taxYear = new Date().getFullYear()) {
        const baseEstimate = await this.estimateFederalIncomeTax(userId, taxYear);
        const deductionSummary = await deductionTrackingService.getDeductionSummary(userId, taxYear);

        const scenarios = [];

        // Scenario 1: No deductions (only standard deduction)
        const scenario1 = await this._calculateScenarioTax(
            baseEstimate.grossIncome,
            this.STANDARD_DEDUCTION_2024,
            'Conservative - Standard Deduction Only'
        );
        scenarios.push(scenario1);

        // Scenario 2: Current deductions
        scenarios.push({
            name: 'Current - Actual Deductions',
            deductionsUsed: deductionSummary.totalDeductions,
            estimatedTax: baseEstimate.federalIncomeTax,
            taxSavingsVsStandard: baseEstimate.federalIncomeTax - scenario1.estimatedTax,
            description: 'Based on tracked deductions'
        });

        // Scenario 3: 25% more deductions (e.g., maximizing categories)
        const increased = Math.min(deductionSummary.totalDeductions * 1.25, baseEstimate.grossIncome);
        const scenario3 = await this._calculateScenarioTax(
            baseEstimate.grossIncome,
            increased,
            'Optimized - 25% More Deductions'
        );
        scenarios.push(scenario3);

        // Scenario 4: Increase income (bonus/side income)
        const bonusIncome = baseEstimate.grossIncome * 0.20; // 20% income increase
        const scenario4 = await this._calculateScenarioTax(
            baseEstimate.grossIncome + bonusIncome,
            deductionSummary.totalDeductions,
            'Higher Income (20% increase)'
        );
        scenarios.push(scenario4);

        // Scenario 5: Maximize retirement contributions (SEP-IRA/Solo 401k)
        const retirementMax = 69000; // 2024 limit
        const scenario5 = await this._calculateScenarioTax(
            baseEstimate.grossIncome,
            deductionSummary.totalDeductions + retirementMax,
            'Max Retirement Contributions'
        );
        scenarios.push(scenario5);

        return {
            currentEstimate: baseEstimate,
            scenarios: scenarios.sort((a, b) => a.estimatedTax - b.estimatedTax), // Lowest tax first
            recommendations: this._generateRecommendations(scenarios, deductionSummary)
        };
    }

    /**
     * Tax-advantaged account optimization recommendations
     */
    async getTaxOptimizationStrategies(userId, taxYear = new Date().getFullYear()) {
        const estimate = await this.estimateFederalIncomeTax(userId, taxYear);
        const deductionSummary = await deductionTrackingService.getDeductionSummary(userId, taxYear);

        const strategies = [];

        // Strategy 1: Maximize retirement contributions
        const retirementSavings = 69000; // 2024 SEP-IRA/Solo 401k limit
        strategies.push({
            name: 'Maximize Retirement Account Contributions',
            description: 'Fund SEP-IRA or Solo 401k up to $69,000 annually (2024)',
            potentialTaxSavings: Math.min(retirementSavings, estimate.grossIncome) * 0.22,
            effort: 'Medium',
            priority: 'High'
        });

        // Strategy 2: Business expense documentation
        const missed = await deductionTrackingService.findMissedDeductions(userId, taxYear);
        if (missed.opportunityCount > 0) {
            strategies.push({
                name: 'Capture Missed Deductions',
                description: `Found ${missed.opportunityCount} potential deductions worth ~$${missed.totalPotentialSavings.toFixed(0)}`,
                potentialTaxSavings: missed.totalPotentialSavings,
                effort: 'Low',
                priority: 'High'
            });
        }

        // Strategy 3: Health Savings Account (HSA)
        strategies.push({
            name: 'Open Health Savings Account (HSA)',
            description: 'Triple tax-advantaged: deductible contributions, tax-free growth, tax-free withdrawals for medical',
            potentialTaxSavings: 4150 * 0.22, // 2024 family limit
            effort: 'Low',
            priority: 'Medium'
        });

        // Strategy 4: Tax-loss harvesting
        strategies.push({
            name: 'Tax-Loss Harvesting',
            description: 'Sell losing investments to offset capital gains and up to $3,000 of ordinary income',
            potentialTaxSavings: 3000 * 0.22, // Conservative: $3k offset
            effort: 'Medium',
            priority: 'Medium'
        });

        // Strategy 5: S-Corp or C-Corp election (if self-employed)
        if (estimate.grossIncome > 60000) {
            strategies.push({
                name: 'Consider S-Corp Election',
                description: 'For self-employed with >$60k income; split income between salary/dividends to reduce SE tax',
                potentialTaxSavings: estimate.grossIncome * 0.1 * 0.029, // Rough 2.9% SE tax savings
                effort: 'High',
                priority: 'Medium'
            });
        }

        return {
            currentEffectiveTaxRate: estimate.effectiveTaxRate,
            strategies: strategies.sort((a, b) => b.potentialTaxSavings - a.potentialTaxSavings)
        };
    }

    /**
     * Get estimated state and local tax liability
     */
    async estimateStateAndLocalTax(userId, taxYear = new Date().getFullYear(), state = 'CA') {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || user.length === 0) throw new AppError('User not found', 404);

        const profile = user[0];
        const grossIncome = parseFloat(profile.monthlyIncome || 0) * 12;

        // Simplified state tax rates (varies by state)
        const stateTaxRates = {
            'CA': 0.093,
            'NY': 0.0685,
            'TX': 0,
            'FL': 0,
            'WA': 0.07, // Capital gains tax
            'IL': 0.0495,
            'MA': 0.05,
            'default': 0.05
        };

        const rate = stateTaxRates[state] || stateTaxRates['default'];
        const stateTax = grossIncome * rate;

        // Local taxes (city/county sales tax assumption: 2-4%)
        const estimatedSpending = grossIncome * 0.70; // Assume 70% of income spent
        const localTax = estimatedSpending * 0.035; // 3.5% average sales tax

        return {
            state,
            grossIncome: parseFloat(grossIncome.toFixed(2)),
            stateIncomeTax: parseFloat(stateTax.toFixed(2)),
            localSalesTax: parseFloat(localTax.toFixed(2)),
            estimatedStateTotalTax: parseFloat((stateTax + localTax).toFixed(2)),
            taxRate: (rate * 100).toFixed(2)
        };
    }

    /**
     * Comprehensive tax summary (federal + state + self-employment)
     */
    async getComprehensiveTaxEstimate(userId, taxYear = new Date().getFullYear(), state = 'CA') {
        const federal = await this.estimateFederalIncomeTax(userId, taxYear);
        const stateLocal = await this.estimateStateAndLocalTax(userId, taxYear, state);

        return {
            taxYear,
            state,
            grossIncome: federal.grossIncome,
            totalDeductions: federal.deductions,
            taxableIncome: federal.taxableIncome,
            federalTax: federal.federalIncomeTax,
            ficaTax: federal.ficaTax,
            selfEmploymentTax: federal.selfEmploymentTax,
            stateAndLocalTax: stateLocal.estimatedStateTotalTax,
            totalTaxLiability: federal.estimatedTotalTax + stateLocal.estimatedStateTotalTax,
            takeHomePay: federal.grossIncome - (federal.estimatedTotalTax + stateLocal.estimatedStateTotalTax),
            effectiveFederalRate: federal.effectiveTaxRate,
            effectiveTotalRate: ((federal.estimatedTotalTax + stateLocal.estimatedStateTotalTax) / federal.grossIncome * 100).toFixed(2)
        };
    }

    // ====== PRIVATE HELPER METHODS ======

    /**
     * Calculate income tax based on 2024 brackets
     */
    _calculateIncomeTax(taxableIncome) {
        let tax = 0;
        let previousMax = 0;

        for (const bracket of this.TAX_BRACKETS_2024) {
            if (taxableIncome > bracket.min) {
                const incomeInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
                tax += incomeInBracket * bracket.rate;
            }
        }

        return tax;
    }

    /**
     * Calculate scenario tax
     */
    async _calculateScenarioTax(grossIncome, deductions, scenarioName) {
        const taxableIncome = Math.max(0, grossIncome - deductions);
        const tax = this._calculateIncomeTax(taxableIncome);

        return {
            name: scenarioName,
            deductionsUsed: parseFloat(deductions.toFixed(2)),
            taxableIncome: parseFloat(taxableIncome.toFixed(2)),
            estimatedTax: parseFloat(tax.toFixed(2)),
            effectiveRate: (tax / grossIncome * 100).toFixed(2)
        };
    }

    /**
     * Generate optimization recommendations
     */
    _generateRecommendations(scenarios, deductionSummary) {
        const recs = [];

        // Lowest tax scenario
        const lowestTax = scenarios.sort((a, b) => a.estimatedTax - b.estimatedTax)[0];
        recs.push({
            type: 'Primary Strategy',
            recommendation: `Use strategy: ${lowestTax.name}`,
            potentialSavings: Math.max(...scenarios.map(s => s.estimatedTax)) - lowestTax.estimatedTax
        });

        // Underutilized categories
        for (const cat of deductionSummary.categories) {
            if (cat.limit && cat.utilization < 50) {
                recs.push({
                    type: 'Category Opportunity',
                    recommendation: `Increase ${cat.category} deductions - only ${cat.utilization}% utilized`,
                    potentialSavings: (cat.limit - cat.total) * 0.22
                });
            }
        }

        return recs;
    }

    /**
     * Identify audit risk factors
     */
    _identifyRiskFactors(income, deductions) {
        const risks = [];
        const deductionRatio = deductions / income;

        if (deductionRatio > 0.4) {
            risks.push('High deduction ratio (>40%) - may flag for audit');
        }
        if (income < 30000 && deductions > income * 0.5) {
            risks.push('Very high deduction ratio on low income');
        }

        return risks;
    }

    /**
     * Estimate underpayment penalties
     */
    _calculateUnderpaymentPenalty(estimatedTax) {
        const safeHarborAmount = estimatedTax * 0.9; // 90% of current year or 100% of prior year
        return {
            safeHarborAmount: parseFloat(safeHarborAmount.toFixed(2)),
            penaltyIfUnderpaid: 'If quarterly payments < $' + parseFloat(safeHarborAmount.toFixed(0)),
            rate: '7% annual rate'
        };
    }
}

export default new TaxEstimationEngine();
