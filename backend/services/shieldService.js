import db from '../config/db.js';
import { shieldTriggers, liquidityLocks, vaults, entityTrustMaps, corporateEntities } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import trustEngine from './trustEngine.js';

/**
 * Shield Service (L3)
 * Implementation of "Kill-Switch" logic that pivots asset ownership to protected trust structures.
 */
class ShieldService {
    /**
     * Activate Emergency Shield (Kill-Switch)
     */
    async activateShield(userId, triggerId) {
        try {
            return await db.transaction(async (tx) => {
                const trigger = await tx.query.shieldTriggers.findFirst({
                    where: eq(shieldTriggers.id, triggerId)
                });

                if (!trigger) throw new Error('Trigger not found');

                logInfo(`[Shield Service] EMERGENCY: Activating shield for user ${userId} due to ${trigger.triggerType}`);

                // 1. Lock all vaults associated with the entity or user
                const userVaults = await tx.query.vaults.findMany({
                    where: eq(vaults.ownerId, userId)
                });

                for (const vault of userVaults) {
                    await tx.insert(liquidityLocks).values({
                        userId,
                        vaultId: vault.id,
                        lockType: 'full_freeze',
                        reason: `Auto-triggered by shield: ${trigger.triggerType}`,
                        triggerId: trigger.id,
                        multiSigRequired: true
                    });

                    // Update vault status
                    await tx.update(vaults)
                        .set({ status: 'frozen' })
                        .where(eq(vaults.id, vault.id));
                }

                // 2. Pivot asset ownership if trust mapping exists
                const mappings = await tx.query.entityTrustMaps.findMany({
                    where: and(
                        eq(entityTrustMaps.userId, userId),
                        eq(entityTrustMaps.status, 'active'),
                        eq(entityTrustMaps.isAutoTriggered, true)
                    )
                });

                for (const mapping of mappings) {
                    logInfo(`[Shield Service] Pivoting assets from entity ${mapping.sourceEntityId} to trust ${mapping.targetTrustId}`);

                    // In a simulation/MVP, we'd adjust metadata or owner IDs.
                    // For L3, we simulate a legal transfer record.
                    await tx.update(corporateEntities)
                        .set({ parentEntityId: mapping.targetTrustId, metadata: { ...mapping.metadata, isShielded: true } })
                        .where(eq(corporateEntities.id, mapping.sourceEntityId));
                }

                return {
                    status: 'shielded',
                    vaultsLocked: userVaults.length,
                    trustTransfers: mappings.length
                };
            });
        } catch (error) {
            logError('[Shield Service] Shield activation failed:', error);
            throw error;
        }
    }

    /**
     * Deactivate Shield (Requires Multi-Sig Consensus)
     */
    async deactivateShield(userId, lockId, approverIds) {
        const lock = await db.query.liquidityLocks.findFirst({
            where: eq(liquidityLocks.id, lockId)
        });

        if (!lock || lock.isUnlocked) return { success: false, reason: 'Lock already cleared' };

        // Verify multi-sig consensus via trustEngine
        const isAuthorized = await trustEngine.verifyConsensus(userId, approverIds);

        if (!isAuthorized) {
            return { success: false, reason: 'Insufficient consensus for shield override' };
        }

        await db.update(liquidityLocks)
            .set({ isUnlocked: true, unlockedBy: approverIds[0] })
            .where(eq(liquidityLocks.id, lockId));

        await db.update(vaults)
            .set({ status: 'active' })
            .where(eq(vaults.id, lock.vaultId));

        logInfo(`[Shield Service] Shield DEACTIVATED for vault ${lock.vaultId}`);
        return { success: true };
    }

    /**
     * Add Shield Trigger Rule
     */
    async addTriggerRule(userId, entityId, type, threshold) {
        return await db.insert(shieldTriggers).values({
            userId,
            entityId,
            triggerType: type,
            thresholdValue: threshold.toString(),
            isActive: true
        }).returning();
    }
}

export default new ShieldService();
