import cron from 'node-cron';
import db from '../config/db.js';
import { users, digitalWillDefinitions, trusteeVoteLedger } from '../db/schema.js';
import { eq, and, sql, lt } from 'drizzle-orm';
import successionPilot from '../services/successionPilot.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Mortality Daemon (L3)
 * High-priority daily job checking external inactivity signals and third-party verification feeds.
 * Orchestrates the "Verification Quest" for trustees when a user goes dark.
 */
class MortalityDaemon {
    start() {
        // Run daily at midnight
        cron.schedule('0 0 * * *', async () => {
            logInfo('[Mortality Daemon] Starting daily life-cycle check...');
            await this.scanInactivity();
        });
    }

    async scanInactivity() {
        try {
            // 1. Identify "Dark" users (over 180 days inactive)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

            const darkUsers = await db.select().from(users).where(lt(users.lastActive, sixMonthsAgo));

            for (const user of darkUsers) {
                const will = await db.query.digitalWillDefinitions.findFirst({
                    where: and(eq(digitalWillDefinitions.userId, user.id), eq(digitalWillDefinitions.status, 'active'))
                });

                if (will) {
                    logInfo(`[Mortality Daemon] User ${user.id} has reached terminal inactivity. Starting trustee verification quest.`);

                    // Logic to notify trustees and open the "Vote Ledger"
                    // In real app: send emails/push to all people listed in trusteeVoteLedger
                }
            }

            // 2. Check for wills with "Approved" Consensus
            // (e.g. 2+ trustees have voted 'approve_trigger')
            const triggeredWills = await this.findWillsAwaitingExecution();

            for (const willId of triggeredWills) {
                logInfo(`[Mortality Daemon] Consensus reached for will ${willId}. EXECUTING SUCCESSION PILOT.`);
                await successionPilot.triggerSuccession(willId);
            }

        } catch (error) {
            logError('[Mortality Daemon] Job failed:', error);
        }
    }

    async findWillsAwaitingExecution() {
        const approvalThreshold = 2; // Business rule: 2+ trustees must approve

        const results = await db
            .select({
                willId: trusteeVoteLedger.willId,
                count: sql`count(${trusteeVoteLedger.id})`.mapWith(Number)
            })
            .from(trusteeVoteLedger)
            .innerJoin(digitalWillDefinitions, eq(trusteeVoteLedger.willId, digitalWillDefinitions.id))
            .where(and(
                eq(trusteeVoteLedger.voteResult, 'approve_trigger'),
                eq(digitalWillDefinitions.status, 'active')
            ))
            .groupBy(trusteeVoteLedger.willId)
            .having(sql`count(${trusteeVoteLedger.id}) >= ${approvalThreshold}`);

        return results.map(r => r.willId);
    }
}

export default new MortalityDaemon();
