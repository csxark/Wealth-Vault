/**
 * Log Lifecycle Automation Routes (#633)
 *
 * API endpoints for managing automated log lifecycle operations.
 * Provides configuration, monitoring, and manual control of log migrations.
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenant.js';
import LogLifecycleAutomation from '../services/logLifecycleAutomation.js';
import logLifecycleJob from '../jobs/logLifecycleJob.js';
import { db } from '../config/db.js';
import { sql } from 'drizzle-orm';
import { logInfo, logError, logWarn } from '../utils/logger.js';

const router = express.Router();

// Initialize service instance
let lifecycleService = null;

const getLifecycleService = async () => {
    if (!lifecycleService) {
        lifecycleService = new LogLifecycleAutomation();
        await lifecycleService.initialize();
    }
    return lifecycleService;
};

// Apply authentication and tenant middleware to all routes
router.use(authenticateToken);
router.use(validateTenantAccess);

/**
 * GET /api/log-lifecycle/status
 * Get the current status of the log lifecycle automation service
 */
router.get('/status', requireRole(['admin', 'auditor']), async (req, res) => {
    try {
        const service = await getLifecycleService();
        const status = await service.getHealthStatus();
        const jobStatus = await logLifecycleJob.getHealthStatus();

        res.json({
            success: true,
            data: {
                service: status,
                job: jobStatus
            }
        });
    } catch (error) {
        logError('Failed to get lifecycle status', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get lifecycle status'
        });
    }
});

/**
 * GET /api/log-lifecycle/policies
 * Get lifecycle policies for the tenant
 */
router.get('/policies', requireRole(['admin', 'auditor']), async (req, res) => {
    try {
        const { tenantId } = req;

        const policies = await db.execute(sql`
            SELECT * FROM log_lifecycle_policies
            WHERE tenant_id = ${tenantId}
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            data: policies
        });
    } catch (error) {
        logError('Failed to get lifecycle policies', { error: error.message, tenantId: req.tenantId });
        res.status(500).json({
            success: false,
            error: 'Failed to get lifecycle policies'
        });
    }
});

/**
 * POST /api/log-lifecycle/policies
 * Create a new lifecycle policy
 */
router.post('/policies', requireRole(['admin']), async (req, res) => {
    try {
        const { tenantId } = req;
        const {
            policyName,
            description,
            hotToWarmThreshold = 30,
            warmToColdThreshold = 90,
            coldRetentionDays = 365,
            autoMigrationEnabled = true,
            migrationBatchSize = 1000,
            enableMonitoring = true,
            enableAlerts = true,
            storageThresholdPercent = 80.0
        } = req.body;

        // Validate input
        if (!policyName) {
            return res.status(400).json({
                success: false,
                error: 'Policy name is required'
            });
        }

        if (hotToWarmThreshold >= warmToColdThreshold) {
            return res.status(400).json({
                success: false,
                error: 'Hot to warm threshold must be less than warm to cold threshold'
            });
        }

        const result = await db.execute(sql`
            INSERT INTO log_lifecycle_policies (
                tenant_id,
                policy_name,
                description,
                hot_to_warm_threshold,
                warm_to_cold_threshold,
                cold_retention_days,
                auto_migration_enabled,
                migration_batch_size,
                enable_monitoring,
                alert_on_migration_failure,
                alert_on_storage_threshold,
                storage_threshold_percent,
                created_by
            ) VALUES (
                ${tenantId}::uuid,
                ${policyName},
                ${description},
                ${hotToWarmThreshold},
                ${warmToColdThreshold},
                ${coldRetentionDays},
                ${autoMigrationEnabled},
                ${migrationBatchSize},
                ${enableMonitoring},
                ${enableAlerts},
                ${enableAlerts},
                ${storageThresholdPercent},
                ${req.user.id}::uuid
            )
            RETURNING *
        `);

        logInfo('Lifecycle policy created', {
            tenantId,
            policyId: result[0].id,
            policyName
        });

        res.status(201).json({
            success: true,
            data: result[0]
        });
    } catch (error) {
        logError('Failed to create lifecycle policy', {
            error: error.message,
            tenantId: req.tenantId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to create lifecycle policy'
        });
    }
});

/**
 * PUT /api/log-lifecycle/policies/:id
 * Update a lifecycle policy
 */
router.put('/policies/:id', requireRole(['admin']), async (req, res) => {
    try {
        const { tenantId } = req;
        const { id } = req.params;
        const updates = req.body;

        // Remove fields that shouldn't be updated directly
        delete updates.id;
        delete updates.tenantId;
        delete updates.createdAt;
        delete updates.createdBy;

        // Build dynamic update query
        const updateFields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            // Convert camelCase to snake_case
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            updateFields.push(`${snakeKey} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        values.push(id, tenantId);

        const query = `
            UPDATE log_lifecycle_policies
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
            RETURNING *
        `;

        const result = await db.execute(sql`${query}`, values);

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Lifecycle policy not found'
            });
        }

        logInfo('Lifecycle policy updated', {
            tenantId,
            policyId: id
        });

        res.json({
            success: true,
            data: result[0]
        });
    } catch (error) {
        logError('Failed to update lifecycle policy', {
            error: error.message,
            tenantId: req.tenantId,
            policyId: req.params.id
        });
        res.status(500).json({
            success: false,
            error: 'Failed to update lifecycle policy'
        });
    }
});

/**
 * GET /api/log-lifecycle/storage-locations
 * Get storage locations for the tenant
 */
router.get('/storage-locations', requireRole(['admin', 'auditor']), async (req, res) => {
    try {
        const { tenantId } = req;

        const locations = await db.execute(sql`
            SELECT * FROM log_storage_locations
            WHERE tenant_id = ${tenantId}
            ORDER BY storage_tier, created_at DESC
        `);

        res.json({
            success: true,
            data: locations
        });
    } catch (error) {
        logError('Failed to get storage locations', { error: error.message, tenantId: req.tenantId });
        res.status(500).json({
            success: false,
            error: 'Failed to get storage locations'
        });
    }
});

/**
 * POST /api/log-lifecycle/storage-locations
 * Create a new storage location
 */
router.post('/storage-locations', requireRole(['admin']), async (req, res) => {
    try {
        const { tenantId } = req;
        const {
            storageTier,
            storageType = 'database',
            connectionString,
            bucketName,
            region,
            maxSizeGb,
            estimatedCostPerGb
        } = req.body;

        // Validate required fields
        if (!storageTier || !['hot', 'warm', 'cold'].includes(storageTier)) {
            return res.status(400).json({
                success: false,
                error: 'Valid storage tier (hot, warm, cold) is required'
            });
        }

        const result = await db.execute(sql`
            INSERT INTO log_storage_locations (
                tenant_id,
                storage_tier,
                storage_type,
                connection_string,
                bucket_name,
                region,
                max_size_gb,
                estimated_cost_per_gb
            ) VALUES (
                ${tenantId}::uuid,
                ${storageTier}::log_storage_tier,
                ${storageType},
                ${connectionString},
                ${bucketName},
                ${region},
                ${maxSizeGb},
                ${estimatedCostPerGb}
            )
            RETURNING *
        `);

        logInfo('Storage location created', {
            tenantId,
            locationId: result[0].id,
            storageTier
        });

        res.status(201).json({
            success: true,
            data: result[0]
        });
    } catch (error) {
        logError('Failed to create storage location', {
            error: error.message,
            tenantId: req.tenantId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to create storage location'
        });
    }
});

/**
 * GET /api/log-lifecycle/migration-history
 * Get migration history for the tenant
 */
router.get('/migration-history', requireRole(['admin', 'auditor']), async (req, res) => {
    try {
        const { tenantId } = req;
        const { limit = 50, offset = 0, status, sourceTier, destinationTier } = req.query;

        let whereClause = `WHERE tenant_id = $${1}`;
        const values = [tenantId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        if (sourceTier) {
            whereClause += ` AND source_tier = $${paramIndex}`;
            values.push(sourceTier);
            paramIndex++;
        }

        if (destinationTier) {
            whereClause += ` AND destination_tier = $${paramIndex}`;
            values.push(destinationTier);
            paramIndex++;
        }

        const query = `
            SELECT * FROM log_migration_history
            ${whereClause}
            ORDER BY started_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        values.push(parseInt(limit), parseInt(offset));

        const history = await db.execute(sql`${query}`, values);

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM log_migration_history ${whereClause}`;
        const countResult = await db.execute(sql`${countQuery}`, values.slice(0, -2));
        const total = countResult[0].total;

        res.json({
            success: true,
            data: history,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        logError('Failed to get migration history', { error: error.message, tenantId: req.tenantId });
        res.status(500).json({
            success: false,
            error: 'Failed to get migration history'
        });
    }
});

/**
 * GET /api/log-lifecycle/monitoring
 * Get monitoring data for the tenant
 */
router.get('/monitoring', requireRole(['admin', 'auditor']), async (req, res) => {
    try {
        const { tenantId } = req;
        const { days = 30 } = req.query;

        const monitoring = await db.execute(sql`
            SELECT * FROM log_lifecycle_monitoring
            WHERE tenant_id = ${tenantId}
              AND monitoring_date >= CURRENT_DATE - INTERVAL '${days} days'
            ORDER BY monitoring_date DESC
        `);

        res.json({
            success: true,
            data: monitoring
        });
    } catch (error) {
        logError('Failed to get monitoring data', { error: error.message, tenantId: req.tenantId });
        res.status(500).json({
            success: false,
            error: 'Failed to get monitoring data'
        });
    }
});

/**
 * GET /api/log-lifecycle/storage-stats
 * Get current storage statistics by tier
 */
router.get('/storage-stats', requireRole(['admin', 'auditor']), async (req, res) => {
    try {
        const { tenantId } = req;

        const stats = await db.execute(sql`
            SELECT * FROM calculate_storage_tier_stats(${tenantId})
        `);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logError('Failed to get storage stats', { error: error.message, tenantId: req.tenantId });
        res.status(500).json({
            success: false,
            error: 'Failed to get storage stats'
        });
    }
});

/**
 * POST /api/log-lifecycle/run-migration
 * Manually trigger a migration cycle
 */
router.post('/run-migration', requireRole(['admin']), async (req, res) => {
    try {
        const service = await getLifecycleService();

        // Run migration cycle asynchronously
        service.runMigrationCycle().catch(error => {
            logError('Manual migration cycle failed', { error: error.message });
        });

        res.json({
            success: true,
            message: 'Migration cycle started'
        });
    } catch (error) {
        logError('Failed to start manual migration', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to start manual migration'
        });
    }
});

/**
 * POST /api/log-lifecycle/run-monitoring
 * Manually trigger a monitoring cycle
 */
router.post('/run-monitoring', requireRole(['admin']), async (req, res) => {
    try {
        const service = await getLifecycleService();

        // Run monitoring cycle asynchronously
        service.runMonitoringCycle().catch(error => {
            logError('Manual monitoring cycle failed', { error: error.message });
        });

        res.json({
            success: true,
            message: 'Monitoring cycle started'
        });
    } catch (error) {
        logError('Failed to start manual monitoring', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to start manual monitoring'
        });
    }
});

export default router;