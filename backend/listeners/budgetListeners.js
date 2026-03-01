import eventBus from '../events/eventBus.js';
import budgetEngine from '../services/budgetEngine.js';

/**
 * Budget Listeners
 * Handles budget-related side effects when events occur
 */
export const initializeBudgetListeners = () => {
    // Listen for new or updated expenses to monitor budgets
    eventBus.on('EXPENSE_CREATED', async (data) => {
        const { userId, categoryId } = data;
        if (userId && categoryId) {
            console.log(`[BudgetListener] Checking budget for user ${userId}, category ${categoryId}`);
            await budgetEngine.monitorBudget(userId, categoryId);
        }
    });

    eventBus.on('EXPENSE_UPDATED', async (data) => {
        const { userId, categoryId, oldCategoryId } = data;
        if (userId) {
            if (categoryId) {
                await budgetEngine.monitorBudget(userId, categoryId);
            }
            // Also update old category if it changed
            if (oldCategoryId && oldCategoryId !== categoryId) {
                await budgetEngine.monitorBudget(userId, oldCategoryId);
            }
        }
    });

    eventBus.on('GOAL_RISK_REBALANCED', async (data) => {
        const { userId } = data;
        const budgetService = (await import('../services/budgetService.js')).default;
        console.log(`[BudgetListener] Goal rebalanced for user ${userId} - Tightening spending limits`);
        await budgetService.adjustSpendingLimitsBasedOnRisk(userId);
    });

    console.log('✅ Budget Listeners initialized');
};
