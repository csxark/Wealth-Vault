import { db } from '../config/db.js';
import { liquidityAlerts, transferSuggestions, users, vaults, balanceSnapshots } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import forecastEngine from './forecastEngine.js';
import notificationService from './notificationService.js';
import eventBus from '../events/eventBus.js';

class LiquidityMonitor {
    /**
     * Check liquidity for all users and trigger alerts if needed
     */
    async monitorAllUsers() {
        try {
            const allUsers = await db.query.users.findMany({
                columns: { id: true }
            });

            for (const user of allUsers) {
                await this.checkLiquidity(user.id);
            }
        } catch (error) {
            console.error('[LiquidityMonitor] Error monitoring users:', error);
        }
    }

    /**
     * Check liquidity for a specific user
     * @param {string} userId 
     */
    async checkLiquidity(userId) {
        try {
            // 1. Get user's active liquidity alerts/thresholds
            const alerts = await db.query.liquidityAlerts.findMany({
                where: and(eq(liquidityAlerts.userId, userId), eq(liquidityAlerts.isActive, true))
            });

            if (alerts.length === 0) return;

            // 2. Get forecast for the user (up to 60 days)
            const forecast = await forecastEngine.projectCashFlow(userId, 60);

            for (const alert of alerts) {
                const threshold = parseFloat(alert.threshold);
                const alertDays = alert.alertDays || 7;

                // 3. Look for breaches in the forecast within alertDays
                const breach = forecast.projections.slice(0, alertDays).find(p => p.balance < threshold);

                if (breach) {
                    await this.triggerAlert(userId, alert, breach);
                    await this.generateTransferSuggestions(userId, breach, threshold);
                }
            }
        } catch (error) {
            console.error(`[LiquidityMonitor] Error checking liquidity for user ${userId}:`, error);
        }
    }

    /**
     * Trigger a liquidity alert
     */
    async triggerAlert(userId, alert, breach) {
        try {
            // Avoid spamming alerts if triggered recently (e.g., within 24 hours)
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            if (alert.lastTriggeredAt && new Date(alert.lastTriggeredAt) > oneDayAgo) {
                return;
            }

            // Update last triggered time
            await db.update(liquidityAlerts)
                .set({ lastTriggeredAt: new Date(), updatedAt: new Date() })
                .where(eq(liquidityAlerts.id, alert.id));

            // Send notification
            await notificationService.sendLiquidityWarning(userId, {
                threshold: alert.threshold,
                projectedDate: breach.date,
                projectedBalance: breach.balance,
                severity: alert.severity
            });

            console.log(`[LiquidityMonitor] Alert triggered for user ${userId}: Balance projected to hit ${breach.balance} on ${breach.date}`);
        } catch (error) {
            console.error('[LiquidityMonitor] Error triggering alert:', error);
        }
    }

    /**
     * Generate transfer suggestions to fix liquidity issues
     */
    async generateTransferSuggestions(userId, breach, threshold) {
        try {
            // 1. Check if we already have a pending suggestion for this date range
            const existing = await db.query.transferSuggestions.findFirst({
                where: and(
                    eq(transferSuggestions.userId, userId),
                    eq(transferSuggestions.status, 'pending'),
                    gte(transferSuggestions.createdAt, new Date(new Date().setDate(new Date().getDate() - 3)))
                )
            });

            if (existing) return;

            // 2. Find sources of funds (vaults with positive balance)
            const userVaults = await db.query.vaults.findMany({
                where: and(eq(vaults.ownerId, userId), eq(vaults.isActive, true))
            });

            // For now, let's assume we look for the vault with the highest balance to suggest a transfer
            // In a real app, we'd check actual vault balances if available
            // Assuming we have a way to get vault balances... 
            // For simplicity, let's just suggest moving from a generic "Savings" if deficit is found

            const deficit = threshold - breach.balance;
            if (deficit <= 0) return;

            // Simple suggestion: Move from highest balance vault if it covers the deficit
            // This is a placeholder for real AI/Logic integration
            await db.insert(transferSuggestions).values({
                userId,
                amount: (Math.ceil(deficit / 100) * 100).toString(), // Round up to nearest 100
                reason: `Projected balance shortfall on ${breach.date}. Suggested transfer to maintain your ${threshold} liquidity threshold.`,
                suggestedDate: new Date(new Date(breach.date).setDate(new Date(breach.date).getDate() - 2)),
                aiConfidence: 0.85,
                status: 'pending'
            });
        } catch (error) {
            console.error('[LiquidityMonitor] Error generating transfer suggestions:', error);
        }
    }

    /**
     * Calculate cash runway (how many days until balance is exhausted)
     */
    async calculateRunway(userId) {
        const forecast = await forecastEngine.projectCashFlow(userId, 365); // Check up to a year
        const zeroIndex = forecast.projections.findIndex(p => p.balance <= 0);

        if (zeroIndex === -1) return { days: 365, isStable: true };

        const runwayDays = zeroIndex;
        // Broadcast runway change for the autonomous workflow engine
        eventBus.emit('LIQUIDITY_RUNWAY_CHANGE', {
            userId,
            variable: 'cash_reserve',
            value: runwayDays,
            metadata: { isStable: false, exhaustionDate: forecast.projections[zeroIndex].date }
        });

        return { days: runwayDays, isStable: false, exhaustionDate: forecast.projections[zeroIndex].date };
    }

    /**
     * Take a daily snapshot of user balances
     */
    async recordSnapshots() {
        const allUsers = await db.query.users.findMany();
        for (const user of allUsers) {
            const currentBalance = parseFloat(user.emergencyFund || 0) + parseFloat(user.monthlyBudget || 0);
            await db.insert(balanceSnapshots).values({
                userId: user.id,
                date: new Date(),
                balance: currentBalance.toString(),
                metadata: { source: 'automated_daily' }
            });
        }
    }
}

export default new LiquidityMonitor();
