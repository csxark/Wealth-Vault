/**
 * Expense Anomaly Detection API Routes
 * 
 * Endpoints for reviewing anomalies, managing rules, and viewing statistics
 * 
 * Issue #612: Expense Anomaly Detection using Time Series Analysis
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { anomalyDetections, anomalyRules } from '../db/schema.js';
import anomalyDetectionService from '../services/anomalyDetectionService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /anomalies/unreviewed:
 *   get:
 *     summary: Get unreviewed anomalies for current user
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *     responses:
 *       200:
 *         description: List of unreviewed anomalies
 *       500:
 *         description: Server error
 */
router.get(
    '/unreviewed',
    protect,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { limit = 50, severity } = req.query;

            let query = db.select().from(anomalyDetections)
                .where(and(
                    eq(anomalyDetections.userId, userId),
                    eq(anomalyDetections.tenantId, tenantId),
                    eq(anomalyDetections.status, 'detected')
                ));

            if (severity) {
                query = query.where(eq(anomalyDetections.severity, severity));
            }

            const anomalies = await query
                .orderBy(anomalyDetections.anomalyScore)
                .limit(parseInt(limit));

            res.status(200).json({
                success: true,
                anomalies
            });
        } catch (error) {
            logger.error('Error getting unreviewed anomalies:', error);
            res.status(500).json({ error: 'Failed to retrieve anomalies' });
        }
    }
);

/**
 * @swagger
 * /anomalies/{detectionId}/review:
 *   post:
 *     summary: Review anomaly and take action
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: detectionId
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
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [confirmed, false_positive, reviewed]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Anomaly reviewed successfully
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Detection not found
 *       500:
 *         description: Server error
 */
router.post(
    '/:detectionId/review',
    protect,
    [
        param('detectionId').isUUID().withMessage('Valid detection ID is required'),
        body('action').isIn(['confirmed', 'false_positive', 'reviewed']).withMessage('Invalid action'),
        body('notes').optional().isString().withMessage('Notes must be a string')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { detectionId } = req.params;
            const { action, notes } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Verify detection exists and belongs to user
            const [detection] = await db.select().from(anomalyDetections)
                .where(and(
                    eq(anomalyDetections.id, detectionId),
                    eq(anomalyDetections.userId, userId),
                    eq(anomalyDetections.tenantId, tenantId)
                ))
                .limit(1);

            if (!detection) {
                return res.status(404).json({ error: 'Detection not found' });
            }

            // Review anomaly
            const reviewed = await anomalyDetectionService.reviewAnomaly(
                detectionId,
                userId,
                tenantId,
                action,
                notes
            );

            res.status(200).json({
                success: true,
                message: `Anomaly marked as ${action}`,
                detection: reviewed
            });
        } catch (error) {
            logger.error('Error reviewing anomaly:', error);
            res.status(500).json({ error: 'Failed to review anomaly' });
        }
    }
);

/**
 * @swagger
 * /anomalies/stats:
 *   get:
 *     summary: Get anomaly statistics for category
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *     responses:
 *       200:
 *         description: Anomaly statistics
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.get(
    '/stats',
    protect,
    [
        query('categoryId').isUUID().withMessage('Valid category ID is required'),
        query('period').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid period')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { categoryId, period = 'daily' } = req.query;

            const stats = await anomalyDetectionService.getAnomalyStats(
                userId,
                categoryId,
                tenantId,
                period
            );

            res.status(200).json({
                success: true,
                stats: stats || {
                    message: 'No statistics available yet',
                    categoryId,
                    period
                }
            });
        } catch (error) {
            logger.error('Error getting anomaly stats:', error);
            res.status(500).json({ error: 'Failed to retrieve statistics' });
        }
    }
);

/**
 * @swagger
 * /anomalies/rules:
 *   get:
 *     summary: Get anomaly detection rules for tenant
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of anomaly rules
 *       500:
 *         description: Server error
 */
router.get(
    '/rules',
    protect,
    async (req, res) => {
        try {
            const tenantId = req.user.tenantId;

            const rules = await db.select().from(anomalyRules)
                .where(eq(anomalyRules.tenantId, tenantId))
                .orderBy(anomalyRules.priority);

            res.status(200).json({
                success: true,
                rules
            });
        } catch (error) {
            logger.error('Error getting anomaly rules:', error);
            res.status(500).json({ error: 'Failed to retrieve rules' });
        }
    }
);

/**
 * @swagger
 * /anomalies/rules:
 *   post:
 *     summary: Create custom anomaly detection rule
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ruleName
 *               - ruleType
 *               - condition
 *               - action
 *             properties:
 *               ruleName:
 *                 type: string
 *               description:
 *                 type: string
 *               ruleType:
 *                 type: string
 *                 enum: [threshold, pattern, ratio]
 *               condition:
 *                 type: object
 *                 properties:
 *                   field:
 *                     type: string
 *                   operator:
 *                     type: string
 *                   value:
 *                     type: number
 *               action:
 *                 type: string
 *                 enum: [flag, block, alert, review]
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               priority:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Rule created successfully
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.post(
    '/rules',
    protect,
    [
        body('ruleName').isString().trim().notEmpty().withMessage('Rule name is required'),
        body('description').optional().isString().trim(),
        body('ruleType').isIn(['threshold', 'pattern', 'ratio']).withMessage('Invalid rule type'),
        body('condition').isObject().withMessage('Condition must be an object'),
        body('action').isIn(['flag', 'block', 'alert', 'review']).withMessage('Invalid action'),
        body('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
        body('priority').optional().isInt({ min: 0, max: 100 }).withMessage('Priority must be between 0 and 100')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const tenantId = req.user.tenantId;
            const { ruleName, description, ruleType, condition, action, severity = 'medium', priority = 0 } = req.body;

            const [rule] = await db.insert(anomalyRules).values({
                tenantId,
                ruleName,
                description,
                ruleType,
                condition,
                action,
                severity,
                priority,
                isActive: true
            }).returning();

            res.status(201).json({
                success: true,
                message: 'Rule created successfully',
                rule
            });
        } catch (error) {
            logger.error('Error creating anomaly rule:', error);
            res.status(500).json({ error: 'Failed to create rule' });
        }
    }
);

/**
 * @swagger
 * /anomalies/rules/{ruleId}:
 *   patch:
 *     summary: Update anomaly detection rule
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *               priority:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rule updated successfully
 *       404:
 *         description: Rule not found
 *       500:
 *         description: Server error
 */
router.patch(
    '/rules/:ruleId',
    protect,
    [
        param('ruleId').isUUID().withMessage('Valid rule ID is required'),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
        body('priority').optional().isInt({ min: 0, max: 100 }).withMessage('Priority must be between 0 and 100')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { ruleId } = req.params;
            const tenantId = req.user.tenantId;
            const updateData = {};

            if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
            if (req.body.priority !== undefined) updateData.priority = req.body.priority;
            if (req.body.description !== undefined) updateData.description = req.body.description;

            const [rule] = await db.update(anomalyRules)
                .set({ ...updateData, updatedAt: new Date() })
                .where(and(
                    eq(anomalyRules.id, ruleId),
                    eq(anomalyRules.tenantId, tenantId)
                ))
                .returning();

            if (!rule) {
                return res.status(404).json({ error: 'Rule not found' });
            }

            res.status(200).json({
                success: true,
                message: 'Rule updated successfully',
                rule
            });
        } catch (error) {
            logger.error('Error updating anomaly rule:', error);
            res.status(500).json({ error: 'Failed to update rule' });
        }
    }
);

/**
 * @swagger
 * /anomalies/rules/{ruleId}:
 *   delete:
 *     summary: Delete anomaly detection rule
 *     tags: [Anomaly Detection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Rule deleted successfully
 *       404:
 *         description: Rule not found
 *       500:
 *         description: Server error
 */
router.delete(
    '/rules/:ruleId',
    protect,
    [
        param('ruleId').isUUID().withMessage('Valid rule ID is required')
    ],
    async (req, res) => {
        try {
            const { ruleId } = req.params;
            const tenantId = req.user.tenantId;

            const result = await db.delete(anomalyRules)
                .where(and(
                    eq(anomalyRules.id, ruleId),
                    eq(anomalyRules.tenantId, tenantId)
                ))
                .returning();

            if (result.length === 0) {
                return res.status(404).json({ error: 'Rule not found' });
            }

            res.status(200).json({
                success: true,
                message: 'Rule deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting anomaly rule:', error);
            res.status(500).json({ error: 'Failed to delete rule' });
        }
    }
);

export default router;
