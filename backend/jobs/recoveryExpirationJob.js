/**
 * Recovery Expiration Job
 * Automated cleanup and state transitions for recovery requests and guardian votes
 * Runs hourly to check for expired recovery requests and approval timeouts
 */

import cron from 'node-cron';
import { db } from '../config/db.js';
import { recoveryRequests, guardianVotes, recursiveMultiSigRules } from '../db/schema.js';
import { eq, and, or, lt } from 'drizzle-orm';

/**
 * Process expired recovery requests
 * Marks recovery requests as expired if they exceed their expiration timestamp
 */
async function processExpiredRecoveries() {
    console.log('🕐 Checking for expired recovery requests...');

    try {
        const now = new Date();

        // Find recovery requests that have expired
        const expiredRecoveries = await db.select()
            .from(recoveryRequests)
            .where(and(
                lt(recoveryRequests.expiresAt, now),
                or(
                    eq(recoveryRequests.status, 'initiated'),
                    eq(recoveryRequests.status, 'collecting_shards'),
                    eq(recoveryRequests.status, 'cure_period')
                )
            ));

        if (expiredRecoveries.length === 0) {
            console.log('✅ No expired recovery requests found');
            return { expiredCount: 0 };
        }

        console.log(`Found ${expiredRecoveries.length} expired recovery requests`);

        // Update expired recoveries
        for (const recovery of expiredRecoveries) {
            await db.update(recoveryRequests)
                .set({
                    status: 'expired',
                    completedAt: now,
                    auditLog: [
                        ...recovery.auditLog,
                        {
                            timestamp: now.toISOString(),
                            action: 'auto_expired',
                            details: 'Recovery request expired due to maximum time limit'
                        }
                    ]
                })
                .where(eq(recoveryRequests.id, recovery.id));

            console.log(`❌ Recovery ${recovery.id} marked as expired (vault: ${recovery.vaultId})`);
        }

        return {
            expiredCount: expiredRecoveries.length,
            expiredRecoveries: expiredRecoveries.map(r => r.id)
        };
    } catch (error) {
        console.error('Error processing expired recoveries:', error);
        return { error: error.message };
    }
}

/**
 * Process cure period completions
 * Automatically approve recoveries that have completed cure period without challenge
 */
async function processCurePeriodCompletions() {
    console.log('⏰ Checking for completed cure periods...');

    try {
        const now = new Date();

        // Find recoveries in cure_period that have passed their cure expiration
        const completedCurePeriods = await db.select()
            .from(recoveryRequests)
            .where(and(
                eq(recoveryRequests.status, 'cure_period'),
                lt(recoveryRequests.cureExpiresAt, now)
            ));

        if (completedCurePeriods.length === 0) {
            console.log('✅ No completed cure periods found');
            return { approvedCount: 0 };
        }

        console.log(`Found ${completedCurePeriods.length} recoveries ready for approval`);

        // Auto-approve recoveries
        for (const recovery of completedCurePeriods) {
            await db.update(recoveryRequests)
                .set({
                    status: 'approved',
                    auditLog: [
                        ...recovery.auditLog,
                        {
                            timestamp: now.toISOString(),
                            action: 'auto_approved',
                            details: 'Cure period completed without challenge'
                        }
                    ]
                })
                .where(eq(recoveryRequests.id, recovery.id));

            console.log(`✅ Recovery ${recovery.id} auto-approved after cure period (vault: ${recovery.vaultId})`);
        }

        return {
            approvedCount: completedCurePeriods.length,
            approvedRecoveries: completedCurePeriods.map(r => r.id)
        };
    } catch (error) {
        console.error('Error processing cure period completions:', error);
        return { error: error.message };
    }
}

/**
 * Process expired guardian votes
 * Mark time-locked votes as expired if they exceed their validity period
 */
async function processExpiredVotes() {
    console.log('🗳️ Checking for expired guardian votes...');

    try {
        const now = new Date();

        // Find votes that have expired
        const expiredVotes = await db.select()
            .from(guardianVotes)
            .where(lt(guardianVotes.expiresAt, now));

        if (expiredVotes.length === 0) {
            console.log('✅ No expired votes found');
            return { expiredCount: 0 };
        }

        console.log(`Found ${expiredVotes.length} expired votes`);

        // Delete expired votes (or mark as invalid)
        for (const vote of expiredVotes) {
            await db.update(guardianVotes)
                .set({
                    metadata: {
                        ...vote.metadata,
                        expired: true,
                        expiredAt: now.toISOString()
                    }
                })
                .where(eq(guardianVotes.id, vote.id));
        }

        return {
            expiredCount: expiredVotes.length
        };
    } catch (error) {
        console.error('Error processing expired votes:', error);
        return { error: error.message };
    }
}

/**
 * Send reminder notifications for pending actions
 * Notify guardians about pending shard submissions or approvals
 */
async function sendReminderNotifications() {
    console.log('📧 Sending reminder notifications...');

    try {
        const now = new Date();
        const reminderThreshold = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago

        // Find recoveries awaiting shards for more than 24 hours
        const pendingRecoveries = await db.select()
            .from(recoveryRequests)
            .where(and(
                or(
                    eq(recoveryRequests.status, 'initiated'),
                    eq(recoveryRequests.status, 'collecting_shards')
                ),
                lt(recoveryRequests.initiatedAt, reminderThreshold)
            ));

        if (pendingRecoveries.length === 0) {
            console.log('✅ No pending recoveries requiring reminders');
            return { remindersSent: 0 };
        }

        console.log(`Found ${pendingRecoveries.length} recoveries requiring reminders`);

        // TODO: In production, send email/push notifications to guardians
        // For now, just log the reminder
        for (const recovery of pendingRecoveries) {
            console.log(`📨 Reminder needed for recovery ${recovery.id}: ${recovery.shardsCollected}/${recovery.requiredShards} shards collected`);
        }

        return {
            remindersSent: pendingRecoveries.length,
            pendingRecoveries: pendingRecoveries.map(r => ({
                id: r.id,
                vaultId: r.vaultId,
                shardsCollected: r.shardsCollected,
                requiredShards: r.requiredShards,
                daysWaiting: Math.floor((now - new Date(r.initiatedAt)) / (24 * 60 * 60 * 1000))
            }))
        };
    } catch (error) {
        console.error('Error sending reminder notifications:', error);
        return { error: error.message };
    }
}

/**
 * Clean up old completed recovery requests
 * Archive recovery requests older than 90 days that are completed
 */
async function cleanupOldRecoveries() {
    console.log('🧹 Cleaning up old recovery requests...');

    try {
        const now = new Date();
        const archiveThreshold = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)); // 90 days ago

        // Find old completed recoveries
        const oldRecoveries = await db.select()
            .from(recoveryRequests)
            .where(and(
                or(
                    eq(recoveryRequests.status, 'executed'),
                    eq(recoveryRequests.status, 'rejected'),
                    eq(recoveryRequests.status, 'expired')
                ),
                lt(recoveryRequests.completedAt, archiveThreshold)
            ));

        if (oldRecoveries.length === 0) {
            console.log('✅ No old recoveries to clean up');
            return { cleanedCount: 0 };
        }

        console.log(`Found ${oldRecoveries.length} old recoveries to archive`);

        // In production, move to archive table instead of delete
        // For now, just mark as archived in metadata
        for (const recovery of oldRecoveries) {
            await db.update(recoveryRequests)
                .set({
                    metadata: {
                        ...recovery.metadata,
                        archived: true,
                        archivedAt: now.toISOString()
                    }
                })
                .where(eq(recoveryRequests.id, recovery.id));
        }

        return {
            cleanedCount: oldRecoveries.length
        };
    } catch (error) {
        console.error('Error cleaning up old recoveries:', error);
        return { error: error.message };
    }
}

/**
 * Main recovery expiration job runner
 * Executes all cleanup and notification tasks
 */
export async function runRecoveryExpirationJob() {
    console.log('🚀 Starting recovery expiration job...');
    const startTime = Date.now();

    const results = {
        timestamp: new Date().toISOString(),
        duration: 0,
        tasks: {}
    };

    try {
        // Process expired recoveries
        results.tasks.expiredRecoveries = await processExpiredRecoveries();

        // Process completed cure periods
        results.tasks.curePeriodCompletions = await processCurePeriodCompletions();

        // Process expired votes
        results.tasks.expiredVotes = await processExpiredVotes();

        // Send reminder notifications
        results.tasks.reminders = await sendReminderNotifications();

        // Clean up old recoveries (run less frequently)
        const hour = new Date().getHours();
        if (hour === 3) { // Run at 3 AM only
            results.tasks.cleanup = await cleanupOldRecoveries();
        }

        results.duration = Date.now() - startTime;
        results.success = true;

        console.log(`✅ Recovery expiration job completed in ${results.duration}ms`);

        return results;
    } catch (error) {
        console.error('❌ Recovery expiration job failed:', error);
        results.success = false;
        results.error = error.message;
        results.duration = Date.now() - startTime;

        return results;
    }
}

/**
 * Schedule recovery expiration job
 * Runs every hour at minute 0
 */
export function scheduleRecoveryExpirationJob() {
    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        console.log('⏰ Recovery expiration job triggered');
        await runRecoveryExpirationJob();
    }, {
        timezone: 'America/New_York'
    });

    console.log('📅 Recovery expiration job scheduled (hourly at minute 0)');
}

/**
 * Initialize and start the recovery expiration job
 */
export function start() {
    scheduleRecoveryExpirationJob();

    // Run immediately on startup
    console.log('🚀 Running recovery expiration job on startup...');
    runRecoveryExpirationJob().catch(error => {
        console.error('Error running recovery job on startup:', error);
    });
}

export default {
    runRecoveryExpirationJob,
    scheduleRecoveryExpirationJob,
    start
};
