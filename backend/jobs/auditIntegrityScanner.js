import cron from 'node-cron';
import db from '../config/db.js';
import { auditAnchors, securityEvents, ledgerEntries } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import auditSealerService from '../services/auditSealerService.js';
import { MerkleTree } from '../utils/merkleTree.js';
import { logInfo, logError, logWarning } from '../utils/logger.js';

/**
 * AuditIntegrityScanner (#475)
 * Daily job to verify that no sealed database rows have been altered.
 */
class AuditIntegrityScanner {
    start() {
        cron.schedule('0 2 * * *', async () => {
            await this.verifyAllAnchors();
        });
        logInfo('AuditIntegrityScanner Job scheduled (daily at 2 AM)');
    }

    async verifyAllAnchors() {
        logInfo('🔍 Starting Global Audit Integrity Scan...');
        const anchors = await db.select().from(auditAnchors).orderBy(auditAnchors.sealedAt);

        let tamperedCount = 0;

        for (const anchor of anchors) {
            try {
                const [periodSecurity, periodLedger] = await Promise.all([
                    db.select().from(securityEvents).where(eq(securityEvents.auditAnchorId, anchor.id)),
                    db.select().from(ledgerEntries).where(eq(ledgerEntries.auditAnchorId, anchor.id))
                ]);

                const allEvents = auditSealerService.standardizeEvents(periodSecurity, periodLedger);

                if (allEvents.length !== anchor.eventCount) {
                    logWarning(`Mismatch in event count for anchor ${anchor.id}. Expected ${anchor.eventCount}, found ${allEvents.length}.`);
                    tamperedCount++;
                    continue;
                }

                const tree = new MerkleTree(allEvents.map(e => e.leafContent));
                if (tree.getRoot() !== anchor.merkleRoot) {
                    logError(`‼️ TAMPERING DETECTED at anchor ${anchor.id}. Merkle Root mismatch!`);
                    tamperedCount++;
                }

            } catch (error) {
                logError(`Failed to verify anchor ${anchor.id}:`, error);
            }
        }

        if (tamperedCount === 0) {
            logInfo('✅ Global Audit Integrity Scan: OK. No tampering detected.');
        } else {
            logError(`🚨 Global Audit Integrity Scan COMPLETE: FOUND ${tamperedCount} COMPROMISED ANCHORS!`);
        }
    }
}

export default new AuditIntegrityScanner();
