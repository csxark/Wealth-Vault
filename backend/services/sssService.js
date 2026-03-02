/**
 * Shamir Secret Sharing Service
 * High-level service for break-glass recovery key management
 * Coordinates shard distribution across guardians for social recovery
 */

import { db } from '../config/db.js';
import { vaultGuardians, vaults } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
    generateMasterSecret,
    splitSecret,
    combineShards,
    hashSecret,
    computeShardChecksum,
    verifyShardChecksum,
    encryptShard,
    decryptShard
} from '../utils/cryptoShards.js';

/**
 * Initialize Shamir Secret Sharing for a vault
 * @param {string} vaultId - UUID of vault
 * @param {string} userId - UUID of vault owner
 * @param {Array} guardians - Array of guardian configs: [{userId, email, name, role, publicKey}]
 * @param {number} threshold - M in M-of-N (minimum shards to reconstruct)
 * @returns {Promise<{masterSecret: Buffer, masterSecretHash: string, guardians: Array}>}
 */
export async function initializeShamirSharingForVault(vaultId, userId, guardians, threshold) {
    if (guardians.length < threshold) {
        throw new Error(`Need at least ${threshold} guardians for threshold ${threshold}`);
    }

    if (threshold < 2) {
        throw new Error('Threshold must be at least 2 for security');
    }

    const totalShards = guardians.length;

    // Generate random 256-bit master secret for vault
    const masterSecret = generateMasterSecret();
    const masterSecretHash = hashSecret(masterSecret);

    console.log(`🔐 Generating ${totalShards} shards with threshold ${threshold} for vault ${vaultId}`);

    // Split master secret into N shards
    const shards = splitSecret(masterSecret, totalShards, threshold);

    // Distribute shards to guardians
    const guardianRecords = [];

    for (let i = 0; i < guardians.length; i++) {
        const guardian = guardians[i];
        const shard = shards[i];

        // Compute checksum for integrity
        const checksum = computeShardChecksum(shard.data);

        // Encrypt shard with guardian's public key
        const encrypted = encryptShard(shard.data, guardian.publicKey || 'default-public-key');

        // Store encrypted shard in database
        const [guardianRecord] = await db.insert(vaultGuardians).values({
            vaultId,
            userId,
            guardianUserId: guardian.userId,
            guardianEmail: guardian.email,
            guardianName: guardian.name,
            guardianRole: guardian.role || 'family',
            shardIndex: shard.index,
            encryptedShard: JSON.stringify(encrypted),
            shardChecksum: checksum,
            canInitiateRecovery: guardian.canInitiateRecovery !== false,
            canApproveTransactions: guardian.canApproveTransactions || false,
            approvalWeight: guardian.approvalWeight || 1,
            isActive: true,
            activatedAt: new Date()
        }).returning();

        guardianRecords.push(guardianRecord);

        console.log(`✅ Shard ${shard.index} assigned to guardian: ${guardian.name} (${guardian.email})`);
    }

    return {
        masterSecret,
        masterSecretHash,
        guardians: guardianRecords,
        threshold,
        totalShards
    };
}

/**
 * Add a guardian to existing vault (requires regenerating all shards)
 * @param {string} vaultId - UUID of vault
 * @param {string} userId - UUID of vault owner
 * @param {object} newGuardian - New guardian config
 * @param {string} masterSecret - Current master secret (hex)
 * @returns {Promise<object>}
 */
export async function addGuardianToVault(vaultId, userId, newGuardian, masterSecret) {
    // Get existing guardians
    const existingGuardians = await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.userId, userId),
            eq(vaultGuardians.isActive, true)
        ));

    // Determine new threshold (maintain same ratio or minimum 3)
    const oldThreshold = Math.ceil(existingGuardians.length * 0.6); // 60% threshold
    const newTotalShards = existingGuardians.length + 1;
    const newThreshold = Math.max(Math.ceil(newTotalShards * 0.6), 3);

    console.log(`🔄 Regenerating shards: ${existingGuardians.length} -> ${newTotalShards}, threshold: ${oldThreshold} -> ${newThreshold}`);

    // Deactivate old guardians
    await db.update(vaultGuardians)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.userId, userId)
        ));

    // Rebuild guardians array with new guardian
    const allGuardians = [
        ...existingGuardians.map(g => ({
            userId: g.guardianUserId,
            email: g.guardianEmail,
            name: g.guardianName,
            role: g.guardianRole,
            publicKey: 'existing-public-key',
            canInitiateRecovery: g.canInitiateRecovery,
            canApproveTransactions: g.canApproveTransactions,
            approvalWeight: g.approvalWeight
        })),
        newGuardian
    ];

    // Reinitialize with new guardian set
    const masterSecretBuffer = Buffer.from(masterSecret, 'hex');
    const result = await initializeShamirSharingForVault(vaultId, userId, allGuardians, newThreshold);

    return {
        ...result,
        oldGuardianCount: existingGuardians.length,
        newGuardianCount: newTotalShards,
        thresholdChange: `${oldThreshold} -> ${newThreshold}`
    };
}

/**
 * Remove a guardian from vault (requires regenerating all shards)
 * @param {string} guardianId - UUID of guardian to remove
 * @param {string} masterSecret - Current master secret (hex)
 * @returns {Promise<object>}
 */
export async function removeGuardianFromVault(guardianId, masterSecret) {
    // Get guardian details
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(eq(vaultGuardians.id, guardianId));

    if (!guardian) {
        throw new Error('Guardian not found');
    }

    const { vaultId, userId } = guardian;

    // Get remaining guardians
    const remainingGuardians = await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.userId, userId),
            eq(vaultGuardians.isActive, true)
        ));

    const filtered = remainingGuardians.filter(g => g.id !== guardianId);

    if (filtered.length < 3) {
        throw new Error('Cannot remove guardian: minimum 3 guardians required');
    }

    // Determine new threshold
    const newThreshold = Math.max(Math.ceil(filtered.length * 0.6), 3);

    console.log(`🗑️ Removing guardian ${guardian.guardianName}, regenerating ${filtered.length} shards`);

    // Deactivate all guardians
    await db.update(vaultGuardians)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.userId, userId)
        ));

    // Reinitialize with remaining guardians
    const guardianConfigs = filtered.map(g => ({
        userId: g.guardianUserId,
        email: g.guardianEmail,
        name: g.guardianName,
        role: g.guardianRole,
        publicKey: 'existing-public-key',
        canInitiateRecovery: g.canInitiateRecovery,
        canApproveTransactions: g.canApproveTransactions,
        approvalWeight: g.approvalWeight
    }));

    const masterSecretBuffer = Buffer.from(masterSecret, 'hex');
    const result = await initializeShamirSharingForVault(vaultId, userId, guardianConfigs, newThreshold);

    return {
        ...result,
        removedGuardian: guardian.guardianName,
        remainingGuardians: filtered.length
    };
}

/**
 * Reconstruct master secret from submitted shards
 * @param {string} recoveryRequestId - UUID of recovery request
 * @param {Array} submittedShards - Array of {guardianId, decryptedShard (hex)}
 * @returns {Promise<{success: boolean, reconstructedSecret: Buffer|null, secretHash: string|null}>}
 */
export async function reconstructSecretFromShards(recoveryRequestId, submittedShards) {
    // Convert submitted shards to Buffer format
    const shards = submittedShards.map(s => ({
        index: s.shardIndex,
        data: Buffer.from(s.decryptedShard, 'hex')
    }));

    // Verify all shards have consistent length
    const shardLength = shards[0].data.length;
    for (const shard of shards) {
        if (shard.data.length !== shardLength) {
            console.error('❌ Shard length mismatch during reconstruction');
            return { success: false, reconstructedSecret: null, secretHash: null };
        }
    }

    console.log(`🔓 Reconstructing secret from ${shards.length} shards...`);

    try {
        // Combine shards using Lagrange interpolation
        const reconstructedSecret = combineShards(shards);
        const secretHash = hashSecret(reconstructedSecret);

        console.log(`✅ Secret reconstructed successfully (hash: ${secretHash.substring(0, 16)}...)`);

        return {
            success: true,
            reconstructedSecret,
            secretHash
        };
    } catch (error) {
        console.error('❌ Secret reconstruction failed:', error.message);
        return {
            success: false,
            reconstructedSecret: null,
            secretHash: null,
            error: error.message
        };
    }
}

/**
 * Verify a single shard against stored checksum
 * @param {string} guardianId - UUID of guardian
 * @param {Buffer} shardData - Decrypted shard data
 * @returns {Promise<boolean>}
 */
export async function verifyGuardianShard(guardianId, shardData) {
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(eq(vaultGuardians.id, guardianId));

    if (!guardian) {
        throw new Error('Guardian not found');
    }

    const isValid = verifyShardChecksum(shardData, guardian.shardChecksum);

    if (isValid) {
        // Update last verified timestamp
        await db.update(vaultGuardians)
            .set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
            .where(eq(vaultGuardians.id, guardianId));
    }

    return isValid;
}

/**
 * Get guardians for a vault
 * @param {string} vaultId - UUID of vault
 * @returns {Promise<Array>}
 */
export async function getVaultGuardians(vaultId) {
    return await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.isActive, true)
        ))
        .orderBy(vaultGuardians.shardIndex);
}

/**
 * Calculate current threshold for a vault based on active guardians
 * @param {string} vaultId - UUID of vault
 * @returns {Promise<{threshold: number, totalShards: number}>}
 */
export async function getVaultThreshold(vaultId) {
    const guardians = await getVaultGuardians(vaultId);
    const totalShards = guardians.length;
    const threshold = Math.max(Math.ceil(totalShards * 0.6), 3); // 60% or minimum 3

    return { threshold, totalShards };
}

export default {
    initializeShamirSharingForVault,
    addGuardianToVault,
    removeGuardianFromVault,
    reconstructSecretFromShards,
    verifyGuardianShard,
    getVaultGuardians,
    getVaultThreshold
};
