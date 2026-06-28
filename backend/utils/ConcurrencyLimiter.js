/**
 * ConcurrencyLimiter - Proper promise concurrency control with memory management
 * 
 * Fixes the broken Promise.race() pattern by:
 * - Using a queue-based approach with proper completion tracking
 * - Removing completed promises immediately (no memory leak)
 * - Supporting memory monitoring and circuit breaker patterns
 * - Providing atomic operations for safe concurrent access
 */
class ConcurrencyLimiter {
    constructor(concurrency = 5) {
        if (concurrency < 1) {
            throw new Error('Concurrency limit must be at least 1');
        }
        
        this.concurrency = concurrency;
        this.activePromises = new Map(); // Track promises by unique ID
        this.queue = []; // Pending promises waiting to be processed
        this.totalProcessed = 0;
        this.totalFailed = 0;
        this.circuitBreakerThreshold = 0.5; // Break if 50% failure rate
        this.isBroken = false;
    }

    /**
     * Run a function with concurrency control
     * 
     * @param {Function} fn - Async function to run
     * @param {*} context - Context to bind to the function
     * @returns {Promise} Result of the function
     */
    async run(fn, context = null) {
        if (this.isBroken) {
            throw new Error('Circuit breaker is open - too many failures');
        }

        // If not at capacity, run immediately
        if (this.activePromises.size < this.concurrency) {
            return this._executeAndTrack(fn, context);
        }

        // Queue is full, wait for a slot to open
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, context, resolve, reject });
            this._processQueue();
        });
    }

    /**
     * Execute a function and track its promise
     * @private
     */
    async _executeAndTrack(fn, context) {
        const id = this._generateId();
        
        try {
            const result = await (context ? fn.call(context) : fn());
            this.totalProcessed++;
            this._checkCircuitBreaker();
            return result;
        } catch (error) {
            this.totalFailed++;
            this._checkCircuitBreaker();
            throw error;
        } finally {
            this.activePromises.delete(id);
            this._processQueue();
        }
    }

    /**
     * Process queued items when capacity becomes available
     * @private
     */
    async _processQueue() {
        if (this.activePromises.size >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        
        this._executeAndTrack(item.fn, item.context)
            .then(item.resolve)
            .catch(item.reject);
    }

    /**
     * Run multiple items with concurrency control
     * 
     * @param {Array} items - Items to process
     * @param {Function} fn - Async function to apply to each item
     * @returns {Promise<Array>} Results array (preserves order)
     */
    async runAll(items, fn) {
        const results = new Array(items.length);
        const promises = items.map((item, index) => 
            this.run(() => fn(item))
                .then(result => {
                    results[index] = { status: 'fulfilled', value: result };
                })
                .catch(error => {
                    results[index] = { status: 'rejected', reason: error };
                })
        );

        await Promise.all(promises);
        return results;
    }

    /**
     * Run multiple items and return settled results (like Promise.allSettled)
     * 
     * @param {Array} items - Items to process
     * @param {Function} fn - Async function to apply to each item
     * @returns {Promise<Array>} Settled results array
     */
    async runAllSettled(items, fn) {
        return this.runAll(items, fn);
    }

    /**
     * Get current memory usage stats
     * @returns {Object} Memory stats
     */
    getMemoryStats() {
        const memoryUsage = process.memoryUsage();
        return {
            activePromises: this.activePromises.size,
            queuedPromises: this.queue.length,
            totalProcessed: this.totalProcessed,
            totalFailed: this.totalFailed,
            failureRate: this.totalProcessed + this.totalFailed > 0 
                ? (this.totalFailed / (this.totalProcessed + this.totalFailed)) 
                : 0,
            circuitBreakerOpen: this.isBroken,
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
        };
    }

    /**
     * Check if we should open the circuit breaker
     * @private
     */
    _checkCircuitBreaker() {
        const total = this.totalProcessed + this.totalFailed;
        
        if (total > 0 && this.totalFailed > 0) {
            const failureRate = this.totalFailed / total;
            
            if (failureRate >= this.circuitBreakerThreshold) {
                this.isBroken = true;
            }
        }
    }

    /**
     * Reset the circuit breaker
     */
    resetCircuitBreaker() {
        this.isBroken = false;
        this.totalProcessed = 0;
        this.totalFailed = 0;
    }

    /**
     * Wait for all active and queued promises to complete
     */
    async drain() {
        while (this.activePromises.size > 0 || this.queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    /**
     * Generate a unique ID for tracking promises
     * @private
     */
    _generateId() {
        const id = `promise_${Date.now()}_${Math.random()}`;
        this.activePromises.set(id, true);
        return id;
    }

    /**
     * Drain and reset the limiter
     */
    async reset() {
        await this.drain();
        this.activePromises.clear();
        this.queue = [];
        this.resetCircuitBreaker();
    }
}

export default ConcurrencyLimiter;
