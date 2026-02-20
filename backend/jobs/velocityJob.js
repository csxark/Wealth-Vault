import cron from 'node-cron';
import db from '../config/db.js';
import { vaults, transactions, liquidityVelocityLogs, users } from '../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Velocity Sync Job (L3)
 * Hourly job that aggregates transaction data into velocity metrics for every active vault.
 */
class VelocityJob {
    start() {
        // Run every hour
        cron.schedule('0 * * * *', async () => {
            logInfo('[Velocity Job] Starting liquidity velocity aggregation...');
            await this.calculateGlobalVelocity();
        });
    }

    async calculateGlobalVelocity() {
        try {
            // 1. Get all active users
            const activeUsers = await db.query.users.findMany();

            for (const user of activeUsers) {
                try {
                    await this.calculateUserVelocity(user.id);
                } catch (userError) {
                    logError(`[Velocity Job] Failed for user ${user.id}:`, userError);
                }
            }

            logInfo('[Velocity Job] Successfully updated velocity metrics for all users.');
        } catch (error) {
            logError('[Velocity Job] Job failed:', error);
        }
    }

    async calculateUserVelocity(userId) {
        const userVaults = await db.query.vaults.findMany({
            where: and(eq(vaults.ownerId, userId), eq(vaults.status, 'active'))
        });

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        for (const vault of userVaults) {
            // 2. Fetch daily burn (net flow in last 24h)
            const dailyTransactions = await db.query.transactions.findMany({
                where: and(
                    eq(transactions.vaultId, vault.id),
                    gte(transactions.createdAt, yesterday)
                )
            });

            const dailyBurn = dailyTransactions.reduce((sum, t) => {
                const amount = parseFloat(t.amount);
                return t.type === 'expense' ? sum - amount : sum + amount;
            }, 0);

            // 3. Fetch weekly velocity (average daily flow over last 7 days)
            const weeklyTransactions = await db.query.transactions.findMany({
                where: and(
                    eq(transactions.vaultId, vault.id),
                    gte(transactions.createdAt, lastWeek)
                )
            });

            const weeklyNetFlow = weeklyTransactions.reduce((sum, t) => {
                const amount = parseFloat(t.amount);
                return t.type === 'expense' ? sum - amount : sum + amount;
            }, 0);
            const weeklyVelocity = weeklyNetFlow / 7;

            // 4. Record log
            await db.insert(liquidityVelocityLogs).values({
                userId,
                vaultId: vault.id,
                dailyBurnRate: dailyBurn.toString(),
                weeklyVelocity: weeklyVelocity.toString(),
                currency: vault.currency || 'USD',
                measuredAt: new Date()
            });
        }
    }
}

export default new VelocityJob();
