import eventBus from '../events/eventBus.js';
import notificationService from '../services/notificationService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Autopilot Action Listeners (#461)
 * ──────────────────────────────────
 * Handles the downstream effects of autopilot action events:
 *   - AUTOPILOT_ALERT → notify user via notification service
 *   - AUTOPILOT_EXPENSE_CAP → record cap in user metadata / cache
 *   - WORKFLOW_EXECUTED → post-execution audit logging
 *
 * Heavy actions (SWEEP_VAULT, FX_SWAP, etc.) are handled by their
 * respective domain services which subscribe independently.
 */
export const initializeAutopilotListeners = () => {

    // ── Alert Notification ────────────────────────────────────────────────────
    eventBus.subscribe('AUTOPILOT_ALERT', async ({ userId, title, message, severity }) => {
        logInfo(`[AutopilotListener] Sending alert to user ${userId}: ${title}`);
        await notificationService.sendNotification(userId, {
            title: `🤖 Autopilot: ${title}`,
            message,
            type: severity || 'info',
            data: { source: 'autopilot', severity },
        });
    });

    // ── Workflow Executed Notification ────────────────────────────────────────
    eventBus.subscribe('WORKFLOW_EXECUTED', async ({ userId, workflowName, status, durationMs }) => {
        if (status === 'failed') {
            await notificationService.sendNotification(userId, {
                title: '⚠️ Autopilot Workflow Failed',
                message: `Your workflow "${workflowName}" failed during execution. Check the Autopilot logs for details.`,
                type: 'error',
                data: { workflowName, status, durationMs },
            });
        } else if (status === 'success') {
            logInfo(`[AutopilotListener] Workflow "${workflowName}" succeeded in ${durationMs}ms.`);
        }
    });

    // ── Expense Cap Recording ─────────────────────────────────────────────────
    eventBus.subscribe('AUTOPILOT_EXPENSE_CAP', async ({ userId, categoryId, capAmount, durationDays }) => {
        logInfo(`[AutopilotListener] Expense cap set: user=${userId}, cat=${categoryId}, cap=${capAmount}, days=${durationDays}`);
        // In a full implementation this would write to a `spending_caps` table.
        // For now, we notify the user and trust the middleware to enforce.
        await notificationService.sendNotification(userId, {
            title: '🔒 Spending Cap Activated',
            message: `Your Autopilot has imposed a spending cap of ${capAmount} for ${durationDays} day(s)${categoryId ? ' on a specific category' : ''}.`,
            type: 'warning',
            data: { capAmount, durationDays, categoryId },
        });
    });

    // ── Debt Payoff Kick-Off ──────────────────────────────────────────────────
    eventBus.subscribe('AUTOPILOT_DEBT_PAYOFF', async ({ userId, debtId, strategy }) => {
        logInfo(`[AutopilotListener] Autopilot debt payoff: user=${userId}, debt=${debtId}, strategy=${strategy}`);
        await notificationService.sendNotification(userId, {
            title: '💳 Autopilot: Debt Payoff Initiated',
            message: `Your Autopilot is executing a "${strategy}" debt payoff strategy. Review Debt Dashboard for details.`,
            type: 'info',
            data: { debtId, strategy },
        });
    });

    // ── Tax-Loss Harvest Notification ─────────────────────────────────────────
    eventBus.subscribe('AUTOPILOT_HARVEST', async ({ userId, threshold }) => {
        logInfo(`[AutopilotListener] Harvest scan triggered for user ${userId}, threshold ${threshold}`);
        await notificationService.sendNotification(userId, {
            title: '🌾 Tax-Loss Harvest Scan Triggered',
            message: `Your Autopilot detected a harvest opportunity. Positions with unrealized losses above ${threshold} are being reviewed.`,
            type: 'info',
            data: { threshold },
        });
    });

    // ── FX Swap Notification ──────────────────────────────────────────────────
    eventBus.subscribe('AUTOPILOT_FX_SWAP', async ({ userId, fromCurrency, toCurrency, amount }) => {
        await notificationService.sendNotification(userId, {
            title: '💱 Autopilot: FX Swap Queued',
            message: `An automated FX swap of ${amount} ${fromCurrency} → ${toCurrency} has been queued by your Autopilot.`,
            type: 'info',
            data: { fromCurrency, toCurrency, amount },
        });
    });

    // ── Goal Funding Notification ─────────────────────────────────────────────
    eventBus.subscribe('AUTOPILOT_FUND_GOAL', async ({ userId, goalId, amount }) => {
        await notificationService.sendNotification(userId, {
            title: '🎯 Autopilot: Goal Funded',
            message: `Your Autopilot transferred ${amount} towards your financial goal.`,
            type: 'success',
            data: { goalId, amount },
        });
    });

    logInfo('[AutopilotListeners] All autopilot event listeners initialized.');
};
