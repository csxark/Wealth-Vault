/**
 * Log Lifecycle Automation with Cold Storage Migration (#633)
 *
 * Automates log migration based on age thresholds (hot → warm → cold tiers).
 * Reduces operational overhead by automatically managing log storage lifecycle.
 *
 * Features:
 * - Automated migration based on configurable age thresholds
 * - Multi-tier storage support (hot, warm, cold)
 * - Configurable lifecycle policies per tenant
 * - Migration scheduling and batching
 * - Storage monitoring and alerting
 * - Cost optimization through tiered storage
 */

import { EventEmitter } from 'events';
import { db } from '../config/db.js';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { getRedisClient } from '../config/redis.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class LogLifecycleAutomation {
    constructor() {
        this.redis = null;
        this.isRunning = false;
        this.migrationInterval = null;

        // Default configuration
        this.config = {
            migrationBatchSize: 1000,
            migrationIntervalMinutes: 60, // Run every hour
            maxConcurrentMigrations: 3,
            enableMonitoring: true,
            enableAlerts: true,
            storageThresholdAlertPercent: 80.0
        };

        // Migration queues by tenant
        this.migrationQueues = new Map();

        // Active migrations tracking
        this.activeMigrations = new Set();

        // Event emitter for lifecycle events
        this.events = new EventEmitter();
    }

    /**
     * Initialize the lifecycle automation service
     */
    async initialize() {
        try {
            logInfo('Initializing Log Lifecycle Automation...');

            // Connect to Redis for distributed coordination
            this.redis = await getRedisClient();

            // Set up event listeners
            this.setupEventListeners();

            // Start migration scheduler
            await this.startMigrationScheduler();

            // Initialize monitoring
            if (this.config.enableMonitoring) {
                await this.startMonitoring();
            }

            logInfo('Log Lifecycle Automation initialized successfully');
        } catch (error) {
            logError('Failed to initialize log lifecycle automation', { error: error.message });
            throw error;
        }
    }

    /**
     * Set up event listeners for lifecycle events
     */
    setupEventListeners() {
        this.events.on('migrationStarted', this.handleMigrationStarted.bind(this));
        this.events.on('migrationCompleted', this.handleMigrationCompleted.bind(this));
        this.events.on('migrationFailed', this.handleMigrationFailed.bind(this));
        this.events.on('storageThresholdExceeded', this.handleStorageThresholdExceeded.bind(this));
    }

    /**
     * Start the migration scheduler
     */
    async startMigrationScheduler() {
        logInfo('Starting migration scheduler...', {
            intervalMinutes: this.config.migrationIntervalMinutes
        });

        // Run initial migration check
        await this.runMigrationCycle();

        // Schedule recurring migrations
        this.migrationInterval = setInterval(async () => {
            try {
                await this.runMigrationCycle();
            } catch (error) {
                logError('Migration cycle failed', { error: error.message });
            }
        }, this.config.migrationIntervalMinutes * 60 * 1000);
    }

    /**
     * Run a complete migration cycle for all tenants
     */
    async runMigrationCycle() {
        if (this.isRunning) {
            logWarn('Migration cycle already running, skipping...');
            return;
        }

        this.isRunning = true;

        try {
            logInfo('Starting migration cycle...');

            // Get all tenants with lifecycle policies
            const tenants = await this.getTenantsWithLifecyclePolicies();

            // Process migrations for each tenant
            const migrationPromises = tenants.map(tenant =>
                this.processTenantMigrations(tenant.id)
            );

            // Limit concurrent migrations
            const results = await this.batchProcess(
                migrationPromises,
                this.config.maxConcurrentMigrations
            );

            // Log results
            const successCount = results.filter(r => r.success).length;
            const failureCount = results.filter(r => !r.success).length;

            logInfo('Migration cycle completed', {
                tenantsProcessed: tenants.length,
                successfulMigrations: successCount,
                failedMigrations: failureCount
            });

        } catch (error) {
            logError('Migration cycle failed', { error: error.message });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process migrations for a specific tenant
     */
    async processTenantMigrations(tenantId) {
        try {
            // Get lifecycle policy for tenant
            const policy = await this.getLifecyclePolicy(tenantId);
            if (!policy || !policy.autoMigrationEnabled) {
                return { success: true, message: 'No active policy or auto-migration disabled' };
            }

            // Check hot → warm migrations
            await this.migrateLogs(
                tenantId,
                'hot',
                'warm',
                policy.hotToWarmThreshold,
                policy.id
            );

            // Check warm → cold migrations
            await this.migrateLogs(
                tenantId,
                'warm',
                'cold',
                policy.warmToColdThreshold - policy.hotToWarmThreshold,
                policy.id
            );

            // Check cold log cleanup
            await this.cleanupExpiredLogs(tenantId, policy.coldRetentionDays);

            return { success: true };

        } catch (error) {
            logError('Tenant migration failed', { tenantId, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Migrate logs from one tier to another
     */
    async migrateLogs(tenantId, sourceTier, destinationTier, ageThresholdDays, policyId) {
        const migrationBatchId = uuidv4();

        try {
            this.events.emit('migrationStarted', {
                tenantId,
                migrationBatchId,
                sourceTier,
                destinationTier,
                ageThresholdDays
            });

            // Get logs eligible for migration
            const eligibleLogs = await db.execute(sql`
                SELECT * FROM get_logs_for_migration(
                    ${tenantId},
                    ${sourceTier}::log_storage_tier,
                    ${destinationTier}::log_storage_tier,
                    ${ageThresholdDays},
                    ${this.config.migrationBatchSize}
                )
            `);

            if (eligibleLogs.length === 0) {
                logInfo('No logs eligible for migration', {
                    tenantId,
                    sourceTier,
                    destinationTier,
                    ageThresholdDays
                });
                return;
            }

            // Get destination storage location
            const destinationLocation = await this.getStorageLocation(tenantId, destinationTier);

            // Perform migration in batches
            const logIds = eligibleLogs.map(log => log.log_id);
            const startTime = Date.now();

            const updatedCount = await db.execute(sql`
                SELECT update_log_storage_tier(
                    ${logIds},
                    ${destinationTier}::log_storage_tier,
                    ${migrationBatchId}::uuid,
                    ${destinationLocation?.id}
                )
            `);

            const migrationDuration = Date.now() - startTime;
            const totalDataSize = eligibleLogs.reduce((sum, log) => sum + log.data_size_bytes, 0);

            // Record migration history
            await this.recordMigrationHistory({
                tenantId,
                migrationBatchId,
                policyId,
                sourceTier,
                destinationTier,
                sourceLocationId: null, // TODO: track source location
                destinationLocationId: destinationLocation?.id,
                logsMigratedCount: updatedCount,
                dataSizeBytes: totalDataSize,
                compressionRatio: null, // TODO: calculate compression ratio
                migrationDurationMs: migrationDuration,
                status: 'completed'
            });

            // Update storage location statistics
            if (destinationLocation) {
                await this.updateStorageLocationStats(destinationLocation.id, totalDataSize);
            }

            this.events.emit('migrationCompleted', {
                tenantId,
                migrationBatchId,
                sourceTier,
                destinationTier,
                logsMigrated: updatedCount,
                dataSizeBytes: totalDataSize,
                durationMs: migrationDuration
            });

            logInfo('Log migration completed', {
                tenantId,
                migrationBatchId,
                sourceTier,
                destinationTier,
                logsMigrated: updatedCount,
                dataSizeBytes: totalDataSize,
                durationMs: migrationDuration
            });

        } catch (error) {
            logError('Log migration failed', {
                tenantId,
                migrationBatchId,
                sourceTier,
                destinationTier,
                error: error.message
            });

            // Record failed migration
            await this.recordMigrationHistory({
                tenantId,
                migrationBatchId,
                policyId,
                sourceTier,
                destinationTier,
                status: 'failed',
                errorMessage: error.message
            });

            this.events.emit('migrationFailed', {
                tenantId,
                migrationBatchId,
                sourceTier,
                destinationTier,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Clean up expired logs from cold storage
     */
    async cleanupExpiredLogs(tenantId, retentionDays) {
        try {
            const result = await db.execute(sql`
                SELECT * FROM cleanup_expired_logs(${tenantId}, ${retentionDays})
            `);

            const { deleted_count, freed_space_gb } = result[0];

            if (deleted_count > 0) {
                logInfo('Expired logs cleaned up', {
                    tenantId,
                    deletedCount: deleted_count,
                    freedSpaceGb: freed_space_gb
                });
            }

        } catch (error) {
            logError('Failed to cleanup expired logs', {
                tenantId,
                retentionDays,
                error: error.message
            });
        }
    }

    /**
     * Get lifecycle policy for a tenant
     */
    async getLifecyclePolicy(tenantId) {
        const result = await db.execute(sql`
            SELECT * FROM log_lifecycle_policies
            WHERE tenant_id = ${tenantId}
            ORDER BY created_at DESC
            LIMIT 1
        `);

        return result[0] || null;
    }

    /**
     * Get storage location for a tenant and tier
     */
    async getStorageLocation(tenantId, tier) {
        const result = await db.execute(sql`
            SELECT * FROM log_storage_locations
            WHERE tenant_id = ${tenantId}
              AND storage_tier = ${tier}::log_storage_tier
              AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `);

        return result[0] || null;
    }

    /**
     * Record migration history
     */
    async recordMigrationHistory(historyData) {
        await db.execute(sql`
            INSERT INTO log_migration_history (
                tenant_id,
                migration_batch_id,
                lifecycle_policy_id,
                source_tier,
                destination_tier,
                source_location_id,
                destination_location_id,
                logs_migrated_count,
                data_size_bytes,
                compression_ratio,
                migration_duration_ms,
                status,
                error_message,
                completed_at
            ) VALUES (
                ${historyData.tenantId},
                ${historyData.migrationBatchId}::uuid,
                ${historyData.policyId}::uuid,
                ${historyData.sourceTier}::log_storage_tier,
                ${historyData.destinationTier}::log_storage_tier,
                ${historyData.sourceLocationId}::uuid,
                ${historyData.destinationLocationId}::uuid,
                ${historyData.logsMigratedCount},
                ${historyData.dataSizeBytes},
                ${historyData.compressionRatio},
                ${historyData.migrationDurationMs},
                ${historyData.status},
                ${historyData.errorMessage},
                NOW()
            )
        `);
    }

    /**
     * Update storage location statistics
     */
    async updateStorageLocationStats(locationId, addedBytes) {
        const addedGb = addedBytes / (1024 * 1024 * 1024);

        await db.execute(sql`
            UPDATE log_storage_locations
            SET
                current_size_gb = current_size_gb + ${addedGb},
                last_accessed_at = NOW(),
                access_count = access_count + 1,
                updated_at = NOW()
            WHERE id = ${locationId}::uuid
        `);
    }

    /**
     * Get tenants with lifecycle policies
     */
    async getTenantsWithLifecyclePolicies() {
        const result = await db.execute(sql`
            SELECT DISTINCT t.id, t.name
            FROM tenants t
            JOIN log_lifecycle_policies llp ON t.id = llp.tenant_id
            WHERE llp.auto_migration_enabled = true
        `);

        return result;
    }

    /**
     * Start monitoring for storage thresholds and health
     */
    async startMonitoring() {
        // Run initial monitoring
        await this.runMonitoringCycle();

        // Schedule recurring monitoring every 6 hours
        setInterval(async () => {
            try {
                await this.runMonitoringCycle();
            } catch (error) {
                logError('Monitoring cycle failed', { error: error.message });
            }
        }, 6 * 60 * 60 * 1000);
    }

    /**
     * Run monitoring cycle
     */
    async runMonitoringCycle() {
        try {
            const tenants = await this.getTenantsWithLifecyclePolicies();

            for (const tenant of tenants) {
                await this.monitorTenantStorage(tenant.id);
            }

            logInfo('Monitoring cycle completed', { tenantsMonitored: tenants.length });

        } catch (error) {
            logError('Monitoring cycle failed', { error: error.message });
        }
    }

    /**
     * Monitor storage for a specific tenant
     */
    async monitorTenantStorage(tenantId) {
        try {
            // Get storage statistics
            const stats = await db.execute(sql`
                SELECT * FROM calculate_storage_tier_stats(${tenantId})
            `);

            // Get lifecycle policy
            const policy = await this.getLifecyclePolicy(tenantId);

            // Check storage thresholds
            for (const stat of stats) {
                const location = await this.getStorageLocation(tenantId, stat.storage_tier);

                if (location && location.max_size_gb) {
                    const usagePercent = (stat.data_size_gb / location.max_size_gb) * 100;

                    if (usagePercent >= this.config.storageThresholdAlertPercent) {
                        this.events.emit('storageThresholdExceeded', {
                            tenantId,
                            storageTier: stat.storage_tier,
                            currentSizeGb: stat.data_size_gb,
                            maxSizeGb: location.max_size_gb,
                            usagePercent
                        });
                    }
                }
            }

            // Record monitoring data
            await this.recordMonitoringData(tenantId, stats, policy?.id);

        } catch (error) {
            logError('Failed to monitor tenant storage', {
                tenantId,
                error: error.message
            });
        }
    }

    /**
     * Record monitoring data
     */
    async recordMonitoringData(tenantId, stats, policyId) {
        const monitoringData = {
            tenantId,
            monitoringDate: new Date().toISOString().split('T')[0],
            lifecyclePolicyId: policyId,
            hotLogsCount: 0,
            hotDataSizeGb: 0,
            warmLogsCount: 0,
            warmDataSizeGb: 0,
            coldLogsCount: 0,
            coldDataSizeGb: 0
        };

        // Populate stats by tier
        for (const stat of stats) {
            const tier = stat.storage_tier;
            monitoringData[`${tier}LogsCount`] = stat.logs_count;
            monitoringData[`${tier}DataSizeGb`] = stat.data_size_gb;
        }

        // Get migration statistics for today
        const migrationStats = await db.execute(sql`
            SELECT
                COUNT(*) as migrations_completed,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as migrations_failed,
                COALESCE(SUM(logs_migrated_count), 0) as total_migrated_logs,
                COALESCE(SUM(data_size_bytes), 0) / (1024.0 * 1024.0 * 1024.0) as total_migrated_size_gb,
                AVG(migration_duration_ms) as average_migration_time_ms
            FROM log_migration_history
            WHERE tenant_id = ${tenantId}
              AND DATE(started_at) = CURRENT_DATE
        `);

        if (migrationStats.length > 0) {
            Object.assign(monitoringData, migrationStats[0]);
        }

        // Insert monitoring record
        await db.execute(sql`
            INSERT INTO log_lifecycle_monitoring (
                tenant_id,
                monitoring_date,
                lifecycle_policy_id,
                hot_logs_count,
                hot_data_size_gb,
                warm_logs_count,
                warm_data_size_gb,
                cold_logs_count,
                cold_data_size_gb,
                migrations_completed,
                migrations_failed,
                total_migrated_logs,
                total_migrated_size_gb,
                average_migration_time_ms
            ) VALUES (
                ${monitoringData.tenantId}::uuid,
                ${monitoringData.monitoringDate}::date,
                ${monitoringData.lifecyclePolicyId}::uuid,
                ${monitoringData.hotLogsCount},
                ${monitoringData.hotDataSizeGb},
                ${monitoringData.warmLogsCount},
                ${monitoringData.warmDataSizeGb},
                ${monitoringData.coldLogsCount},
                ${monitoringData.coldDataSizeGb},
                ${monitoringData.migrations_completed},
                ${monitoringData.migrations_failed},
                ${monitoringData.total_migrated_logs},
                ${monitoringData.total_migrated_size_gb},
                ${monitoringData.average_migration_time_ms}
            )
            ON CONFLICT (tenant_id, monitoring_date, lifecycle_policy_id)
            DO UPDATE SET
                hot_logs_count = EXCLUDED.hot_logs_count,
                hot_data_size_gb = EXCLUDED.hot_data_size_gb,
                warm_logs_count = EXCLUDED.warm_logs_count,
                warm_data_size_gb = EXCLUDED.warm_data_size_gb,
                cold_logs_count = EXCLUDED.cold_logs_count,
                cold_data_size_gb = EXCLUDED.cold_data_size_gb,
                migrations_completed = EXCLUDED.migrations_completed,
                migrations_failed = EXCLUDED.migrations_failed,
                total_migrated_logs = EXCLUDED.total_migrated_logs,
                total_migrated_size_gb = EXCLUDED.total_migrated_size_gb,
                average_migration_time_ms = EXCLUDED.average_migration_time_ms
        `);
    }

    /**
     * Event handlers
     */
    handleMigrationStarted(data) {
        logInfo('Migration started', data);
        this.activeMigrations.add(data.migrationBatchId);
    }

    handleMigrationCompleted(data) {
        logInfo('Migration completed', data);
        this.activeMigrations.delete(data.migrationBatchId);
    }

    handleMigrationFailed(data) {
        logError('Migration failed', data);
        this.activeMigrations.delete(data.migrationBatchId);
    }

    handleStorageThresholdExceeded(data) {
        logWarn('Storage threshold exceeded', data);

        // TODO: Send alert notification
        // This would integrate with the notification service
    }

    /**
     * Utility method for batch processing
     */
    async batchProcess(promises, batchSize) {
        const results = [];

        for (let i = 0; i < promises.length; i += batchSize) {
            const batch = promises.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(batch);
            results.push(...batchResults.map(result => ({
                success: result.status === 'fulfilled',
                value: result.value,
                error: result.reason
            })));
        }

        return results;
    }

    /**
     * Get service health status
     */
    async getHealthStatus() {
        return {
            service: 'LogLifecycleAutomation',
            status: 'healthy',
            isRunning: this.isRunning,
            activeMigrations: this.activeMigrations.size,
            migrationIntervalMinutes: this.config.migrationIntervalMinutes,
            monitoringEnabled: this.config.enableMonitoring
        };
    }

    /**
     * Stop the service
     */
    async stop() {
        logInfo('Stopping Log Lifecycle Automation...');

        if (this.migrationInterval) {
            clearInterval(this.migrationInterval);
            this.migrationInterval = null;
        }

        this.isRunning = false;
        logInfo('Log Lifecycle Automation stopped');
    }
}

export default LogLifecycleAutomation;