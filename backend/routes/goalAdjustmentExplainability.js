/**
 * Goal Adjustment Explainability Routes - Issue #715
 * 
 * API endpoints for retrieving and interacting with goal adjustment explanations
 * and adjustment history timelines
 */

import express from 'express';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { protect } from '../middleware/auth.js';
import goalAdjustmentExplainabilityService from '../services/goalAdjustmentExplainabilityService.js';
import { goalAdjustmentExplanations, goalAdjustmentInsights } from '../db/schema.js';

const router = express.Router();

/**
 * @swagger
 * /goals/{goalId}/adjustments:
 *   get:
 *     summary: Get adjustment history for a goal
 *     tags: [Goals - Explainability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, amount_change, severity]
 *           default: date
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of adjustment explanations for the goal
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     adjustments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/GoalAdjustmentExplanation'
 *                     pagination:
 *                       type: object
 * 
 */
router.get('/:goalId/adjustments', protect, async (req, res, next) => {
    try {
        const { goalId } = req.params;
        const { limit = 20, offset = 0, sortBy = 'date', sortOrder = 'desc' } = req.query;

        // Verify user has access to this goal
        const goal = await db.query.goals.findFirst({
            where: eq(db.schema.goals.id, goalId),
        });

        if (!goal || goal.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this goal',
            });
        }

        // Get adjustment history
        const adjustments = await goalAdjustmentExplainabilityService.getAdjustmentHistory(
            req.user.id,
            goalId,
            {
                limit: parseInt(limit),
                offset: parseInt(offset),
                sortBy,
                sortOrder,
            }
        );

        // Get total count for pagination
        const [countResult] = await db
            .select({ count: db.sql`count(*)` })
            .from(goalAdjustmentExplanations)
            .where(
                and(
                    eq(goalAdjustmentExplanations.userId, req.user.id),
                    eq(goalAdjustmentExplanations.goalId, goalId)
                )
            );

        const total = Number(countResult.count || 0);

        return res.status(200).json({
            success: true,
            data: {
                adjustments,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /goals/{goalId}/adjustments/{explanationId}:
 *   get:
 *     summary: Get detailed explanation for a specific adjustment
 *     tags: [Goals - Explainability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: explanationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed adjustment explanation
 */
router.get('/:goalId/adjustments/:explanationId', protect, async (req, res, next) => {
    try {
        const { goalId, explanationId } = req.params;

        // Verify user access
        const goal = await db.query.goals.findFirst({
            where: eq(db.schema.goals.id, goalId),
        });

        if (!goal || goal.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this goal',
            });
        }

        // Get explanation details
        const explanation = await goalAdjustmentExplainabilityService.getAdjustmentDetails(explanationId);

        // Verify it belongs to the user's goal
        if (explanation.userId !== req.user.id || explanation.goalId !== goalId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this adjustment',
            });
        }

        // Log that user viewed this
        await goalAdjustmentExplainabilityService.markAdjustmentAsViewed(explanationId);

        return res.status(200).json({
            success: true,
            data: { explanation },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /goals/{goalId}/adjustments/{explanationId}/acknowledge:
 *   post:
 *     summary: Mark adjustment as acknowledged by user
 *     tags: [Goals - Explainability]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userFeedback:
 *                 type: string
 *               userFeedbackType:
 *                 type: string
 *                 enum: [understood, confused, disagree_too_high, disagree_too_low]
 *     responses:
 *       200:
 *         description: Acknowledgement recorded
 */
router.post('/:goalId/adjustments/:explanationId/acknowledge', protect, async (req, res, next) => {
    try {
        const { goalId, explanationId } = req.params;
        const { userFeedback, userFeedbackType } = req.body;

        // Verify access
        const goal = await db.query.goals.findFirst({
            where: eq(db.schema.goals.id, goalId),
        });

        if (!goal || goal.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this goal',
            });
        }

        const updated = await goalAdjustmentExplainabilityService.acknowledgeAdjustment(
            explanationId,
            { userFeedback, userFeedbackType }
        );

        return res.status(200).json({
            success: true,
            data: { adjustment: updated },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /goals/{goalId}/adjustment-insights:
 *   get:
 *     summary: Get insights about adjustment patterns for a goal
 *     tags: [Goals - Explainability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Insights about adjustment patterns and trends
 */
router.get('/:goalId/adjustment-insights', protect, async (req, res, next) => {
    try {
        const { goalId } = req.params;

        // Verify access
        const goal = await db.query.goals.findFirst({
            where: eq(db.schema.goals.id, goalId),
        });

        if (!goal || goal.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this goal',
            });
        }

        // Get or calculate insights
        let insights = await db
            .select()
            .from(goalAdjustmentInsights)
            .where(
                and(
                    eq(goalAdjustmentInsights.userId, req.user.id),
                    eq(goalAdjustmentInsights.goalId, goalId)
                )
            )
            .limit(1)
            .then(rows => rows[0]);

        if (!insights) {
            // Calculate fresh insights
            insights = await goalAdjustmentExplainabilityService.updateInsights(
                req.user.id,
                goalId
            );
        }

        return res.status(200).json({
            success: true,
            data: { insights },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /goals/{goalId}/adjustment-timeline/summary:
 *   get:
 *     summary: Get a summary of recent adjustments for dashboard display
 *     tags: [Goals - Explainability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *           description: Number of days of history to include
 *     responses:
 *       200:
 *         description: Summary of adjustment timeline
 */
router.get('/:goalId/adjustment-timeline/summary', protect, async (req, res, next) => {
    try {
        const { goalId } = req.params;
        const { days = 30 } = req.query;

        // Verify access
        const goal = await db.query.goals.findFirst({
            where: eq(db.schema.goals.id, goalId),
        });

        if (!goal || goal.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this goal',
            });
        }

        // Get recent adjustments
        const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        const adjustments = await db
            .select()
            .from(goalAdjustmentExplanations)
            .where(
                and(
                    eq(goalAdjustmentExplanations.userId, req.user.id),
                    eq(goalAdjustmentExplanations.goalId, goalId),
                    db.sql`${goalAdjustmentExplanations.createdAt} >= ${startDate}`
                )
            )
            .orderBy(db.desc(goalAdjustmentExplanations.createdAt))
            .limit(10);

        // Create summary with key metrics
        const summary = {
            totalAdjustments: adjustments.length,
            avgAmountChange: adjustments.length > 0
                ? (adjustments.reduce((sum, a) => sum + a.amountChange, 0) / adjustments.length).toFixed(2)
                : 0,
            mostCommonSeverity: adjustments.length > 0
                ? Object.entries(
                    adjustments.reduce((acc, a) => {
                        acc[a.severity] = (acc[a.severity] || 0) + 1;
                        return acc;
                    }, {})
                ).sort((a, b) => b[1] - a[1])[0][0]
                : 'normal',
            mostCommonTrigger: adjustments.length > 0
                ? Object.entries(
                    adjustments.reduce((acc, a) => {
                        acc[a.triggerSource] = (acc[a.triggerSource] || 0) + 1;
                        return acc;
                    }, {})
                ).sort((a, b) => b[1] - a[1])[0][0]
                : 'unknown',
            userEngagement: {
                totalViewed: adjustments.filter(a => 
                    adjustments.some(t => 
                        t.id === a.id && (t.userViewed || t.userAcknowledged)
                    )
                ).length,
                totalAcknowledged: adjustments.filter(a => a.userAcknowledged).length,
            },
            recentAdjustments: adjustments.slice(0, 5).map(a => ({
                id: a.id,
                date: a.createdAt,
                amountChange: a.amountChange,
                summary: a.summary,
                severity: a.severity,
            })),
        };

        return res.status(200).json({
            success: true,
            data: { summary },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
