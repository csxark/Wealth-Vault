/**
 * Financial Goals & Savings Tracker API Routes - Issue #664
 * Comprehensive API endpoints for goal management, progress tracking,
 * savings plans, milestones, projections, and analytics
 * 
 * @module routes/goals_v2
 * @requires express
 * @requires express-validator
 * @requires ../services/goalManager
 * @requires ../services/savingsPlanCalculator
 * @requires ../services/milestoneService
 * @requires ../services/goalTimelineProjector
 * @requires ../services/goalAnalyticsService
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { AppError } from '../utils/appError.js';
import { ApiResponse } from '../utils/apiResponse.js';

// Import services
import GoalManager from '../services/goalManager.js';
import SavingsPlanCalculator from '../services/savingsPlanCalculator.js';
import MilestoneService from '../services/milestoneService.js';
import GoalTimelineProjector from '../services/goalTimelineProjector.js';
import GoalAnalyticsService from '../services/goalAnalyticsService.js';

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
// GOAL MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals:
 *   get:
 *     summary: Get all goals for authenticated user
 *     tags: [Financial Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [planning, active, achieved, abandoned, on_hold]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: vaultId
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [priority, targetDate, progressPercentage, createdAt]
 *     responses:
 *       200:
 *         description: List of goals
 */
router.get(
    '/',
    protect,
    query('status').optional().isIn(['planning', 'active', 'achieved', 'abandoned', 'on_hold']),
    query('category').optional().isString(),
    query('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { status, category, vaultId } = req.query;
            const filters = {};
            if (status) filters.status = status;
            if (category) filters.category = category;
            if (vaultId) filters.vaultId = vaultId;

            const goals = await GoalManager.getUserGoals(req.user.id, filters);
            const summary = await GoalManager.getGoalSummary(req.user.id, vaultId || '');

            return new ApiResponse(200, {
                goals,
                summary,
            }, 'Goals retrieved successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}:
 *   get:
 *     summary: Get goal by ID
 *     tags: [Financial Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get(
    '/:id',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            return new ApiResponse(200, { goal }, 'Goal retrieved successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals:
 *   post:
 *     summary: Create a new financial goal
 *     tags: [Financial Goals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goalName
 *               - goalType
 *               - targetAmount
 *               - targetDate
 *             properties:
 *               goalName:
 *                 type: string
 *               goalType:
 *                 type: string
 *                 enum: [savings, investment, debt_reduction, milestone, habit]
 *               category:
 *                 type: string
 *               targetAmount:
 *                 type: number
 *               targetDate:
 *                 type: string
 *                 format: date-time
 *               importance:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *               vaultId:
 *                 type: string
 *                 format: uuid
 */
router.post(
    '/',
    protect,
    body('goalName').trim().isLength({ min: 1, max: 200 }),
    body('goalType').isIn(['savings', 'investment', 'debt_reduction', 'milestone', 'habit']),
    body('category').isString(),
    body('targetAmount').isFloat({ min: 0.01 }),
    body('targetDate').isISO8601().toDate(),
    body('importance').optional().isInt({ min: 0, max: 100 }),
    body('riskTolerance').optional().isIn(['conservative', 'moderate', 'aggressive']),
    body('description').optional().isString(),
    body('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.createGoal({
                userId: req.user.id,
                vaultId: req.body.vaultId || null,
                goalName: req.body.goalName,
                goalType: req.body.goalType,
                category: req.body.category,
                targetAmount: req.body.targetAmount,
                targetDate: req.body.targetDate,
                importance: req.body.importance || 50,
                riskTolerance: req.body.riskTolerance || 'moderate',
                description: req.body.description,
                tags: req.body.tags || [],
                notes: req.body.notes,
            });

            // Auto-create savings plan if autoCalculateSavings is true
            if (goal.autoCalculateSavings) {
                await SavingsPlanCalculator.createSavingsPlan({
                    goalId: goal.id,
                    userId: req.user.id,
                    vaultId: goal.vaultId,
                    startingAmount: 0,
                    contributionFrequency: 'monthly',
                    bufferPercentage: 10,
                });
            }

            return new ApiResponse(201, { goal }, 'Goal created successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}:
 *   put:
 *     summary: Update a goal
 *     tags: [Financial Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.put(
    '/:id',
    protect,
    param('id').isUUID(),
    body('goalName').optional().isString(),
    body('targetDate').optional().isISO8601().toDate(),
    body('importance').optional().isInt({ min: 0, max: 100 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const updated = await GoalManager.updateGoal(req.params.id, req.user.id, req.body);
            return new ApiResponse(200, { goal: updated }, 'Goal updated successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}/status:
 *   patch:
 *     summary: Update goal status
 *     tags: [Financial Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [planning, active, achieved, abandoned, on_hold]
 *               reason:
 *                 type: string
 */
router.patch(
    '/:id/status',
    protect,
    param('id').isUUID(),
    body('status').isIn(['planning', 'active', 'achieved', 'abandoned', 'on_hold']),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const updated = await GoalManager.updateGoalStatus(
                req.params.id,
                req.user.id,
                req.body.status,
                req.body.reason
            );
            return new ApiResponse(200, { goal: updated }, 'Goal status updated').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}:
 *   delete:
 *     summary: Delete a goal
 *     tags: [Financial Goals]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
    '/:id',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            await GoalManager.deleteGoal(req.params.id, req.user.id);
            return new ApiResponse(200, {}, 'Goal deleted successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// SAVINGS PLAN ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals/{id}/savings-plan:
 *   get:
 *     summary: Get savings plan for a goal
 *     tags: [Savings Plans]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id/savings-plan',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            // Verify goal ownership
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const plan = await SavingsPlanCalculator.getPlanForGoal(req.params.id);
            const schedule = await SavingsPlanCalculator.generateContributionSchedule(
                plan?.id || req.params.id,
                12
            );

            return new ApiResponse(200, {
                plan,
                schedule,
                summary: plan ? await SavingsPlanCalculator.getPlanSummary(plan.id) : null,
            }, 'Savings plan retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}/savings-plan/adjust:
 *   post:
 *     summary: Adjust savings plan
 *     tags: [Savings Plans]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:id/savings-plan/adjust',
    protect,
    param('id').isUUID(),
    body('newTargetDate').optional().isISO8601().toDate(),
    body('newBufferPercentage').optional().isFloat({ min: 0, max: 50 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const plan = await SavingsPlanCalculator.getPlanForGoal(req.params.id);
            if (!plan) {
                throw new AppError(404, 'Savings plan not found');
            }

            const adjusted = await SavingsPlanCalculator.adjustPlan(plan.id, {
                newTargetDate: req.body.newTargetDate,
                newBufferPercentage: req.body.newBufferPercentage,
                reason: req.body.reason,
            });

            return new ApiResponse(200, { plan: adjusted }, 'Savings plan adjusted').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}/savings-plan/auto-debit:
 *   post:
 *     summary: Enable auto-debit for savings plan
 *     tags: [Savings Plans]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:id/savings-plan/auto-debit',
    protect,
    param('id').isUUID(),
    body('autoDebitDate').isInt({ min: 1, max: 31 }),
    body('paymentMethod').isString(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const plan = await SavingsPlanCalculator.getPlanForGoal(req.params.id);
            if (!plan) {
                throw new AppError(404, 'Savings plan not found');
            }

            const updated = await SavingsPlanCalculator.setupAutoDebit(plan.id, {
                autoDebitDate: req.body.autoDebitDate,
                paymentMethod: req.body.paymentMethod,
                targetAccountId: req.body.targetAccountId,
            });

            return new ApiResponse(200, { plan: updated }, 'Auto-debit configured').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// PROGRESS TRACKING ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals/{id}/progress:
 *   post:
 *     summary: Update goal progress
 *     tags: [Progress Tracking]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:id/progress',
    protect,
    param('id').isUUID(),
    body('amount').isFloat({ min: 0 }),
    body('description').optional().isString(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const updated = await GoalManager.updateProgress(
                req.params.id,
                req.body.amount,
                req.user.id
            );

            // Recalculate projections
            const plan = await SavingsPlanCalculator.getPlanForGoal(req.params.id);
            if (plan) {
                await SavingsPlanCalculator.updatePlanProgress(plan.id, req.body.amount);
            }

            return new ApiResponse(200, { goal: updated }, 'Progress updated').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// MILESTONE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals/{id}/milestones:
 *   get:
 *     summary: Get milestones for a goal
 *     tags: [Milestones]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id/milestones',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            // Fetch milestones from database
            const milestones = []; // TODO: Fetch from database using goalMilestones schema
            return new ApiResponse(200, { milestones }, 'Milestones retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}/milestones:
 *   post:
 *     summary: Create milestone for a goal
 *     tags: [Milestones]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:id/milestones',
    protect,
    param('id').isUUID(),
    body('milestoneName').isString(),
    body('milestoneType').isIn(['percentage', 'amount', 'date', 'custom']),
    body('milestoneValue').optional().isFloat({ min: 0 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            // TODO: Create milestone in database
            return new ApiResponse(201, {}, 'Milestone created').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// TIMELINE PROJECTION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals/{id}/projection:
 *   get:
 *     summary: Get goal timeline projection
 *     tags: [Projections]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id/projection',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const projection = await GoalTimelineProjector.getLatestProjection(req.params.id);
            const history = await GoalTimelineProjector.getProjectionHistory(req.params.id, 5);

            return new ApiResponse(200, {
                latestProjection: projection,
                history,
            }, 'Projection retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}/projection/generate:
 *   post:
 *     summary: Generate new timeline projection
 *     tags: [Projections]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:id/projection/generate',
    protect,
    param('id').isUUID(),
    body('projectionType').optional().isIn(['deterministic', 'stochastic']),
    body('simulationCount').optional().isInt({ min: 100, max: 10000 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const projection = await GoalTimelineProjector.generateProjection(
                req.params.id,
                req.user.id,
                {
                    projectionType: req.body.projectionType || 'stochastic',
                    simulationCount: req.body.simulationCount || 1000,
                }
            );

            return new ApiResponse(200, { projection }, 'Projection generated').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals/{id}/analytics:
 *   get:
 *     summary: Get goal analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id/analytics',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const analytics = await GoalAnalyticsService.getLatestAnalytics(req.params.id);
            const history = await GoalAnalyticsService.getAnalyticsHistory(req.params.id, 6);

            return new ApiResponse(200, {
                latestAnalytics: analytics,
                history,
            }, 'Analytics retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/{id}/analytics/generate:
 *   post:
 *     summary: Generate goal analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/:id/analytics/generate',
    protect,
    param('id').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const goal = await GoalManager.getGoalById(req.params.id, req.user.id);
            if (!goal) {
                throw new AppError(404, 'Goal not found');
            }

            const analytics = await GoalAnalyticsService.generateAnalytics(
                req.params.id,
                req.user.id
            );

            return new ApiResponse(200, { analytics }, 'Analytics generated').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goals/portfolio/analytics:
 *   get:
 *     summary: Get portfolio-level analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/portfolio/analytics',
    protect,
    async (req, res, next) => {
        try {
            const vaultId = req.query.vaultId || '';
            const portfolioAnalytics = await GoalAnalyticsService.getPortfolioAnalytics(
                req.user.id,
                vaultId
            );

            return new ApiResponse(200, { portfolioAnalytics }, 'Portfolio analytics retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// DASHBOARD ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goals/dashboard/summary:
 *   get:
 *     summary: Get goals dashboard summary
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/dashboard/summary',
    protect,
    async (req, res, next) => {
        try {
            const vaultId = req.query.vaultId;
            const summary = await GoalManager.getGoalSummary(req.user.id, vaultId || '');
            const needingAttention = await GoalManager.getGoalsNeedingAttention(
                req.user.id,
                vaultId || ''
            );
            const portfolioAnalytics = await GoalAnalyticsService.getPortfolioAnalytics(
                req.user.id,
                vaultId || ''
            );

            return new ApiResponse(200, {
                summary,
                needingAttention,
                portfolioAnalytics,
            }, 'Dashboard summary retrieved').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

export default router;
