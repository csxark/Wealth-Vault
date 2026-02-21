import db from '../config/db.js';
import { marketAnomalyDefinitions, hedgeExecutionHistory, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { isAnomaly, calculateMovingAverage } from '../utils/anomalyMath.js';
import { logInfo, logError } from '../utils/logger.js';
import hedgingOrchestrator from './hedgingOrchestrator.js';

/**
 * Market Anomaly Scanner (L3)
 * Statistical volatility monitoring logic that detects price deviations exceeding detection thresholds.
 * Automated "Red Alert" state management for the entire group.
 */
class AnomalyScanner {
    constructor() {
        this.systemAlertState = 'NORMAL'; // 'NORMAL', 'ALERT', 'CRITICAL'
        this.recentPrices = new Map(); // assetKey -> priceBuffer[]
    }

    /**
     * Ingést new price data and check for anomalies
     */
    async scanAsset(assetKey, currentPrice) {
        try {
            // 1. Maintain price history buffer
            if (!this.recentPrices.has(assetKey)) {
                this.recentPrices.set(assetKey, []);
            }
            const buffer = this.recentPrices.get(assetKey);
            buffer.push(currentPrice);
            if (buffer.length > 100) buffer.shift(); // Keep last 100 ticks

            // 2. Load anomaly definitions for users tracking this asset Type
            // (In a real system, we'd map assetKey to assetType)
            const activeTriggers = await db.query.marketAnomalyDefinitions.findMany({
                where: eq(marketAnomalyDefinitions.isActive, true)
            });

            for (const trigger of activeTriggers) {
                const threshold = parseFloat(trigger.detectionThreshold);

                // 3. Detect Anomaly
                const history = buffer.slice(0, -1);
                const anomalyDetected = isAnomaly(currentPrice, history, threshold);

                if (anomalyDetected) {
                    await this.handleAnomaly(trigger, currentPrice, assetKey);
                }
            }
        } catch (error) {
            logError(`[Anomaly Scanner] Error scanning asset ${assetKey}:`, error);
        }
    }

    /**
     * Trigger "Red Alert" and execute hedging logic
     */
    async handleAnomaly(trigger, price, asset) {
        logInfo(`[Anomaly Scanner] 🚨 BLACK SWAN DETECTED: Asset ${asset} triggered ${trigger.anomalyType} for user ${trigger.userId}`);

        // Update system state
        this.systemAlertState = 'CRITICAL';

        // Log execution attempt
        const [execution] = await db.insert(hedgeExecutionHistory).values({
            userId: trigger.userId,
            anomalyId: trigger.id,
            actionTaken: 'SAFE_HAVEN_PIVOT',
            amountShielded: '0', // Will be updated by orchestrator
            status: 'processing'
        }).returning();

        // Pass to Orchestrator
        if (trigger.autoPivotEnabled) {
            await hedgingOrchestrator.executePivot(trigger.userId, trigger.id, execution.id);
        } else {
            // Just trigger notification/alert state
            logInfo(`[Anomaly Scanner] Auto-pivot disabled for user ${trigger.userId}. Manual action required.`);
        }
    }

    /**
     * Get system-wide security status
     */
    getSystemStatus() {
        return {
            state: this.systemAlertState,
            activeScans: this.recentPrices.size,
            timestamp: new Date()
        };
    }

    /**
     * Reset health state
     */
    resetState() {
        this.systemAlertState = 'NORMAL';
    }
}

export default new AnomalyScanner();
