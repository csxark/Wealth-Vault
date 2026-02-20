import { logAuditEventAsync, getClientInfo, AuditActions, ResourceTypes } from '../services/auditService.js';
import db from '../config/db.js';
import { stateDeltas } from '../db/schema.js';

/**
 * Middleware factory to create audit logging middleware
 * @param {Object} options - Configuration options
 * @param {string} options.action - The audit action to log
 * @param {string} options.resourceType - The resource type being accessed
 * @param {Function} options.getResourceId - Function to extract resource ID from req
 * @param {Function} options.getMetadata - Function to extract additional metadata
 * @returns {Function} Express middleware function
 */
export const auditLog = (options = {}) => {
  const {
    action,
    resourceType = null,
    getResourceId = null,
    getMetadata = null,
  } = options;

  return (req, res, next) => {
    // Store original end function
    const originalEnd = res.end;
    const originalJson = res.json;

    // Capture response data
    let responseBody = null;

    // Override res.json to capture response
    res.json = function (data) {
      responseBody = data;
      return originalJson.call(this, data);
    };

    // Override res.end to log after response is sent
    res.end = function (chunk, encoding) {
      // Call original end
      originalEnd.call(this, chunk, encoding);

      // Log audit event after response
      const clientInfo = getClientInfo(req);
      const userId = req.user?.id || null;
      const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';

      let resourceId = null;
      if (getResourceId) {
        try {
          resourceId = getResourceId(req, responseBody);
        } catch (e) {
          // Ignore errors in resource ID extraction
        }
      }

      let metadata = {};
      if (getMetadata) {
        try {
          metadata = getMetadata(req, responseBody) || {};
        } catch (e) {
          // Ignore errors in metadata extraction
        }
      }

      logAuditEventAsync({
        userId,
        action,
        resourceType,
        resourceId,
        metadata,
        status,
        ...clientInfo,
      });
    };

    next();
  };
};

/**
 * Log audit event manually (for use in route handlers)
 * @param {Object} req - Express request object
 * @param {Object} options - Audit options
 */
export const logAudit = (req, options) => {
  const clientInfo = getClientInfo(req);
  const userId = options.userId || req.user?.id || null;

  logAuditEventAsync({
    userId,
    action: options.action,
    resourceType: options.resourceType || null,
    resourceId: options.resourceId || null,
    metadata: options.metadata || {},
    status: options.status || 'success',
    ...clientInfo,
  });
};

// Pre-configured middleware for common actions
export const auditMiddleware = {
  // Auth middleware
  login: () => auditLog({
    action: AuditActions.AUTH_LOGIN,
    resourceType: ResourceTypes.USER,
    getResourceId: (req, res) => res?.data?.user?.id,
    getMetadata: (req) => ({ email: req.body?.email }),
  }),

  register: () => auditLog({
    action: AuditActions.AUTH_REGISTER,
    resourceType: ResourceTypes.USER,
    getResourceId: (req, res) => res?.data?.user?.id,
    getMetadata: (req) => ({ email: req.body?.email }),
  }),

  logout: () => auditLog({
    action: AuditActions.AUTH_LOGOUT,
    resourceType: ResourceTypes.SESSION,
  }),

  // Expense middleware
  createExpense: () => auditLog({
    action: AuditActions.EXPENSE_CREATE,
    resourceType: ResourceTypes.EXPENSE,
    getResourceId: (req, res) => res?.data?.expense?.id,
    getMetadata: (req) => ({
      amount: req.body?.amount,
      description: req.body?.description,
      categoryId: req.body?.category,
    }),
  }),

  updateExpense: () => auditLog({
    action: AuditActions.EXPENSE_UPDATE,
    resourceType: ResourceTypes.EXPENSE,
    getResourceId: (req) => req.params?.id,
    getMetadata: (req) => ({
      changes: Object.keys(req.body || {}),
    }),
  }),

  deleteExpense: () => auditLog({
    action: AuditActions.EXPENSE_DELETE,
    resourceType: ResourceTypes.EXPENSE,
    getResourceId: (req) => req.params?.id,
  }),

  // User/Profile middleware
  updateProfile: () => auditLog({
    action: AuditActions.PROFILE_UPDATE,
    resourceType: ResourceTypes.USER,
    getMetadata: (req) => ({
      updatedFields: Object.keys(req.body || {}),
    }),
  }),

  changePassword: () => auditLog({
    action: AuditActions.AUTH_PASSWORD_CHANGE,
    resourceType: ResourceTypes.USER,
  }),
};

/**
 * Log state delta for forensic tracking
 * @param {Object} options - Delta options
 */
export const logStateDelta = async (options) => {
  try {
    const {
      userId,
      resourceType,
      resourceId,
      operation, // 'CREATE', 'UPDATE', 'DELETE'
      beforeState,
      afterState,
      triggeredBy = 'user',
      ipAddress,
      userAgent,
      sessionId,
    } = options;

    // Calculate changed fields
    const changedFields = [];
    if (operation === 'UPDATE' && beforeState && afterState) {
      for (const key in afterState) {
        if (JSON.stringify(beforeState[key]) !== JSON.stringify(afterState[key])) {
          changedFields.push(key);
        }
      }
    }

    await db.insert(stateDeltas).values({
      userId,
      resourceType,
      resourceId,
      operation,
      beforeState,
      afterState,
      changedFields,
      triggeredBy,
      ipAddress,
      userAgent,
      sessionId,
      metadata: {},
    });
  } catch (error) {
    console.error('State delta logging failed:', error);
  }
};

export { AuditActions, ResourceTypes };
export default { auditLog, logAudit, logStateDelta, auditMiddleware, AuditActions, ResourceTypes };
