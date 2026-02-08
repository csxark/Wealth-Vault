import cron from 'node-cron';
import db from '../config/db.js';
import { inactivityTriggers, inheritanceRules } from '../db/schema.js';
import { sql, lt } from 'drizzle-orm';
import deadMansSwitch from '../services/deadMansSwitch.js';

class InactivityMonitor {
    constructor() {
        this.task = null;
    }

    /**
     * Start the daily inactivity monitoring job
     */
    start() {
        // Run daily at 3 AM
        this.task = cron.schedule('0 3 * * *', async () => {
            console.log('[Inactivity Monitor] Running daily check...');
            await this.checkInactivity();
        });

        console.log('[Inactivity Monitor] Job scheduled for 3:00 AM daily');
    }

    /**
     * Check all users for inactivity
     */
    async checkInactivity() {
        try {
            // Get all inactivity triggers
            const triggers = await db.select().from(inactivityTriggers);

            for (const trigger of triggers) {
                await this.processUser(trigger);
            }

            console.log(`[Inactivity Monitor] Processed ${triggers.length} users`);
        } catch (error) {
            console.error('[Inactivity Monitor] Error:', error);
        }
    }

    /**
     * Process individual user inactivity
     */
    async processUser(trigger) {
        const now = new Date();
        const lastSeen = new Date(trigger.lastSeenAt);
        const daysSinceLastActivity = Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24));

        // Update inactivity days
        await db.update(inactivityTriggers)
            .set({
                inactivityDays: daysSinceLastActivity,
                updatedAt: now
            })
            .where(sql`${inactivityTriggers.userId} = ${trigger.userId}`);

        // Get user's inheritance rules to determine thresholds
        const rules = await db.query.inheritanceRules.findMany({
            where: sql`${inheritanceRules.userId} = ${trigger.userId} AND ${inheritanceRules.status} = 'active'`
        });

        if (rules.length === 0) return; // No inheritance rules = no monitoring

        // Find minimum threshold
        const thresholds = rules.map(r => r.conditions?.inactivityThreshold || 90);
        const minThreshold = Math.min(...thresholds);

        // Warning at 75% of threshold
        const warningThreshold = Math.floor(minThreshold * 0.75);

        if (daysSinceLastActivity >= minThreshold) {
            // TRIGGER INHERITANCE
            if (trigger.status !== 'triggered') {
                console.log(`[Inactivity Monitor] CRITICAL: User ${trigger.userId} inactive for ${daysSinceLastActivity} days - TRIGGERING INHERITANCE`);
                await deadMansSwitch.triggerInheritance(trigger.userId);
                // Send notifications to beneficiaries
            }
        } else if (daysSinceLastActivity >= warningThreshold && trigger.warningsSent < 3) {
            // Send warning + proof-of-life challenge
            console.log(`[Inactivity Monitor] WARNING: User ${trigger.userId} inactive for ${daysSinceLastActivity} days - sending challenge`);
            await deadMansSwitch.sendProofOfLifeChallenge(trigger.userId);

            await db.update(inactivityTriggers)
                .set({
                    status: 'warned',
                    warningsSent: trigger.warningsSent + 1,
                    lastWarningAt: now
                })
                .where(sql`${inactivityTriggers.userId} = ${trigger.userId}`);

            // TODO: Send email/SMS notification
        }
    }

    /**
     * Manual trigger for testing
     */
    async runManual() {
        console.log('[Inactivity Monitor] Manual check triggered');
        await this.checkInactivity();
    }

    stop() {
        if (this.task) {
            this.task.stop();
            console.log('[Inactivity Monitor] Job stopped');
        }
    }
}

export default new InactivityMonitor();
