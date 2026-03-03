/**
 * Deduction Tracking Service
 * Issue #692: Real-Time Tax Optimization & Deduction Tracking
 * 
 * Auto-categorizes expenses as tax deductions, tracks business deductions,
 * and identifies missed deduction opportunities.
 */

import db from '../config/database.js';
import { expenses, taxCategories, users } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import AppError from '../utils/AppError.js';

class DeductionTrackingService {
    /**
     * Common tax deduction categories by jurisdiction
     */
    DEDUCTION_CATEGORIES = {
        'business-supplies': { limitPerYear: null, description: 'Office supplies, equipment <$2,500' },
        'home-office': { limitPerYear: 5000, description: 'Home office deduction (simplified $5/sqft or actual)' },
        'meals-entertainment': { limitPerYear: null, description: 'Business meals (50% deductible)' },
        'vehicle-mileage': { limitPerYear: null, description: 'Business vehicle mileage (record miles)' },
        'professional-fees': { limitPerYear: null, description: 'Tax prep, accounting, legal fees' },
        'subscriptions': { limitPerYear: null, description: 'Professional subscriptions, software' },
        'continuing-education': { limitPerYear: null, description: 'Professional development, courses' },
        'health-insurance': { limitPerYear: null, description: 'Self-employed health insurance (100%)' },
        'retirement-contributions': { limitPerYear: 69000, description: 'Solo 401k, SEP-IRA contributions (2024)' },
        'home-depreciation': { limitPerYear: null, description: 'Real estate depreciation' },
        'charitable-donations': { limitPerYear: null, description: 'Qualified charitable contributions' },
        'medical-expenses': { limitPerYear: null, description: 'Deductible medical over 7.5% AGI' },
        'student-loan-interest': { limitPerYear: 2500, description: 'Student loan interest deduction' },
        'capital-losses': { limitPerYear: 3000, description: 'Capital losses offset gains + $3k ordinary income' },
        'business-use-technology': { limitPerYear: null, description: 'Business tech, computers, software' },
        'travel': { limitPerYear: null, description: 'Business travel (airfare, lodging, meals 50%)' },
        'equipment-depreciation': { limitPerYear: null, description: 'Depreciation on business equipment' },
        'insurance-business': { limitPerYear: null, description: 'Business liability, errors & omissions insurance' }
    };

    /**
     * Auto-categorize expense as deductible or not, and assign tax category
     * Uses keyword matching and expense patterns
     */
    async categorizeExpenseForTax(expense) {
        const { description, amount, category, merchantName, notes } = expense;
        const text = `${description} ${category} ${merchantName} ${notes}`.toLowerCase();

        let suggestedCategory = null;
        let isDeductible = false;
        let confidence = 0;
        let reasoning = [];

        // Keyword-based matching for common deductions
        const keywords = {
            'business-supplies': ['office supply', 'staples', 'uline', 'amazon business', 'pen', 'paper', 'notebook', 'software', 'tools'],
            'home-office': ['home office', 'office furniture', 'desk', 'chair', 'internet', 'phone bill', 'utility'],
            'meals-entertainment': ['restaurant', 'coffee', 'lunch', 'dinner', 'catering', 'cafe', 'meal', 'food delivery'],
            'vehicle-mileage': ['uber', 'lyft', 'taxi', 'gas', 'parking', 'toll', 'car rental', 'mileage'],
            'professional-fees': ['cpa', 'accountant', 'tax prep', 'payroll service', 'bookkeeper', 'attorney', 'lawyer'],
            'subscriptions': ['subscription', 'annual fee', 'monthly fee', 'saas', 'software as a service'],
            'continuing-education': ['course', 'training', 'certification', 'conference', 'webinar', 'udemy', 'coursera'],
            'health-insurance': ['health insurance', 'medical insurance', 'premium', 'hsa', 'selfemployed health'],
            'travel': ['flight', 'hotel', 'airbnb', 'airline', 'motel', 'lodging', 'travel', 'trip'],
            'business-use-technology': ['laptop', 'computer', 'ipad', 'phone', 'google', 'microsoft', 'adobe', 'slack'],
            'charitable-donations': ['charity', 'donation', 'nonprofit', '501c3', 'red cross', 'salvation army', 'goodwill'],
            'medical-expenses': ['pharmacy', 'drug store', 'prescription', 'doctor', 'hospital', 'clinic', 'dental'],
            'student-loan-interest': ['student loan', 'sallie mae', 'nelnet', 'navient']
        };

        // Check against keywords
        for (const [taxCat, words] of Object.entries(keywords)) {
            const matches = words.filter(word => text.includes(word));
            if (matches.length > 0) {
                const matchConfidence = Math.min(100, (matches.length / words.length) * 100);
                if (matchConfidence > confidence) {
                    suggestedCategory = taxCat;
                    confidence = matchConfidence;
                    reasoning.push(`Matched keywords: ${matches.join(', ')}`);
                }
            }
        }

        // Determine deductibility
        if (suggestedCategory) {
            isDeductible = true;
            
            // Special rules for certain categories
            if (suggestedCategory === 'meals-entertainment') {
                reasoning.push('Note: Only 50% of meal expenses are deductible');
            }
            if (suggestedCategory === 'vehicle-mileage') {
                reasoning.push('Requires detailed mileage log for substantiation');
            }
            if (suggestedCategory === 'capital-losses') {
                reasoning.push('Can offset capital gains + $3,000 of ordinary income per year');
            }
        }

        return {
            isDeductible,
            suggestedCategory,
            confidence: Math.round(confidence),
            reasoning,
            estimationPercentage: this._getDeductionPercentage(suggestedCategory),
            limit: suggestedCategory ? this.DEDUCTION_CATEGORIES[suggestedCategory].limitPerYear : null
        };
    }

    /**
     * Track all deductions for a user in a tax year
     */
    async trackDeductionsForYear(userId, taxYear) {
        const startDate = new Date(`${taxYear}-01-01`);
        const endDate = new Date(`${taxYear}-12-31`);

        // Get all expenses marked as tax deductible
        const deductibleExpenses = await db.select().from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.isTaxDeductible, true),
                gte(expenses.date, startDate),
                lte(expenses.date, endDate)
            ))
            .orderBy(expenses.date);

        // Categorize and aggregate
        const summary = {
            taxYear,
            totalDeductions: 0,
            byCategory: {},
            expenses: [],
            warnings: []
        };

        for (const exp of deductibleExpenses) {
            const categorization = await this.categorizeExpenseForTax(exp);
            if (!categorization.isDeductible) continue;

            const cat = categorization.suggestedCategory;
            if (!summary.byCategory[cat]) {
                summary.byCategory[cat] = {
                    category: cat,
                    count: 0,
                    total: 0,
                    limit: categorization.limit,
                    items: []
                };
            }

            const amount = parseFloat(exp.amount);
            const deductibleAmount = amount * categorization.estimationPercentage;

            summary.byCategory[cat].count += 1;
            summary.byCategory[cat].total += deductibleAmount;
            summary.byCategory[cat].items.push({
                date: exp.date,
                description: exp.description,
                amount,
                deductibleAmount,
                percentage: categorization.estimationPercentage
            });

            summary.totalDeductions += deductibleAmount;

            // Check limits
            if (categorization.limit && summary.byCategory[cat].total > categorization.limit) {
                summary.warnings.push(
                    `${cat}: Total (${summary.byCategory[cat].total}) exceeds annual limit (${categorization.limit})`
                );
            }

            summary.expenses.push({
                ...exp,
                categorization
            });
        }

        return summary;
    }

    /**
     * Find missed deduction opportunities in uncategorized expenses
     */
    async findMissedDeductions(userId, taxYear) {
        const startDate = new Date(`${taxYear}-01-01`);
        const endDate = new Date(`${taxYear}-12-31`);

        // Get uncategorized or non-deductible expenses
        const uncategorized = await db.select().from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.isTaxDeductible, false),
                gte(expenses.date, startDate),
                lte(expenses.date, endDate)
            ));

        const opportunities = [];

        for (const exp of uncategorized) {
            const categorization = await this.categorizeExpenseForTax(exp);
            
            // Only suggest if confidence > 40% and it's deductible
            if (categorization.isDeductible && categorization.confidence > 40) {
                opportunities.push({
                    expense: exp,
                    suggestion: categorization.suggestedCategory,
                    confidence: categorization.confidence,
                    potentialTaxSavings: parseFloat(exp.amount) * categorization.estimationPercentage * 0.22, // Assume 22% tax bracket
                    reasoning: categorization.reasoning
                });
            }
        }

        // Sort by potential savings (highest first)
        opportunities.sort((a, b) => b.potentialTaxSavings - a.potentialTaxSavings);

        return {
            opportunityCount: opportunities.length,
            totalPotentialSavings: opportunities.reduce((sum, opp) => sum + opp.potentialTaxSavings, 0),
            opportunities
        };
    }

    /**
     * Get deduction summary by category with utilization
     */
    async getDeductionSummary(userId, taxYear) {
        const tracking = await this.trackDeductionsForYear(userId, taxYear);
        
        const summary = {
            taxYear,
            totalDeductions: parseFloat(tracking.totalDeductions.toFixed(2)),
            categories: []
        };

        for (const [cat, data] of Object.entries(tracking.byCategory)) {
            const utilized = data.limit ? Math.round((data.total / data.limit) * 100) : null;
            summary.categories.push({
                category: cat,
                count: data.count,
                total: parseFloat(data.total.toFixed(2)),
                limit: data.limit,
                utilization: utilized,
                isLimited: data.limit && data.total > data.limit ? true : false
            });
        }

        return summary;
    }

    /**
     * Get business expense breakdown
     */
    async getBusinessExpenseBreakdown(userId, taxYear) {
        const startDate = new Date(`${taxYear}-01-01`);
        const endDate = new Date(`${taxYear}-12-31`);

        // Fetch expenses marked as business-related
        const businessExpenses = await db.select().from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                gte(expenses.date, startDate),
                lte(expenses.date, endDate)
            ));

        const breakdown = {
            taxYear,
            totalExpenses: 0,
            categories: {},
            monthly: {},
            topExpenses: []
        };

        for (const exp of businessExpenses) {
            const cat = exp.category || 'uncategorized';
            const amount = parseFloat(exp.amount);

            // By category
            if (!breakdown.categories[cat]) {
                breakdown.categories[cat] = { count: 0, total: 0 };
            }
            breakdown.categories[cat].count += 1;
            breakdown.categories[cat].total += amount;

            // By month
            const month = exp.date.toISOString().substring(0, 7);
            if (!breakdown.monthly[month]) {
                breakdown.monthly[month] = 0;
            }
            breakdown.monthly[month] += amount;

            breakdown.totalExpenses += amount;
            breakdown.topExpenses.push({ ...exp, amount });
        }

        // Sort top expenses
        breakdown.topExpenses.sort((a, b) => b.amount - a.amount);
        breakdown.topExpenses = breakdown.topExpenses.slice(0, 10);

        // Format totals
        breakdown.totalExpenses = parseFloat(breakdown.totalExpenses.toFixed(2));
        for (const cat of Object.keys(breakdown.categories)) {
            breakdown.categories[cat].total = parseFloat(breakdown.categories[cat].total.toFixed(2));
        }

        return breakdown;
    }

    /**
     * Estimate tax impact of deductions
     */
    async estimateTaxImpactOfDeductions(userId, taxYear, marginalTaxRate = 0.22) {
        const summary = await this.getDeductionSummary(userId, taxYear);

        return {
            totalDeductions: summary.totalDeductions,
            marginalTaxRate: marginalTaxRate * 100,
            estimatedTaxSavings: summary.totalDeductions * marginalTaxRate,
            breakdown: summary.categories.map(cat => ({
                category: cat.category,
                deduction: cat.total,
                taxSavings: cat.total * marginalTaxRate
            }))
        };
    }

    // ====== PRIVATE HELPERS ======

    /**
     * Get deductible percentage for a category
     * Some categories are only partially deductible
     */
    _getDeductionPercentage(category) {
        const percentages = {
            'meals-entertainment': 0.50,  // 50% deductible
            'vehicle-mileage': 1.0,
            'medical-expenses': 1.0,
            'charitable-donations': 1.0,
            'student-loan-interest': 1.0,
            'capital-losses': 1.0,
            'home-office': 1.0,
            'health-insurance': 1.0,
            'retirement-contributions': 1.0,
            'default': 1.0
        };

        return percentages[category] || percentages['default'];
    }
}

export default new DeductionTrackingService();
