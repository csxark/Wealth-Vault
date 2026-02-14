import db from '../config/db.js';
import { auditLogs, stateDeltas, auditSnapshots } from '../db/schema.js';
import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';

// Audit Action Types
export const AuditActions = {
  // Authentication
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_LOGOUT_ALL: 'AUTH_LOGOUT_ALL',
  AUTH_REGISTER: 'AUTH_REGISTER',
  AUTH_PASSWORD_CHANGE: 'AUTH_PASSWORD_CHANGE',
  AUTH_TOKEN_REFRESH: 'AUTH_TOKEN_REFRESH',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',

  // User Profile
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  PROFILE_PICTURE_UPLOAD: 'PROFILE_PICTURE_UPLOAD',
  PROFILE_PICTURE_DELETE: 'PROFILE_PICTURE_DELETE',
  ACCOUNT_DEACTIVATE: 'ACCOUNT_DEACTIVATE',

  // Expenses
  EXPENSE_CREATE: 'EXPENSE_CREATE',
  EXPENSE_UPDATE: 'EXPENSE_UPDATE',
  EXPENSE_DELETE: 'EXPENSE_DELETE',
  EXPENSE_IMPORT: 'EXPENSE_IMPORT',

  // Goals
  GOAL_CREATE: 'GOAL_CREATE',
  GOAL_UPDATE: 'GOAL_UPDATE',
  GOAL_DELETE: 'GOAL_DELETE',

  // Categories
  CATEGORY_CREATE: 'CATEGORY_CREATE',
  CATEGORY_UPDATE: 'CATEGORY_UPDATE',
  CATEGORY_DELETE: 'CATEGORY_DELETE',

  // Investments
  INVESTMENT_CREATE: 'INVESTMENT_CREATE',
  INVESTMENT_UPDATE: 'INVESTMENT_UPDATE',
  INVESTMENT_DELETE: 'INVESTMENT_DELETE',

  // Assets
  ASSET_CREATE: 'ASSET_CREATE',
  ASSET_UPDATE: 'ASSET_UPDATE',
  ASSET_DELETE: 'ASSET_DELETE',

  // Budgets & Forecasts
  BUDGET_UPDATE: 'BUDGET_UPDATE',
  FORECAST_CREATE: 'FORECAST_CREATE',
  FORECAST_DELETE: 'FORECAST_DELETE',
  SUCCESSION_TRIGGER: 'SUCCESSION_TRIGGER',
  SUCCESSION_EXECUTE: 'SUCCESSION_EXECUTE',
  MONTE_CARLO_SIMULATION: 'MONTE_CARLO_SIMULATION',
  RISK_REBALANCED: 'RISK_REBALANCED',
  ENTITY_CREATE: 'ENTITY_CREATE',
  INTER_COMPANY_TRANSFER: 'INTER_COMPANY_TRANSFER',
  COST_BASIS_ADJUSTMENT: 'COST_BASIS_ADJUSTMENT',
  TAX_HARVEST_DETECTED: 'TAX_HARVEST_DETECTED',
  ANOMALY_DETECTED: 'ANOMALY_DETECTED',
  CIRCUIT_BREAKER_TRIPPED: 'CIRCUIT_BREAKER_TRIPPED',
  RISK_PROFILE_UPDATED: 'RISK_PROFILE_UPDATED',
};

// Resource Types
export const ResourceTypes = {
  USER: 'user',
  EXPENSE: 'expense',
  GOAL: 'goal',
  CATEGORY: 'category',
  SESSION: 'session',
  INVESTMENT: 'investment',
  ASSET: 'asset',
  PORTFOLIO: 'portfolio',
  BUDGET: 'budget',
  FORECAST: 'forecast',
  REPLAY: 'replay',
  FORENSIC: 'forensic',
  SUCCESSION: 'succession',
  ENTITY: 'entity'
};

/**
 * Log an audit event asynchronously
 * @param {Object} params - Audit log parameters
 * @param {string} params.userId - User ID (can be null for failed auth attempts)
 * @param {string} params.action - Action type from AuditActions
 * @param {string} params.resourceType - Resource type from ResourceTypes
 * @param {string} params.resourceId - ID of the affected resource
 * @param {Object} params.metadata - Additional metadata (oldValue, newValue, etc.)
 * @param {string} params.status - 'success' or 'failure'
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - Client user agent
 */
export const logAuditEvent = async ({
  userId = null,
  action,
  resourceType = null,
  resourceId = null,
  metadata = {},
  status = 'success',
  ipAddress = null,
  userAgent = null,
}) => {
  try {
    // Perform async insert without blocking the main request
    await db.insert(auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId,
      metadata,
      status,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break main flow
    console.error('Audit logging failed:', error);
  }
};

/**
 * Convenience wrapper for logging from middleware
 * @param {Object} req - Express request
 * @param {Object} params - Audit parameters
 */
export const logAudit = async (req, params) => {
  const clientInfo = getClientInfo(req);
  return logAuditEvent({
    ...params,
    userId: params.userId || req.user?.id,
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
    requestId: req.id || req.headers['x-request-id']
  });
};

/**
 * Log a state change delta for deterministic replay
 * @param {Object} params - State delta parameters
 */
export const logStateDelta = async ({
  userId,
  resourceType,
  resourceId,
  operation,
  beforeState,
  afterState,
  triggeredBy = 'user_action',
  req = null
}) => {
  try {
    const changedFields = operation === 'UPDATE'
      ? Object.keys(afterState).filter(key => JSON.stringify(beforeState[key]) !== JSON.stringify(afterState[key]))
      : [];

    const checksum = crypto.createHash('sha256')
      .update(JSON.stringify(afterState || {}))
      .digest('hex');

    const clientInfo = req ? getClientInfo(req) : {};

    await db.insert(stateDeltas).values({
      userId,
      resourceType,
      resourceId,
      operation,
      beforeState,
      afterState,
      changedFields,
      triggeredBy,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      requestId: req?.id || req?.headers?.['x-request-id'],
      checksum,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('State delta tracking failed:', error);
  }
};

/**
 * Log audit event without waiting (fire and forget)
 * Use this for non-critical audit logs where you don't want to block
 */
export const logAuditEventAsync = (params) => {
  // Fire and forget - don't await
  logAuditEvent(params).catch((error) => {
    console.error('Async audit logging failed:', error);
  });
};

/**
 * Get audit trail for a specific user with pagination
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.limit - Items per page
 * @param {string} options.action - Filter by specific action
 * @param {Date} options.startDate - Filter from date
 * @param {Date} options.endDate - Filter to date
 * @returns {Promise<Object>} Paginated audit logs
 */
export const getUserAuditTrail = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    action = null,
    startDate = null,
    endDate = null,
  } = options;

  const offset = (page - 1) * limit;
  const conditions = [eq(auditLogs.userId, userId)];

  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }

  if (startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
  }

  if (endDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
  }

  const [logs, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql`count(*)` })
      .from(auditLogs)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
};

/**
 * Get recent security events for a user (login, logout, password changes)
 * @param {string} userId - User ID
 * @param {number} limit - Number of events to return
 * @returns {Promise<Array>} Recent security events
 */
export const getRecentSecurityEvents = async (userId, limit = 10) => {
  const securityActions = [
    AuditActions.AUTH_LOGIN,
    AuditActions.AUTH_LOGIN_FAILED,
    AuditActions.AUTH_LOGOUT,
    AuditActions.AUTH_LOGOUT_ALL,
    AuditActions.AUTH_PASSWORD_CHANGE,
    AuditActions.AUTH_SESSION_REVOKED,
  ];

  const logs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.userId, userId),
        sql`${auditLogs.action} = ANY(${securityActions})`
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return logs;
};

/**
 * Clean up old audit logs (for maintenance)
 * @param {number} daysToKeep - Number of days to keep logs
 * @returns {Promise<number>} Number of deleted records
 */
export const cleanupOldAuditLogs = async (daysToKeep = 90) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await db
    .delete(auditLogs)
    .where(lte(auditLogs.createdAt, cutoffDate));

  return result.rowCount || 0;
};

/**
 * Helper to extract client info from request
 * @param {Object} req - Express request object
 * @returns {Object} Client info
 */
export const getClientInfo = (req) => {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
  };
};

/**
 * Calculate delta (differences) between original and new state
 * @param {Object} originalState - Original state before change
 * @param {Object} newState - New state after change
 * @returns {Object} Delta object with changes
 */
export const calculateDelta = (originalState, newState) => {
  const delta = {
    added: {},
    modified: {},
    removed: {}
  };

  if (!originalState) {
    return { added: newState || {}, modified: {}, removed: {} };
  }

  if (!newState) {
    return { added: {}, modified: {}, removed: originalState || {} };
  }

  // Find modified and removed keys
  for (const key in originalState) {
    if (!(key in newState)) {
      delta.removed[key] = originalState[key];
    } else if (JSON.stringify(originalState[key]) !== JSON.stringify(newState[key])) {
      delta.modified[key] = {
        from: originalState[key],
        to: newState[key]
      };
    }
  }

  // Find added keys
  for (const key in newState) {
    if (!(key in originalState)) {
      delta.added[key] = newState[key];
    }
  }

  return delta;
};

/**
 * Create cryptographic hash of delta for integrity verification
 * @param {Object} delta - Delta object
 * @returns {string} SHA-256 hash
 */
export const hashDelta = (delta) => {
  const deltaString = JSON.stringify(delta, Object.keys(delta).sort());
  return crypto.createHash('sha256').update(deltaString).digest('hex');
};

/**
 * Log audit event with delta tracking and cryptographic hash
 * Enhanced version with state tracking
 * @param {Object} params - Enhanced audit log parameters
 */
export const logAuditEventWithDelta = async ({
  userId = null,
  action,
  resourceType = null,
  resourceId = null,
  originalState = null,
  newState = null,
  metadata = {},
  status = 'success',
  ipAddress = null,
  userAgent = null,
  sessionId = null,
  requestId = null,
}) => {
  try {
    const delta = calculateDelta(originalState, newState);
    const deltaHash = hashDelta(delta);

    await db.insert(auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId,
      originalState,
      newState,
      delta,
      deltaHash,
      metadata,
      status,
      ipAddress,
      userAgent,
      sessionId,
      requestId,
      performedAt: new Date(),
    });
  } catch (error) {
    console.error('Enhanced audit logging failed:', error);
  }
};

/**
 * Bulk log multiple audit events (optimized for batch operations)
 * @param {Array} events - Array of audit event objects
 * @returns {Promise<number>} Number of events logged
 */
export const bulkLogAuditEvents = async (events) => {
  try {
    const preparedEvents = events.map(event => {
      const delta = calculateDelta(event.originalState, event.newState);
      const deltaHash = hashDelta(delta);

      return {
        userId: event.userId || null,
        action: event.action,
        resourceType: event.resourceType || null,
        resourceId: event.resourceId || null,
        originalState: event.originalState || null,
        newState: event.newState || null,
        delta,
        deltaHash,
        metadata: event.metadata || {},
        status: event.status || 'success',
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        sessionId: event.sessionId || null,
        requestId: event.requestId || null,
        performedAt: new Date(),
      };
    });

    await db.insert(auditLogs).values(preparedEvents);
    return preparedEvents.length;
  } catch (error) {
    console.error('Bulk audit logging failed:', error);
    return 0;
  }
};

/**
 * Detect suspicious activity patterns
 * @param {string} userId - User ID to check
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} Suspicious activity report
 */
export const detectSuspiciousActivity = async (userId, options = {}) => {
  const {
    timeWindowMinutes = 5,
    deleteThreshold = 5,
    failedAuthThreshold = 3,
    bulkUpdateThreshold = 10,
  } = options;

  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - timeWindowMinutes);

  const recentLogs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.userId, userId),
        gte(auditLogs.performedAt, cutoffTime)
      )
    )
    .orderBy(desc(auditLogs.performedAt));

  const alerts = [];

  // Check for excessive deletions
  const deleteActions = recentLogs.filter(log =>
    log.action.includes('DELETE')
  );
  if (deleteActions.length >= deleteThreshold) {
    alerts.push({
      type: 'EXCESSIVE_DELETIONS',
      severity: 'high',
      count: deleteActions.length,
      threshold: deleteThreshold,
      timeWindow: timeWindowMinutes,
      message: `${deleteActions.length} delete operations in ${timeWindowMinutes} minutes`,
      logs: deleteActions
    });
  }

  // Check for failed authentication attempts
  const failedAuthActions = recentLogs.filter(log =>
    log.action === AuditActions.AUTH_LOGIN_FAILED
  );
  if (failedAuthActions.length >= failedAuthThreshold) {
    alerts.push({
      type: 'FAILED_AUTH_ATTEMPTS',
      severity: 'critical',
      count: failedAuthActions.length,
      threshold: failedAuthThreshold,
      timeWindow: timeWindowMinutes,
      message: `${failedAuthActions.length} failed login attempts in ${timeWindowMinutes} minutes`,
      logs: failedAuthActions
    });
  }

  // Check for bulk updates
  const updateActions = recentLogs.filter(log =>
    log.action.includes('UPDATE')
  );
  if (updateActions.length >= bulkUpdateThreshold) {
    alerts.push({
      type: 'BULK_UPDATES',
      severity: 'medium',
      count: updateActions.length,
      threshold: bulkUpdateThreshold,
      timeWindow: timeWindowMinutes,
      message: `${updateActions.length} update operations in ${timeWindowMinutes} minutes`,
      logs: updateActions
    });
  }

  // Check for actions from multiple IP addresses
  const uniqueIPs = new Set(recentLogs.map(log => log.ipAddress).filter(Boolean));
  if (uniqueIPs.size >= 3) {
    alerts.push({
      type: 'MULTIPLE_IP_ADDRESSES',
      severity: 'high',
      count: uniqueIPs.size,
      threshold: 3,
      timeWindow: timeWindowMinutes,
      message: `Activity from ${uniqueIPs.size} different IP addresses in ${timeWindowMinutes} minutes`,
      ipAddresses: Array.from(uniqueIPs)
    });
  }

  // Check for rapid resource access pattern (potential scraping)
  const resourceAccess = {};
  recentLogs.forEach(log => {
    if (log.resourceId) {
      resourceAccess[log.resourceId] = (resourceAccess[log.resourceId] || 0) + 1;
    }
  });

  const rapidAccessResources = Object.entries(resourceAccess)
    .filter(([_, count]) => count >= 5)
    .map(([resourceId, count]) => ({ resourceId, count }));

  if (rapidAccessResources.length > 0) {
    alerts.push({
      type: 'RAPID_RESOURCE_ACCESS',
      severity: 'medium',
      count: rapidAccessResources.length,
      message: `Rapid access to ${rapidAccessResources.length} resources`,
      resources: rapidAccessResources
    });
  }

  return {
    userId,
    timeWindow: timeWindowMinutes,
    totalActions: recentLogs.length,
    hasSuspiciousActivity: alerts.length > 0,
    alerts,
    analyzedAt: new Date()
  };
};

/**
 * Get comprehensive audit analytics for a time period
 * @param {Object} options - Analytics options
 * @returns {Promise<Object>} Analytics data
 */
export const getAuditAnalytics = async (options = {}) => {
  const {
    startDate = null,
    endDate = null,
    userId = null,
    resourceType = null
  } = options;

  const conditions = [];

  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
  if (startDate) conditions.push(gte(auditLogs.performedAt, new Date(startDate)));
  if (endDate) conditions.push(lte(auditLogs.performedAt, new Date(endDate)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, actionCounts, statusCounts] = await Promise.all([
    // Get all logs
    db.select().from(auditLogs).where(whereClause),

    // Count by action
    db
      .select({
        action: auditLogs.action,
        count: sql`count(*)`
      })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(auditLogs.action),

    // Count by status
    db
      .select({
        status: auditLogs.status,
        count: sql`count(*)`
      })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(auditLogs.status),
  ]);

  // Calculate statistics
  const uniqueUsers = new Set(logs.map(log => log.userId).filter(Boolean)).size;
  const uniqueIPs = new Set(logs.map(log => log.ipAddress).filter(Boolean)).size;

  const hourlyDistribution = {};
  logs.forEach(log => {
    const hour = new Date(log.performedAt).getHours();
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
  });

  return {
    totalEvents: logs.length,
    uniqueUsers,
    uniqueIPs,
    actionDistribution: Object.fromEntries(
      actionCounts.map(({ action, count }) => [action, Number(count)])
    ),
    statusDistribution: Object.fromEntries(
      statusCounts.map(({ status, count }) => [status, Number(count)])
    ),
    hourlyDistribution,
    period: {
      start: startDate || 'beginning',
      end: endDate || 'now'
    },
    generatedAt: new Date()
  };
};

/**
 * Verify delta hash integrity
 * @param {string} auditLogId - Audit log ID
 * @returns {Promise<Object>} Verification result
 */
export const verifyDeltaIntegrity = async (auditLogId) => {
  const [log] = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.id, auditLogId))
    .limit(1);

  if (!log) {
    return { valid: false, error: 'Audit log not found' };
  }

  if (!log.delta || !log.deltaHash) {
    return { valid: true, message: 'No delta to verify' };
  }

  const computedHash = hashDelta(log.delta);
  const isValid = computedHash === log.deltaHash;

  return {
    valid: isValid,
    storedHash: log.deltaHash,
    computedHash,
    message: isValid ? 'Delta integrity verified' : 'Delta hash mismatch - possible tampering',
    auditLogId,
    performedAt: log.performedAt
  };
};

/**
 * Get audit logs for specific resource
 * @param {string} resourceType - Resource type
 * @param {string} resourceId - Resource ID  
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Audit logs for resource
 */
export const getResourceAuditHistory = async (resourceType, resourceId, options = {}) => {
  const { limit = 50, includeDeltas = true } = options;

  const logs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.resourceType, resourceType),
        eq(auditLogs.resourceId, resourceId)
      )
    )
    .orderBy(desc(auditLogs.performedAt))
    .limit(limit);

  if (!includeDeltas) {
    return logs.map(log => ({
      ...log,
      originalState: undefined,
      newState: undefined,
      delta: undefined
    }));
  }

  return logs;
};

export default {
  AuditActions,
  ResourceTypes,
  logAuditEvent,
  logAuditEventAsync,
  logAuditEventWithDelta,
  bulkLogAuditEvents,
  getUserAuditTrail,
  getRecentSecurityEvents,
  cleanupOldAuditLogs,
  getClientInfo,
  calculateDelta,
  hashDelta,
  detectSuspiciousActivity,
  getAuditAnalytics,
  verifyDeltaIntegrity,
  getResourceAuditHistory,
  logAudit,
  logStateDelta,
};
