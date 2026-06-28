/**
 * Goal Contribution Volatility Smoother Routes - Issue #713
 * 
 * API endpoints for managing contribution smoothing, recommendations,
 * cashflow history, and major shift detection.
 * 
 * @module routes/goalContributionSmoothing
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { AppError } from '../utils/appError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import GoalContributionSmoothingService from '../services/goalContributionSmoothingService.js';

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
// SMOOTHING CONFIGURATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goal-smoothing/config:
 *   get:
 *     summary: Get smoothing configuration for user or specific goal
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: vaultId
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get(
    '/config',
    protect,
    query('goalId').optional().isUUID(),
    query('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { goalId, vaultId } = req.query;
            const config = await GoalContributionSmoothingService.getOrCreateConfig(
                req.user.id,
                goalId,
                vaultId
            );

            return new ApiResponse(200, config, 'Configuration retrieved successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/config/{configId}:
 *   put:
 *     summary: Update smoothing configuration
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/config/:configId',
    protect,
    param('configId').isUUID(),
    body('rollingWindowMonths').optional().isInt({ min: 1, max: 12 }),
    body('smoothingFactor').optional().isFloat({ min: 0.1, max: 1.0 }),
    body('varianceThresholdPercentage').optional().isFloat({ min: 5, max: 100 }),
    body('maxMonthOverMonthChangePct').optional().isFloat({ min: 5, max: 100 }),
    body('minContributionAmount').optional().isFloat({ min: 0 }),
    body('maxContributionAmount').optional().isFloat({ min: 0 }),
    body('enableSmoothing').optional().isBoolean(),
    body('enableCashflowDetection').optional().isBoolean(),
    body('requireManualOverride').optional().isBoolean(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { configId } = req.params;
            const updates = req.body;

            const updated = await GoalContributionSmoothingService.updateConfig(configId, updates);

            return new ApiResponse(200, updated, 'Configuration updated successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// CASHFLOW HISTORY ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goal-smoothing/cashflow/calculate:
 *   post:
 *     summary: Calculate and store cashflow for a period
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/cashflow/calculate',
    protect,
    body('periodStart').isISO8601(),
    body('periodEnd').isISO8601(),
    body('vaultId').optional().isUUID(),
    body('periodType').optional().isIn(['weekly', 'biweekly', 'monthly', 'quarterly']),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { periodStart, periodEnd, vaultId, periodType = 'monthly' } = req.body;

            const cashflow = await GoalContributionSmoothingService.calculateCashflowPeriod(
                req.user.id,
                periodStart,
                periodEnd,
                vaultId,
                periodType
            );

            return new ApiResponse(200, cashflow, 'Cashflow calculated successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/cashflow/rolling-averages:
 *   get:
 *     summary: Get rolling cashflow averages
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/cashflow/rolling-averages',
    protect,
    query('windowMonths').optional().isInt({ min: 1, max: 12 }),
    query('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { windowMonths = 3, vaultId } = req.query;

            const averages = await GoalContributionSmoothingService.getRollingAverages(
                req.user.id,
                parseInt(windowMonths),
                vaultId
            );

            return new ApiResponse(200, averages, 'Rolling averages retrieved successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// RECOMMENDATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goal-smoothing/recommendations/{goalId}:
 *   post:
 *     summary: Calculate smoothed contribution recommendation for a goal
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/recommendations/:goalId',
    protect,
    param('goalId').isUUID(),
    body('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { goalId } = req.params;
            const { vaultId } = req.body;

            const recommendation = await GoalContributionSmoothingService.calculateSmoothedRecommendation(
                req.user.id,
                goalId,
                vaultId
            );

            return new ApiResponse(
                201,
                recommendation,
                'Smoothed recommendation calculated successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/recommendations:
 *   post:
 *     summary: Calculate recommendations for all active goals
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/recommendations',
    protect,
    body('vaultId').optional().isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { vaultId } = req.body;

            const recommendations = await GoalContributionSmoothingService.calculateAllRecommendations(
                req.user.id,
                vaultId
            );

            return new ApiResponse(
                201,
                { recommendations, count: recommendations.length },
                'All recommendations calculated successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/recommendations/{goalId}/latest:
 *   get:
 *     summary: Get latest recommendation for a goal
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/recommendations/:goalId/latest',
    protect,
    param('goalId').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { goalId } = req.params;

            const recommendation = await GoalContributionSmoothingService.getLatestRecommendation(
                req.user.id,
                goalId
            );

            if (!recommendation) {
                return new ApiResponse(404, null, 'No active recommendation found').send(res);
            }

            return new ApiResponse(200, recommendation, 'Recommendation retrieved successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/recommendations/{goalId}/history:
 *   get:
 *     summary: Get recommendation history for a goal
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/recommendations/:goalId/history',
    protect,
    param('goalId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { goalId } = req.params;
            const { limit = 12 } = req.query;

            const history = await GoalContributionSmoothingService.getRecommendationHistory(
                req.user.id,
                goalId,
                parseInt(limit)
            );

            return new ApiResponse(
                200,
                { history, count: history.length },
                'Recommendation history retrieved successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/recommendations/{recommendationId}/accept:
 *   post:
 *     summary: Accept a recommendation
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/recommendations/:recommendationId/accept',
    protect,
    param('recommendationId').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { recommendationId } = req.params;

            const updated = await GoalContributionSmoothingService.acceptRecommendation(
                recommendationId,
                req.user.id
            );

            if (!updated) {
                return new ApiResponse(404, null, 'Recommendation not found').send(res);
            }

            return new ApiResponse(200, updated, 'Recommendation accepted successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/recommendations/{recommendationId}/override:
 *   post:
 *     summary: Override a recommendation with a custom amount
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/recommendations/:recommendationId/override',
    protect,
    param('recommendationId').isUUID(),
    body('overrideAmount').isFloat({ min: 0 }),
    body('reason').optional().isString(),
    body('feedback').optional().isIn(['too_high', 'too_low', 'just_right', 'ignored']),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { recommendationId } = req.params;
            const { overrideAmount, reason, feedback } = req.body;

            const updated = await GoalContributionSmoothingService.overrideRecommendation(
                recommendationId,
                req.user.id,
                overrideAmount,
                reason,
                feedback
            );

            if (!updated) {
                return new ApiResponse(404, null, 'Recommendation not found').send(res);
            }

            return new ApiResponse(200, updated, 'Recommendation overridden successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// CASHFLOW EVENTS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goal-smoothing/events:
 *   get:
 *     summary: Get cashflow events for user
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/events',
    protect,
    query('unacknowledgedOnly').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { unacknowledgedOnly = false, limit = 10 } = req.query;

            const events = await GoalContributionSmoothingService.getCashflowEvents(req.user.id, {
                unacknowledgedOnly: unacknowledgedOnly === 'true',
                limit: parseInt(limit),
            });

            return new ApiResponse(
                200,
                { events, count: events.length },
                'Cashflow events retrieved successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

/**
 * @swagger
 * /api/v1/goal-smoothing/events/{eventId}/acknowledge:
 *   post:
 *     summary: Acknowledge a cashflow event
 *     tags: [Goal Contribution Smoothing]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/events/:eventId/acknowledge',
    protect,
    param('eventId').isUUID(),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { eventId } = req.params;

            const updated = await GoalContributionSmoothingService.acknowledgeCashflowEvent(
                eventId,
                req.user.id
            );

            if (!updated) {
                return new ApiResponse(404, null, 'Event not found').send(res);
            }

            return new ApiResponse(200, updated, 'Event acknowledged successfully').send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/v1/goal-smoothing/dashboard:
 *   get:
 *     summary: Get comprehensive smoothing dashboard data
 *     tags: [Goal Contribution Smoothing]
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

            // Get rolling averages
            const averages = await GoalContributionSmoothingService.getRollingAverages(
                req.user.id,
                3,
                vaultId
            );

            // Get recent events
            const events = await GoalContributionSmoothingService.getCashflowEvents(req.user.id, {
                unacknowledgedOnly: true,
                limit: 5,
            });

            // Get config
            const config = await GoalContributionSmoothingService.getOrCreateConfig(
                req.user.id,
                null,
                vaultId
            );

            return new ApiResponse(
                200,
                {
                    rollingAverages: averages,
                    recentEvents: events,
                    config,
                    summary: {
                        smoothingEnabled: config.enableSmoothing,
                        cashflowTrend: averages.trend,
                        unacknowledgedEvents: events.length,
                        dataQuality: averages.periodCount >= 3 ? 'good' : 'limited',
                    },
                },
                'Dashboard data retrieved successfully'
            ).send(res);
        } catch (error) {
            next(new AppError(500, error.message));
        }
    }
);

export default router;
