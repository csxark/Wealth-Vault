import { logInfo } from '../utils/logger.js';
import thresholdMonitor from '../services/thresholdMonitor.js';
import eventBus from '../events/eventBus.js';

/**
 * LiquidityListeners (#476)
 * Hooks into budget and expense events to trigger proactive liquidity checks.
 */
export const initializeLiquidityListeners = () => {

    // Listen for large expense approvals
    eventBus.subscribe('EXPENSE_CREATED', async (data) => {
        if (Number(data.amount) > 5000) {
            logInfo(`[LiquidityListener] High-value expense detected ($${data.amount}). Triggering proactive threshold sweep.`);
            await thresholdMonitor.checkUserVaults(data.userId);
        }
    });

    // Listen for payroll initiation (Triggered by payroll processor)
    eventBus.subscribe('PAYROLL_STARTED', async (data) => {
        logInfo(`[LiquidityListener] Payroll run started for user ${data.userId}. Ensuring liquidity is optimal.`);
        await thresholdMonitor.checkUserVaults(data.userId);
    });

    logInfo('Liquidity Event Listeners initialized on eventBus.');
};
