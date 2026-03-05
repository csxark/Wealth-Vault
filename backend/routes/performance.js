/**
 * Performance Monitoring Routes
 * Provides endpoints to monitor database query performance and cache statistics
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import cacheService from '../services/cacheService.js';
import queryTracker from '../utils/queryPerformanceTracker.js';
import performanceMonitor from '../services/performanceMonitor.js';

const router = express.Router();

/**
 * @swagger
 * /performance/cache-stats:
 *   get:
 *     summary: Get cache statistics
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics
 */
router.get('/cache-stats', protect, async (req, res) => {
  try {
    const stats = await cacheService.getCacheStats();
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get cache stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cache statistics',
    });
  }
});

/**
 * @swagger
 * /performance/query-stats:
 *   get:
 *     summary: Get database query statistics
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Query performance statistics
 */
router.get('/query-stats', protect, async (req, res) => {
  try {
    const stats = queryTracker.getStats();
    const slowest = queryTracker.getSlowestQueries(10);
    const recent = queryTracker.getRecentQueries(20);
    
    res.json({
      success: true,
      data: {
        stats,
        slowestQueries: slowest,
        recentQueries: recent,
      },
    });
  } catch (error) {
    console.error('Get query stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve query statistics',
    });
  }
});

/**
 * @swagger
 * /performance/report:
 *   get:
 *     summary: Get comprehensive performance report
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Comprehensive performance report
 */
router.get('/report', protect, async (req, res) => {
  try {
    const queryReport = queryTracker.generateReport();
    const cacheStats = await cacheService.getCacheStats();
    const systemStats = performanceMonitor.getPerformanceSummary();
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        system: systemStats,
        cache: cacheStats,
        queries: queryReport,
      },
    });
  } catch (error) {
    console.error('Generate performance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate performance report',
    });
  }
});

/**
 * @swagger
 * /performance/clear-cache:
 *   post:
 *     summary: Clear all cache (admin only)
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 */
router.post('/clear-cache', protect, async (req, res) => {
  try {
    // Note: In production, add admin role check here
    await cacheService.clearAll();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
});

/**
 * @swagger
 * /performance/slow-queries:
 *   get:
 *     summary: Get slowest database queries
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of slow queries to return
 *     responses:
 *       200:
 *         description: List of slowest queries
 */
router.get('/slow-queries', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const slowQueries = queryTracker.getSlowestQueries(limit);
    
    res.json({
      success: true,
      data: {
        queries: slowQueries,
        count: slowQueries.length,
      },
    });
  } catch (error) {
    console.error('Get slow queries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve slow queries',
    });
  }
});

/**
 * @swagger
 * /performance/query-by-name:
 *   get:
 *     summary: Get queries by name
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Query name to search for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of queries to return
 *     responses:
 *       200:
 *         description: List of queries matching the name
 */
router.get('/query-by-name', protect, async (req, res) => {
  try {
    const { name } = req.query;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Query name is required',
      });
    }
    
    const queries = queryTracker.getQueriesByName(name, limit);
    
    res.json({
      success: true,
      data: {
        queries,
        count: queries.length,
      },
    });
  } catch (error) {
    console.error('Get queries by name error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve queries',
    });
  }
});

/**
 * @swagger
 * /performance/health:
 *   get:
 *     summary: Get system health status
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 */
router.get('/health', protect, async (req, res) => {
  try {
    const health = performanceMonitor.getHealthStatus();
    
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('Get health status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve health status',
    });
  }
});

export default router;
