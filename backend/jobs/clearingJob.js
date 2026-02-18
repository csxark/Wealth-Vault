import cron from 'node-cron';
import db from '../config/db.js';
import { entities, interCompanyLedger } from '../db/schema.js';
import { eq, and, sql, or } from 'drizzle-orm';
import ledgerService from '../services/ledgerService.js';

/**
 * Inter-Company Clearing Job (L3)
 * Automatically reconciles "Due To" and "Due From" balances at month-end.
 */
class ClearingJob {
    start() {
        // Run monthly at midnight on the 1st
        cron.schedule('0 0 1 * *', async () => {
            console.log('[Clearing Job] Starting inter-company reconciliation...');
            await this.reconcileAllEntities();
        });
    }

    async reconcileAllEntities() {
        try {
            // 1. Get all unique pairs of inter-company relationships
            const pairs = await db.select({
                entityA: interCompanyLedger.fromEntityId,
                entityB: interCompanyLedger.toEntityId,
                userId: interCompanyLedger.userId
            }).from(interCompanyLedger)
                .where(eq(interCompanyLedger.status, 'pending'))
                .groupBy(interCompanyLedger.fromEntityId, interCompanyLedger.toEntityId, interCompanyLedger.userId);

            const processedPairs = new Set();

            for (const pair of pairs) {
                const pairKey = [pair.entityA, pair.entityB].sort().join('-');
                if (processedPairs.has(pairKey)) continue;
                processedPairs.add(pairKey);

                // 2. Calculate net balance
                const consolidation = await ledgerService.getConsolidatedBalance(pair.entityA, pair.entityB, pair.userId);

                if (consolidation.absBalanceUSD < 0.01) {
                    console.log(`[Clearing Job] Perfect match for pair ${pairKey} - Marking as cleared`);

                    await db.update(interCompanyLedger)
                        .set({ status: 'cleared', clearedAt: new Date() })
                        .where(and(
                            eq(interCompanyLedger.userId, pair.userId),
                            or(
                                and(eq(interCompanyLedger.fromEntityId, pair.entityA), eq(interCompanyLedger.toEntityId, pair.entityB)),
                                and(eq(interCompanyLedger.fromEntityId, pair.entityB), eq(interCompanyLedger.toEntityId, pair.entityA))
                            )
                        ));
                }
            }
        } catch (error) {
            console.error('[Clearing Job] Error:', error);
        }
    }
}

export default new ClearingJob();
