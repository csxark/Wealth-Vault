// backend/routes/logSnapshots.js
// Issue #648: Log Snapshot API Routes

import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { validateTenantAccess, requireTenantPermission } from '../middleware/tenantMiddleware.js';
import {
    generateLogSnapshot,
    getSnapshot,
    listTenantSnapshots,
    verifySnapshot,
    deleteSnapshot,
    SNAPSHOT_FORMATS
} from '../services/logSnapshotService.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';

const router = express.Router();

/**
 * POST /api/log-snapshots
 * Generate a new log snapshot
 */
router.post(
    '/',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:export', 'compliance:manage']),
    [
        body('format')
            .optional()
            .isIn(Object.values(SNAPSHOT_FORMATS))
            .withMessage('Format must be json or csv'),
        body('fromDate')
            .optional()
            .isISO8601()
            .withMessage('fromDate must be a valid ISO date'),
        body('toDate')
            .optional()
            .isISO8601()
            .withMessage('toDate must be a valid ISO date'),
        body('logTypes')
            .optional()
            .isArray()
            .withMessage('logTypes must be an array'),
        body('filters')
            .optional()
            .isObject()
            .withMessage('filters must be an object')
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
                format: req.body.format || SNAPSHOT_FORMATS.JSON,
                fromDate: req.body.fromDate,
                toDate: req.body.toDate,
                logTypes: req.body.logTypes || ['audit', 'application', 'security'],
                filters: req.body.filters || {},
                requestedBy: req.user.id
            };

            const result = await generateLogSnapshot(tenantId, options);

            res.status(202).json({
                success: true,
                data: result,
                message: 'Log snapshot generation started'
            });

        } catch (error) {
            logger.error('Error generating log snapshot', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to generate log snapshot'
            });
        }
    }
);

/**
 * GET /api/log-snapshots
 * List snapshots for the tenant
 */
router.get(
    '/',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:view', 'compliance:view']),
    [
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('offset')
            .optional()
            .isInt({ min: 0 })
            .withMessage('Offset must be non-negative')
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
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const snapshots = await listTenantSnapshots(tenantId, options);

            res.json({
                success: true,
                data: snapshots,
                pagination: {
                    limit: options.limit,
                    offset: options.offset,
                    hasMore: snapshots.length === options.limit
                }
            });

        } catch (error) {
            logger.error('Error listing log snapshots', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to list log snapshots'
            });
        }
    }
);

/**
 * GET /api/log-snapshots/:snapshotId
 * Get snapshot details
 */
router.get(
    '/:snapshotId',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:view', 'compliance:view']),
    async (req, res) => {
        try {
            const { snapshotId } = req.params;
            const snapshot = await getSnapshot(snapshotId);

            if (!snapshot) {
                return res.status(404).json({
                    success: false,
                    error: 'Snapshot not found'
                });
            }

            // Check tenant access
            if (snapshot.tenant_id !== req.tenantId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            res.json({
                success: true,
                data: snapshot
            });

        } catch (error) {
            logger.error('Error getting log snapshot', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get log snapshot'
            });
        }
    }
);

/**
 * GET /api/log-snapshots/:snapshotId/download
 * Download snapshot bundle
 */
router.get(
    '/:snapshotId/download',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:export', 'compliance:manage']),
    async (req, res) => {
        try {
            const { snapshotId } = req.params;
            const snapshot = await getSnapshot(snapshotId);

            if (!snapshot) {
                return res.status(404).json({
                    success: false,
                    error: 'Snapshot not found'
                });
            }

            // Check tenant access
            if (snapshot.tenant_id !== req.tenantId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Check if snapshot is completed
            if (snapshot.status !== 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Snapshot is not ready for download'
                });
            }

            // Verify snapshot integrity before download
            await verifySnapshot(snapshotId);

            // Stream the file
            const fileName = `log-snapshot-${snapshotId}.${snapshot.format}`;
            res.setHeader('Content-Type', snapshot.format === 'json' ? 'application/json' : 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('X-Checksum', snapshot.checksum);
            res.setHeader('X-Signature', snapshot.signature);

            const fileStream = fs.createReadStream(snapshot.bundle_path);
            fileStream.pipe(res);

        } catch (error) {
            logger.error('Error downloading log snapshot', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to download log snapshot'
            });
        }
    }
);

/**
 * POST /api/log-snapshots/:snapshotId/verify
 * Verify snapshot integrity
 */
router.post(
    '/:snapshotId/verify',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:view', 'compliance:view']),
    async (req, res) => {
        try {
            const { snapshotId } = req.params;
            const snapshot = await getSnapshot(snapshotId);

            if (!snapshot) {
                return res.status(404).json({
                    success: false,
                    error: 'Snapshot not found'
                });
            }

            // Check tenant access
            if (snapshot.tenant_id !== req.tenantId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const verification = await verifySnapshot(snapshotId);

            res.json({
                success: true,
                data: verification
            });

        } catch (error) {
            logger.error('Error verifying log snapshot', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to verify log snapshot'
            });
        }
    }
);

/**
 * DELETE /api/log-snapshots/:snapshotId
 * Delete a snapshot
 */
router.delete(
    '/:snapshotId',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:delete', 'compliance:manage']),
    async (req, res) => {
        try {
            const { snapshotId } = req.params;
            const snapshot = await getSnapshot(snapshotId);

            if (!snapshot) {
                return res.status(404).json({
                    success: false,
                    error: 'Snapshot not found'
                });
            }

            // Check tenant access
            if (snapshot.tenant_id !== req.tenantId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            await deleteSnapshot(snapshotId);

            res.json({
                success: true,
                message: 'Snapshot deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting log snapshot', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete log snapshot'
            });
        }
    }
);

export default router;