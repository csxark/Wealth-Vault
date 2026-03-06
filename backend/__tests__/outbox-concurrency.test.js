/**
 * Concurrency limit tests for OutboxDispatcher
 * Verifies that the promise concurrency control fix works correctly
 */

import ConcurrencyLimiter from '../utils/ConcurrencyLimiter.js';
import OutboxDispatcher from '../jobs/outboxDispatcher.js';

describe('ConcurrencyLimiter - Promise Concurrency Control Fix', () => {
    
    describe('Basic Concurrency Control', () => {
        it('should limit concurrent executions to specified number', async () => {
            const limiter = new ConcurrencyLimiter(3);
            let maxConcurrent = 0;
            let currentConcurrent = 0;

            const trackExecution = async (delay) => {
                currentConcurrent++;
                maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                
                currentConcurrent--;
            };

            const items = Array(10).fill(50);
            await limiter.runAll(items, trackExecution);

            expect(maxConcurrent).toBeLessThanOrEqual(3);
            expect(maxConcurrent).toBeGreaterThan(0);
        });

        it('should process all items without loss', async () => {
            const limiter = new ConcurrencyLimiter(5);
            const items = Array(100).fill(null).map((_, i) => i);
            
            const results = await limiter.runAll(items, async (item) => {
                return item * 2;
            });

            expect(results).toHaveLength(100);
            expect(results.every(r => r.status === 'fulfilled')).toBe(true);
            results.forEach((result, index) => {
                expect(result.value).toBe(index * 2);
            });
        });
    });

    describe('Memory Management - No Leaks', () => {
        it('should not accumulate completed promises in memory', async () => {
            const limiter = new ConcurrencyLimiter(5);
            const items = Array(100).fill(null);

            const results = await limiter.runAll(items, async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'done';
            });

            const stats = limiter.getMemoryStats();
            
            // All promises should be completed and removed
            expect(stats.activePromises).toBe(0);
            expect(stats.queuedPromises).toBe(0);
            expect(stats.totalProcessed).toBe(100);
        });

        it('should maintain consistent heap usage', async () => {
            const limiter = new ConcurrencyLimiter(10);
            const iterations = 5;
            const itemsPerIteration = 200;
            const heapSnapshots = [];

            for (let i = 0; i < iterations; i++) {
                const items = Array(itemsPerIteration).fill(null);
                
                await limiter.runAll(items, async () => {
                    const largeArray = Array(1000).fill('x');
                    return largeArray.length;
                });

                const stats = limiter.getMemoryStats();
                const heapUsedMB = parseInt(stats.heapUsed);
                heapSnapshots.push(heapUsedMB);
                
                // Ensure no growth exceeding 50MB per iteration
                if (i > 0) {
                    const growth = heapSnapshots[i] - heapSnapshots[i - 1];
                    expect(growth).toBeLessThan(50);
                }
            }
        });

        it('should cleanup queue when draining', async () => {
            const limiter = new ConcurrencyLimiter(2);
            
            // Start processing
            const promise = limiter.runAll(
                Array(50).fill(null),
                async () => {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            );

            // Wait a bit then drain
            await new Promise(resolve => setTimeout(resolve, 50));
            await limiter.drain();

            const stats = limiter.getMemoryStats();
            expect(stats.activePromises).toBe(0);
            expect(stats.queuedPromises).toBe(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle rejected promises without leaking', async () => {
            const limiter = new ConcurrencyLimiter(5);
            const items = Array(20).fill(null);
            let errorCount = 0;

            const results = await limiter.runAll(items, async (item, index) => {
                if (index % 3 === 0) {
                    errorCount++;
                    throw new Error(`Item ${index} failed`);
                }
                return `Item ${index}`;
            });

            const stats = limiter.getMemoryStats();
            expect(stats.totalFailed).toBe(errorCount);
            expect(stats.activePromises).toBe(0);
            expect(stats.queuedPromises).toBe(0);

            // Verify failed items are tracked
            const failures = results.filter(r => r.status === 'rejected');
            expect(failures.length).toBe(errorCount);
        });

        it('should track failure rate accurately', async () => {
            const limiter = new ConcurrencyLimiter(5);
            
            await limiter.runAll(Array(100).fill(null), async (_, index) => {
                if (index % 5 === 0) {
                    throw new Error('Failed');
                }
            });

            const stats = limiter.getMemoryStats();
            // 20 failures out of 100 = 20% failure rate
            expect(stats.failureRate).toBeCloseTo(0.20, 2);
        });
    });

    describe('Circuit Breaker', () => {
        it('should open circuit breaker when failure rate exceeds threshold', async () => {
            const limiter = new ConcurrencyLimiter(5);

            // First batch: 60% failure rate (triggers circuit breaker)
            await limiter.runAll(Array(10).fill(null), async (_, index) => {
                if (index < 6) {
                    throw new Error('Failed');
                }
            });

            expect(limiter.isBroken).toBe(true);

            // Circuit should remain broken for subsequent calls
            await expect(limiter.run(async () => {})).rejects.toThrow(
                'Circuit breaker is open'
            );
        });

        it('should allow reset of circuit breaker', async () => {
            const limiter = new ConcurrencyLimiter(5);

            // Trigger circuit breaker
            await limiter.runAll(Array(10).fill(null), async (_, index) => {
                if (index < 6) throw new Error('Failed');
            });

            expect(limiter.isBroken).toBe(true);

            // Reset it
            limiter.resetCircuitBreaker();
            expect(limiter.isBroken).toBe(false);

            // Should now accept new work
            const result = await limiter.run(async () => 'success');
            expect(result).toBe('success');
        });
    });

    describe('Memory Statistics', () => {
        it('should provide accurate memory statistics', async () => {
            const limiter = new ConcurrencyLimiter(5);
            
            let executionCount = 0;
            await limiter.runAll(Array(50).fill(null), async () => {
                executionCount++;
                await new Promise(resolve => setTimeout(resolve, 10));
            });

            const stats = limiter.getMemoryStats();

            expect(stats).toHaveProperty('activePromises');
            expect(stats).toHaveProperty('queuedPromises');
            expect(stats).toHaveProperty('totalProcessed');
            expect(stats).toHaveProperty('totalFailed');
            expect(stats).toHaveProperty('failureRate');
            expect(stats).toHaveProperty('circuitBreakerOpen');
            expect(stats).toHaveProperty('heapUsed');
            expect(stats).toHaveProperty('heapTotal');

            expect(stats.totalProcessed).toBe(50);
            expect(stats.totalFailed).toBe(0);
            expect(stats.failureRate).toBe(0);
            expect(stats.activePromises).toBe(0);
            expect(stats.queuedPromises).toBe(0);
        });
    });

    describe('OutboxDispatcher Integration', () => {
        it('should use ConcurrencyLimiter for safe event processing', () => {
            const dispatcher = new OutboxDispatcher();
            
            expect(dispatcher.concurrencyLimiter).toBeInstanceOf(ConcurrencyLimiter);
            expect(dispatcher.concurrencyLimiter.concurrency).toBe(10);
        });

        it('should include concurrency stats in status', () => {
            const dispatcher = new OutboxDispatcher();
            const status = dispatcher.getStatus();

            expect(status).toHaveProperty('concurrencyStats');
            expect(status.concurrencyStats).toHaveProperty('activePromises');
            expect(status.concurrencyStats).toHaveProperty('totalProcessed');
        });

        it('should monitor memory and emit alerts', (done) => {
            const dispatcher = new OutboxDispatcher();
            let memoryAlertFired = false;

            dispatcher.on('memory:high', (stats) => {
                memoryAlertFired = true;
                expect(stats).toHaveProperty('heapUsedPercent');
            });

            dispatcher.start();

            // Verify memory monitoring is active
            expect(dispatcher.memoryCheckId).not.toBeNull();

            dispatcher.stop().then(() => {
                // Memory monitoring should be stopped
                expect(dispatcher.memoryCheckId).toBeNull();
                done();
            });
        });
    });

    describe('Regression Test - Prevent Original Bug', () => {
        it('should NOT recreate the original Promise.race() memory leak', async () => {
            const limiter = new ConcurrencyLimiter(5);
            const itemCount = 1000;
            const items = Array(itemCount).fill(null);

            const initialMemory = process.memoryUsage().heapUsed;

            // Process large batch that would leak with old code
            await limiter.runAll(items, async (_, index) => {
                // Simulate some work
                const arr = new Array(100).fill(index);
                return arr.length;
            });

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // Convert to MB

            // With the old code, memory growth would be unbounded
            // With the fix, it should be minimal (< 100MB for 1000 items)
            expect(memoryGrowth).toBeLessThan(100);

            // Verify all promises were cleaned up
            const stats = limiter.getMemoryStats();
            expect(stats.activePromises).toBe(0);
            expect(stats.queuedPromises).toBe(0);
            expect(stats.totalProcessed).toBe(itemCount);
        });

        it('should correctly handle Promise.settled check (old code would fail here)', async () => {
            const limiter = new ConcurrencyLimiter(3);

            // Old code: promises.findIndex(p => p.settled) would always return -1
            // New code: should properly track promise settlement
            const results = await limiter.runAll(
                Array(50).fill(null),
                async () => 'success'
            );

            // If it was using the old p.settled approach, none would be removed
            // and we'd have 50 promises still in memory
            const stats = limiter.getMemoryStats();
            expect(stats.activePromises).toBe(0);
            expect(stats.queuedPromises).toBe(0);
            expect(results.every(r => r.status === 'fulfilled')).toBe(true);
        });
    });
});
