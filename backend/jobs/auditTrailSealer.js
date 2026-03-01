import cron from 'node-cron';
import db from '../config/db.js';
import { securityEvents, auditLogs, auditAnchors } from '../db/schema.js';
import { eq, and, gt, lt, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import MerkleTree from '../utils/merkleTree.js';
import crypto from 'crypto';

/**
 * AuditTrailSealer (#475)
 * Periodically aggregates security and audit events into a Merkle Tree.
 */
class AuditTrailSealer {
    start() {
        // Run every hour
        cron.schedule('0 * * * *', async () => {
            await this.sealPeriodicAudit();
        });
        logInfo('AuditTrailSealer scheduled (hourly)');
    }

    async sealPeriodicAudit() {
        logInfo('🧱 Starting hourly Audit Trail sealing...');

        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

            // 1. Fetch high-stake events
            const [securityData, auditData] = await Promise.all([
                db.select().from(securityEvents)
                    .where(and(
                        gt(securityEvents.createdAt, oneHourAgo),
                        lt(securityEvents.createdAt, now)
                    )),
                db.select().from(auditLogs)
                    .where(and(
                        gt(auditLogs.performedAt, oneHourAgo),
                        lt(auditLogs.performedAt, now)
                    ))
            ]);

            // 2. Format into consistent leaves (Object-based)
            const allEvents = [
                ...securityData.map(e => ({
                    id: e.id,
                    type: 'security_event',
                    actorId: e.userId,
                    action: e.eventType,
                    payload: e.details,
                    timestamp: e.createdAt
                })),
                ...auditData.map(e => ({
                    id: e.id,
                    type: 'audit_log',
                    actorId: e.userId,
                    action: e.action,
                    payload: e.delta,
                    timestamp: e.performedAt
                }))
            ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (allEvents.length === 0) {
                logInfo('[AuditTrailSealer] No events to seal in this period.');
                return;
            }

            // 3. Build Merkle Tree
            const tree = new MerkleTree(allEvents);
            const root = tree.getRoot();

            // 4. Chain to previous anchor
            const [lastAnchor] = await db.select()
                .from(auditAnchors)
                .orderBy(desc(auditAnchors.createdAt))
                .limit(1);

            // 5. Publish Anchor
            const [anchor] = await db.insert(auditAnchors).values({
                merkleRoot: root,
                previousAnchorHash: lastAnchor ? lastAnchor.merkleRoot : '0'.repeat(64),
                startSlot: oneHourAgo,
                endSlot: now,
                eventCount: allEvents.length
            }).returning();

            // 6. Mark events as sealed
            await db.update(securityEvents)
                .set({ isSealed: true, auditAnchorId: anchor.id })
                .where(and(gt(securityEvents.createdAt, oneHourAgo), lt(securityEvents.createdAt, now)));

            await db.update(auditLogs)
                .set({ isSealed: true, auditAnchorId: anchor.id })
                .where(and(gt(auditLogs.performedAt, oneHourAgo), lt(auditLogs.performedAt, now)));

            logInfo(`✅ Audit period sealed. Root: ${root.substring(0, 16)}... | Events: ${allEvents.length}`);

        } catch (err) {
            logError('Audit Sealing failed:', err);
        }
    }
}

export default new AuditTrailSealer();
