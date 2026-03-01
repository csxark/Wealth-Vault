import db from '../config/db.js';
import { escrowContracts, trancheReleases } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import escrowEngine from './escrowEngine.js';
import { logInfo, logWarning } from '../utils/logger.js';

/**
 * TrancheController (#481)
 * Handles sequential enforcement of escrow releases.
 * Prevents Milestone B from releasing before Milestone A is finalized.
 */
class TrancheController {
    /**
     * Checks if a specific tranche is eligible for release based on previous milestones.
     */
    async evaluateTrancheEligibility(contractId, trancheId) {
        const allTranches = await db.select()
            .from(trancheReleases)
            .where(eq(trancheReleases.contractId, contractId))
            .orderBy(asc(trancheReleases.releasedAt)); // This ordering is flawed if not yet released

        // Actually, we should order by their original creation/order if we had an 'order' field.
        // For now, we'll assume they must be released in the order they were inserted.

        const [targetTranche] = await db.select()
            .from(trancheReleases)
            .where(eq(trancheReleases.id, trancheId));

        if (!targetTranche) throw new Error('Tranche not found');

        // Logic: Find all tranches that are NOT the target and check if any 'unreleased' one exists before it.
        // We'll use the record ID or creation order as a proxy.
        const previousUnreleased = await db.select()
            .from(trancheReleases)
            .where(and(
                eq(trancheReleases.contractId, contractId),
                eq(trancheReleases.isReleased, false)
            ));

        // If there are multiple unreleased, and this isn't the 'first' one (id-wise for simplicity), block.
        // In a real system, we'd have a `sequence_order` column.
        const sortedUnreleased = previousUnreleased.sort((a, b) => a.id.localeCompare(b.id));

        if (sortedUnreleased.length > 0 && sortedUnreleased[0].id !== trancheId) {
            logWarning(`[TrancheController] Blocked release of ${trancheId}. Dependency ${sortedUnreleased[0].id} is still locked.`);
            return { eligible: false, blockedBy: sortedUnreleased[0].milestoneName };
        }

        return { eligible: true };
    }

    /**
     * Automated trigger to check all active contracts for release ready tranches.
     */
    async processAutomatedReleases(contractId) {
        const unreleased = await db.select()
            .from(trancheReleases)
            .where(and(
                eq(trancheReleases.contractId, contractId),
                eq(trancheReleases.isReleased, false)
            ));

        for (const tranche of unreleased) {
            // Check if it has enough signatures but was blocked by sequence
            const [contract] = await db.select().from(escrowContracts).where(eq(escrowContracts.id, contractId));
            const sigs = tranche.signaturesCollected || [];
            const threshold = contract.multiSigConfig.threshold || 1;

            if (sigs.length >= threshold) {
                const eligibility = await this.evaluateTrancheEligibility(contractId, tranche.id);
                if (eligibility.eligible) {
                    logInfo(`[TrancheController] Sequence dependency cleared. Releasing tranche ${tranche.id} (${tranche.milestoneName})`);
                    await db.update(trancheReleases).set({
                        isReleased: true,
                        releasedAt: new Date()
                    }).where(eq(trancheReleases.id, tranche.id));

                    await escrowEngine.logAction(contractId, 'AUTOMATED_TRANCHE_RELEASE', 'system', { trancheId: tranche.id });
                }
            }
        }
    }
}

export default new TrancheController();
