import cron from 'node-cron';
import anomalyDetector from '../services/anomalyDetector.js';
import syntheticPivotService from '../services/syntheticPivotService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Volatility Monitor Job (L3)
 * High-frequency background daemon to monitor for "Fat-Tail" anomalies.
 * Triggers "Shield-Up" states across the user base when conditions are met.
 */
class VolatilityMonitorJob {
    start() {
        // Run every 15 minutes for high-sensitivity detection
        cron.schedule('*/15 * * * *', async () => {
            logInfo('[Volatility Monitor] Running 15-min global risk scan...');
            await this.detectAndShield();
        });
    }

    async detectAndShield() {
        try {
            const detections = await anomalyDetector.scanForAnomalies();

            if (detections.length === 0) {
                logInfo('[Volatility Monitor] No active anomalies detected.');
                return;
            }

            logInfo(`[Volatility Monitor] CRITICAL: Detected ${detections.length} anomalies across user base.`);

            for (const alert of detections) {
                // Execute Shield-Up (Safe Haven Rotation)
                await syntheticPivotService.executeShieldUp(
                    alert.userId,
                    alert.anomalyId,
                    alert.type,
                    alert.severity
                );

                logInfo(`[Volatility Monitor] AUTO-SHIELD executed for user ${alert.userId} due to ${alert.type}`);
            }

        } catch (error) {
            logError('[Volatility Monitor] Job failed:', error);
        }
    }
}

export default new VolatilityMonitorJob();
