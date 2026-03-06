import { db } from '../db/index.js';
import { settlements, internalLedger } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import ledgerTracker from './ledgerTracker.js';
import { logInfo, logError } from '../utils/logger.js';

class SettlementEngine {
    /**
     * Executes an atomic transfer between two internal vaults with double-entry safety
     */
    async executeInternalSettlement(settlementId) {
        logInfo(`Executing settlement: ${settlementId}`);

        try {
            return await db.transaction(async (tx) => {
                const settlementData = await tx.select()
                    .from(settlements)
                    .where(eq(settlements.id, settlementId))
                    .limit(1);

                if (settlementData.length === 0) throw new Error('Settlement record not found');
                const s = settlementData[0];

                if (s.status !== 'pending') throw new Error('Settlement is not in pending status');

                // 1. Debit Source Vault (Atomic)
                await ledgerTracker.recordTransaction(tx, {
                    userId: s.userId,
                    vaultId: s.sourceVaultId,
                    type: 'debit',
                    amount: s.amount,
                    currency: s.currency,
                    description: `Internal Transfer to Vault ${s.destinationVaultId}`,
                    referenceType: 'settlement',
                    referenceId: s.id
                });

                // 2. Credit Destination Vault (Atomic)
                await ledgerTracker.recordTransaction(tx, {
                    userId: s.userId,
                    vaultId: s.destinationVaultId,
                    type: 'credit',
                    amount: s.amount,
                    currency: s.currency,
                    description: `Internal Transfer from Vault ${s.sourceVaultId}`,
                    referenceType: 'settlement',
                    referenceId: s.id
                });

                // 3. Update status to completed
                await tx.update(settlements)
                    .set({
                        status: 'completed',
                        executionDate: new Date(),
                        updatedAt: new Date()
                    })
                    .where(eq(settlements.id, s.id));

                logInfo(`Settlement ${s.id} completed successfully`);
                return { success: true, settlementId: s.id };
            });
        } catch (error) {
            logError(`Settlement ${settlementId} failed to execute:`, error);

            // Mark as failed if record exists and transaction failed
            await db.update(settlements)
                .set({
                    status: 'failed',
                    failureReason: error.message,
                    updatedAt: new Date()
                })
                .where(eq(settlements.id, settlementId));

            throw error;
        }
    }

    /**
     * Creates a new internal settlement request
     */
    async createSettlementRequest(userId, sourceVaultId, destVaultId, amount, currency = 'USD') {
        const [newSettlement] = await db.insert(settlements).values({
            userId,
            sourceVaultId,
            destinationVaultId: destVaultId,
            amount: amount.toString(),
            currency,
            status: 'pending'
        }).returning();

        return newSettlement;
    }

    /**
     * Handles P2P Settlement (Transfer between User A and User B)
     */
    async processP2PTransfer(senderId, receiverId, amount, currency, senderVaultId, receiverVaultId) {
        logInfo(`Processing P2P Transfer from ${senderId} to ${receiverId}`);

        return await db.transaction(async (tx) => {
            // 1. Debit Sender
            await ledgerTracker.recordTransaction(tx, {
                userId: senderId,
                vaultId: senderVaultId,
                type: 'debit',
                amount,
                currency,
                description: `P2P Transfer to User ${receiverId}`,
                referenceType: 'p2p_transfer',
            });

            // 2. Credit Receiver
            await ledgerTracker.recordTransaction(tx, {
                userId: receiverId,
                vaultId: receiverVaultId,
                type: 'credit',
                amount,
                currency,
                description: `P2P Transfer from User ${senderId}`,
                referenceType: 'p2p_transfer',
            });

            return { success: true };
        });
    }
}

export default new SettlementEngine();
