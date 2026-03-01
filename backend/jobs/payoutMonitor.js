import cron from 'node-cron';
import db from '../config/db.js';
import { users, dividendSchedules, autoReinvestConfigs } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import dividendService from '../services/dividendService.js';
import rebalanceEngine from '../services/rebalanceEngine.js';
import vaultService from '../services/vaultService.js';
import { reserveOperatingLiquidity } from '../services/forecastEngine.js';
import { logInfo, logError } from '../utils/logger.js';
import auditService from '../services/auditService.js';

/**
 * Payout Monitor Job (L3)
 * Daily job to sync with external market feeds for recorded dividend dates and execute the "Sweep" logic
 */
class PayoutMonitor {
    start() {
        // Run at 6 AM daily
        cron.schedule('0 6 * * *', async () => {
            logInfo('[Payout Monitor] Starting daily dividend sweep cycle...');
            await this.processDividendPayouts();
        });
    }

    /**
     * Process all dividend payouts due today
     */
    async processDividendPayouts() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            // Get all dividends due today
            const duePayouts = await db.query.dividendSchedules.findMany({
                where: and(
                    lte(dividendSchedules.paymentDate, tomorrow),
                    eq(dividendSchedules.status, 'scheduled')
                )
            });

            logInfo(`[Payout Monitor] Found ${duePayouts.length} dividend payouts due`);

            for (const payout of duePayouts) {
                await this.processSinglePayout(payout);
            }

            logInfo('[Payout Monitor] Daily dividend sweep cycle completed');
        } catch (error) {
            logError('[Payout Monitor] Dividend processing failed:', error);
        }
    }

    /**
     * Process a single dividend payout
     */
    async processSinglePayout(payout) {
        try {
            // Mark as received
            await dividendService.recordDividendReceipt(payout.id, parseFloat(payout.expectedAmount));

            // Check if auto-reinvestment is enabled for this vault
            const config = await db.query.autoReinvestConfigs.findFirst({
                where: and(
                    eq(autoReinvestConfigs.userId, payout.userId),
                    eq(autoReinvestConfigs.vaultId, payout.vaultId),
                    eq(autoReinvestConfigs.isEnabled, true)
                )
            });

            if (!config) {
                logInfo(`[Payout Monitor] Auto-reinvest disabled for vault ${payout.vaultId}`);
                return;
            }

            // Execute sweep logic
            await this.executeSweepLogic(payout, config);

        } catch (error) {
            logError(`[Payout Monitor] Failed to process payout ${payout.id}:`, error);
        }
    }

    /**
     * Execute cash sweep logic
     */
    async executeSweepLogic(payout, config) {
        try {
            const userId = payout.userId;
            const vaultId = payout.vaultId;
            const cashAmount = parseFloat(payout.expectedAmount);

            // Step 1: Check operating liquidity
            const liquidity = await reserveOperatingLiquidity(userId);

            if (liquidity.adjustedAvailable < cashAmount) {
                logInfo(`[Payout Monitor] Insufficient liquidity for sweep - holding cash`);
                await auditService.logAuditEvent({
                    userId,
                    action: 'DIVIDEND_SWEEP_SKIPPED',
                    resourceType: 'dividend',
                    resourceId: payout.id,
                    metadata: {
                        reason: 'insufficient_liquidity',
                        amount: cashAmount,
                        available: liquidity.adjustedAvailable
                    }
                });
                return;
            }

            // Step 2: Get staging vault
            const stagingVault = await vaultService.getOrCreateStagingVault(userId);

            // Step 3: Calculate cash drag
            const dragMetrics = await vaultService.calculateCashDrag(userId, stagingVault.id);

            // Step 4: Check if threshold reached
            const minimumThreshold = parseFloat(config.minimumCashThreshold);

            if (dragMetrics.excessCash < minimumThreshold) {
                logInfo(`[Payout Monitor] Cash below threshold - holding in staging vault`);
                return;
            }

            // Step 5: Determine optimal destination
            const destination = await rebalanceEngine.determineOptimalDestination(
                userId,
                vaultId,
                dragMetrics.excessCash
            );

            if (destination.action === 'HOLD') {
                logInfo(`[Payout Monitor] Portfolio balanced - no rebalance needed`);
                return;
            }

            // Step 6: Execute rebalance
            const result = await rebalanceEngine.executeRebalance(
                userId,
                vaultId,
                dragMetrics.excessCash
            );

            // Step 7: Mark dividend as reinvested
            await dividendService.markAsReinvested(payout.id);

            // Step 8: Audit log
            await auditService.logAuditEvent({
                userId,
                action: 'DIVIDEND_AUTO_REINVESTED',
                resourceType: 'dividend',
                resourceId: payout.id,
                metadata: {
                    amount: cashAmount,
                    trades: result.trades,
                    cashDeployed: result.cashDeployed,
                    strategy: config.reinvestmentStrategy
                }
            });

            logInfo(`[Payout Monitor] Successfully reinvested $${cashAmount} from dividend ${payout.id}`);

        } catch (error) {
            logError('[Payout Monitor] Sweep logic failed:', error);
            throw error;
        }
    }

    /**
     * Sync dividend schedules for all users
     */
    async syncAllDividendSchedules() {
        try {
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                try {
                    await dividendService.syncDividendSchedules(user.id);
                } catch (error) {
                    logError(`[Payout Monitor] Failed to sync dividends for user ${user.id}:`, error);
                }
            }

            logInfo('[Payout Monitor] Dividend schedule sync completed for all users');
        } catch (error) {
            logError('[Payout Monitor] Dividend sync failed:', error);
        }
    }
}

export default new PayoutMonitor();
