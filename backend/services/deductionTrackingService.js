// Deduction Tracking Service - Auto-detect and track deductible expenses
// Issue #641: Real-Time Tax Optimization & Deduction Tracking

import { db } from '../db/index.js';
import { taxDeductions, expenses, taxProfiles, taxDocuments } from '../db/schema.js';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

class DeductionTrackingService {
    constructor() {
        // Deduction rules for auto-detection
        this.deductionRules = {
            business_expense: {
                keywords: ['office', 'supplies', 'software', 'subscription', 'saas', 'cloud', 'hosting', 'domain', 'aws', 'azure', 'google cloud'],
                deductionType: 'business',
                irsForm: 'Schedule C',
                confidenceThreshold: 70,
            },
            home_office: {
                keywords: ['utilities', 'internet', 'electricity', 'rent', 'mortgage interest'],
                deductionType: 'business',
                irsForm: 'Form 8829',
                confidenceThreshold: 60,
            },
            vehicle_mileage: {
                keywords: ['gas', 'fuel', 'parking', 'tolls', 'car wash', 'uber', 'lyft'],
                deductionType: 'business',
                irsForm: 'Schedule C',
                confidenceThreshold: 65,
            },
            medical: {
                keywords: ['hospital', 'doctor', 'pharmacy', 'prescription', 'medical', 'health', 'dental', 'vision', 'therapy'],
                deductionType: 'itemized',
                irsForm: 'Schedule A',
                confidenceThreshold: 75,
            },
            charitable: {
                keywords: ['charity', 'donation', 'nonprofit', 'goodwill', 'salvation army', 'red cross', 'foundation'],
                deductionType: 'itemized',
                irsForm: 'Schedule A',
                confidenceThreshold: 80,
            },
            education: {
                keywords: ['tuition', 'textbook', 'student loan', 'course', 'university', 'college', 'school'],
                deductionType: 'above_the_line',
                irsForm: 'Form 1098-E',
                confidenceThreshold: 75,
            },
            state_tax: {
                keywords: ['state tax', 'property tax', 'dmv', 'registration'],
                deductionType: 'itemized',
                irsForm: 'Schedule A',
                confidenceThreshold: 85,
            },
        };

        // Standard mileage rates (2026 estimate)
        this.mileageRates = {
            business: 0.67, // $0.67 per mile
            medical: 0.21,  // $0.21 per mile
            charitable: 0.14, // $0.14 per mile (fixed by law)
        };
    }

    /**
     * Auto-detect deductible expenses
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {array} Detected deductible expenses
     */
    async autoDetectDeductions(userId, taxYear = new Date().getFullYear()) {
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

            // Get expenses for the year
            const yearStart = new Date(taxYear, 0, 1);
            const yearEnd = new Date(taxYear, 11, 31);

            const expenseList = await db.select()
                .from(expenses)
                .where(and(
                    eq(expenses.userId, userId),
                    gte(expenses.expenseDate, yearStart),
                    lte(expenses.expenseDate, yearEnd),
                    eq(expenses.isDeductible, false) // Only untracked expenses
                ));

            const detectedDeductions = [];

            for (const expense of expenseList) {
                const detection = await this.detectDeductionCategory(expense, profile);
                
                if (detection && detection.confidence >= detection.threshold) {
                    detectedDeductions.push({
                        expense,
                        detection,
                    });
                }
            }

            return {
                success: true,
                count: detectedDeductions.length,
                deductions: detectedDeductions,
            };

        } catch (error) {
            console.error('Error auto-detecting deductions:', error);
            throw error;
        }
    }

    /**
     * Detect deduction category for an expense
     */
    async detectDeductionCategory(expense, profile) {
        const description = expense.description?.toLowerCase() || '';
        const vendor = expense.vendor?.toLowerCase() || '';
        const category = expense.category?.toLowerCase() || '';
        const searchText = `${description} ${vendor} ${category}`;

        let bestMatch = null;
        let highestConfidence = 0;

        for (const [deductionCategory, rules] of Object.entries(this.deductionRules)) {
            let matchCount = 0;

            for (const keyword of rules.keywords) {
                if (searchText.includes(keyword)) {
                    matchCount++;
                }
            }

            if (matchCount > 0) {
                // Calculate confidence score
                let confidence = (matchCount / rules.keywords.length) * 100;

                // Boost confidence for self-employed users
                if (profile.isSelfEmployed && deductionCategory === 'business_expense') {
                    confidence += 15;
                }

                // Boost confidence if category matches
                if (category.includes('business') && deductionCategory === 'business_expense') {
                    confidence += 10;
                }

                confidence = Math.min(100, confidence);

                if (confidence > highestConfidence && confidence >= rules.confidenceThreshold) {
                    highestConfidence = confidence;
                    bestMatch = {
                        category: deductionCategory,
                        deductionType: rules.deductionType,
                        irsForm: rules.irsForm,
                        confidence: Math.round(confidence),
                        threshold: rules.confidenceThreshold,
                        matchedKeywords: rules.keywords.filter(k => searchText.includes(k)),
                    };
                }
            }
        }

        return bestMatch;
    }

    /**
     * Track an expense as deductible
     * @param {string} userId - User ID
     * @param {string} expenseId - Expense ID
     * @param {object} deductionDetails - Deduction details
     * @returns {object} Created deduction
     */
    async trackDeduction(userId, expenseId, deductionDetails) {
        try {
            // Get the expense
            const [expense] = await db.select()
                .from(expenses)
                .where(and(
                    eq(expenses.id, expenseId),
                    eq(expenses.userId, userId)
                ))
                .limit(1);

            if (!expense) {
                throw new Error('Expense not found');
            }

            // Create deduction record
            const [deduction] = await db.insert(taxDeductions).values({
                userId,
                expenseId,
                deductionCategory: deductionDetails.category,
                deductionType: deductionDetails.deductionType || 'itemized',
                amount: deductionDetails.amount || expense.amount,
                deductionDate: expense.expenseDate,
                taxYear: deductionDetails.taxYear || new Date(expense.expenseDate).getFullYear(),
                description: deductionDetails.description || expense.description,
                notes: deductionDetails.notes,
                vendor: expense.vendor,
                receiptUrl: expense.receiptUrl,
                isAutoDetected: deductionDetails.isAutoDetected || false,
                confidenceScore: deductionDetails.confidence,
                irsForm: deductionDetails.irsForm,
            }).returning();

            // Mark expense as deductible
            await db.update(expenses)
                .set({
                    isDeductible: true,
                    deductionCategory: deductionDetails.category,
                })
                .where(eq(expenses.id, expenseId));

            return {
                success: true,
                deduction,
                message: 'Expense tracked as deductible',
            };

        } catch (error) {
            console.error('Error tracking deduction:', error);
            throw error;
        }
    }

    /**
     * Calculate home office deduction
     * @param {string} userId - User ID
     * @param {object} homeOfficeDetails - Home office details
     * @returns {object} Calculated deduction
     */
    async calculateHomeOfficeDeduction(userId, homeOfficeDetails, taxYear = new Date().getFullYear()) {
        try {
            const {
                method,  // 'simplified' or 'regular'
                squareFeet, // For simplified method (max 300 sq ft)
                homeSquareFeet, // Total home square feet
                officeSquareFeet, // Office square feet
                rentOrMortgage, // Annual rent or mortgage
                utilities, // Annual utilities
                insurance, // Annual insurance
                repairs, // Annual repairs
                depreciation, // Annual depreciation
            } = homeOfficeDetails;

            let deductionAmount = 0;
            let calculationDetails = {};

            if (method === 'simplified') {
                // Simplified method: $5 per square foot (max 300 sq ft)
                const maxSquareFeet = Math.min(squareFeet || 0, 300);
                deductionAmount = maxSquareFeet * 5;
                
                calculationDetails = {
                    method: 'simplified',
                    squareFeet: maxSquareFeet,
                    ratePerSquareFoot: 5,
                    totalDeduction: deductionAmount,
                };

            } else if (method === 'regular') {
                // Regular method: Percentage of home expenses
                const percentage = officeSquareFeet / homeSquareFeet;
                
                const totalExpenses = {
                    rentOrMortgage: rentOrMortgage || 0,
                    utilities: utilities || 0,
                    insurance: insurance || 0,
                    repairs: repairs || 0,
                    depreciation: depreciation || 0,
                };

                const totalHomeExpenses = Object.values(totalExpenses).reduce((sum, val) => sum + val, 0);
                deductionAmount = totalHomeExpenses * percentage;

                calculationDetails = {
                    method: 'regular',
                    businessPercentage: (percentage * 100).toFixed(2) + '%',
                    officeSquareFeet,
                    homeSquareFeet,
                    expenses: totalExpenses,
                    totalHomeExpenses,
                    totalDeduction: deductionAmount,
                };
            }

            // Create deduction record
            const [deduction] = await db.insert(taxDeductions).values({
                userId,
                deductionCategory: 'home_office',
                deductionType: 'business',
                amount: deductionAmount,
                deductionDate: new Date(`${taxYear}-12-31`),
                taxYear,
                description: `Home office deduction (${method} method)`,
                notes: JSON.stringify(calculationDetails),
                irsForm: 'Form 8829',
            }).returning();

            return {
                success: true,
                deduction,
                calculationDetails,
            };

        } catch (error) {
            console.error('Error calculating home office deduction:', error);
            throw error;
        }
    }

    /**
     * Track mileage for deduction
     * @param {string} userId - User ID
     * @param {object} mileageDetails - Mileage details
     * @returns {object} Created deduction
     */
    async trackMileageDeduction(userId, mileageDetails, taxYear = new Date().getFullYear()) {
        try {
            const {
                milesDriven,
                purpose, // 'business', 'medical', 'charitable'
                date,
                startLocation,
                endLocation,
                description,
            } = mileageDetails;

            const rate = this.mileageRates[purpose] || this.mileageRates.business;
            const deductionAmount = milesDriven * rate;

            const [deduction] = await db.insert(taxDeductions).values({
                userId,
                deductionCategory: `${purpose}_mileage`,
                deductionType: purpose === 'business' ? 'business' : 'itemized',
                amount: deductionAmount,
                deductionDate: new Date(date),
                taxYear,
                description: description || `Mileage: ${startLocation} to ${endLocation}`,
                notes: JSON.stringify({
                    milesDriven,
                    rate,
                    startLocation,
                    endLocation,
                }),
                irsForm: 'Schedule C',
            }).returning();

            return {
                success: true,
                deduction,
                calculation: {
                    milesDriven,
                    ratePerMile: rate,
                    totalDeduction: deductionAmount,
                },
            };

        } catch (error) {
            console.error('Error tracking mileage deduction:', error);
            throw error;
        }
    }

    /**
     * Get deduction summary
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {object} Deduction summary
     */
    async getDeductionSummary(userId, taxYear = new Date().getFullYear()) {
        try {
            const deductionsList = await db.select()
                .from(taxDeductions)
                .where(and(
                    eq(taxDeductions.userId, userId),
                    eq(taxDeductions.taxYear, taxYear)
                ))
                .orderBy(desc(taxDeductions.deductionDate));

            // Group by category
            const byCategory = {};
            const byType = {
                above_the_line: 0,
                itemized: 0,
                business: 0,
            };
            let totalDeductions = 0;

            for (const deduction of deductionsList) {
                const amount = parseFloat(deduction.amount);
                totalDeductions += amount;

                // By category
                if (!byCategory[deduction.deductionCategory]) {
                    byCategory[deduction.deductionCategory] = {
                        count: 0,
                        total: 0,
                        deductions: [],
                    };
                }
                byCategory[deduction.deductionCategory].count++;
                byCategory[deduction.deductionCategory].total += amount;
                byCategory[deduction.deductionCategory].deductions.push(deduction);

                // By type
                byType[deduction.deductionType] += amount;
            }

            return {
                success: true,
                taxYear,
                summary: {
                    totalDeductions,
                    count: deductionsList.length,
                    byType,
                    byCategory,
                },
                deductions: deductionsList,
            };

        } catch (error) {
            console.error('Error getting deduction summary:', error);
            throw error;
        }
    }

    /**
     * Get potential tax savings from deductions
     */
    async getPotentialSavings(userId, taxYear = new Date().getFullYear()) {
        try {
            const summary = await this.getDeductionSummary(userId, taxYear);
            
            // Get tax profile for marginal rate
            const [profile] = await db.select()
                .from(taxProfiles)
                .where(and(
                    eq(taxProfiles.userId, userId),
                    eq(taxProfiles.taxYear, taxYear)
                ))
                .limit(1);

            if (!profile) {
                return { success: false, error: 'Tax profile not found' };
            }

            // Estimate marginal tax rate (simplified)
            const estimatedMarginalRate = profile.isSelfEmployed ? 0.30 : 0.24; // 30% or 24%

            const totalDeductions = summary.summary.totalDeductions;
            const potentialSavings = totalDeductions * estimatedMarginalRate;

            return {
                success: true,
                totalDeductions,
                estimatedMarginalRate: `${(estimatedMarginalRate * 100).toFixed(0)}%`,
                potentialSavings,
                breakdown: summary.summary.byCategory,
            };

        } catch (error) {
            console.error('Error calculating potential savings:', error);
            throw error;
        }
    }

    /**
     * Export deductions for tax preparation
     */
    async exportDeductions(userId, taxYear, format = 'json') {
        try {
            const summary = await this.getDeductionSummary(userId, taxYear);

            if (format === 'csv') {
                // Generate CSV
                const headers = ['Date', 'Category', 'Type', 'Amount', 'Description', 'Vendor', 'IRS Form'];
                const rows = summary.deductions.map(d => [
                    new Date(d.deductionDate).toLocaleDateString(),
                    d.deductionCategory,
                    d.deductionType,
                    d.amount,
                    d.description || '',
                    d.vendor || '',
                    d.irsForm || '',
                ]);

                const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
                
                return {
                    success: true,
                    format: 'csv',
                    data: csv,
                };
            }

            // Default JSON format
            return {
                success: true,
                format: 'json',
                data: summary,
            };

        } catch (error) {
            console.error('Error exporting deductions:', error);
            throw error;
        }
    }

    /**
     * Link receipt/document to deduction
     */
    async linkDocument(userId, deductionId, documentDetails) {
        try {
            const [document] = await db.insert(taxDocuments).values({
                userId,
                deductionId,
                documentType: documentDetails.type || 'receipt',
                documentCategory: 'deduction',
                fileUrl: documentDetails.fileUrl,
                fileName: documentDetails.fileName,
                fileSize: documentDetails.fileSize,
                mimeType: documentDetails.mimeType,
                taxYear: documentDetails.taxYear,
                documentDate: documentDetails.date,
                amount: documentDetails.amount,
                tags: documentDetails.tags || [],
            }).returning();

            return {
                success: true,
                document,
                message: 'Document linked to deduction',
            };

        } catch (error) {
            console.error('Error linking document:', error);
            throw error;
        }
    }
}

export default new DeductionTrackingService();
