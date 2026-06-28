import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import settlementEngine from '../services/settlementEngine.js';
import splitCalculator from '../services/splitCalculator.js';
import {
    validateSettlementCreation,
    validatePaymentRecord,
    validateSettlementAccess
} from '../middleware/settlementGuard.js';

const router = express.Router();

/**
 * @route   POST /api/expense-splits/create
 * @desc    Create a new expense split settlement
 * @access  Private
 */
router.post(
    '/create',
    protect,
    validateSettlementCreation,
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const settlementData = {
            ...req.body,
            creatorId: req.user.id
        };

        const result = await settlementEngine.createSettlement(settlementData);

        res.status(201).json({
            success: true,
            data: result,
            message: 'Expense split created successfully'
        });
    })
);

/**
 * @route   GET /api/expense-splits/:id
 * @desc    Get expense split details
 * @access  Private
 */
router.get(
    '/:id',
    protect,
    [param('id').isUUID().withMessage('Invalid split ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const settlement = await settlementEngine.getSettlement(req.params.id);

        res.json({
            success: true,
            data: settlement
        });
    })
);

/**
 * @route   POST /api/expense-splits/:id/pay
 * @desc    Record a payment for an expense split
 * @access  Private
 */
router.post(
    '/:id/pay',
    protect,
    [
        param('id').isUUID().withMessage('Invalid transaction ID'),
        ...validatePaymentRecord
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const paymentData = {
            transactionId: req.params.id,
            ...req.body
        };

        const transaction = await settlementEngine.recordPayment(paymentData);

        res.json({
            success: true,
            data: transaction,
            message: 'Payment recorded successfully'
        });
    })
);

/**
 * @route   GET /api/expense-splits/user/:userId
 * @desc    Get all expense splits for a user
 * @access  Private
 */
router.get(
    '/user/:userId',
    protect,
    [
        param('userId').isUUID().withMessage('Invalid user ID'),
        query('status').optional().isIn(['pending', 'partial', 'completed', 'cancelled']),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const filters = {
            status: req.query.status,
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0
        };

        const settlements = await settlementEngine.getUserSettlements(req.params.userId, filters);

        res.json({
            success: true,
            data: settlements,
            count: settlements.length
        });
    })
);

/**
 * @route   GET /api/expense-splits/summary/:userId
 * @desc    Get expense split summary for a user
 * @access  Private
 */
router.get(
    '/summary/:userId',
    protect,
    [param('userId').isUUID().withMessage('Invalid user ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const summary = await settlementEngine.getSettlementSummary(req.params.userId);

        res.json({
            success: true,
            data: summary
        });
    })
);

/**
 * @route   POST /api/expense-splits/optimize
 * @desc    Calculate optimal settlement path
 * @access  Private
 */
router.post(
    '/optimize',
    protect,
    asyncHandler(async (req, res) => {
        const optimized = await settlementEngine.calculateOptimalSettlement(req.user.id);

        res.json({
            success: true,
            data: optimized,
            message: `Optimized settlement reduces transactions by ${optimized.optimized.savings}`
        });
    })
);

/**
 * @route   POST /api/expense-splits/:id/cancel
 * @desc    Cancel an expense split
 * @access  Private
 */
router.post(
    '/:id/cancel',
    protect,
    [param('id').isUUID().withMessage('Invalid split ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const settlement = await settlementEngine.cancelSettlement(req.params.id, req.user.id);

        res.json({
            success: true,
            data: settlement,
            message: 'Expense split cancelled successfully'
        });
    })
);

/**
 * @route   POST /api/expense-splits/calculate-split
 * @desc    Calculate split without creating settlement
 * @access  Private
 */
router.post(
    '/calculate-split',
    protect,
    [
        body('totalAmount').isFloat({ min: 0.01 }).withMessage('Total amount must be greater than 0'),
        body('splitType').isIn(['equal', 'percentage', 'custom', 'weighted']).withMessage('Invalid split type'),
        body('participants').isArray({ min: 1 }).withMessage('At least one participant required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { totalAmount, splitType, participants } = req.body;

        const splitResult = await splitCalculator.calculateSplit(totalAmount, splitType, participants);

        res.json({
            success: true,
            data: splitResult
        });
    })
);

/**
 * @route   POST /api/expense-splits/calculate-itemized
 * @desc    Calculate itemized split
 * @access  Private
 */
router.post(
    '/calculate-itemized',
    protect,
    [
        body('items').isArray().withMessage('Items must be an array'),
        body('sharedItems').optional().isArray(),
        body('participants').isArray({ min: 1 }).withMessage('At least one participant required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { items, sharedItems, participants } = req.body;

        const splitResult = splitCalculator.calculateItemizedSplit(items, sharedItems, participants);

        res.json({
            success: true,
            data: splitResult
        });
    })
);

/**
 * @route   POST /api/expense-splits/suggest-split
 * @desc    Suggest optimal split based on participant income
 * @access  Private
 */
router.post(
    '/suggest-split',
    protect,
    [
        body('totalAmount').isFloat({ min: 0.01 }).withMessage('Total amount must be greater than 0'),
        body('participants').isArray({ min: 1 }).withMessage('At least one participant required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { totalAmount, participants } = req.body;

        const splitResult = splitCalculator.suggestIncomeBasedSplit(totalAmount, participants);

        res.json({
            success: true,
            data: splitResult,
            message: 'Split suggestion based on participant income'
        });
    })
);

export default router;
