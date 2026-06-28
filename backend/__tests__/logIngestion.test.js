// backend/__tests__/logIngestion.test.js
// Issue #651: Log Ingestion Tests

import { jest } from '@jest/globals';
import logIngestionService from '../services/logIngestionService.js';
import logIngestionJob from '../jobs/logIngestionJob.js';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';

// Mock dependencies
jest.mock('../config/database.js');
jest.mock('../config/redis.js');
jest.mock('../utils/logger.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

describe('Log Ingestion Service', () => {
    const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
    const mockLogData = {
        action: 'user_login',
        category: 'authentication',
        outcome: 'success',
        severity: 'low'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset service state
        logIngestionService.backpressureMode = false;
        logIngestionService.circuitBreakerOpen = false;
        logIngestionService.circuitBreakerFailures = 0;
        logIngestionService.processingStats = {
            totalProcessed: 0,
            totalFailed: 0,
            avgProcessingTime: 0,
            queueDepth: 0,
            backpressureEvents: 0,
            circuitBreakerTrips: 0
        };
    });

    describe('ingestLogEntry', () => {
        it('should successfully ingest a valid log entry', async () => {
            redis.incr.mockResolvedValue(1);
            redis.llen.mockResolvedValue(100); // Below threshold
            logIngestionService.addToQueue = jest.fn().mockResolvedValue();

            const result = await logIngestionService.ingestLogEntry(mockLogData, mockTenantId);

            expect(result.success).toBe(true);
            expect(result.queueItemId).toBeDefined();
            expect(logIngestionService.addToQueue).toHaveBeenCalled();
        });

        it('should reject invalid log data', async () => {
            const invalidLogData = { action: '' }; // Missing required fields

            await expect(logIngestionService.ingestLogEntry(invalidLogData, mockTenantId))
                .rejects
                .toThrow('Missing required field: category');
        });

        it('should enforce rate limits', async () => {
            redis.incr.mockResolvedValue(2000); // Above limit

            await expect(logIngestionService.ingestLogEntry(mockLogData, mockTenantId))
                .rejects
                .toThrow('Rate limit exceeded');
        });

        it('should activate backpressure when queue is full', async () => {
            redis.incr.mockResolvedValue(1);
            redis.llen.mockResolvedValue(9000); // Above 80% of 10000 threshold

            await expect(logIngestionService.ingestLogEntry(mockLogData, mockTenantId))
                .rejects
                .toThrow('Backpressure activated');

            expect(logIngestionService.backpressureMode).toBe(true);
        });

        it('should handle circuit breaker open state', async () => {
            logIngestionService.circuitBreakerOpen = true;
            logIngestionService.circuitBreakerLastFailure = Date.now() - 30000; // 30 seconds ago

            await expect(logIngestionService.ingestLogEntry(mockLogData, mockTenantId))
                .rejects
                .toThrow('Circuit breaker is open');
        });
    });

    describe('ingestLogBatch', () => {
        it('should process multiple log entries', async () => {
            const logBatch = [mockLogData, { ...mockLogData, action: 'user_logout' }];
            logIngestionService.ingestLogEntry = jest.fn().mockResolvedValue({ success: true });

            const result = await logIngestionService.ingestLogBatch(logBatch, mockTenantId);

            expect(result.successful).toBe(2);
            expect(result.failed).toBe(0);
            expect(logIngestionService.ingestLogEntry).toHaveBeenCalledTimes(2);
        });

        it('should handle partial failures in batch', async () => {
            const logBatch = [mockLogData, { action: '' }]; // Second entry invalid
            logIngestionService.ingestLogEntry = jest.fn()
                .mockResolvedValueOnce({ success: true })
                .mockRejectedValueOnce(new Error('Invalid log data'));

            const result = await logIngestionService.ingestLogBatch(logBatch, mockTenantId);

            expect(result.successful).toBe(1);
            expect(result.failed).toBe(1);
            expect(result.errors).toHaveLength(1);
        });

        it('should reject batches that are too large', async () => {
            const largeBatch = Array(200).fill(mockLogData); // Above max batch size

            await expect(logIngestionService.ingestLogBatch(largeBatch, mockTenantId))
                .rejects
                .toThrow('Batch size 200 exceeds maximum 100');
        });
    });

    describe('processQueue', () => {
        it('should process queued items', async () => {
            logIngestionService.getActiveTenantQueues = jest.fn().mockResolvedValue([mockTenantId]);
            logIngestionService.processTenantQueue = jest.fn().mockResolvedValue();

            await logIngestionService.processQueue();

            expect(logIngestionService.processTenantQueue).toHaveBeenCalledWith(mockTenantId);
        });

        it('should handle processing errors gracefully', async () => {
            logIngestionService.getActiveTenantQueues = jest.fn().mockResolvedValue([mockTenantId]);
            logIngestionService.processTenantQueue = jest.fn().mockRejectedValue(new Error('Processing failed'));

            await expect(logIngestionService.processQueue()).resolves.not.toThrow();
        });
    });

    describe('Backpressure Management', () => {
        it('should deactivate backpressure after cooldown period', async () => {
            logIngestionService.backpressureMode = true;
            logIngestionService.lastBackpressureTime = Date.now() - 400000; // 400 seconds ago (> 5 min cooldown)
            logIngestionService.getGlobalQueueDepth = jest.fn().mockResolvedValue(3000); // Below 50% threshold

            await logIngestionService.processQueue();

            expect(logIngestionService.backpressureMode).toBe(false);
        });
    });

    describe('Health Check', () => {
        it('should return healthy status when all systems normal', async () => {
            logIngestionService.getGlobalQueueDepth = jest.fn().mockResolvedValue(1000);
            logIngestionService.circuitBreakerOpen = false;

            const health = await logIngestionService.healthCheck();

            expect(health.healthy).toBe(true);
            expect(health.queueDepth).toBe(1000);
            expect(health.backpressureMode).toBe(false);
            expect(health.circuitBreakerOpen).toBe(false);
        });

        it('should return unhealthy status when circuit breaker is open', async () => {
            logIngestionService.circuitBreakerOpen = true;

            const health = await logIngestionService.healthCheck();

            expect(health.healthy).toBe(false);
            expect(health.circuitBreakerOpen).toBe(true);
        });
    });
});

describe('Log Ingestion Job', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('initialize', () => {
        it('should initialize successfully when not already running', async () => {
            redis.get.mockResolvedValue(null); // Not running
            redis.set.mockResolvedValue('OK');

            await logIngestionJob.initialize();

            expect(logIngestionJob.isRunning).toBe(true);
            expect(redis.set).toHaveBeenCalledWith('log-ingestion:running', 'true', 'EX', 3600);
        });

        it('should skip initialization if already running', async () => {
            redis.get.mockResolvedValue('true'); // Already running

            await logIngestionJob.initialize();

            expect(logIngestionJob.isRunning).toBe(false);
        });
    });

    describe('execute', () => {
        it('should execute successfully', async () => {
            logIngestionService.processQueue = jest.fn().mockResolvedValue();
            redis.set.mockResolvedValue('OK');

            await logIngestionJob.execute();

            expect(logIngestionService.processQueue).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalledWith('log-ingestion:last_execution', expect.any(String));
        });

        it('should handle execution errors', async () => {
            logIngestionService.processQueue = jest.fn().mockRejectedValue(new Error('Processing failed'));
            redis.set.mockResolvedValue('OK');

            await expect(logIngestionJob.execute()).rejects.toThrow('Processing failed');
            expect(redis.set).toHaveBeenCalledWith('log-ingestion:last_error', expect.any(String));
        });
    });

    describe('Health Monitoring', () => {
        it('should perform health checks', async () => {
            const mockHealthStatus = { healthy: true, queueDepth: 100 };
            logIngestionService.healthCheck = jest.fn().mockResolvedValue(mockHealthStatus);
            redis.set.mockResolvedValue('OK');

            // Simulate health check interval
            await logIngestionJob.startHealthMonitoring();
            // Wait a bit for interval to execute
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(logIngestionService.healthCheck).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalledWith('log-ingestion:health', expect.any(String), 'EX', 300);

            // Clean up
            logIngestionJob.stop();
        });
    });

    describe('Dead Letter Queue Management', () => {
        it('should cleanup expired DLQ items', async () => {
            const expiredItem = JSON.stringify({
                id: 'expired-item',
                failedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() // 8 days ago
            });

            redis.keys.mockResolvedValue(['log_ingestion:dlq:tenant1']);
            redis.lrange.mockResolvedValue([expiredItem]);
            redis.lrem.mockResolvedValue(1);

            await logIngestionJob.cleanupDeadLetterQueues();

            expect(redis.lrem).toHaveBeenCalledWith('log_ingestion:dlq:tenant1', 0, expiredItem);
        });
    });

    describe('getHealthStatus', () => {
        it('should return comprehensive health status', async () => {
            redis.get.mockImplementation((key) => {
                const mockData = {
                    'log-ingestion:running': 'true',
                    'log-ingestion:last_execution': new Date().toISOString(),
                    'log-ingestion:health': JSON.stringify({ healthy: true }),
                    'log-ingestion:stats': JSON.stringify({ totalProcessed: 100 })
                };
                return Promise.resolve(mockData[key] || null);
            });

            const status = await logIngestionJob.getHealthStatus();

            expect(status.isRunning).toBe(true);
            expect(status.lastExecution).toBeInstanceOf(Date);
            expect(status.health).toEqual({ healthy: true });
            expect(status.stats).toEqual({ totalProcessed: 100 });
        });
    });

    describe('stop', () => {
        it('should stop all intervals and mark as not running', async () => {
            // Initialize first
            redis.get.mockResolvedValue(null);
            redis.set.mockResolvedValue('OK');
            await logIngestionJob.initialize();

            // Now stop
            redis.del.mockResolvedValue(1);
            await logIngestionJob.stop();

            expect(logIngestionJob.isRunning).toBe(false);
            expect(redis.del).toHaveBeenCalledWith('log-ingestion:running');
        });
    });
});