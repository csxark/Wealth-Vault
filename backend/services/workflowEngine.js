import db from '../config/db.js';
import { executionWorkflows, workflowTriggers, workflowExecutionLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import eventBus from '../events/eventBus.js';
import { logInfo, logError } from '../utils/logger.js';
import debtEngine from './debtEngine.js';
import taxService from './taxService.js';
import liquidityMonitor from './liquidityMonitor.js';
import investmentService from './investmentService.js';

/**
 * Workflow Orchestrator (L3)
 * Evaluates complex triggers and executes autonomous financial actions.
 */
class WorkflowEngine {
    constructor() {
        this.initializeListeners();
    }

    /**
     * Map events to relevant trigger variables
     */
    initializeListeners() {
        // Debt Events
        eventBus.on('DEBT_APR_CHANGE', (payload) => this.evalTriggers(payload.userId, 'debt_apr', payload.value));

        // Liquidity Events
        eventBus.on('LIQUIDITY_RUNWAY_CHANGE', (payload) => this.evalTriggers(payload.userId, 'cash_reserve', payload.value));

        // Market Events
        eventBus.on('MARKET_VOLATILITY_CHANGE', (payload) => this.evalTriggers(payload.userId, 'market_volatility', payload.value));

        // Tax Events
        eventBus.on('TAX_LIABILITY_THRESHOLD', (payload) => this.evalTriggers(payload.userId, 'tax_liability', payload.value));
    }

    /**
     * Evaluate triggers for a specific variable change
     */
    async evalTriggers(userId, variable, value) {
        try {
            const activeTriggers = await db.select().from(workflowTriggers)
                .where(and(
                    eq(workflowTriggers.userId, userId),
                    eq(workflowTriggers.variable, variable)
                ));

            for (const trigger of activeTriggers) {
                const isTriggered = this.compare(value, trigger.operator, trigger.thresholdValue);

                if (isTriggered !== trigger.currentStatus) {
                    await db.update(workflowTriggers)
                        .set({ currentStatus: isTriggered, lastCheckedAt: new Date() })
                        .where(eq(workflowTriggers.id, trigger.id));

                    if (isTriggered) {
                        await this.evaluateWorkflow(trigger.workflowId, userId);
                    }
                }
            }
        } catch (error) {
            logError(`[WorkflowEngine] Evaluation failed: ${error.message}`);
        }
    }

    /**
     * Check if all conditions (or any, based on logic) are met for a workflow
     */
    async evaluateWorkflow(workflowId, userId) {
        const [workflow] = await db.select().from(executionWorkflows).where(eq(executionWorkflows.id, workflowId));
        if (!workflow || workflow.status !== 'active') return;

        const triggers = await db.select().from(workflowTriggers).where(eq(workflowTriggers.workflowId, workflowId));

        const allTriggered = triggers.every(t => t.currentStatus);
        const anyTriggered = triggers.some(t => t.currentStatus);

        const shouldExecute = workflow.triggerLogic === 'AND' ? allTriggered : anyTriggered;

        if (shouldExecute) {
            await this.executeWorkflowAction(workflow);
        }
    }

    /**
     * Execute the actual autonomous action defined in the workflow
     */
    async executeWorkflowAction(workflow) {
        logInfo(`[WorkflowEngine] EXECUTING workflow: ${workflow.name} for user ${workflow.userId}`);

        try {
            let resultStatus = 'success';
            let actionDescription = `Autonomous ${workflow.entityType} action executed manually or via trigger.`;

            // Entity-specific dispatch logic (L3)
            switch (workflow.entityType) {
                case 'DEBT':
                    // e.g. Trigger a refinance check or auto-payoff suggestion
                    await debtEngine.getMarketRefinanceRate('mortgage');
                    actionDescription = 'Refinance market rate check initiated.';
                    break;
                case 'TAX':
                    // e.g. Trigger tax-loss harvesting scan
                    await taxService.monitorLiabilityThresholds(workflow.userId);
                    actionDescription = 'Tax liability threshold scan completed.';
                    break;
                case 'LIQUIDITY':
                    // e.g. Trigger emergency fund rescue
                    await liquidityMonitor.checkLiquidity(workflow.userId);
                    actionDescription = 'Liquidity stress-test and rescue check executed.';
                    break;
                case 'INVEST':
                    // e.g. Trigger portfolio rebalancing
                    await investmentService.rebalanceGoalRisk(workflow.userId, 'high_growth'); // Example goal
                    actionDescription = 'Investment portfolio risk-rebalancing triggered.';
                    break;
                default:
                    actionDescription = 'Generic autonomous heartbeat recorded.';
            }

            await db.insert(workflowExecutionLogs).values({
                userId: workflow.userId,
                workflowId: workflow.id,
                actionTaken: workflow.name,
                resultStatus: 'success',
                metadata: { executionDate: new Date(), description: actionDescription }
            });

            logInfo(`[WorkflowEngine] Workflow ${workflow.name} executed successfully: ${actionDescription}`);
        } catch (error) {
            logError(`[WorkflowEngine] Execution failed: ${error.message}`);
            await db.insert(workflowExecutionLogs).values({
                userId: workflow.userId,
                workflowId: workflow.id,
                actionTaken: workflow.name,
                resultStatus: 'failed',
                metadata: { error: error.message }
            });
        }
    }

    compare(val1, operator, val2) {
        const v1 = parseFloat(val1);
        const v2 = parseFloat(val2);
        switch (operator) {
            case '>': return v1 > v2;
            case '<': return v1 < v2;
            case '==': return v1 === v2;
            case '>=': return v1 >= v2;
            case '<=': return v1 <= v2;
            default: return false;
        }
    }
}

export default new WorkflowEngine();
