import db from '../config/db.js';
import { securityEvents, ledgerEntries, auditAnchors } from '../db/schema.js';
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import { MerkleTree } from '../utils/merkleTree.js';
import { logInfo } from '../utils/logger.js';

/**
 * AuditSealerService - Handles the heavy lifting of cryptographic sealing (#475)
 */
class AuditSealerService {
    /**
     * Executes the sealing process for a timeframe
     */
    async sealHistoricalRange(periodStart, periodEnd) {
        logInfo(`[AuditSealer] Sealing range: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

        const [unsealedSecurity, unsealedLedger] = await Promise.all([
            db.select().from(securityEvents).where(
                and(
                    eq(securityEvents.isSealed, false),
                    sql`${securityEvents.createdAt} >= ${periodStart}`,
                    sql`${securityEvents.createdAt} < ${periodEnd}`
                )
            ),
            db.select().from(ledgerEntries).where(
                and(
                    eq(ledgerEntries.isSealed, false),
                    sql`${ledgerEntries.createdAt} >= ${periodStart}`,
                    sql`${ledgerEntries.createdAt} < ${periodEnd}`
                )
            )
        ]);

        const allEvents = this.standardizeEvents(unsealedSecurity, unsealedLedger);
        if (allEvents.length === 0) return null;

        const tree = new MerkleTree(allEvents.map(e => e.leafContent));
        const root = tree.getRoot();

        const [lastAnchor] = await db.select().from(auditAnchors).orderBy(desc(auditAnchors.sealedAt)).limit(1);

        const [newAnchor] = await db.insert(auditAnchors).values({
            merkleRoot: root,
            previousAnchorId: lastAnchor?.id || null,
            eventCount: allEvents.length,
            periodStart,
            periodEnd,
            sealMetadata: {
                securityEventIds: unsealedSecurity.map(e => e.id),
                ledgerEntryIds: unsealedLedger.map(e => e.id)
            }
        }).returning();

        // Bulk update
        await this.markEventsAsSealed(unsealedSecurity, unsealedLedger, newAnchor.id);

        return newAnchor;
    }

    standardizeEvents(security, ledger) {
        const unified = [
            ...security.map(e => ({
                id: e.id,
                userId: e.userId,
                createdAt: e.createdAt,
                type: 'security_events',
                leafContent: {
                    id: e.id,
                    type: 'security_events',
                    actor: e.userId,
                    action: e.eventType,
                    ts: e.createdAt
                }
            })),
            ...ledger.map(e => ({
                id: e.id,
                userId: e.userId,
                createdAt: e.createdAt,
                type: 'ledger_entries',
                leafContent: {
                    id: e.id,
                    type: 'ledger_entries',
                    actor: e.userId,
                    action: e.entryType,
                    amount: e.amount,
                    ts: e.createdAt
                }
            }))
        ];

        return unified.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    async markEventsAsSealed(security, ledger, anchorId) {
        if (security.length > 0) {
            await db.update(securityEvents)
                .set({ isSealed: true, auditAnchorId: anchorId })
                .where(sql`id IN (${sql.join(security.map(e => sql`${e.id}`), sql`, `)})`);
        }
        if (ledger.length > 0) {
            await db.update(ledgerEntries)
                .set({ isSealed: true, auditAnchorId: anchorId })
                .where(sql`id IN (${sql.join(ledger.map(e => sql`${e.id}`), sql`, `)})`);
        }
    }
}

export default new AuditSealerService();
