import cron from 'node-cron';
import db from '../config/db.js';
import { fixedAssets } from '../db/schema.js';
import assetService from '../services/assetService.js';
import marketData from '../services/marketData.js';

class ValuationUpdater {
    constructor() {
        this.task = null;
    }

    /**
     * Start the daily valuation update job
     */
    start() {
        // Run daily at 2 AM
        this.task = cron.schedule('0 2 * * *', async () => {
            console.log('[Valuation Updater] Running daily asset valuation update...');
            await this.updateAllAssets();
        });

        console.log('[Valuation Updater] Job scheduled for 2:00 AM daily');
    }

    /**
     * Update valuations for all assets
     */
    async updateAllAssets() {
        try {
            const assets = await db.select().from(fixedAssets);

            let updateCount = 0;

            for (const asset of assets) {
                const appreciationRate = parseFloat(asset.appreciationRate || '0');

                if (appreciationRate !== 0) {
                    try {
                        await assetService.applyAppreciation(asset.id);
                        updateCount++;
                    } catch (error) {
                        console.error(`[Valuation Updater] Failed to update asset ${asset.id}:`, error.message);
                    }
                }
            }

            console.log(`[Valuation Updater] Updated ${updateCount} assets`);

            // Also update market indices
            await marketData.updateMarketData();

        } catch (error) {
            console.error('[Valuation Updater] Job failed:', error);
        }
    }

    /**
     * Run manual update (for testing or on-demand)
     */
    async runManual() {
        console.log('[Valuation Updater] Manual update triggered');
        await this.updateAllAssets();
    }

    stop() {
        if (this.task) {
            this.task.stop();
            console.log('[Valuation Updater] Job stopped');
        }
    }
}

export default new ValuationUpdater();
