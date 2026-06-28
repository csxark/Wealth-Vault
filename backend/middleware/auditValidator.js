import { db } from '../db/index.js';
import { stressScenarios, auditLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logError } from '../utils/logger.js';

/**
 * Validates that the audit/stress action is being performed by the owner
 * and that the system isn't being overloaded with requests.
 */
export const validateAuditAction = async (req, res, next) => {
    const userId = req.user.id;
    const scenarioId = req.params.id;

    try {
        // 1. Ownership check
        if (scenarioId) {
            const scenario = await db.select()
                .from(stressScenarios)
                .where(and(
                    eq(stressScenarios.id, scenarioId),
                    eq(stressScenarios.userId, userId)
                ))
                .limit(1);

            if (scenario.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Unauthorized: Scenario does not exist or belong to you."
                });
            }
        }

        // 2. Anti-spam / Throttling check for expensive forensic actions
        const oneMinuteAgo = new Date(Date.now() - 60000);
        const recentActions = await db.select()
            .from(auditLogs)
            .where(and(
                eq(auditLogs.userId, userId),
                eq(auditLogs.actionType, 'stress_test_run'),
                sql`created_at >= ${oneMinuteAgo}`
            ));

        // Use standard SQL for date comparison if drizzle helper isn't enough
        // Note: 'sql' tag is imported from drizzle-orm

        if (recentActions.length > 3) {
            return res.status(429).json({
                success: false,
                message: "Too many audit requests. Please wait a minute before running another simulation."
            });
        }

        next();
    } catch (error) {
        logError('Audit validation error:', error);
        res.status(500).json({ success: false, message: "Validation pipeline failure." });
    }
};

/**
 * Ensures forensic parameters meet safety bounds (no negative interest rates etc)
 */
export const validateStressParams = (req, res, next) => {
    const { parameters } = req.body;

    if (parameters) {
        if (parameters.incomeDrop < 0 || parameters.incomeDrop > 1) {
            return res.status(400).json({ message: "Income drop must be between 0 and 1" });
        }
        if (parameters.marketDrop < 0 || parameters.marketDrop > 1) {
            return res.status(400).json({ message: "Market drop must be between 0 and 1" });
        }
    }

    next();
};

import { sql } from 'drizzle-orm';
