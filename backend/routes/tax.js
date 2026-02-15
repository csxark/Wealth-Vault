import express from 'express';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, taxCategories, taxReports, categories } from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import taxService from '../services/taxService.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from '../services/auditService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/tax/categories
 * Get all tax categories
 */
router.get('/categories', async (req, res) => {
    try {
        const { type, activeOnly } = req.query;
        
        const filters = {
            type: type || undefined,
            activeOnly: activeOnly !== 'false'
        };

        const categories = await taxService.getTaxCategories(filters);

        res.json({
            success: true,
            data: categories,
            count: categories.length
        });
    } catch (error) {
        console.error('Error fetching tax categories:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tax categories'
        });
    }
});

/**
 * GET /api/tax/categories/:id
 * Get a specific tax category
 */
router.get('/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const category = await taxService.getTaxCategoryById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Tax category not found'
            });
        }

        res.json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error fetching tax category:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tax category'
        });
    }
});

/**
 * GET /api/tax/deductions
 * Get tax-deductible expenses for the authenticated user
 */
router.get('/deductions', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            taxYear = new Date().getFullYear(),
            categoryId,
            page = 1,
            limit = 50
        } = req.query;

        const result = await taxService.getTaxDeductibleExpenses(userId, {
            taxYear: parseInt(taxYear),
            categoryId,
            page: parseInt(page),
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: result.expenses,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Error fetching tax deductions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tax deductions'
        });
    }
});

/**
 * GET /api/tax/summary
 * Get tax summary for a specific year
 */
router.get('/summary', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taxYear = new Date().getFullYear() } = req.query;

        const summary = await taxService.getTaxSummary(userId, parseInt(taxYear));

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Error generating tax summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate tax summary'
        });
    }
});

/**
 * GET /api/tax/potential-deductions
 * Get potential tax deductions (expenses that might qualify)
 */
router.get('/potential-deductions', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taxYear = new Date().getFullYear() } = req.query;

        const potentialDeductions = await taxService.getPotentialDeductions(
            userId,
            parseInt(taxYear)
        );

        res.json({
            success: true,
            data: potentialDeductions,
            count: potentialDeductions.length
        });
    } catch (error) {
        console.error('Error fetching potential deductions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch potential deductions'
        });
    }
});

/**
 * POST /api/tax/expenses/:expenseId/mark-deductible
 * Mark an expense as tax deductible
 */
router.post('/expenses/:expenseId/mark-deductible', async (req, res) => {
    try {
        const userId = req.user.id;
        const { expenseId } = req.params;
        const { taxCategoryId, taxYear, taxNotes } = req.body;

        const updatedExpense = await taxService.markAsTaxDeductible(
            userId,
            expenseId,
            { taxCategoryId, taxYear, taxNotes }
        );

        res.json({
            success: true,
            data: updatedExpense,
            message: 'Expense marked as tax deductible'
        });
    } catch (error) {
        console.error('Error marking expense as tax deductible:', error);
        
        if (error.message === 'Expense not found or access denied') {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to mark expense as tax deductible'
        });
    }
});

/**
 * POST /api/tax/expenses/:expenseId/remove-deductible
 * Remove tax deductible status from an expense
 */
router.post('/expenses/:expenseId/remove-deductible', async (req, res) => {
    try {
        const userId = req.user.id;
        const { expenseId } = req.params;

        const updatedExpense = await taxService.removeTaxDeductibleStatus(
            userId,
            expenseId
        );

        res.json({
            success: true,
            data: updatedExpense,
            message: 'Tax deductible status removed'
        });
    } catch (error) {
        console.error('Error removing tax deductible status:', error);
        
        if (error.message === 'Expense not found or access denied') {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to remove tax deductible status'
        });
    }
});

/**
 * POST /api/tax/bulk-update
 * Bulk update expenses with tax information
 */
router.post('/bulk-update', async (req, res) => {
    try {
        const userId = req.user.id;
        const { expenseIds, taxCategoryId, taxYear, isTaxDeductible } = req.body;

        if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'expenseIds array is required'
            });
        }

        const result = await taxService.bulkUpdateTaxStatus(userId, expenseIds, {
            taxCategoryId,
            taxYear,
            isTaxDeductible
        });

        res.json({
            success: true,
            data: result,
            message: `Updated ${result.updated} expenses`
        });
    } catch (error) {
        console.error('Error in bulk tax update:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform bulk tax update'
        });
    }
});

/**
 * GET /api/tax/suggestions
 * Get tax suggestions for expenses
 */
router.get('/suggestions', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taxYear = new Date().getFullYear() } = req.query;

        const suggestions = await taxService.getTaxSuggestions(
            userId,
            parseInt(taxYear)
        );

        res.json({
            success: true,
            data: suggestions,
            count: suggestions.length
        });
    } catch (error) {
        console.error('Error generating tax suggestions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate tax suggestions'
        });
    }
});

/**
 * POST /api/tax/reports
 * Generate a tax report
 */
router.post('/reports', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            taxYear = new Date().getFullYear(),
            reportType = 'summary',
            format = 'pdf'
        } = req.body;

        // Validate report type
        const validReportTypes = ['summary', 'detailed', 'schedule_c', 'schedule_a'];
        if (!validReportTypes.includes(reportType)) {
            return res.status(400).json({
                success: false,
                error: `Invalid report type. Must be one of: ${validReportTypes.join(', ')}`
            });
        }

        // Validate format
        const validFormats = ['pdf', 'excel', 'csv'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({
                success: false,
                error: `Invalid format. Must be one of: ${validFormats.join(', ')}`
            });
        }

        const report = await taxService.generateTaxReport(
            userId,
            parseInt(taxYear),
            reportType,
            format
        );

        res.status(201).json({
            success: true,
            data: report,
            message: 'Tax report generated successfully'
        });
    } catch (error) {
        console.error('Error generating tax report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate tax report'
        });
    }
});

/**
 * GET /api/tax/reports
 * Get all tax reports for the authenticated user
 */
router.get('/reports', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taxYear, limit = 20 } = req.query;

        const reports = await taxService.getTaxReports(userId, {
            taxYear: taxYear ? parseInt(taxYear) : undefined,
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: reports,
            count: reports.length
        });
    } catch (error) {
        console.error('Error fetching tax reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tax reports'
        });
    }
});

/**
 * GET /api/tax/reports/:id
 * Get a specific tax report
 */
router.get('/reports/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const [report] = await db
            .select()
            .from(taxReports)
            .where(and(
                eq(taxReports.id, id),
                eq(taxReports.userId, userId)
            ))
            .limit(1);

        if (!report) {
            return res.status(404).json({
                success: false,
                error: 'Tax report not found'
            });
        }

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error fetching tax report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tax report'
        });
    }
});

/**
 * GET /api/tax/export/:taxYear
 * Export tax data for a specific year
 */
router.get('/export/:taxYear', async (req, res) => {
    try {
        const userId = req.user.id;
        const { taxYear } = req.params;
        const { format = 'json' } = req.query;

        // Get tax summary
        const summary = await taxService.getTaxSummary(userId, parseInt(taxYear));
        
        // Get all deductible expenses
        const { expenses: deductibleExpenses } = await taxService.getTaxDeductibleExpenses(
            userId,
            { taxYear: parseInt(taxYear), limit: 10000 }
        );

        const exportData = {
            taxYear: parseInt(taxYear),
            generatedAt: new Date().toISOString(),
            summary: summary.summary,
            deductionsByCategory: summary.deductionsByCategory,
            expenses: deductibleExpenses
        };

        if (format === 'csv') {
            // Convert to CSV format
            const csvHeaders = [
                'Date', 'Description', 'Amount', 'Currency', 'Category',
                'Tax Category Code', 'Tax Category Name', 'Tax Notes'
            ].join(',');

            const csvRows = deductibleExpenses.map(exp => [
                new Date(exp.date).toISOString().split('T')[0],
                `"${exp.description.replace(/"/g, '""')}"`,
                exp.amount,
                exp.currency,
                exp.category?.name || '',
                exp.taxCategory?.code || '',
                exp.taxCategory?.name || '',
                `"${(exp.taxNotes || '').replace(/"/g, '""')}"`
            ].join(','));

            const csvContent = [csvHeaders, ...csvRows].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="tax-export-${taxYear}.csv"`);
            return res.send(csvContent);
        }

        // Default JSON format
        res.json({
            success: true,
            data: exportData
        });
    } catch (error) {
        console.error('Error exporting tax data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export tax data'
        });
    }
});

export default router;
