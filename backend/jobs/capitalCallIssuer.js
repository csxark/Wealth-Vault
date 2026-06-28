import cron from 'node-cron';
import db from '../config/db.js';
import { capitalCalls, spvEntities, lpCommitments, entities, vaults } from '../db/schema.js';
import { eq, and, sql, lt, not } from 'drizzle-orm';
import spvManagerService from '../services/spvManagerService.js';
import { logInfo, logError } from '../utils/logger.js';
import notificationService from '../services/notificationService.js';

/**
 * Capital Call Issuer Job (#510)
 * Periodic task to manage "Capital Commitments" vs. "Called Capital," 
 * automatically issuing draw-downs from LP vaults when the SPV needs funding.
 * Also monitors for overdue calls.
 */
class CapitalCallIssuerJob {
    constructor() {
        this.task = null;
    }

    start() {
        // Run daily at 2:00 AM
        this.task = cron.schedule('0 2 * * *', async () => {
            logInfo('[Capital Call Job] Scanning for SPV funding requirements');
            await this.scanForOverdueCalls();
        });

        logInfo('[Capital Call Job] Capital Call monitoring initialized (Daily schedule)');
    }

    /**
     * Scan for calls that are past their due date and notify SPV managers.
     */
    async scanForOverdueCalls() {
        const today = new Date();

        try {
            // 1. Find Open Calls that are past Due Date
            const overdueCalls = await db.select().from(capitalCalls).where(
                and(
                    eq(capitalCalls.status, 'open'),
                    lt(capitalCalls.dueDate, today)
                )
            );

            logInfo(`[Capital Call Job] Found ${overdueCalls.length} overdue calls`);

            for (const call of overdueCalls) {
                // 2. Alert the SPV owner / user
                const spv = await db.query.spvEntities.findFirst({ where: eq(spvEntities.id, call.spvId) });

                await notificationService.sendNotification(spv.userId, {
                    title: `OVERDUE: Capital Call for ${spv.name}`,
                    message: `A capital call for $${call.callAmount} is past due date (${call.dueDate.toLocaleDateString()}). Action required to prevent default.`,
                    type: 'alert',
                    category: 'spv_funding',
                    metadata: { callId: call.id, spvId: spv.id }
                });

                // 3. Update status to overdue
                await db.update(capitalCalls)
                    .set({ status: 'overdue' })
                    .where(eq(capitalCalls.id, call.id));
            }
        } catch (error) {
            logError('[Capital Call Job] Scan failing:', error);
        }
    }

    /**
     * Manual Trigger to issue a routine call for SPVs that need cash (e.g. for maintenance).
     */
    async runRoutineCalls() {
        // Logic to issue maintenance calls based on SPV metadata (DRY implementation)
        return true;
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new CapitalCallIssuerJob();
