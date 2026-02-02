/**  
 * Audit Routes
 * API endpoints for security audit trail and forensics
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { query, param, validationResult } from 'express-validator';
import {
  getUserAuditTrail,
  getRecentSecurityEvents,
  detectSuspiciousActivity,
  getAuditAnalytics,
  verifyDeltaIntegrity,
  getResourceAuditHistory,
  AuditActions
} from '../services/auditService.js';
import PDFDocument from 'pdfkit';
import { db } from '../config/db.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/audit/my-activity
 * @desc    Get current user's audit trail
 * @access  Private
 */
router.get(
  '/my-activity',
  protect,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('action').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { page = 1, limit = 20, action, startDate, endDate } = req.query;
      
      const result = await getUserAuditTrail(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        action,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error fetching user audit trail:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch audit trail',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/audit/security-events
 * @desc    Get recent security events for current user
 * @access  Private
 */
router.get(
  '/security-events',
  protect,
  [query('limit').optional().isInt({ min: 1, max: 50 })],
  async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      
      const events = await getRecentSecurityEvents(req.user.id, parseInt(limit));

      res.json({
        success: true,
        data: events,
        count: events.length
      });
    } catch (error) {
      console.error('Error fetching security events:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch security events',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/audit/suspicious-activity
 * @desc    Detect suspicious activity for current user
 * @access  Private
 */
router.get(
  '/suspicious-activity',
  protect,
  [
    query('timeWindowMinutes').optional().isInt({ min: 1, max: 60 }),
    query('deleteThreshold').optional().isInt({ min: 1 }),
    query('failedAuthThreshold').optional().isInt({ min: 1 })
  ],
  async (req, res) => {
    try {
      const { 
        timeWindowMinutes = 5,
        deleteThreshold = 5,
        failedAuthThreshold = 3 
      } = req.query;
      
      const report = await detectSuspiciousActivity(req.user.id, {
        timeWindowMinutes: parseInt(timeWindowMinutes),
        deleteThreshold: parseInt(deleteThreshold),
        failedAuthThreshold: parseInt(failedAuthThreshold)
      });

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error detecting suspicious activity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze suspicious activity',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/audit/analytics
 * @desc    Get audit analytics for current user
 * @access  Private
 */
router.get(
  '/analytics',
  protect,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('resourceType').optional().isString()
  ],
  async (req, res) => {
    try {
      const { startDate, endDate, resourceType } = req.query;
      
      const analytics = await getAuditAnalytics({
        userId: req.user.id,
        startDate,
        endDate,
        resourceType
      });

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error generating audit analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate analytics',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/audit/resource/:resourceType/:resourceId/history
 * @desc    Get audit history for a specific resource
 * @access  Private
 */
router.get(
  '/resource/:resourceType/:resourceId/history',
  protect,
  [
    param('resourceType').isString(),
    param('resourceId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('includeDeltas').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { resourceType, resourceId } = req.params;
      const { limit = 50, includeDeltas = true } = req.query;
      
      const history = await getResourceAuditHistory(resourceType, resourceId, {
        limit: parseInt(limit),
        includeDeltas: includeDeltas === 'true' || includeDeltas === true
      });

      res.json({
        success: true,
        data: history,
        count: history.length
      });
    } catch (error) {
      console.error('Error fetching resource audit history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch resource history',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/audit/verify/:auditLogId
 * @desc    Verify delta integrity for an audit log
 * @access  Private
 */
router.get(
  '/verify/:auditLogId',
  protect,
  param('auditLogId').isUUID(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { auditLogId } = req.params;
      
      const verification = await verifyDeltaIntegrity(auditLogId);

      res.json({
        success: true,
        data: verification
      });
    } catch (error) {
      console.error('Error verifying delta integrity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify integrity',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/audit/export/pdf
 * @desc    Export audit logs to protected PDF
 * @access  Private
 */
router.get(
  '/export/pdf',
  protect,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('action').optional().isString()
  ],
  async (req, res) => {
    try {
      const { startDate, endDate, action } = req.query;
      
      // Fetch audit logs
      const conditions = [eq(auditLogs.userId, req.user.id)];
      if (action) conditions.push(eq(auditLogs.action, action));
      if (startDate) conditions.push(gte(auditLogs.performedAt, new Date(startDate)));
      if (endDate) conditions.push(lte(auditLogs.performedAt, new Date(endDate)));

      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.performedAt))
        .limit(500); // Limit to prevent huge PDFs

      // Create PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.pdf"`);
      
      // Pipe PDF to response
      doc.pipe(res);

      // Add header
      doc.fontSize(20).text('Security Audit Log', { align: 'center' });
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.fontSize(10).text(`User: ${req.user.email}`, { align: 'center' });
      doc.moveDown();

      if (startDate || endDate) {
        doc.fontSize(10).text(
          `Period: ${startDate ? new Date(startDate).toLocaleDateString() : 'Beginning'} to ${endDate ? new Date(endDate).toLocaleDateString() : 'Now'}`,
          { align: 'center' }
        );
        doc.moveDown();
      }

      doc.fontSize(10).text(`Total Events: ${logs.length}`, { align: 'center' });
      doc.moveDown(2);

      // Add watermark
      doc.fontSize(8).fillColor('gray')
        .text('CONFIDENTIAL - AUDIT TRAIL REPORT', { align: 'center' });
      doc.fillColor('black');
      doc.moveDown();

      // Add logs
      logs.forEach((log, index) => {
        if (doc.y > 700) {
          doc.addPage();
        }

        doc.fontSize(10).font('Helvetica-Bold')
          .text(`${index + 1}. ${log.action}`, { continued: false });
        
        doc.fontSize(9).font('Helvetica')
          .text(`   Time: ${new Date(log.performedAt).toLocaleString()}`)
          .text(`   Status: ${log.status}`)
          .text(`   Resource: ${log.resourceType || 'N/A'} ${log.resourceId ? `(${log.resourceId})` : ''}`)
          .text(`   IP Address: ${log.ipAddress || 'Unknown'}`)
          .text(`   Request ID: ${log.requestId || 'N/A'}`);

        if (log.delta && Object.keys(log.delta.modified || {}).length > 0) {
          doc.text(`   Changes: ${Object.keys(log.delta.modified).join(', ')}`);
        }

        if (log.deltaHash) {
          doc.fontSize(7).fillColor('blue')
            .text(`   Hash: ${log.deltaHash.substring(0, 16)}...`, { link: null });
          doc.fillColor('black');
        }

        doc.moveDown(0.5);
      });

      // Add footer
      doc.fontSize(8).fillColor('gray')
        .text('This document contains confidential information. Unauthorized access or distribution is prohibited.', 
          50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 });

      // Finalize PDF
      doc.end();

    } catch (error) {
      console.error('Error exporting audit logs to PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to export audit logs',
          error: error.message
        });
      }
    }
  }
);

/**
 * @route   GET /api/audit/action-types
 * @desc    Get list of available audit action types
 * @access  Private
 */
router.get('/action-types', protect, (req, res) => {
  res.json({
    success: true,
    data: Object.values(AuditActions)
  });
});

export default router;
