import db from '../config/db.js';
import { auditLogs, auditAnchors, securityEvents } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tenant-Aware Audit Access Control Service (#629)
 * Enforces strict tenant-scoped access controls and RBAC for audit operations
 */
class TenantAwareAuditService {
    /**
     * Sets the user context for Row-Level Security policies
     */
    async setUserContext(userId, tenantId = null) {
        try {
            // Set RLS context
            await db.execute(sql`SELECT set_audit_user_context(${userId})`);

            // Log the context setting
            await this.logAccessAttempt(userId, tenantId, 'audit:context:set', 'user_context', userId, true, {
                action: 'set_user_context',
                tenant_id: tenantId
            });

            return { success: true };
        } catch (error) {
            logError('[TenantAwareAudit] Failed to set user context', error);
            throw error;
        }
    }

    /**
     * Clears the user context
     */
    async clearUserContext() {
        try {
            await db.execute(sql`SELECT clear_audit_user_context()`);
            return { success: true };
        } catch (error) {
            logError('[TenantAwareAudit] Failed to clear user context', error);
            throw error;
        }
    }

    /**
     * Checks if user has access to tenant audit data
     */
    async checkTenantAuditAccess(userId, tenantId, requiredPermissions = []) {
        try {
            const result = await db.execute(sql`
                SELECT check_tenant_audit_access(${userId}, ${tenantId}, ${requiredPermissions})
            `);

            const hasAccess = result.rows[0]?.check_tenant_audit_access || false;

            // Log the access check
            await this.logAccessAttempt(userId, tenantId, 'audit:access:check', 'tenant', tenantId, hasAccess, {
                required_permissions: requiredPermissions,
                access_granted: hasAccess
            });

            return hasAccess;
        } catch (error) {
            logError('[TenantAwareAudit] Access check failed', error);
            await this.logAccessAttempt(userId, tenantId, 'audit:access:check', 'tenant', tenantId, false, {
                error: error.message,
                required_permissions: requiredPermissions
            });
            return false;
        }
    }

    /**
     * Gets tenant audit summary with access control
     */
    async getTenantAuditSummary(userId, tenantId) {
        try {
            // First check access
            const hasAccess = await this.checkTenantAuditAccess(userId, tenantId, ['audit:view']);
            if (!hasAccess) {
                throw new Error('Access denied: insufficient permissions');
            }

            const result = await db.execute(sql`
                SELECT * FROM tenant_audit_summary WHERE tenant_id = ${tenantId}
            `);

            const summary = result.rows[0];

            await this.logAccessAttempt(userId, tenantId, 'audit:summary:view', 'tenant_summary', tenantId, true);

            return summary;
        } catch (error) {
            logError('[TenantAwareAudit] Failed to get tenant audit summary', error);
            await this.logAccessAttempt(userId, tenantId, 'audit:summary:view', 'tenant_summary', tenantId, false, {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validates cross-tenant access attempts and logs security events
     */
    async validateCrossTenantAccess(userId, requestedTenantId, userTenantIds) {
        const isValidAccess = userTenantIds.includes(requestedTenantId);

        if (!isValidAccess) {
            // Log security violation
            await db.insert(securityEvents).values({
                tenantId: null, // Global security event
                userId: userId,
                eventType: 'cross_tenant_access_attempt',
                details: {
                    attempted_tenant: requestedTenantId,
                    user_tenants: userTenantIds,
                    violation_type: 'tenant_isolation_breach'
                },
                severity: 'high',
                ipAddress: null, // Will be set by middleware
                userAgent: null  // Will be set by middleware
            });

            logError('[TenantAwareAudit] CROSS-TENANT ACCESS VIOLATION', {
                userId,
                requestedTenantId,
                userTenantIds
            });
        }

        return isValidAccess;
    }

    /**
     * Gets user's accessible tenants for audit operations
     */
    async getUserAccessibleTenants(userId) {
        try {
            const result = await db.execute(sql`
                SELECT tenant_id, role FROM get_user_tenant_memberships(${userId})
            `);

            return result.rows.map(row => ({
                tenantId: row.tenant_id,
                role: row.role
            }));
        } catch (error) {
            logError('[TenantAwareAudit] Failed to get user accessible tenants', error);
            return [];
        }
    }

    /**
     * Enhanced audit log query with tenant isolation
     */
    async queryTenantAuditLogs(userId, tenantId, filters = {}) {
        try {
            // Check access
            const hasAccess = await this.checkTenantAuditAccess(userId, tenantId, ['audit:view']);
            if (!hasAccess) {
                throw new Error('Access denied: insufficient audit view permissions');
            }

            // Build query with tenant isolation
            let query = db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId));

            // Apply filters
            if (filters.actorUserId) {
                query = query.where(eq(auditLogs.actorUserId, filters.actorUserId));
            }
            if (filters.action) {
                query = query.where(sql`${auditLogs.action} ILIKE ${`%${filters.action}%`}`);
            }
            if (filters.category) {
                query = query.where(eq(auditLogs.category, filters.category));
            }
            if (filters.outcome) {
                query = query.where(eq(auditLogs.outcome, filters.outcome));
            }
            if (filters.severity) {
                query = query.where(eq(auditLogs.severity, filters.severity));
            }
            if (filters.from) {
                query = query.where(sql`${auditLogs.createdAt} >= ${filters.from}`);
            }
            if (filters.to) {
                query = query.where(sql`${auditLogs.createdAt} <= ${filters.to}`);
            }

            // Apply pagination
            const limit = Math.min(filters.limit || 50, 1000);
            const offset = filters.offset || 0;
            query = query.limit(limit).offset(offset);

            // Order by creation date
            query = query.orderBy(sql`${auditLogs.createdAt} DESC`);

            const logs = await query;

            // Log the access
            await this.logAccessAttempt(userId, tenantId, 'audit:logs:query', 'audit_logs', tenantId, true, {
                filters,
                result_count: logs.length
            });

            return logs;
        } catch (error) {
            logError('[TenantAwareAudit] Failed to query tenant audit logs', error);
            await this.logAccessAttempt(userId, tenantId, 'audit:logs:query', 'audit_logs', tenantId, false, {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Logs access attempts for audit monitoring
     */
    async logAccessAttempt(userId, tenantId, action, resourceType, resourceId, success, metadata = {}) {
        try {
            await db.execute(sql`
                SELECT log_audit_access_attempt(
                    ${userId},
                    ${tenantId},
                    ${action},
                    ${resourceType},
                    ${resourceId},
                    ${success},
                    ${JSON.stringify(metadata)}
                )
            `);
        } catch (error) {
            // Don't throw on logging errors to avoid breaking main functionality
            logError('[TenantAwareAudit] Failed to log access attempt', error);
        }
    }

    /**
     * Gets audit access violations for monitoring
     */
    async getAuditAccessViolations(tenantId = null, hours = 24) {
        try {
            const since = new Date(Date.now() - (hours * 60 * 60 * 1000));

            const violations = await db
                .select()
                .from(securityEvents)
                .where(and(
                    eq(securityEvents.eventType, 'cross_tenant_access_attempt'),
                    sql`${securityEvents.createdAt} >= ${since}`,
                    tenantId ? eq(securityEvents.tenantId, tenantId) : sql`true`
                ))
                .orderBy(sql`${securityEvents.createdAt} DESC`);

            return violations;
        } catch (error) {
            logError('[TenantAwareAudit] Failed to get access violations', error);
            return [];
        }
    }

    /**
     * Validates tenant isolation integrity
     */
    async validateTenantIsolation() {
        try {
            // Check for any audit logs that might have incorrect tenant associations
            const orphanedLogs = await db.execute(sql`
                SELECT COUNT(*) as count
                FROM audit_logs al
                LEFT JOIN tenant_members tm ON al.tenant_id = tm.tenant_id AND al.actor_user_id = tm.user_id
                WHERE al.tenant_id IS NOT NULL
                AND tm.id IS NULL
            `);

            const isolationIssues = parseInt(orphanedLogs.rows[0]?.count || 0);

            // Check RLS policy effectiveness
            const rlsTest = await db.execute(sql`
                SELECT COUNT(*) as total_logs,
                       COUNT(CASE WHEN tenant_id IS NOT NULL THEN 1 END) as tenant_logs
                FROM audit_logs
            `);

            return {
                isolationIntegrity: isolationIssues === 0,
                totalAuditLogs: parseInt(rlsTest.rows[0]?.total_logs || 0),
                tenantScopedLogs: parseInt(rlsTest.rows[0]?.tenant_logs || 0),
                orphanedLogs: isolationIssues,
                lastChecked: new Date()
            };
        } catch (error) {
            logError('[TenantAwareAudit] Failed to validate tenant isolation', error);
            return {
                isolationIntegrity: false,
                error: error.message,
                lastChecked: new Date()
            };
        }
    }
}

export default new TenantAwareAuditService();