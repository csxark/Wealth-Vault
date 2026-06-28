// backend/services/logSnapshotService.js
// Issue #648: Log Snapshot for Regulatory Export
// Generates signed, timestamped log snapshots with checksum validation

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from '../config/db.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import outboxService from './outboxService.js';

const SNAPSHOT_FORMATS = {
    JSON: 'json',
    CSV: 'csv'
};

const SNAPSHOT_STATUS = {
    PENDING: 'pending',
    GENERATING: 'generating',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

const SIGNATURE_ALGORITHM = 'RSA-SHA256';
const CHECKSUM_ALGORITHM = 'sha256';

/**
 * Process a queued snapshot (called by the job)
 */
export async function processSnapshot(snapshotId, tenantId, options) {
    const timestamp = options.timestamp || new Date().toISOString();

    try {
        logInfo('Processing log snapshot', { snapshotId, tenantId });

        // Update status to generating
        await updateSnapshotStatus(snapshotId, SNAPSHOT_STATUS.GENERATING);

        // Generate the snapshot data
        const snapshotData = await generateSnapshotData(tenantId, options);

        // Create signed bundle
        const signedBundle = await createSignedBundle(snapshotData, snapshotId, timestamp, options.format || SNAPSHOT_FORMATS.JSON);

        // Store the bundle
        const bundlePath = await storeSnapshotBundle(signedBundle, snapshotId);

        // Update snapshot record with completion details
        await completeSnapshot(snapshotId, bundlePath, signedBundle.metadata);

        // Publish event
        await outboxService.publishEvent('log-snapshot-completed', {
            snapshotId,
            tenantId,
            bundlePath,
            checksum: signedBundle.metadata.checksum
        });

        logInfo('Log snapshot processing completed', { snapshotId, tenantId });

    } catch (error) {
        logError('Log snapshot processing failed', { snapshotId, tenantId, error: error.message });

        await updateSnapshotStatus(snapshotId, SNAPSHOT_STATUS.FAILED, error.message);

        throw error;
    }
}

/**
 * Generate a signed log snapshot for regulatory export
 */
export async function generateLogSnapshot(tenantId, options = {}) {
    const snapshotId = options.snapshotId || crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
        logInfo('Creating log snapshot request', { snapshotId, tenantId });

        // Create snapshot record
        await createSnapshotRecord(snapshotId, tenantId, options);

        // Queue the snapshot for processing
        const logSnapshotJob = (await import('../jobs/logSnapshotJob.js')).default;
        await logSnapshotJob.queueSnapshot(snapshotId, tenantId, {
            ...options,
            snapshotId,
            timestamp
        });

        logInfo('Log snapshot queued for generation', { snapshotId, tenantId });

        return {
            snapshotId,
            status: SNAPSHOT_STATUS.PENDING,
            message: 'Snapshot generation queued'
        };

    } catch (error) {
        logError('Log snapshot request failed', { snapshotId, tenantId, error: error.message });

        await updateSnapshotStatus(snapshotId, SNAPSHOT_STATUS.FAILED, error.message);

        throw error;
    }
}

/**
 * Generate snapshot data from logs
 */
async function generateSnapshotData(tenantId, options) {
    const {
        fromDate,
        toDate,
        logTypes = ['audit', 'application', 'security'],
        filters = {}
    } = options;

    const snapshotData = {
        tenantId,
        generatedAt: new Date().toISOString(),
        period: {
            from: fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            to: toDate || new Date().toISOString()
        },
        logs: []
    };

    // Collect logs from different sources
    for (const logType of logTypes) {
        const logs = await collectLogsByType(tenantId, logType, snapshotData.period, filters);
        snapshotData.logs.push(...logs);
    }

    // Sort by timestamp
    snapshotData.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return snapshotData;
}

/**
 * Collect logs by type
 */
async function collectLogsByType(tenantId, logType, period, filters) {
    const logs = [];

    switch (logType) {
        case 'audit':
            logs.push(...await collectAuditLogs(tenantId, period, filters));
            break;
        case 'application':
            logs.push(...await collectApplicationLogs(tenantId, period, filters));
            break;
        case 'security':
            logs.push(...await collectSecurityLogs(tenantId, period, filters));
            break;
        default:
            logWarn('Unknown log type', { logType });
    }

    return logs;
}

/**
 * Collect audit logs
 */
async function collectAuditLogs(tenantId, period, filters) {
    // Query audit logs from database
    const result = await db.execute(`
        SELECT
            id,
            tenant_id as tenantId,
            actor_user_id as actorUserId,
            action,
            category,
            resource_type as resourceType,
            resource_id as resourceId,
            method,
            path,
            status_code as statusCode,
            outcome,
            severity,
            ip_address as ipAddress,
            request_id as requestId,
            created_at as timestamp,
            entry_hash as entryHash,
            previous_hash as previousHash,
            metadata
        FROM audit_logs
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
        ORDER BY created_at ASC
    `, [tenantId, period.from, period.to]);

    return result.map(row => ({
        type: 'audit',
        ...row,
        timestamp: row.timestamp.toISOString()
    }));
}

/**
 * Collect application logs
 */
async function collectApplicationLogs(tenantId, period, filters) {
    // For application logs, we might need to query from log storage
    // This is a simplified implementation
    const logs = [];

    // Query from application_logs table if it exists
    try {
        const result = await db.execute(`
            SELECT * FROM application_logs
            WHERE tenant_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
            ORDER BY timestamp ASC
        `, [tenantId, period.from, period.to]);

        logs.push(...result.map(row => ({
            type: 'application',
            ...row,
            timestamp: row.timestamp.toISOString()
        })));
    } catch (error) {
        // Table might not exist, skip
        logWarn('Application logs table not available', { error: error.message });
    }

    return logs;
}

/**
 * Collect security logs
 */
async function collectSecurityLogs(tenantId, period, filters) {
    // Similar to application logs
    const logs = [];

    try {
        const result = await db.execute(`
            SELECT * FROM security_logs
            WHERE tenant_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
            ORDER BY timestamp ASC
        `, [tenantId, period.from, period.to]);

        logs.push(...result.map(row => ({
            type: 'security',
            ...row,
            timestamp: row.timestamp.toISOString()
        })));
    } catch (error) {
        logWarn('Security logs table not available', { error: error.message });
    }

    return logs;
}

/**
 * Create signed bundle
 */
async function createSignedBundle(snapshotData, snapshotId, timestamp, format) {
    // Serialize data
    let content;
    if (format === SNAPSHOT_FORMATS.JSON) {
        content = JSON.stringify(snapshotData, null, 2);
    } else if (format === SNAPSHOT_FORMATS.CSV) {
        content = convertToCSV(snapshotData);
    } else {
        throw new Error(`Unsupported format: ${format}`);
    }

    // Generate checksum
    const checksum = crypto.createHash(CHECKSUM_ALGORITHM).update(content).digest('hex');

    // Create signature payload
    const signaturePayload = {
        snapshotId,
        timestamp,
        checksum,
        format,
        tenantId: snapshotData.tenantId
    };

    // Sign the payload (using a private key - in production, this should be securely stored)
    const signature = signPayload(signaturePayload);

    // Create metadata
    const metadata = {
        snapshotId,
        timestamp,
        checksum,
        signature,
        format,
        recordCount: snapshotData.logs.length,
        size: Buffer.byteLength(content, 'utf8')
    };

    // Create bundle
    const bundle = {
        metadata,
        data: snapshotData,
        content
    };

    return bundle;
}

/**
 * Convert snapshot data to CSV
 */
function convertToCSV(snapshotData) {
    const headers = [
        'type',
        'id',
        'tenantId',
        'timestamp',
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
        'actorUserId',
        'entryHash',
        'previousHash'
    ];

    const escapeCell = (value) => {
        const serialized = value === null || value === undefined ? '' : String(value).replace(/"/g, '""');
        return `"${serialized}"`;
    };

    const lines = [headers.join(',')];

    for (const log of snapshotData.logs) {
        lines.push([
            log.type,
            log.id,
            log.tenantId,
            log.timestamp,
            log.action || '',
            log.category || '',
            log.resourceType || '',
            log.resourceId || '',
            log.method || '',
            log.path || '',
            log.statusCode || '',
            log.outcome || '',
            log.severity || '',
            log.ipAddress || '',
            log.actorUserId || '',
            log.entryHash || '',
            log.previousHash || ''
        ].map(escapeCell).join(','));
    }

    return lines.join('\n');
}

/**
 * Sign payload using RSA
 */
function signPayload(payload) {
    // In production, load private key from secure storage
    // For now, using a generated key pair for demonstration
    const privateKey = process.env.SNAPSHOT_PRIVATE_KEY || generateKeyPair().privateKey;

    const sign = crypto.createSign(SIGNATURE_ALGORITHM);
    sign.update(JSON.stringify(payload));
    return sign.sign(privateKey, 'base64');
}

/**
 * Generate key pair for signing (development only)
 */
function generateKeyPair() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // Cache for development
    process.env.SNAPSHOT_PRIVATE_KEY = privateKey;
    process.env.SNAPSHOT_PUBLIC_KEY = publicKey;

    return { privateKey, publicKey };
}

/**
 * Store snapshot bundle
 */
async function storeSnapshotBundle(signedBundle, snapshotId) {
    // Store in file system or cloud storage
    const snapshotDir = path.join(process.cwd(), 'snapshots');
    if (!fs.existsSync(snapshotDir)) {
        fs.mkdirSync(snapshotDir, { recursive: true });
    }

    const bundlePath = path.join(snapshotDir, `${snapshotId}.json`);
    fs.writeFileSync(bundlePath, JSON.stringify(signedBundle, null, 2));

    return bundlePath;
}

/**
 * Database operations
 */
async function createSnapshotRecord(snapshotId, tenantId, options) {
    await db.execute(`
        INSERT INTO log_snapshots (
            id,
            tenant_id,
            status,
            format,
            requested_by,
            filters,
            created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        snapshotId,
        tenantId,
        SNAPSHOT_STATUS.PENDING,
        options.format || SNAPSHOT_FORMATS.JSON,
        options.requestedBy || 'system',
        JSON.stringify(options.filters || {}),
        new Date()
    ]);
}

async function updateSnapshotStatus(snapshotId, status, errorMessage = null) {
    await db.execute(`
        UPDATE log_snapshots
        SET status = $1, error_message = $2, updated_at = $3
        WHERE id = $4
    `, [status, errorMessage, new Date(), snapshotId]);
}

async function completeSnapshot(snapshotId, bundlePath, metadata) {
    await db.execute(`
        UPDATE log_snapshots
        SET status = $1,
            bundle_path = $2,
            checksum = $3,
            signature = $4,
            record_count = $5,
            file_size = $6,
            completed_at = $7,
            updated_at = $7
        WHERE id = $8
    `, [
        SNAPSHOT_STATUS.COMPLETED,
        bundlePath,
        metadata.checksum,
        metadata.signature,
        metadata.recordCount,
        metadata.size,
        new Date(),
        snapshotId
    ]);
}

/**
 * Get snapshot by ID
 */
export async function getSnapshot(snapshotId) {
    const result = await db.execute(`
        SELECT * FROM log_snapshots WHERE id = $1
    `, [snapshotId]);

    return result[0];
}

/**
 * List snapshots for tenant
 */
export async function listTenantSnapshots(tenantId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await db.execute(`
        SELECT * FROM log_snapshots
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
    `, [tenantId, limit, offset]);

    return result;
}

/**
 * Verify snapshot integrity
 */
export async function verifySnapshot(snapshotId) {
    const snapshot = await getSnapshot(snapshotId);
    if (!snapshot) {
        throw new Error('Snapshot not found');
    }

    if (!fs.existsSync(snapshot.bundle_path)) {
        throw new Error('Snapshot bundle file not found');
    }

    const bundleContent = fs.readFileSync(snapshot.bundle_path, 'utf8');
    const bundle = JSON.parse(bundleContent);

    // Verify checksum
    const calculatedChecksum = crypto.createHash(CHECKSUM_ALGORITHM)
        .update(bundle.content)
        .digest('hex');

    if (calculatedChecksum !== snapshot.checksum) {
        throw new Error('Checksum verification failed');
    }

    // Verify signature
    const isValidSignature = verifySignature(bundle.metadata, snapshot.signature);
    if (!isValidSignature) {
        throw new Error('Signature verification failed');
    }

    return {
        valid: true,
        checksum: calculatedChecksum,
        signatureValid: isValidSignature
    };
}

/**
 * Verify signature
 */
function verifySignature(metadata, signature) {
    const publicKey = process.env.SNAPSHOT_PUBLIC_KEY || generateKeyPair().publicKey;

    const verify = crypto.createVerify(SIGNATURE_ALGORITHM);
    verify.update(JSON.stringify({
        snapshotId: metadata.snapshotId,
        timestamp: metadata.timestamp,
        checksum: metadata.checksum,
        format: metadata.format,
        tenantId: metadata.tenantId
    }));

    return verify.verify(publicKey, signature, 'base64');
}

/**
 * Delete snapshot
 */
export async function deleteSnapshot(snapshotId) {
    const snapshot = await getSnapshot(snapshotId);
    if (!snapshot) {
        throw new Error('Snapshot not found');
    }

    // Delete file
    if (fs.existsSync(snapshot.bundle_path)) {
        fs.unlinkSync(snapshot.bundle_path);
    }

    // Delete record
    await db.execute(`
        DELETE FROM log_snapshots WHERE id = $1
    `, [snapshotId]);

    return { deleted: true };
}

export {
    SNAPSHOT_FORMATS,
    SNAPSHOT_STATUS
};