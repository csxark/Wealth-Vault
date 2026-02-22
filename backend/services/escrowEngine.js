import { escrowContracts, escrowSignatures, oracleEvents, vaults, vaultLocks, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import vaultService from './vaultService.js';
import cryptoUtils from '../utils/cryptoUtils.js';
import escrowRiskService from './escrowRiskService.js';
import { logInfo, logError } from '../utils/logger.js';
import db from '../config/db.js';

class EscrowEngine {
    /**
     * Draft a new escrow contract
     */
    async draftContract(userId, data) {
        const { payerId, payeeId, vaultId, amount, currency, escrowType, releaseConditions, metadata } = data;

        // Perform real-time risk assessment (L3)
        const riskScore = await escrowRiskService.calculateRiskScore({ amount, escrowType, releaseConditions, payeeId });
        const riskAnalysis = await escrowRiskService.analyzeMetadata(metadata || {});

        const updatedMetadata = {
            ...(metadata || {}),
            riskScore,
            riskLevel: riskAnalysis.riskLevel,
            riskInsights: riskAnalysis.insights,
            assessedAt: new Date()
        };

        const [contract] = await db.insert(escrowContracts).values({
            userId,
            creatorId: userId,
            payerId,
            payeeId,
            vaultId,
            amount: amount.toString(),
            currency: currency || 'USD',
            escrowType,
            releaseConditions,
            status: 'draft',
            metadata: updatedMetadata
        }).returning();

        logInfo(`[Escrow Engine] Drafted contract ${contract.id} with risk score ${riskScore}`);
        return contract;
    }

    /**
     * Activate contract and lock funds
     */
    async activateContract(contractId, userId) {
        return await db.transaction(async (tx) => {
            const contract = await tx.query.escrowContracts.findFirst({
                where: eq(escrowContracts.id, contractId)
            });

            if (!contract) throw new Error('Contract not found');
            if (contract.status !== 'draft') throw new Error('Contract already active or processed');
            if (contract.payerId !== userId) throw new Error('Only the payer can activate the contract');

            // Lock funds in vault
            await vaultService.lockBalance(
                userId,
                contract.vaultId,
                contract.amount,
                'escrow',
                'escrow_contract',
                contract.id
            );

            const [updatedContract] = await tx.update(escrowContracts)
                .set({ status: 'active', updatedAt: new Date() })
                .where(eq(escrowContracts.id, contractId))
                .returning();

            logInfo(`[Escrow Engine] Activated contract ${contractId}, funds locked.`);
            return updatedContract;
        });
    }

    /**
     * Release funds to payee
     */
    async releaseFunds(contractId, triggerSource = 'manual') {
        return await db.transaction(async (tx) => {
            const contract = await tx.query.escrowContracts.findFirst({
                where: eq(escrowContracts.id, contractId)
            });

            if (!contract || contract.status !== 'active') {
                throw new Error('Contract not in active state');
            }

            // Verify conditions (Simplified)
            // In a real system, we'd check oracleEvents or signatures here

            // Find the lock
            const lock = await tx.query.vaultLocks.findFirst({
                where: and(
                    eq(vaultLocks.referenceId, contractId),
                    eq(vaultLocks.status, 'active')
                )
            });

            if (lock) {
                await vaultService.releaseLock(lock.id, contract.userId);
            }
            const [updatedContract] = await tx.update(escrowContracts)
                .set({ status: 'released', updatedAt: new Date() })
                .where(eq(escrowContracts.id, contractId))
                .returning();

            logInfo(`[Escrow Engine] Released funds for contract ${contractId}`);
            return updatedContract;
        });
    }

    /**
     * Refund funds to payer
     */
    async refundPayer(contractId) {
        // Similar to release but returns to payer
    }

    /**
     * Propose a signature for release
     */
    async submitSignature(contractId, userId, signatureData) {
        const { signature, publicKey, signedData } = signatureData;

        // Verify signature
        const isValid = cryptoUtils.verifySignature(signedData, signature, publicKey);
        if (!isValid) throw new Error('Invalid cryptographic signature');

        const [sig] = await db.insert(escrowSignatures).values({
            escrowId: contractId,
            signerId: userId,
            signature,
            publicKey,
            signedData
        }).returning();

        // Check if threshold reached
        await this.evaluateReleaseConditions(contractId);

        return sig;
    }

    /**
     * Evaluate if release conditions are met
     */
    async evaluateReleaseConditions(contractId) {
        const contract = await db.query.escrowContracts.findFirst({
            where: eq(escrowContracts.id, contractId),
            with: {
                signatures: true
            }
        });

        if (!contract || contract.status !== 'active') return;

        const { releaseConditions } = contract;

        // 1. Check Multi-Sig condition
        if (releaseConditions.type === 'multi_sig') {
            const validSigs = contract.signatures.length;
            if (validSigs >= releaseConditions.requiredSignatures) {
                await this.releaseFunds(contractId, 'multi_sig_threshold');
            }
        }

        // 2. Check Oracle condition
        if (releaseConditions.type === 'oracle_event') {
            const event = await db.query.oracleEvents.findFirst({
                where: and(
                    eq(oracleEvents.eventType, releaseConditions.eventType),
                    eq(oracleEvents.externalId, releaseConditions.externalId),
                    eq(oracleEvents.status, 'verified')
                )
            });

            if (event) {
                await this.releaseFunds(contractId, 'oracle_verified');
            }
        }
    }
}

export default new EscrowEngine();
