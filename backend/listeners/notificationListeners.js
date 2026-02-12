import eventBus from '../events/eventBus.js';
import notificationService from '../services/notificationService.js';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Notification Listeners
 * Handles sending emails and in-app notifications based on app events
 */
export const initializeNotificationListeners = () => {
    // Listen for significant investment updates
    eventBus.on('INVESTMENT_VALUATION_CHANGED', async (data) => {
        const { userId, investmentName, investmentSymbol, changePercent, direction, newValue, oldValue } = data;

        console.log(`[NotificationListener] Sending investment swing notification to user ${userId}`);

        await notificationService.sendNotification(userId, {
            title: `Significant Value Change: ${investmentSymbol}`,
            message: `Your investment ${investmentName} has ${direction} by ${changePercent.toFixed(1)}% due to market/FX updates. New value: ${newValue.toFixed(2)}`,
            type: 'alert',
            data: { investmentName, changePercent, newValue, oldValue }
        });
    });

    // Listen for large expenses
    eventBus.on('EXPENSE_CREATED', async (data) => {
        const { userId, amount, description, currency } = data;

        // Example: Notify if expense is over a certain amount (e.g., 10,000)
        if (parseFloat(amount) > 10000) {
            await notificationService.sendNotification(userId, {
                title: "Large Expense Detected",
                message: `A large expense of ${currency} ${amount} for "${description}" has been recorded.`,
                type: "warning",
                data: { amount, description }
            });
        }
    });

    // Listen for goal milestones (could be added easily)
    eventBus.on('GOAL_MILESTONE_REACHED', async (data) => {
        const { userId, goalName, percentage } = data;
        await notificationService.sendNotification(userId, {
            title: "🎯 Goal Progress Milestone!",
            message: `Congratulations! You've reached ${percentage}% of your goal: ${goalName}.`,
            type: "success",
            data: { goalName, percentage }
        });
    });

    console.log('✅ Notification Listeners initialized');
};
