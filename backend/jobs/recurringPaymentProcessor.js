import cron from 'node-cron';
import db from '../config/db.js';
import {
    recurringTransactions,
    scheduledPayments,
    paymentRemindersTracking
} from '../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import billPaymentEngine from '../services/billPaymentEngine.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Recurring Payment Processor Job
 * Processes scheduled payments and sends reminders
 */
class RecurringPaymentProcessor {
    constructor() {
        this.isRunning = false;
        this.stats = {
            paymentsProcessed: 0,
            remindersSent: 0,
            errors: 0,
            lastRun: null
        };
    }

    /**
     * Start the processor job
     */
    start() {
        // Run daily at 6 AM
        cron.schedule('0 6 * * *', async () => {
            await this.processScheduledPayments();
        });

        // Run reminder check every 4 hours
        cron.schedule('0 */4 * * *', async () => {
            await this.sendPaymentReminders();
        });

        // Generate recurring payments daily at midnight
        cron.schedule('0 0 * * *', async () => {
            await this.generateRecurringPayments();
        });

        logInfo('Recurring Payment Processor scheduled');
        logInfo('  - Payment processing: Daily at 6 AM');
        logInfo('  - Reminders: Every 4 hours');
        logInfo('  - Recurring generation: Daily at midnight');

        // Run immediately on startup (after delay)
        setTimeout(() => {
            this.processScheduledPayments();
            this.sendPaymentReminders();
        }, 30000);
    }

    /**
     * Process scheduled auto-payments
     */
    async processScheduledPayments() {
        if (this.isRunning) {
            logInfo('Payment processor already running, skipping...');
            return;
        }

        this.isRunning = true;

        try {
            logInfo('💳 Processing scheduled auto-payments...');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Get payments scheduled for today with auto-pay enabled
            const duePayments = await db.select()
                .from(scheduledPayments)
                .where(
                    and(
                        eq(scheduledPayments.status, 'pending'),
                        eq(scheduledPayments.isAutoPay, true),
                        gte(scheduledPayments.scheduledDate, today),
                        lte(scheduledPayments.scheduledDate, tomorrow)
                    )
                );

            logInfo(`Found ${duePayments.length} auto-payments to process`);

            let processed = 0;
            let failed = 0;

            for (const payment of duePayments) {
                try {
                    const result = await billPaymentEngine.processAutoPay(payment.id);

                    if (result.success) {
                        processed++;
                        logInfo(`✅ Processed: ${payment.payeeName} - $${payment.amount}`);
                    } else {
                        failed++;
                        logError(`❌ Failed: ${payment.payeeName} - ${result.error}`);
                    }
                } catch (error) {
                    failed++;
                    logError(`Error processing payment ${payment.id}:`, error);
                }
            }

            this.stats.paymentsProcessed = processed;
            this.stats.errors = failed;
            this.stats.lastRun = new Date();

            logInfo(`✅ Payment processing complete: ${processed} successful, ${failed} failed`);
        } catch (error) {
            logError('Payment processing job failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Send payment reminders
     */
    async sendPaymentReminders() {
        try {
            logInfo('📧 Sending payment reminders...');

            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

            // Get pending reminders that are due
            const dueReminders = await db.select()
                .from(paymentRemindersTracking)
                .where(
                    and(
                        eq(paymentRemindersTracking.status, 'pending'),
                        lte(paymentRemindersTracking.reminderDate, now),
                        gte(paymentRemindersTracking.reminderDate, oneHourAgo)
                    )
                );

            logInfo(`Found ${dueReminders.length} reminders to send`);

            let sent = 0;

            for (const reminder of dueReminders) {
                try {
                    // Simulate sending reminder
                    // In production, integrate with email/SMS service
                    await this.sendReminder(reminder);

                    // Mark as sent
                    await db.update(paymentRemindersTracking)
                        .set({
                            status: 'sent',
                            sentAt: new Date()
                        })
                        .where(eq(paymentRemindersTracking.id, reminder.id));

                    sent++;

                    // Update scheduled payment reminder flag
                    if (reminder.scheduledPaymentId) {
                        await db.update(scheduledPayments)
                            .set({
                                reminderSent: true,
                                reminderSentAt: new Date()
                            })
                            .where(eq(scheduledPayments.id, reminder.scheduledPaymentId));
                    }
                } catch (error) {
                    logError(`Failed to send reminder ${reminder.id}:`, error);

                    await db.update(paymentRemindersTracking)
                        .set({ status: 'failed' })
                        .where(eq(paymentRemindersTracking.id, reminder.id));
                }
            }

            this.stats.remindersSent = sent;
            logInfo(`✅ Sent ${sent} payment reminders`);
        } catch (error) {
            logError('Reminder sending job failed:', error);
        }
    }

    /**
     * Send reminder (placeholder for email/SMS integration)
     */
    async sendReminder(reminder) {
        // Simulate sending
        logInfo(`📬 Sending ${reminder.reminderType} reminder: ${reminder.message}`);

        // In production:
        // - Send email via SendGrid/AWS SES
        // - Send SMS via Twilio
        // - Send push notification

        return Promise.resolve();
    }

    /**
     * Generate scheduled payments from recurring transactions
     */
    async generateRecurringPayments() {
        try {
            logInfo('🔄 Generating payments from recurring transactions...');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);

            // Get active recurring transactions due in next 7 days
            const dueRecurring = await db.select()
                .from(recurringTransactions)
                .where(
                    and(
                        eq(recurringTransactions.status, 'active'),
                        lte(recurringTransactions.nextDueDate, nextWeek)
                    )
                );

            logInfo(`Found ${dueRecurring.length} recurring transactions due`);

            let generated = 0;

            for (const recurring of dueRecurring) {
                try {
                    // Check if payment already scheduled
                    const existing = await db.select()
                        .from(scheduledPayments)
                        .where(
                            and(
                                eq(scheduledPayments.recurringTransactionId, recurring.id),
                                eq(scheduledPayments.status, 'pending')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        continue; // Already scheduled
                    }

                    // Create scheduled payment
                    const payment = await billPaymentEngine.schedulePayment(recurring.userId, {
                        recurringTransactionId: recurring.id,
                        payeeName: recurring.name,
                        amount: parseFloat(recurring.amount),
                        scheduledDate: recurring.nextDueDate,
                        dueDate: recurring.nextDueDate,
                        paymentMethod: recurring.paymentMethod,
                        isAutoPay: recurring.isAutoPayEnabled,
                        notes: `Auto-generated from recurring transaction`
                    });

                    generated++;
                    logInfo(`✅ Generated payment: ${recurring.name} - $${recurring.amount}`);
                } catch (error) {
                    logError(`Failed to generate payment for ${recurring.name}:`, error);
                }
            }

            logInfo(`✅ Generated ${generated} scheduled payments`);
        } catch (error) {
            logError('Recurring payment generation failed:', error);
        }
    }

    /**
     * Get job statistics
     */
    getStats() {
        return this.stats;
    }

    /**
     * Manually trigger payment processing
     */
    async trigger() {
        logInfo('Manually triggering payment processor...');
        await this.processScheduledPayments();
        await this.sendPaymentReminders();
        await this.generateRecurringPayments();
    }
}

const recurringPaymentProcessor = new RecurringPaymentProcessor();

export default recurringPaymentProcessor;
export { recurringPaymentProcessor };
