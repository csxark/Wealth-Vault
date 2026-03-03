import { db } from '../db/index.js';
import { successionPlans, successionHeirs, successionAccessShards } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { probateAutomationService } from './probateAutomationService.js';

export const consensusTransitionEngine = {
    async triggerSuccession(planId) {
        return await db.transaction(async (tx) => {
            // 1. Update plan status
            await tx.update(successionPlans)
                .set({
                    status: 'triggered',
                    triggeredAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(successionPlans.id, planId));

            // 2. Fetch all heirs and shards
            const heirs = await tx.select().from(successionHeirs).where(eq(successionHeirs.planId, planId));

            for (const heir of heirs) {
                const shards = await tx.select().from(successionAccessShards).where(eq(successionAccessShards.heirId, heir.id));

                // 3. Mark shards as distributed
                if (shards.length > 0) {
                    await tx.update(successionAccessShards)
                        .set({ distributedAt: new Date() })
                        .where(eq(successionAccessShards.heirId, heir.id));

                    console.log(`Distributed ${shards.length} shards to heir ${heir.email}`);
                    // TODO: Actually send the encrypted shards via secure channel/email
                }
            }

            // 4. Generate the final probate ledger
            const plan = (await tx.select().from(successionPlans).where(eq(successionPlans.id, planId)))[0];
            await probateAutomationService.generateDigitalLedger(plan.userId, planId);
        });
    }
};
