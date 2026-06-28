// backend/__tests__/logSnapshot.test.js
// Issue #648: Log Snapshot Service Tests

import db from '../config/db.js';
import logSnapshotService, { SNAPSHOT_FORMATS, SNAPSHOT_STATUS } from '../services/logSnapshotService.js';
import logSnapshotJob from '../jobs/logSnapshotJob.js';

// Mock data
const testTenantId = '11111111-1111-1111-1111-111111111111';
const testUserId = '22222222-2222-2222-2222-222222222222';

const mockSnapshotOptions = {
    format: SNAPSHOT_FORMATS.JSON,
    fromDate: '2024-01-01T00:00:00.000Z',
    toDate: '2024-01-31T23:59:59.999Z',
    logTypes: ['audit', 'application'],
    filters: {
        severity: 'high',
        category: 'security'
    },
    requestedBy: testUserId
};

describe('Log Snapshot Service', () => {
    beforeEach(async () => {
        // Clean up any test snapshots
        await db.execute('DELETE FROM log_snapshots WHERE tenant_id = $1', [testTenantId]);
    });

    afterEach(async () => {
        // Clean up after tests
        await db.execute('DELETE FROM log_snapshots WHERE tenant_id = $1', [testTenantId]);
    });

    describe('Snapshot Generation', () => {
        it('should queue a snapshot for generation', async () => {
            const result = await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);

            expect(result).toHaveProperty('snapshotId');
            expect(result.status).toBe(SNAPSHOT_STATUS.PENDING);
            expect(result).toHaveProperty('message');

            // Verify record was created
            const snapshot = await logSnapshotService.getSnapshot(result.snapshotId);
            expect(snapshot).toBeTruthy();
            expect(snapshot.tenant_id).toBe(testTenantId);
            expect(snapshot.status).toBe(SNAPSHOT_STATUS.PENDING);
            expect(snapshot.format).toBe(SNAPSHOT_FORMATS.JSON);
        });

        it('should generate snapshot with CSV format', async () => {
            const options = { ...mockSnapshotOptions, format: SNAPSHOT_FORMATS.CSV };
            const result = await logSnapshotService.generateLogSnapshot(testTenantId, options);

            const snapshot = await logSnapshotService.getSnapshot(result.snapshotId);
            expect(snapshot.format).toBe(SNAPSHOT_FORMATS.CSV);
        });

        it('should list tenant snapshots', async () => {
            // Create a couple of snapshots
            await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);
            await logSnapshotService.generateLogSnapshot(testTenantId, { ...mockSnapshotOptions, format: SNAPSHOT_FORMATS.CSV });

            const snapshots = await logSnapshotService.listTenantSnapshots(testTenantId);

            expect(snapshots.length).toBe(2);
            expect(snapshots[0].tenant_id).toBe(testTenantId);
            expect(snapshots[1].tenant_id).toBe(testTenantId);
        });

        it('should paginate snapshot list', async () => {
            // Create multiple snapshots
            for (let i = 0; i < 5; i++) {
                await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);
            }

            const snapshots = await logSnapshotService.listTenantSnapshots(testTenantId, { limit: 2, offset: 1 });

            expect(snapshots.length).toBe(2);
        });
    });

    describe('Snapshot Verification', () => {
        it('should verify snapshot integrity', async () => {
            // Create and process a snapshot
            const result = await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);

            // Manually process the snapshot (in real scenario, job would do this)
            await logSnapshotService.processSnapshot(result.snapshotId, testTenantId, {
                ...mockSnapshotOptions,
                snapshotId: result.snapshotId
            });

            // Verify the snapshot
            const verification = await logSnapshotService.verifySnapshot(result.snapshotId);

            expect(verification.valid).toBe(true);
            expect(verification).toHaveProperty('checksum');
            expect(verification.signatureValid).toBe(true);
        });

        it('should detect tampered snapshot', async () => {
            // Create and process a snapshot
            const result = await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);
            await logSnapshotService.processSnapshot(result.snapshotId, testTenantId, {
                ...mockSnapshotOptions,
                snapshotId: result.snapshotId
            });

            // Get snapshot and tamper with the file
            const snapshot = await logSnapshotService.getSnapshot(result.snapshotId);
            const fs = await import('fs');
            const bundleContent = fs.readFileSync(snapshot.bundle_path, 'utf8');
            const bundle = JSON.parse(bundleContent);

            // Tamper with content
            bundle.content = bundle.content.replace('audit', 'modified');

            // Write back
            fs.writeFileSync(snapshot.bundle_path, JSON.stringify(bundle));

            // Verification should fail
            await expect(logSnapshotService.verifySnapshot(result.snapshotId)).rejects.toThrow('Checksum verification failed');
        });
    });

    describe('Snapshot Deletion', () => {
        it('should delete a snapshot', async () => {
            const result = await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);

            await logSnapshotService.deleteSnapshot(result.snapshotId);

            const snapshot = await logSnapshotService.getSnapshot(result.snapshotId);
            expect(snapshot).toBeFalsy();
        });
    });

    describe('Job Integration', () => {
        it('should queue snapshot in job', async () => {
            const result = await logSnapshotService.generateLogSnapshot(testTenantId, mockSnapshotOptions);

            // Check that job has the snapshot queued
            expect(logSnapshotJob.pendingSnapshots.has(result.snapshotId)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid tenant ID', async () => {
            const invalidTenantId = 'invalid-uuid';

            await expect(logSnapshotService.generateLogSnapshot(invalidTenantId, mockSnapshotOptions))
                .rejects.toThrow();
        });

        it('should handle invalid date range', async () => {
            const invalidOptions = {
                ...mockSnapshotOptions,
                fromDate: '2024-12-31T00:00:00.000Z',
                toDate: '2024-01-01T00:00:00.000Z' // from > to
            };

            await expect(logSnapshotService.generateLogSnapshot(testTenantId, invalidOptions))
                .rejects.toThrow();
        });
    });
});