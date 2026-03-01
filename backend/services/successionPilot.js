import db from '../config/db.js';
import { digitalWillDefinitions, vaults, corporateEntities, portfolios } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import assetDistributor from './assetDistributor.js';
import probateGuard from './probateGuard.js';

/**
 * Succession Pilot Service (L3)
 * Core "Autopilot" logic that orchestrates the massive asset transition from primary owner to heirs.
 */
class SuccessionPilot {
    /**
     * Trigger Succession Protocol
     * Called when mortality is confirmed via consensus or external feed.
     */
    async triggerSuccession(willId) {
        try {
            return await db.transaction(async (tx) => {
                const will = await tx.query.digitalWillDefinitions.findFirst({
                    where: eq(digitalWillDefinitions.id, willId)
                });

                if (!will || will.status === 'settled') {
                    throw new Error('Invalid or already settled digital will');
                }

                logInfo(`[Succession Pilot] CRITICAL: Triggering asset transition for ${will.willName} (User: ${will.userId})`);

                // 1. Validate against Probate Guard (Legal-code compliance)
                const isCompliant = await probateGuard.validateDistributionCompliance(will.id);
                if (!isCompliant) throw new Error('Succession plan violates jurisdictional probate laws');

                // 2. Identify all assets owned by the deceased
                const userVaults = await tx.query.vaults.findMany({ where: eq(vaults.ownerId, will.userId) });
                const userEntities = await tx.query.corporateEntities.findMany({ where: eq(corporateEntities.ownerId, will.userId) });

                // 3. Orchestrate fractional distribution
                for (const vault of userVaults) {
                    await assetDistributor.splitVaultToHeirs(tx, vault.id, will.id);
                }

                for (const entity of userEntities) {
                    // Re-parent entity to trust or heirs
                    logInfo(`[Succession Pilot] Re-parenting corporate entity ${entity.id} to estate trust.`);
                    await tx.update(corporateEntities)
                        .set({ ownerId: will.executorId, metadata: { ...entity.metadata, isEstateManaged: true } })
                        .where(eq(corporateEntities.id, entity.id));
                }

                // 4. Update Will Status
                await tx.update(digitalWillDefinitions)
                    .set({ status: 'settled', updatedAt: new Date() })
                    .where(eq(digitalWillDefinitions.id, will.id));

                logInfo(`[Succession Pilot] Transition COMPLETED for will ${will.willName}`);
                return { success: true, assetsProcessed: userVaults.length + userEntities.length };
            });
        } catch (error) {
            logError('[Succession Pilot] Succession trigger failed:', error);
            throw error;
        }
    }

    /**
     * Get Succession Readiness
     */
    async checkSuccessionReadiness(userId) {
        const activeWills = await db.query.digitalWillDefinitions.findMany({
            where: and(eq(digitalWillDefinitions.userId, userId), eq(digitalWillDefinitions.status, 'active'))
        });

        return {
            hasActiveWill: activeWills.length > 0,
            coverageRatio: 0.85, // Mock mapping of assets to will definitions
            missingBeneficiaries: []
        };
    }
}

export default new SuccessionPilot();
