import cron from 'node-cron';
import db from '../config/db.js';
import { optionsPositions, strategyLegs, investments, vaults } from '../db/schema.js';
import { eq, and, sql, lt, not } from 'drizzle-orm';
import optionsStrategyEngine from '../services/optionsStrategyEngine.js';
import { logInfo, logError } from '../utils/logger.js';
import notificationService from '../services/notificationService.js';

/**
 * Options Roll Evaluator (#509)
 * Periodically scans for options nearing expiration.
 * Proposes "Rolling" to a later month (Closing current Leg, Opening new one).
 */
class OptionsRollEvaluator {
    constructor() {
        this.task = null;
    }

    start() {
        // Run daily at 3:00 AM
        this.task = cron.schedule('0 3 * * *', async () => {
            logInfo('[Options Job] Scanning for expiring derivative contracts');
            await this.scanForExpiringOptions();
        });

        logInfo('[Options Job] Options Roll service started (Daily schedule)');
    }

    async scanForExpiringOptions() {
        // Find options expiring within the next 7 days
        const horizonDate = new Date();
        horizonDate.setDate(horizonDate.getDate() + 7);

        try {
            const expiring = await db.select().from(optionsPositions).where(
                and(
                    eq(optionsPositions.status, 'open'),
                    lt(optionsPositions.expirationDate, horizonDate)
                )
            );

            logInfo(`[Options Job] Found ${expiring.length} contracts near expiration`);

            for (const pos of expiring) {
                // In a production app, we'd check if (Strike > CurrentPrice) for ITM/OTM.
                // If ITM, a "Roll" is proposed to avoid assignment or loss.

                await notificationService.sendNotification(pos.userId, {
                    title: `Option Rolling Alert: ${pos.type} Strike ${pos.strikePrice}`,
                    message: `Your contract expires on ${pos.expirationDate.toLocaleDateString()}. Consider "Rolling" to a next-month ${pos.type} to maintain your delta-neutral position.`,
                    type: 'action_required',
                    category: 'derivatives_hedge',
                    metadata: { positionId: pos.id, strategyId: pos.strategyId }
                });
            }

            return expiring.length;
        } catch (error) {
            logError('[Options Job] Expiring check failed:', error);
        }
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new OptionsRollEvaluator();
