import cron from "node-cron";
import { eq, and, lte, sql } from "drizzle-orm";
import db from "../config/db.js";
import { subscriptions, users } from "../db/schema.js";
import notificationService from "../services/notificationService.js";
import subscriptionAI from "../services/subscriptionAI.js";

class SubscriptionMonitor {
    constructor() {
        this.job = null;
        this.isRunning = false;
    }

    /**
     * Initialize the subscription monitoring job
     * Runs daily at 9:00 AM
     */
    initialize() {
        this.job = cron.schedule("0 9 * * *", async () => {
            console.log("[Subscription Monitor] Starting daily scan...");
            await this.runScan();
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata"
        });

        console.log("[Subscription Monitor] Initialized - will run daily at 9:00 AM IST");
    }

    /**
     * Run the monitoring scan for all users
     */
    async runScan() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const activeUsers = await db.select().from(users).where(eq(users.isActive, true));

            for (const user of activeUsers) {
                try {
                    // 1. Check for upcoming renewals (in 3 days)
                    const renewalThreshold = new Date();
                    renewalThreshold.setDate(renewalThreshold.getDate() + 3);

                    const upcomingRenewals = await db.select().from(subscriptions).where(
                        and(
                            eq(subscriptions.userId, user.id),
                            eq(subscriptions.status, 'active'),
                            lte(subscriptions.nextRenewalDate, renewalThreshold)
                        )
                    );

                    for (const sub of upcomingRenewals) {
                        // Send reminder
                        await notificationService.sendRenewalReminder(user.id, sub);
                    }

                    // 2. Refresh Health Score and generate AI insights
                    const suggestions = await subscriptionAI.analyzeSubscriptions(user.id);
                    for (const suggestion of suggestions) {
                        // Notify if high severity
                        if (suggestion.severity === 'high') {
                            await notificationService.sendCancellationSuggestion(user.id, suggestion);
                        }
                    }

                } catch (userError) {
                    console.error(`[Subscription Monitor] Error processing user ${user.id}:`, userError);
                }
            }

            console.log("[Subscription Monitor] Daily scan completed successfully");
        } catch (error) {
            console.error("[Subscription Monitor] Fatal error during scan:", error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Manually trigger the scan
     */
    async runManual() {
        console.log("[Subscription Monitor] Manual execution triggered");
        await this.runScan();
    }

    getStatus() {
        return {
            scheduled: !!this.job,
            running: this.isRunning,
            nextRun: "Daily at 9:00 AM IST",
        };
    }
}

export default new SubscriptionMonitor();
