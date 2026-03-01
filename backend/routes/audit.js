import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateTenantAccess, requireTenantPermission } from '../middleware/tenantMiddleware.js';
import {
  exportAuditLogsAsCsv,
  getSecurityAlerts,
  searchAuditLogs,
  verifyAuditLogIntegrity
} from '../services/auditLogService.js';
import tamperProofAuditService from '../services/tamperProofAuditService.js';
import tenantAwareAuditService from '../services/tenantAwareAuditService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get(
  '/tenants/:tenantId/logs',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:view', 'rbac:role:manage']),
  async (req, res) => {
    try {
      // Use tenant-aware audit service for enhanced access control
      const result = await tenantAwareAuditService.queryTenantAuditLogs(
        req.user.id,
        req.params.tenantId,
        {
          actorUserId: req.query.actorUserId,
          action: req.query.action,
          category: req.query.category,
          outcome: req.query.outcome,
          severity: req.query.severity,
          method: req.query.method,
          statusCode: req.query.statusCode,
          from: req.query.from,
          to: req.query.to,
          q: req.query.q,
          limit: req.query.limit,
          offset: req.query.offset
        }
      );

      return res.status(200).json({
        success: true,
        data: result,
        pagination: {
          limit: req.query.limit || 50,
          offset: req.query.offset || 0,
          hasMore: result.length === (req.query.limit || 50)
        }
      });
    } catch (error) {
      logger.error('Error querying tenant audit logs', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to query tenant audit logs'
      });
    }
  }
);

router.get(
  '/tenants/:tenantId/logs/export',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:export', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const csv = await exportAuditLogsAsCsv({
        tenantId: req.params.tenantId,
        actorUserId: req.query.actorUserId,
        action: req.query.action,
        category: req.query.category,
        outcome: req.query.outcome,
        severity: req.query.severity,
        method: req.query.method,
        statusCode: req.query.statusCode,
        from: req.query.from,
        to: req.query.to,
        q: req.query.q
      });

      const fileName = `audit-logs-${req.params.tenantId}-${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      return res.status(200).send(csv);
    } catch (error) {
      logger.error('Error exporting audit logs', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to export audit logs'
      });
    }
  }
);

router.get(
  '/tenants/:tenantId/alerts',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:alert:view', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const result = await getSecurityAlerts({
        tenantId: req.params.tenantId,
        from: req.query.from,
        to: req.query.to,
        page: req.query.page,
        limit: req.query.limit
      });

      return res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error fetching security alerts', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch security alerts'
      });
    }
  }
);

router.get(
  '/tenants/:tenantId/integrity',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:integrity:verify', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const report = await verifyAuditLogIntegrity({
        tenantId: req.params.tenantId,
        limit: req.query.limit
      });

      return res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      logger.error('Error verifying audit log integrity', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify audit log integrity'
      });
    }
  }
);

// Tamper-Proof Audit Trail Endpoints (#627)

// Anchor latest Merkle root externally
router.post(
  '/tenants/:tenantId/anchor-external',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:integrity:anchor', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const { anchorId, externalService = 'blockchain' } = req.body;

      if (!anchorId) {
        return res.status(400).json({
          success: false,
          message: 'anchorId is required'
        });
      }

      const result = await tamperProofAuditService.anchorExternally(anchorId, externalService);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error anchoring externally', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to anchor externally'
      });
    }
  }
);

// Verify external anchoring
router.get(
  '/tenants/:tenantId/anchors/:anchorId/verify-external',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:integrity:verify', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const result = await tamperProofAuditService.verifyExternalAnchoring(req.params.anchorId);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error verifying external anchoring', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify external anchoring'
      });
    }
  }
);

// Get comprehensive integrity report
router.get(
  '/tenants/:tenantId/integrity-report',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:integrity:verify', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const includeExternal = req.query.includeExternal !== 'false';
      const report = await tamperProofAuditService.getIntegrityReport(
        req.params.tenantId,
        includeExternal
      );

      return res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      logger.error('Error generating integrity report', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate integrity report'
      });
    }
  }
);

// Schedule periodic anchoring
router.post(
  '/tenants/:tenantId/schedule-anchoring',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:integrity:anchor', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const { intervalHours = 24 } = req.body;

      const result = await tamperProofAuditService.schedulePeriodicAnchoring(
        req.params.tenantId,
        intervalHours
      );

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error scheduling anchoring', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to schedule anchoring'
      });
    }
  }
);

// Tenant-Aware Audit Isolation Endpoints (#629)

// Get tenant audit summary with isolation verification
router.get(
  '/tenants/:tenantId/summary',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:view', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const summary = await tenantAwareAuditService.getTenantAuditSummary(
        req.user.id,
        req.params.tenantId
      );

      return res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Error getting tenant audit summary', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get tenant audit summary'
      });
    }
  }
);

// Get audit access violations for security monitoring
router.get(
  '/tenants/:tenantId/violations',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:alert:view', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const hours = parseInt(req.query.hours) || 24;
      const violations = await tenantAwareAuditService.getAuditAccessViolations(
        req.params.tenantId,
        hours
      );

      return res.status(200).json({
        success: true,
        data: violations,
        period: `${hours} hours`
      });
    } catch (error) {
      logger.error('Error getting audit violations', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get audit violations'
      });
    }
  }
);

// Validate tenant isolation integrity
router.get(
  '/system/isolation-check',
  protect,
  requireTenantPermission(['*']), // Only system admins
  async (req, res) => {
    try {
      const isolationStatus = await tenantAwareAuditService.validateTenantIsolation();

      return res.status(200).json({
        success: true,
        data: isolationStatus
      });
    } catch (error) {
      logger.error('Error checking tenant isolation', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check tenant isolation'
      });
    }
  }
);

// Get user's accessible tenants for audit operations
router.get(
  '/user/accessible-tenants',
  protect,
  async (req, res) => {
    try {
      const accessibleTenants = await tenantAwareAuditService.getUserAccessibleTenants(req.user.id);

      return res.status(200).json({
        success: true,
        data: accessibleTenants
      });
    } catch (error) {
      logger.error('Error getting accessible tenants', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get accessible tenants'
      });
    }
  }
);

export default router;
