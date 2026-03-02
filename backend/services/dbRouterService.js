import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import logger from '../utils/logger.js';
import EventEmitter from 'events';

/**
 * PostgreSQL Read/Write Split Router with Replica-Lag-Aware Routing
 * 
 * Routes database queries intelligently:
 * - Writes → Primary
 * - Critical reads → Primary
 * - Non-critical reads → Replicas (when lag < threshold)
 * - Post-write reads → Primary (within consistency window)
 * 
 * Monitors replica health and lag, fails over gracefully.
 */

class DBRouterService extends EventEmitter {
    constructor() {
        super();
        
        // Connection pools
        this.primaryConnection = null;
        this.replicaConnections = [];
        this.primaryDb = null;
        this.replicaDbs = [];
        
        // Configuration
        this.config = {
            maxReplicaLag: parseInt(process.env.MAX_REPLICA_LAG_MS || '1000'), // 1 second default
            consistencyWindowMs: parseInt(process.env.CONSISTENCY_WINDOW_MS || '5000'), // 5 seconds
            healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
            replicaRetryInterval: parseInt(process.env.REPLICA_RETRY_INTERVAL || '60000'), // 1 minute
            preferReplicas: process.env.PREFER_REPLICAS !== 'false', // Default true
            connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000')
        };
        
        // Replica health tracking
        this.replicaHealth = new Map(); // replicaIndex → { healthy, lag, lastCheck, errors }
        
        // Consistency tracking (in-memory, should use Redis for multi-instance deployments)
        this.consistencyWindows = new Map(); // sessionId → timestamp
        
        // Metrics
        this.metrics = {
            primaryReads: 0,
            primaryWrites: 0,
            replicaReads: 0,
            failovers: 0,
            lagViolations: 0,
            consistencyEnforcements: 0,
            healthCheckFailures: 0
        };
        
        // Health check timer
        this.healthCheckTimer = null;
        
        // Initialize connections
        this.initialize();
    }

    /**
     * Initialize database connections
     */
    async initialize() {
        try {
            // Parse connection URLs from environment
            const primaryUrl = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/wealth_vault';
            const replicaUrls = process.env.DATABASE_REPLICA_URLS 
                ? process.env.DATABASE_REPLICA_URLS.split(',').map(url => url.trim())
                : [];

            logger.info('Initializing DB Router', {
                primaryUrl: primaryUrl.replace(/:[^:@]+@/, ':****@'),
                replicaCount: replicaUrls.length,
                config: this.config
            });

            // Initialize primary connection
            this.primaryConnection = postgres(primaryUrl, {
                prepare: false,
                max: 20,
                idle_timeout: 30,
                connect_timeout: this.config.connectionTimeout / 1000
            });
            this.primaryDb = drizzle(this.primaryConnection, { schema });

            // Test primary connection
            await this.testConnection(this.primaryConnection, 'primary');
            logger.info('✅ Primary DB connection established');

            // Initialize replica connections
            for (let i = 0; i < replicaUrls.length; i++) {
                try {
                    const replicaConnection = postgres(replicaUrls[i], {
                        prepare: false,
                        max: 20,
                        idle_timeout: 30,
                        connect_timeout: this.config.connectionTimeout / 1000
                    });
                    
                    const replicaDb = drizzle(replicaConnection, { schema });
                    
                    // Test replica connection
                    await this.testConnection(replicaConnection, `replica-${i}`);
                    
                    this.replicaConnections.push(replicaConnection);
                    this.replicaDbs.push(replicaDb);
                    
                    // Initialize health tracking
                    this.replicaHealth.set(i, {
                        healthy: true,
                        lag: 0,
                        lastCheck: Date.now(),
                        errors: 0,
                        url: replicaUrls[i].replace(/:[^:@]+@/, ':****@')
                    });
                    
                    logger.info(`✅ Replica-${i} connection established`);
                } catch (error) {
                    logger.error(`Failed to connect to replica-${i}`, {
                        error: error.message,
                        url: replicaUrls[i].replace(/:[^:@]+@/, ':****@')
                    });
                }
            }

            // Start health checks
            this.startHealthChecks();

            // Emit ready event
            this.emit('ready');

        } catch (error) {
            logger.error('Failed to initialize DB Router', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Test database connection
     * @param {Object} connection - Postgres connection
     * @param {string} name - Connection name for logging
     */
    async testConnection(connection, name) {
        try {
            await connection`SELECT 1 as test`;
            return true;
        } catch (error) {
            logger.error(`Database connection test failed: ${name}`, {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get appropriate database connection for a query
     * @param {Object} options - Routing options
     * @param {string} options.operation - 'read' or 'write'
     * @param {boolean} options.forcePrimary - Force primary even for reads
     * @param {string} options.sessionId - Session ID for consistency tracking
     * @param {boolean} options.critical - Whether read is critical (default: false)
     * @returns {Object} Database connection
     */
    getConnection(options = {}) {
        const {
            operation = 'read',
            forcePrimary = false,
            sessionId = null,
            critical = false
        } = options;

        // Always use primary for writes
        if (operation === 'write') {
            this.metrics.primaryWrites++;
            
            // Mark consistency window for this session
            if (sessionId) {
                this.markConsistencyWindow(sessionId);
            }
            
            logger.debug('Routing to primary (write)');
            return {
                db: this.primaryDb,
                connection: this.primaryConnection,
                target: 'primary',
                reason: 'write-operation'
            };
        }

        // Check if we should force primary for this read
        if (forcePrimary || critical) {
            this.metrics.primaryReads++;
            logger.debug('Routing to primary (forced/critical)');
            return {
                db: this.primaryDb,
                connection: this.primaryConnection,
                target: 'primary',
                reason: forcePrimary ? 'forced' : 'critical-read'
            };
        }

        // Check consistency window (post-write reads)
        if (sessionId && this.isInConsistencyWindow(sessionId)) {
            this.metrics.primaryReads++;
            this.metrics.consistencyEnforcements++;
            logger.debug('Routing to primary (consistency window)', { sessionId });
            return {
                db: this.primaryDb,
                connection: this.primaryConnection,
                target: 'primary',
                reason: 'consistency-window'
            };
        }

        // Try to route to healthy replica
        const replica = this.selectHealthyReplica();
        
        if (replica) {
            this.metrics.replicaReads++;
            logger.debug('Routing to replica', {
                replicaIndex: replica.index,
                lag: replica.health.lag
            });
            return {
                db: replica.db,
                connection: replica.connection,
                target: `replica-${replica.index}`,
                reason: 'replica-available',
                lag: replica.health.lag
            };
        }

        // Fallback to primary if no healthy replicas
        this.metrics.primaryReads++;
        this.metrics.failovers++;
        logger.debug('Routing to primary (no healthy replicas)');
        return {
            db: this.primaryDb,
            connection: this.primaryConnection,
            target: 'primary',
            reason: 'no-healthy-replicas'
        };
    }

    /**
     * Select a healthy replica with acceptable lag
     * @returns {Object|null} Selected replica or null
     * @private
     */
    selectHealthyReplica() {
        if (this.replicaDbs.length === 0) {
            return null;
        }

        // Filter healthy replicas with acceptable lag
        const healthyReplicas = [];
        
        for (let i = 0; i < this.replicaDbs.length; i++) {
            const health = this.replicaHealth.get(i);
            
            if (health && health.healthy && health.lag < this.config.maxReplicaLag) {
                healthyReplicas.push({
                    index: i,
                    db: this.replicaDbs[i],
                    connection: this.replicaConnections[i],
                    health
                });
            }
        }

        if (healthyReplicas.length === 0) {
            return null;
        }

        // Simple round-robin selection (can be enhanced with weighted selection)
        const selected = healthyReplicas[Math.floor(Math.random() * healthyReplicas.length)];
        
        return selected;
    }

    /**
     * Mark consistency window for a session (after write)
     * @param {string} sessionId - Session identifier
     */
    markConsistencyWindow(sessionId) {
        this.consistencyWindows.set(sessionId, Date.now() + this.config.consistencyWindowMs);
        
        logger.debug('Marked consistency window', {
            sessionId,
            windowMs: this.config.consistencyWindowMs
        });
    }

    /**
     * Check if session is within consistency window
     * @param {string} sessionId - Session identifier
     * @returns {boolean}
     */
    isInConsistencyWindow(sessionId) {
        const windowEnd = this.consistencyWindows.get(sessionId);
        
        if (!windowEnd) {
            return false;
        }

        const now = Date.now();
        
        if (now < windowEnd) {
            return true;
        }

        // Window expired, clean up
        this.consistencyWindows.delete(sessionId);
        return false;
    }

    /**
     * Start periodic health checks
     * @private
     */
    startHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        logger.info('Starting DB health checks', {
            interval: this.config.healthCheckInterval
        });

        this.healthCheckTimer = setInterval(
            () => this.performHealthChecks(),
            this.config.healthCheckInterval
        );

        // Perform initial health check
        setTimeout(() => this.performHealthChecks(), 1000);
    }

    /**
     * Perform health checks on all replicas
     * @private
     */
    async performHealthChecks() {
        logger.debug('Performing health checks on replicas');

        const checks = this.replicaConnections.map((connection, index) =>
            this.checkReplicaHealth(connection, index)
        );

        await Promise.allSettled(checks);

        // Log health summary
        const healthSummary = Array.from(this.replicaHealth.entries()).map(([index, health]) => ({
            replica: index,
            healthy: health.healthy,
            lag: health.lag,
            errors: health.errors
        }));

        logger.info('Replica health check complete', { replicas: healthSummary });
        
        // Emit health update event
        this.emit('health-update', healthSummary);
    }

    /**
     * Check health of a single replica
     * @param {Object} connection - Replica connection
     * @param {number} index - Replica index
     * @private
     */
    async checkReplicaHealth(connection, index) {
        const health = this.replicaHealth.get(index);
        
        try {
            // Check connection
            await connection`SELECT 1`;
            
            // Measure replication lag
            const lag = await this.measureReplicationLag(connection);
            
            // Update health status
            health.healthy = true;
            health.lag = lag;
            health.lastCheck = Date.now();
            health.errors = 0;
            
            if (lag > this.config.maxReplicaLag) {
                this.metrics.lagViolations++;
                logger.warn('Replica lag exceeds threshold', {
                    replica: index,
                    lag,
                    threshold: this.config.maxReplicaLag
                });
            }

        } catch (error) {
            this.metrics.healthCheckFailures++;
            health.healthy = false;
            health.errors++;
            health.lastCheck = Date.now();
            
            logger.error('Replica health check failed', {
                replica: index,
                error: error.message,
                consecutiveErrors: health.errors
            });
        }
    }

    /**
     * Measure replication lag for a replica
     * @param {Object} connection - Replica connection
     * @returns {Promise<number>} Lag in milliseconds
     * @private
     */
    async measureReplicationLag(connection) {
        try {
            // Query pg_stat_replication lag (this works on the primary)
            // For replica, we check last WAL receive time
            const result = await connection`
                SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) * 1000 as lag_ms
            `;
            
            if (result[0] && result[0].lag_ms !== null) {
                return Math.max(0, Math.floor(result[0].lag_ms));
            }
            
            // If null, replica might be caught up or it's the primary
            return 0;
        } catch (error) {
            logger.error('Failed to measure replication lag', {
                error: error.message
            });
            // Return safe maximum to avoid using this replica
            return this.config.maxReplicaLag * 2;
        }
    }

    /**
     * Get routing metrics
     * @returns {Object} Metrics object
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeReplicas: Array.from(this.replicaHealth.values()).filter(h => h.healthy).length,
            totalReplicas: this.replicaHealth.size,
            consistencyWindows: this.consistencyWindows.size,
            replicaHealth: Array.from(this.replicaHealth.entries()).map(([index, health]) => ({
                replica: index,
                ...health
            }))
        };
    }

    /**
     * Get router status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            primary: {
                connected: this.primaryConnection !== null,
                available: true
            },
            replicas: Array.from(this.replicaHealth.entries()).map(([index, health]) => ({
                index,
                healthy: health.healthy,
                lag: health.lag,
                lastCheck: health.lastCheck,
                errors: health.errors,
                url: health.url
            })),
            config: this.config,
            metrics: this.getMetrics()
        };
    }

    /**
     * Force a health check
     * @returns {Promise<void>}
     */
    async forceHealthCheck() {
        logger.info('Forcing health check');
        await this.performHealthChecks();
    }

    /**
     * Close all connections
     */
    async close() {
        logger.info('Closing DB Router connections');
        
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        const closePromises = [];
        
        if (this.primaryConnection) {
            closePromises.push(this.primaryConnection.end());
        }
        
        for (const connection of this.replicaConnections) {
            closePromises.push(connection.end());
        }

        await Promise.allSettled(closePromises);
        
        logger.info('All DB connections closed');
        this.emit('closed');
    }
}

// Singleton instance
let dbRouterInstance = null;

/**
 * Get or create DB Router instance
 * @returns {DBRouterService}
 */
export function getDBRouter() {
    if (!dbRouterInstance) {
        dbRouterInstance = new DBRouterService();
    }
    return dbRouterInstance;
}

/**
 * Initialize DB Router (call this on app startup)
 * @returns {Promise<DBRouterService>}
 */
export async function initializeDBRouter() {
    const router = getDBRouter();
    
    return new Promise((resolve, reject) => {
        if (router.primaryDb) {
            resolve(router);
            return;
        }
        
        router.once('ready', () => resolve(router));
        router.once('error', reject);
        
        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('DB Router initialization timeout')), 10000);
    });
}

export default getDBRouter();
