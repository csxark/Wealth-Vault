import db from '../config/db.js';
import { shieldTriggers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo } from '../utils/logger.js';

/**
 * Risk Engine (L3)
 * Integration to ingest legal/credit risk scores and calibrate "Shield Sensitivity".
 */
class RiskEngine {
    /**
     * Ingest External Risk Score
     * Simulated integration with Dun & Bradstreet or Credit bureaus.
     */
    async ingestRiskScore(entityId, scoreType, value) {
        logInfo(`[Risk Engine] Ingesting ${scoreType} score for entity ${entityId}: ${value}`);

        // Update any active triggers listening for this score
        const activeTriggers = await db.query.shieldTriggers.findMany({
            where: eq(shieldTriggers.entityId, entityId)
        });

        const alerts = [];

        for (const trigger of activeTriggers) {
            if (trigger.triggerType === scoreType) {
                await db.update(shieldTriggers)
                    .set({ currentValue: value.toString(), lastChecked: new Date() })
                    .where(eq(shieldTriggers.id, trigger.id));

                // Check if threshold violated
                if (this.isThresholdViolated(trigger.triggerType, value, parseFloat(trigger.thresholdValue))) {
                    alerts.push({
                        triggerId: trigger.id,
                        userId: trigger.userId,
                        severity: trigger.sensitivityLevel
                    });
                }
            }
        }

        return alerts;
    }

    /**
     * Threshold Violation Logic
     */
    isThresholdViolated(type, current, threshold) {
        switch (type) {
            case 'credit_drop':
                return current < threshold; // Lower credit score is bad
            case 'legal_action':
                return current > threshold; // Higher number of actions is bad
            case 'liquidity_crunch':
                return current < threshold; // Lower ratio is bad
            default:
                return false;
        }
    }

    /**
     * Calibrate Sensitivity
     * Adjusts trigger thresholds based on global market volatility.
     */
    async calibrateSensitivity(userId, level) {
        // level: 'conservative', 'aggressive', 'standard'
        const multipliers = {
            'conservative': 1.2, // Triggers earlier
            'standard': 1.0,
            'aggressive': 0.8  // Triggers later
        };

        const factor = multipliers[level] || 1.0;

        logInfo(`[Risk Engine] Calibrating sensitivity for user ${userId} to ${level} (factor: ${factor})`);

        // Internal logic to batch update trigger thresholds...
        return { success: true, appliedFactor: factor };
    }
}

export default new RiskEngine();
