import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import tenantAwareAuditService from '../services/tenantAwareAuditService.js';
import { createAuditLog } from '../services/auditLogService.js';
import db from '../config/db.js';
import { auditLogs, tenants, tenantMembers, users } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/**
 * Tenant-Aware Audit Isolation Tests (#629)
 */
describe('Tenant-Aware Audit Isolation', () => {
    let testTenantId1 = 'test-tenant-629-1';
    let testTenantId2 = 'test-tenant-629-2';
    let testUserId1 = 'test-user-629-1';
    let testUserId2 = 'test-user-629-2';
    let testAuditLogs1 = [];
    let testAuditLogs2 = [];

    beforeAll(async () => {
        // Clean up any existing test data
        await db.delete(auditLogs).where(sql`${auditLogs.tenantId} LIKE 'test-tenant-629%'`);
        await db.delete(tenantMembers).where(sql`${tenantMembers.tenantId} LIKE 'test-tenant-629%'`);
        await db.delete(tenants).where(sql`${tenants.id} LIKE 'test-tenant-629%'`);

        // Create test tenants
        await db.insert(tenants).values([
            {
                id: testTenantId1,
                name: 'Test Tenant 1',
                slug: 'test-tenant-1',
                ownerId: testUserId1,
                tier: 'standard',
                status: 'active'
            },
            {
                id: testTenantId2,
                name: 'Test Tenant 2',
                slug: 'test-tenant-2',
                ownerId: testUserId2,
                tier: 'standard',
                status: 'active'
            }
        ]);

        // Create tenant memberships
        await db.insert(tenantMembers).values([
            {
                tenantId: testTenantId1,
                userId: testUserId1,
                role: 'admin',
                status: 'active'
            },
            {
                tenantId: testTenantId2,
                userId: testUserId2,
                role: 'admin',
                status: 'active'
            }
        ]);
    });

    afterAll(async () => {
        // Clean up test data
        await db.delete(auditLogs).where(sql`${auditLogs.tenantId} LIKE 'test-tenant-629%'`);
        await db.delete(tenantMembers).where(sql`${tenantMembers.tenantId} LIKE 'test-tenant-629%'`);
        await db.delete(tenants).where(sql`${tenants.id} LIKE 'test-tenant-629%'`);
    });

    describe('User Context Management', () => {
        it('should set and clear user context for RLS', async () => {
            // Set context
            const setResult = await tenantAwareAuditService.setUserContext(testUserId1, testTenantId1);
            expect(setResult.success).toBe(true);

            // Clear context
            const clearResult = await tenantAwareAuditService.clearUserContext();
            expect(clearResult.success).toBe(true);
        });
    });

    describe('Tenant Access Control', () => {
        it('should allow access to own tenant audit data', async () => {
            const hasAccess = await tenantAwareAuditService.checkTenantAuditAccess(
                testUserId1,
                testTenantId1,
                ['audit:view']
            );
            expect(hasAccess).toBe(true);
        });

        it('should deny access to other tenant audit data', async () => {
            const hasAccess = await tenantAwareAuditService.checkTenantAuditAccess(
                testUserId1,
                testTenantId2,
                ['audit:view']
            );
            expect(hasAccess).toBe(false);
        });

        it('should validate cross-tenant access attempts', async () => {
            const userTenants = [testTenantId1];
            const isValid = await tenantAwareAuditService.validateCrossTenantAccess(
                testUserId1,
                testTenantId2,
                userTenants
            );
            expect(isValid).toBe(false);
        });
    });

    describe('Tenant-Scoped Audit Logging', () => {
        beforeAll(async () => {
            // Create audit logs for both tenants
            for (let i = 0; i < 3; i++) {
                const log1 = await createAuditLog({
                    tenantId: testTenantId1,
                    actorUserId: testUserId1,
                    action: `tenant1.action.${i}`,
                    category: 'test',
                    resourceType: 'test_resource',
                    resourceId: `resource-${i}`,
                    outcome: 'success',
                    metadata: { tenantTest: true, sequence: i }
                });
                testAuditLogs1.push(log1);

                const log2 = await createAuditLog({
                    tenantId: testTenantId2,
                    actorUserId: testUserId2,
                    action: `tenant2.action.${i}`,
                    category: 'test',
                    resourceType: 'test_resource',
                    resourceId: `resource-${i}`,
                    outcome: 'success',
                    metadata: { tenantTest: true, sequence: i }
                });
                testAuditLogs2.push(log2);
            }
        });

        it('should query audit logs scoped to tenant', async () => {
            const logs = await tenantAwareAuditService.queryTenantAuditLogs(
                testUserId1,
                testTenantId1,
                { limit: 10 }
            );

            expect(logs.length).toBeGreaterThan(0);
            // All returned logs should belong to the correct tenant
            logs.forEach(log => {
                expect(log.tenantId).toBe(testTenantId1);
            });
        });

        it('should prevent querying other tenant logs', async () => {
            await expect(
                tenantAwareAuditService.queryTenantAuditLogs(
                    testUserId1,
                    testTenantId2,
                    { limit: 10 }
                )
            ).rejects.toThrow(/Access denied/);
        });

        it('should get tenant audit summary', async () => {
            const summary = await tenantAwareAuditService.getTenantAuditSummary(
                testUserId1,
                testTenantId1
            );

            expect(summary).toBeDefined();
            expect(summary.tenant_id).toBe(testTenantId1);
            expect(summary.total_logs).toBeGreaterThan(0);
        });

        it('should deny summary access to other tenants', async () => {
            await expect(
                tenantAwareAuditService.getTenantAuditSummary(
                    testUserId1,
                    testTenantId2
                )
            ).rejects.toThrow(/Access denied/);
        });
    });

    describe('Row-Level Security', () => {
        it('should enforce RLS on audit_logs table', async () => {
            // Set context for user 1
            await tenantAwareAuditService.setUserContext(testUserId1, testTenantId1);

            // Query should only return tenant 1 logs
            const tenant1Logs = await db
                .select()
                .from(auditLogs)
                .where(eq(auditLogs.tenantId, testTenantId1))
                .limit(5);

            expect(tenant1Logs.length).toBeGreaterThan(0);
            tenant1Logs.forEach(log => {
                expect(log.tenantId).toBe(testTenantId1);
            });

            // Clear context
            await tenantAwareAuditService.clearUserContext();
        });

        it('should prevent access to other tenant data via RLS', async () => {
            // Set context for user 1
            await tenantAwareAuditService.setUserContext(testUserId1, testTenantId1);

            // Try to query tenant 2 logs - should return empty due to RLS
            const tenant2Logs = await db
                .select()
                .from(auditLogs)
                .where(eq(auditLogs.tenantId, testTenantId2))
                .limit(5);

            // RLS should prevent access, so this should be empty
            expect(tenant2Logs.length).toBe(0);

            // Clear context
            await tenantAwareAuditService.clearUserContext();
        });
    });

    describe('Access Violation Monitoring', () => {
        it('should log and track access violations', async () => {
            // Attempt cross-tenant access (should be logged as violation)
            await tenantAwareAuditService.validateCrossTenantAccess(
                testUserId1,
                testTenantId2,
                [testTenantId1]
            );

            // Check for violations
            const violations = await tenantAwareAuditService.getAuditAccessViolations(
                null, // Check all tenants
                1 // Last hour
            );

            expect(violations.length).toBeGreaterThan(0);
            const recentViolation = violations.find(v =>
                v.details?.attempted_tenant === testTenantId2
            );
            expect(recentViolation).toBeDefined();
        });
    });

    describe('Tenant Isolation Integrity', () => {
        it('should validate tenant isolation integrity', async () => {
            const integrityStatus = await tenantAwareAuditService.validateTenantIsolation();

            expect(integrityStatus).toBeDefined();
            expect(integrityStatus.hasOwnProperty('isolationIntegrity')).toBe(true);
            expect(integrityStatus.totalAuditLogs).toBeGreaterThan(0);
            expect(integrityStatus.tenantScopedLogs).toBeGreaterThan(0);
            expect(integrityStatus.orphanedLogs).toBe(0); // Should be no orphaned logs
        });
    });

    describe('User Accessible Tenants', () => {
        it('should return user accessible tenants', async () => {
            const accessibleTenants = await tenantAwareAuditService.getUserAccessibleTenants(testUserId1);

            expect(accessibleTenants).toBeDefined();
            expect(Array.isArray(accessibleTenants)).toBe(true);
            expect(accessibleTenants.length).toBeGreaterThan(0);

            const tenant1Access = accessibleTenants.find(t => t.tenantId === testTenantId1);
            expect(tenant1Access).toBeDefined();
            expect(tenant1Access.role).toBe('admin');
        });

        it('should not include inaccessible tenants', async () => {
            const accessibleTenants = await tenantAwareAuditService.getUserAccessibleTenants(testUserId1);

            const tenant2Access = accessibleTenants.find(t => t.tenantId === testTenantId2);
            expect(tenant2Access).toBeUndefined();
        });
    });
});