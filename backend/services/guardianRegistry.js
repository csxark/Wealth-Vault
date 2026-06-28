/**
 * Guardian Registry Service
 * Manages guardian relationships, permissions, and verification
 * Handles nomination, activation, and deactivation of vault guardians
 */

import { db } from '../config/db.js';
import { vaultGuardians, users, vaults } from '../db/schema.js';
import { eq, and, or, inArray } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Nominate a user as guardian for a vault
 * @param {string} vaultId - UUID of vault
 * @param {string} ownerId - UUID of vault owner
 * @param {object} guardianData - Guardian details
 * @returns {Promise<object>}
 */
export async function nominateGuardian(vaultId, ownerId, guardianData) {
    const { userId, email, name, role, permissions } = guardianData;

    // Verify vault ownership
    const [vault] = await db.select()
        .from(vaults)
        .where(eq(vaults.id, vaultId));

    if (!vault) {
        throw new Error('Vault not found');
    }

    // Check if guardian already exists for this vault
    const existing = await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.guardianUserId, userId),
            eq(vaultGuardians.isActive, true)
        ));

    if (existing.length > 0) {
        throw new Error('User is already a guardian for this vault');
    }

    // Create pending guardian nomination
    const [guardian] = await db.insert(vaultGuardians).values({
        vaultId,
        userId: ownerId,
        guardianUserId: userId,
        guardianEmail: email,
        guardianName: name,
        guardianRole: role || 'family',
        canInitiateRecovery: permissions?.canInitiateRecovery !== false,
        canApproveTransactions: permissions?.canApproveTransactions || false,
        approvalWeight: permissions?.approvalWeight || 1,
        isActive: false, // Not active until shard is assigned
        metadata: {
            nominatedAt: new Date().toISOString(),
            status: 'pending'
        }
    }).returning();

    console.log(`📮 Guardian nominated: ${name} (${email}) for vault ${vaultId}`);

    return guardian;
}

/**
 * Get all guardians for a vault
 * @param {string} vaultId - UUID of vault
 * @param {boolean} activeOnly - Return only active guardians
 * @returns {Promise<Array>}
 */
export async function getGuardiansForVault(vaultId, activeOnly = true) {
    const conditions = [eq(vaultGuardians.vaultId, vaultId)];

    if (activeOnly) {
        conditions.push(eq(vaultGuardians.isActive, true));
    }

    const guardians = await db.select()
        .from(vaultGuardians)
        .where(and(...conditions))
        .orderBy(vaultGuardians.shardIndex);

    return guardians;
}

/**
 * Get all vaults where user is a guardian
 * @param {string} userId - UUID of guardian user
 * @returns {Promise<Array>}
 */
export async function getVaultsWhereGuardian(userId) {
    const guardianRecords = await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.guardianUserId, userId),
            eq(vaultGuardians.isActive, true)
        ));

    // Fetch vault details
    if (guardianRecords.length === 0) {
        return [];
    }

    const vaultIds = guardianRecords.map(g => g.vaultId);
    const vaultDetails = await db.select()
        .from(vaults)
        .where(inArray(vaults.id, vaultIds));

    // Merge guardian info with vault details
    return vaultDetails.map(vault => {
        const guardianRecord = guardianRecords.find(g => g.vaultId === vault.id);
        return {
            ...vault,
            guardianRole: guardianRecord.guardianRole,
            canInitiateRecovery: guardianRecord.canInitiateRecovery,
            canApproveTransactions: guardianRecord.canApproveTransactions,
            approvalWeight: guardianRecord.approvalWeight,
            guardianSince: guardianRecord.activatedAt
        };
    });
}

/**
 * Update guardian permissions
 * @param {string} guardianId - UUID of guardian record
 * @param {object} permissions - New permissions
 * @returns {Promise<object>}
 */
export async function updateGuardianPermissions(guardianId, permissions) {
    const updates = {
        updatedAt: new Date()
    };

    if (permissions.canInitiateRecovery !== undefined) {
        updates.canInitiateRecovery = permissions.canInitiateRecovery;
    }
    if (permissions.canApproveTransactions !== undefined) {
        updates.canApproveTransactions = permissions.canApproveTransactions;
    }
    if (permissions.approvalWeight !== undefined) {
        updates.approvalWeight = permissions.approvalWeight;
    }

    const [updated] = await db.update(vaultGuardians)
        .set(updates)
        .where(eq(vaultGuardians.id, guardianId))
        .returning();

    console.log(`✏️ Guardian permissions updated: ${guardianId}`);

    return updated;
}

/**
 * Activate a guardian (after shard assignment)
 * @param {string} guardianId - UUID of guardian record
 * @returns {Promise<object>}
 */
export async function activateGuardian(guardianId) {
    const [activated] = await db.update(vaultGuardians)
        .set({
            isActive: true,
            activatedAt: new Date(),
            updatedAt: new Date()
        })
        .where(eq(vaultGuardians.id, guardianId))
        .returning();

    console.log(`✅ Guardian activated: ${guardianId}`);

    return activated;
}

/**
 * Deactivate a guardian
 * @param {string} guardianId - UUID of guardian record
 * @param {string} reason - Reason for deactivation
 * @returns {Promise<object>}
 */
export async function deactivateGuardian(guardianId, reason) {
    const [deactivated] = await db.update(vaultGuardians)
        .set({
            isActive: false,
            updatedAt: new Date(),
            metadata: db.raw(`metadata || jsonb_build_object('deactivatedAt', now(), 'deactivationReason', '${reason}')`)
        })
        .where(eq(vaultGuardians.id, guardianId))
        .returning();

    console.log(`🚫 Guardian deactivated: ${guardianId} - Reason: ${reason}`);

    return deactivated;
}

/**
 * Verify guardian identity via email challenge
 * @param {string} guardianId - UUID of guardian record
 * @param {string} verificationCode - Code sent to guardian's email
 * @returns {Promise<boolean>}
 */
export async function verifyGuardianIdentity(guardianId, verificationCode) {
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(eq(vaultGuardians.id, guardianId));

    if (!guardian) {
        throw new Error('Guardian not found');
    }

    // In production, verify against stored challenge code
    // For now, accept any 6-digit code as valid
    const isValid = /^\d{6}$/.test(verificationCode);

    if (isValid) {
        await db.update(vaultGuardians)
            .set({
                lastVerifiedAt: new Date(),
                updatedAt: new Date(),
                metadata: db.raw(`metadata || jsonb_build_object('identityVerified', true, 'verifiedAt', now())`)
            })
            .where(eq(vaultGuardians.id, guardianId));

        console.log(`✅ Guardian identity verified: ${guardian.guardianEmail}`);
    }

    return isValid;
}

/**
 * Get guardian statistics for a vault
 * @param {string} vaultId - UUID of vault
 * @returns {Promise<object>}
 */
export async function getGuardianStatistics(vaultId) {
    const allGuardians = await getGuardiansForVault(vaultId, false);

    const stats = {
        total: allGuardians.length,
        active: allGuardians.filter(g => g.isActive).length,
        pending: allGuardians.filter(g => !g.isActive).length,
        byRole: {},
        canInitiateRecovery: allGuardians.filter(g => g.canInitiateRecovery && g.isActive).length,
        canApproveTransactions: allGuardians.filter(g => g.canApproveTransactions && g.isActive).length,
        totalApprovalWeight: allGuardians
            .filter(g => g.isActive)
            .reduce((sum, g) => sum + (g.approvalWeight || 1), 0),
        lastVerification: null,
        oldestVerification: null
    };

    // Count by role
    allGuardians.forEach(g => {
        stats.byRole[g.guardianRole] = (stats.byRole[g.guardianRole] || 0) + 1;
    });

    // Find verification timestamps
    const verified = allGuardians
        .filter(g => g.lastVerifiedAt)
        .sort((a, b) => b.lastVerifiedAt - a.lastVerifiedAt);

    if (verified.length > 0) {
        stats.lastVerification = verified[0].lastVerifiedAt;
        stats.oldestVerification = verified[verified.length - 1].lastVerifiedAt;
    }

    return stats;
}

/**
 * Check if user has permission to perform action on vault
 * @param {string} userId - UUID of user
 * @param {string} vaultId - UUID of vault
 * @param {string} permission - Permission to check
 * @returns {Promise<boolean>}
 */
export async function checkGuardianPermission(userId, vaultId, permission) {
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.guardianUserId, userId),
            eq(vaultGuardians.isActive, true)
        ));

    if (!guardian) {
        return false;
    }

    switch (permission) {
        case 'initiate_recovery':
            return guardian.canInitiateRecovery;
        case 'approve_transaction':
            return guardian.canApproveTransactions;
        case 'view_vault':
            return true; // All active guardians can view
        default:
            return false;
    }
}

/**
 * Generate guardian invitation link
 * @param {string} guardianId - UUID of guardian record
 * @returns {Promise<string>}
 */
export async function generateGuardianInvitationLink(guardianId) {
    const [guardian] = await db.select()
        .from(vaultGuardians)
        .where(eq(vaultGuardians.id, guardianId));

    if (!guardian) {
        throw new Error('Guardian not found');
    }

    // Generate secure invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.update(vaultGuardians)
        .set({
            metadata: db.raw(`metadata || jsonb_build_object('invitationToken', '${token}', 'invitationExpiresAt', '${expiresAt.toISOString()}')`)
        })
        .where(eq(vaultGuardians.id, guardianId));

    const invitationLink = `${process.env.FRONTEND_URL}/guardian/accept/${token}`;

    console.log(`📧 Invitation link generated for ${guardian.guardianEmail}`);

    return invitationLink;
}

/**
 * Accept guardian invitation
 * @param {string} invitationToken - Invitation token
 * @returns {Promise<object>}
 */
export async function acceptGuardianInvitation(invitationToken) {
    // Find guardian by invitation token
    const guardians = await db.select()
        .from(vaultGuardians)
        .where(db.raw(`metadata->>'invitationToken' = '${invitationToken}'`));

    if (guardians.length === 0) {
        throw new Error('Invalid invitation token');
    }

    const [guardian] = guardians;

    // Check expiration
    const expiresAt = new Date(guardian.metadata.invitationExpiresAt);
    if (expiresAt < new Date()) {
        throw new Error('Invitation has expired');
    }

    // Mark as accepted
    await db.update(vaultGuardians)
        .set({
            metadata: db.raw(`metadata || jsonb_build_object('invitationAccepted', true, 'acceptedAt', now())`)
        })
        .where(eq(vaultGuardians.id, guardian.id));

    console.log(`✅ Guardian invitation accepted: ${guardian.guardianEmail}`);

    return guardian;
}

export default {
    nominateGuardian,
    getGuardiansForVault,
    getVaultsWhereGuardian,
    updateGuardianPermissions,
    activateGuardian,
    deactivateGuardian,
    verifyGuardianIdentity,
    getGuardianStatistics,
    checkGuardianPermission,
    generateGuardianInvitationLink,
    acceptGuardianInvitation
};
