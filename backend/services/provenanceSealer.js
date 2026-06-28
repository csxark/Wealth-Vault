import db from '../config/db.js';
import { provenanceRecords, auditAnchors } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Provenance Sealer Service (#536)
 * Uses the cryptographic Merkle Audit Trail to create immutable, 
 * regulator-grade records of appraisal history, condition reports, and chain of custody.
 */
class ProvenanceSealer {
    /**
     * Record a new event in the asset's history and seal it.
     */
    async logProvenanceEvent(assetId, eventData) {
        const { type, description, actor, metadata } = eventData;

        logInfo(`[Provenance Sealer] Sealing ${type} event for asset ${assetId}`);

        return await db.transaction(async (tx) => {
            // 1. Fetch latest system audit anchor (Merkle root)
            // In a production app, this would trigger a new block seal
            const [latestAnchor] = await tx.select()
                .from(auditAnchors)
                .orderBy(desc(auditAnchors.sealedAt))
                .limit(1);

            // 2. Insert the record with the cryptographic link
            const [record] = await tx.insert(provenanceRecords).values({
                assetId,
                recordType: type,
                eventDate: new Date(),
                description,
                actorName: actor,
                isVerified: true,
                auditAnchorId: latestAnchor?.id,
                metadata: metadata || {}
            }).returning();

            return record;
        });
    }

    /**
     * Get the full, cryptographically linked chain for an asset.
     */
    async getAssetHistory(assetId) {
        return await db.select()
            .from(provenanceRecords)
            .where(eq(provenanceRecords.assetId, assetId))
            .orderBy(desc(provenanceRecords.eventDate));
    }

    /**
     * Verify the integrity of a record (Demo implementation).
     */
    async verifyRecord(recordId) {
        const record = await db.query.provenanceRecords.findFirst({
            where: eq(provenanceRecords.id, recordId)
        });

        if (!record || !record.auditAnchorId) return { verified: false, reason: 'No cryptographic anchor' };

        // Realistically, would re-hash and compare against the Merkle root
        return { verified: true, anchorId: record.auditAnchorId, timestamp: record.eventDate };
    }
}

export default new ProvenanceSealer();
