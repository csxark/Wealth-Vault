/**
 * Recovery Workflow Orchestrator
 * State machine managing multi-day "Cure Period" for social recovery
 * Handles guardian consensus, challenge mechanisms, and recovery execution
 */

import { db } from '../config/db.js';
import { recoveryRequests, guardianVotes, vaultGuardians, vaults, users } from '../db/schema.js';
import { eq, and, or, inArray } from 'drizzle-orm';
import { reconstructSecretFromShards, getVaultThreshold } from './sssService.js';
import { hashSecret } from '../utils/cryptoShards.js';

/**
 * Initiate a recovery request
 * @param {string} vaultId - UUID of vault
 * @param {string} initiatorGuardianId - UUID of guardian initiating recovery
 * @param {string} newOwnerEmail - Email of new owner
 * @param {number} curePeriodDays - Days to wait before execution (default 7)
 * @returns {Promise<object>}
 */
export async function initiateRecovery(vaultId, initiatorGuardianId, newOwnerEmail, curePeriodDays = 7) {
    // Verify guardian exists and has permission
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(eq(vaultGuardians.id, initiatorGuardianId));

    if (!guardian) {
        throw new Error('Guardian not found');
    }

    if (!guardian.canInitiateRecovery) {
        throw new Error('Guardian does not have permission to initiate recovery');
    }

    // Get threshold requirements
    const { threshold, totalShards } = await getVaultThreshold(vaultId);

    // Calculate expiration timestamps
    const initiatedAt = new Date();
    const cureExpiresAt = new Date(Date.now() + curePeriodDays * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days absolute

    // Create recovery request
    const [recovery] = await db.insert(recoveryRequests).values({
        vaultId,
        userId: guardian.userId,
        initiatorGuardianId,
        requiredShards: threshold,
        totalShards,
        status: 'initiated',
        curePeriodDays,
        cureExpiresAt,
        newOwnerEmail,
        shardsCollected: 0,
        initiatedAt,
        expiresAt,
        auditLog: [{
            timestamp: initiatedAt.toISOString(),
            action: 'recovery_initiated',
            actor: guardian.guardianName,
            details: `Recovery initiated for vault ${vaultId}`
        }]
    }).returning();

    console.log(`🚨 Recovery initiated for vault ${vaultId} by guardian ${guardian.guardianName}`);
    console.log(`   Required shards: ${threshold}/${totalShards}, Cure period: ${curePeriodDays} days`);

    return recovery;
}

/**
 * Submit a guardian shard for recovery
 * @param {string} recoveryRequestId - UUID of recovery request
 * @param {string} guardianId - UUID of guardian
 * @param {string} decryptedShard - Decrypted shard data (hex)
 * @returns {Promise<object>}
 */
export async function submitGuardianShard(recoveryRequestId, guardianId, decryptedShard) {
    // Get recovery request
    const [recovery] = await db.select()
        .from(recoveryRequests)
        .where(eq(recoveryRequests.id, recoveryRequestId));

    if (!recovery) {
        throw new Error('Recovery request not found');
    }

    if (recovery.status === 'expired' || recovery.status === 'rejected') {
        throw new Error(`Recovery request is ${recovery.status}`);
    }

    if (new Date() > new Date(recovery.expiresAt)) {
        // Mark as expired
        await updateRecoveryStatus(recoveryRequestId, 'expired', 'Maximum time limit exceeded');
        throw new Error('Recovery request has expired');
    }

    // Get guardian details
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(eq(vaultGuardians.id, guardianId));

    if (!guardian) {
        throw new Error('Guardian not found');
    }

    // Check if guardian already submitted
    const existing = await db.select()
        .from(guardianVotes)
        .where(and(
            eq(guardianVotes.recoveryRequestId, recoveryRequestId),
            eq(guardianVotes.guardianId, guardianId),
            eq(guardianVotes.voteType, 'shard_submission')
        ));

    if (existing.length > 0) {
        throw new Error('Guardian has already submitted their shard');
    }

    // Record shard submission
    const [vote] = await db.insert(guardianVotes).values({
        recoveryRequestId,
        guardianId,
        voteType: 'shard_submission',
        submittedShard: decryptedShard,
        shardVerified: true, // Verification happens in reconstruction
        submittedAt: new Date(),
        metadata: {
            shardIndex: guardian.shardIndex,
            guardianName: guardian.guardianName
        }
    }).returning();

    // Update shard count
    const updatedCount = recovery.shardsCollected + 1;
    await db.update(recoveryRequests)
        .set({
            shardsCollected: updatedCount,
            auditLog: [
                ...recovery.auditLog,
                {
                    timestamp: new Date().toISOString(),
                    action: 'shard_submitted',
                    actor: guardian.guardianName,
                    details: `Shard ${guardian.shardIndex} submitted (${updatedCount}/${recovery.requiredShards})`
                }
            ]
        })
        .where(eq(recoveryRequests.id, recoveryRequestId));

    console.log(`🔑 Shard ${guardian.shardIndex} submitted by ${guardian.guardianName} (${updatedCount}/${recovery.requiredShards})`);

    // Check if threshold reached
    if (updatedCount >= recovery.requiredShards) {
        await attemptSecretReconstruction(recoveryRequestId);
    }

    return vote;
}

/**
 * Attempt to reconstruct secret from collected shards
 * @param {string} recoveryRequestId - UUID of recovery request
 * @returns {Promise<boolean>}
 */
async function attemptSecretReconstruction(recoveryRequestId) {
    console.log(`🔓 Attempting secret reconstruction for recovery ${recoveryRequestId}...`);

    // Get all submitted shards
    const votes = await db.select()
        .from(guardianVotes)
        .leftJoin(vaultGuardians, eq(guardianVotes.guardianId, vaultGuardians.id))
        .where(and(
            eq(guardianVotes.recoveryRequestId, recoveryRequestId),
            eq(guardianVotes.voteType, 'shard_submission')
        ));

    const submittedShards = votes.map(v => ({
        shardIndex: v.vault_guardians.shardIndex,
        decryptedShard: v.guardian_votes.submittedShard
    }));

    // Reconstruct secret
    const { success, reconstructedSecret, secretHash } = await reconstructSecretFromShards(
        recoveryRequestId,
        submittedShards
    );

    if (success) {
        // Update recovery status to cure_period
        await db.update(recoveryRequests)
            .set({
                status: 'cure_period',
                reconstructedSecretHash: secretHash,
                auditLog: db.raw(`audit_log || jsonb_build_array(jsonb_build_object(
                    'timestamp', now(),
                    'action', 'secret_reconstructed',
                    'details', 'Secret successfully reconstructed, entering cure period'
                ))`)
            })
            .where(eq(recoveryRequests.id, recoveryRequestId));

        console.log(`✅ Secret reconstructed successfully, entering cure period`);
        return true;
    } else {
        console.error(`❌ Secret reconstruction failed`);
        return false;
    }
}

/**
 * Challenge a recovery request
 * @param {string} recoveryRequestId - UUID of recovery request
 * @param {string} challengerUserId - UUID of user challenging
 * @param {string} reason - Reason for challenge
 * @returns {Promise<object>}
 */
export async function challengeRecovery(recoveryRequestId, challengerUserId, reason) {
    const [recovery] = await db.select()
        .from(recoveryRequests)
        .where(eq(recoveryRequests.id, recoveryRequestId));

    if (!recovery) {
        throw new Error('Recovery request not found');
    }

    if (recovery.status !== 'cure_period') {
        throw new Error('Can only challenge recovery during cure period');
    }

    // Update status to challenged
    await db.update(recoveryRequests)
        .set({
            status: 'challenged',
            challengedAt: new Date(),
            challengedByUserId: challengerUserId,
            challengeReason: reason,
            auditLog: db.raw(`audit_log || jsonb_build_array(jsonb_build_object(
                'timestamp', now(),
                'action', 'recovery_challenged',
                'actor', '${challengerUserId}',
                'details', '${reason}'
            ))`)
        })
        .where(eq(recoveryRequests.id, recoveryRequestId));

    console.log(`⚠️ Recovery ${recoveryRequestId} challenged by user ${challengerUserId}: ${reason}`);

    return recovery;
}

/**
 * Approve recovery request (after cure period expires without challenge)
 * @param {string} recoveryRequestId - UUID of recovery request
 * @returns {Promise<object>}
 */
export async function approveRecovery(recoveryRequestId) {
    const [recovery] = await db.select()
        .from(recoveryRequests)
        .where(eq(recoveryRequests.id, recoveryRequestId));

    if (!recovery) {
        throw new Error('Recovery request not found');
    }

    if (recovery.status !== 'cure_period') {
        throw new Error('Recovery must be in cure_period status');
    }

    if (new Date() < new Date(recovery.cureExpiresAt)) {
        throw new Error('Cure period has not expired yet');
    }

    // Update status to approved
    await db.update(recoveryRequests)
        .set({
            status: 'approved',
            auditLog: db.raw(`audit_log || jsonb_build_array(jsonb_build_object(
                'timestamp', now(),
                'action', 'recovery_approved',
                'details', 'Cure period expired without challenge'
            ))`)
        })
        .where(eq(recoveryRequests.id, recoveryRequestId));

    console.log(`✅ Recovery ${recoveryRequestId} approved - ready for execution`);

    return recovery;
}

/**
 * Execute recovery (transfer vault ownership)
 * @param {string} recoveryRequestId - UUID of recovery request
 * @param {string} executorUserId - UUID of user executing recovery
 * @returns {Promise<object>}
 */
export async function executeRecovery(recoveryRequestId, executorUserId) {
    const [recovery] = await db.select()
        .from(recoveryRequests)
        .where(eq(recoveryRequests.id, recoveryRequestId));

    if (!recovery) {
        throw new Error('Recovery request not found');
    }

    if (recovery.status !== 'approved') {
        throw new Error('Recovery must be approved before execution');
    }

    // Get or create new owner user
    let newOwnerId = recovery.newOwnerUserId;
    if (!newOwnerId) {
        // Check if email exists in database
        const [existingUser] = await db.select()
            .from(users)
            .where(eq(users.email, recovery.newOwnerEmail));

        if (existingUser) {
            newOwnerId = existingUser.id;
        } else {
            throw new Error('New owner must create account before vault transfer');
        }
    }

    // Transfer vault ownership
    await db.update(vaults)
        .set({
            userId: newOwnerId,
            updatedAt: new Date()
        })
        .where(eq(vaults.id, recovery.vaultId));

    // Mark recovery as executed
    await db.update(recoveryRequests)
        .set({
            status: 'executed',
            newOwnerUserId: newOwnerId,
            executedAt: new Date(),
            executedByUserId: executorUserId,
            completedAt: new Date(),
            auditLog: db.raw(`audit_log || jsonb_build_array(jsonb_build_object(
                'timestamp', now(),
                'action', 'recovery_executed',
                'actor', '${executorUserId}',
                'details', 'Vault ownership transferred to new owner'
            ))`)
        })
        .where(eq(recoveryRequests.id, recoveryRequestId));

    console.log(`🎉 Recovery ${recoveryRequestId} executed successfully - vault transferred to ${recovery.newOwnerEmail}`);

    return {
        recoveryRequestId,
        vaultId: recovery.vaultId,
        newOwnerId,
        executedAt: new Date()
    };
}

/**
 * Reject recovery request
 * @param {string} recoveryRequestId - UUID of recovery request
 * @param {string} reason - Reason for rejection
 * @returns {Promise<object>}
 */
export async function rejectRecovery(recoveryRequestId, reason) {
    await updateRecoveryStatus(recoveryRequestId, 'rejected', reason);
    console.log(`❌ Recovery ${recoveryRequestId} rejected: ${reason}`);
    return { success: true };
}

/**
 * Update recovery status with audit log
 * @param {string} recoveryRequestId - UUID of recovery request
 * @param {string} newStatus - New status
 * @param {string} details - Details
 * @returns {Promise<object>}
 */
async function updateRecoveryStatus(recoveryRequestId, newStatus, details) {
    const [updated] = await db.update(recoveryRequests)
        .set({
            status: newStatus,
            completedAt: ['executed', 'rejected', 'expired'].includes(newStatus) ? new Date() : null,
            auditLog: db.raw(`audit_log || jsonb_build_array(jsonb_build_object(
                'timestamp', now(),
                'action', 'status_change',
                'newStatus', '${newStatus}',
                'details', '${details}'
            ))`)
        })
        .where(eq(recoveryRequests.id, recoveryRequestId))
        .returning();

    return updated;
}

/**
 * Get recovery request details
 * @param {string} recoveryRequestId - UUID of recovery request
 * @returns {Promise<object>}
 */
export async function getRecoveryRequest(recoveryRequestId) {
    const [recovery] = await db.select()
        .from(recoveryRequests)
        .where(eq(recoveryRequests.id, recoveryRequestId));

    if (!recovery) {
        throw new Error('Recovery request not found');
    }

    // Get guardian votes
    const votes = await db.select()
        .from(guardianVotes)
        .leftJoin(vaultGuardians, eq(guardianVotes.guardianId, vaultGuardians.id))
        .where(eq(guardianVotes.recoveryRequestId, recoveryRequestId));

    return {
        ...recovery,
        votes: votes.map(v => ({
            ...v.guardian_votes,
            guardianName: v.vault_guardians.guardianName,
            guardianRole: v.vault_guardians.guardianRole
        }))
    };
}

/**
 * Get all recovery requests for a vault
 * @param {string} vaultId - UUID of vault
 * @returns {Promise<Array>}
 */
export async function getVaultRecoveryRequests(vaultId) {
    return await db.select()
        .from(recoveryRequests)
        .where(eq(recoveryRequests.vaultId, vaultId))
        .orderBy(db.desc(recoveryRequests.initiatedAt));
}

export default {
    initiateRecovery,
    submitGuardianShard,
    challengeRecovery,
    approveRecovery,
    executeRecovery,
    rejectRecovery,
    getRecoveryRequest,
    getVaultRecoveryRequests
};
