import cron from 'node-cron';
import db from '../config/db.js';
import { impliedVolSurfaces, investments } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import impliedVolTracker from '../services/impliedVolTracker.js';
import { logInfo, logError } from '../utils/logger.js';
import axios from 'axios';

/**
 * Volatility Sync Job (#509)
 * Fetches and updates Implied Volatility Surface data daily.
 * In a production app, we'd hit Yahoo Finance / IEX / Intrinio API.
 */
class VolatilitySyncJob {
    constructor() {
        this.task = null;
    }

    start() {
        // Run daily at 4:30 AM
        this.task = cron.schedule('30 4 * * *', async () => {
            logInfo('[Vol Job] Syncing Implied Volatility Surfaces');
            await this.syncAllVols();
        });

        logInfo('[Vol Job] Volatility Tracking service started (Daily schedule)');
    }

    async syncAllVols() {
        try {
            // Find all assets that have open options positions or are identified as tradeable
            const tradeableAssets = await db.select().from(investments).limit(50); // Simplified

            for (const asset of tradeableAssets) {
                // Mocked fetch for IV (Realistically would use Intrinio or IEX Cloud)
                // Average equity IV ranges from 15% (Calm) to 80% (Volatile)
                const mockedIV = (Math.random() * (0.35 - 0.18) + 0.18).toFixed(6);

                await impliedVolTracker.updateVolSurface(asset.id, parseFloat(mockedIV), 30);
                logInfo(`[Vol Job] Updated IV for ${asset.name}: ${mockedIV}`);
            }
        } catch (error) {
            logError('[Vol Job] Volatility sync failing:', error);
        }
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new VolatilitySyncJob();
