import eventBus from '../events/eventBus.js';
import { processRoundUp } from '../services/savingsService.js';

/**
 * Savings Listeners
 * Handles savings-related side effects like round-ups
 */
export const initializeSavingsListeners = () => {
    // Listen for new expenses to process round-up savings
    eventBus.on('EXPENSE_CREATED', async (expense) => {
        try {
            console.log(`[SavingsListener] Processing round-up for expense ${expense.id}`);
            await processRoundUp(expense);
        } catch (error) {
            console.error('[SavingsListener] Error processing round-up:', error);
        }
    });

    console.log('✅ Savings Listeners initialized');
};
