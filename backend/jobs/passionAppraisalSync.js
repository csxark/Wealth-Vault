import cron from 'node-cron';
import passionAppraiser from '../services/passionAppraiser.js';
import passionLTVEngine from '../services/passionLTVEngine.js';
import db from '../config/db.js';
import { passionAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import notificationService from '../services/notificationService.js';

/**
 * Passion Appraisal Sync Job (#536)
 * Periodically refreshes luxury asset market values and checks for LTV violations.
 */
class PassionAppraisalSyncJob {
    constructor() {
        this.task = null;
    }

    start() {
        // Run daily at 5:00 AM
        this.task = cron.schedule('0 5 * * *', async () => {
            logInfo('[Passion Job] Starting daily market-to-market appraisal refresh');
            await this.executeSync();
        });

        logInfo('[Passion Job] Passion Asset monitoring initialized');
    }

    async executeSync() {
        try {
            // 1. Refresh all appraisals
            await passionAppraiser.refreshAllAssets();

            // 2. Check for LTV violations / Margin Calls
            const assets = await db.select().from(passionAssets).where(eq(passionAssets.status, 'collateralized'));

            for (const asset of assets) {
                const status = await passionLTVEngine.checkMarginStatus(asset.id);

                if (status.status === 'margin_call') {
                    await notificationService.sendNotification(asset.userId, {
                        title: `MARGIN CALL: Passion Asset ${asset.name}`,
                        message: `The market value for your ${asset.name} has dropped. Your current LTV (${(status.currentLTV * 100).toFixed(1)}%) exceeds the limit (${(status.limitLTV * 100).toFixed(1)}%). Please add collateral or repay part of the loan.`,
                        type: 'alert',
                        category: 'ltv_violation',
                        metadata: { assetId: asset.id, currentLTV: status.currentLTV }
                    });
                }
            }
        } catch (error) {
            logError('[Passion Job] Sync cycle failing:', error);
        }
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new PassionAppraisalSyncJob();
