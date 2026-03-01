import cron from 'node-cron';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import replayEngine from '../services/replayEngine.js';

class SnapshotGenerator {
    constructor() {
        this.job = null;
        this.isRunning = false;
    }

    /**
     * Initialize the nightly snapshot job
     * Runs every day at 2 AM
     */
    initialize() {
        // Run every day at 2 AM
        this.job = cron.schedule('0 2 * * *', async () => {
            console.log('[Snapshot Generator] Starting nightly snapshot generation...');
            await this.generateAllSnapshots();
        }, {
            scheduled: true,
            timezone: 'Asia/Kolkata'
        });

        console.log('[Snapshot Generator] Initialized - will run daily at 2:00 AM IST');
    }

    /**
     * Generate snapshots for all active users
     */
    async generateAllSnapshots() {
        if (this.isRunning) {
            console.log('[Snapshot Generator] Already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            // Get all active users
            const activeUsers = await db
                .select({ id: users.id, email: users.email })
                .from(users)
                .where(eq(users.isActive, true));

            console.log(`[Snapshot Generator] Found ${activeUsers.length} active users`);

            let successCount = 0;
            let failureCount = 0;

            for (const user of activeUsers) {
                try {
                    await replayEngine.createSnapshot(user.id);
                    successCount++;
                    console.log(`[Snapshot Generator] ✓ Created snapshot for user ${user.email}`);
                } catch (error) {
                    failureCount++;
                    console.error(`[Snapshot Generator] ✗ Failed for user ${user.email}:`, error.message);
                }
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[Snapshot Generator] Completed in ${duration}s - Success: ${successCount}, Failed: ${failureCount}`);
        } catch (error) {
            console.error('[Snapshot Generator] Fatal error:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Manually trigger snapshot generation (for testing)
     */
    async runManual() {
        console.log('[Snapshot Generator] Manual execution triggered');
        await this.generateAllSnapshots();
    }

    /**
     * Stop the cron job
     */
    stop() {
        if (this.job) {
            this.job.stop();
            console.log('[Snapshot Generator] Stopped');
        }
    }

    /**
     * Get job status
     */
    getStatus() {
        return {
            scheduled: this.job ? true : false,
            running: this.isRunning,
            nextRun: this.job ? 'Daily at 2:00 AM IST' : null,
        };
    }
}

export default new SnapshotGenerator();
