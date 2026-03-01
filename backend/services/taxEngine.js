import db from '../config/db.js';
import { taxProfiles, taxBrackets, taxDeductions, taxReports, expenses } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

class TaxEngine {
    /**
     * Calculate tax liability for a user
     */
    async calculateTaxLiability(userId, taxYear = new Date().getFullYear()) {
        // Get user's tax profile
        const profile = await this.getTaxProfile(userId, taxYear);
        if (!profile) {
            throw new Error('Tax profile not found. Please configure your tax settings.');
        }

        // Get total income
        const totalIncome = parseFloat(profile.annualIncome || '0');

        // Get deductions
        const deductions = await this.getTotalDeductions(userId, taxYear);
        const totalDeductions = profile.useItemizedDeductions
            ? deductions.itemized
            : parseFloat(profile.standardDeduction || '0');

        // Calculate taxable income
        const taxableIncome = Math.max(0, totalIncome - totalDeductions);

        // Get applicable tax brackets
        const brackets = await this.getTaxBrackets(profile.country, taxYear, profile.filingStatus);

        // Calculate tax using marginal rates
        const taxCalculation = this.calculateMarginalTax(taxableIncome, brackets);

        return {
            totalIncome,
            totalDeductions,
            taxableIncome,
            ...taxCalculation,
            deductionBreakdown: deductions
        };
    }

    /**
     * Calculate tax using marginal tax brackets
     */
    calculateMarginalTax(taxableIncome, brackets) {
        let totalTax = 0;
        let marginalRate = 0;
        const breakdown = [];

        // Sort brackets by minIncome
        const sortedBrackets = brackets.sort((a, b) =>
            parseFloat(a.minIncome) - parseFloat(b.minIncome)
        );

        for (const bracket of sortedBrackets) {
            const min = parseFloat(bracket.minIncome);
            const max = bracket.maxIncome ? parseFloat(bracket.maxIncome) : Infinity;
            const rate = parseFloat(bracket.rate) / 100;

            if (taxableIncome > min) {
                const taxableAtThisRate = Math.min(taxableIncome, max) - min;
                const taxAtThisRate = taxableAtThisRate * rate;

                totalTax += taxAtThisRate;
                marginalRate = parseFloat(bracket.rate);

                breakdown.push({
                    bracket: bracket.bracketLevel,
                    rate: parseFloat(bracket.rate),
                    income: taxableAtThisRate,
                    tax: taxAtThisRate
                });

                if (taxableIncome <= max) break;
            }
        }

        const effectiveRate = taxableIncome > 0 ? (totalTax / taxableIncome) * 100 : 0;

        return {
            totalTaxOwed: totalTax,
            effectiveTaxRate: effectiveRate,
            marginalTaxRate: marginalRate,
            bracketBreakdown: breakdown
        };
    }

    /**
     * Get user's tax profile
     */
    async getTaxProfile(userId, taxYear) {
        const profile = await db.query.taxProfiles.findFirst({
            where: and(
                eq(taxProfiles.userId, userId),
                eq(taxProfiles.taxYear, taxYear)
            )
        });

        return profile;
    }

    /**
     * Create or update tax profile
     */
    async upsertTaxProfile(userId, profileData) {
        const { taxYear, country, filingStatus, annualIncome, standardDeduction, useItemizedDeductions, stateCode } = profileData;

        const existing = await this.getTaxProfile(userId, taxYear);

        if (existing) {
            const [updated] = await db.update(taxProfiles)
                .set({
                    country,
                    filingStatus,
                    annualIncome: annualIncome ? annualIncome.toString() : null,
                    standardDeduction: standardDeduction ? standardDeduction.toString() : null,
                    useItemizedDeductions,
                    stateCode,
                    updatedAt: new Date()
                })
                .where(eq(taxProfiles.id, existing.id))
                .returning();
            return updated;
        }

        const [newProfile] = await db.insert(taxProfiles).values({
            userId,
            taxYear,
            country: country || 'US',
            filingStatus: filingStatus || 'single',
            annualIncome: annualIncome ? annualIncome.toString() : '0',
            standardDeduction: standardDeduction ? standardDeduction.toString() : '13850', // 2024 standard
            useItemizedDeductions: useItemizedDeductions || false,
            stateCode
        }).returning();

        return newProfile;
    }

    /**
     * Get tax brackets for a specific configuration
     */
    async getTaxBrackets(country, taxYear, filingStatus) {
        const brackets = await db.select()
            .from(taxBrackets)
            .where(and(
                eq(taxBrackets.country, country),
                eq(taxBrackets.taxYear, taxYear),
                eq(taxBrackets.filingStatus, filingStatus)
            ));

        return brackets;
    }

    /**
     * Get total deductions
     */
    async getTotalDeductions(userId, taxYear) {
        const deductionsList = await db.query.taxDeductions.findMany({
            where: and(
                eq(taxDeductions.userId, userId),
                eq(taxDeductions.taxYear, taxYear),
                eq(taxDeductions.status, 'approved')
            )
        });

        const itemized = deductionsList.reduce((sum, d) => sum + parseFloat(d.amount), 0);

        const byCategory = deductionsList.reduce((acc, d) => {
            acc[d.category] = (acc[d.category] || 0) + parseFloat(d.amount);
            return acc;
        }, {});

        return {
            itemized,
            count: deductionsList.length,
            byCategory
        };
    }

    /**
     * Add manual deduction
     */
    async addDeduction(userId, deductionData) {
        const { expenseId, taxYear, category, description, amount, deductionType, metadata } = deductionData;

        const [deduction] = await db.insert(taxDeductions).values({
            userId,
            expenseId,
            taxYear,
            category,
            description,
            amount: amount.toString(),
            deductionType: deductionType || 'itemized',
            aiDetected: false,
            status: 'approved', // Manual deductions auto-approved
            approvedBy: userId,
            approvedAt: new Date(),
            metadata: metadata || {}
        }).returning();

        return deduction;
    }

    /**
     * Generate tax report
     */
    async generateReport(userId, taxYear, reportType = 'annual') {
        const calculation = await this.calculateTaxLiability(userId, taxYear);
        const profile = await this.getTaxProfile(userId, taxYear);

        const [report] = await db.insert(taxReports).values({
            userId,
            taxYear,
            reportType,
            totalIncome: calculation.totalIncome.toString(),
            totalDeductions: calculation.totalDeductions.toString(),
            taxableIncome: calculation.taxableIncome.toString(),
            totalTaxOwed: calculation.totalTaxOwed.toString(),
            effectiveTaxRate: calculation.effectiveTaxRate.toString(),
            marginalTaxRate: calculation.marginalTaxRate.toString(),
            breakdown: {
                profile: {
                    filingStatus: profile.filingStatus,
                    country: profile.country
                },
                brackets: calculation.bracketBreakdown,
                deductions: calculation.deductionBreakdown
            },
            status: 'draft'
        }).returning();

        return report;
    }

    /**
     * Get user's deductions for a tax year
     */
    async getUserDeductions(userId, taxYear) {
        const deductionsList = await db.query.taxDeductions.findMany({
            where: and(
                eq(taxDeductions.userId, userId),
                eq(taxDeductions.taxYear, taxYear)
            ),
            with: {
                expense: true
            },
            orderBy: (taxDeductions, { desc }) => [desc(taxDeductions.createdAt)]
        });

        return deductionsList;
    }

    /**
     * Approve AI-detected deduction
     */
    async approveDeduction(deductionId, userId) {
        const [approved] = await db.update(taxDeductions)
            .set({
                status: 'approved',
                approvedBy: userId,
                approvedAt: new Date()
            })
            .where(eq(taxDeductions.id, deductionId))
            .returning();

        return approved;
    }

    /**
     * Reject AI-detected deduction
     */
    async rejectDeduction(deductionId) {
        const [rejected] = await db.update(taxDeductions)
            .set({
                status: 'rejected'
            })
            .where(eq(taxDeductions.id, deductionId))
            .returning();

        return rejected;
    }

    /**
     * Get tax reports for user
     */
    async getUserReports(userId, taxYear = null) {
        const conditions = [eq(taxReports.userId, userId)];
        if (taxYear) {
            conditions.push(eq(taxReports.taxYear, taxYear));
        }

        const reports = await db.query.taxReports.findMany({
            where: and(...conditions),
            orderBy: (taxReports, { desc }) => [desc(taxReports.createdAt)]
        });

        return reports;
    }
}

export default new TaxEngine();
