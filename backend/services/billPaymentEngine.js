import db from '../config/db.js';
import { scheduledPayments, recurringTransactions, paymentRemindersTracking } from '../db/schema.js';
import { eq, and, lte, gte, desc } from 'drizzle-orm';

/**
 * Bill Payment Engine
 * Handles scheduled payments and auto-payment execution
 */
class BillPaymentEngine {
    constructor() {
        this.REMINDER_DAYS_BEFORE = [7, 3, 1, 0]; // Days before due date to send reminders
    }

    /**
     * Schedule a payment
     */
    async schedulePayment(userId, paymentData) {
        try {
            const {
                recurringTransactionId,
                payeeName,
                amount,
                scheduledDate,
                dueDate,
                paymentMethod,
                isAutoPay = false,
                notes
            } = paymentData;

            const [payment] = await db.insert(scheduledPayments)
                .values({
                    userId,
                    recurringTransactionId,
                    payeeName,
                    amount: amount.toString(),
                    scheduledDate: new Date(scheduledDate),
                    dueDate: dueDate ? new Date(dueDate) : null,
                    paymentMethod,
                    isAutoPay,
                    notes,
                    status: 'pending'
                })
                .returning();

            console.log(`✅ Payment scheduled: ${payeeName} for $${amount}`);

            // Schedule reminders
            if (dueDate) {
                await this.scheduleReminders(payment);
            }

            return payment;
        } catch (error) {
            console.error('Failed to schedule payment:', error);
            throw error;
        }
    }

    /**
     * Schedule reminders for a payment
     */
    async scheduleReminders(payment) {
        const dueDate = new Date(payment.dueDate);
        const reminders = [];

        for (const daysBefore of this.REMINDER_DAYS_BEFORE) {
            const reminderDate = new Date(dueDate);
            reminderDate.setDate(reminderDate.getDate() - daysBefore);

            // Only schedule future reminders
            if (reminderDate > new Date()) {
                const reminderType = daysBefore === 0 ? 'due_today' :
                    daysBefore === 1 ? 'due_tomorrow' : 'upcoming';

                reminders.push({
                    userId: payment.userId,
                    scheduledPaymentId: payment.id,
                    reminderType,
                    reminderDate,
                    message: this.generateReminderMessage(payment, daysBefore)
                });
            }
        }

        if (reminders.length > 0) {
            await db.insert(paymentRemindersTracking).values(reminders);
        }

        return reminders;
    }

    /**
     * Generate reminder message
     */
    generateReminderMessage(payment, daysBefore) {
        const amount = parseFloat(payment.amount);

        if (daysBefore === 0) {
            return `Payment due today: ${payment.payeeName} - $${amount.toFixed(2)}`;
        } else if (daysBefore === 1) {
            return `Payment due tomorrow: ${payment.payeeName} - $${amount.toFixed(2)}`;
        } else {
            return `Upcoming payment in ${daysBefore} days: ${payment.payeeName} - $${amount.toFixed(2)}`;
        }
    }

    /**
     * Process auto-payments
     */
    async processAutoPay(paymentId) {
        try {
            const [payment] = await db.select()
                .from(scheduledPayments)
                .where(eq(scheduledPayments.id, paymentId))
                .limit(1);

            if (!payment) {
                throw new Error('Payment not found');
            }

            if (!payment.isAutoPay) {
                throw new Error('Auto-pay not enabled for this payment');
            }

            console.log(`💳 Processing auto-payment: ${payment.payeeName}`);

            // Update status to processing
            await db.update(scheduledPayments)
                .set({ status: 'processing' })
                .where(eq(scheduledPayments.id, paymentId));

            // Simulate payment processing
            // In production, integrate with payment gateway
            const success = await this.executePayment(payment);

            if (success) {
                await db.update(scheduledPayments)
                    .set({
                        status: 'completed',
                        processedAt: new Date(),
                        confirmationNumber: this.generateConfirmationNumber()
                    })
                    .where(eq(scheduledPayments.id, paymentId));

                console.log(`✅ Auto-payment completed: ${payment.payeeName}`);

                // Update recurring transaction
                if (payment.recurringTransactionId) {
                    await this.updateRecurringAfterPayment(payment);
                }

                return { success: true, payment };
            } else {
                await db.update(scheduledPayments)
                    .set({
                        status: 'failed',
                        failureReason: 'Payment processing failed'
                    })
                    .where(eq(scheduledPayments.id, paymentId));

                return { success: false, error: 'Payment failed' };
            }
        } catch (error) {
            console.error('Auto-payment processing failed:', error);
            throw error;
        }
    }

    /**
     * Execute payment (placeholder for payment gateway integration)
     */
    async executePayment(payment) {
        // Simulate payment processing
        return new Promise((resolve) => {
            setTimeout(() => {
                // 95% success rate for simulation
                resolve(Math.random() > 0.05);
            }, 1000);
        });
    }

    /**
     * Generate confirmation number
     */
    generateConfirmationNumber() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `PAY-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Update recurring transaction after payment
     */
    async updateRecurringAfterPayment(payment) {
        const [recurring] = await db.select()
            .from(recurringTransactions)
            .where(eq(recurringTransactions.id, payment.recurringTransactionId))
            .limit(1);

        if (!recurring) return;

        const totalPaid = parseFloat(recurring.totalPaid || 0) + parseFloat(payment.amount);
        const occurrenceCount = recurring.occurrenceCount + 1;

        // Calculate next due date
        const nextDueDate = this.calculateNextDueDate(
            new Date(recurring.nextDueDate),
            recurring.frequency
        );

        await db.update(recurringTransactions)
            .set({
                totalPaid: totalPaid.toString(),
                occurrenceCount,
                lastProcessedDate: new Date(),
                nextDueDate,
                updatedAt: new Date()
            })
            .where(eq(recurringTransactions.id, payment.recurringTransactionId));
    }

    /**
     * Calculate next due date
     */
    calculateNextDueDate(currentDate, frequency) {
        const next = new Date(currentDate);

        switch (frequency) {
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'biweekly':
                next.setDate(next.getDate() + 14);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                break;
            case 'quarterly':
                next.setMonth(next.getMonth() + 3);
                break;
            case 'yearly':
                next.setFullYear(next.getFullYear() + 1);
                break;
        }

        return next;
    }

    /**
     * Get upcoming payments
     */
    async getUpcomingPayments(userId, days = 30) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        return await db.select()
            .from(scheduledPayments)
            .where(
                and(
                    eq(scheduledPayments.userId, userId),
                    lte(scheduledPayments.scheduledDate, endDate),
                    eq(scheduledPayments.status, 'pending')
                )
            )
            .orderBy(scheduledPayments.scheduledDate);
    }

    /**
     * Get payment history
     */
    async getPaymentHistory(userId, limit = 50) {
        return await db.select()
            .from(scheduledPayments)
            .where(eq(scheduledPayments.userId, userId))
            .orderBy(desc(scheduledPayments.scheduledDate))
            .limit(limit);
    }

    /**
     * Cancel payment
     */
    async cancelPayment(paymentId) {
        const [cancelled] = await db.update(scheduledPayments)
            .set({
                status: 'cancelled',
                updatedAt: new Date()
            })
            .where(eq(scheduledPayments.id, paymentId))
            .returning();

        return cancelled;
    }

    /**
     * Retry failed payment
     */
    async retryPayment(paymentId) {
        const [payment] = await db.select()
            .from(scheduledPayments)
            .where(eq(scheduledPayments.id, paymentId))
            .limit(1);

        if (!payment || payment.status !== 'failed') {
            throw new Error('Payment cannot be retried');
        }

        // Reset status and retry
        await db.update(scheduledPayments)
            .set({
                status: 'pending',
                failureReason: null,
                updatedAt: new Date()
            })
            .where(eq(scheduledPayments.id, paymentId));

        return await this.processAutoPay(paymentId);
    }

    /**
     * Get payment analytics
     */
    async getPaymentAnalytics(userId) {
        const payments = await this.getPaymentHistory(userId, 1000);

        const totalPaid = payments
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);

        const successRate = payments.length > 0
            ? (payments.filter(p => p.status === 'completed').length / payments.length) * 100
            : 0;

        const avgPaymentAmount = payments.length > 0
            ? totalPaid / payments.filter(p => p.status === 'completed').length
            : 0;

        return {
            totalPayments: payments.length,
            completedPayments: payments.filter(p => p.status === 'completed').length,
            failedPayments: payments.filter(p => p.status === 'failed').length,
            totalPaid: Math.round(totalPaid * 100) / 100,
            successRate: Math.round(successRate * 100) / 100,
            avgPaymentAmount: Math.round(avgPaymentAmount * 100) / 100
        };
    }
}

export default new BillPaymentEngine();
