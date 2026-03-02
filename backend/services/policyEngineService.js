import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import cacheService from './cacheService.js';
import { createAuditLog } from './auditLogService.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_POLICY_PATH = path.join(__dirname, '../policies/default-authorization-policy.json');

class PolicyEngineService {
  constructor() {
    this.policy = null;
    this.metrics = {
      decisions: 0,
      allows: 0,
      denies: 0,
      cacheHits: 0,
      cacheMisses: 0,
      policyReloads: 0,
      opaRequests: 0,
      opaFailures: 0
    };

    this.config = {
      decisionTtlSeconds: Number(process.env.AUTHZ_DECISION_TTL_SECONDS || 60),
      defaultPolicyPath: process.env.AUTHZ_POLICY_FILE || DEFAULT_POLICY_PATH,
      enableAuditLogging: process.env.AUTHZ_AUDIT_LOGGING !== 'false',
      exposeDecisionHeaders: process.env.AUTHZ_EXPOSE_DECISION_HEADERS === 'true',
      engineMode: (process.env.AUTHZ_ENGINE_MODE || 'local').toLowerCase(), // local | opa
      opaUrl: process.env.OPA_URL || '',
      opaPackagePath: process.env.OPA_PACKAGE_PATH || 'v1/data/wealthvault/authz/allow',
      opaReasonPath: process.env.OPA_REASON_PATH || 'v1/data/wealthvault/authz/reason'
    };
  }

  async initialize() {
    await this.loadPolicy();
  }

  async loadPolicy() {
    const raw = await fs.readFile(this.config.defaultPolicyPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.version || !Array.isArray(parsed.rules)) {
      throw new Error('Invalid authorization policy file format');
    }

    this.policy = parsed;
    this.metrics.policyReloads += 1;

    logger.info('Authorization policy loaded', {
      version: this.policy.version,
      engine: this.policy.engine,
      rules: this.policy.rules.length,
      policyFile: this.config.defaultPolicyPath
    });
  }

  getPathValue(source, dottedPath) {
    if (!source || !dottedPath) return undefined;
    return dottedPath.split('.').reduce((acc, key) => (acc === undefined || acc === null ? undefined : acc[key]), source);
  }

  evaluateLeaf(condition, input) {
    const left = this.getPathValue(input, condition.path);
    const right = condition.valuePath ? this.getPathValue(input, condition.valuePath) : condition.value;

    switch (condition.op) {
      case 'exists':
        return left !== undefined && left !== null;
      case 'eq':
      case 'eqPath':
        return left === right;
      case 'neq':
        return left !== right;
      case 'in':
        return Array.isArray(right) ? right.includes(left) : false;
      case 'includes':
        return Array.isArray(left) ? left.includes(right) : false;
      case 'startsWith':
        return typeof left === 'string' && typeof right === 'string' ? left.startsWith(right) : false;
      case 'endsWith':
        return typeof left === 'string' && typeof right === 'string' ? left.endsWith(right) : false;
      default:
        return false;
    }
  }

  evaluateCondition(condition, input) {
    if (!condition) return true;

    if (condition.all) {
      return condition.all.every((c) => this.evaluateCondition(c, input));
    }

    if (condition.any) {
      return condition.any.some((c) => this.evaluateCondition(c, input));
    }

    if (condition.not) {
      return !this.evaluateCondition(condition.not, input);
    }

    return this.evaluateLeaf(condition, input);
  }

  doesActionMatch(action, ruleActions = []) {
    if (!Array.isArray(ruleActions) || ruleActions.length === 0) return false;
    if (ruleActions.includes('*')) return true;
    return ruleActions.includes(action);
  }

  stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  buildDecisionCacheKey(input) {
    const hashPayload = {
      policyVersion: this.policy?.version || 'unknown',
      action: input.action,
      userId: input.user?.id || 'anonymous',
      tenantId: input.tenant?.id || 'global',
      resourceType: input.resource?.type || 'none',
      resourceId: input.resource?.id || 'none',
      context: input.context || {}
    };

    const hash = crypto.createHash('sha256').update(this.stableStringify(hashPayload)).digest('hex').slice(0, 24);
    return `authz:decision:v:${this.policy?.version || 'unknown'}:u:${hashPayload.userId}:t:${hashPayload.tenantId}:a:${input.action}:h:${hash}`;
  }

  async evaluateWithOPA(input) {
    this.metrics.opaRequests += 1;

    if (!this.config.opaUrl) {
      throw new Error('OPA_URL is not configured');
    }

    const allowUrl = `${this.config.opaUrl.replace(/\/$/, '')}/${this.config.opaPackagePath.replace(/^\//, '')}`;
    const reasonUrl = `${this.config.opaUrl.replace(/\/$/, '')}/${this.config.opaReasonPath.replace(/^\//, '')}`;

    const allowResponse = await fetch(allowUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input })
    });

    if (!allowResponse.ok) {
      throw new Error(`OPA allow query failed: ${allowResponse.status}`);
    }

    const allowBody = await allowResponse.json();
    const allow = Boolean(allowBody?.result);

    let reason = allow ? 'Allowed by OPA policy' : 'Denied by OPA policy';

    try {
      const reasonResponse = await fetch(reasonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      });

      if (reasonResponse.ok) {
        const reasonBody = await reasonResponse.json();
        if (typeof reasonBody?.result === 'string' && reasonBody.result.trim()) {
          reason = reasonBody.result;
        }
      }
    } catch (error) {
      logger.warn('OPA reason query failed, using default reason', { error: error.message });
    }

    return {
      allow,
      reason,
      matchedRuleId: 'opa.external',
      policyVersion: this.policy?.version || 'opa-external',
      engine: 'opa'
    };
  }

  evaluateLocally(input) {
    const sortedRules = [...this.policy.rules].sort((a, b) => (a.priority || 1000) - (b.priority || 1000));

    let firstAllow = null;

    for (const rule of sortedRules) {
      if (!this.doesActionMatch(input.action, rule.actions)) {
        continue;
      }

      if (!this.evaluateCondition(rule.condition, input)) {
        continue;
      }

      if (rule.effect === 'deny') {
        return {
          allow: false,
          reason: rule.reason || 'Denied by policy',
          matchedRuleId: rule.id,
          policyVersion: this.policy.version,
          engine: this.policy.engine || 'cedar-lite'
        };
      }

      if (!firstAllow && rule.effect === 'allow') {
        firstAllow = {
          allow: true,
          reason: rule.reason || 'Allowed by policy',
          matchedRuleId: rule.id,
          policyVersion: this.policy.version,
          engine: this.policy.engine || 'cedar-lite'
        };
      }
    }

    if (firstAllow) {
      return firstAllow;
    }

    return {
      allow: this.policy.defaults?.effect === 'allow',
      reason: this.policy.defaults?.reason || 'No matching authorization policy',
      matchedRuleId: 'default',
      policyVersion: this.policy.version,
      engine: this.policy.engine || 'cedar-lite'
    };
  }

  async logDecision(input, decision, metadata = {}) {
    if (!this.config.enableAuditLogging) return;

    try {
      await createAuditLog({
        tenantId: input.tenant?.id || null,
        actorUserId: input.user?.id || null,
        action: 'authz.decision',
        category: 'permission',
        resourceType: input.resource?.type || null,
        resourceId: input.resource?.id || null,
        method: input.context?.method || null,
        path: input.context?.path || null,
        statusCode: decision.allow ? 200 : 403,
        outcome: decision.allow ? 'success' : 'failure',
        severity: decision.allow ? 'low' : 'medium',
        ipAddress: input.context?.ipAddress || null,
        userAgent: input.context?.userAgent || null,
        requestId: input.context?.requestId || null,
        metadata: {
          action: input.action,
          reason: decision.reason,
          matchedRuleId: decision.matchedRuleId,
          policyVersion: decision.policyVersion,
          engine: decision.engine,
          ...metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log authorization decision', {
        error: error.message,
        action: input.action,
        userId: input.user?.id || null
      });
    }
  }

  async authorize(input) {
    if (!this.policy) {
      await this.initialize();
    }

    const decisionKey = this.buildDecisionCacheKey(input);
    const cached = await cacheService.get(decisionKey);

    if (cached) {
      this.metrics.cacheHits += 1;
      this.metrics.decisions += 1;
      if (cached.allow) this.metrics.allows += 1;
      else this.metrics.denies += 1;

      await this.logDecision(input, cached, { cacheHit: true });
      return { ...cached, cacheHit: true, cacheKey: decisionKey };
    }

    this.metrics.cacheMisses += 1;

    let decision;

    if (this.config.engineMode === 'opa') {
      try {
        decision = await this.evaluateWithOPA(input);
      } catch (error) {
        this.metrics.opaFailures += 1;
        logger.error('OPA evaluation failed, falling back to local policy engine', {
          error: error.message
        });
        decision = this.evaluateLocally(input);
      }
    } else {
      decision = this.evaluateLocally(input);
    }

    this.metrics.decisions += 1;
    if (decision.allow) this.metrics.allows += 1;
    else this.metrics.denies += 1;

    await cacheService.set(decisionKey, decision, this.config.decisionTtlSeconds);
    await this.logDecision(input, decision, { cacheHit: false });

    return { ...decision, cacheHit: false, cacheKey: decisionKey };
  }

  async invalidateAuthorizationCache({ tenantId = null, userId = null } = {}) {
    const deletedCounts = [];

    if (tenantId) {
      deletedCounts.push(await cacheService.deletePattern(`authz:decision:*:t:${tenantId}:*`));
    }

    if (userId) {
      deletedCounts.push(await cacheService.deletePattern(`authz:decision:*:u:${userId}:*`));
    }

    if (!tenantId && !userId) {
      deletedCounts.push(await cacheService.deletePattern('authz:decision:*'));
    }

    const deleted = deletedCounts.reduce((sum, current) => sum + (Number(current) || 0), 0);

    logger.info('Authorization cache invalidated', {
      tenantId,
      userId,
      deleted
    });

    return deleted;
  }

  async reloadPolicies() {
    await this.loadPolicy();
    await this.invalidateAuthorizationCache();

    return {
      version: this.policy.version,
      rules: this.policy.rules.length,
      engine: this.policy.engine || 'cedar-lite'
    };
  }

  getStatus() {
    return {
      initialized: Boolean(this.policy),
      policyVersion: this.policy?.version || null,
      engine: this.config.engineMode === 'opa' ? 'opa+local-fallback' : (this.policy?.engine || 'cedar-lite'),
      ruleCount: this.policy?.rules?.length || 0,
      decisionTtlSeconds: this.config.decisionTtlSeconds,
      auditLogging: this.config.enableAuditLogging,
      metrics: { ...this.metrics }
    };
  }
}

const policyEngineService = new PolicyEngineService();

export default policyEngineService;
export { PolicyEngineService };
