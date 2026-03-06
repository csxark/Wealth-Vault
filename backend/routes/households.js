import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import householdService from '../services/householdService.js';

const router = express.Router();

/**
 * POST /households
 * Create a new household group
 */
router.post(
    '/',
    protect,
    [
        body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Household name required'),
        body('description').optional().trim().isLength({ max: 500 }),
        body('householdType').optional().isIn(['family', 'joint', 'business', 'trust']),
        body('baseCurrency').optional().isLength({ min: 3, max: 3 }),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const household = await householdService.createHousehold(req.user.id, req.body);
        return new ApiResponse(201, household, 'Household created successfully').send(res);
    })
);

/**
 * GET /households/:householdId
 * Get household details with members and accounts
 */
router.get(
    '/:householdId',
    protect,
    asyncHandler(async (req, res, next) => {
        const household = await householdService.getHousehold(req.params.householdId, req.user.id);
        return new ApiResponse(200, household, 'Household retrieved').send(res);
    })
);

/**
 * POST /households/:householdId/members
 * Add a new member to the household
 */
router.post(
    '/:householdId/members',
    protect,
    [
        body('inviteeEmail').isEmail().withMessage('Valid email required'),
        body('role').isIn(['member', 'approver', 'viewer', 'secondary']).optional(),
        body('relationship').optional().isLength({ max: 100 }),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const member = await householdService.addMember(req.params.householdId, req.user.id, req.body);
        return new ApiResponse(201, member, 'Member added successfully').send(res);
    })
);

/**
 * POST /households/:householdId/accounts
 * Link a vault/account to the household
 */
router.post(
    '/:householdId/accounts',
    protect,
    [
        body('vaultId').notEmpty().withMessage('Vault ID required'),
        body('accountName').trim().isLength({ min: 1, max: 100 }).withMessage('Account name required'),
        body('accountType').isIn(['checking', 'savings', 'investment', 'retirement', 'real_estate', 'crypto']),
        body('isJoint').optional().isBoolean(),
        body('jointOwnerIds').optional().isArray(),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const account = await householdService.linkAccountToHousehold(
            req.params.householdId,
            req.user.id,
            req.body
        );
        return new ApiResponse(201, account, 'Account linked successfully').send(res);
    })
);

/**
 * GET /households/:householdId/aggregation
 * Get calculated household net worth and asset allocation
 */
router.get(
    '/:householdId/aggregation',
    protect,
    asyncHandler(async (req, res, next) => {
        const snapshot = await householdService.calculateHouseholdAggregation(req.params.householdId);
        return new ApiResponse(200, snapshot, 'Household aggregation calculated').send(res);
    })
);

/**
 * GET /households/:householdId/net-worth-trend
 * Get household net worth trend over time
 */
router.get(
    '/:householdId/net-worth-trend',
    protect,
    [
        query('days').optional().isInt({ min: 1, max: 3650 })
            .withMessage('Days must be between 1 and 3650'),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const days = req.query.days ? parseInt(req.query.days) : 30;
        const trend = await householdService.getNetWorthTrend(req.params.householdId, { days });
        return new ApiResponse(200, trend, 'Net worth trend retrieved').send(res);
    })
);

/**
 * POST /households/:householdId/rebalancing/suggest
 * Generate household rebalancing recommendations
 */
router.post(
    '/:householdId/rebalancing/suggest',
    protect,
    [
        body('targetAllocation').isObject().withMessage('Target allocation required (e.g., {stocks: 60, bonds: 30})'),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const order = await householdService.generateRebalancingSuggestions(
            req.params.householdId,
            req.user.id,
            req.body
        );
        return new ApiResponse(200, order, 'Rebalancing suggestions generated').send(res);
    })
);

/**
 * GET /households/:householdId/spending
 * Get consolidated household spending across all members
 */
router.get(
    '/:householdId/spending',
    protect,
    [
        query('period').optional().isIn(['day', 'week', 'month', 'quarter', 'year']),
        query('months').optional().isInt({ min: 1, max: 60 }),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const spending = await householdService.getHouseholdSpending(
            req.params.householdId,
            req.query
        );
        return new ApiResponse(200, spending, 'Household spending retrieved').send(res);
    })
);

/**
 * POST /households/:householdId/goals
 * Create a household joint goal
 */
router.post(
    '/:householdId/goals',
    protect,
    [
        body('goalName').trim().isLength({ min: 1, max: 200 }).withMessage('Goal name required'),
        body('goalType').isIn(['education', 'home', 'vacation', 'retirement', 'emergency', 'custom']),
        body('targetAmount').isFloat({ min: 0 }).withMessage('Valid target amount required'),
        body('deadline').isISO8601().withMessage('Valid deadline date required'),
        body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
        body('fundingStrategy').optional().isIn(['proportional', 'equal', 'custom']),
        body('memberContributions').optional().isObject(),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const goal = await householdService.createJointGoal(
            req.params.householdId,
            req.user.id,
            req.body
        );
        return new ApiResponse(201, goal, 'Joint goal created').send(res);
    })
);

/**
 * GET /households/:householdId/performance
 * Get aggregated household portfolio performance
 */
router.get(
    '/:householdId/performance',
    protect,
    [
        query('period').optional().isIn(['1m', '3m', '6m', '1y']),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const performance = await householdService.getHouseholdPerformance(
            req.params.householdId,
            req.query
        );
        return new ApiResponse(200, performance, 'Household performance retrieved').send(res);
    })
);

/**
 * POST /households/:householdId/approvals
 * Request approval from household members (collaborative approvals)
 */
router.post(
    '/:householdId/approvals',
    protect,
    [
        body('requestType').isIn(['rebalancing', 'transfer', 'goal_change', 'member_add', 'account_link']),
        body('referenceId').optional().isUUID(),
        body('description').optional().trim().isLength({ max: 500 }),
        body('requiredApprovers').optional().isArray(),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const approval = await householdService.requestApproval(
            req.params.householdId,
            req.user.id,
            req.body
        );
        return new ApiResponse(201, approval, 'Approval request created').send(res);
    })
);

/**
 * POST /households/approvals/:approvalId/respond
 * Approve or reject a household request
 */
router.post(
    '/approvals/:approvalId/respond',
    protect,
    [
        body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
        body('notes').optional().trim().isLength({ max: 500 }),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const result = await householdService.respondToApproval(
            req.params.approvalId,
            req.user.id,
            req.body
        );
        return new ApiResponse(200, result, 'Approval response recorded').send(res);
    })
);

export default router;
