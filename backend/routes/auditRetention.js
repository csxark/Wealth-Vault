// backend/routes/auditRetention.js
// Issue #614: Audit Log Retention API Routes

import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import auditLogRetentionService from '../services/auditLogRetentionService.js';

const router = express.Router();

/**
 * GET /api/audit-retention/policies
 * Get all retention policies for the tenant
 */
router.get('/policies', protect, async (req, res) => {
    try {
        const policies = await auditLogRetentionService.getTenantRetentionPolicies(
            req.user.tenant_id
        );

        res.json({
            success: true,
            data: policies,
            count: policies.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audit-retention/policies
 * Create a new retention policy
 */
router.post(
    '/policies',
    protect,
    [
        body('policyName')
            .trim()
            .notEmpty()
            .withMessage('Policy name is required')
            .isLength({ max: 100 })
            .withMessage('Policy name must be at most 100 characters'),
        body('retentionDays')
            .isInt({ min: 30, max: 2555 })
            .withMessage('Retention days must be between 30 and 2555'),
        body('archiveAfterDays')
            .isInt({ min: 0 })
            .withMessage('Archive after days must be a positive integer'),
        body('deleteAfterDays')
            .isInt({ min: 0 })
            .withMessage('Delete after days must be a positive integer'),
        body('complianceFramework')
            .notEmpty()
            .withMessage('Compliance framework is required')
            .isIn(['GDPR', 'HIPAA', 'SOC2', 'PCI-DSS', 'ISO27001', 'CUSTOM'])
            .withMessage('Invalid compliance framework'),
        body('archiveDestination')
            .optional()
            .isIn(['s3', 'azure', 'gcs'])
            .withMessage('Invalid archive destination')
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

            // Validate archive_after_days < delete_after_days
            if (req.body.archiveAfterDays >= req.body.deleteAfterDays) {
                return res.status(400).json({
                    success: false,
                    error: 'Archive after days must be less than delete after days'
                });
            }

            const policy = await auditLogRetentionService.createRetentionPolicy(
                req.user.tenant_id,
                req.body
            );

            res.status(201).json({
                success: true,
                data: policy,
                message: 'Retention policy created successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * PATCH /api/audit-retention/policies/:policyId
 * Update a retention policy
 */
router.patch(
    '/policies/:policyId',
    protect,
    [
        body('policyName')
            .optional()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Policy name must be at most 100 characters'),
        body('retentionDays')
            .optional()
            .isInt({ min: 30, max: 2555 })
            .withMessage('Retention days must be between 30 and 2555'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Description must be at most 500 characters')
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

            const policy = await auditLogRetentionService.updateRetentionPolicy(
                req.user.tenant_id,
                req.params.policyId,
                req.body
            );

            if (!policy) {
                return res.status(404).json({
                    success: false,
                    error: 'Policy not found'
                });
            }

            res.json({
                success: true,
                data: policy,
                message: 'Policy updated successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/audit-retention/policies/:policyId/status
 * Get compliance status for a policy
 */
router.get('/policies/:policyId/status', protect, async (req, res) => {
    try {
        const status = await auditLogRetentionService.getTenantRetentionStatus(
            req.user.tenant_id,
            req.params.policyId
        );

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: 'Policy not found'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audit-retention/apply-policy
 * Apply a retention policy (compress, archive, delete)
 */
router.post(
    '/apply-policy',
    protect,
    [
        body('policyId')
            .notEmpty()
            .withMessage('Policy ID is required')
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

            const result = await auditLogRetentionService.applyRetentionPolicy(
                req.user.tenant_id,
                req.body.policyId
            );

            res.json({
                success: true,
                data: result,
                message: 'Retention policy applied successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * POST /api/audit-retention/compress
 * Trigger manual compression job
 */
router.post(
    '/compress',
    protect,
    [
        body('policyId')
            .notEmpty()
            .withMessage('Policy ID is required')
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

            const result = await auditLogRetentionService.compressAuditLogs(
                req.user.tenant_id,
                req.body.policyId
            );

            res.json({
                success: true,
                data: result,
                message: 'Compression job started'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * POST /api/audit-retention/archive
 * Trigger manual archival job
 */
router.post(
    '/archive',
    protect,
    [
        body('policyId')
            .notEmpty()
            .withMessage('Policy ID is required')
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

            const result = await auditLogRetentionService.archiveCompressedLogs(
                req.user.tenant_id,
                req.body.policyId
            );

            res.json({
                success: true,
                data: result,
                message: 'Archival job started'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/audit-retention/archives
 * List all archives for the tenant
 */
router.get(
    '/archives',
    protect,
    [
        query('status')
            .optional()
            .isIn(['pending', 'in-progress', 'completed', 'failed', 'verified', 'deleted'])
            .withMessage('Invalid archive status'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .toInt()
            .withMessage('Limit must be between 1 and 100'),
        query('offset')
            .optional()
            .isInt({ min: 0 })
            .toInt()
            .withMessage('Offset must be a non-negative integer')
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

            // Query archives (simplified - actual implementation would use pagination)
            const limit = req.query.limit || 20;
            const offset = req.query.offset || 0;

            // This would query the audit_log_archives table with proper filtering
            // For now, returning empty list structure
            const archives = [];

            res.json({
                success: true,
                data: archives,
                pagination: {
                    limit,
                    offset,
                    total: 0
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/audit-retention/metrics
 * Get retention metrics and analytics
 */
router.get(
    '/metrics',
    protect,
    [
        query('period')
            .optional()
            .isIn(['daily', 'weekly', 'monthly'])
            .withMessage('Invalid period type'),
        query('days')
            .optional()
            .isInt({ min: 1, max: 365 })
            .toInt()
            .withMessage('Days must be between 1 and 365')
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

            const periodType = req.query.period || 'daily';
            const days = req.query.days || 30;

            const metrics = await auditLogRetentionService.getRetentionMetrics(
                req.user.tenant_id,
                periodType,
                days
            );

            res.json({
                success: true,
                data: metrics,
                summary: {
                    periodType,
                    days,
                    metricsCount: metrics.length
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * POST /api/audit-retention/verify
 * Trigger archive integrity verification
 */
router.post(
    '/verify',
    protect,
    [
        body('policyId')
            .notEmpty()
            .withMessage('Policy ID is required')
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

            const result = await auditLogRetentionService.verifyArchiveIntegrity(
                req.user.tenant_id,
                req.body.policyId
            );

            res.json({
                success: true,
                data: result,
                message: 'Archive integrity verification completed'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/audit-retention/cost-estimate
 * Get storage cost and savings estimates
 */
router.get(
    '/cost-estimate',
    protect,
    [
        query('policyId')
            .notEmpty()
            .withMessage('Policy ID is required')
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

            const estimate = await auditLogRetentionService.estimateStorageCosts(
                req.user.tenant_id,
                req.query.policyId
            );

            res.json({
                success: true,
                data: estimate
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

export default router;
