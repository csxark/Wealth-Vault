// backend/routes/logVolumeForecast.js
// Issue #649: Log Volume Forecasting API Routes

import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { validateTenantAccess, requireTenantPermission } from '../middleware/tenantMiddleware.js';
import {
    generateLogVolumeForecast,
    getTenantForecast,
    clearTenantForecastCache,
    getAllTenantsForecastSummary,
    FORECAST_HORIZON_DAYS,
    MIN_DATA_POINTS
} from '../services/logVolumeForecastService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/log-volume-forecast
 * Generate or refresh log volume forecast for the tenant
 */
router.post(
    '/',
    protect,
    validateTenantAccess,
    requireTenantPermission(['logs:forecast', 'admin:view']),
    [
        body('historical_days')
            .optional()
            .isInt({ min: MIN_DATA_POINTS, max: 365 })
            .withMessage(`Historical days must be between ${MIN_DATA_POINTS} and 365`),
        body('force_refresh')
            .optional()
            .isBoolean()
            .withMessage('force_refresh must be a boolean')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { tenantId } = req;
            const options = {
                historical_days: req.body.historical_days || 90,
                force_refresh: req.body.force_refresh || false
            };

            const forecast = await generateLogVolumeForecast(tenantId, options);

            res.json({
                success: true,
                data: forecast
            });

        } catch (error) {
            logger.error('Error generating log volume forecast', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to generate log volume forecast'
            });
        }
    }
);

/**
 * GET /api/log-volume-forecast
 * Get current log volume forecast for the tenant
 */
router.get(
    '/',
    protect,
    validateTenantAccess,
    requireTenantPermission(['logs:view', 'admin:view']),
    async (req, res) => {
        try {
            const { tenantId } = req;
            const forecast = await getTenantForecast(tenantId);

            if (!forecast) {
                return res.status(404).json({
                    success: false,
                    error: 'No forecast available. Generate a forecast first.'
                });
            }

            res.json({
                success: true,
                data: forecast
            });

        } catch (error) {
            logger.error('Error retrieving log volume forecast', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to retrieve log volume forecast'
            });
        }
    }
);

/**
 * GET /api/log-volume-forecast/dashboard
 * Get dashboard visualization data
 */
router.get(
    '/dashboard',
    protect,
    validateTenantAccess,
    requireTenantPermission(['logs:view', 'admin:view']),
    async (req, res) => {
        try {
            const { tenantId } = req;
            const forecast = await getTenantForecast(tenantId);

            if (!forecast) {
                return res.status(404).json({
                    success: false,
                    error: 'No forecast available. Generate a forecast first.'
                });
            }

            res.json({
                success: true,
                data: forecast.dashboard
            });

        } catch (error) {
            logger.error('Error retrieving forecast dashboard data', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to retrieve dashboard data'
            });
        }
    }
);

/**
 * GET /api/log-volume-forecast/capacity-planning
 * Get capacity planning recommendations
 */
router.get(
    '/capacity-planning',
    protect,
    validateTenantAccess,
    requireTenantPermission(['logs:forecast', 'admin:view']),
    async (req, res) => {
        try {
            const { tenantId } = req;
            const forecast = await getTenantForecast(tenantId);

            if (!forecast) {
                return res.status(404).json({
                    success: false,
                    error: 'No forecast available. Generate a forecast first.'
                });
            }

            res.json({
                success: true,
                data: forecast.capacity_planning
            });

        } catch (error) {
            logger.error('Error retrieving capacity planning data', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to retrieve capacity planning data'
            });
        }
    }
);

/**
 * DELETE /api/log-volume-forecast/cache
 * Clear forecast cache for the tenant
 */
router.delete(
    '/cache',
    protect,
    validateTenantAccess,
    requireTenantPermission(['logs:forecast', 'admin:manage']),
    async (req, res) => {
        try {
            const { tenantId } = req;
            await clearTenantForecastCache(tenantId);

            res.json({
                success: true,
                message: 'Forecast cache cleared successfully'
            });

        } catch (error) {
            logger.error('Error clearing forecast cache', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to clear forecast cache'
            });
        }
    }
);

/**
 * GET /api/log-volume-forecast/admin/summary
 * Get forecast summary for all tenants (admin only)
 */
router.get(
    '/admin/summary',
    protect,
    requireTenantPermission(['admin:manage']),
    async (req, res) => {
        try {
            const summary = await getAllTenantsForecastSummary();

            res.json({
                success: true,
                data: summary
            });

        } catch (error) {
            logger.error('Error retrieving admin forecast summary', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to retrieve admin forecast summary'
            });
        }
    }
);

/**
 * GET /api/log-volume-forecast/config
 * Get forecasting configuration info
 */
router.get(
    '/config',
    protect,
    async (req, res) => {
        res.json({
            success: true,
            data: {
                forecast_horizon_days: FORECAST_HORIZON_DAYS,
                min_data_points: MIN_DATA_POINTS,
                supported_models: ['linear_trend', 'exponential_smoothing', 'moving_average', 'ensemble'],
                cache_ttl_hours: 1,
                max_historical_days: 365
            }
        });
    }
);

export default router;