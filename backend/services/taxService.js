import db from '../config/db.js';
import { expenses, taxCategories, taxReports, categories } from '../db/schema.js';
import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';

/**
 * Tax Service - Handles tax-related operations including deductions,
 * tax category management, and report generation
 */
class TaxService {
    /**
     * Get all tax categories
     * @param {Object} filters - Optional filters
     * @param {string} filters.type - Filter by category type (deduction, credit, exemption)
     * @param {boolean} filters.activeOnly - Only return active categories
     * @returns {Promise<Array>} Array of tax categories
     */
    async getTaxCategories(filters = {}) {
        try {
            let query = db.select().from(taxCategories);

            if (filters.type) {
                query = query.where(eq(taxCategories.categoryType, filters.type));
            }

            if (filters.activeOnly !== false) {
                query = query.where(eq(taxCategories.isActive, true));
            }

            const categories = await query.orderBy(asc(taxCategories.name));
            return categories;
        } catch (error) {
            console.error('Error fetching tax categories:', error);
            throw new Error('Failed to fetch tax categories');
        }
    }

    /**
     * Get a single tax category by ID
     * @param {string} categoryId - Tax category ID
     * @returns {Promise<Object>} Tax category object
     */
    async getTaxCategoryById(categoryId) {
        try {
            const [category] = await db
                .select()
                .from(taxCategories)
                .where(eq(taxCategories.id, categoryId))
                .limit(1);

            return category || null;
        } catch (error) {
            console.error('Error fetching tax category:', error);
            throw new Error('Failed to fetch tax category');
        }
    }

    /**
     * Get tax-deductible expenses for a user
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @param {number} options.taxYear - Tax year to filter by
     * @param {string} options.categoryId - Filter by specific tax category
     * @param {number} options.page - Page number for pagination
     * @param {number} options.limit - Items per page
     * @returns {Promise<Object>} Object containing expenses and pagination info
     */
    async getTaxDeductibleExpenses(userId, options = {}) {
        try {
            const {
                taxYear = new Date().getFullYear(),
                categoryId,
                page = 1,
                limit = 50
            } = options;

            const offset = (page - 1) * limit;

            // Build where conditions
            let whereConditions = [
                eq(expenses.userId, userId),
                eq(expenses.isTaxDeductible, true),
                eq(expenses.status, 'completed')
            ];

            if (taxYear) {
                whereConditions.push(eq(expenses.taxYear, taxYear));
            }

            if (categoryId) {
                whereConditions.push(eq(expenses.taxCategoryId, categoryId));
            }

            // Get total count
            const countResult = await db
                .select({ count: sql`count(*)` })
                .from(expenses)
                .where(and(...whereConditions));

            const totalCount = parseInt(countResult[0].count);

            // Get expenses with category information
            const deductibleExpenses = await db
                .select({
                    id: expenses.id,
                    amount: expenses.amount,
                    currency: expenses.currency,
                    description: expenses.description,
                    date: expenses.date,
                    taxYear: expenses.taxYear,
                    taxNotes: expenses.taxNotes,
                    category: {
                        id: categories.id,
                        name: categories.name,
                        color: categories.color,
                        icon: categories.icon
                    },
                    taxCategory: {
                        id: taxCategories.id,
                        code: taxCategories.code,
                        name: taxCategories.name,
                        categoryType: taxCategories.categoryType,
                        irsReference: taxCategories.irsReference
                    }
                })
                .from(expenses)
                .leftJoin(categories, eq(expenses.categoryId, categories.id))
                .leftJoin(taxCategories, eq(expenses.taxCategoryId, taxCategories.id))
                .where(and(...whereConditions))
                .orderBy(desc(expenses.date))
                .limit(limit)
                .offset(offset);

            return {
                expenses: deductibleExpenses,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    hasMore: offset + deductibleExpenses.length < totalCount
                }
            };
        } catch (error) {
            console.error('Error fetching tax deductible expenses:', error);
            throw new Error('Failed to fetch tax deductible expenses');
        }
    }

    /**
     * Get tax summary for a specific year
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {Promise<Object>} Tax summary object
     */
    async getTaxSummary(userId, taxYear = new Date().getFullYear()) {
        try {
            // Get total deductions by category
            const deductionsByCategory = await db
                .select({
                    taxCategoryId: expenses.taxCategoryId,
                    categoryCode: taxCategories.code,
                    categoryName: taxCategories.name,
                    categoryType: taxCategories.categoryType,
                    totalAmount: sql`sum(${expenses.amount})`,
                    count: sql`count(*)`,
                    irsReference: taxCategories.irsReference
                })
                .from(expenses)
                .leftJoin(taxCategories, eq(expenses.taxCategoryId, taxCategories.id))
                .where(and(
                    eq(expenses.userId, userId),
                    eq(expenses.isTaxDeductible, true),
                    eq(expenses.taxYear, taxYear),
                    eq(expenses.status, 'completed')
                ))
                .groupBy(
                    expenses.taxCategoryId,
                    taxCategories.code,
                    taxCategories.name,
                    taxCategories.categoryType,
                    taxCategories.irsReference
                )
                .orderBy(desc(sql`sum(${expenses.amount})`));

            // Calculate totals
            const totalDeductions = deductionsByCategory.reduce(
                (sum, cat) => sum + parseFloat(cat.totalAmount || 0),
                0
            );

            const totalExpenses = deductionsByCategory.reduce(
                (sum, cat) => sum + parseInt(cat.count),
                0
            );

            // Get potential deductions (expenses not yet marked as tax deductible)
            const potentialDeductions = await this.getPotentialDeductions(userId, taxYear);

            return {
                taxYear,
                summary: {
                    totalDeductions,
                    totalExpenses,
                    currency: 'USD' // Could be dynamic based on user preference
                },
                deductionsByCategory,
                potentialDeductions,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error generating tax summary:', error);
            throw new Error('Failed to generate tax summary');
        }
    }

    /**
     * Get potential tax deductions (expenses that might qualify)
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {Promise<Array>} Array of potential deductions
     */
    async getPotentialDeductions(userId, taxYear) {
        try {
            // Keywords that might indicate tax-deductible expenses
            const deductibleKeywords = [
                'medical', 'doctor', 'hospital', 'pharmacy', 'prescription',
                'charity', 'donation', 'church', 'nonprofit',
                'office', 'business', 'supplies', 'professional',
                'education', 'tuition', 'books', 'course',
                'mortgage', 'interest', 'property tax',
                'student loan', 'interest'
            ];

            // Build ILIKE conditions for each keyword
            const keywordConditions = deductibleKeywords.map(keyword => 
                sql`${expenses.description} ILIKE ${`%${keyword}%`}`
            );

            const potentialExpenses = await db
                .select({
                    id: expenses.id,
                    amount: expenses.amount,
                    description: expenses.description,
                    date: expenses.date,
                    category: {
                        id: categories.id,
                        name: categories.name
                    }
                })
                .from(expenses)
                .leftJoin(categories, eq(expenses.categoryId, categories.id))
                .where(and(
                    eq(expenses.userId, userId),
                    eq(expenses.taxYear, taxYear),
                    eq(expenses.isTaxDeductible, false),
                    eq(expenses.status, 'completed'),
                    sql`(${sql.join(keywordConditions, sql` OR `)})`
                ))
                .orderBy(desc(expenses.amount))
                .limit(20);

            return potentialExpenses;
        } catch (error) {
            console.error('Error fetching potential deductions:', error);
            return []; // Return empty array on error to not break the summary
        }
    }

    /**
     * Mark an expense as tax deductible
     * @param {string} userId - User ID
     * @param {string} expenseId - Expense ID
     * @param {Object} taxData - Tax-related data
     * @param {string} taxData.taxCategoryId - Tax category ID
     * @param {number} taxData.taxYear - Tax year
     * @param {string} taxData.taxNotes - Additional tax notes
     * @returns {Promise<Object>} Updated expense
     */
    async markAsTaxDeductible(userId, expenseId, taxData) {
        try {
            const { taxCategoryId, taxYear, taxNotes } = taxData;

            // Verify the expense belongs to the user
            const [expense] = await db
                .select()
                .from(expenses)
                .where(and(
                    eq(expenses.id, expenseId),
                    eq(expenses.userId, userId)
                ))
                .limit(1);

            if (!expense) {
                throw new Error('Expense not found or access denied');
            }

            // If taxYear not provided, derive from expense date
            const year = taxYear || new Date(expense.date).getFullYear();

            // Update the expense
            const [updatedExpense] = await db
                .update(expenses)
                .set({
                    isTaxDeductible: true,
                    taxCategoryId: taxCategoryId || null,
                    taxYear: year,
                    taxNotes: taxNotes || null,
                    updatedAt: new Date()
                })
                .where(eq(expenses.id, expenseId))
                .returning();

            // Log audit event
            await logAuditEventAsync({
                userId,
                action: AuditActions.EXPENSE_UPDATE,
                resourceType: ResourceTypes.EXPENSE,
                resourceId: expenseId,
                metadata: {
                    isTaxDeductible: true,
                    taxCategoryId,
                    taxYear: year,
                    taxNotes
                },
                status: 'success'
            });

            return updatedExpense;
        } catch (error) {
            console.error('Error marking expense as tax deductible:', error);
            throw error;
        }
    }

    /**
     * Remove tax deductible status from an expense
     * @param {string} userId - User ID
     * @param {string} expenseId - Expense ID
     * @returns {Promise<Object>} Updated expense
     */
    async removeTaxDeductibleStatus(userId, expenseId) {
        try {
            const [updatedExpense] = await db
                .update(expenses)
                .set({
                    isTaxDeductible: false,
                    taxCategoryId: null,
                    taxYear: null,
                    taxNotes: null,
                    updatedAt: new Date()
                })
                .where(and(
                    eq(expenses.id, expenseId),
                    eq(expenses.userId, userId)
                ))
                .returning();

            if (!updatedExpense) {
                throw new Error('Expense not found or access denied');
            }

            // Log audit event
            await logAuditEventAsync({
                userId,
                action: AuditActions.EXPENSE_UPDATE,
                resourceType: ResourceTypes.EXPENSE,
                resourceId: expenseId,
                metadata: {
                    isTaxDeductible: false,
                    removedTaxStatus: true
                },
                status: 'success'
            });

            return updatedExpense;
        } catch (error) {
            console.error('Error removing tax deductible status:', error);
            throw error;
        }
    }

    /**
     * Generate a tax report
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @param {string} reportType - Type of report (summary, detailed, schedule_c, schedule_a)
     * @param {string} format - Report format (pdf, excel, csv)
     * @returns {Promise<Object>} Generated report metadata
     */
    async generateTaxReport(userId, taxYear, reportType = 'summary', format = 'pdf') {
        try {
            // Get tax summary data
            const taxSummary = await this.getTaxSummary(userId, taxYear);

            // In a real implementation, you would:
            // 1. Generate the actual report file (PDF, Excel, CSV)
            // 2. Upload to cloud storage
            // 3. Store the URL in the database

            // For now, we'll create a placeholder report record
            const reportData = {
                userId,
                taxYear,
                reportType,
                format,
                url: `/reports/tax/${userId}/${taxYear}/${reportType}.${format}`, // Placeholder URL
                totalDeductions: taxSummary.summary.totalDeductions.toString(),
                totalCredits: '0', // Would be calculated based on credits
                status: 'generated',
                metadata: {
                    expenseCount: taxSummary.summary.totalExpenses,
                    categoriesIncluded: taxSummary.deductionsByCategory.map(c => c.categoryCode),
                    generatedBy: 'system',
                    generatedAt: new Date().toISOString()
                }
            };

            const [report] = await db
                .insert(taxReports)
                .values(reportData)
                .returning();

            // Log audit event
            await logAuditEventAsync({
                userId,
                action: AuditActions.REPORT_CREATE,
                resourceType: ResourceTypes.REPORT,
                resourceId: report.id,
                metadata: {
                    taxYear,
                    reportType,
                    format,
                    totalDeductions: taxSummary.summary.totalDeductions
                },
                status: 'success'
            });

            return {
                ...report,
                summary: taxSummary
            };
        } catch (error) {
            console.error('Error generating tax report:', error);
            throw new Error('Failed to generate tax report');
        }
    }

    /**
     * Get all tax reports for a user
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of tax reports
     */
    async getTaxReports(userId, options = {}) {
        try {
            const { taxYear, limit = 20 } = options;

            let query = db
                .select()
                .from(taxReports)
                .where(eq(taxReports.userId, userId))
                .orderBy(desc(taxReports.createdAt))
                .limit(limit);

            if (taxYear) {
                query = query.where(eq(taxReports.taxYear, taxYear));
            }

            const reports = await query;
            return reports;
        } catch (error) {
            console.error('Error fetching tax reports:', error);
            throw new Error('Failed to fetch tax reports');
        }
    }

    /**
     * Bulk update expenses with tax information
     * @param {string} userId - User ID
     * @param {Array<string>} expenseIds - Array of expense IDs
     * @param {Object} taxData - Tax data to apply
     * @returns {Promise<Object>} Result of bulk update
     */
    async bulkUpdateTaxStatus(userId, expenseIds, taxData) {
        try {
            const { taxCategoryId, taxYear, isTaxDeductible } = taxData;

            const results = {
                updated: 0,
                failed: 0,
                errors: []
            };

            for (const expenseId of expenseIds) {
                try {
                    await db
                        .update(expenses)
                        .set({
                            isTaxDeductible: isTaxDeductible !== undefined ? isTaxDeductible : true,
                            taxCategoryId: taxCategoryId || null,
                            taxYear: taxYear || null,
                            updatedAt: new Date()
                        })
                        .where(and(
                            eq(expenses.id, expenseId),
                            eq(expenses.userId, userId)
                        ));

                    results.updated++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({ expenseId, error: error.message });
                }
            }

            // Log audit event
            await logAuditEventAsync({
                userId,
                action: AuditActions.EXPENSE_BULK_UPDATE,
                resourceType: ResourceTypes.EXPENSE,
                metadata: {
                    count: results.updated,
                    taxCategoryId,
                    taxYear,
                    isTaxDeductible
                },
                status: results.failed === 0 ? 'success' : 'partial'
            });

            return results;
        } catch (error) {
            console.error('Error in bulk tax update:', error);
            throw new Error('Failed to perform bulk tax update');
        }
    }

    /**
     * Get tax suggestions for expenses
     * @param {string} userId - User ID
     * @param {number} taxYear - Tax year
     * @returns {Promise<Array>} Array of suggestions
     */
    async getTaxSuggestions(userId, taxYear) {
        try {
            const suggestions = [];

            // Get potential deductions
            const potentialDeductions = await this.getPotentialDeductions(userId, taxYear);

            // Categorize suggestions
            for (const expense of potentialDeductions) {
                const description = expense.description.toLowerCase();
                let suggestedCategory = null;
                let confidence = 'low';

                // Simple keyword matching (could be enhanced with ML)
                if (description.includes('medical') || description.includes('doctor') || 
                    description.includes('hospital') || description.includes('pharmacy')) {
                    suggestedCategory = 'DED_MEDICAL';
                    confidence = 'high';
                } else if (description.includes('charity') || description.includes('donation') || 
                           description.includes('church')) {
                    suggestedCategory = 'DED_CHARITY';
                    confidence = 'high';
                } else if (description.includes('office') || description.includes('business') || 
                           description.includes('supplies')) {
                    suggestedCategory = 'DED_BUSINESS';
                    confidence = 'medium';
                } else if (description.includes('education') || description.includes('tuition') || 
                           description.includes('course')) {
                    suggestedCategory = 'DED_EDUCATION';
                    confidence = 'medium';
                }

                if (suggestedCategory) {
                    suggestions.push({
                        expenseId: expense.id,
                        description: expense.description,
                        amount: expense.amount,
                        suggestedCategory,
                        confidence,
                        reason: `Keyword match in description: "${expense.description}"`
                    });
                }
            }

            return suggestions;
        } catch (error) {
            console.error('Error generating tax suggestions:', error);
            return [];
        }
    }
}

export default new TaxService();
