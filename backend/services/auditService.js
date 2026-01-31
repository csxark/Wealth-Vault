import db from '../config/db.js';
import { auditLogs } from '../db/schema.js';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

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
};

// Resource Types
export const ResourceTypes = {
  USER: 'user',
  EXPENSE: 'expense',
  GOAL: 'goal',
  CATEGORY: 'category',
  SESSION: 'session',
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

export default {
  AuditActions,
  ResourceTypes,
  logAuditEvent,
  logAuditEventAsync,
  getUserAuditTrail,
  getRecentSecurityEvents,
  cleanupOldAuditLogs,
  getClientInfo,
};
