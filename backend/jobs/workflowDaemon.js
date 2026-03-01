import cron from 'node-cron';
import db from '../config/db.js';
import { autopilotWorkflows, workflowTriggers } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import workflowEngine from '../services/workflowEngine.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Workflow Daemon (#461)
 * ──────────────────────
 * Periodic heartbeat that re-evaluates all active workflows whose triggers
 * rely on values that don't emit events (e.g., running monthly averages,
 * cumulative tax liability, portfolio drift).
 *
 * Runs every 15 minutes.
 */
const scheduleWorkflowDaemon = () => {
    cron.schedule('*/15 * * * *', async () => {
        logInfo('[WorkflowDaemon] ⏱ Heartbeat: scanning active workflows...');

        try {
            // Fetch all distinct users with active workflows
            const activeWorkflows = await db.select({
                id: autopilotWorkflows.id,
                userId: autopilotWorkflows.userId,
                name: autopilotWorkflows.name,
                triggerLogic: autopilotWorkflows.triggerLogic,
            })
                .from(autopilotWorkflows)
                .where(eq(autopilotWorkflows.status, 'active'));

            if (activeWorkflows.length === 0) {
                logInfo('[WorkflowDaemon] No active workflows found.');
                return;
            }

            logInfo(`[WorkflowDaemon] Evaluating ${activeWorkflows.length} active workflows...`);

            for (const workflow of activeWorkflows) {
                try {
                    // Re-hydrate all triggers for this workflow to check freshness
                    const triggers = await db.select()
                        .from(workflowTriggers)
                        .where(eq(workflowTriggers.workflowId, workflow.id));

                    // If any trigger hasn't been checked in >20 minutes, force-evaluate
                    const stale = triggers.filter(t => {
                        if (!t.lastCheckedAt) return true;
                        const ageMs = Date.now() - new Date(t.lastCheckedAt).getTime();
                        return ageMs > 20 * 60 * 1000;
                    });

                    if (stale.length > 0) {
                        logInfo(`[WorkflowDaemon] Workflow "${workflow.name}" has ${stale.length} stale trigger(s), re-evaluating.`);

                        // Touch the lastCheckedAt so we don't spin on the same trigger repeatedly
                        await db.update(workflowTriggers)
                            .set({ lastCheckedAt: new Date() })
                            .where(eq(workflowTriggers.workflowId, workflow.id));

                        // Ask the engine to evaluate — it checks the condition logic internally
                        await workflowEngine.manualTrigger(workflow.id, workflow.userId);
                    }
                } catch (err) {
                    logError(`[WorkflowDaemon] Error evaluating workflow "${workflow.name}": ${err.message}`);
                }
            }

            logInfo('[WorkflowDaemon] Heartbeat complete.');
        } catch (err) {
            logError(`[WorkflowDaemon] Fatal scan error: ${err.message}`);
        }
    });

    logInfo('[WorkflowDaemon] Scheduled — running every 15 minutes.');
};

export default scheduleWorkflowDaemon;
