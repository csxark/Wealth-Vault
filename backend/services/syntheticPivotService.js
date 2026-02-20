import db from '../config/db.js';
import { vaults, hedgeExecutionHistory } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import hedgeEngine from './hedgeEngine.js';

/**
 * Synthetic Pivot Service (L3)
 * Execution logic to move assets into low-correlation "Safe-Haven" vaults during crashes.
 * Orchestrates the actual "Safe-Haven" rotation.
 */
class SyntheticPivotService {
    /**
     * Execute a full pivot for a user
     */
    async executeShieldUp(userId, anomalyId, type, severity) {
        try {
            logInfo(`[Synthetic Pivot] SHIELDING UP for user ${userId} (Severity: ${severity})`);

            const pivotPlan = await hedgeEngine.calculatePivot(userId, type, severity);
            const executionResults = [];

            return await db.transaction(async (tx) => {
                for (const move of pivotPlan) {
                    // 1. Simulate asset transfer
                    // In real app: call broker/chain APIs or update internal ledger
                    logInfo(`[Synthetic Pivot] Moving $${move.amountToPivot} from ${move.sourceVaultId} to ${move.safeHavenVaultId}`);

                    // 2. Log execution
                    const [execution] = await tx.insert(hedgeExecutionHistory).values({
                        userId,
                        anomalyId,
                        vaultId: move.sourceVaultId,
                        actionTaken: 'SAFE_HAVEN_PIVOT',
                        amountShielded: move.amountToPivot.toString(),
                        status: 'active',
                        metadata: {
                            safeHavenId: move.safeHavenVaultId,
                            ratio: move.ratioApplied,
                            triggerType: type
                        }
                    }).returning();

                    // 3. Optional: Pivot-specific state on vault (e.g. disable new buys)
                    await tx.update(vaults)
                        .set({ status: 'shielded', metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{lastShieldId}', ${sql.raw(`'"${execution.id}"'`)})` })
                        .where(eq(vaults.id, move.sourceVaultId));

                    executionResults.push(execution);
                }

                return executionResults;
            });
        } catch (error) {
            logError('[Synthetic Pivot] Shield-Up failed:', error);
            throw error;
        }
    }

    /**
     * Restore assets once anomaly subsides (Shield Down)
     */
    async executeShieldDown(userId, executionIds) {
        // Logic to reverse the pivot and restore normal operations
        logInfo(`[Synthetic Pivot] SHIELD DOWN for user ${userId}`);

        for (const id of executionIds) {
            await db.update(hedgeExecutionHistory)
                .set({ status: 'restored', restoredDate: new Date() })
                .where(eq(hedgeExecutionHistory.id, id));
        }

        return { success: true };
    }
}

export default new SyntheticPivotService();
