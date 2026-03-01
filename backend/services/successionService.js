import db from '../config/db.js';
import { successionRules, users, entities, interCompanyLedger } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import notificationService from './notificationService.js';
import auditService from './auditService.js';

/**
 * Institutional Succession Service (L3)
 * Handles "Death-Event" detection and automated asset distribution.
 */
class SuccessionService {
    /**
     * Trigger the succession protocol for a user
     */
    async triggerSuccession(userId, reason = 'inactivity') {
        const [rule] = await db.select().from(successionRules)
            .where(and(eq(successionRules.userId, userId), eq(successionRules.status, 'active')));

        if (!rule) {
            console.log(`[Succession] No active succession rules found for user ${userId}`);
            return;
        }

        console.log(`[Succession] ALERT: Triggering protocol for ${userId} due to ${reason}`);

        // 1. Mark status as triggered
        await db.update(successionRules)
            .set({ status: 'triggered' })
            .where(eq(successionRules.id, rule.id));

        // 2. Automate Legal Distribution (AI-Simulation)
        // In a real L3 system, this would move ownership of entities or transfer funds.
        const plan = rule.distributionPlan; // Array of { entityId, recipientId, percentage }

        for (const item of plan) {
            await auditService.logAuditEvent({
                userId,
                action: 'SUCCESSION_EXECUTE',
                resourceType: 'entity',
                resourceId: item.entityId,
                metadata: {
                    recipient: item.recipientId,
                    percentage: item.percentage,
                    triggerReason: reason
                }
            });

            // Notify Recipient
            await notificationService.sendNotification(item.recipientId, {
                title: 'Succession Protocol Executed',
                message: `You have been granted control over entity ${item.entityId} as part of a succession event.`,
                type: 'succession_alert'
            });
        }

        // 3. Mark as distributed
        await db.update(successionRules)
            .set({ status: 'distributed' })
            .where(eq(successionRules.id, rule.id));

        return { success: true, entitiesProcessed: plan.length };
    }

    /**
     * Records presence to delay the inactivity trigger (Internal call)
     */
    async trackActivity(userId, activityType = 'api_interaction') {
        try {
            await db.update(users)
                .set({ lastPresenceAt: new Date() })
                .where(eq(users.id, userId));
            // logInfo(`[Succession] Activity tracked for user ${userId}: ${activityType}`);
        } catch (error) {
            console.error('[Succession Service] Failed to track activity:', error);
        }
    }

    /**
     * Alias for manual UI pings
     */
    async recordProofOfLife(userId) {
        return this.trackActivity(userId, 'manual_ping');
    }
}

export default new SuccessionService();
