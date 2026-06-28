import crypto from 'crypto';
import { eq, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { auditAnchors } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * TamperProofAuditService - Enhanced tamper-proof audit trail with external anchoring (#627)
 */
class TamperProofAuditService {
    /**
     * Anchors the latest Merkle root externally (e.g., to blockchain or WORM storage)
     * This provides additional immutability guarantees beyond database constraints
     */
    async anchorExternally(anchorId, externalService = 'blockchain') {
        try {
            const [anchor] = await db
                .select()
                .from(auditAnchors)
                .where(eq(auditAnchors.id, anchorId));

            if (!anchor) {
                throw new Error('Audit anchor not found');
            }

            const anchoringData = {
                anchorId: anchor.id,
                merkleRoot: anchor.merkleRoot,
                sealedAt: anchor.sealedAt,
                eventCount: anchor.eventCount,
                tenantId: anchor.tenantId
            };

            // For now, we'll simulate external anchoring
            // In production, this would integrate with actual external services
            const externalProof = await this._performExternalAnchoring(anchoringData, externalService);

            // Store the external proof back in the anchor
            await db
                .update(auditAnchors)
                .set({
                    externalProof: externalProof,
                    externalService: externalService,
                    externallyAnchoredAt: new Date()
                })
                .where(eq(auditAnchors.id, anchorId));

            logInfo(`[TamperProofAudit] Externally anchored anchor ${anchorId} via ${externalService}`);

            return {
                success: true,
                anchorId,
                externalProof,
                externalService
            };
        } catch (error) {
            logError('[TamperProofAudit] External anchoring failed', error);
            throw error;
        }
    }

    /**
     * Performs the actual external anchoring (placeholder for real implementation)
     */
    async _performExternalAnchoring(anchoringData, service) {
        // This is a placeholder implementation
        // In production, integrate with:
        // - Blockchain (Ethereum, Bitcoin, etc.)
        // - WORM storage (AWS S3 Object Lock, Azure Immutable Storage)
        // - Distributed ledger technologies
        // - Third-party timestamping services

        switch (service) {
            case 'blockchain':
                return this._anchorToBlockchain(anchoringData);
            case 'worm':
                return this._anchorToWORM(anchoringData);
            case 'timestamp':
                return this._anchorToTimestampService(anchoringData);
            default:
                return this._anchorToBlockchain(anchoringData);
        }
    }

    async _anchorToBlockchain(data) {
        // Placeholder: In production, integrate with Web3.js or similar
        const transactionHash = crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');

        return {
            service: 'blockchain',
            transactionHash,
            blockNumber: Math.floor(Date.now() / 1000), // Simulated block number
            timestamp: new Date(),
            proof: `blockchain:${transactionHash}`
        };
    }

    async _anchorToWORM(data) {
        // Placeholder: In production, integrate with cloud WORM storage
        const objectId = crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');

        return {
            service: 'worm',
            objectId,
            storageUrl: `worm://immutable/${objectId}`,
            retentionPeriod: '99years',
            timestamp: new Date(),
            proof: `worm:${objectId}`
        };
    }

    async _anchorToTimestampService(data) {
        // Placeholder: In production, integrate with RFC 3161 timestamping
        const timestampToken = crypto.createHash('sha256')
            .update(JSON.stringify(data) + Date.now().toString())
            .digest('hex');

        return {
            service: 'timestamp',
            timestampToken,
            authority: 'RFC3161',
            timestamp: new Date(),
            proof: `timestamp:${timestampToken}`
        };
    }

    /**
     * Verifies external anchoring proofs
     */
    async verifyExternalAnchoring(anchorId) {
        try {
            const [anchor] = await db
                .select()
                .from(auditAnchors)
                .where(eq(auditAnchors.id, anchorId));

            if (!anchor || !anchor.externalProof) {
                return {
                    verified: false,
                    reason: 'No external proof found'
                };
            }

            // Verify the external proof based on service type
            const isValid = await this._verifyExternalProof(anchor.externalProof, anchor.externalService);

            return {
                verified: isValid,
                service: anchor.externalService,
                anchoredAt: anchor.externallyAnchoredAt,
                proof: anchor.externalProof
            };
        } catch (error) {
            logError('[TamperProofAudit] External verification failed', error);
            return {
                verified: false,
                reason: error.message
            };
        }
    }

    async _verifyExternalProof(proof, service) {
        // Placeholder verification logic
        // In production, verify against actual external services
        return proof && proof.timestamp && new Date(proof.timestamp) <= new Date();
    }

    /**
     * Gets comprehensive integrity report including external anchoring status
     */
    async getIntegrityReport(tenantId = null, includeExternalVerification = true) {
        try {
            // Get hash chain validation results
            const chainValidation = await db.execute(sql`
                SELECT * FROM validate_audit_hash_chain(${tenantId})
            `);

            // Get latest anchor information
            const [latestAnchor] = await db
                .select()
                .from(auditAnchors)
                .where(tenantId ? eq(auditAnchors.tenantId, tenantId) : sql`${auditAnchors.tenantId} IS NULL`)
                .orderBy(desc(auditAnchors.sealedAt))
                .limit(1);

            let externalVerification = null;
            if (includeExternalVerification && latestAnchor) {
                externalVerification = await this.verifyExternalAnchoring(latestAnchor.id);
            }

            // Get anchoring frequency statistics
            const anchoringStats = await this._getAnchoringStats(tenantId);

            return {
                tenantId,
                hashChainIntegrity: chainValidation.rows[0] || {
                    total_logs: 0,
                    chain_breaks: 0,
                    hash_mismatches: 0,
                    is_integrity_ok: true
                },
                latestAnchor: latestAnchor ? {
                    id: latestAnchor.id,
                    merkleRoot: latestAnchor.merkleRoot,
                    sealedAt: latestAnchor.sealedAt,
                    eventCount: latestAnchor.eventCount,
                    externalProof: latestAnchor.externalProof,
                    externallyAnchoredAt: latestAnchor.externallyAnchoredAt
                } : null,
                externalVerification,
                anchoringStats,
                overallIntegrity: this._calculateOverallIntegrity(
                    chainValidation.rows[0],
                    externalVerification
                ),
                reportGeneratedAt: new Date()
            };
        } catch (error) {
            logError('[TamperProofAudit] Failed to generate integrity report', error);
            throw error;
        }
    }

    async _getAnchoringStats(tenantId) {
        const stats = await db.execute(sql`
            SELECT
                COUNT(*) as total_anchors,
                AVG(EXTRACT(EPOCH FROM (sealed_at - LAG(sealed_at) OVER (ORDER BY sealed_at)))) / 3600 as avg_hours_between_anchors,
                MIN(sealed_at) as first_anchor,
                MAX(sealed_at) as last_anchor
            FROM audit_anchors
            WHERE ${tenantId ? sql`tenant_id = ${tenantId}` : sql`tenant_id IS NULL`}
        `);

        return stats.rows[0] || {};
    }

    _calculateOverallIntegrity(chainValidation, externalVerification) {
        const hashChainOk = chainValidation?.is_integrity_ok !== false;
        const externalOk = !externalVerification || externalVerification.verified;

        return {
            overall: hashChainOk && externalOk,
            hashChain: hashChainOk,
            externalAnchoring: externalOk,
            issues: [
                ...(hashChainOk ? [] : ['Hash chain integrity compromised']),
                ...(externalOk ? [] : ['External anchoring verification failed'])
            ]
        };
    }

    /**
     * Schedules periodic anchoring (to be called by cron job)
     */
    async schedulePeriodicAnchoring(tenantId = null, intervalHours = 24) {
        // This would typically be called by a scheduled job
        // For now, just log the scheduling
        logInfo(`[TamperProofAudit] Scheduled periodic anchoring for tenant ${tenantId || 'global'} every ${intervalHours} hours`);

        return {
            scheduled: true,
            tenantId,
            intervalHours,
            nextRun: new Date(Date.now() + (intervalHours * 60 * 60 * 1000))
        };
    }
}

export default new TamperProofAuditService();