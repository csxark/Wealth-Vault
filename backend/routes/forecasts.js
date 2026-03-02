/**
 * Budget Forecasting API Routes
 * 
 * Provides endpoints for category budget forecasting with confidence intervals
 * Implements predictive analytics to prevent overspending before month-end
 * 
 * Issue #609: Category Budget Forecasting with Confidence Intervals
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { categoryForecasts, forecastAlerts, categories } from '../db/schema.js';
import forecastService from '../services/forecastService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /forecasts/generate:
 *   post:
 *     summary: Generate forecast for a category
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryId
 *             properties:
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               periodType:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 default: monthly
 *               periodsAhead:
 *                 type: integer
 *                 default: 1
 *                 minimum: 1
 *                 maximum: 12
 *     responses:
 *       200:
 *         description: Forecast generated successfully
 *       400:
 *         description: Invalid parameters or insufficient historical data
 *       500:
 *         description: Server error
 */
router.post(
    '/generate',
    protect,
    [
        body('categoryId').isUUID().withMessage('Valid category ID is required'),
        body('periodType').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid period type'),
        body('periodsAhead').optional().isInt({ min: 1, max: 12 }).withMessage('Periods ahead must be between 1 and 12')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { categoryId, periodType = 'monthly', periodsAhead = 1 } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Verify category exists and belongs to user
            const category = await db.query.categories.findFirst({
                where: and(
                    eq(categories.id, categoryId),
                    eq(categories.userId, userId),
                    eq(categories.tenantId, tenantId)
                )
            });

            if (!category) {
                return res.status(404).json({
                    error: 'Category not found or access denied'
                });
            }

            // Generate forecast
            const forecast = await forecastService.generateForecast(
                userId,
                categoryId,
                tenantId,
                periodType,
                periodsAhead
            );

            res.json({
                success: true,
                data: forecast,
                message: 'Forecast generated successfully'
            });

        } catch (error) {
            logger.error('Error generating forecast', {
                error: error.message,
                userId: req.user.id,
                stack: error.stack
            });

            const statusCode = error.message.includes('Insufficient historical data') ? 400 : 500;

            res.status(statusCode).json({
                error: 'Failed to generate forecast',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /forecasts/category/{categoryId}:
 *   get:
 *     summary: Get latest forecast for a category
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: monthly
 *     responses:
 *       200:
 *         description: Latest forecast for the category
 *       404:
 *         description: No forecast found
 */
router.get(
    '/category/:categoryId',
    protect,
    [
        param('categoryId').isUUID().withMessage('Valid category ID is required'),
        query('periodType').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid period type')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { categoryId } = req.params;
            const { periodType = 'monthly' } = req.query;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            const forecast = await forecastService.getLatestForecast(
                userId,
                categoryId,
                tenantId,
                periodType
            );

            if (!forecast) {
                return res.status(404).json({
                    error: 'No forecast found for this category',
                    message: 'Try generating a forecast first'
                });
            }

            res.json({
                success: true,
                data: forecast
            });

        } catch (error) {
            logger.error('Error getting forecast', {
                error: error.message,
                userId: req.user.id
            });

            res.status(500).json({
                error: 'Failed to get forecast',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /forecasts/alerts:
 *   get:
 *     summary: Get active forecast alerts
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active forecast alerts
 */
router.get('/alerts', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        const alerts = await forecastService.getActiveForecastAlerts(userId, tenantId);

        res.json({
            success: true,
            data: alerts,
            count: alerts.length
        });

    } catch (error) {
        logger.error('Error getting forecast alerts', {
            error: error.message,
            userId: req.user.id
        });

        res.status(500).json({
            error: 'Failed to get forecast alerts',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /forecasts/alerts/{alertId}/dismiss:
 *   post:
 *     summary: Dismiss a forecast alert
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Alert dismissed successfully
 *       404:
 *         description: Alert not found
 */
router.post(
    '/alerts/:alertId/dismiss',
    protect,
    [
        param('alertId').isUUID().withMessage('Valid alert ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { alertId } = req.params;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            const alert = await forecastService.dismissForecastAlert(alertId, userId, tenantId);

            if (!alert) {
                return res.status(404).json({
                    error: 'Alert not found or access denied'
                });
            }

            res.json({
                success: true,
                data: alert,
                message: 'Alert dismissed successfully'
            });

        } catch (error) {
            logger.error('Error dismissing alert', {
                error: error.message,
                userId: req.user.id
            });

            res.status(500).json({
                error: 'Failed to dismiss alert',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /forecasts/historical/{categoryId}:
 *   post:
 *     summary: Collect and store historical data for a category
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
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
 *               periodType:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 default: daily
 *               lookbackDays:
 *                 type: integer
 *                 default: 90
 *                 minimum: 7
 *                 maximum: 365
 *     responses:
 *       200:
 *         description: Historical data collected successfully
 */
router.post(
    '/historical/:categoryId',
    protect,
    [
        param('categoryId').isUUID().withMessage('Valid category ID is required'),
        body('periodType').optional().isIn(['daily', 'weekly', 'monthly']),
        body('lookbackDays').optional().isInt({ min: 7, max: 365 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { categoryId } = req.params;
            const { periodType = 'daily', lookbackDays = 90 } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Verify category exists
            const category = await db.query.categories.findFirst({
                where: and(
                    eq(categories.id, categoryId),
                    eq(categories.userId, userId),
                    eq(categories.tenantId, tenantId)
                )
            });

            if (!category) {
                return res.status(404).json({
                    error: 'Category not found or access denied'
                });
            }

            const dataPointsCollected = await forecastService.collectHistoricalData(
                userId,
                categoryId,
                tenantId,
                periodType,
                lookbackDays
            );

            res.json({
                success: true,
                message: 'Historical data collected successfully',
                dataPointsCollected
            });

        } catch (error) {
            logger.error('Error collecting historical data', {
                error: error.message,
                userId: req.user.id
            });

            res.status(500).json({
                error: 'Failed to collect historical data',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /forecasts/validate/{forecastId}:
 *   post:
 *     summary: Validate forecast accuracy after period ends
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: forecastId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Forecast accuracy validated
 *       400:
 *         description: Forecast period has not ended
 *       404:
 *         description: Forecast not found
 */
router.post(
    '/validate/:forecastId',
    protect,
    [
        param('forecastId').isUUID().withMessage('Valid forecast ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { forecastId } = req.params;

            // Verify forecast belongs to user
            const forecast = await db.query.categoryForecasts.findFirst({
                where: and(
                    eq(categoryForecasts.id, forecastId),
                    eq(categoryForecasts.userId, req.user.id),
                    eq(categoryForecasts.tenantId, req.user.tenantId)
                )
            });

            if (!forecast) {
                return res.status(404).json({
                    error: 'Forecast not found or access denied'
                });
            }

            const metric = await forecastService.validateForecastAccuracy(forecastId);

            if (!metric) {
                return res.status(400).json({
                    error: 'Forecast period has not ended yet'
                });
            }

            res.json({
                success: true,
                data: metric,
                message: 'Forecast accuracy validated'
            });

        } catch (error) {
            logger.error('Error validating forecast', {
                error: error.message,
                userId: req.user.id
            });

            res.status(500).json({
                error: 'Failed to validate forecast',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /forecasts/categories:
 *   get:
 *     summary: Get forecasts for all user categories
 *     tags: [Forecasts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: monthly
 *     responses:
 *       200:
 *         description: List of forecasts for all categories
 */
router.get(
    '/categories',
    protect,
    [
        query('periodType').optional().isIn(['daily', 'weekly', 'monthly'])
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { periodType = 'monthly' } = req.query;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Get all user categories
            const userCategories = await db.query.categories.findMany({
                where: and(
                    eq(categories.userId, userId),
                    eq(categories.tenantId, tenantId)
                )
            });

            // Get latest forecast for each category
            const forecasts = await Promise.all(
                userCategories.map(async (category) => {
                    const forecast = await forecastService.getLatestForecast(
                        userId,
                        category.id,
                        tenantId,
                        periodType
                    );

                    return {
                        category: {
                            id: category.id,
                            name: category.name,
                            monthlyBudget: category.monthlyBudget
                        },
                        forecast
                    };
                })
            );

            res.json({
                success: true,
                data: forecasts,
                count: forecasts.length
            });

        } catch (error) {
            logger.error('Error getting category forecasts', {
                error: error.message,
                userId: req.user.id
            });

            res.status(500).json({
                error: 'Failed to get category forecasts',
                message: error.message
            });
        }
    }
);

export default router;
