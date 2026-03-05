import db from '../config/db.js';
import auditSealerService from '../services/auditSealerService.js';
import auditVerifierService from '../services/auditVerifierService.js';
import { securityEvents } from '../db/schema.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Audit Diagnostic Tool (#475)
 * Run with: node backend/scripts/audit_diag.js
 */
async function diagnostic() {
    logInfo('🚀 Starting Audit Diagnostic...');

    try {
        // 1. Create a dummy security event
        logInfo('Step 1: Creating test event...');
        const [event] = await db.insert(securityEvents).values({
            userId: (await db.query.users.findFirst()).id,
            eventType: 'DIAGNOSTIC_TEST',
            status: 'info',
            details: { test: true, ts: Date.now() }
        }).returning();

        logInfo(`Event created: ${event.id}`);

        // 2. Trigger Sealing
        logInfo('Step 2: Triggering manual seal...');
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);

        const anchor = await auditSealerService.sealHistoricalRange(start, end);
        if (anchor) {
            logInfo(`✅ Anchor created: ${anchor.id}. Root: ${anchor.merkleRoot}`);
        } else {
            logWarning('No events found to seal.');
        }

        // 3. Verify Integrity
        logInfo('Step 3: Generating proof of innocence...');
        const proof = await auditVerifierService.getProofOfInnocence(event.id, 'security_events');

        if (proof.isVerified) {
            logInfo('🏆 CRYPTOGRAPHIC VERIFICATION SUCCESSFUL!');
            logInfo(`Merkle Root: ${proof.merkleRoot}`);
            logInfo(`Proof length: ${proof.proof.length}`);
        } else {
            logError('❌ VERIFICATION FAILED!');
        }

        // 4. Verify Chain
        logInfo('Step 4: Verifying hash chain...');
        const chain = await auditVerifierService.verifyHashChain();
        logInfo(`Chain verified. Length: ${chain.length}`);

    } catch (error) {
        logError('Diagnostic failed:', error);
    } finally {
        process.exit();
    }
}

diagnostic();
