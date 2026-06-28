import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { auditLogs, outboxEvents, tenants } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import { createAuditLog } from './auditLogService.js';

const DEFAULT_HOME_REGION = process.env.APP_REGION || 'us-east-1';

const REGION_METRICS = {
  routedToHomeRegion: 0,
  regionMismatches: 0,
  residencyBlocks: 0,
  regionValidationFailures: 0,
  geoFenceBlocks: 0,
  crossRegionAuditEvents: 0,
  replicationQueued: 0,
  replicationSkipped: 0
};

const isTruthy = (value) => String(value).toLowerCase() === 'true';

export const validateRegionAccess = ({
  tenant,
  method,
  path,
  requestRegion,
  dataClass = 'operational',
  userRegion = null,
  strictMode = true,
  enforceGeoFence = isTruthy(process.env.ENABLE_GEO_FENCE_CHECKS || 'false')
}) => {
  const decision = buildRoutingDecision({ tenant, requestRegion, method });
  const normalizedDataClass = String(dataClass || 'operational').toLowerCase();

  if (!decision.allow && strictMode) {
    REGION_METRICS.residencyBlocks += 1;
    REGION_METRICS.regionValidationFailures += 1;
    return {
      ok: false,
      code: 'REGION_POLICY_BLOCKED',
      message: 'Cross-region request blocked by residency policy',
      decision,
      dataClass: normalizedDataClass,
      geoFence: { enforced: enforceGeoFence, passed: true }
    };
  }

  if (
    decision.requestRegion !== decision.homeRegion &&
    isDataClassRestricted(tenant, normalizedDataClass)
  ) {
    REGION_METRICS.residencyBlocks += 1;
    REGION_METRICS.regionValidationFailures += 1;
    return {
      ok: false,
      code: 'RESIDENCY_DATA_BLOCKED',
      message: 'Residency-restricted data must remain in tenant home region',
      decision,
      dataClass: normalizedDataClass,
      geoFence: { enforced: enforceGeoFence, passed: true }
    };
  }

  if (enforceGeoFence && userRegion && userRegion !== decision.homeRegion) {
    REGION_METRICS.geoFenceBlocks += 1;
    REGION_METRICS.regionValidationFailures += 1;
    return {
      ok: false,
      code: 'GEOFENCE_REGION_MISMATCH',
      message: 'User location does not match tenant data residency region',
      decision,
      dataClass: normalizedDataClass,
      geoFence: {
        enforced: true,
        passed: false,
        userRegion,
        expectedRegion: decision.homeRegion
      }
    };
  }

  return {
    ok: true,
    code: 'REGION_VALIDATION_PASSED',
    message: 'Region validation passed',
    decision,
    dataClass: normalizedDataClass,
    geoFence: {
      enforced: enforceGeoFence,
      passed: true,
      userRegion: userRegion || null,
      expectedRegion: decision.homeRegion
    }
  };
};

export const logRegionComplianceEvent = async ({
  req,
  validation,
  statusCode,
  outcome = 'failure',
  extraMetadata = {}
}) => {
  if (!req?.tenant?.id || !validation?.decision) {
    return null;
  }

  REGION_METRICS.crossRegionAuditEvents += 1;

  return createAuditLog({
    tenantId: req.tenant.id,
    actorUserId: req.user?.id || null,
    action: `compliance.region.${String(validation.code || 'event').toLowerCase()}`,
    category: 'security',
    resourceType: 'tenant_region_policy',
    resourceId: req.tenant.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    outcome,
    severity: outcome === 'failure' ? 'high' : 'low',
    ipAddress: req.ip,
    userAgent: req.get?.('User-Agent') || req.headers?.['user-agent'] || null,
    requestId: req.requestId || null,
    metadata: {
      homeRegion: validation.decision.homeRegion,
      requestRegion: validation.decision.requestRegion,
      reason: validation.decision.reason,
      dataClass: validation.dataClass,
      geoFence: validation.geoFence,
      regionRouting: req.regionRouting || null,
      ...extraMetadata
    },
    changes: {}
  });
};

export const getDefaultResidencyPolicy = (homeRegion = DEFAULT_HOME_REGION) => ({
  mode: 'strict',
  homeRegion,
  restrictedDataClasses: ['pii', 'financial', 'compliance'],
  allowedReplicationClasses: ['operational', 'analytics', 'audit-summary'],
  dr: {
    enabled: true,
    targetRegions: [],
    rpoMinutes: Number(process.env.DEFAULT_DR_RPO_MINUTES || 15),
    rtoMinutes: Number(process.env.DEFAULT_DR_RTO_MINUTES || 60)
  }
});

export const extractTenantRegionConfig = (tenant) => {
  const settings = tenant?.settings || {};
  const multiRegion = settings.multiRegion || {};
  const residencyPolicy = multiRegion.residencyPolicy || getDefaultResidencyPolicy();
  const homeRegion = multiRegion.homeRegion || residencyPolicy.homeRegion || DEFAULT_HOME_REGION;

  return {
    homeRegion,
    residencyPolicy: {
      ...getDefaultResidencyPolicy(homeRegion),
      ...residencyPolicy,
      homeRegion
    }
  };
};

export const buildRoutingDecision = ({ tenant, requestRegion, method }) => {
  const { homeRegion, residencyPolicy } = extractTenantRegionConfig(tenant);
  const normalizedRequestRegion = requestRegion || process.env.APP_REGION || homeRegion;
  const isHomeRegion = normalizedRequestRegion === homeRegion;
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || 'GET').toUpperCase());

  if (isHomeRegion) {
    REGION_METRICS.routedToHomeRegion += 1;
    return {
      allow: true,
      routeToHomeRegion: false,
      reason: 'request_in_home_region',
      homeRegion,
      requestRegion: normalizedRequestRegion,
      residencyMode: residencyPolicy.mode
    };
  }

  REGION_METRICS.regionMismatches += 1;

  if (isWrite || residencyPolicy.mode === 'strict') {
    return {
      allow: false,
      routeToHomeRegion: true,
      reason: isWrite ? 'cross_region_writes_blocked' : 'strict_residency_read_blocked',
      homeRegion,
      requestRegion: normalizedRequestRegion,
      residencyMode: residencyPolicy.mode
    };
  }

  return {
    allow: true,
    routeToHomeRegion: false,
    reason: 'permissive_cross_region_read_allowed',
    homeRegion,
    requestRegion: normalizedRequestRegion,
    residencyMode: residencyPolicy.mode
  };
};

export const isDataClassRestricted = (tenant, dataClass = 'operational') => {
  const { residencyPolicy } = extractTenantRegionConfig(tenant);
  const restricted = residencyPolicy.restrictedDataClasses || [];
  return restricted.includes(dataClass);
};

export const canReplicateDataClass = (tenant, dataClass = 'operational') => {
  const { residencyPolicy } = extractTenantRegionConfig(tenant);
  const allowed = residencyPolicy.allowedReplicationClasses || [];
  return allowed.includes(dataClass);
};

export const queueCrossRegionReplication = async ({
  tenant,
  aggregateType,
  aggregateId,
  eventType,
  payload,
  dataClass = 'operational',
  sourceRegion = process.env.APP_REGION || DEFAULT_HOME_REGION,
  metadata = {}
}) => {
  const { homeRegion, residencyPolicy } = extractTenantRegionConfig(tenant);

  if (!residencyPolicy.dr?.enabled) {
    REGION_METRICS.replicationSkipped += 1;
    return { queued: false, reason: 'dr_disabled' };
  }

  if (!canReplicateDataClass(tenant, dataClass)) {
    REGION_METRICS.replicationSkipped += 1;
    return { queued: false, reason: 'data_class_not_allowed' };
  }

  const targetRegions = (residencyPolicy.dr?.targetRegions || []).filter(
    (region) => region && region !== sourceRegion
  );

  if (targetRegions.length === 0) {
    REGION_METRICS.replicationSkipped += 1;
    return { queued: false, reason: 'no_target_regions' };
  }

  const values = targetRegions.map((targetRegion) => ({
    id: uuidv4(),
    tenantId: tenant.id,
    aggregateType,
    aggregateId,
    eventType: `replication.${eventType}`,
    payload: {
      ...payload,
      dataClass,
      sourceRegion,
      targetRegion,
      homeRegion
    },
    metadata: {
      ...metadata,
      replication: true,
      residencyMode: residencyPolicy.mode,
      queuedAt: new Date().toISOString()
    },
    status: 'pending',
    retryCount: 0,
    maxRetries: 3
  }));

  await db.insert(outboxEvents).values(values);
  REGION_METRICS.replicationQueued += values.length;

  return {
    queued: true,
    count: values.length,
    targetRegions
  };
};

export const updateTenantResidencyPolicy = async ({
  tenantId,
  homeRegion,
  residencyPolicy = {},
  actorUserId = null
}) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const existingSettings = tenant.settings || {};
  const existingConfig = extractTenantRegionConfig(tenant);
  const finalHomeRegion = homeRegion || existingConfig.homeRegion;

  const mergedPolicy = {
    ...getDefaultResidencyPolicy(finalHomeRegion),
    ...existingConfig.residencyPolicy,
    ...residencyPolicy,
    homeRegion: finalHomeRegion,
    dr: {
      ...getDefaultResidencyPolicy(finalHomeRegion).dr,
      ...(existingConfig.residencyPolicy?.dr || {}),
      ...(residencyPolicy?.dr || {})
    }
  };

  const nextSettings = {
    ...existingSettings,
    multiRegion: {
      ...(existingSettings.multiRegion || {}),
      enabled: true,
      homeRegion: finalHomeRegion,
      residencyPolicy: mergedPolicy,
      updatedAt: new Date().toISOString(),
      updatedBy: actorUserId
    }
  };

  const [updatedTenant] = await db
    .update(tenants)
    .set({
      settings: nextSettings,
      updatedAt: new Date()
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  await db.insert(outboxEvents).values({
    id: uuidv4(),
    tenantId,
    aggregateType: 'tenant',
    aggregateId: tenantId,
    eventType: 'tenant.region_policy.updated',
    payload: {
      tenantId,
      homeRegion: finalHomeRegion,
      residencyPolicy: mergedPolicy
    },
    metadata: {
      actorUserId,
      timestamp: new Date().toISOString()
    },
    status: 'pending',
    retryCount: 0,
    maxRetries: 3
  });

  await queueCrossRegionReplication({
    tenant: updatedTenant,
    aggregateType: 'tenant',
    aggregateId: tenantId,
    eventType: 'tenant.region_policy.updated',
    payload: {
      tenantId,
      homeRegion: finalHomeRegion,
      residencyPolicy: {
        mode: mergedPolicy.mode,
        dr: mergedPolicy.dr,
        allowedReplicationClasses: mergedPolicy.allowedReplicationClasses
      }
    },
    dataClass: 'operational',
    metadata: { actorUserId, policyUpdate: true }
  });

  return {
    tenantId,
    homeRegion: finalHomeRegion,
    residencyPolicy: mergedPolicy,
    updatedAt: nextSettings.multiRegion.updatedAt
  };
};

export const getTenantFailoverRunbook = (tenant) => {
  const { homeRegion, residencyPolicy } = extractTenantRegionConfig(tenant);
  const targetRegions = residencyPolicy.dr?.targetRegions || [];

  return {
    tenantId: tenant.id,
    homeRegion,
    targetRegions,
    objectives: {
      rpoMinutes: residencyPolicy.dr?.rpoMinutes ?? 15,
      rtoMinutes: residencyPolicy.dr?.rtoMinutes ?? 60
    },
    steps: [
      'Detect regional impairment and declare incident.',
      'Freeze cross-region writes from non-home regions.',
      'Promote designated target region as temporary active region.',
      'Replay asynchronous replication events up to latest safe checkpoint.',
      'Validate tenant-level consistency and resume writes.',
      'Post-incident: failback to home region after verification.'
    ],
    testedAt: tenant.settings?.multiRegion?.lastDrillAt || null
  };
};

export const recordFailoverDrill = async ({ tenantId, actorUserId = null, notes = '' }) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const existingSettings = tenant.settings || {};
  const multiRegion = existingSettings.multiRegion || {};
  const now = new Date().toISOString();

  const updatedSettings = {
    ...existingSettings,
    multiRegion: {
      ...multiRegion,
      enabled: true,
      lastDrillAt: now,
      lastDrillBy: actorUserId,
      lastDrillNotes: notes || 'manual drill'
    }
  };

  await db
    .update(tenants)
    .set({ settings: updatedSettings, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  await db.insert(outboxEvents).values({
    id: uuidv4(),
    tenantId,
    aggregateType: 'tenant',
    aggregateId: tenantId,
    eventType: 'tenant.failover.drill.recorded',
    payload: {
      tenantId,
      drillAt: now,
      notes
    },
    metadata: {
      actorUserId,
      timestamp: now
    },
    status: 'pending',
    retryCount: 0,
    maxRetries: 3
  });

  return {
    tenantId,
    drillAt: now,
    notes
  };
};

export const getRegionMetrics = () => ({ ...REGION_METRICS });

export const getRegionComplianceDashboard = async ({ tenantId }) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const { homeRegion, residencyPolicy } = extractTenantRegionConfig(tenant);

  const securityEvents = await db
    .select({ action: auditLogs.action, outcome: auditLogs.outcome })
    .from(auditLogs)
    .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.category, 'security')));

  const blockedAttempts = securityEvents.filter(
    (row) => row.outcome === 'failure' && String(row.action || '').startsWith('compliance.region.')
  ).length;

  return {
    tenantId,
    homeRegion,
    residencyPolicy,
    metrics: getRegionMetrics(),
    auditSummary: {
      totalSecurityAuditEvents: Number(securityEvents.length || 0),
      blockedRegionAccessEvents: Number(blockedAttempts || 0)
    }
  };
};

export default {
  getDefaultResidencyPolicy,
  extractTenantRegionConfig,
  buildRoutingDecision,
  isDataClassRestricted,
  canReplicateDataClass,
  queueCrossRegionReplication,
  updateTenantResidencyPolicy,
  getTenantFailoverRunbook,
  recordFailoverDrill,
  getRegionMetrics,
  validateRegionAccess,
  logRegionComplianceEvent,
  getRegionComplianceDashboard
};
