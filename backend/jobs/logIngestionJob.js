// backend/jobs/logIngestionJob.js
// Issue #651: High-Throughput Log Ingestion Background Job

import { logger } from '../utils/logger.js';
import logIngestionService from '../services/logIngestionService.js';
import { redis } from '../config/redis.js';

class LogIngestionJob {
    constructor() {
        this.isRunning = false;
        this.jobName = 'log-ingestion';
        this.healthCheckInterval = null;
        this.statsReportingInterval = null;
        this.deadLetterCleanupInterval = null;
    }

    /**
     * Initialize the ingestion job
     */
    async initialize() {
        try {
            logger.info('Initializing Log Ingestion Job');

            // Check if job is already running
            const isRunning = await redis.get(`${this.jobName}:running`);
            if (isRunning) {
                logger.warn('Log Ingestion Job already running, skipping initialization');
                return;
            }

            // Mark job as running
            await redis.set(`${this.jobName}:running`, 'true', 'EX', 3600); // 1 hour expiry

            // Start health monitoring
            this.startHealthMonitoring();

            // Start stats reporting
            this.startStatsReporting();

            // Start dead letter queue cleanup
            this.startDeadLetterCleanup();

            this.isRunning = true;
            logger.info('Log Ingestion Job initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Log Ingestion Job', error);
            throw error;
        }
    }

    /**
     * Execute the ingestion job (manual trigger)
     */
    async execute() {
        try {
            logger.info('Starting manual Log Ingestion Job execution');

            // Trigger queue processing
            await logIngestionService.processQueue();

            // Update last execution time
            await redis.set(`${this.jobName}:last_execution`, new Date().toISOString());

            logger.info('Log Ingestion Job completed successfully');

        } catch (error) {
            logger.error('Log Ingestion Job execution failed', error);

            // Record failure
            await redis.set(`${this.jobName}:last_error`, JSON.stringify({
                error: error.message,
                timestamp: new Date().toISOString()
            }));

            throw error;
        }
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const healthStatus = await logIngestionService.healthCheck();

                // Store health status
                await redis.set(`${this.jobName}:health`, JSON.stringify({
                    ...healthStatus,
                    timestamp: new Date().toISOString()
                }), 'EX', 300); // 5 minutes

                // Alert if unhealthy
                if (!healthStatus.healthy) {
                    logger.warn('Log Ingestion Service health check failed', healthStatus);

                    // Could send alerts here
                    await this.sendHealthAlert(healthStatus);
                }

            } catch (error) {
                logger.error('Health monitoring failed', error);
            }
        }, 60000); // Every minute
    }

    /**
     * Start stats reporting
     */
    startStatsReporting() {
        this.statsReportingInterval = setInterval(async () => {
            try {
                const stats = await logIngestionService.getIngestionStats();

                // Store stats
                await redis.set(`${this.jobName}:stats`, JSON.stringify({
                    ...stats,
                    timestamp: new Date().toISOString()
                }), 'EX', 3600); // 1 hour

                // Log significant changes
                if (stats.backpressureEvents > 0 || stats.circuitBreakerTrips > 0) {
                    logger.warn('Significant ingestion events detected', {
                        backpressureEvents: stats.backpressureEvents,
                        circuitBreakerTrips: stats.circuitBreakerTrips
                    });
                }

            } catch (error) {
                logger.error('Stats reporting failed', error);
            }
        }, 300000); // Every 5 minutes
    }

    /**
     * Start dead letter queue cleanup
     */
    startDeadLetterCleanup() {
        this.deadLetterCleanupInterval = setInterval(async () => {
            try {
                await this.cleanupDeadLetterQueues();

            } catch (error) {
                logger.error('Dead letter queue cleanup failed', error);
            }
        }, 3600000); // Every hour
    }

    /**
     * Send health alert
     */
    async sendHealthAlert(healthStatus) {
        try {
            // In a real implementation, this would integrate with your notification service
            logger.error('Log Ingestion Service Health Alert', {
                queueDepth: healthStatus.queueDepth,
                backpressureMode: healthStatus.backpressureMode,
                circuitBreakerOpen: healthStatus.circuitBreakerOpen,
                error: healthStatus.error
            });

            // TODO: Integrate with notification service
            // await sendAlert('log-ingestion-health', {
            //     severity: 'critical',
            //     message: 'Log ingestion service is unhealthy',
            //     data: healthStatus
            // });

        } catch (error) {
            logger.error('Failed to send health alert', error);
        }
    }

    /**
     * Cleanup expired items from dead letter queues
     */
    async cleanupDeadLetterQueues() {
        try {
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            const cutoffDate = new Date(Date.now() - maxAge);

            // Get all DLQ keys
            const dlqKeys = await redis.keys('log_ingestion:dlq:*');

            for (const dlqKey of dlqKeys) {
                // Get all items in DLQ
                const items = await redis.lrange(dlqKey, 0, -1);

                for (const itemStr of items) {
                    try {
                        const item = JSON.parse(itemStr);
                        const itemDate = new Date(item.failedAt || item.timestamp);

                        if (itemDate < cutoffDate) {
                            // Remove expired item
                            await redis.lrem(dlqKey, 0, itemStr);
                            logger.info(`Cleaned up expired DLQ item: ${item.id}`);
                        }
                    } catch (error) {
                        logger.error('Error processing DLQ item during cleanup', error);
                    }
                }
            }

            logger.info(`Dead letter queue cleanup completed for ${dlqKeys.length} queues`);

        } catch (error) {
            logger.error('Error during dead letter queue cleanup', error);
        }
    }

    /**
     * Get dead letter queue statistics
     */
    async getDeadLetterStats() {
        try {
            const dlqKeys = await redis.keys('log_ingestion:dlq:*');
            const stats = {};

            for (const dlqKey of dlqKeys) {
                const tenantId = dlqKey.replace('log_ingestion:dlq:', '');
                const count = await redis.llen(dlqKey);
                stats[tenantId] = count;
            }

            return stats;

        } catch (error) {
            logger.error('Error getting dead letter queue stats', error);
            return {};
        }
    }

    /**
     * Reprocess items from dead letter queue
     */
    async reprocessDeadLetterItems(tenantId, itemIds) {
        try {
            const dlqKey = `log_ingestion:dlq:${tenantId}`;
            const items = await redis.lrange(dlqKey, 0, -1);

            let reprocessed = 0;
            let failed = 0;

            for (const itemStr of items) {
                try {
                    const item = JSON.parse(itemStr);

                    if (itemIds && !itemIds.includes(item.id)) {
                        continue; // Skip if not in requested IDs
                    }

                    // Reset retry count and re-queue
                    item.retryCount = 0;
                    delete item.failedAt;
                    delete item.failureReason;

                    await logIngestionService.addToQueue(tenantId, item);
                    await redis.lrem(dlqKey, 0, itemStr);

                    reprocessed++;

                } catch (error) {
                    logger.error(`Failed to reprocess DLQ item ${item.id}`, error);
                    failed++;
                }
            }

            return { reprocessed, failed };

        } catch (error) {
            logger.error('Error reprocessing dead letter items', error);
            throw error;
        }
    }

    /**
     * Get job health status
     */
    async getHealthStatus() {
        try {
            const isRunning = await redis.get(`${this.jobName}:running`);
            const lastExecution = await redis.get(`${this.jobName}:last_execution`);
            const lastError = await redis.get(`${this.jobName}:last_error`);
            const health = await redis.get(`${this.jobName}:health`);
            const stats = await redis.get(`${this.jobName}:stats`);

            return {
                jobName: this.jobName,
                isRunning: this.isRunning && isRunning === 'true',
                lastExecution: lastExecution ? new Date(lastExecution) : null,
                lastError: lastError ? JSON.parse(lastError) : null,
                health: health ? JSON.parse(health) : null,
                stats: stats ? JSON.parse(stats) : null,
                intervals: {
                    healthCheck: this.healthCheckInterval ? 'running' : 'stopped',
                    statsReporting: this.statsReportingInterval ? 'running' : 'stopped',
                    deadLetterCleanup: this.deadLetterCleanupInterval ? 'running' : 'stopped'
                }
            };

        } catch (error) {
            logger.error('Error getting job health status', error);
            return {
                jobName: this.jobName,
                error: error.message
            };
        }
    }

    /**
     * Manual trigger for testing
     */
    async triggerManual(tenantId = null) {
        try {
            logger.info('Manually triggering Log Ingestion Job', { tenantId });

            if (tenantId) {
                // Process specific tenant queue
                await logIngestionService.processTenantQueue(tenantId);
                return { success: true, tenantId };
            } else {
                // Process all queues
                return await this.execute();
            }

        } catch (error) {
            logger.error('Manual trigger failed', error);
            throw error;
        }
    }

    /**
     * Stop the job
     */
    async stop() {
        try {
            logger.info('Stopping Log Ingestion Job');

            // Clear intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            if (this.statsReportingInterval) {
                clearInterval(this.statsReportingInterval);
                this.statsReportingInterval = null;
            }

            if (this.deadLetterCleanupInterval) {
                clearInterval(this.deadLetterCleanupInterval);
                this.deadLetterCleanupInterval = null;
            }

            this.isRunning = false;
            await redis.del(`${this.jobName}:running`);

            logger.info('Log Ingestion Job stopped successfully');

        } catch (error) {
            logger.error('Error stopping Log Ingestion Job', error);
            throw error;
        }
    }

    /**
     * Force reset circuit breaker (admin function)
     */
    async resetCircuitBreaker() {
        try {
            // Access the service's circuit breaker state
            logIngestionService.circuitBreakerOpen = false;
            logIngestionService.circuitBreakerFailures = 0;

            logger.info('Circuit breaker manually reset');

            return { success: true, message: 'Circuit breaker reset' };

        } catch (error) {
            logger.error('Failed to reset circuit breaker', error);
            throw error;
        }
    }

    /**
     * Get queue analytics
     */
    async getQueueAnalytics() {
        try {
            const tenantQueues = await redis.keys('log_ingestion:queue:*');
            const analytics = {
                totalQueues: tenantQueues.length,
                queueDepths: {},
                totalDepth: 0,
                averageDepth: 0,
                maxDepth: 0,
                minDepth: Infinity
            };

            for (const queueKey of tenantQueues) {
                const tenantId = queueKey.replace('log_ingestion:queue:', '');
                const depth = await redis.llen(queueKey);

                analytics.queueDepths[tenantId] = depth;
                analytics.totalDepth += depth;

                if (depth > analytics.maxDepth) analytics.maxDepth = depth;
                if (depth < analytics.minDepth) analytics.minDepth = depth;
            }

            analytics.averageDepth = analytics.totalQueues > 0 ?
                analytics.totalDepth / analytics.totalQueues : 0;
            analytics.minDepth = analytics.minDepth === Infinity ? 0 : analytics.minDepth;

            return analytics;

        } catch (error) {
            logger.error('Error getting queue analytics', error);
            return { error: error.message };
        }
    }
}

// Export singleton instance
const logIngestionJob = new LogIngestionJob();

export default logIngestionJob;