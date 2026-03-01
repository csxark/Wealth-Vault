import db from '../config/db.js';
import { syntheticVaultMappings, vaults, hedgeExecutionHistory, transactions } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Hedging Orchestrator (L3)
 * Logic for moving assets to "Safe Haven" vaults autonomously when anomalies are detected.
 * "Liquidity Freeze" protocol to prevent panicked withdrawals.
 */
class HedgingOrchestrator {
    /**
     * Execute a "Safe Haven Pivot"
     * Moves a percentage of assets from volatile vaults to synthetic safe havens
     */
    async executePivot(userId, anomalyId, executionId) {
        try {
            logInfo(`[Hedging Orchestrator] Initiating safe-haven pivot for user ${userId}...`);

            // 1. Fetch Synthetic Mappings
            const mappings = await db.query.syntheticVaultMappings.findMany({
                where: and(eq(syntheticVaultMappings.userId, userId), eq(syntheticVaultMappings.isActive, true))
            });

            let totalShielded = 0;

            await db.transaction(async (tx) => {
                for (const mapping of mappings) {
                    const sourceVault = await tx.query.vaults.findFirst({
                        where: eq(vaults.id, mapping.sourceVaultId)
                    });

                    if (!sourceVault || parseFloat(sourceVault.balance) <= 0) continue;

                    const pivotRatio = parseFloat(mapping.pivotTriggerRatio);
                    const amountToMove = parseFloat(sourceVault.balance) * pivotRatio;

                    // 2. Perform Internal Transfer
                    // Deduct from Source
                    await tx.update(vaults)
                        .set({ balance: (parseFloat(sourceVault.balance) - amountToMove).toString() })
                        .where(eq(vaults.id, sourceVault.id));

                    // Add to Safe Haven
                    await tx.update(vaults)
                        .set({ balance: sql`balance + ${amountToMove.toString()}` })
                        .where(eq(vaults.id, mapping.safeHavenVaultId));

                    // 3. Record Transaction
                    await tx.insert(transactions).values({
                        userId,
                        vaultId: sourceVault.id,
                        amount: amountToMove.toString(),
                        type: 'transfer',
                        description: `[HEDGE] Automated Safe-Haven Pivot to Vault ${mapping.safeHavenVaultId}`,
                        category: 'hedging',
                        status: 'completed'
                    });

                    totalShielded += amountToMove;
                }

                // 4. Update Execution Record
                await tx.update(hedgeExecutionHistory)
                    .set({
                        amountShielded: totalShielded.toString(),
                        status: 'completed',
                        executionDate: new Date()
                    })
                    .where(eq(hedgeExecutionHistory.id, executionId));
            });

            logInfo(`[Hedging Orchestrator] Pivot complete. Shielded ${totalShielded} across user assets.`);
        } catch (error) {
            logError('[Hedging Orchestrator] Pivot failed:', error);
            await db.update(hedgeExecutionHistory)
                .set({ status: 'failed' })
                .where(eq(hedgeExecutionHistory.id, executionId));
        }
    }

    /**
     * Liquidity Freeze Protocol
     * Implements an emergency lock on withdrawals during active anomalies
     */
    async activateLiquidityFreeze(userId) {
        logInfo(`[Hedging Orchestrator] ❄️ ACTIVATING LIQUIDITY FREEZE for user ${userId}`);

        await db.update(vaults)
            .set({
                metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lock_state}', '"FROZEN_BY_HEDGE"'::jsonb)`
            })
            .where(eq(vaults.ownerId, userId));
    }

    /**
     * Lift Freeze Protocol
     */
    async liftLiquidityFreeze(userId) {
        logInfo(`[Hedging Orchestrator] 🔥 LIFTING LIQUIDITY FREEZE for user ${userId}`);

        await db.update(vaults)
            .set({
                metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lock_state}', '"UNLOCKED"'::jsonb)`
            })
            .where(eq(vaults.ownerId, userId));
    }

    /**
     * Check if a vault is currently locked by hedging
     */
    async IsVaultLocked(vaultId) {
        const vault = await db.query.vaults.findFirst({
            where: eq(vaults.id, vaultId)
        });
        return vault?.metadata?.lock_state === 'FROZEN_BY_HEDGE';
    }
}

export default new HedgingOrchestrator();
