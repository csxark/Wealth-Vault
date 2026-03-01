import db from '../config/db.js';
import { auditAnchors, securityEvents, auditLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import MerkleTree from '../utils/merkleTree.js';

/**
 * AuditVerifierService - Verifies cryptographic integrity of database rows (#475)
 */
class AuditVerifierService {
    /**
     * Generates a Merkle Proof for a specific event
     */
    async getProofOfInnocence(eventId, tableType) {
        const isSecurity = tableType === 'security_events' || tableType === 'security_event';
        const table = isSecurity ? securityEvents : auditLogs;

        // 1. Fetch the event
        const [event] = await db.select().from(table).where(eq(table.id, eventId));
        if (!event) throw new Error('Event not found');
        if (!event.isSealed || !event.auditAnchorId) throw new Error('Event has not been sealed yet.');

        // 2. Fetch the anchor
        const [anchor] = await db.select().from(auditAnchors).where(eq(auditAnchors.id, event.auditAnchorId));
        if (!anchor) throw new Error('Audit anchor not found.');

        // 3. Reconstruct exactly as the sealer did
        const [periodSecurity, periodAudit] = await Promise.all([
            db.select().from(securityEvents).where(eq(securityEvents.auditAnchorId, anchor.id)),
            db.select().from(auditLogs).where(eq(auditLogs.auditAnchorId, anchor.id))
        ]);

        const allEvents = [
            ...periodSecurity.map(e => ({
                id: e.id,
                type: 'security_event',
                actorId: e.userId,
                action: e.eventType,
                payload: e.details,
                timestamp: e.createdAt
            })),
            ...periodAudit.map(e => ({
                id: e.id,
                type: 'audit_log',
                actorId: e.userId,
                action: e.action,
                payload: e.delta,
                timestamp: e.performedAt
            }))
        ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const tree = new MerkleTree(allEvents);

        // 4. Find the index of our event
        const index = allEvents.findIndex(e => e.id === eventId);
        if (index === -1) throw new Error('Event not found in the identified audit period.');

        const proof = tree.getProof(index);

        return {
            eventId,
            tableType,
            merkleRoot: anchor.merkleRoot,
            proof,
            leafContent: allEvents[index],
            sealedAt: anchor.createdAt,
            isVerified: tree.verifyProof(allEvents[index], proof, anchor.merkleRoot)
        };
    }

    /**
     * Proves total database integrity between anchors
     */
    async verifyHashChain() {
        const anchors = await db.select().from(auditAnchors).orderBy(auditAnchors.createdAt);
        const chainStatus = [];

        for (let i = 1; i < anchors.length; i++) {
            const current = anchors[i];
            const previous = anchors[i - 1];
            chainStatus.push({
                anchorId: current.id,
                chainValid: current.previousAnchorHash === previous.merkleRoot,
                timestamp: current.createdAt
            });
        }

        return chainStatus;
    }
}

export default new AuditVerifierService();
