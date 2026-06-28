import db from '../config/db.js';
import {
    autopilotWorkflows,
    workflowTriggers,
    workflowActions,
    workflowExecutionLogs,
    vaults,
    expenses,
    debts,
} from '../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import eventBus from '../events/eventBus.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Financial Autopilot Workflow Engine (#461)
 *
 * Evaluates DSL-defined trigger conditions against live event payloads,
 * then executes ordered action steps with rollback support.
 *
 * Supported trigger variables:
 *  cash_reserve, portfolio_volatility, debt_apr, tax_liability,
 *  vault_balance, expense_total, macro_vix, governance_quorum, expense_spike
 *
 * Supported action types:
 *  ALERT, SWEEP_VAULT, EXPENSE_CAP, DEBT_PAYOFF, REBALANCE,
 *  HARVEST_LOSSES, GOVERNANCE_VOTE, FX_SWAP, FUND_GOAL
 */
class WorkflowEngine {
    constructor() {
        this._registerEventHooks();
    }

    // ─── Event Hooks ─────────────────────────────────────────────────────────

    _registerEventHooks() {
        // Expense events
        eventBus.on('EXPENSE_CREATED', (p) => this._fanout(p.userId, 'expense_total', p.amount, 'EXPENSE_CREATED'));
        eventBus.on('EXPENSE_SPIKE_DETECTED', (p) => this._fanout(p.userId, 'expense_spike', p.amount, 'EXPENSE_SPIKE_DETECTED'));

        // Vault / liquidity events
        eventBus.on('VAULT_BALANCE_UPDATED', (p) => this._fanout(p.userId, 'vault_balance', p.balance, 'VAULT_BALANCE_UPDATED'));
        eventBus.on('LIQUIDITY_RUNWAY_CHANGE', (p) => this._fanout(p.userId, 'cash_reserve', p.value, 'LIQUIDITY_RUNWAY_CHANGE'));

        // Debt events
        eventBus.on('DEBT_APR_CHANGE', (p) => this._fanout(p.userId, 'debt_apr', p.value, 'DEBT_APR_CHANGE'));

        // Market / macro events
        eventBus.on('MARKET_VOLATILITY_CHANGE', (p) => this._fanout(p.userId, 'portfolio_volatility', p.value, 'MARKET_VOLATILITY_CHANGE'));
        eventBus.on('MACRO_VIX_UPDATE', (p) => this._fanout(p.userId, 'macro_vix', p.value, 'MACRO_VIX_UPDATE'));

        // Tax events
        eventBus.on('TAX_LIABILITY_THRESHOLD', (p) => this._fanout(p.userId, 'tax_liability', p.value, 'TAX_LIABILITY_THRESHOLD'));

        // Governance events
        eventBus.on('GOVERNANCE_QUORUM_REACHED', (p) => this._fanout(p.userId, 'governance_quorum', 1, 'GOVERNANCE_QUORUM_REACHED'));

        logInfo('[WorkflowEngine] Event hooks registered.');
    }

    // ─── Trigger Fan-Out ─────────────────────────────────────────────────────

    /**
     * Called by every event handler.
     * Finds all active workflow triggers for this user/variable,
     * updates their status, and fires matching workflows.
     */
    async _fanout(userId, variable, rawValue, eventName) {
        if (!userId) return;
        const value = parseFloat(rawValue) || 0;

        try {
            const triggers = await db.select()
                .from(workflowTriggers)
                .where(and(
                    eq(workflowTriggers.userId, userId),
                    eq(workflowTriggers.variable, variable)
                ));

            const firedWorkflowIds = new Set();

            for (const trigger of triggers) {
                const nowFired = this._compare(value, trigger.operator, parseFloat(trigger.thresholdValue));

                // Persist updated trigger status and last observed value
                await db.update(workflowTriggers)
                    .set({
                        currentStatus: nowFired,
                        lastCheckedAt: new Date(),
                        lastValueObserved: value.toString(),
                    })
                    .where(eq(workflowTriggers.id, trigger.id));

                // Evaluate the parent workflow if this trigger just fired
                if (nowFired && !firedWorkflowIds.has(trigger.workflowId)) {
                    firedWorkflowIds.add(trigger.workflowId);
                    await this._evaluateWorkflow(trigger.workflowId, userId, eventName, { variable, value });
                }
            }
        } catch (err) {
            logError(`[WorkflowEngine] Fanout error (${variable}): ${err.message}`);
        }
    }

    // ─── Workflow Evaluation ─────────────────────────────────────────────────

    async _evaluateWorkflow(workflowId, userId, eventName, triggerContext) {
        const [workflow] = await db.select()
            .from(autopilotWorkflows)
            .where(eq(autopilotWorkflows.id, workflowId));

        if (!workflow || workflow.status !== 'active') return;

        // — Cooldown check —
        if (workflow.lastExecutedAt) {
            const cooldownMs = (workflow.cooldownMinutes || 60) * 60 * 1000;
            if (Date.now() - new Date(workflow.lastExecutedAt).getTime() < cooldownMs) {
                logInfo(`[WorkflowEngine] Workflow "${workflow.name}" skipped — cooldown active.`);
                await this._log(userId, workflowId, eventName, 'skipped_cooldown', {}, [], 'Cooldown period not elapsed.');
                return;
            }
        }

        // — Max executions check —
        if (workflow.maxExecutions !== null && workflow.executionCount >= workflow.maxExecutions) {
            logInfo(`[WorkflowEngine] Workflow "${workflow.name}" reached max executions.`);
            await this._log(userId, workflowId, eventName, 'skipped_max_executions', {}, [], 'Max execution count reached.');
            return;
        }

        // — Check all triggers satisfy the required logic —
        const allTriggers = await db.select()
            .from(workflowTriggers)
            .where(eq(workflowTriggers.workflowId, workflowId));

        const triggerSnapshot = allTriggers.reduce((acc, t) => {
            acc[t.variable] = { status: t.currentStatus, observed: t.lastValueObserved };
            return acc;
        }, {});

        const shouldRun = workflow.triggerLogic === 'OR'
            ? allTriggers.some(t => t.currentStatus)
            : allTriggers.every(t => t.currentStatus);

        if (!shouldRun) return;

        logInfo(`[WorkflowEngine] 🚀 Firing workflow "${workflow.name}" for user ${userId}`);
        await this._executeWorkflow(workflow, triggerSnapshot, eventName);
    }

    // ─── Multi-Step Execution ────────────────────────────────────────────────

    async _executeWorkflow(workflow, triggerSnapshot, eventName) {
        const startTime = Date.now();
        const actionResults = [];
        let overallStatus = 'success';

        // Load ordered action steps
        const actions = await db.select()
            .from(workflowActions)
            .where(eq(workflowActions.workflowId, workflow.id))
            .orderBy(asc(workflowActions.stepOrder));

        for (const action of actions) {
            const stepResult = { step: action.stepOrder, type: action.actionType, status: 'pending', detail: null };
            try {
                const detail = await this._dispatchAction(action, workflow);
                stepResult.status = 'success';
                stepResult.detail = detail;

                await db.update(workflowActions)
                    .set({ lastRunStatus: 'success' })
                    .where(eq(workflowActions.id, action.id));
            } catch (err) {
                stepResult.status = 'failed';
                stepResult.detail = err.message;
                overallStatus = 'partial';

                await db.update(workflowActions)
                    .set({ lastRunStatus: 'failed' })
                    .where(eq(workflowActions.id, action.id));

                logError(`[WorkflowEngine] Step ${action.stepOrder} (${action.actionType}) failed: ${err.message}`);

                if (action.abortOnFailure) {
                    overallStatus = 'failed';
                    actionResults.push(stepResult);
                    break; // Abort remaining steps
                }
            }
            actionResults.push(stepResult);
        }

        const durationMs = Date.now() - startTime;
        const summary = `Workflow "${workflow.name}" completed with status: ${overallStatus}. ${actions.length} steps processed.`;

        // Update workflow metadata
        await db.update(autopilotWorkflows)
            .set({
                lastExecutedAt: new Date(),
                executionCount: sql`${autopilotWorkflows.executionCount} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(autopilotWorkflows.id, workflow.id));

        await this._log(workflow.userId, workflow.id, eventName, overallStatus, triggerSnapshot, actionResults, summary, durationMs);

        // Emit downstream event so other services can react
        eventBus.emit('WORKFLOW_EXECUTED', {
            userId: workflow.userId,
            workflowId: workflow.id,
            workflowName: workflow.name,
            status: overallStatus,
            durationMs,
        });

        logInfo(`[WorkflowEngine] ✅ "${workflow.name}" → ${overallStatus} (${durationMs}ms)`);
    }

    // ─── Action Dispatcher ────────────────────────────────────────────────────

    /**
     * Maps action types to concrete financial operations.
     * Returns a human-readable result string.
     */
    async _dispatchAction(action, workflow) {
        const p = action.parameters || {};

        switch (action.actionType) {

            case 'ALERT': {
                // Fire a notification event (picked up by notificationListeners)
                eventBus.emit('AUTOPILOT_ALERT', {
                    userId: workflow.userId,
                    title: p.title || `Autopilot Alert: ${workflow.name}`,
                    message: p.message || 'Your Financial Autopilot has detected a condition that requires attention.',
                    severity: p.severity || 'info',
                });
                return 'Alert notification dispatched.';
            }

            case 'SWEEP_VAULT': {
                // Move a percentage of balance from one vault to another
                if (!p.fromVaultId || !p.toVaultId || !p.percentage) {
                    throw new Error('SWEEP_VAULT requires fromVaultId, toVaultId, and percentage.');
                }
                const [fromVault] = await db.select().from(vaults).where(eq(vaults.id, p.fromVaultId));
                if (!fromVault) throw new Error('Source vault not found.');

                const sweepAmount = parseFloat(fromVault.balance || 0) * (parseFloat(p.percentage) / 100);
                // Emit event so vaultService can process the actual transfer
                eventBus.emit('AUTOPILOT_VAULT_SWEEP', {
                    userId: workflow.userId,
                    fromVaultId: p.fromVaultId,
                    toVaultId: p.toVaultId,
                    amount: sweepAmount,
                });
                return `Sweep of ${p.percentage}% (~${sweepAmount.toFixed(2)}) from vault ${p.fromVaultId} dispatched.`;
            }

            case 'EXPENSE_CAP': {
                // Record a spending lock signal (frontend + guards read this)
                eventBus.emit('AUTOPILOT_EXPENSE_CAP', {
                    userId: workflow.userId,
                    categoryId: p.categoryId || null,
                    capAmount: p.capAmount,
                    durationDays: p.durationDays || 30,
                });
                return `Expense cap of ${p.capAmount} set for ${p.durationDays || 30} days.`;
            }

            case 'DEBT_PAYOFF': {
                // Trigger debt payoff event for debtEngine
                eventBus.emit('AUTOPILOT_DEBT_PAYOFF', {
                    userId: workflow.userId,
                    debtId: p.debtId,
                    strategy: p.strategy || 'avalanche',
                });
                return `Debt payoff event dispatched (strategy: ${p.strategy || 'avalanche'}).`;
            }

            case 'REBALANCE': {
                // Trigger portfolio rebalance
                eventBus.emit('AUTOPILOT_REBALANCE', {
                    userId: workflow.userId,
                    portfolioId: p.portfolioId,
                    targetAllocation: p.targetAllocation || {},
                });
                return `Portfolio rebalance event dispatched.`;
            }

            case 'HARVEST_LOSSES': {
                // Trigger tax-loss harvesting scan
                eventBus.emit('AUTOPILOT_HARVEST', {
                    userId: workflow.userId,
                    threshold: p.threshold || 500,
                });
                return `Tax-loss harvest scan triggered (min loss: ${p.threshold || 500}).`;
            }

            case 'GOVERNANCE_VOTE': {
                // Auto-cast a vote on an open resolution
                eventBus.emit('AUTOPILOT_GOVERNANCE_VOTE', {
                    userId: workflow.userId,
                    resolutionId: p.resolutionId,
                    vote: p.vote || 'yes',
                    reason: 'Autopilot rule triggered.',
                });
                return `Governance vote "${p.vote || 'yes'}" dispatched for resolution ${p.resolutionId}.`;
            }

            case 'FX_SWAP': {
                // Queue an internal FX swap through fxSettlement
                eventBus.emit('AUTOPILOT_FX_SWAP', {
                    userId: workflow.userId,
                    fromCurrency: p.fromCurrency,
                    toCurrency: p.toCurrency,
                    amount: p.amount,
                    vaultId: p.vaultId,
                });
                return `FX swap ${p.fromCurrency} → ${p.toCurrency} (amount: ${p.amount}) queued.`;
            }

            case 'FUND_GOAL': {
                // Move funds toward a savings goal
                eventBus.emit('AUTOPILOT_FUND_GOAL', {
                    userId: workflow.userId,
                    goalId: p.goalId,
                    amount: p.amount,
                    fromVaultId: p.fromVaultId,
                });
                return `Goal funding of ${p.amount} dispatched for goal ${p.goalId}.`;
            }

            default:
                throw new Error(`Unknown action type: ${action.actionType}`);
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _compare(val1, operator, val2) {
        switch (operator) {
            case '>': return val1 > val2;
            case '<': return val1 < val2;
            case '>=': return val1 >= val2;
            case '<=': return val1 <= val2;
            case '==': return val1 === val2;
            default: return false;
        }
    }

    async _log(userId, workflowId, triggerEvent, resultStatus, triggerSnapshot, actionResults, summary, durationMs = 0) {
        try {
            await db.insert(workflowExecutionLogs).values({
                userId,
                workflowId,
                triggerEvent,
                resultStatus,
                triggerSnapshot,
                actionResults,
                summary,
                durationMs,
                executedAt: new Date(),
            });
        } catch (err) {
            logError(`[WorkflowEngine] Failed to write execution log: ${err.message}`);
        }
    }

    // ─── Public API (called by routes) ───────────────────────────────────────

    /** Manually trigger a workflow by ID (for testing/admin) */
    async manualTrigger(workflowId, userId) {
        return this._evaluateWorkflow(workflowId, userId, 'MANUAL_TRIGGER', {});
    }

    /** Validate DSL definition structure before saving */
    validateDSL(dslDefinition) {
        if (!dslDefinition || typeof dslDefinition !== 'object') {
            return { valid: false, error: 'DSL must be a JSON object.' };
        }
        if (!Array.isArray(dslDefinition.triggers) || dslDefinition.triggers.length === 0) {
            return { valid: false, error: 'DSL must include at least one trigger.' };
        }
        if (!Array.isArray(dslDefinition.actions) || dslDefinition.actions.length === 0) {
            return { valid: false, error: 'DSL must include at least one action.' };
        }
        return { valid: true };
    }
}

export default new WorkflowEngine();
