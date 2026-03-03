import { db } from '../config/db.js';
import { successionPlans, successionHeartbeats } from '../db/schema.js';
import { eq, and, lt, sql } from 'drizzle-orm';
import { consensusTransitionEngine } from './consensusTransitionEngine.js';
import { publicRecordOracle } from './publicRecordOracle.js';

export const successionHeartbeatService = {
    async recordHeartbeat(userId, source, ipAddress) {
        return await db.transaction(async (tx) => {
            // Log the heartbeat
            await tx.insert(successionHeartbeats).values({
                userId,
                source,
                ipAddress
            });

            // Update the plan's last heartbeat timestamp
            await tx.update(successionPlans)
                .set({
                    lastHeartbeatAt: new Date(),
                    status: 'active', // Reset to active if it was in grace period
                    updatedAt: new Date()
                })
                .where(eq(successionPlans.userId, userId));
        });
    },

    async sweepInactivity() {
        console.log('--- Sweeping Succession Inactivity ---');

        // 1. Identify users who have passed inactivity threshold
        const expiredPlans = await db.select()
            .from(successionPlans)
            .where(
                and(
                    eq(successionPlans.status, 'active'),
                    sql`${successionPlans.lastHeartbeatAt} + (${successionPlans.inactivityThresholdDays} || ' days')::interval < NOW()`
                )
            );

        for (const plan of expiredPlans) {
            console.log(`Plan ${plan.id} for user ${plan.userId} passed inactivity threshold. Checking Oracle...`);

            // NEW: Oracle Proof-of-Life Check (#783)
            const oracleResult = await publicRecordOracle.checkPublicRecords(plan.userId);

            if (oracleResult.found) {
                console.log(`[Oracle Verification] Match confirmed for user ${plan.userId}. Bypassing grace period.`);

                await db.update(successionPlans)
                    .set({
                        status: 'triggered',
                        oracleVerifiedDeath: true,
                        oracleLastCheckAt: new Date(),
                        triggeredAt: new Date(),
                        updatedAt: new Date()
                    })
                    .where(eq(successionPlans.id, plan.id));

                await consensusTransitionEngine.triggerSuccession(plan.id);
            } else {
                console.log(`Plan ${plan.id} for user ${plan.userId} entered GRACE PERIOD.`);
                await db.update(successionPlans)
                    .set({
                        status: 'grace_period',
                        oracleLastCheckAt: new Date(),
                        updatedAt: new Date()
                    })
                    .where(eq(successionPlans.id, plan.id));

                // TODO: Send alert to user via Email/App saying they have X days to check in
            }
        }

        // 2. Identify users whose grace period has expired
        const triggeredPlans = await db.select()
            .from(successionPlans)
            .where(
                and(
                    eq(successionPlans.status, 'grace_period'),
                    sql`${successionPlans.updatedAt} + (${successionPlans.gracePeriodDays} || ' days')::interval < NOW()`
                )
            );

        for (const plan of triggeredPlans) {
            console.log(`Plan ${plan.id} for user ${plan.userId} TRIGGERED SUCCESSION.`);
            await consensusTransitionEngine.triggerSuccession(plan.id);
        }
    }
};
