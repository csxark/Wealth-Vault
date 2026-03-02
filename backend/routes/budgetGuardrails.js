/**
 * Multi-Goal Budget Guardrail Optimizer Routes - Issue #714
 * 
 * API endpoints for managing guardrail policies, allocations, and compliance.
 * 
 * @module routes/budgetGuardrails
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { AppError } from '../utils/appError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import BudgetGuardrailService from '../services/budgetGuardrailService.js';

const router = express.Router();

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError(400, 'Validation failed', errors.array());
    }
    next();
};

// ============================================================================
// POLICY MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/budget-guardrails/policies:
 *   get:
 *     summary: Get all guardrail policies for user
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/policies',
    protect,
    query('includeInactive').optional().isBoolean(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { includeInactive = false } = req.query;
            const policies = await BudgetGuardrailService.getUserPolicies(
                req.user.id,
                includeInactive === 'true'
            );

            return new ApiResponse(
                200,
                { policies, count: policies.length },
                'Policies retrieved successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/policies/default:
 *   get:
 *     summary: Get or create default guardrail policy
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/policies/default',
    protect,
    query('vaultId').optional().isUUID(),
    query('minimumLivingCost').optional().isFloat({ min: 0 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { vaultId, minimumLivingCost = 2000 } = req.query;
            const policy = await BudgetGuardrailService.getOrCreatePolicy(
                req.user.id,
                vaultId,
                parseFloat(minimumLivingCost)
            );

            return new ApiResponse(200, policy, 'Default policy retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/policies:
 *   post:
 *     summary: Create a new guardrail policy
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/policies',
    protect,
    body('policyName').isString().notEmpty(),
    body('minimumMonthlyLivingCost').isFloat({ min: 0 }),
    body('vaultId').optional().isUUID(),
    body('safetyBufferPercentage').optional().isFloat({ min: 0, max: 50 }),
    body('maxGoalAllocationPercentage').optional().isFloat({ min: 10, max: 90 }),
    body('protectedCategoryIds').optional().isArray(),
    body('priorityGoalIds').optional().isArray(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const {
                policyName,
                minimumMonthlyLivingCost,
                vaultId,
                safetyBufferPercentage,
                maxGoalAllocationPercentage,
                protectedCategoryIds,
                priorityGoalIds,
                ...otherFields
            } = req.body;

            // Create policy via database
            const policy = await BudgetGuardrailService.getOrCreatePolicy(
                req.user.id,
                vaultId,
                minimumMonthlyLivingCost
            );

            // Update with provided values
            if (Object.keys(otherFields).length > 0 || safetyBufferPercentage || maxGoalAllocationPercentage) {
                const update = {};
                if (safetyBufferPercentage) update.safetyBufferPercentage = safetyBufferPercentage;
                if (maxGoalAllocationPercentage) update.maxGoalAllocationPercentage = maxGoalAllocationPercentage;
                if (protectedCategoryIds) update.protectedCategoryIds = protectedCategoryIds;
                if (priorityGoalIds) update.priorityGoalIds = priorityGoalIds;

                const updated = await BudgetGuardrailService.updatePolicy(policy.id, update);
                return new ApiResponse(201, updated, 'Policy created successfully').send(res);
            }

            return new ApiResponse(201, policy, 'Policy created successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/policies/{policyId}:
 *   put:
 *     summary: Update a guardrail policy
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/policies/:policyId',
    protect,
    param('policyId').isUUID(),
    body('minimumMonthlyLivingCost').optional().isFloat({ min: 0 }),
    body('safetyBufferPercentage').optional().isFloat({ min: 0, max: 50 }),
    body('maxGoalAllocationPercentage').optional().isFloat({ min: 10, max: 90 }),
    body('enforceStrictly').optional().isBoolean(),
    body('allowOverride').optional().isBoolean(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { policyId } = req.params;
            const updates = req.body;

            const updated = await BudgetGuardrailService.updatePolicy(policyId, updates);

            return new ApiResponse(200, updated, 'Policy updated successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// SAFE ALLOCATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/budget-guardrails/calculate:
 *   post:
 *     summary: Calculate safe-to-allocate amount for next period
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/calculate',
    protect,
    body('policyId').isUUID(),
    body('vaultId').optional().isUUID(),
    body('projectedIncome').optional().isFloat({ min: 0 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { policyId, vaultId, projectedIncome } = req.body;

            const calculation = await BudgetGuardrailService.calculateSafeAllocation(
                req.user.id,
                policyId,
                vaultId,
                projectedIncome
            );

            return new ApiResponse(
                201,
                calculation,
                'Safe allocation calculated successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/latest:
 *   get:
 *     summary: Get latest safe allocation calculation
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/latest',
    protect,
    query('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { vaultId } = req.query;

            const calculation = await BudgetGuardrailService.getLatestSafeAllocation(
                req.user.id,
                vaultId
            );

            if (!calculation) {
                return new ApiResponse(404, null, 'No calculation found').send(res);
            }

            return new ApiResponse(200, calculation, 'Latest calculation retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// ALLOCATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/budget-guardrails/allocate:
 *   post:
 *     summary: Allocate amount to goal with guardrail enforcement
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/allocate',
    protect,
    body('goalId').isUUID(),
    body('requestedAmount').isFloat({ min: 0 }),
    body('calculationId').isUUID(),
    body('policyId').isUUID(),
    body('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { goalId, requestedAmount, calculationId, policyId, vaultId } = req.body;

            const allocation = await BudgetGuardrailService.allocateGoalWithGuardrail(
                req.user.id,
                goalId,
                requestedAmount,
                calculationId,
                policyId,
                vaultId
            );

            return new ApiResponse(
                201,
                allocation,
                'Allocation processed with guardrails'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/allocations/pending:
 *   get:
 *     summary: Get pending allocations requiring approval
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/allocations/pending',
    protect,
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const pending = await BudgetGuardrailService.getPendingAllocations(req.user.id);

            return new ApiResponse(
                200,
                { allocations: pending, count: pending.length },
                'Pending allocations retrieved'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/allocations/{allocationId}/approve:
 *   post:
 *     summary: Approve a pending allocation
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/allocations/:allocationId/approve',
    protect,
    param('allocationId').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { allocationId } = req.params;

            const approved = await BudgetGuardrailService.approveAllocation(
                allocationId,
                req.user.id
            );

            return new ApiResponse(200, approved, 'Allocation approved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/allocations/{allocationId}/override:
 *   post:
 *     summary: Override a guardrail allocation
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/allocations/:allocationId/override',
    protect,
    param('allocationId').isUUID(),
    body('overriddenAmount').isFloat({ min: 0 }),
    body('reason').isString().notEmpty(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { allocationId } = req.params;
            const { overriddenAmount, reason } = req.body;

            const overridden = await BudgetGuardrailService.overrideAllocation(
                allocationId,
                req.user.id,
                overriddenAmount,
                reason
            );

            return new ApiResponse(200, overridden, 'Allocation overridden').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// VIOLATIONS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/budget-guardrails/violations:
 *   get:
 *     summary: Get unresolved guardrail violations
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/violations',
    protect,
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const violations = await BudgetGuardrailService.getUnresolvedViolations(req.user.id);

            return new ApiResponse(
                200,
                { violations, count: violations.length },
                'Violations retrieved'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// COMPLIANCE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/budget-guardrails/compliance/history:
 *   get:
 *     summary: Get compliance history
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/compliance/history',
    protect,
    query('vaultId').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { vaultId, limit = 12 } = req.query;

            const history = await BudgetGuardrailService.getComplianceHistory(
                req.user.id,
                vaultId,
                parseInt(limit)
            );

            return new ApiResponse(
                200,
                { history, count: history.length },
                'Compliance history retrieved'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/budget-guardrails/dashboard:
 *   get:
 *     summary: Get guardrail dashboard summary
 *     tags: [Budget Guardrails]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/dashboard',
    protect,
    query('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { vaultId } = req.query;

            // Get default policy
            const policy = await BudgetGuardrailService.getOrCreatePolicy(req.user.id, vaultId);

            // Get latest calculation
            const calculation = await BudgetGuardrailService.getLatestSafeAllocation(req.user.id, vaultId);

            // Get pending allocations
            const pending = await BudgetGuardrailService.getPendingAllocations(req.user.id);

            // Get unresolved violations
            const violations = await BudgetGuardrailService.getUnresolvedViolations(req.user.id);

            return new ApiResponse(
                200,
                {
                    policy,
                    latestCalculation: calculation,
                    pendingAllocationsCount: pending.length,
                    unresolvedViolationsCount: violations.length,
                    summary: {
                        safeToAllocate: calculation?.safeToAllocateAmount || '0.00',
                        coverageStatus: calculation?.coverageStatus || 'unknown',
                        complianceHealthy: violations.length === 0,
                    },
                },
                'Dashboard data retrieved'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

export default router;
