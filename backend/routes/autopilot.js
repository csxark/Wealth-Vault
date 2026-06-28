import express from 'express';
import asyncHandler from 'express-async-handler';
import { body, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { AppError } from '../utils/AppError.js';
import db from '../config/db.js';
import {
    autopilotWorkflows,
    workflowTriggers,
    workflowActions,
    workflowExecutionLogs,
} from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import workflowEngine from '../services/workflowEngine.js';

const router = express.Router();

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

/**
 * @desc   Create a new autopilot workflow with triggers and ordered actions
 * @route  POST /api/autopilot/workflows
 * @access Private
 */
router.post('/workflows',
    protect,
    [
        body('name').trim().isLength({ min: 1, max: 120 }),
        body('domain').isIn(['VAULT', 'EXPENSE', 'INVESTMENT', 'DEBT', 'GOVERNANCE', 'MACRO']),
        body('triggerLogic').optional().isIn(['AND', 'OR']),
        body('cooldownMinutes').optional().isInt({ min: 0 }),
        body('maxExecutions').optional().isInt({ min: 1 }),
        body('triggers').isArray({ min: 1 }),
        body('actions').isArray({ min: 1 }),
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return next(new AppError(400, 'Validation failed', errors.array()));

        const { name, description, domain, triggerLogic, cooldownMinutes, maxExecutions, triggers, actions, dslDefinition } = req.body;

        // Optionally validate DSL if provided
        if (dslDefinition) {
            const dslCheck = workflowEngine.validateDSL(dslDefinition);
            if (!dslCheck.valid) return next(new AppError(400, `DSL invalid: ${dslCheck.error}`));
        }

        return await db.transaction(async (tx) => {
            const [workflow] = await tx.insert(autopilotWorkflows).values({
                userId: req.user.id,
                name,
                description,
                domain,
                triggerLogic: triggerLogic || 'AND',
                cooldownMinutes: cooldownMinutes ?? 60,
                maxExecutions: maxExecutions ?? null,
                dslDefinition: dslDefinition || {},
                status: 'draft',
            }).returning();

            // Insert trigger conditions
            if (triggers?.length) {
                await tx.insert(workflowTriggers).values(
                    triggers.map(t => ({
                        workflowId: workflow.id,
                        userId: req.user.id,
                        variable: t.variable,
                        operator: t.operator,
                        thresholdValue: t.thresholdValue.toString(),
                        scopeVaultId: t.scopeVaultId || null,
                    }))
                );
            }

            // Insert ordered action steps
            if (actions?.length) {
                await tx.insert(workflowActions).values(
                    actions.map((a, i) => ({
                        workflowId: workflow.id,
                        stepOrder: a.stepOrder ?? (i + 1),
                        actionType: a.actionType,
                        parameters: a.parameters || {},
                        abortOnFailure: a.abortOnFailure ?? true,
                    }))
                );
            }

            return new ApiResponse(201, workflow, 'Autopilot workflow created in draft state.').send(res);
        });
    })
);

/**
 * @desc   List all autopilot workflows for the authenticated user
 * @route  GET /api/autopilot/workflows
 * @access Private
 */
router.get('/workflows',
    protect,
    asyncHandler(async (req, res) => {
        const workflows = await db.select()
            .from(autopilotWorkflows)
            .where(eq(autopilotWorkflows.userId, req.user.id))
            .orderBy(desc(autopilotWorkflows.createdAt));

        return new ApiResponse(200, workflows, 'Autopilot workflows retrieved.').send(res);
    })
);

/**
 * @desc   Get a single workflow with full trigger/action detail
 * @route  GET /api/autopilot/workflows/:id
 * @access Private
 */
router.get('/workflows/:id',
    protect,
    asyncHandler(async (req, res, next) => {
        const [workflow] = await db.select()
            .from(autopilotWorkflows)
            .where(and(
                eq(autopilotWorkflows.id, req.params.id),
                eq(autopilotWorkflows.userId, req.user.id)
            ));

        if (!workflow) return next(new AppError(404, 'Workflow not found.'));

        const [triggers, actions, logs] = await Promise.all([
            db.select().from(workflowTriggers).where(eq(workflowTriggers.workflowId, workflow.id)),
            db.select().from(workflowActions).where(eq(workflowActions.workflowId, workflow.id)).orderBy(asc(workflowActions.stepOrder)),
            db.select().from(workflowExecutionLogs).where(eq(workflowExecutionLogs.workflowId, workflow.id)).orderBy(desc(workflowExecutionLogs.executedAt)).limit(20),
        ]);

        return new ApiResponse(200, { workflow, triggers, actions, logs }).send(res);
    })
);

/**
 * @desc   Activate, pause, or archive a workflow
 * @route  PATCH /api/autopilot/workflows/:id/status
 * @access Private
 */
router.patch('/workflows/:id/status',
    protect,
    [body('status').isIn(['active', 'paused', 'archived', 'draft'])],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return next(new AppError(400, 'Invalid status value.'));

        const [updated] = await db.update(autopilotWorkflows)
            .set({ status: req.body.status, updatedAt: new Date() })
            .where(and(
                eq(autopilotWorkflows.id, req.params.id),
                eq(autopilotWorkflows.userId, req.user.id)
            ))
            .returning();

        if (!updated) return next(new AppError(404, 'Workflow not found.'));

        return new ApiResponse(200, updated, `Workflow status set to "${req.body.status}".`).send(res);
    })
);

/**
 * @desc   Delete a workflow and all its triggers/actions
 * @route  DELETE /api/autopilot/workflows/:id
 * @access Private
 */
router.delete('/workflows/:id',
    protect,
    asyncHandler(async (req, res, next) => {
        const [deleted] = await db.delete(autopilotWorkflows)
            .where(and(
                eq(autopilotWorkflows.id, req.params.id),
                eq(autopilotWorkflows.userId, req.user.id)
            ))
            .returning();

        if (!deleted) return next(new AppError(404, 'Workflow not found.'));

        return new ApiResponse(200, null, 'Workflow deleted.').send(res);
    })
);

// ─── Manual Trigger & Execution Logs ─────────────────────────────────────────

/**
 * @desc   Manually fire a workflow (bypasses cooldown for testing)
 * @route  POST /api/autopilot/workflows/:id/trigger
 * @access Private
 */
router.post('/workflows/:id/trigger',
    protect,
    asyncHandler(async (req, res, next) => {
        const [workflow] = await db.select()
            .from(autopilotWorkflows)
            .where(and(
                eq(autopilotWorkflows.id, req.params.id),
                eq(autopilotWorkflows.userId, req.user.id)
            ));

        if (!workflow) return next(new AppError(404, 'Workflow not found.'));

        // Run async — respond immediately
        workflowEngine.manualTrigger(workflow.id, req.user.id)
            .catch(e => console.error('[Manual Trigger]', e.message));

        return new ApiResponse(202, null, 'Manual execution dispatched. Check logs for results.').send(res);
    })
);

/**
 * @desc   Get execution history for a workflow
 * @route  GET /api/autopilot/workflows/:id/logs
 * @access Private
 */
router.get('/workflows/:id/logs',
    protect,
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit || '50'), 200);
        const logs = await db.select()
            .from(workflowExecutionLogs)
            .where(eq(workflowExecutionLogs.workflowId, req.params.id))
            .orderBy(desc(workflowExecutionLogs.executedAt))
            .limit(limit);

        return new ApiResponse(200, logs).send(res);
    })
);

/**
 * @desc   Get dead-letter queue (unhandled events) for diagnostics
 * @route  GET /api/autopilot/diagnostics/dlq
 * @access Private
 */
router.get('/diagnostics/dlq',
    protect,
    asyncHandler(async (req, res) => {
        const eventBus = (await import('../events/eventBus.js')).default;
        return new ApiResponse(200, eventBus.getDLQ(), 'Dead-letter queue retrieved.').send(res);
    })
);

export default router;
