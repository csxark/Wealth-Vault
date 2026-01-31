import express from 'express';
import { performanceMonitor } from '../services/performanceMonitor.js';
import { logInfo } from '../utils/logger.js';
import db from '../config/db.js';
import { getRedisClient } from '../config/redis.js';

const router = express.Router();

/**
 * Health check endpoint for monitoring system status
 * Provides detailed information about application health
 */

// @route   GET /api/health
// @desc    Basic health check
// @access  Public
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    logInfo('Health check accessed', { ip: req.ip });

    res.json({
      success: true,
      message: 'Wealth Vault API is running',
      data: healthStatus,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service unavailable',
      error: error.message,
    });
  }
});

// @route   GET /api/health/detailed
// @desc    Detailed health check with all system components
// @access  Public (should be protected in production)
router.get('/detailed', async (req, res) => {
  const healthChecks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {},
  };

  try {
    // Check database connectivity
    try {
      await db.execute('SELECT 1');
      healthChecks.checks.database = {
        status: 'healthy',
        message: 'Database connection successful',
      };
    } catch (dbError) {
      healthChecks.checks.database = {
        status: 'unhealthy',
        message: 'Database connection failed',
        error: dbError.message,
      };
      healthChecks.status = 'unhealthy';
    }

    // Check Redis connectivity
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        await redisClient.ping();
        healthChecks.checks.redis = {
          status: 'healthy',
          message: 'Redis connection successful',
        };
      } catch (redisError) {
        healthChecks.checks.redis = {
          status: 'degraded',
          message: 'Redis connection failed, using fallback',
          error: redisError.message,
        };
      }
    } else {
      healthChecks.checks.redis = {
        status: 'disabled',
        message: 'Redis not configured',
      };
    }

    // Get performance metrics
    const performanceData = performanceMonitor.getPerformanceSummary();
    healthChecks.checks.performance = {
      status:
        performanceData.cpuUsage > 90 || performanceData.systemMemoryUsage > 90
          ? 'warning'
          : 'healthy',
      metrics: performanceData,
    };

    // Check file system access
    try {
      const fs = await import('fs/promises');
      await fs.access('logs');
      healthChecks.checks.filesystem = {
        status: 'healthy',
        message: 'File system accessible',
      };
    } catch (fsError) {
      healthChecks.checks.filesystem = {
        status: 'warning',
        message: 'File system access issues',
        error: fsError.message,
      };
    }

    // Determine overall health status
    const unhealthyChecks = Object.values(healthChecks.checks).filter(
      (check) => check.status === 'unhealthy'
    );
    if (unhealthyChecks.length > 0) {
      healthChecks.status = 'unhealthy';
    } else {
      const warningChecks = Object.values(healthChecks.checks).filter(
        (check) => check.status === 'warning' || check.status === 'degraded'
      );
      if (warningChecks.length > 0) {
        healthChecks.status = 'degraded';
      }
    }

    const statusCode =
      healthChecks.status === 'healthy'
        ? 200
        : healthChecks.status === 'degraded'
        ? 200
        : 503;

    res.status(statusCode).json({
      success: healthChecks.status !== 'unhealthy',
      message: `System status: ${healthChecks.status}`,
      data: healthChecks,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      error: error.message,
      data: healthChecks,
    });
  }
});

// @route   GET /api/health/metrics
// @desc    Performance metrics endpoint
// @access  Public (should be protected in production)
router.get('/metrics', (req, res) => {
  try {
    const metrics = performanceMonitor.getPerformanceSummary();

    res.json({
      success: true,
      message: 'Performance metrics retrieved',
      data: {
        timestamp: new Date().toISOString(),
        ...metrics,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve metrics',
      error: error.message,
    });
  }
});

// @route   GET /api/health/logs
// @desc    Recent log entries for monitoring
// @access  Protected (should require admin access)
router.get('/logs', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const { level = 'error', limit = 50 } = req.query;

    // Read recent log files
    const logDir = level === 'error' ? 'logs/error' : 'logs/combined';
    const files = await fs.readdir(logDir);

    if (files.length === 0) {
      return res.json({
        success: true,
        message: 'No log files found',
        data: { logs: [] },
      });
    }

    // Get most recent log file
    const latestFile = files.sort().pop();
    const logPath = path.join(logDir, latestFile);

    const logContent = await fs.readFile(logPath, 'utf8');
    const logLines = logContent
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .slice(-parseInt(limit))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line, timestamp: new Date().toISOString() };
        }
      });

    res.json({
      success: true,
      message: `Recent ${level} logs retrieved`,
      data: {
        logs: logLines,
        file: latestFile,
        count: logLines.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve logs',
      error: error.message,
    });
  }
});

export default router;
