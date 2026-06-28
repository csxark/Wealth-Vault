import db from '../config/db.js';
import { escrowContracts, trancheReleases, escrowAuditLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import trancheController from './trancheController.js';
import EscrowAuditLogUtility from '../utils/escrowAuditLog.js';

/**
 * EscrowEngine (#481)
 * Manages the state machine of high-value fund locks and multi-sig releases.
 */
class EscrowEngine {
    /**
     * Initializes a new escrow lock
     */
    async createEscrow(userId, config) {
        const { title, totalAmount, baseCurrency, escrowCurrency, multiSigConfig, tranches, vaultId } = config;

        const [contract] = await db.insert(escrowContracts).values({
            userId,
            title,
            totalAmount: totalAmount.toString(),
            lockedAmount: totalAmount.toString(),
            baseCurrency,
            escrowCurrency,
            multiSigConfig,
            vaultId,
            status: 'active'
        }).returning();

        // Initialize high-priority tranches
        if (tranches && tranches.length > 0) {
            await db.insert(trancheReleases).values(
                tranches.map((t, idx) => ({
                    contractId: contract.id,
                    milestoneName: t.name,
                    amount: t.amount.toString()
                }))
            );
        }

        await EscrowAuditLogUtility.log(contract.id, 'ESCROW_INITIALIZED', 'system', { totalAmount, currency: escrowCurrency });
        return contract;
    }

    /**
     * Casts a signature on a specific tranche release
     */
    async castTrancheSignature(contractId, trancheId, actorId) {
        const [tranche] = await db.select().from(trancheReleases).where(eq(trancheReleases.id, trancheId));
        const [contract] = await db.select().from(escrowContracts).where(eq(escrowContracts.id, contractId));

        if (!tranche || !contract) throw new Error('Escrow or Tranche not found');
        if (tranche.isReleased) throw new Error('Tranche already released');

        const signatures = tranche.signaturesCollected || [];
        if (signatures.includes(actorId)) throw new Error('Already signed');

        signatures.push(actorId);

        // Check against multi-sig threshold
        const required = contract.multiSigConfig.threshold || 1;
        let isFullySigned = signatures.length >= required;

        const updateData = { signaturesCollected: signatures };

        if (isFullySigned) {
            // New sequencing check
            const eligibility = await trancheController.evaluateTrancheEligibility(contractId, trancheId);
            if (eligibility.eligible) {
                updateData.isReleased = true;
                updateData.releasedAt = new Date();
            } else {
                // Keep signed but blocked
                isFullySigned = false;
                await EscrowAuditLogUtility.log(contractId, 'SIGNATURE_THRESHOLD_MET_BLOCK_SEQUENCE', actorId, { trancheId, blockedBy: eligibility.blockedBy });
            }
        }

        await db.update(trancheReleases).set(updateData).where(eq(trancheReleases.id, trancheId));
        await EscrowAuditLogUtility.log(contractId, 'SIGNATURE_CAST', actorId, { trancheId, thresholdReached: isFullySigned });

        return { isFullySigned, currentSigs: signatures.length };
    }

    // Removed logAction in favor of EscrowAuditLogUtility
}

export default new EscrowEngine();
