import eventBus from '../events/eventBus.js';
import subscriptionDetector from '../services/subscriptionDetector.js';
import db from '../config/db.js';
import { subscriptions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Subscription Listeners
 * Handles subscription-related logic when expenses occur
 */
export const initializeSubscriptionListeners = () => {
    // Listen for new expenses to match against subscriptions
    eventBus.on('EXPENSE_CREATED', async (data) => {
        const { id, userId, amount, date, billingCycle } = data;

        try {
            console.log(`[SubscriptionListener] Attempting to match expense ${id} to a subscription`);

            // Re-fetch expense or use data
            const expense = data;
            const matchedSub = await subscriptionDetector.matchExpenseToSubscription(expense, userId);

            if (matchedSub) {
                console.log(`[SubscriptionListener] Matched expense to subscription: ${matchedSub.name}`);

                // Update subscription with last renewal and next renewal estimate
                const lastRenewalDate = new Date(date || new Date());
                const nextRenewalDate = new Date(lastRenewalDate);

                if (matchedSub.billingCycle === 'yearly') nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
                else if (matchedSub.billingCycle === 'quarterly') nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 3);
                else if (matchedSub.billingCycle === 'biweekly') nextRenewalDate.setDate(nextRenewalDate.getDate() + 14);
                else if (matchedSub.billingCycle === 'weekly') nextRenewalDate.setDate(nextRenewalDate.getDate() + 7);
                else nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1); // Default monthly

                await db.update(subscriptions)
                    .set({
                        lastRenewalDate,
                        nextRenewalDate,
                        linkedExpenseIds: [...(matchedSub.linkedExpenseIds || []), id],
                        updatedAt: new Date()
                    })
                    .where(eq(subscriptions.id, matchedSub.id));
            }
        } catch (error) {
            console.error('[SubscriptionListener] Error matching expense:', error);
        }
    });

    console.log('✅ Subscription Listeners initialized');
};
