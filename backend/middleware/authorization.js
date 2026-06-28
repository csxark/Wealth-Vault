import policyEngineService from '../services/policyEngineService.js';
import { logger } from '../utils/logger.js';

const buildBaseContext = (req) => ({
  method: req.method,
  path: req.originalUrl || req.path,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'] || null,
  requestId: req.id || req.headers['x-request-id'] || null
});

export const authorize = ({
  action,
  resourceType = null,
  getResource = null,
  buildContext = null
} = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const dynamicResource = typeof getResource === 'function' ? await getResource(req) : null;
      const resource = dynamicResource || (resourceType ? { type: resourceType } : null);
      const additionalContext = typeof buildContext === 'function' ? await buildContext(req) : {};

      const decision = await policyEngineService.authorize({
        action,
        user: req.user,
        tenant: req.tenant || null,
        resource,
        context: {
          ...buildBaseContext(req),
          ...additionalContext
        }
      });

      req.authzDecision = decision;

      if (process.env.AUTHZ_EXPOSE_DECISION_HEADERS === 'true') {
        res.setHeader('X-Authz-Decision', decision.allow ? 'allow' : 'deny');
        res.setHeader('X-Authz-Reason', encodeURIComponent(decision.reason || 'policy'));
        res.setHeader('X-Authz-Rule', decision.matchedRuleId || 'unknown');
        res.setHeader('X-Authz-Policy-Version', decision.policyVersion || 'unknown');
      }

      if (!decision.allow) {
        return res.status(403).json({
          success: false,
          message: 'Access denied by policy',
          reason: decision.reason,
          code: 'AUTHZ_DENIED'
        });
      }

      return next();
    } catch (error) {
      logger.error('Authorization middleware error', {
        error: error.message,
        action,
        path: req.originalUrl
      });

      return res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        code: 'AUTHZ_ERROR'
      });
    }
  };
};

export const requirePolicyPermission = (requiredPermissions = [], mode = 'any') => {
  const permissionList = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  return authorize({
    action: mode === 'all' ? 'tenant:permission:check:all' : 'tenant:permission:check:any',
    resourceType: 'tenant-membership',
    buildContext: async (req) => {
      const normalizedRequired = permissionList
        .map((permissionKey) => String(permissionKey || '').trim().toLowerCase())
        .filter(Boolean);

      const grantedPermissions = req.authorization?.permissions || [];
      const hasWildcard = grantedPermissions.includes('*') || req.authorization?.hasWildcard === true;
      const checks = normalizedRequired.map((permissionKey) => hasWildcard || grantedPermissions.includes(permissionKey));

      return {
        requiredPermissions: normalizedRequired,
        grantedPermissions,
        permissionChecks: {
          any: checks.some(Boolean),
          all: checks.every(Boolean)
        },
        userRole: req.tenantMembership?.role || null
      };
    }
  });
};

export default {
  authorize,
  requirePolicyPermission
};
