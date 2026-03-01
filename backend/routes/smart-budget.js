import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import budgetAI from '../services/budgetAI.js';
import spendingPredictor from '../services/spendingPredictor.js';
import {
    validateBudgetAdjustment,
    validatePredictionRequest,
    checkMinimumDataRequirement
} from '../middleware/budgetValidator.js';

const router = express.Router();

/**
 * @route   POST /api/smart-budget/train
 * @desc    Train ML model on user's spending data
 * @access  Private
 */
router.post(
    '/train',
    protect,
    [
        body('categoryId').optional().isUUID(),
        body('modelType').optional().isIn(['arima', 'lstm', 'prophet', 'moving_average']),
        body('lookbackMonths').optional().isInt({ min: 3, max: 24 })
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const result = await budgetAI.trainSpendingModel(req.user.id, req.body);

        res.json({
            success: true,
            data: result,
            message: 'Model trained successfully'
        });
    })
);

/**
 * @route   GET /api/smart-budget/predictions
 * @desc    Get spending predictions
 * @access  Private
 */
router.get(
    '/predictions',
    protect,
    [
        query('categoryId').optional().isUUID(),
        query('monthsAhead').optional().isInt({ min: 1, max: 12 })
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { categoryId, monthsAhead = 1 } = req.query;

        const prediction = await budgetAI.predictMonthlySpending(
            req.user.id,
            categoryId,
            parseInt(monthsAhead)
        );

        res.json({
            success: true,
            data: prediction
        });
    })
);

/**
 * @route   POST /api/smart-budget/auto-adjust
 * @desc    Enable auto-adjustment for budgets
 * @access  Private
 */
router.post(
    '/auto-adjust',
    protect,
    validateBudgetAdjustment,
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { adjustmentRule = 'MODERATE' } = req.body;

        const result = await budgetAI.autoAdjustBudget(req.user.id, adjustmentRule);

        res.json({
            success: true,
            data: result,
            message: `Created ${result.adjustmentsCreated} budget adjustments`
        });
    })
);

/**
 * @route   GET /api/smart-budget/recommendations
 * @desc    Get AI-generated budget recommendations
 * @access  Private
 */
router.get(
    '/recommendations',
    protect,
    asyncHandler(async (req, res) => {
        const recommendations = await budgetAI.generateBudgetRecommendations(req.user.id);

        res.json({
            success: true,
            data: recommendations,
            count: recommendations.length
        });
    })
);

/**
 * @route   GET /api/smart-budget/insights/:categoryId
 * @desc    Get category-specific insights
 * @access  Private
 */
router.get(
    '/insights/:categoryId',
    protect,
    [param('categoryId').isUUID()],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const insights = await budgetAI.generateInsights(req.user.id);
        const categoryInsights = insights.filter(i => i.categoryId === req.params.categoryId);

        res.json({
            success: true,
            data: categoryInsights
        });
    })
);

/**
 * @route   POST /api/smart-budget/simulate
 * @desc    Simulate budget scenarios
 * @access  Private
 */
router.post(
    '/simulate',
    protect,
    [
        body('categoryId').isUUID(),
        body('budgetAmount').isFloat({ min: 0 }),
        body('months').optional().isInt({ min: 1, max: 12 })
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { categoryId, budgetAmount, months = 3 } = req.body;

        const predictions = [];
        for (let i = 1; i <= months; i++) {
            const prediction = await budgetAI.predictMonthlySpending(
                req.user.id,
                categoryId,
                i
            );
            predictions.push(prediction);
        }

        const totalPredicted = predictions.reduce((sum, p) =>
            sum + parseFloat(p.predictedAmount), 0
        );
        const totalBudget = budgetAmount * months;
        const surplus = totalBudget - totalPredicted;

        res.json({
            success: true,
            data: {
                budgetAmount,
                months,
                predictions,
                totalPredicted: Math.round(totalPredicted * 100) / 100,
                totalBudget,
                surplus: Math.round(surplus * 100) / 100,
                status: surplus >= 0 ? 'on_track' : 'over_budget'
            }
        });
    })
);

/**
 * @route   POST /api/smart-budget/apply-adjustments
 * @desc    Apply pending budget adjustments
 * @access  Private
 */
router.post(
    '/apply-adjustments',
    protect,
    [body('adjustmentIds').isArray({ min: 1 })],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const result = await budgetAI.applyAdjustments(req.user.id, req.body.adjustmentIds);

        res.json({
            success: true,
            data: result,
            message: `Applied ${result.appliedCount} budget adjustments`
        });
    })
);

/**
 * @route   GET /api/smart-budget/anomalies
 * @desc    Detect spending anomalies
 * @access  Private
 */
router.get(
    '/anomalies',
    protect,
    [query('categoryId').optional().isUUID()],
    asyncHandler(async (req, res) => {
        const anomalies = await budgetAI.detectAnomalies(req.user.id, req.query.categoryId);

        res.json({
            success: true,
            data: anomalies,
            count: anomalies.length
        });
    })
);

/**
 * @route   GET /api/smart-budget/trends
 * @desc    Get spending trends
 * @access  Private
 */
router.get(
    '/trends',
    protect,
    [query('categoryId').optional().isUUID()],
    asyncHandler(async (req, res) => {
        const trends = await spendingPredictor.identifyTrends(
            req.user.id,
            req.query.categoryId
        );

        res.json({
            success: true,
            data: trends
        });
    })
);

/**
 * @route   GET /api/smart-budget/seasonal-factors
 * @desc    Get seasonal spending factors
 * @access  Private
 */
router.get(
    '/seasonal-factors',
    protect,
    [query('categoryId').isUUID().withMessage('Category ID is required')],
    asyncHandler(async (req, res) => {
        const factors = await spendingPredictor.calculateSeasonalFactors(
            req.user.id,
            req.query.categoryId
        );

        res.json({
            success: true,
            data: factors
        });
    })
);

export default router;
