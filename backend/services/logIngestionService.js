// backend/services/logIngestionService.js
// Issue #651: High-Throughput Log Ingestion with Backpressure Handling

import { logger } from '../utils/logger.js';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';

// Ingestion configuration
const INGESTION_CONFIG = {
    maxBatchSize: 100,           // Maximum logs per batch
    maxQueueSize: 10000,         // Maximum queue size before backpressure
    processingInterval: 1000,    // Process queue every 1 second
    rateLimitWindow: 60000,      // 1 minute window for rate limiting
    rateLimitMaxRequests: 1000,  // Max requests per tenant per window
    backpressureThreshold: 0.8,  // 80% queue capacity triggers backpressure
    adaptiveScalingFactor: 1.5,  // Scale up processing when under pressure
    cooldownPeriod: 300000,      // 5 minutes cooldown after backpressure
    retryAttempts: 3,
    retryDelay: 1000,            // 1 second base delay
    circuitBreakerThreshold: 5,  // Failures before circuit breaker
    circuitBreakerTimeout: 60000 // 1 minute circuit breaker timeout
};

class LogIngestionService {
    constructor() {
        this.isProcessing = false;
        this.processingIntervalId = null;
        this.backpressureMode = false;
        this.circuitBreakerOpen = false;
        this.circuitBreakerFailures = 0;
        this.lastBackpressureTime = 0;
        this.processingStats = {
            totalProcessed: 0,
            totalFailed: 0,
            avgProcessingTime: 0,
            queueDepth: 0,
            backpressureEvents: 0,
            circuitBreakerTrips: 0
        };
    }

    /**
     * Initialize the ingestion service
     */
    async initialize() {
        try {
            logger.info('Initializing Log Ingestion Service');

            // Start processing interval
            this.startProcessingInterval();

            // Initialize Redis structures
            await this.initializeRedisStructures();

            logger.info('Log Ingestion Service initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Log Ingestion Service', error);
            throw error;
        }
    }

    /**
     * Initialize Redis data structures
     */
    async initializeRedisStructures() {
        try {
            // Create ingestion queues for each tenant
            const tenants = await db.select().from(auditLogs).limit(1); // Just to get tenant structure
            // In practice, you'd get all tenants from tenant table

            // Initialize global ingestion stats
            await redis.set('log_ingestion:stats', JSON.stringify(this.processingStats));

        } catch (error) {
            logger.error('Failed to initialize Redis structures', error);
        }
    }

    /**
     * Ingest a single log entry
     */
    async ingestLogEntry(logData, tenantId, options = {}) {
        try {
            // Check circuit breaker
            if (this.circuitBreakerOpen) {
                if (Date.now() - this.circuitBreakerLastFailure < INGESTION_CONFIG.circuitBreakerTimeout) {
                    throw new Error('Circuit breaker is open - ingestion temporarily disabled');
                } else {
                    this.circuitBreakerOpen = false;
                    this.circuitBreakerFailures = 0;
                    logger.info('Circuit breaker reset');
                }
            }

            // Check rate limits
            const rateLimitKey = `rate_limit:${tenantId}`;
            const currentRequests = await redis.incr(rateLimitKey);
            await redis.expire(rateLimitKey, INGESTION_CONFIG.rateLimitWindow / 1000);

            if (currentRequests > INGESTION_CONFIG.rateLimitMaxRequests) {
                throw new Error(`Rate limit exceeded for tenant ${tenantId}`);
            }

            // Check queue depth for backpressure
            const queueDepth = await this.getQueueDepth(tenantId);
            if (queueDepth >= INGESTION_CONFIG.maxQueueSize * INGESTION_CONFIG.backpressureThreshold) {
                this.activateBackpressure(tenantId);
                if (this.backpressureMode) {
                    throw new Error('Backpressure activated - queue is full');
                }
            }

            // Validate log data
            this.validateLogData(logData);

            // Add to ingestion queue
            const queueItem = {
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                data: logData,
                tenantId,
                timestamp: new Date().toISOString(),
                priority: options.priority || 'normal',
                retryCount: 0,
                options
            };

            await this.addToQueue(tenantId, queueItem);

            // Update stats
            this.processingStats.queueDepth = await this.getGlobalQueueDepth();

            logger.info(`Log entry queued for tenant ${tenantId}`, {
                queueItemId: queueItem.id,
                queueDepth: this.processingStats.queueDepth
            });

            return {
                success: true,
                queueItemId: queueItem.id,
                estimatedProcessingTime: this.calculateEstimatedProcessingTime()
            };

        } catch (error) {
            logger.error(`Failed to ingest log entry for tenant ${tenantId}`, error);
            this.processingStats.totalFailed++;

            // Update circuit breaker
            this.circuitBreakerFailures++;
            if (this.circuitBreakerFailures >= INGESTION_CONFIG.circuitBreakerThreshold) {
                this.activateCircuitBreaker();
            }

            throw error;
        }
    }

    /**
     * Ingest multiple log entries in batch
     */
    async ingestLogBatch(logEntries, tenantId, options = {}) {
        const results = {
            successful: 0,
            failed: 0,
            errors: [],
            batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        try {
            // Check if batch size exceeds limits
            if (logEntries.length > INGESTION_CONFIG.maxBatchSize) {
                throw new Error(`Batch size ${logEntries.length} exceeds maximum ${INGESTION_CONFIG.maxBatchSize}`);
            }

            // Process each entry
            for (const logData of logEntries) {
                try {
                    await this.ingestLogEntry(logData, tenantId, options);
                    results.successful++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        logData,
                        error: error.message
                    });
                }
            }

            logger.info(`Batch ingestion completed for tenant ${tenantId}`, {
                batchId: results.batchId,
                successful: results.successful,
                failed: results.failed
            });

        } catch (error) {
            logger.error(`Batch ingestion failed for tenant ${tenantId}`, error);
            results.errors.push({
                batchError: error.message
            });
        }

        return results;
    }

    /**
     * Process queued log entries
     */
    async processQueue() {
        if (this.isProcessing) {
            return; // Already processing
        }

        this.isProcessing = true;
        const startTime = Date.now();

        try {
            // Get all tenants with queued items
            const tenantQueues = await this.getActiveTenantQueues();

            for (const tenantId of tenantQueues) {
                await this.processTenantQueue(tenantId);
            }

            // Update processing stats
            const processingTime = Date.now() - startTime;
            this.processingStats.avgProcessingTime =
                (this.processingStats.avgProcessingTime + processingTime) / 2;

            // Check if backpressure can be deactivated
            if (this.backpressureMode && Date.now() - this.lastBackpressureTime > INGESTION_CONFIG.cooldownPeriod) {
                const globalQueueDepth = await this.getGlobalQueueDepth();
                if (globalQueueDepth < INGESTION_CONFIG.maxQueueSize * 0.5) {
                    this.deactivateBackpressure();
                }
            }

        } catch (error) {
            logger.error('Error processing ingestion queue', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process queue for a specific tenant
     */
    async processTenantQueue(tenantId) {
        const batchSize = this.backpressureMode ?
            Math.floor(INGESTION_CONFIG.maxBatchSize / INGESTION_CONFIG.adaptiveScalingFactor) :
            INGESTION_CONFIG.maxBatchSize;

        const queueItems = await this.getQueueItems(tenantId, batchSize);

        if (queueItems.length === 0) {
            return;
        }

        const logEntries = queueItems.map(item => ({
            ...item.data,
            _ingestion_metadata: {
                queueItemId: item.id,
                queuedAt: item.timestamp,
                tenantId: item.tenantId,
                retryCount: item.retryCount
            }
        }));

        try {
            // Insert logs into database
            await db.insert(auditLogs).values(logEntries);

            // Remove processed items from queue
            await this.removeFromQueue(tenantId, queueItems.map(item => item.id));

            this.processingStats.totalProcessed += queueItems.length;

            logger.info(`Processed ${queueItems.length} log entries for tenant ${tenantId}`);

        } catch (error) {
            logger.error(`Failed to process queue items for tenant ${tenantId}`, error);

            // Handle retries
            await this.handleFailedItems(tenantId, queueItems, error);
        }
    }

    /**
     * Handle failed queue items with retry logic
     */
    async handleFailedItems(tenantId, queueItems, error) {
        const retryItems = [];
        const deadLetterItems = [];

        for (const item of queueItems) {
            if (item.retryCount < INGESTION_CONFIG.retryAttempts) {
                // Schedule retry with exponential backoff
                const retryDelay = INGESTION_CONFIG.retryDelay * Math.pow(2, item.retryCount);
                item.retryCount++;
                item.nextRetryAt = Date.now() + retryDelay;
                retryItems.push(item);
            } else {
                // Move to dead letter queue
                deadLetterItems.push({
                    ...item,
                    failedAt: new Date().toISOString(),
                    failureReason: error.message
                });
            }
        }

        // Re-queue retry items
        if (retryItems.length > 0) {
            await this.requeueItems(tenantId, retryItems);
        }

        // Move to dead letter queue
        if (deadLetterItems.length > 0) {
            await this.moveToDeadLetterQueue(tenantId, deadLetterItems);
        }
    }

    /**
     * Validate log data structure
     */
    validateLogData(logData) {
        if (!logData || typeof logData !== 'object') {
            throw new Error('Log data must be a valid object');
        }

        // Required fields validation
        const requiredFields = ['action', 'category'];
        for (const field of requiredFields) {
            if (!logData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Data type validation
        if (logData.statusCode && typeof logData.statusCode !== 'number') {
            throw new Error('statusCode must be a number');
        }

        // Size limits
        const maxSize = 1024 * 1024; // 1MB
        if (JSON.stringify(logData).length > maxSize) {
            throw new Error(`Log entry size exceeds maximum ${maxSize} bytes`);
        }
    }

    /**
     * Activate backpressure mode
     */
    activateBackpressure(tenantId) {
        if (!this.backpressureMode) {
            this.backpressureMode = true;
            this.lastBackpressureTime = Date.now();
            this.processingStats.backpressureEvents++;

            logger.warn(`Backpressure activated for tenant ${tenantId}`, {
                queueDepth: this.processingStats.queueDepth
            });
        }
    }

    /**
     * Deactivate backpressure mode
     */
    deactivateBackpressure() {
        this.backpressureMode = false;
        logger.info('Backpressure deactivated');
    }

    /**
     * Activate circuit breaker
     */
    activateCircuitBreaker() {
        this.circuitBreakerOpen = true;
        this.circuitBreakerLastFailure = Date.now();
        this.processingStats.circuitBreakerTrips++;

        logger.error('Circuit breaker activated - ingestion disabled');
    }

    /**
     * Queue management methods
     */
    async addToQueue(tenantId, queueItem) {
        const queueKey = `log_ingestion:queue:${tenantId}`;
        await redis.rpush(queueKey, JSON.stringify(queueItem));
    }

    async getQueueItems(tenantId, count) {
        const queueKey = `log_ingestion:queue:${tenantId}`;
        const items = await redis.lrange(queueKey, 0, count - 1);

        return items.map(item => JSON.parse(item));
    }

    async removeFromQueue(tenantId, itemIds) {
        const queueKey = `log_ingestion:queue:${tenantId}`;
        // Remove specific items (this is a simplified version)
        // In production, you'd want a more efficient implementation
        for (const itemId of itemIds) {
            await redis.lrem(queueKey, 0, JSON.stringify({ id: itemId }));
        }
    }

    async getQueueDepth(tenantId) {
        const queueKey = `log_ingestion:queue:${tenantId}`;
        return await redis.llen(queueKey);
    }

    async getGlobalQueueDepth() {
        // Get all tenant queues and sum their depths
        const keys = await redis.keys('log_ingestion:queue:*');
        let totalDepth = 0;

        for (const key of keys) {
            totalDepth += await redis.llen(key);
        }

        return totalDepth;
    }

    async getActiveTenantQueues() {
        const keys = await redis.keys('log_ingestion:queue:*');
        return keys.map(key => key.replace('log_ingestion:queue:', '')).filter(tenantId => {
            // Check if queue has items
            return redis.llen(key).then(length => length > 0);
        });
    }

    async requeueItems(tenantId, items) {
        const queueKey = `log_ingestion:queue:${tenantId}`;
        for (const item of items) {
            await redis.rpush(queueKey, JSON.stringify(item));
        }
    }

    async moveToDeadLetterQueue(tenantId, items) {
        const dlqKey = `log_ingestion:dlq:${tenantId}`;
        for (const item of items) {
            await redis.rpush(dlqKey, JSON.stringify(item));
        }
    }

    /**
     * Start processing interval
     */
    startProcessingInterval() {
        this.processingIntervalId = setInterval(() => {
            this.processQueue().catch(error => {
                logger.error('Error in processing interval', error);
            });
        }, INGESTION_CONFIG.processingInterval);
    }

    /**
     * Calculate estimated processing time
     */
    calculateEstimatedProcessingTime() {
        const baseTime = 1000; // 1 second base
        const queueFactor = Math.max(1, this.processingStats.queueDepth / 100);
        const backpressureFactor = this.backpressureMode ? 2 : 1;

        return Math.round(baseTime * queueFactor * backpressureFactor);
    }

    /**
     * Get ingestion statistics
     */
    async getIngestionStats() {
        const stats = await redis.get('log_ingestion:stats');
        return stats ? JSON.parse(stats) : this.processingStats;
    }

    /**
     * Update ingestion statistics
     */
    async updateStats() {
        await redis.set('log_ingestion:stats', JSON.stringify(this.processingStats));
    }

    /**
     * Stop the ingestion service
     */
    async stop() {
        if (this.processingIntervalId) {
            clearInterval(this.processingIntervalId);
            this.processingIntervalId = null;
        }

        await this.updateStats();
        logger.info('Log Ingestion Service stopped');
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const queueDepth = await this.getGlobalQueueDepth();
            const isHealthy = !this.circuitBreakerOpen && queueDepth < INGESTION_CONFIG.maxQueueSize;

            return {
                healthy: isHealthy,
                queueDepth,
                backpressureMode: this.backpressureMode,
                circuitBreakerOpen: this.circuitBreakerOpen,
                processingStats: this.processingStats,
                config: INGESTION_CONFIG
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
const logIngestionService = new LogIngestionService();

export default logIngestionService;