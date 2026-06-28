/**
 * Differential Log Compression API Routes (#632)
 *
 * API endpoints for managing log compression settings, monitoring compression
 * statistics, and accessing compressed log data.
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenant.js';
import differentialLogCompression from '../services/differentialLogCompression.js';
import { db } from '../config/db.js';
import { compressedAuditLogs, compressionStatistics } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

// All routes require authentication and tenant access
router.use(requireAuth);
router.use(validateTenantAccess);

/**
 * GET /api/compression/status
 * Get compression service status and current configuration
 */
router.get('/status', async (req, res) => {
    try {
        const status = {
            enabled: differentialLogCompression.compressionEnabled,
            compressionLevel: differentialLogCompression.compressionLevel,
            deltaEncodingEnabled: differentialLogCompression.deltaEncodingEnabled,
            dictionaryEnabled: differentialLogCompression.dictionaryEnabled,
            deltaThreshold: differentialLogCompression.deltaThreshold,
            stats: differentialLogCompression.getCompressionStats()
        };

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logError('Failed to get compression status', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get compression status'
        });
    }
});

/**
 * PUT /api/compression/config
 * Update compression configuration
 */
router.put('/config', [
    body('compressionEnabled').optional().isBoolean(),
    body('compressionLevel').optional().isInt({ min: 1, max: 9 }),
    body('deltaEncodingEnabled').optional().isBoolean(),
    body('dictionaryEnabled').optional().isBoolean(),
    body('deltaThreshold').optional().isFloat({ min: 0, max: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const config = req.body;
        differentialLogCompression.configure(config);

        logInfo('Compression configuration updated', { config, tenantId: req.tenantId });

        res.json({
            success: true,
            message: 'Compression configuration updated successfully',
            data: config
        });
    } catch (error) {
        logError('Failed to update compression config', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to update compression configuration'
        });
    }
});

/**
 * GET /api/compression/stats
 * Get compression statistics for the tenant
 */
router.get('/stats', [
    query('period').optional().isIn(['1h', '24h', '7d', '30d']).withMessage('Period must be one of: 1h, 24h, 7d, 30d'),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { period = '24h', startDate, endDate } = req.query;
        const tenantId = req.tenantId;

        // Calculate period hours
        const periodHours = {
            '1h': 1,
            '24h': 24,
            '7d': 168,
            '30d': 720
        }[period] || 24;

        // Get statistics from database
        const stats = await db.execute(sql`
            SELECT * FROM get_tenant_compression_stats(${tenantId}, ${periodHours})
        `);

        // Get real-time stats from service
        const realtimeStats = differentialLogCompression.getCompressionStats();

        res.json({
            success: true,
            data: {
                period,
                periodHours,
                databaseStats: stats.rows[0] || {},
                realtimeStats
            }
        });
    } catch (error) {
        logError('Failed to get compression stats', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get compression statistics'
        });
    }
});

/**
 * GET /api/compression/logs
 * Get compressed log entries with optional filtering
 */
router.get('/logs', [
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('offset').optional().isInt({ min: 0 }),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('minRatio').optional().isFloat({ min: 1 }),
    query('maxRatio').optional().isFloat({ min: 1 }),
    query('deltaEncoded').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const {
            limit = 50,
            offset = 0,
            startDate,
            endDate,
            minRatio,
            maxRatio,
            deltaEncoded
        } = req.query;

        const tenantId = req.tenantId;

        // Build query
        let query = db
            .select({
                id: compressedAuditLogs.id,
                originalLogId: compressedAuditLogs.originalLogId,
                compressedSize: compressedAuditLogs.compressedSize,
                originalSize: compressedAuditLogs.originalSize,
                compressionRatio: compressedAuditLogs.compressionRatio,
                isDeltaEncoded: compressedAuditLogs.isDeltaEncoded,
                dictionaryHits: compressedAuditLogs.dictionaryHits,
                createdAt: compressedAuditLogs.createdAt,
                compressedAt: compressedAuditLogs.compressedAt
            })
            .from(compressedAuditLogs)
            .where(eq(compressedAuditLogs.tenantId, tenantId))
            .orderBy(desc(compressedAuditLogs.createdAt))
            .limit(limit)
            .offset(offset);

        // Add filters
        if (startDate) {
            query = query.where(gte(compressedAuditLogs.createdAt, new Date(startDate)));
        }
        if (endDate) {
            query = query.where(lte(compressedAuditLogs.createdAt, new Date(endDate)));
        }
        if (minRatio !== undefined) {
            query = query.where(gte(compressedAuditLogs.compressionRatio, minRatio));
        }
        if (maxRatio !== undefined) {
            query = query.where(lte(compressedAuditLogs.compressionRatio, maxRatio));
        }
        if (deltaEncoded !== undefined) {
            query = query.where(eq(compressedAuditLogs.isDeltaEncoded, deltaEncoded));
        }

        const logs = await query;

        // Get total count
        const totalCount = await db
            .select({ count: sql`count(*)` })
            .from(compressedAuditLogs)
            .where(eq(compressedAuditLogs.tenantId, tenantId));

        res.json({
            success: true,
            data: {
                logs,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total: totalCount[0].count
                }
            }
        });
    } catch (error) {
        logError('Failed to get compressed logs', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get compressed logs'
        });
    }
});

/**
 * GET /api/compression/logs/:id
 * Get a specific compressed log entry
 */
router.get('/logs/:id', [
    param('id').isUUID()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const tenantId = req.tenantId;

        const log = await db
            .select()
            .from(compressedAuditLogs)
            .where(and(
                eq(compressedAuditLogs.id, id),
                eq(compressedAuditLogs.tenantId, tenantId)
            ))
            .limit(1);

        if (!log.length) {
            return res.status(404).json({
                success: false,
                error: 'Compressed log entry not found'
            });
        }

        res.json({
            success: true,
            data: log[0]
        });
    } catch (error) {
        logError('Failed to get compressed log', { error: error.message, logId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to get compressed log entry'
        });
    }
});

/**
 * POST /api/compression/logs/:id/decompress
 * Decompress a specific log entry
 */
router.post('/logs/:id/decompress', [
    param('id').isUUID()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const tenantId = req.tenantId;

        // Get compressed log
        const compressedLog = await db
            .select()
            .from(compressedAuditLogs)
            .where(and(
                eq(compressedAuditLogs.id, id),
                eq(compressedAuditLogs.tenantId, tenantId)
            ))
            .limit(1);

        if (!compressedLog.length) {
            return res.status(404).json({
                success: false,
                error: 'Compressed log entry not found'
            });
        }

        // Decompress the log
        const decompressed = await differentialLogCompression.decompressLogEntry(
            compressedLog[0].compressedData,
            tenantId
        );

        res.json({
            success: true,
            data: {
                id: compressedLog[0].id,
                decompressed,
                metadata: {
                    originalSize: compressedLog[0].originalSize,
                    compressedSize: compressedLog[0].compressedSize,
                    compressionRatio: compressedLog[0].compressionRatio,
                    isDeltaEncoded: compressedLog[0].isDeltaEncoded,
                    dictionaryHits: compressedLog[0].dictionaryHits
                }
            }
        });
    } catch (error) {
        logError('Failed to decompress log', { error: error.message, logId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to decompress log entry'
        });
    }
});

/**
 * POST /api/compression/test
 * Test compression with sample data
 */
router.post('/test', [
    body('sampleData').isObject(),
    body('iterations').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { sampleData, iterations = 1 } = req.body;
        const tenantId = req.tenantId;

        const results = [];
        let totalOriginalSize = 0;
        let totalCompressedSize = 0;

        for (let i = 0; i < iterations; i++) {
            const result = await differentialLogCompression.compressLogEntry(sampleData, tenantId);
            results.push(result);
            totalOriginalSize += result.metadata.originalSize;
            totalCompressedSize += result.metadata.compressedSize;
        }

        const averageRatio = (totalOriginalSize / totalCompressedSize).toFixed(2);

        res.json({
            success: true,
            data: {
                iterations,
                results,
                summary: {
                    totalOriginalSize,
                    totalCompressedSize,
                    averageCompressionRatio: averageRatio,
                    spaceSavingsPercent: (((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100).toFixed(2)
                }
            }
        });
    } catch (error) {
        logError('Failed to test compression', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to test compression'
        });
    }
});

/**
 * POST /api/compression/reset-stats
 * Reset compression statistics
 */
router.post('/reset-stats', async (req, res) => {
    try {
        differentialLogCompression.resetStats();

        logInfo('Compression statistics reset', { tenantId: req.tenantId });

        res.json({
            success: true,
            message: 'Compression statistics reset successfully'
        });
    } catch (error) {
        logError('Failed to reset compression stats', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to reset compression statistics'
        });
    }
});

/**
 * POST /api/compression/rebuild-dictionaries
 * Rebuild compression dictionaries from recent logs
 */
router.post('/rebuild-dictionaries', async (req, res) => {
    try {
        await differentialLogCompression.buildInitialDictionaries();

        logInfo('Compression dictionaries rebuilt', { tenantId: req.tenantId });

        res.json({
            success: true,
            message: 'Compression dictionaries rebuilt successfully'
        });
    } catch (error) {
        logError('Failed to rebuild dictionaries', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to rebuild compression dictionaries'
        });
    }
});

export default router;