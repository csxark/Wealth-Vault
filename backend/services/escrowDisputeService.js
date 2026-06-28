import db from '../config/db.js';
import { escrowDisputes, escrowContracts, vaultLocks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import vaultService from './vaultService.js';

class EscrowDisputeService {
    /**
     * Open a dispute for an escrow contract
     */
    async openDispute(userId, escrowId, reason, evidence) {
        return await db.transaction(async (tx) => {
            const contract = await tx.query.escrowContracts.findFirst({
                where: eq(escrowContracts.id, escrowId)
            });

            if (!contract || contract.status !== 'active') {
                throw new Error('Can only dispute active escrow contracts');
            }

            const [dispute] = await tx.insert(escrowDisputes).values({
                escrowId,
                initiatorId: userId,
                reason,
                evidence,
                status: 'open'
            }).returning();

            await tx.update(escrowContracts)
                .set({ status: 'disputed', updatedAt: new Date() })
                .where(eq(escrowContracts.id, escrowId));

            logInfo(`[Dispute Service] Dispute opened for escrow ${escrowId} by user ${userId}`);
            return dispute;
        });
    }

    /**
     * Resolve a dispute
     */
    async resolveDispute(disputeId, resolution, resolverId) {
        return await db.transaction(async (tx) => {
            const dispute = await tx.query.escrowDisputes.findFirst({
                where: eq(escrowDisputes.id, disputeId),
                with: { escrow: true }
            });

            if (!dispute || dispute.status !== 'open') {
                throw new Error('Dispute not found or already resolved');
            }

            const escrowId = dispute.escrowId;
            const contract = dispute.escrow;

            if (resolution === 'refund_to_payer') {
                // Find the lock and void it
                const lock = await tx.query.vaultLocks.findFirst({
                    where: and(
                        eq(vaultLocks.referenceId, escrowId),
                        eq(vaultLocks.status, 'active')
                    )
                });

                if (lock) {
                    await vaultService.voidLock(lock.id, contract.userId);
                }

                await tx.update(escrowContracts)
                    .set({ status: 'refunded', updatedAt: new Date() })
                    .where(eq(escrowContracts.id, escrowId));

            } else if (resolution === 'release_to_payee') {
                // Release logic (similar to escrowEngine.releaseFunds)
                const lock = await tx.query.vaultLocks.findFirst({
                    where: and(
                        eq(vaultLocks.referenceId, escrowId),
                        eq(vaultLocks.status, 'active')
                    )
                });

                if (lock) {
                    await vaultService.releaseLock(lock.id, contract.userId);
                }

                await tx.update(escrowContracts)
                    .set({ status: 'released', updatedAt: new Date() })
                    .where(eq(escrowContracts.id, escrowId));
            }

            const [updatedDispute] = await tx.update(escrowDisputes)
                .set({
                    status: 'resolved',
                    resolution,
                    resolvedAt: new Date(),
                    metadata: { resolvedBy: resolverId }
                })
                .where(eq(escrowDisputes.id, disputeId))
                .returning();

            logInfo(`[Dispute Service] Dispute ${disputeId} resolved as ${resolution}`);
            return updatedDispute;
        });
    }

    /**
     * Escalate to arbitration
     */
    async escalateToArbitration(disputeId) {
        const [updated] = await db.update(escrowDisputes)
            .set({ status: 'arbitration_pending', updatedAt: new Date() })
            .where(eq(escrowDisputes.id, disputeId))
            .returning();

        logInfo(`[Dispute Service] Dispute ${disputeId} escalated to arbitration`);
        return updated;
    }
}

export default new EscrowDisputeService();
