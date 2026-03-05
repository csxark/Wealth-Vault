/**
 * Dead Letter Service (Issue #568)
 * 
 * Manages failed recurring payments that exceeded retry limits:
 * - Moves failed executions to dead-letter queue
 * - Classifies failures by category and severity
 * - Sends alerts for critical failures
 * - Provides replay functionality
 * - Tracks resolution status
 */

import { and, eq, inArray, sql, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { 
    recurringPaymentExecutions, 
    recurringPaymentDeadLetters 
} from '../db/schema-recurring-payments.js';
import { goals, users } from '../db/schema.js';
import logger from '../utils/logger.js';
import { createAuditLog } from './auditLogService.js';

class DeadLetterService {
    /**
     * Move execution to dead-letter queue
     */
    async moveExecutionToDLQ({ executionId, failureCategory, failureSeverity = 'medium' }) {
        try {
            // Get execution details
            const [execution] = await db
                .select()
                .from(recurringPaymentExecutions)
                .where(eq(recurringPaymentExecutions.id, executionId));

            if (!execution) {
                throw new Error(`Execution ${executionId} not found`);
            }

            // Check if already in DLQ
            const [existingDLQ] = await db
                .select()
                .from(recurringPaymentDeadLetters)
                .where(eq(recurringPaymentDeadLetters.executionId, executionId));

            if (existingDLQ) {
                logger.warn(`[DLQ] Execution ${executionId} already in dead-letter queue`);
                return existingDLQ;
            }

            // Get goal details for context
            const [goal] = await db
                .select()
                .from(goals)
                .where(eq(goals.id, execution.goalId));

            // Create dead-letter entry
            const [deadLetter] = await db
                .insert(recurringPaymentDeadLetters)
                .values({
                    tenantId: execution.tenantId,
                    executionId: execution.id,
                    goalId: execution.goalId,
                    failureCategory,
                    failureSeverity,
                    totalRetryAttempts: execution.retryCount,
                    firstFailureAt: execution.failedAt || new Date(),
                    lastFailureAt: new Date(),
                    errorSummary: execution.lastError?.substring(0, 500) || 'Unknown error',
                    fullErrorLog: execution.errorStacktrace || execution.lastError,
                    originalPayload: {
                        goalId: execution.goalId,
                        billingWindowStart: execution.billingWindowStart,
                        billingWindowEnd: execution.billingWindowEnd,
                        amountCents: execution.contributionAmountCents,
                        currency: execution.contributionCurrency,
                        sourceEventId: execution.sourceEventId,
                        sourceEventType: execution.sourceEventType
                    },
                    executionContext: {
                        goalTitle: goal?.title,
                        goalStatus: goal?.status,
                        tenantId: execution.tenantId,
                        userId: execution.userId,
                        timestamp: new Date().toISOString()
                    }
                })
                .returning();

            // Update execution status
            await db
                .update(recurringPaymentExecutions)
                .set({
                    status: 'dead_letter',
                    movedToDlqAt: new Date(),
                    dlqReason: failureCategory,
                    dlqMetadata: { deadLetterId: deadLetter.id },
                    updatedAt: new Date()
                })
                .where(eq(recurringPaymentExecutions.id, executionId));

            // Send alert for high/critical severity
            if (['high', 'critical'].includes(failureSeverity)) {
                await this.sendFailureAlert(deadLetter);
            }

            // Create audit log
            await createAuditLog({
                tenantId: execution.tenantId,
                userId: execution.userId,
                action: 'recurring_payment.moved_to_dlq',
                category: 'financial',
                details: {
                    executionId,
                    deadLetterId: deadLetter.id,
                    failureCategory,
                    failureSeverity,
                    retryCount: execution.retryCount
                }
            });

            logger.info(`[DLQ] Moved execution ${executionId} to dead-letter queue (${failureCategory}, ${failureSeverity})`);

            return deadLetter;
        } catch (error) {
            logger.error(`[DLQ] Error moving execution ${executionId} to DLQ:`, error);
            throw error;
        }
    }

    /**
     * Send failure alert for high/critical severity failures
     */
    async sendFailureAlert(deadLetter) {
        try {
            // Get tenant admins
            const adminUsers = await db
                .select({ userId: sql`user_id`, email: sql`u.email` })
                .from(sql`tenant_members tm`)
                .innerJoin(users, sql`u.id = tm.user_id`)
                .where(
                    sql`tm.tenant_id = ${deadLetter.tenantId} AND tm.role IN ('owner', 'admin')`
                );

            const recipients = adminUsers.map(u => u.email);

            // Update alert status
            await db
                .update(recurringPaymentDeadLetters)
                .set({
                    alertSent: true,
                    alertSentAt: new Date(),
                    alertRecipients: recipients
                })
                .where(eq(recurringPaymentDeadLetters.id, deadLetter.id));

            logger.info(`[DLQ] Sent failure alert for dead-letter ${deadLetter.id} to ${recipients.length} recipients`);

            // TODO: Integrate with notification service (email, Slack, etc.)
            // await notificationService.sendAlert({
            //     recipients,
            //     subject: `[${deadLetter.failureSeverity.toUpperCase()}] Recurring Payment Failed`,
            //     body: `Recurring payment for goal ${deadLetter.goalId} has failed permanently and requires manual intervention.`
            // });
        } catch (error) {
            logger.error(`[DLQ] Error sending failure alert:`, error);
        }
    }

    /**
     * Get dead-letter queue summary
     */
    async getDLQSummary({ tenantId = null, status = 'pending_review', limit = 50 }) {
        const conditions = [];

        if (tenantId) {
            conditions.push(eq(recurringPaymentDeadLetters.tenantId, tenantId));
        }

        if (status) {
            conditions.push(eq(recurringPaymentDeadLetters.status, status));
        }

        const deadLetters = await db
            .select({
                id: recurringPaymentDeadLetters.id,
                tenantId: recurringPaymentDeadLetters.tenantId,
                executionId: recurringPaymentDeadLetters.executionId,
                goalId: recurringPaymentDeadLetters.goalId,
                goalTitle: goals.title,
                failureCategory: recurringPaymentDeadLetters.failureCategory,
                failureSeverity: recurringPaymentDeadLetters.failureSeverity,
                status: recurringPaymentDeadLetters.status,
                totalRetryAttempts: recurringPaymentDeadLetters.totalRetryAttempts,
                firstFailureAt: recurringPaymentDeadLetters.firstFailureAt,
                lastFailureAt: recurringPaymentDeadLetters.lastFailureAt,
                errorSummary: recurringPaymentDeadLetters.errorSummary,
                replayCount: recurringPaymentDeadLetters.replayCount,
                replaySuccess: recurringPaymentDeadLetters.replaySuccess,
                createdAt: recurringPaymentDeadLetters.createdAt
            })
            .from(recurringPaymentDeadLetters)
            .leftJoin(goals, eq(goals.id, recurringPaymentDeadLetters.goalId))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(
                desc(recurringPaymentDeadLetters.failureSeverity),
                desc(recurringPaymentDeadLetters.createdAt)
            )
            .limit(limit);

        // Get counts by category
        const categoryCounts = await db
            .select({
                category: recurringPaymentDeadLetters.failureCategory,
                count: sql`COUNT(*)::int`
            })
            .from(recurringPaymentDeadLetters)
            .where(tenantId ? eq(recurringPaymentDeadLetters.tenantId, tenantId) : undefined)
            .groupBy(recurringPaymentDeadLetters.failureCategory);

        // Get counts by severity
        const severityCounts = await db
            .select({
                severity: recurringPaymentDeadLetters.failureSeverity,
                count: sql`COUNT(*)::int`
            })
            .from(recurringPaymentDeadLetters)
            .where(tenantId ? eq(recurringPaymentDeadLetters.tenantId, tenantId) : undefined)
            .groupBy(recurringPaymentDeadLetters.failureSeverity);

        return {
            deadLetters,
            stats: {
                totalCount: deadLetters.length,
                byCategory: categoryCounts.reduce((acc, row) => {
                    acc[row.category] = row.count;
                    return acc;
                }, {}),
                bySeverity: severityCounts.reduce((acc, row) => {
                    acc[row.severity] = row.count;
                    return acc;
                }, {})
            }
        };
    }

    /**
     * Assign dead-letter to user for investigation
     */
    async assignDLQ({ deadLetterId, userId, notes = null }) {
        await db
            .update(recurringPaymentDeadLetters)
            .set({
                status: 'investigating',
                assignedToUserId: userId,
                resolutionNotes: notes,
                updatedAt: new Date()
            })
            .where(eq(recurringPaymentDeadLetters.id, deadLetterId));

        logger.info(`[DLQ] Assigned dead-letter ${deadLetterId} to user ${userId}`);
    }

    /**
     * Resolve dead-letter (mark as resolved/ignored)
     */
    async resolveDLQ({ deadLetterId, status, notes = null }) {
        if (!['resolved', 'ignored'].includes(status)) {
            throw new Error(`Invalid resolution status: ${status}`);
        }

        await db
            .update(recurringPaymentDeadLetters)
            .set({
                status,
                resolutionNotes: notes,
                resolvedAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(recurringPaymentDeadLetters.id, deadLetterId));

        logger.info(`[DLQ] Resolved dead-letter ${deadLetterId} with status: ${status}`);
    }

    /**
     * Get dead-letter details
     */
    async getDLQDetails(deadLetterId) {
        const [deadLetter] = await db
            .select({
                ...recurringPaymentDeadLetters,
                goalTitle: goals.title,
                goalStatus: goals.status,
                userName: users.name,
                userEmail: users.email
            })
            .from(recurringPaymentDeadLetters)
            .leftJoin(goals, eq(goals.id, recurringPaymentDeadLetters.goalId))
            .leftJoin(users, eq(users.id, sql`(${recurringPaymentDeadLetters.executionContext}->>'userId')::uuid`))
            .where(eq(recurringPaymentDeadLetters.id, deadLetterId));

        if (!deadLetter) {
            return null;
        }

        // Get original execution details
        const [execution] = await db
            .select()
            .from(recurringPaymentExecutions)
            .where(eq(recurringPaymentExecutions.id, deadLetter.executionId));

        return {
            ...deadLetter,
            execution
        };
    }

    /**
     * Cleanup resolved/ignored dead-letters older than retention period
     */
    async cleanupResolvedDLQ(retentionDays = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await db
            .delete(recurringPaymentDeadLetters)
            .where(
                and(
                    inArray(recurringPaymentDeadLetters.status, ['resolved', 'ignored']),
                    sql`${recurringPaymentDeadLetters.resolvedAt} < ${cutoffDate}`
                )
            );

        logger.info(`[DLQ] Cleaned up resolved dead-letters older than ${retentionDays} days`);
        
        return result;
    }

    /**
     * Get DLQ metrics
     */
    async getDLQMetrics({ tenantId = null, days = 30 }) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const conditions = [
            sql`${recurringPaymentDeadLetters.createdAt} >= ${startDate}`
        ];

        if (tenantId) {
            conditions.push(eq(recurringPaymentDeadLetters.tenantId, tenantId));
        }

        const metrics = await db
            .select({
                totalCount: sql`COUNT(*)::int`,
                pendingCount: sql`COUNT(*) FILTER (WHERE status = 'pending_review')::int`,
                investigatingCount: sql`COUNT(*) FILTER (WHERE status = 'investigating')::int`,
                resolvedCount: sql`COUNT(*) FILTER (WHERE status = 'resolved')::int`,
                ignoredCount: sql`COUNT(*) FILTER (WHERE status = 'ignored')::int`,
                criticalCount: sql`COUNT(*) FILTER (WHERE failure_severity = 'critical')::int`,
                highCount: sql`COUNT(*) FILTER (WHERE failure_severity = 'high')::int`,
                avgRetryAttempts: sql`AVG(total_retry_attempts)::float`,
                avgResolutionTimeMinutes: sql`AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60) FILTER (WHERE resolved_at IS NOT NULL)::float`
            })
            .from(recurringPaymentDeadLetters)
            .where(and(...conditions));

        return metrics[0];
    }
}

export { DeadLetterService };
