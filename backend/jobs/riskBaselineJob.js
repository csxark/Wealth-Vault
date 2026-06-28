import cron from 'node-cron';
import db from '../config/db.js';
import { expenses, userRiskProfiles } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/**
 * Risk Baseline Job (L3)
 * Nightly recalculation of behavioral baselines (Mean/StdDev).
 */
class RiskBaselineJob {
    start() {
        // Run nightly at 3 AM
        cron.schedule('0 3 * * *', async () => {
            console.log('[Risk Baseline Job] Starting baseline recalculation...');
            await this.updateAllBaselines();
        });
    }

    async updateAllBaselines() {
        try {
            // 1. Get stats for all users with enough transaction history
            const stats = await db.select({
                userId: expenses.userId,
                avgAmount: sql`avg(${expenses.amount})`,
                stdDevAmount: sql`stddev(${expenses.amount})`,
                count: sql`count(*)`
            })
                .from(expenses)
                .groupBy(expenses.userId)
                .having(sql`count(*) > 5`);

            for (const s of stats) {
                await db.update(userRiskProfiles)
                    .set({
                        avgTransactionAmount: s.avgAmount.toString(),
                        stdDevTransactionAmount: (s.stdDevAmount || 0).toString(),
                        lastCalculatedAt: new Date(),
                        metadata: {
                            sampleSize: s.count,
                            updatedBy: 'riskBaselineJob'
                        }
                    })
                    .where(eq(userRiskProfiles.userId, s.userId));
            }

            console.log(`[Risk Baseline Job] Successfully updated baselines for ${stats.length} users`);
        } catch (error) {
            console.error('[Risk Baseline Job] Failed:', error);
        }
    }
}

export default new RiskBaselineJob();
