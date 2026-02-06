/**
 * Audit Middleware - Automatic State Change Tracking
 * Intercepts PUT/PATCH/DELETE requests and logs deltas with cryptographic verification
 */

import { logAuditEventWithDelta, AuditActions, ResourceTypes, getClientInfo } from '../services/auditService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extract resource information from request
 * @param {Object} req - Express request
 * @returns {Object} Resource info
 */
const extractResourceInfo = (req) => {
  const path = req.route?.path || req.path;
  const method = req.method;
  
  // Extract resource type from path
  let resourceType = null;
  let resourceId = req.params.id || req.params.expenseId || req.params.goalId || req.params.categoryId;
  
  if (path.includes('/expenses')) {
    resourceType = ResourceTypes.EXPENSE;
  } else if (path.includes('/goals')) {
    resourceType = 'goal';
  } else if (path.includes('/categories')) {
    resourceType = ResourceTypes.CATEGORY;
  } else if (path.includes('/users') || path.includes('/profile')) {
    resourceType = ResourceTypes.USER;
    resourceId = resourceId || req.user?.id;
  } else if (path.includes('/vaults')) {
    resourceType = 'vault';
  } else if (path.includes('/settlements')) {
    resourceType = 'settlement';
  }
  
  // Determine action based on method
  let action = null;
  if (method === 'POST' && resourceType) {
    action = `${resourceType.toUpperCase()}_CREATE`;
  } else if (method === 'PUT' || method === 'PATCH') {
    action = `${resourceType?.toUpperCase()}_UPDATE`;
  } else if (method === 'DELETE') {
    action = `${resourceType?.toUpperCase()}_DELETE`;
  }
  
  return { resourceType, resourceId, action };
};

/**
 * Security Interceptor Middleware
 * Automatically captures and logs state changes with delta tracking
 * Apply to routes that modify data
 */
export const securityInterceptor = () => {
  return async (req, res, next) => {
    // Skip for GET requests and health checks
    if (req.method === 'GET' || req.path.includes('/health') || req.path.includes('/api-docs')) {
      return next();
    }

    // Generate request ID for correlation
    req.requestId = req.headers['x-request-id'] || uuidv4();
    req.auditTimestamp = Date.now();

    // Extract resource information
    const { resourceType, resourceId, action } = extractResourceInfo(req);
    
    // Store original state if available (for UPDATE/DELETE)
    if ((req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') && resourceId) {
      req.originalState = req.body._originalState || null;
      delete req.body._originalState; // Clean up to avoid saving to DB
    }

    // Intercept response to capture new state
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function(data) {
      // Only log if operation was successful (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        captureAuditLog(req, res, data, { resourceType, resourceId, action });
      }
      return originalJson(data);
    };

    res.send = function(data) {
      // Only log if operation was successful
      if (res.statusCode >= 200 && res.statusCode < 300 && 
          (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE' || req.method === 'POST')) {
        try {
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          captureAuditLog(req, res, parsedData, { resourceType, resourceId, action });
        } catch (e) {
          // If data is not JSON, skip audit logging
        }
      }
      return originalSend(data);
    };

    next();
  };
};

/**
 * Capture audit log with delta
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {*} responseData - Response data
 * @param {Object} resourceInfo - Resource information
 */
const captureAuditLog = async (req, res, responseData, resourceInfo) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const { resourceType, resourceId, action } = resourceInfo;

    // Extract new state from response data
    let newState = null;
    if (responseData?.data) {
      newState = responseData.data.expense || 
                 responseData.data.goal || 
                 responseData.data.category || 
                 responseData.data.user ||
                 responseData.data.vault ||
                 responseData.data.settlement ||
                 responseData.data;
    }

    // For deletions, originalState is the state, newState is null
    const originalState = req.method === 'DELETE' ? (req.originalState || newState) : req.originalState;
    if (req.method === 'DELETE') {
      newState = null;
    }

    await logAuditEventWithDelta({
      userId: req.user?.id || null,
      action: action || `${req.method}_${resourceType}`,
      resourceType,
      resourceId: resourceId || newState?.id,
      originalState,
      newState,
      metadata: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: Date.now() - req.auditTimestamp
      },
      status: 'success',
      ipAddress,
      userAgent,
      sessionId: req.user?.sessionId || null,
      requestId: req.requestId
    });
  } catch (error) {
    console.error('Audit interceptor error:', error);
    // Don't throw - audit logging should not break the request
  }
};

/**
 * Audit middleware specifically for resource updates
 * Attach this to routes that modify specific resources
 * Usage: router.put('/:id', protect, auditResourceUpdate('expense'), updateHandler)
 */
export const auditResourceUpdate = (resourceType) => {
  return async (req, res, next) => {
    // Store metadata for later audit logging
    req.auditMetadata = {
      resourceType,
      resourceId: req.params.id,
      action: `${resourceType.toUpperCase()}_UPDATE`,
      originalState: req.body._originalState || null
    };

    delete req.body._originalState;
    next();
  };
};

/**
 * Audit middleware for bulk operations
 * Use for endpoints that perform batch operations
 */
export const auditBulkOperation = (resourceType, operationType = 'BULK_UPDATE') => {
  return async (req, res, next) => {
    req.auditMetadata = {
      resourceType,
      action: `${resourceType.toUpperCase()}_${operationType}`,
      bulkOperation: true,
      itemCount: Array.isArray(req.body) ? req.body.length : (req.body.items?.length || 0)
    };
    next();
  };
};

/**
 * Audit middleware for sensitive operations
 * Adds extra metadata for high-risk operations
 */
export const auditSensitiveOperation = (action) => {
  return async (req, res, next) => {
    const { ipAddress, userAgent } = getClientInfo(req);
    
    req.auditMetadata = {
      action,
      sensitive: true,
      ipAddress,
      userAgent,
      timestamp: new Date()
    };
    
    // Log attempt immediately (before operation)
    await logAuditEventWithDelta({
      userId: req.user?.id || null,
      action: action + '_ATTEMPT',
      resourceType: 'security',
      metadata: {
        path: req.path,
        method: req.method
      },
      status: 'info',
      ipAddress,
      userAgent,
      requestId: req.requestId || uuidv4()
    });
    
    next();
  };
};

/**
 * Middleware to attach request ID for audit correlation
 */
export const auditRequestIdMiddleware = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

export default {
  securityInterceptor,
  auditResourceUpdate,
  auditBulkOperation,
  auditSensitiveOperation,
  auditRequestIdMiddleware
};
