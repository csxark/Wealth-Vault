import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import tamperProofAuditService from '../services/tamperProofAuditService.js';
import { createAuditLog, verifyAuditLogIntegrity } from '../services/auditLogService.js';
import db from '../config/db.js';
import { auditLogs, auditAnchors } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/**
 * Tamper-Proof Audit Trail Tests (#627)
 */
describe('Tamper-Proof Audit Trail', () => {
    let testTenantId = 'test-tenant-627';
    let testAuditLogs = [];

    beforeAll(async () => {
        // Clean up any existing test data
        await db.delete(auditLogs).where(eq(auditLogs.tenantId, testTenantId));
        await db.delete(auditAnchors).where(eq(auditAnchors.tenantId, testTenantId));
    });

    afterAll(async () => {
        // Clean up test data
        await db.delete(auditLogs).where(eq(auditLogs.tenantId, testTenantId));
        await db.delete(auditAnchors).where(eq(auditAnchors.tenantId, testTenantId));
    });

    describe('Hash Chain Integrity', () => {
        it('should create audit logs with proper hash chaining', async () => {
            // Create multiple audit logs
            for (let i = 0; i < 5; i++) {
                const log = await createAuditLog({
                    tenantId: testTenantId,
                    actorUserId: `user-${i}`,
                    action: `test.action.${i}`,
                    category: 'test',
                    resourceType: 'test_resource',
                    resourceId: `resource-${i}`,
                    outcome: 'success',
                    metadata: { testId: i, sequence: i }
                });
                testAuditLogs.push(log);
            }

            expect(testAuditLogs).toHaveLength(5);

            // Verify each log has entryHash and previousHash
            for (const log of testAuditLogs) {
                expect(log.entryHash).toBeDefined();
                expect(log.entryHash).toMatch(/^[a-f0-9]{64}$/);
                expect(typeof log.previousHash).toBe('string');
            }
        });

        it('should verify hash chain integrity', async () => {
            const integrityReport = await verifyAuditLogIntegrity({ tenantId: testTenantId });

            expect(integrityReport.ok).toBe(true);
            expect(integrityReport.violations).toHaveLength(0);
            expect(integrityReport.checked).toBeGreaterThan(0);
        });

        it('should detect hash chain breaks', async () => {
            // Tamper with one log's entryHash (simulating tampering)
            const logToTamper = testAuditLogs[2];
            await db.update(auditLogs)
                .set({ entryHash: 'tampered' + logToTamper.entryHash.substring(8) })
                .where(eq(auditLogs.id, logToTamper.id));

            const integrityReport = await verifyAuditLogIntegrity({ tenantId: testTenantId });

            expect(integrityReport.ok).toBe(false);
            expect(integrityReport.violations).toHaveLength(1);
            expect(integrityReport.violations[0].type).toBe('HASH_MISMATCH');

            // Restore the hash for other tests
            await db.update(auditLogs)
                .set({ entryHash: logToTamper.entryHash })
                .where(eq(auditLogs.id, logToTamper.id));
        });
    });

    describe('External Anchoring', () => {
        let testAnchorId;

        it('should anchor Merkle root externally', async () => {
            // First create an anchor (this would normally be done by the sealer job)
            const testLogs = testAuditLogs.slice(0, 3);
            const merkleRoot = 'test-merkle-root-' + Date.now();

            const [anchor] = await db.insert(auditAnchors).values({
                tenantId: testTenantId,
                merkleRoot,
                eventCount: testLogs.length,
                periodStart: new Date(Date.now() - 3600000),
                periodEnd: new Date(),
                sealMetadata: { test: true }
            }).returning();

            testAnchorId = anchor.id;

            // Anchor externally
            const result = await tamperProofAuditService.anchorExternally(testAnchorId, 'blockchain');

            expect(result.success).toBe(true);
            expect(result.anchorId).toBe(testAnchorId);
            expect(result.externalService).toBe('blockchain');
            expect(result.externalProof).toBeDefined();
        });

        it('should verify external anchoring', async () => {
            const verification = await tamperProofAuditService.verifyExternalAnchoring(testAnchorId);

            expect(verification.verified).toBe(true);
            expect(verification.service).toBe('blockchain');
            expect(verification.proof).toBeDefined();
        });
    });

    describe('Comprehensive Integrity Report', () => {
        it('should generate comprehensive integrity report', async () => {
            const report = await tamperProofAuditService.getIntegrityReport(testTenantId, true);

            expect(report.tenantId).toBe(testTenantId);
            expect(report.hashChainIntegrity).toBeDefined();
            expect(report.latestAnchor).toBeDefined();
            expect(report.externalVerification).toBeDefined();
            expect(report.anchoringStats).toBeDefined();
            expect(report.overallIntegrity).toBeDefined();
            expect(report.reportGeneratedAt).toBeInstanceOf(Date);

            // Should be valid since we haven't tampered
            expect(report.overallIntegrity.overall).toBe(true);
        });

        it('should detect integrity issues in comprehensive report', async () => {
            // Tamper with a log
            const logToTamper = testAuditLogs[1];
            await db.update(auditLogs)
                .set({ entryHash: 'tampered-hash' })
                .where(eq(auditLogs.id, logToTamper.id));

            const report = await tamperProofAuditService.getIntegrityReport(testTenantId, false);

            expect(report.overallIntegrity.overall).toBe(false);
            expect(report.overallIntegrity.hashChain).toBe(false);
            expect(report.overallIntegrity.issues).toContain('Hash chain integrity compromised');

            // Restore
            await db.update(auditLogs)
                .set({ entryHash: logToTamper.entryHash })
                .where(eq(auditLogs.id, logToTamper.id));
        });
    });

    describe('Database Constraints', () => {
        it('should prevent updates to audit logs', async () => {
            const testLog = testAuditLogs[0];

            // This should fail due to database trigger
            await expect(
                db.update(auditLogs)
                    .set({ action: 'tampered.action' })
                    .where(eq(auditLogs.id, testLog.id))
            ).rejects.toThrow(/append-only/i);
        });

        it('should prevent deletes from audit logs', async () => {
            const testLog = testAuditLogs[0];

            // This should fail due to database trigger
            await expect(
                db.delete(auditLogs).where(eq(auditLogs.id, testLog.id))
            ).rejects.toThrow(/append-only/i);
        });
    });
});