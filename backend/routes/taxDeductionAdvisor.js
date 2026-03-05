/**
 * Tax Deduction & Estimation Advisor API Routes
 * Issue #692: Real-Time Tax Optimization & Deduction Tracking
 * 
 * Endpoints:
 * - GET  /api/tax-advisor/deductions/:year    - Track deductions by year
 * - GET  /api/tax-advisor/missed-deductions   - Find missed opportunities
 * - GET  /api/tax-advisor/estimate            - Federal income tax estimate
 * - GET  /api/tax-advisor/quarterly-payments  - Quarterly tax payments
 * - GET  /api/tax-advisor/scenarios           - What-if scenarios
 * - GET  /api/tax-advisor/strategies          - Optimization strategies
 * - GET  /api/tax-advisor/state-tax           - State/local tax estimate
 * - GET  /api/tax-advisor/comprehensive       - Full tax summary
 * - POST /api/tax-advisor/business-expenses   - Get business expense breakdown
 * - POST /api/tax-advisor/categorize-expense  - Auto-categorize expense
 */

import express from 'express';
import { query, body, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import deductionTrackingService from '../services/deductionTrackingService.js';
import taxEstimationEngine from '../services/taxEstimationEngine.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import AppError from '../utils/AppError.js';

const router = express.Router();

/**
 * @route   GET /api/tax-advisor/deductions/:year
 * @desc    Get deduction summary and tracking for a tax year
 * @params  year - Tax year (e.g., 2024)
 * @access  Private
 */
router.get('/deductions/:year', protect, [
    param('year').isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = parseInt(req.params.year);
    const summary = await deductionTrackingService.getDeductionSummary(req.user.id, year);

    new ApiResponse(200, summary, 'Deductions retrieved successfully').send(res);
}));

/**
 * @route   GET /api/tax-advisor/missed-deductions
 * @desc    Find missed deduction opportunities
 * @query   ?year=2024
 * @access  Private
 */
router.get('/missed-deductions', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const opportunities = await deductionTrackingService.findMissedDeductions(req.user.id, year);

    new ApiResponse(200, opportunities, 'Missed deductions identified').send(res);
}));

/**
 * @route   GET /api/tax-advisor/estimate
 * @desc    Get estimated federal income tax
 * @query   ?year=2024
 * @access  Private
 */
router.get('/estimate', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const estimate = await taxEstimationEngine.estimateFederalIncomeTax(req.user.id, year);

    new ApiResponse(200, estimate, 'Tax estimate calculated').send(res);
}));

/**
 * @route   GET /api/tax-advisor/quarterly-payments
 * @desc    Get estimated quarterly tax payment schedule
 * @query   ?year=2024
 * @access  Private
 */
router.get('/quarterly-payments', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const quarterly = await taxEstimationEngine.estimateQuarterlyTaxPayments(req.user.id, year);

    new ApiResponse(200, quarterly, 'Quarterly payment schedule calculated').send(res);
}));

/**
 * @route   GET /api/tax-advisor/scenarios
 * @desc    Get what-if tax scenarios
 * @query   ?year=2024
 * @access  Private
 */
router.get('/scenarios', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const scenarios = await taxEstimationEngine.generateTaxScenarios(req.user.id, year);

    new ApiResponse(200, scenarios, 'Tax scenarios generated').send(res);
}));

/**
 * @route   GET /api/tax-advisor/strategies
 * @desc    Get tax optimization strategies
 * @query   ?year=2024
 * @access  Private
 */
router.get('/strategies', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const strategies = await taxEstimationEngine.getTaxOptimizationStrategies(req.user.id, year);

    new ApiResponse(200, strategies, 'Optimization strategies retrieved').send(res);
}));

/**
 * @route   GET /api/tax-advisor/state-tax
 * @desc    Get estimated state and local tax
 * @query   ?year=2024&state=CA
 * @access  Private
 */
router.get('/state-tax', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 }),
    query('state').optional().isString().isLength({ min: 2, max: 2 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const state = req.query.state || 'CA';
    const stateTax = await taxEstimationEngine.estimateStateAndLocalTax(req.user.id, year, state);

    new ApiResponse(200, stateTax, 'State tax estimate calculated').send(res);
}));

/**
 * @route   GET /api/tax-advisor/comprehensive
 * @desc    Get comprehensive tax estimate (federal + state + self-employment)
 * @query   ?year=2024&state=CA
 * @access  Private
 */
router.get('/comprehensive', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 }),
    query('state').optional().isString().isLength({ min: 2, max: 2 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const state = req.query.state || 'CA';
    const comprehensive = await taxEstimationEngine.getComprehensiveTaxEstimate(req.user.id, year, state);

    new ApiResponse(200, comprehensive, 'Comprehensive tax estimate calculated').send(res);
}));

/**
 * @route   POST /api/tax-advisor/business-expenses
 * @desc    Get business expense breakdown
 * @body    { year: 2024 }
 * @access  Private
 */
router.post('/business-expenses', protect, [
    body('year').optional().isInt({ min: 2000, max: 2099 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.body.year || new Date().getFullYear();
    const breakdown = await deductionTrackingService.getBusinessExpenseBreakdown(req.user.id, year);

    new ApiResponse(200, breakdown, 'Business expense breakdown retrieved').send(res);
}));

/**
 * @route   POST /api/tax-advisor/categorize-expense
 * @desc    Auto-categorize an expense for tax deductibility
 * @body    { description, amount, category, merchantName?, notes? }
 * @access  Private
 */
router.post('/categorize-expense', protect, [
    body('description').notEmpty().trim(),
    body('amount').isFloat({ gt: 0 }),
    body('category').optional().trim(),
    body('merchantName').optional().trim(),
    body('notes').optional().trim()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const categorization = await deductionTrackingService.categorizeExpenseForTax(req.body);

    new ApiResponse(200, categorization, 'Expense categorized for tax purposes').send(res);
}));

/**
 * @route   GET /api/tax-advisor/tax-impact
 * @desc    Get tax impact of current deductions
 * @query   ?year=2024&taxRate=0.22
 * @access  Private
 */
router.get('/tax-impact', protect, [
    query('year').optional().isInt({ min: 2000, max: 2099 }),
    query('taxRate').optional().isFloat({ min: 0, max: 1 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const taxRate = req.query.taxRate ? parseFloat(req.query.taxRate) : 0.22;
    const impact = await deductionTrackingService.estimateTaxImpactOfDeductions(req.user.id, year, taxRate);

    new ApiResponse(200, impact, 'Tax impact calculated').send(res);
}));

/**
 * @route   GET /api/tax-advisor/deduction-categories
 * @desc    Get list of all available deduction categories
 * @access  Private
 */
router.get('/deduction-categories', protect, asyncHandler(async (req, res) => {
    const categories = [];

    for (const [key, value] of Object.entries(deductionTrackingService.DEDUCTION_CATEGORIES)) {
        categories.push({
            id: key,
            name: key,
            description: value.description,
            annualLimit: value.limitPerYear
        });
    }

    new ApiResponse(200, {
        categories,
        count: categories.length
    }, 'Deduction categories retrieved').send(res);
}));

export default router;
