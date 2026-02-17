import cron from 'node-cron';
import db from '../config/db.js';
import { shieldTriggers, corporateEntities } from '../db/schema.js';
import riskEngine from '../services/riskEngine.js';
import shieldService from '../services/shieldService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Risk Scanner Job (L3)
 * Background daemon to monitor for credit-score volatility and entity-level risk spikes.
 */
class RiskScannerJob {
    start() {
        // Run every 12 hours
        cron.schedule('0 */12 * * *', async () => {
            logInfo('[Risk Scanner] Starting global risk spike scan...');
            await this.scanRiskTriggers();
        });
    }

    async scanRiskTriggers() {
        try {
            const activeTriggers = await db.query.shieldTriggers.findMany({
                where: eq(shieldTriggers.isActive, true)
            });

            logInfo(`[Risk Scanner] Monitoring ${activeTriggers.length} active risk triggers`);

            for (const trigger of activeTriggers) {
                // Mock external data fetch
                const mockCurrentScore = this.fetchMockMarketScore(trigger.triggerType);

                const alerts = await riskEngine.ingestRiskScore(
                    trigger.entityId,
                    trigger.triggerType,
                    mockCurrentScore
                );

                for (const alert of alerts) {
                    if (trigger.sensitivityLevel === 'high' || trigger.sensitivityLevel === 'emergency') {
                        // Auto-activate shield for high-sensitivity rules
                        await shieldService.activateShield(alert.userId, alert.triggerId);
                        logInfo(`[Risk Scanner] AUTO-SHIELD triggered for user ${alert.userId}`);
                    } else {
                        logInfo(`[Risk Scanner] Risk alert detected for user ${alert.userId} - Manual action required.`);
                    }
                }
            }
        } catch (error) {
            logError('[Risk Scanner] Scan failed:', error);
        }
    }

    fetchMockMarketScore(type) {
        // Simulates fetching real-time credit or legal data
        if (type === 'credit_drop') return 650 + Math.random() * 100;
        if (type === 'legal_action') return Math.random() > 0.9 ? 1 : 0;
        return 1.0;
    }
}

export default new RiskScannerJob();
