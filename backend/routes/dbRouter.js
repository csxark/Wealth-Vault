import express from 'express';
import { getDBRouter } from '../services/dbRouterService.js';
import logger from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Database Router Health & Metrics Routes
 * 
 * Endpoints for monitoring database routing health, metrics, and status
 */

/**
 * @route GET /api/db-router/status
 * @desc Get database router status
 * @access Private (Admin)
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const dbRouter = getDBRouter();
        const status = dbRouter.getStatus();

        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get DB router status', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve database router status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route GET /api/db-router/metrics
 * @desc Get database routing metrics
 * @access Private (Admin)
 */
router.get('/metrics', authenticateToken, async (req, res) => {
    try {
        const dbRouter = getDBRouter();
        const metrics = dbRouter.getMetrics();

        // Calculate derived metrics
        const totalReads = metrics.primaryReads + metrics.replicaReads;
        const replicaReadPercentage = totalReads > 0 
            ? ((metrics.replicaReads / totalReads) * 100).toFixed(2)
            : 0;

        res.json({
            success: true,
            data: {
                ...metrics,
                totalReads,
                replicaReadPercentage: parseFloat(replicaReadPercentage),
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Failed to get DB router metrics', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve database router metrics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route GET /api/db-router/replicas
 * @desc Get replica health status
 * @access Private (Admin)
 */
router.get('/replicas', authenticateToken, async (req, res) => {
    try {
        const dbRouter = getDBRouter();
        const status = dbRouter.getStatus();

        res.json({
            success: true,
            data: {
                replicas: status.replicas,
                summary: {
                    total: status.replicas.length,
                    healthy: status.replicas.filter(r => r.healthy).length,
                    unhealthy: status.replicas.filter(r => !r.healthy).length,
                    averageLag: status.replicas.length > 0
                        ? Math.round(
                            status.replicas.reduce((sum, r) => sum + r.lag, 0) / status.replicas.length
                        )
                        : 0
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get replica status', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve replica status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route POST /api/db-router/health-check
 * @desc Force a health check on all replicas
 * @access Private (Admin)
 */
router.post('/health-check', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const dbRouter = getDBRouter();
        await dbRouter.forceHealthCheck();

        const status = dbRouter.getStatus();

        res.json({
            success: true,
            message: 'Health check completed',
            data: {
                replicas: status.replicas
            }
        });
    } catch (error) {
        logger.error('Failed to perform health check', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to perform health check',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route GET /api/db-router/config
 * @desc Get database router configuration
 * @access Private (Admin)
 */
router.get('/config', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const dbRouter = getDBRouter();
        const status = dbRouter.getStatus();

        res.json({
            success: true,
            data: {
                config: status.config,
                connections: {
                    primaryConnected: status.primary.connected,
                    replicaCount: status.replicas.length
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get router config', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve router configuration',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route GET /api/db-router/health
 * @desc Simple health check endpoint (public)
 * @access Public
 */
router.get('/health', async (req, res) => {
    try {
        const dbRouter = getDBRouter();
        const status = dbRouter.getStatus();

        const isHealthy = status.primary.connected && 
                         status.replicas.filter(r => r.healthy).length > 0;

        res.status(isHealthy ? 200 : 503).json({
            success: isHealthy,
            status: isHealthy ? 'healthy' : 'degraded',
            primary: status.primary.available,
            replicas: {
                healthy: status.replicas.filter(r => r.healthy).length,
                total: status.replicas.length
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Health check failed', {
            error: error.message
        });

        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: 'Health check failed'
        });
    }
});

/**
 * @route GET /api/db-router/metrics/prometheus
 * @desc Get Prometheus-formatted metrics
 * @access Private (Monitoring)
 */
router.get('/metrics/prometheus', async (req, res) => {
    try {
        const dbRouter = getDBRouter();
        const metrics = dbRouter.getMetrics();
        const status = dbRouter.getStatus();

        // Format as Prometheus metrics
        const prometheusMetrics = `
# HELP db_router_primary_reads_total Total number of reads routed to primary
# TYPE db_router_primary_reads_total counter
db_router_primary_reads_total ${metrics.primaryReads}

# HELP db_router_primary_writes_total Total number of writes routed to primary
# TYPE db_router_primary_writes_total counter
db_router_primary_writes_total ${metrics.primaryWrites}

# HELP db_router_replica_reads_total Total number of reads routed to replicas
# TYPE db_router_replica_reads_total counter
db_router_replica_reads_total ${metrics.replicaReads}

# HELP db_router_failovers_total Total number of failovers to primary
# TYPE db_router_failovers_total counter
db_router_failovers_total ${metrics.failovers}

# HELP db_router_lag_violations_total Total number of replica lag violations
# TYPE db_router_lag_violations_total counter
db_router_lag_violations_total ${metrics.lagViolations}

# HELP db_router_consistency_enforcements_total Total consistency window enforcements
# TYPE db_router_consistency_enforcements_total counter
db_router_consistency_enforcements_total ${metrics.consistencyEnforcements}

# HELP db_router_health_check_failures_total Total health check failures
# TYPE db_router_health_check_failures_total counter
db_router_health_check_failures_total ${metrics.healthCheckFailures}

# HELP db_router_active_replicas Number of healthy replicas
# TYPE db_router_active_replicas gauge
db_router_active_replicas ${metrics.activeReplicas}

# HELP db_router_total_replicas Total number of configured replicas
# TYPE db_router_total_replicas gauge
db_router_total_replicas ${metrics.totalReplicas}

# HELP db_router_consistency_windows Active consistency windows
# TYPE db_router_consistency_windows gauge
db_router_consistency_windows ${metrics.consistencyWindows}

${status.replicas.map(replica => `
# HELP db_router_replica_lag_ms Replication lag in milliseconds for replica ${replica.index}
# TYPE db_router_replica_lag_ms gauge
db_router_replica_lag_ms{replica="${replica.index}"} ${replica.lag}

# HELP db_router_replica_healthy Health status of replica ${replica.index}
# TYPE db_router_replica_healthy gauge
db_router_replica_healthy{replica="${replica.index}"} ${replica.healthy ? 1 : 0}
`).join('\n')}
`.trim();

        res.set('Content-Type', 'text/plain');
        res.send(prometheusMetrics);
    } catch (error) {
        logger.error('Failed to generate Prometheus metrics', {
            error: error.message
        });

        res.status(500).send('# Error generating metrics');
    }
});

export default router;
