/**
 * Recurring Payment Service (Issue #568)
 * 
 * High-level service for recurring payment operations:
 * - Manual payment triggering via API
 * - Execution history tracking
 * - Dead-letter queue management and replay
 * - Payment validation and authorization
 */

import { createHash } from 'crypto';
import { and, eq, desc, gte, lte, sql } from 'drizzle-orm';
import db from '../config/db.js';
import {
    recurringPaymentExecutions,
    recurringPaymentDeadLetters,
    recurringPaymentFingerprints
} from '../db/schema-recurring-payments.js';
import { goals } from '../db/schema.js';
import logger from '../utils/logger.js';
import { createAuditLog } from './auditLogService.js';
import { RecurringPaymentWorker } from '../services/recurringPaymentWorker.js';
import { DeadLetterService } from './deadLetterService.js';

class RecurringPaymentService {
    constructor() {
        this.worker = new RecurringPaymentWorker();
        this.dlqService = new DeadLetterService();
    }

    /**
     * Manually trigger recurring payment for a goal
     * 
     * API-layer trigger with idempotency enforcement
     */
    async triggerRecurringPayment({ goalId, tenantId, userId, sourceEventType = 'api_trigger' }) {
        try {
            // Validate goal ownership
            const [goal] = await db
                .select()
                .from(goals)
                .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));

            if (!goal) {
                throw new Error('Goal not found or not authorized');
            }

            // Check if goal has recurring contribution enabled
            if (!goal.recurringContribution || !goal.recurringContribution.amount) {
                throw new Error('Goal does not have recurring contribution enabled');
            }

            // Check if goal is active
            if (goal.status !== 'active') {
                throw new Error(`Cannot trigger recurring payment for ${goal.status} goal`);
            }

            // Calculate billing window
            const now = new Date();
            let windowStart, windowEnd;

            const frequency = goal.recurringContribution.frequency || 'monthly';
            
            switch (frequency) {
                case 'daily':
                    windowStart = new Date(now);
                    windowStart.setHours(0, 0, 0, 0);
                    windowEnd = new Date(windowStart);
                    windowEnd.setDate(windowEnd.getDate() + 1);
                    break;
                case 'weekly':
                    windowStart = new Date(now);
                    windowStart.setDate(windowStart.getDate() - windowStart.getDay());
                    windowStart.setHours(0, 0, 0, 0);
                    windowEnd = new Date(windowStart);
                    windowEnd.setDate(windowEnd.getDate() + 7);
                    break;
                case 'monthly':
                    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    break;
                default:
                    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            }

            const sourceEventId = null; // API-triggered has no external source

            // Generate fingerprint
            const amountCents = Math.round((goal.recurringContribution.amount || 0) * 100);
            const currency = goal.currency || 'USD';
            const fingerprint = createHash('sha256')
                .update(`${goalId}|${windowStart.toISOString()}|${windowEnd.toISOString()}|null|${amountCents}|${currency}`)
                .digest('hex');

            // Check if execution already exists
            const [existing] = await db
                .select()
                .from(recurringPaymentExecutions)
                .where(
                    and(
                        eq(recurringPaymentExecutions.goalId, goalId),
                        eq(recurringPaymentExecutions.billingWindowStart, windowStart),
                        eq(recurringPaymentExecutions.billingWindowEnd, windowEnd)
                    )
                );

            if (existing && ['pending', 'executing', 'completed'].includes(existing.status)) {
                logger.info(`[RecurringPaymentService] Execution already exists for goal ${goalId}`);
                
                return {
                    triggered: false,
                    reason: 'execution_already_exists',
                    existingExecution: existing
                };
            }

            // Create execution
            const [execution] = await db
                .insert(recurringPaymentExecutions)
                .values({
                    tenantId,
                    goalId,
                    userId,
                    billingWindowStart: windowStart,
                    billingWindowEnd: windowEnd,
                    sourceEventId: null,
                    sourceEventType,
                    executionFingerprint: fingerprint,
                    contributionAmountCents: amountCents,
                    contributionCurrency: currency,
                    status: 'pending',
                    scheduledAt: new Date()
                })
                .returning();

            // Create audit log
            await createAuditLog({
                tenantId,
                userId,
                action: 'recurring_payment.triggered_via_api',
                category: 'financial',
                details: {
                    executionId: execution.id,
                    goalId,
                    amount: goal.recurringContribution.amount,
                    currency
                }
            });

            logger.info(`[RecurringPaymentService] Triggered recurring payment for goal ${goalId}: execution ${execution.id}`);

            // Process immediately
            await this.worker.processExecution(execution.id);

            // Fetch updated execution
            const [updated] = await db
                .select()
                .from(recurringPaymentExecutions)
                .where(eq(recurringPaymentExecutions.id, execution.id));

            return {
                triggered: true,
                execution: updated
            };
        } catch (error) {
            logger.error(`[RecurringPaymentService] Error triggering recurring payment:`, error);
            throw error;
        }
    }

    /**
     * Get execution history for a goal
     */
    async getExecutionHistory({ goalId, userId, limit = 50, offset = 0 }) {
        try {
            // Verify goal ownership
            const [goal] = await db
                .select()
                .from(goals)
                .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));

            if (!goal) {
                throw new Error('Goal not found or not authorized');
            }

            const [executions, countResult] = await Promise.all([
                db
                    .select()
                    .from(recurringPaymentExecutions)
                    .where(eq(recurringPaymentExecutions.goalId, goalId))
                    .orderBy(desc(recurringPaymentExecutions.createdAt))
                    .limit(limit)
                    .offset(offset),
                db
                    .select({ count: sql`COUNT(*)` })
                    .from(recurringPaymentExecutions)
                    .where(eq(recurringPaymentExecutions.goalId, goalId))
            ]);

            const total = Number(countResult[0]?.count || 0);

            return {
                executions,
                pagination: {
                    limit,
                    offset,
                    total,
                    hasMore: offset + limit < total
                }
            };
        } catch (error) {
            logger.error(`[RecurringPaymentService] Error fetching execution history:`, error);
            throw error;
        }
    }

    /**
     * Get dead-letter queue for tenant
     */
    async getTenantDLQ({ tenantId, status = 'pending_review', limit = 50, offset = 0 }) {
        try {
            return await this.dlqService.getDLQSummary({
                tenantId,
                status,
                limit
            });
        } catch (error) {
            logger.error(`[RecurringPaymentService] Error fetching DLQ:`, error);
            throw error;
        }
    }

    /**
     * Replay a failed payment from dead-letter queue
     */
    async replayDeadLetter({ deadLetterId, tenantId, userId, reason = null }) {
        try {
            // Get dead-letter entry
            const dlqDetails = await this.dlqService.getDLQDetails(deadLetterId);

            if (!dlqDetails) {
                throw new Error('Dead-letter entry not found');
            }

            if (dlqDetails.tenantId !== tenantId) {
                throw new Error('Not authorized to replay this dead-letter');
            }

            // Update dead-letter status
            await this.dlqService.assignDLQ({
                deadLetterId,
                userId,
                notes: `Replay initiated: ${reason || 'No reason provided'}`
            });

            // Reset execution for retry
            const [execution] = await db
                .select()
                .from(recurringPaymentExecutions)
                .where(eq(recurringPaymentExecutions.id, dlqDetails.executionId));

            if (!execution) {
                throw new Error('Associated execution not found');
            }

            // Reset status to pending for retry
            await db
                .update(recurringPaymentExecutions)
                .set({
                    status: 'pending',
                    retryCount: 0,
                    nextRetryAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(recurringPaymentExecutions.id, execution.id));

            // Create audit log
            await createAuditLog({
                tenantId,
                userId,
                action: 'recurring_payment.replayed_from_dlq',
                category: 'financial',
                details: {
                    deadLetterId,
                    executionId: execution.id,
                    goalId: execution.goalId,
                    reason
                }
            });

            // Process immediately
            const result = await this.worker.processExecution(execution.id);

            logger.info(`[RecurringPaymentService] Replayed dead-letter ${deadLetterId} for execution ${execution.id}`);

            return {
                replayed: true,
                result,
                execution
            };
        } catch (error) {
            logger.error(`[RecurringPaymentService] Error replaying dead-letter:`, error);
            throw error;
        }
    }

    /**
     * Mark dead-letter as resolved
     */
    async resolveDeadLetter({ deadLetterId, tenantId, status, notes = null }) {
        try {
            // Verify dead-letter belongs to tenant
            const [dlq] = await db
                .select()
                .from(recurringPaymentDeadLetters)
                .where(eq(recurringPaymentDeadLetters.id, deadLetterId));

            if (!dlq || dlq.tenantId !== tenantId) {
                throw new Error('Dead-letter not found or not authorized');
            }

            await this.dlqService.resolveDLQ({
                deadLetterId,
                status,
                notes
            });

            return { resolved: true, status };
        } catch (error) {
            logger.error(`[RecurringPaymentService] Error resolving dead-letter:`, error);
            throw error;
        }
    }

    /**
     * Get DLQ metrics for tenant
     */
    async getDLQMetrics({ tenantId, days = 30 }) {
        try {
            return await this.dlqService.getDLQMetrics({
                tenantId,
                days
            });
        } catch (error) {
            logger.error(`[RecurringPaymentService] Error fetching DLQ metrics:`, error);
            throw error;
        }
    }
}

export { RecurringPaymentService };
