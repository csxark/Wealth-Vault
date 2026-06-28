import {
  extractTenantRegionConfig,
  logRegionComplianceEvent,
  validateRegionAccess
} from '../services/multiRegionService.js';
import { logger } from '../utils/logger.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const enforceTenantRegionRouting = (options = {}) => {
  const {
    strictWhenEnabled = true,
    allowReadRedirect = true,
    enabled = true,
    enforceGeoFence = process.env.ENABLE_GEO_FENCE_CHECKS === 'true'
  } = options;

  return async (req, res, next) => {
    if (!enabled || !req.tenant) {
      return next();
    }

    const requestRegion = req.headers['x-region'] || req.headers['x-app-region'] || process.env.APP_REGION;
    const dataClass = String(req.headers['x-data-class'] || req.body?.dataClass || 'operational').toLowerCase();
    const userRegion = req.headers['x-user-region'] || req.headers['x-geo-region'] || null;

    const validation = validateRegionAccess({
      tenant: req.tenant,
      path: req.originalUrl,
      requestRegion,
      method: req.method,
      dataClass,
      userRegion,
      strictMode: strictWhenEnabled,
      enforceGeoFence
    });

    const decision = validation.decision;

    req.regionRouting = decision;
    req.regionValidation = validation;

    res.setHeader('X-Tenant-Home-Region', decision.homeRegion);
    res.setHeader('X-Request-Region', decision.requestRegion);
    res.setHeader('X-Region-Routing-Reason', decision.reason);
    res.setHeader('X-Region-Validation-Code', validation.code);

    if (!validation.ok) {
      logger.warn('Tenant region routing blocked request', {
        tenantId: req.tenant.id,
        method: req.method,
        path: req.originalUrl,
        homeRegion: decision.homeRegion,
        requestRegion: decision.requestRegion,
        reason: decision.reason,
        code: validation.code,
        dataClass,
        userRegion
      });

      await logRegionComplianceEvent({
        req,
        validation,
        statusCode: validation.code === 'REGION_REDIRECT_REQUIRED' ? 307 : 409,
        outcome: 'failure',
        extraMetadata: {
          middleware: 'enforceTenantRegionRouting'
        }
      }).catch((error) => {
        logger.error('Failed to persist region compliance audit event', {
          error: error.message,
          tenantId: req.tenant?.id,
          requestId: req.requestId
        });
      });

      const isRead = !WRITE_METHODS.has(String(req.method || 'GET').toUpperCase());

      if (allowReadRedirect && isRead && validation.code === 'REGION_POLICY_BLOCKED') {
        return res.status(307).json({
          success: false,
          message: 'Request must be served from tenant home region',
          code: 'REGION_REDIRECT_REQUIRED',
          homeRegion: decision.homeRegion,
          requestRegion: decision.requestRegion,
          reason: decision.reason
        });
      }

      return res.status(409).json({
        success: false,
        message: validation.message,
        code: validation.code,
        homeRegion: decision.homeRegion,
        requestRegion: decision.requestRegion,
        reason: decision.reason,
        dataClass,
        userRegion
      });
    }

    return next();
  };
};

export const enforceResidencyDataClass = () => {
  return async (req, res, next) => {
    if (!req.tenant) {
      return next();
    }

    const dataClass = String(req.headers['x-data-class'] || req.body?.dataClass || 'operational').toLowerCase();
    const requestRegion = req.headers['x-region'] || process.env.APP_REGION || null;
    const userRegion = req.headers['x-user-region'] || req.headers['x-geo-region'] || null;
    const { homeRegion } = extractTenantRegionConfig(req.tenant);

    const validation = validateRegionAccess({
      tenant: req.tenant,
      method: req.method,
      path: req.originalUrl,
      requestRegion,
      dataClass,
      userRegion,
      strictMode: true,
      enforceGeoFence: process.env.ENABLE_GEO_FENCE_CHECKS === 'true'
    });

    req.regionValidation = validation;

    if (!validation.ok) {
      logger.warn('Residency-restricted data blocked outside home region', {
        tenantId: req.tenant.id,
        dataClass,
        requestRegion,
        homeRegion,
        path: req.originalUrl,
        method: req.method,
        code: validation.code,
        userRegion
      });

      await logRegionComplianceEvent({
        req,
        validation,
        statusCode: 409,
        outcome: 'failure',
        extraMetadata: {
          middleware: 'enforceResidencyDataClass'
        }
      }).catch((error) => {
        logger.error('Failed to persist residency compliance audit event', {
          error: error.message,
          tenantId: req.tenant?.id,
          requestId: req.requestId
        });
      });

      return res.status(409).json({
        success: false,
        message: validation.message,
        code: validation.code,
        dataClass,
        homeRegion,
        requestRegion,
        userRegion
      });
    }

    return next();
  };
};

export const enforceMandatoryRegion = (options = {}) => enforceTenantRegionRouting({
  strictWhenEnabled: true,
  allowReadRedirect: false,
  enabled: true,
  ...options
});

export default {
  enforceTenantRegionRouting,
  enforceResidencyDataClass,
  enforceMandatoryRegion
};
