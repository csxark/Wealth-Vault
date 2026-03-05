import cron from 'node-cron';
import db from '../config/db.js';
import { settlementTransactions, paymentReminders, settlements, users } from '../db/schema.js';
import { eq, and, lt, inArray, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Settlement Reminder Job
 * Sends automated payment reminders for overdue settlements
 * Runs daily at 9 AM
 */
class SettlementReminderJob {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.stats = {
            totalReminders: 0,
            remindersSent: 0,
            errors: 0
        };
    }

    /**
     * Start the reminder job
     * Runs daily at 9 AM
     */
    start() {
        // Run daily at 9 AM: 0 9 * * *
        cron.schedule('0 9 * * *', async () => {
            await this.run();
        });

        logInfo('Settlement Reminder Job scheduled (daily at 9 AM)');

        // Run immediately on startup for testing
        setTimeout(() => {
            this.run();
        }, 10000); // Wait 10 seconds after startup
    }

    /**
     * Run the reminder job
     */
    async run() {
        if (this.isRunning) {
            logInfo('Settlement reminder job already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logInfo('🔔 Starting settlement reminder job...');

            const now = new Date();

            // Get all pending and partial transactions
            const pendingTransactions = await db.select()
                .from(settlementTransactions)
                .where(inArray(settlementTransactions.status, ['pending', 'partial']))
                .orderBy(desc(settlementTransactions.dueDate));

            logInfo(`Found ${pendingTransactions.length} pending transactions`);

            let remindersSent = 0;
            let errors = 0;

            for (const transaction of pendingTransactions) {
                try {
                    const dueDate = transaction.dueDate ? new Date(transaction.dueDate) : null;

                    if (!dueDate) continue;

                    const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

                    // Determine reminder type based on days overdue
                    let reminderType = null;
                    let message = '';

                    if (daysOverdue === 0) {
                        // Due today
                        reminderType = 'initial';
                        message = `Payment of $${transaction.amountRemaining} is due today`;
                    } else if (daysOverdue === 3) {
                        // 3 days overdue
                        reminderType = 'follow_up';
                        message = `Payment of $${transaction.amountRemaining} is 3 days overdue`;
                    } else if (daysOverdue === 7) {
                        // 1 week overdue
                        reminderType = 'escalation';
                        message = `Payment of $${transaction.amountRemaining} is 1 week overdue`;
                    } else if (daysOverdue === 30) {
                        // 1 month overdue
                        reminderType = 'final';
                        message = `Payment of $${transaction.amountRemaining} is 1 month overdue - final reminder`;
                    }

                    if (reminderType) {
                        // Check if reminder already sent today
                        const existingReminder = await this.checkExistingReminder(
                            transaction.settlementId,
                            transaction.id,
                            reminderType
                        );

                        if (!existingReminder) {
                            await this.sendReminder(
                                transaction.settlementId,
                                transaction.id,
                                transaction.payerId,
                                reminderType,
                                message
                            );
                            remindersSent++;
                        }
                    }
                } catch (error) {
                    errors++;
                    logError(`Error processing transaction ${transaction.id}:`, error);
                }
            }

            // Send weekly summaries (every Monday)
            const dayOfWeek = now.getDay();
            if (dayOfWeek === 1) { // Monday
                await this.sendWeeklySummaries();
            }

            const duration = Date.now() - startTime;

            this.stats.totalReminders += remindersSent;
            this.stats.remindersSent = remindersSent;
            this.stats.errors = errors;
            this.lastRun = new Date();

            logInfo(`✅ Settlement reminder job completed in ${duration}ms`);
            logInfo(`   - Reminders sent: ${remindersSent}`);
            logInfo(`   - Errors: ${errors}`);
        } catch (error) {
            logError('Settlement reminder job failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Check if reminder already sent today
     */
    async checkExistingReminder(settlementId, transactionId, reminderType) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [existing] = await db.select()
            .from(paymentReminders)
            .where(
                and(
                    eq(paymentReminders.settlementId, settlementId),
                    eq(paymentReminders.transactionId, transactionId),
                    eq(paymentReminders.reminderType, reminderType),
                    eq(paymentReminders.status, 'sent')
                )
            )
            .limit(1);

        if (existing && new Date(existing.sentAt) >= today) {
            return true;
        }

        return false;
    }

    /**
     * Send payment reminder
     */
    async sendReminder(settlementId, transactionId, recipientId, reminderType, message) {
        try {
            // Create reminder record
            const [reminder] = await db.insert(paymentReminders).values({
                settlementId,
                transactionId,
                recipientId,
                reminderType,
                message,
                status: 'pending',
                scheduledFor: new Date(),
                deliveryMethod: 'email'
            }).returning();

            // In production, send actual email/SMS/push notification
            // For now, just mark as sent
            await db.update(paymentReminders)
                .set({
                    status: 'sent',
                    sentAt: new Date()
                })
                .where(eq(paymentReminders.id, reminder.id));

            logInfo(`📧 Sent ${reminderType} reminder for transaction ${transactionId}`);

            return reminder;
        } catch (error) {
            logError(`Failed to send reminder:`, error);
            throw error;
        }
    }

    /**
     * Send weekly settlement summaries
     */
    async sendWeeklySummaries() {
        try {
            logInfo('📊 Sending weekly settlement summaries...');

            // Get all users with pending transactions
            const usersWithPending = await db.select({
                userId: settlementTransactions.payerId
            })
                .from(settlementTransactions)
                .where(inArray(settlementTransactions.status, ['pending', 'partial']))
                .groupBy(settlementTransactions.payerId);

            for (const { userId } of usersWithPending) {
                // Get user's pending transactions
                const transactions = await db.select()
                    .from(settlementTransactions)
                    .where(
                        and(
                            eq(settlementTransactions.payerId, userId),
                            inArray(settlementTransactions.status, ['pending', 'partial'])
                        )
                    );

                const totalOwed = transactions.reduce((sum, t) =>
                    sum + parseFloat(t.amountRemaining), 0
                );

                const message = `Weekly Summary: You have ${transactions.length} pending payments totaling $${totalOwed.toFixed(2)}`;

                // Create summary reminder
                await db.insert(paymentReminders).values({
                    settlementId: transactions[0].settlementId,
                    recipientId: userId,
                    reminderType: 'follow_up',
                    message,
                    status: 'sent',
                    scheduledFor: new Date(),
                    sentAt: new Date(),
                    deliveryMethod: 'email',
                    metadata: {
                        type: 'weekly_summary',
                        transactionCount: transactions.length,
                        totalOwed
                    }
                });

                logInfo(`📧 Sent weekly summary to user ${userId}`);
            }
        } catch (error) {
            logError('Failed to send weekly summaries:', error);
        }
    }

    /**
     * Send escalation reminders for long-overdue payments
     */
    async sendEscalationReminders() {
        try {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

            // Get transactions overdue by 30+ days
            const overdueTransactions = await db.select()
                .from(settlementTransactions)
                .where(
                    and(
                        inArray(settlementTransactions.status, ['pending', 'partial']),
                        lt(settlementTransactions.dueDate, thirtyDaysAgo)
                    )
                );

            for (const transaction of overdueTransactions) {
                const daysOverdue = Math.floor(
                    (now - new Date(transaction.dueDate)) / (1000 * 60 * 60 * 24)
                );

                const message = `URGENT: Payment of $${transaction.amountRemaining} is ${daysOverdue} days overdue. Please settle immediately.`;

                await this.sendReminder(
                    transaction.settlementId,
                    transaction.id,
                    transaction.payerId,
                    'escalation',
                    message
                );
            }

            logInfo(`⚠️  Sent ${overdueTransactions.length} escalation reminders`);
        } catch (error) {
            logError('Failed to send escalation reminders:', error);
        }
    }

    /**
     * Get job statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastRun: this.lastRun,
            isRunning: this.isRunning
        };
    }

    /**
     * Manually trigger the job
     */
    async trigger() {
        logInfo('Manually triggering settlement reminder job...');
        await this.run();
    }
}

const settlementReminderJob = new SettlementReminderJob();

export default settlementReminderJob;
export { settlementReminderJob };
