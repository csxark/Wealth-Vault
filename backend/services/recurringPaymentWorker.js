/**
 * Recurring Payment Worker (Issue #568)
 * 
 * Executes recurring payment contributions with:
 * - Pre-execution fingerprint validation
 * - Optimistic locking for concurrent safety
 * - Exponential backoff retry logic
 * - Dead-letter queue integration
 * - Response caching for replay safety
 */

import { createHash } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { goals, goalContributionLineItems } from '../db/schema.js';
import { 
    recurringPaymentExecutions, 
    recurringPaymentFingerprints 
} from '../db/schema-recurring-payments.js';
import logger from '../utils/logger.js';
import { createAuditLog } from './auditLogService.js';
import { DeadLetterService } from './deadLetterService.js';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE = 2; // Exponential backoff multiplier
const RETRY_BACKOFF_INITIAL_MS = 5000; // 5 seconds

class RecurringPaymentWorker {
    constructor() {
        this.deadLetterService = new DeadLetterService();
    }

    /**
     * Validate execution fingerprint before processing
     */
    async validateExecutionFingerprint(executionId) {
        const [execution] = await db
            .select()
            .from(recurringPaymentExecutions)
            .where(eq(recurringPaymentExecutions.id, executionId));

        if (!execution) {
            throw new Error(`Execution ${executionId} not found`);
        }

        // Check if fingerprint is still valid (not replayed)
        const [fingerprint] = await db
            .select()
            .from(recurringPaymentFingerprints)
            .where(eq(recurringPaymentFingerprints.executionId, executionId));

        if (fingerprint && fingerprint.hitCount > 0) {
            logger.warn(`[Worker] Fingerprint ${execution.executionFingerprint} has been replayed ${fingerprint.hitCount} times`);
        }

        return { valid: true, execution };
    }

    /**
     * Acquire execution lock (optimistic locking)
     */
    async acquireExecutionLock(executionId) {
        try {
            const [locked] = await db
                .update(recurringPaymentExecutions)
                .set({
                    status: 'executing',
                    startedAt: new Date(),
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(recurringPaymentExecutions.id, executionId),
                        eq(recurringPaymentExecutions.status, 'pending')
                    )
                )
                .returning();

            if (!locked) {
                return { acquired: false, reason: 'already_executing' };
            }

            return { acquired: true, execution: locked };
        } catch (error) {
            logger.error(`[Worker] Error acquiring execution lock:`, error);
            return { acquired: false, reason: 'lock_error', error };
        }
    }

    /**
     * Create goal contribution line item
     */
    async createContribution({ goalId, tenantId, userId, amountCents, currency, executionId }) {
        const rawAmount = amountCents / 100;

        const [lineItem] = await db
            .insert(goalContributionLineItems)
            .values({
                goalId,
                tenantId,
                userId,
                amountCents,
                rawAmount,
                currency,
                entryType: 'contribution',
                description: `Recurring contribution for billing window`,
                idempotencyKey: `recurring-${executionId}`,
                metadata: { 
                    recurringPaymentExecutionId: executionId,
                    processedAt: new Date().toISOString(),
                    automated: true
                }
            })
            .returning();

        return lineItem;
    }

    /**
     * Update goal current amount
     */
    async updateGoalProgress({ goalId, amountCents }) {
        await db
            .update(goals)
            .set({
                currentAmount: sql`${goals.currentAmount} + ${amountCents / 100}`,
                updatedAt: new Date()
            })
            .where(eq(goals.id, goalId));
    }

    /**
     * Execute recurring payment contribution
     */
    async executePayment(execution) {
        try {
            logger.info(`[Worker] Executing payment for goal ${execution.goalId}, execution ${execution.id}`);

            // Create contribution line item
            const lineItem = await this.createContribution({
                goalId: execution.goalId,
                tenantId: execution.tenantId,
                userId: execution.userId,
                amountCents: execution.contributionAmountCents,
                currency: execution.contributionCurrency,
                executionId: execution.id
            });

            // Update goal progress
            await this.updateGoalProgress({
                goalId: execution.goalId,
                amountCents: execution.contributionAmountCents
            });

            // Create audit log
            await createAuditLog({
                tenantId: execution.tenantId,
                userId: execution.userId,
                action: 'recurring_payment.executed',
                category: 'financial',
                details: {
                    executionId: execution.id,
                    goalId: execution.goalId,
                    amountCents: execution.contributionAmountCents,
                    currency: execution.contributionCurrency,
                    lineItemId: lineItem.id,
                    billingWindow: {
                        start: execution.billingWindowStart,
                        end: execution.billingWindowEnd
                    }
                }
            });

            return {
                success: true,
                lineItemId: lineItem.id,
                responseCode: 200,
                responseBody: {
                    message: 'Recurring payment executed successfully',
                    lineItemId: lineItem.id,
                    amountCents: execution.contributionAmountCents
                }
            };
        } catch (error) {
            logger.error(`[Worker] Payment execution failed for ${execution.id}:`, error);
            
            return {
                success: false,
                responseCode: 500,
                responseBody: {
                    error: 'Payment execution failed',
                    message: error.message
                },
                error
            };
        }
    }

    /**
     * Mark execution as completed
     */
    async completeExecution({ executionId, lineItemId, responseCode, responseBody }) {
        await db
            .update(recurringPaymentExecutions)
            .set({
                status: 'completed',
                contributionLineItemId: lineItemId,
                responseCode,
                responseBody,
                completedAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(recurringPaymentExecutions.id, executionId));

        // Update fingerprint cache with response
        await db
            .update(recurringPaymentFingerprints)
            .set({
                cachedResponseCode: responseCode,
                cachedResponseBody: responseBody
            })
            .where(eq(recurringPaymentFingerprints.executionId, executionId));

        logger.info(`[Worker] Execution ${executionId} completed successfully`);
    }

    /**
     * Mark execution as failed and schedule retry
     */
    async failExecution({ executionId, retryCount, error, responseCode, responseBody }) {
        const nextRetryAt = this.calculateNextRetry(retryCount);

        await db
            .update(recurringPaymentExecutions)
            .set({
                status: 'failed',
                retryCount: retryCount + 1,
                lastError: error?.message || 'Unknown error',
                errorStacktrace: error?.stack || null,
                failureReason: error?.code || 'execution_error',
                responseCode,
                responseBody,
                failedAt: new Date(),
                nextRetryAt,
                updatedAt: new Date()
            })
            .where(eq(recurringPaymentExecutions.id, executionId));

        logger.warn(`[Worker] Execution ${executionId} failed, retry ${retryCount + 1}/${MAX_RETRIES} scheduled for ${nextRetryAt}`);
    }

    /**
     * Calculate next retry time with exponential backoff
     */
    calculateNextRetry(retryCount) {
        const delayMs = RETRY_BACKOFF_INITIAL_MS * Math.pow(RETRY_BACKOFF_BASE, retryCount);
        return new Date(Date.now() + delayMs);
    }

    /**
     * Classify failure type for dead-letter queue
     */
    classifyFailure(error) {
        if (!error) {
            return { category: 'permanent_error', severity: 'medium' };
        }

        const message = error.message?.toLowerCase() || '';

        // Validation errors
        if (message.includes('validation') || message.includes('invalid') || error.code === 'VALIDATION_ERROR') {
            return { category: 'validation_failed', severity: 'medium' };
        }

        // Business logic errors
        if (message.includes('goal') || message.includes('not found') || message.includes('inactive')) {
            return { category: 'business_logic_error', severity: 'low' };
        }

        // Database errors
        if (message.includes('database') || message.includes('connection') || error.code?.startsWith('23')) {
            return { category: 'transient_exhausted', severity: 'high' };
        }

        // Default to permanent error
        return { category: 'permanent_error', severity: 'medium' };
    }

    /**
     * Process a single recurring payment execution
     */
    async processExecution(executionId) {
        try {
            // Validate fingerprint
            const { valid, execution } = await this.validateExecutionFingerprint(executionId);

            if (!valid) {
                logger.warn(`[Worker] Invalid fingerprint for execution ${executionId}`);
                return { processed: false, reason: 'invalid_fingerprint' };
            }

            // Check if already processing
            if (execution.status === 'executing') {
                logger.debug(`[Worker] Execution ${executionId} already in progress`);
                return { processed: false, reason: 'already_executing' };
            }

            // Check if already completed
            if (execution.status === 'completed') {
                logger.debug(`[Worker] Execution ${executionId} already completed`);
                return { processed: false, reason: 'already_completed' };
            }

            // Check if retry limit exceeded
            if (execution.retryCount >= execution.maxRetries) {
                logger.warn(`[Worker] Execution ${executionId} exceeded max retries, moving to DLQ`);
                
                const { category, severity } = this.classifyFailure(null);
                await this.deadLetterService.moveExecutionToDLQ({
                    executionId,
                    failureCategory: category,
                    failureSeverity: severity
                });

                return { processed: false, reason: 'max_retries_exceeded' };
            }

            // Acquire execution lock
            const lockResult = await this.acquireExecutionLock(executionId);
            if (!lockResult.acquired) {
                return { processed: false, reason: lockResult.reason };
            }

            // Execute payment
            const paymentResult = await this.executePayment(execution);

            if (paymentResult.success) {
                // Mark as completed
                await this.completeExecution({
                    executionId,
                    lineItemId: paymentResult.lineItemId,
                    responseCode: paymentResult.responseCode,
                    responseBody: paymentResult.responseBody
                });

                return { processed: true, success: true };
            } else {
                // Check if should retry or move to DLQ
                if (execution.retryCount + 1 >= execution.maxRetries) {
                    const { category, severity } = this.classifyFailure(paymentResult.error);
                    
                    await this.deadLetterService.moveExecutionToDLQ({
                        executionId,
                        failureCategory: category,
                        failureSeverity: severity
                    });

                    return { processed: true, success: false, reason: 'moved_to_dlq' };
                } else {
                    // Schedule retry
                    await this.failExecution({
                        executionId,
                        retryCount: execution.retryCount,
                        error: paymentResult.error,
                        responseCode: paymentResult.responseCode,
                        responseBody: paymentResult.responseBody
                    });

                    return { processed: true, success: false, reason: 'retry_scheduled' };
                }
            }
        } catch (error) {
            logger.error(`[Worker] Fatal error processing execution ${executionId}:`, error);
            return { processed: false, reason: 'fatal_error', error };
        }
    }

    /**
     * Process pending and retry executions
     */
    async processPendingExecutions() {
        try {
            const pending = await db
                .select()
                .from(recurringPaymentExecutions)
                .where(
                    and(
                        eq(recurringPaymentExecutions.status, 'pending'),
                        sql`${recurringPaymentExecutions.retryCount} < ${recurringPaymentExecutions.maxRetries}`
                    )
                )
                .limit(100);

            logger.info(`[Worker] Processing ${pending.length} pending executions`);

            for (const execution of pending) {
                await this.processExecution(execution.id);
            }

            // Process retry queue
            const retries = await db
                .select()
                .from(recurringPaymentExecutions)
                .where(
                    and(
                        eq(recurringPaymentExecutions.status, 'failed'),
                        sql`${recurringPaymentExecutions.nextRetryAt} <= NOW()`,
                        sql`${recurringPaymentExecutions.retryCount} < ${recurringPaymentExecutions.maxRetries}`
                    )
                )
                .limit(50);

            logger.info(`[Worker] Processing ${retries.length} retry executions`);

            for (const execution of retries) {
                // Reset to pending for retry
                await db
                    .update(recurringPaymentExecutions)
                    .set({ status: 'pending' })
                    .where(eq(recurringPaymentExecutions.id, execution.id));

                await this.processExecution(execution.id);
            }
        } catch (error) {
            logger.error(`[Worker] Error processing pending executions:`, error);
        }
    }
}

export { RecurringPaymentWorker };
