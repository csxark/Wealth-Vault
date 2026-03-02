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
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get(
  '/tenants/:tenantId/logs',
  protect,
  validateTenantAccess,
  requireTenantPermission(['audit:view', 'rbac:role:manage']),
  async (req, res) => {
    try {
      const result = await searchAuditLogs({
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
        q: req.query.q,
        page: req.query.page,
        limit: req.query.limit
      });

      return res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error searching audit logs', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to search audit logs'
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

export default router;
