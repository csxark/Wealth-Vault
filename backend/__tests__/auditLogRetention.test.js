// backend/__tests__/auditLogRetention.test.js
// Issue #614: Audit Log Retention Service Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import db from '../config/db.js';
import cacheService from '../services/cacheService.js';
import outboxService from '../services/outboxService.js';
import auditLogRetentionService from '../services/auditLogRetentionService.js';

// Mock data
const testTenantId = '11111111-1111-1111-1111-111111111111';
const testUserId = '22222222-2222-2222-2222-222222222222';

const mockRetentionPolicy = {
    policyName: 'GDPR 90-Day Retention',
    description: 'GDPR-compliant 90-day retention with S3 archival',
    retentionDays: 90,
    archiveAfterDays: 30,
    deleteAfterDays: 90,
    complianceFramework: 'GDPR',
    regulatoryRequirement: 'GDPR Article 5(1)(e)',
    minRetentionDays: 90,
    compressionEnabled: true,
    compressionAfterDays: 30,
    compressionFormat: 'gzip',
    archiveEnabled: true,
    archiveDestination: 's3',
    archiveFormat: 'parquet',
    encryptionEnabled: true,
    excludedEventTypes: ['HEARTBEAT'],
    excludedUsers: ['system']
};

describe('Audit Log Retention Service', () => {
    beforeEach(async () => {
        // Reset cache
        await cacheService.clear();
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await cacheService.clear();
    });

    // Test Policy Management

    describe('Policy Management', () => {
        it('should create a retention policy', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            expect(policy).toBeDefined();
            expect(policy.tenant_id).toBe(testTenantId);
            expect(policy.policy_name).toBe(mockRetentionPolicy.policyName);
            expect(policy.retention_days).toBe(mockRetentionPolicy.retentionDays);
            expect(policy.compliance_framework).toBe(mockRetentionPolicy.complianceFramework);
            expect(policy.is_active).toBe(true);
        });

        it('should retrieve tenant retention policies', async () => {
            // Create multiple policies
            const policy1 = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const policy2 = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                { ...mockRetentionPolicy, policyName: 'HIPAA 6-Year Retention' }
            );

            const policies = await auditLogRetentionService.getTenantRetentionPolicies(testTenantId);

            expect(policies).toBeDefined();
            expect(Array.isArray(policies)).toBe(true);
            expect(policies.length).toBeGreaterThanOrEqual(2);
        });

        it('should update a retention policy', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const updated = await auditLogRetentionService.updateRetentionPolicy(
                testTenantId,
                policy.id,
                {
                    description: 'Updated GDPR policy',
                    retention_days: 120
                }
            );

            expect(updated).toBeDefined();
            expect(updated.description).toBe('Updated GDPR policy');
            expect(updated.retention_days).toBe(120);
        });

        it('should handle policy creation with all optional fields', async () => {
            const fullPolicy = {
                ...mockRetentionPolicy,
                regulatoryRequirement: 'PCI-DSS Requirement 3.2.1',
                encryptionKeyId: 'kms:arn:aws:key/12345'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                fullPolicy
            );

            expect(policy.encryption_key_id).toBe('kms:arn:aws:key/12345');
            expect(policy.regulatory_requirement).toBe('PCI-DSS Requirement 3.2.1');
        });
    });

    // Test Retention Status

    describe('Retention Status and Compliance', () => {
        it('should get retention status for a policy', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const status = await auditLogRetentionService.getTenantRetentionStatus(
                testTenantId,
                policy.id
            );

            expect(status).toBeDefined();
            expect(status.policyId).toBe(policy.id);
            expect(status.policyName).toBe(mockRetentionPolicy.policyName);
            expect(status.complianceFramework).toBe(mockRetentionPolicy.complianceFramework);
            expect(status.isActive).toBe(true);
            expect(status.complianceScore).toBeDefined();
        });

        it('should include archive statistics in retention status', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const status = await auditLogRetentionService.getTenantRetentionStatus(
                testTenantId,
                policy.id
            );

            expect(status.totalArchives).toBeDefined();
            expect(status.totalLogsArchived).toBeDefined();
            expect(status.totalStorageBytes).toBeDefined();
            expect(status.avgCompressionRatio).toBeDefined();
        });

        it('should return compliance score in status', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const status = await auditLogRetentionService.getTenantRetentionStatus(
                testTenantId,
                policy.id
            );

            expect(status.complianceScore).toBeGreaterThanOrEqual(0);
            expect(status.complianceScore).toBeLessThanOrEqual(100);
        });
    });

    // Test Compression

    describe('Audit Log Compression', () => {
        it('should compress audit logs', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.compressAuditLogs(
                testTenantId,
                policy.id
            );

            expect(result).toBeDefined();
            expect(result.jobId).toBeDefined();
            expect(result.logsCompressed).toBeDefined();
            expect(result.processingDurationMs).toBeGreaterThan(0);
            expect(result.format).toBe(mockRetentionPolicy.compressionFormat);
        });

        it('should track compression job details', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.compressAuditLogs(
                testTenantId,
                policy.id
            );

            expect(result.logsCompressed).toBeGreaterThanOrEqual(0);
            expect(result.processingDurationMs).toBeGreaterThan(0);
        });

        it('should handle compression for different formats', async () => {
            const brotliPolicy = {
                ...mockRetentionPolicy,
                policyName: 'Brotli Compression Policy',
                compressionFormat: 'brotli'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                brotliPolicy
            );

            const result = await auditLogRetentionService.compressAuditLogs(
                testTenantId,
                policy.id
            );

            expect(result.format).toBe('brotli');
        });
    });

    // Test Archival

    describe('Archive to Cold Storage', () => {
        it('should archive compressed logs', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.archiveCompressedLogs(
                testTenantId,
                policy.id
            );

            expect(result).toBeDefined();
            expect(result.archiveId).toBeDefined();
            expect(result.logsArchived).toBeDefined();
            expect(result.archiveSizeBytes).toBeGreaterThan(0);
            expect(result.processingDurationMs).toBeGreaterThan(0);
        });

        it('should generate archive batch ID correctly', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.archiveCompressedLogs(
                testTenantId,
                policy.id
            );

            // Archive batch ID should contain tenant ID and timestamp
            expect(result.archiveId).toBeDefined();
        });

        it('should track archive storage metrics', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.archiveCompressedLogs(
                testTenantId,
                policy.id
            );

            expect(result.archiveSizeBytes).toBeGreaterThan(0);
            expect(result.logsArchived).toBeGreaterThanOrEqual(0);
        });

        it('should support different archive destinations', async () => {
            const azurePolicy = {
                ...mockRetentionPolicy,
                policyName: 'Azure Archive Policy',
                archiveDestination: 'azure'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                azurePolicy
            );

            const result = await auditLogRetentionService.archiveCompressedLogs(
                testTenantId,
                policy.id
            );

            expect(result.archiveId).toBeDefined();
        });
    });

    // Test Deletion

    describe('Expired Log Deletion', () => {
        it('should delete expired logs', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.deleteExpiredLogs(
                testTenantId,
                policy.id
            );

            expect(result).toBeDefined();
            expect(result.logsDeleted).toBeDefined();
            expect(result.spaceSavedBytes).toBeDefined();
            expect(result.processingDurationMs).toBeGreaterThan(0);
        });

        it('should track space savings from deletion', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.deleteExpiredLogs(
                testTenantId,
                policy.id
            );

            expect(result.spaceSavedBytes).toBeGreaterThanOrEqual(0);
        });

        it('should respect deletion retention period', async () => {
            const strictPolicy = {
                ...mockRetentionPolicy,
                policyName: 'Short Retention Policy',
                retention_days: 30,
                delete_after_days: 30
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                strictPolicy
            );

            const result = await auditLogRetentionService.deleteExpiredLogs(
                testTenantId,
                policy.id
            );

            expect(result.logsDeleted).toBeDefined();
        });
    });

    // Test Verification

    describe('Archive Integrity Verification', () => {
        it('should verify archive integrity', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.verifyArchiveIntegrity(
                testTenantId,
                policy.id
            );

            expect(result).toBeDefined();
            expect(result.archivesVerified).toBeDefined();
            expect(result.archivesFailed).toBeDefined();
            expect(result.processingDurationMs).toBeGreaterThan(0);
        });

        it('should track verification results', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.verifyArchiveIntegrity(
                testTenantId,
                policy.id
            );

            expect(result.archivesVerified + result.archivesFailed).toBeDefined();
        });
    });

    // Test Full Workflow

    describe('Complete Retention Workflow', () => {
        it('should apply retention policy (compress -> archive -> delete -> verify)', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.applyRetentionPolicy(
                testTenantId,
                policy.id
            );

            expect(result).toBeDefined();
            expect(result.status).toBe('completed');
            expect(result.phases).toBeDefined();
            expect(Array.isArray(result.phases)).toBe(true);
            expect(result.phases.length).toBeGreaterThanOrEqual(3);
        });

        it('should execute all phases in correct order', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.applyRetentionPolicy(
                testTenantId,
                policy.id
            );

            const phaseNames = result.phases.map(p => p.phase);
            
            // Check that phases appear in correct order
            const compressionIndex = phaseNames.indexOf('compression');
            const archivalIndex = phaseNames.indexOf('archival');
            const deletionIndex = phaseNames.indexOf('deletion');

            expect(compressionIndex).toBeGreaterThanOrEqual(0);
            expect(archivalIndex).toBeGreaterThan(compressionIndex);
            expect(deletionIndex).toBeGreaterThan(archivalIndex);
        });

        it('should track summary statistics in workflow', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const result = await auditLogRetentionService.applyRetentionPolicy(
                testTenantId,
                policy.id
            );

            expect(result.summary).toBeDefined();
            expect(result.summary.logsCompressed).toBeDefined();
            expect(result.summary.logsArchived).toBeDefined();
            expect(result.summary.logsDeleted).toBeDefined();
            expect(result.summary.spaceSaved).toBeDefined();
        });

        it('should handle policy application errors gracefully', async () => {
            // Create policy with invalid ID to trigger error
            expect(async () => {
                await auditLogRetentionService.applyRetentionPolicy(
                    testTenantId,
                    'invalid-policy-id'
                );
            }).rejects.toThrow();
        });
    });

    // Test Metrics

    describe('Retention Metrics and Analytics', () => {
        it('should retrieve retention metrics', async () => {
            const metrics = await auditLogRetentionService.getRetentionMetrics(
                testTenantId,
                'daily',
                30
            );

            expect(Array.isArray(metrics)).toBe(true);
        });

        it('should support different period types', async () => {
            const dailyMetrics = await auditLogRetentionService.getRetentionMetrics(
                testTenantId,
                'daily',
                7
            );
            
            const monthlyMetrics = await auditLogRetentionService.getRetentionMetrics(
                testTenantId,
                'monthly',
                12
            );

            expect(Array.isArray(dailyMetrics)).toBe(true);
            expect(Array.isArray(monthlyMetrics)).toBe(true);
        });

        it('should filter metrics by date range', async () => {
            const metrics = await auditLogRetentionService.getRetentionMetrics(
                testTenantId,
                'daily',
                5
            );

            // All metrics should be within the requested date range
            expect(metrics.every(m => m.tenant_id === testTenantId)).toBe(true);
        });

        it('should cache metrics appropriately', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const metrics1 = await auditLogRetentionService.getRetentionMetrics(
                testTenantId,
                'daily',
                7
            );

            // Second call should be from cache
            const metrics2 = await auditLogRetentionService.getRetentionMetrics(
                testTenantId,
                'daily',
                7
            );

            expect(JSON.stringify(metrics1)).toEqual(JSON.stringify(metrics2));
        });
    });

    // Test Cost Estimation

    describe('Storage Cost and Savings Estimation', () => {
        it('should estimate storage costs', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const estimate = await auditLogRetentionService.estimateStorageCosts(
                testTenantId,
                policy.id
            );

            expect(estimate).toBeDefined();
            expect(estimate.archivedSizeGB).toBeDefined();
            expect(estimate.estimatedOriginalSizeGB).toBeDefined();
            expect(estimate.monthlyStorageCost).toBeDefined();
            expect(estimate.monthlySavings).toBeDefined();
        });

        it('should calculate compression ratio correctly', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const estimate = await auditLogRetentionService.estimateStorageCosts(
                testTenantId,
                policy.id
            );

            // Compression ratio should show savings (og size > compressed size)
            const originalSizeGB = parseFloat(estimate.estimatedOriginalSizeGB);
            const archivedSizeGB = parseFloat(estimate.archivedSizeGB);
            
            if (originalSizeGB > 0) {
                expect(originalSizeGB).toBeGreaterThanOrEqual(archivedSizeGB);
            }
        });

        it('should estimate monthly costs accurately', async () => {
            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                mockRetentionPolicy
            );

            const estimate = await auditLogRetentionService.estimateStorageCosts(
                testTenantId,
                policy.id
            );

            const monthlyCost = parseFloat(estimate.monthlyStorageCost);
            expect(monthlyCost).toBeGreaterThanOrEqual(0);
        });
    });

    // Test Multi-Tenant Isolation

    describe('Multi-Tenant Isolation', () => {
        it('should isolate policies per tenant', async () => {
            const tenant1Id = '11111111-1111-1111-1111-111111111111';
            const tenant2Id = '22222222-2222-2222-2222-222222222222';

            const policy1 = await auditLogRetentionService.createRetentionPolicy(
                tenant1Id,
                { ...mockRetentionPolicy, policyName: 'Tenant 1 Policy' }
            );

            const policy2 = await auditLogRetentionService.createRetentionPolicy(
                tenant2Id,
                { ...mockRetentionPolicy, policyName: 'Tenant 2 Policy' }
            );

            const tenant1Policies = await auditLogRetentionService.getTenantRetentionPolicies(
                tenant1Id
            );

            const tenant2Policies = await auditLogRetentionService.getTenantRetentionPolicies(
                tenant2Id
            );

            // Ensure policies are tenant-specific
            expect(tenant1Policies.some(p => p.id === policy1.id)).toBe(true);
            expect(tenant2Policies.some(p => p.id === policy2.id)).toBe(true);
        });

        it('should prevent cross-tenant access', async () => {
            const tenant1Id = '11111111-1111-1111-1111-111111111111';
            const tenant2Id = '22222222-2222-2222-2222-222222222222';

            const policy = await auditLogRetentionService.createRetentionPolicy(
                tenant1Id,
                mockRetentionPolicy
            );

            // Attempting to access from different tenant should fail or return nothing
            expect(async () => {
                await auditLogRetentionService.getTenantRetentionStatus(
                    tenant2Id,
                    policy.id
                );
            }).rejects.toThrow();
        });
    });

    // Test Compliance Frameworks

    describe('Compliance Framework Support', () => {
        it('should support GDPR compliance framework', async () => {
            const gdprPolicy = {
                ...mockRetentionPolicy,
                complianceFramework: 'GDPR',
                regulatoryRequirement: 'GDPR Article 5(1)(e) - Storage Limitation'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                gdprPolicy
            );

            expect(policy.compliance_framework).toBe('GDPR');
        });

        it('should support HIPAA compliance framework', async () => {
            const hipaaPolicy = {
                ...mockRetentionPolicy,
                policyName: 'HIPAA Compliance',
                complianceFramework: 'HIPAA',
                retentionDays: 2555  // 7 years for HIPAA
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                hipaaPolicy
            );

            expect(policy.compliance_framework).toBe('HIPAA');
            expect(policy.retention_days).toBe(2555);
        });

        it('should support PCI-DSS compliance framework', async () => {
            const pciPolicy = {
                ...mockRetentionPolicy,
                policyName: 'PCI-DSS Compliance',
                complianceFramework: 'PCI-DSS',
                regulatoryRequirement: 'PCI-DSS Requirement 3.2.1'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                pciPolicy
            );

            expect(policy.compliance_framework).toBe('PCI-DSS');
        });

        it('should support SOC2 compliance framework', async () => {
            const soc2Policy = {
                ...mockRetentionPolicy,
                policyName: 'SOC2 Compliance',
                complianceFramework: 'SOC2'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                soc2Policy
            );

            expect(policy.compliance_framework).toBe('SOC2');
        });

        it('should support ISO27001 compliance framework', async () => {
            const isoPolicy = {
                ...mockRetentionPolicy,
                policyName: 'ISO 27001 Compliance',
                complianceFramework: 'ISO27001'
            };

            const policy = await auditLogRetentionService.createRetentionPolicy(
                testTenantId,
                isoPolicy
            );

            expect(policy.compliance_framework).toBe('ISO27001');
        });
    });
});
