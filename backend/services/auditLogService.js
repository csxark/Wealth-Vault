import crypto from 'crypto';
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { auditLogs } from '../db/schema.js';
import { logger } from '../utils/logger.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'otp',
  'pin'
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const truncate = (value, maxLength = 4000) => {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated]` : text;
};

const sanitizeValue = (value, depth = 0) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 4) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    for (const [key, objectValue] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(objectValue, depth + 1);
      }
    }
    return sanitized;
  }

  if (typeof value === 'string') {
    return truncate(value, 500);
  }

  return value;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const getLogScopeFilter = (tenantId) => {
  if (tenantId) {
    return eq(auditLogs.tenantId, tenantId);
  }
  return isNull(auditLogs.tenantId);
};

const resolveBaseCategory = (action = '') => {
  if (action.startsWith('auth.')) return 'auth';
  if (action.startsWith('rbac.') || action.includes('permission') || action.includes('role')) return 'permission';
  if (action.startsWith('security.')) return 'security';
  if (action.startsWith('audit.')) return 'audit';
  if (action.includes('create') || action.includes('update') || action.includes('delete')) return 'data_change';
  return 'general';
};

const classifyAction = ({ method, path, statusCode }) => {
  const normalizedMethod = (method || 'GET').toUpperCase();
  const normalizedPath = String(path || '').toLowerCase();

  if (normalizedPath.includes('/auth/login')) {
    return {
      action: 'auth.login',
      category: 'auth'
    };
  }

  if (normalizedPath.includes('/auth/register')) {
    return {
      action: 'auth.register',
      category: 'auth'
    };
  }

  if (normalizedPath.includes('/auth/refresh')) {
    return {
      action: 'auth.token.refresh',
      category: 'auth'
    };
  }

  if (normalizedPath.includes('/auth/logout')) {
    return {
      action: 'auth.logout',
      category: 'auth'
    };
  }

  if (normalizedPath.includes('/rbac/') || normalizedPath.includes('/permissions') || normalizedPath.includes('/role')) {
    const op = normalizedMethod === 'POST' ? 'create' : normalizedMethod === 'DELETE' ? 'delete' : 'update';
    return {
      action: `rbac.${op}`,
      category: 'permission'
    };
  }

  const routeParts = normalizedPath.split('/').filter(Boolean);
  const apiIndex = routeParts.indexOf('api');
  const resource = apiIndex >= 0 ? routeParts[apiIndex + 1] : routeParts[0] || 'resource';

  if (statusCode === 401) {
    return {
      action: 'security.unauthorized',
      category: 'security'
    };
  }

  if (statusCode === 403) {
    return {
      action: 'security.forbidden',
      category: 'security'
    };
  }

  if (statusCode === 429) {
    return {
      action: 'security.rate_limited',
      category: 'security'
    };
  }

  const operationMap = {
    GET: 'read',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete'
  };

  return {
    action: `${resource}.${operationMap[normalizedMethod] || 'access'}`,
    category: operationMap[normalizedMethod] === 'read' ? 'general' : 'data_change'
  };
};

const shouldAuditRequest = ({ method, path, statusCode }) => {
  const normalizedMethod = (method || 'GET').toUpperCase();
  const normalizedPath = String(path || '').toLowerCase();

  if (normalizedPath.includes('/api/audit')) {
    return false;
  }

  if (normalizedPath.includes('/auth/')) {
    return true;
  }

  if ([401, 403, 429].includes(statusCode)) {
    return true;
  }

  return MUTATING_METHODS.has(normalizedMethod);
};

const computeEntryHash = ({ previousHash, payload }) => {
  const hash = crypto.createHash('sha256');
  hash.update(previousHash || 'ROOT');
  hash.update(stableStringify(payload));
  return hash.digest('hex');
};

const getPreviousHash = async (tenantId) => {
  const scopeFilter = getLogScopeFilter(tenantId || null);
  const [lastLog] = await db
    .select({ entryHash: auditLogs.entryHash })
    .from(auditLogs)
    .where(scopeFilter)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(1);

  return lastLog?.entryHash || null;
};

export const createAuditLog = async ({
  tenantId = null,
  actorUserId = null,
  action,
  category,
  resourceType = null,
  resourceId = null,
  method = null,
  path = null,
  statusCode = null,
  outcome = 'success',
  severity = 'low',
  ipAddress = null,
  userAgent = null,
  requestId = null,
  metadata = {},
  changes = {},
  skipSuspiciousCheck = false
}) => {
  const safeMetadata = sanitizeValue(metadata);
  const safeChanges = sanitizeValue(changes);

  const payload = {
    tenantId,
    actorUserId,
    action,
    category: category || resolveBaseCategory(action),
    resourceType,
    resourceId,
    method,
    path,
    statusCode,
    outcome,
    severity,
    ipAddress,
    userAgent: truncate(userAgent, 500),
    requestId,
    metadata: safeMetadata,
    changes: safeChanges
  };

  const previousHash = await getPreviousHash(tenantId || null);
  const entryHash = computeEntryHash({ previousHash, payload });

  const [saved] = await db
    .insert(auditLogs)
    .values({
      id: uuidv4(),
      ...payload,
      previousHash,
      entryHash
    })
    .returning();

  if (!skipSuspiciousCheck) {
    await detectSuspiciousActivity(saved);
  }

  return saved;
};

const detectSuspiciousActivity = async (entry) => {
  try {
    const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();

    if (entry.action === 'auth.login' && entry.outcome === 'failure' && entry.ipAddress) {
      const windowStart = new Date(createdAt.getTime() - 15 * 60 * 1000);
      const failedLogins = await db
        .select({ count: sql`count(*)` })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'auth.login'),
            eq(auditLogs.outcome, 'failure'),
            eq(auditLogs.ipAddress, entry.ipAddress),
            gte(auditLogs.createdAt, windowStart)
          )
        );

      const count = Number(failedLogins[0]?.count || 0);
      if (count >= 5) {
        const alertMessage = `Multiple failed login attempts detected from ${entry.ipAddress}`;
        await createAuditLog({
          tenantId: entry.tenantId,
          actorUserId: entry.actorUserId,
          action: 'security.alert.failed_logins',
          category: 'security',
          resourceType: 'auth',
          resourceId: entry.id,
          method: entry.method,
          path: entry.path,
          statusCode: 429,
          outcome: 'failure',
          severity: 'critical',
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          requestId: entry.requestId,
          metadata: {
            message: alertMessage,
            failedAttempts: count,
            windowMinutes: 15
          },
          changes: {},
          skipSuspiciousCheck: true
        });

        logger.warn(alertMessage, {
          ipAddress: entry.ipAddress,
          failedAttempts: count,
          requestId: entry.requestId
        });
      }
    }

    if (entry.action === 'security.forbidden' && entry.ipAddress) {
      const windowStart = new Date(createdAt.getTime() - 10 * 60 * 1000);
      const forbiddenCountResult = await db
        .select({ count: sql`count(*)` })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'security.forbidden'),
            eq(auditLogs.ipAddress, entry.ipAddress),
            gte(auditLogs.createdAt, windowStart)
          )
        );

      const forbiddenCount = Number(forbiddenCountResult[0]?.count || 0);
      if (forbiddenCount >= 4) {
        const alertMessage = `Repeated forbidden access attempts detected from ${entry.ipAddress}`;
        await createAuditLog({
          tenantId: entry.tenantId,
          actorUserId: entry.actorUserId,
          action: 'security.alert.forbidden_access',
          category: 'security',
          resourceType: 'authorization',
          resourceId: entry.id,
          method: entry.method,
          path: entry.path,
          statusCode: 403,
          outcome: 'failure',
          severity: 'high',
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          requestId: entry.requestId,
          metadata: {
            message: alertMessage,
            forbiddenAttempts: forbiddenCount,
            windowMinutes: 10
          },
          changes: {},
          skipSuspiciousCheck: true
        });

        logger.warn(alertMessage, {
          ipAddress: entry.ipAddress,
          forbiddenAttempts: forbiddenCount,
          requestId: entry.requestId
        });
      }
    }
  } catch (error) {
    logger.error('Audit suspicious activity detection failed', error);
  }
};

export const createAuditLogFromRequest = async (req, res) => {
  const method = req.method;
  const path = req.originalUrl;
  const statusCode = res.statusCode;

  if (!shouldAuditRequest({ method, path, statusCode })) {
    return null;
  }

  const { action, category } = classifyAction({ method, path, statusCode });
  const outcome = statusCode >= 400 ? 'failure' : 'success';

  const tenantId = req.params?.tenantId || req.query?.tenantId || req.headers['x-tenant-id'] || req.body?.tenantId || null;
  const actorUserId = req.user?.id || null;

  const severity = statusCode >= 500
    ? 'high'
    : [401, 403, 429].includes(statusCode)
      ? 'medium'
      : category === 'permission'
        ? 'high'
        : 'low';

  const routeParts = String(path || '').split('?')[0].split('/').filter(Boolean);
  const apiIndex = routeParts.indexOf('api');
  const resourceType = apiIndex >= 0 ? routeParts[apiIndex + 1] || null : routeParts[0] || null;
  const resourceId = routeParts[apiIndex >= 0 ? apiIndex + 2 : 1] || null;

  return createAuditLog({
    tenantId,
    actorUserId,
    action,
    category,
    resourceType,
    resourceId,
    method,
    path,
    statusCode,
    outcome,
    severity,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent') || null,
    requestId: req.requestId || null,
    metadata: {
      query: sanitizeValue(req.query || {}),
      params: sanitizeValue(req.params || {}),
      responseTimeMs: req.auditContext?.responseTimeMs || null
    },
    changes: {
      body: sanitizeValue(req.body || {})
    }
  });
};

export const searchAuditLogs = async ({
  tenantId,
  actorUserId,
  action,
  category,
  outcome,
  severity,
  method,
  statusCode,
  from,
  to,
  q,
  page = 1,
  limit = 50
}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  if (tenantId) {
    conditions.push(eq(auditLogs.tenantId, tenantId));
  }
  if (actorUserId) {
    conditions.push(eq(auditLogs.actorUserId, actorUserId));
  }
  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }
  if (category) {
    conditions.push(eq(auditLogs.category, category));
  }
  if (outcome) {
    conditions.push(eq(auditLogs.outcome, outcome));
  }
  if (severity) {
    conditions.push(eq(auditLogs.severity, severity));
  }
  if (method) {
    conditions.push(eq(auditLogs.method, method.toUpperCase()));
  }
  if (statusCode) {
    conditions.push(eq(auditLogs.statusCode, Number(statusCode)));
  }
  if (from) {
    conditions.push(gte(auditLogs.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(auditLogs.createdAt, new Date(to)));
  }
  if (q) {
    conditions.push(
      or(
        ilike(auditLogs.action, `%${q}%`),
        ilike(auditLogs.path, `%${q}%`),
        ilike(auditLogs.resourceType, `%${q}%`),
        ilike(auditLogs.resourceId, `%${q}%`)
      )
    );
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rowsQuery = db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limitNum)
    .offset(offset);

  const countQuery = db
    .select({ count: sql`count(*)` })
    .from(auditLogs);

  if (whereClause) {
    rowsQuery.where(whereClause);
    countQuery.where(whereClause);
  }

  const [rows, totalResult] = await Promise.all([rowsQuery, countQuery]);

  const total = Number(totalResult[0]?.count || 0);

  return {
    items: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum))
    }
  };
};

export const exportAuditLogsAsCsv = async (filters = {}) => {
  const { items } = await searchAuditLogs({ ...filters, page: 1, limit: 2000 });

  const headers = [
    'id',
    'tenantId',
    'actorUserId',
    'action',
    'category',
    'resourceType',
    'resourceId',
    'method',
    'path',
    'statusCode',
    'outcome',
    'severity',
    'ipAddress',
    'requestId',
    'createdAt',
    'entryHash',
    'previousHash'
  ];

  const escapeCell = (value) => {
    const serialized = value === null || value === undefined ? '' : String(value).replaceAll('"', '""');
    return `"${serialized}"`;
  };

  const lines = [headers.join(',')];
  for (const row of items) {
    lines.push([
      row.id,
      row.tenantId,
      row.actorUserId,
      row.action,
      row.category,
      row.resourceType,
      row.resourceId,
      row.method,
      row.path,
      row.statusCode,
      row.outcome,
      row.severity,
      row.ipAddress,
      row.requestId,
      row.createdAt,
      row.entryHash,
      row.previousHash
    ].map(escapeCell).join(','));
  }

  return lines.join('\n');
};

export const getSecurityAlerts = async ({ tenantId, from, to, page = 1, limit = 50 }) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(auditLogs.category, 'security')];

  if (tenantId) {
    conditions.push(eq(auditLogs.tenantId, tenantId));
  }
  if (from) {
    conditions.push(gte(auditLogs.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(auditLogs.createdAt, new Date(to)));
  }

  const alertCondition = or(
    inArray(auditLogs.severity, ['high', 'critical']),
    ilike(auditLogs.action, 'security.alert%')
  );

  const whereClause = and(...conditions, alertCondition);

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ count: sql`count(*)` })
      .from(auditLogs)
      .where(whereClause)
  ]);

  const total = Number(totalResult[0]?.count || 0);

  return {
    items: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum))
    }
  };
};

export const verifyAuditLogIntegrity = async ({ tenantId = null, limit = 1000 }) => {
  const logs = await db
    .select()
    .from(auditLogs)
    .where(getLogScopeFilter(tenantId))
    .orderBy(auditLogs.createdAt, auditLogs.id)
    .limit(Math.min(5000, Math.max(1, Number(limit) || 1000)));

  const violations = [];
  let expectedPreviousHash = null;

  for (const logEntry of logs) {
    const payload = {
      tenantId: logEntry.tenantId,
      actorUserId: logEntry.actorUserId,
      action: logEntry.action,
      category: logEntry.category,
      resourceType: logEntry.resourceType,
      resourceId: logEntry.resourceId,
      method: logEntry.method,
      path: logEntry.path,
      statusCode: logEntry.statusCode,
      outcome: logEntry.outcome,
      severity: logEntry.severity,
      ipAddress: logEntry.ipAddress,
      userAgent: logEntry.userAgent,
      requestId: logEntry.requestId,
      metadata: logEntry.metadata,
      changes: logEntry.changes
    };

    const computedHash = computeEntryHash({
      previousHash: logEntry.previousHash,
      payload
    });

    if (logEntry.previousHash !== expectedPreviousHash) {
      violations.push({
        id: logEntry.id,
        type: 'CHAIN_BREAK',
        message: 'previous_hash does not match expected chain value'
      });
    }

    if (computedHash !== logEntry.entryHash) {
      violations.push({
        id: logEntry.id,
        type: 'HASH_MISMATCH',
        message: 'entry hash verification failed'
      });
    }

    expectedPreviousHash = logEntry.entryHash;
  }

  return {
    ok: violations.length === 0,
    checked: logs.length,
    violations
  };
};

export default {
  createAuditLog,
  createAuditLogFromRequest,
  searchAuditLogs,
  exportAuditLogsAsCsv,
  getSecurityAlerts,
  verifyAuditLogIntegrity
};