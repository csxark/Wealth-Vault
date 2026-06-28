import db from '../config/db.js';
import { marketAnomalyDefinitions, hedgeExecutionHistory } from '../db/schema.js';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import marketSignals from '../utils/marketSignals.js';

/**
 * Anomaly Detector Service (L3)
 * AI/Statistical service to detect "Fat-Tail" market movements and volatility spikes.
 * Analyzes market data feeds for deviations that suggest a Black-Swan event.
 */
class AnomalyDetector {
    /**
     * Check for market anomalies for all users
     */
    async scanForAnomalies() {
        try {
            const signals = await marketSignals.getGlobalRiskSignals();
            logInfo(`[Anomaly Detector] Global VIX: ${signals.vix}, Fear/Greed: ${signals.fearGreedIndex}`);

            const allDefinitions = await db.query.marketAnomalyDefinitions.findMany({
                where: eq(marketAnomalyDefinitions.isActive, true)
            });

            const detections = [];

            for (const def of allDefinitions) {
                const isDetected = await this.evaluateDefinition(def, signals);

                if (isDetected) {
                    detections.push({
                        userId: def.userId,
                        anomalyId: def.id,
                        type: def.anomalyType,
                        severity: signals.severity
                    });
                }
            }

            return detections;
        } catch (error) {
            logError('[Anomaly Detector] Global scan failed:', error);
            throw error;
        }
    }

    /**
     * Evaluate a specific anomaly definition against current signals
     */
    async evaluateDefinition(def, signals) {
        // Logic depends on anomaly type
        switch (def.anomalyType) {
            case 'Flash-Crash':
                // Check if market drop > threshold in last hour
                return signals.oneHourChange < -parseFloat(def.detectionThreshold);

            case 'Hyper-Volatility':
                // Check if VIX > threshold
                return signals.vix > parseFloat(def.detectionThreshold);

            case 'De-Pegging':
                // Asset-specific check (e.g. USDT < 0.98)
                return signals.depegDetected && signals.depegSeverity > parseFloat(def.detectionThreshold);

            case 'Bank-Run':
                // Liquidity outflow signals
                return signals.lqdRatio < parseFloat(def.detectionThreshold);

            default:
                return false;
        }
    }

    /**
     * Get active anomalies for a user
     */
    async getActiveAnomalies(userId) {
        const cooldownGate = new Date();
        cooldownGate.setMinutes(cooldownGate.getMinutes() - 1440); // 24hr default

        return await db.query.hedgeExecutionHistory.findMany({
            where: and(
                eq(hedgeExecutionHistory.userId, userId),
                eq(hedgeExecutionHistory.status, 'active'),
                gte(hedgeExecutionHistory.executionDate, cooldownGate)
            )
        });
    }

    /**
     * Manual trigger of an anomaly (e.g. Panic Button)
     */
    async manualTrigger(userId, type, metadata = {}) {
        logInfo(`[Anomaly Detector] USER MANUAL TRIGGER: ${type} for user ${userId}`);

        const [execution] = await db.insert(hedgeExecutionHistory).values({
            userId,
            actionTaken: 'MANUAL_PANIC_TRIGGER',
            amountShielded: '0',
            status: 'active',
            metadata: { ...metadata, source: 'UI_PANIC_BUTTON' }
        }).returning();

        return execution;
    }
}

export default new AnomalyDetector();
