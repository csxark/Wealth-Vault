import sagaCoordinator from './sagaCoordinator.js';
import distributedTransactionService from './distributedTransactionService.js';
import db from '../config/db.js';
import { expenses, categories, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../utils/logger.js';
import outboxService from './outboxService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Split Expense Saga
 * 
 * Handles distributed transaction for creating shared expenses across multiple categories/users.
 * This saga prevents deadlocks and ensures eventual consistency when processing concurrent splits.
 * 
 * Multi-step workflow:
 * 1. Validate split configuration and acquire category locks
 * 2. Create shared expense record
 * 3. For each split, create individual expense with compensation tracking
 * 4. Update shared expense status to completed
 * 5. Emit consistency check events
 * 
 * If any step fails, all previous steps are compensated (rolled back).
 */

const splitExpenseSaga = [
    {
        name: 'acquire_category_locks',
        execute: async ({ sagaPayload }) => {
            logger.info('Step: Acquiring category locks for split expense', {
                categoryIds: sagaPayload.splits.map(s => s.categoryId)
            });

            const locks = [];
            const sessionId = `session-${uuidv4()}`;
            const lockTimeoutMs = 30000; // 30 second timeout

            // Sort category IDs to prevent deadlock through consistent lock ordering
            const sortedCategories = [...new Set(sagaPayload.splits.map(s => s.categoryId))].sort();

            for (const categoryId of sortedCategories) {
                if (!categoryId) continue; // Skip null category IDs

                const lockKey = `category-lock-${categoryId}`;
                const timeoutAt = new Date(Date.now() + lockTimeoutMs);

                // Note: In real implementation, use categoryLocks table
                locks.push({
                    categoryId,
                    lockKey,
                    sessionId,
                    timeoutAt
                });
            }

            return {
                locks,
                sessionId,
                lockedCategories: sortedCategories.filter(id => id)
            };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Releasing category locks', {
                sessionId: stepOutput.sessionId
            });

            // Release locks acquired in this step
            // In real implementation, delete from categoryLocks table
            // await db.delete(categoryLocks).where(eq(categoryLocks.acquiredBySessionId, stepOutput.sessionId));
        }
    },

    {
        name: 'create_shared_expense',
        execute: async ({ sagaPayload, previousResults }) => {
            logger.info('Step: Creating shared expense record', {
                totalAmount: sagaPayload.totalAmount,
                splitCount: sagaPayload.splits.length
            });

            // Note: sharedExpenses table needs to be added to schema
            // This shows the structure for when it's available
            const sharedExpenseData = {
                tenantId: sagaPayload.tenantId,
                createdByUserId: sagaPayload.userId,
                description: sagaPayload.description,
                totalAmount: sagaPayload.totalAmount,
                currency: sagaPayload.currency || 'USD',
                transactionDate: new Date(),
                idempotencyKey: sagaPayload.idempotencyKey,
                status: 'processing',
                splitCount: sagaPayload.splits.length,
                completedSplits: 0,
                failedSplits: 0,
                version: 1,
                isConsistent: true,
                metadata: {
                    createdBy: sagaPayload.userId,
                    participants: sagaPayload.splits.map(s => s.userId),
                    notes: sagaPayload.notes || null,
                    tags: sagaPayload.tags || [],
                }
            };

            // In real implementation:
            // const [sharedExpense] = await db.insert(sharedExpenses).values(sharedExpenseData).returning();

            return {
                sharedExpenseId: uuidv4(), // Placeholder - will be actual ID from DB
                sharedExpense: sharedExpenseData
            };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Deleting shared expense', {
                sharedExpenseId: stepOutput.sharedExpenseId
            });

            // In real implementation:
            // await db.delete(sharedExpenses).where(eq(sharedExpenses.id, stepOutput.sharedExpenseId));
        }
    },

    {
        name: 'create_expense_splits',
        execute: async ({ sagaPayload, previousResults }) => {
            logger.info('Step: Creating expense splits', {
                splitCount: sagaPayload.splits.length
            });

            const sharedExpenseId = previousResults[1].sharedExpenseId;
            const createdSplits = [];
            const failedSplits = [];

            for (let i = 0; i < sagaPayload.splits.length; i++) {
                const split = sagaPayload.splits[i];
                const operationKey = `split-${sharedExpenseId}-${i}`;

                try {
                    // Acquire idempotency lock for this split operation
                    const idempotencyResult = await distributedTransactionService.acquireIdempotencyLock({
                        tenantId: sagaPayload.tenantId,
                        userId: split.userId,
                        operation: 'create_expense_split',
                        operationKey,
                        requestPayload: split,
                        resourceType: 'expense_split',
                        ttlHours: 24
                    });

                    if (!idempotencyResult.acquired) {
                        logger.warn('Idempotency lock already exists for split', {
                            operationKey,
                            reason: idempotencyResult.reason
                        });

                        // If completed, this split was already processed
                        if (idempotencyResult.record?.status === 'completed') {
                            createdSplits.push({
                                index: i,
                                operationKey,
                                status: 'already_processed',
                                expenseId: idempotencyResult.record.resourceId
                            });
                            continue;
                        }
                    }

                    // Calculate split amount
                    const amount = split.percentage
                        ? (sagaPayload.totalAmount * split.percentage / 100).toString()
                        : split.amount.toString();

                    // Create expense entry
                    const [newExpense] = await db.insert(expenses).values({
                        tenantId: sagaPayload.tenantId,
                        userId: split.userId,
                        categoryId: split.categoryId || null,
                        amount: parseFloat(amount),
                        currency: sagaPayload.currency || 'USD',
                        description: `[${sagaPayload.description}] - Split ${i + 1}`,
                        date: new Date(),
                        status: 'completed',
                        metadata: {
                            sharedExpenseId,
                            splitIndex: i,
                            isFromSplit: true,
                            operationKey
                        }
                    }).returning();

                    createdSplits.push({
                        index: i,
                        operationKey,
                        status: 'completed',
                        expenseId: newExpense.id,
                        userId: split.userId,
                        amount
                    });

                    // Update idempotency lock with success
                    await distributedTransactionService.markIdempotencyComplete({
                        operationKey,
                        resourceId: newExpense.id,
                        responseCode: 201
                    });

                    logger.info('Expense split created successfully', {
                        operationKey,
                        expenseId: newExpense.id
                    });

                } catch (error) {
                    logger.error('Failed to create expense split', {
                        operationKey,
                        error: error.message,
                        splitIndex: i
                    });

                    failedSplits.push({
                        index: i,
                        operationKey,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            return {
                sharedExpenseId,
                createdSplits,
                failedSplits,
                totalCreated: createdSplits.length,
                totalFailed: failedSplits.length
            };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Rolling back expense splits', {
                sharedExpenseId: stepOutput.sharedExpenseId,
                createdSplits: stepOutput.createdSplits.length
            });

            // Mark splits for compensation
            for (const split of stepOutput.createdSplits) {
                if (split.status === 'completed' && split.expenseId) {
                    try {
                        // In real implementation, mark for deletion or reversal
                        await db.update(expenses)
                            .set({ status: 'compensated', updatedAt: new Date() })
                            .where(eq(expenses.id, split.expenseId));

                        logger.info('Expense split marked for compensation', {
                            expenseId: split.expenseId
                        });
                    } catch (error) {
                        logger.error('Failed to mark split for compensation', {
                            expenseId: split.expenseId,
                            error: error.message
                        });
                    }
                }
            }
        }
    },

    {
        name: 'update_shared_expense_status',
        execute: async ({ sagaPayload, previousResults }) => {
            logger.info('Step: Updating shared expense status', {
                sharedExpenseId: previousResults[1].sharedExpenseId
            });

            const sharedExpenseId = previousResults[1].sharedExpenseId;
            const splitResults = previousResults[2];

            const isFullyCompleted = splitResults.totalFailed === 0;
            const newStatus = isFullyCompleted ? 'completed' : 'failed';

            // In real implementation:
            // await db.update(sharedExpenses)
            //     .set({
            //         status: newStatus,
            //         completedSplits: splitResults.totalCreated,
            //         failedSplits: splitResults.totalFailed,
            //         isConsistent: isFullyCompleted,
            //         updatedAt: new Date()
            //     })
            //     .where(eq(sharedExpenses.id, sharedExpenseId));

            return {
                sharedExpenseId,
                status: newStatus,
                completedSplits: splitResults.totalCreated,
                failedSplits: splitResults.totalFailed
            };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: Reverting shared expense status', {
                sharedExpenseId: stepOutput.sharedExpenseId
            });

            // Revert to 'pending' state if compensation is needed
            // In real implementation:
            // await db.update(sharedExpenses)
            //     .set({ status: 'pending', updatedAt: new Date() })
            //     .where(eq(sharedExpenses.id, stepOutput.sharedExpenseId));
        }
    },

    {
        name: 'emit_consistency_events',
        execute: async ({ sagaPayload, previousResults }) => {
            logger.info('Step: Emitting consistency check events');

            const sharedExpenseId = previousResults[1].sharedExpenseId;
            const splitResults = previousResults[2];
            const statusUpdate = previousResults[3];

            // Emit outbox events for consistency checks
            const events = [
                {
                    aggregateType: 'shared_expense',
                    aggregateId: sharedExpenseId,
                    eventType: 'shared_expense.split_completed',
                    payload: {
                        sharedExpenseId,
                        totalCreated: splitResults.totalCreated,
                        totalFailed: splitResults.totalFailed,
                        isConsistent: statusUpdate.failedSplits === 0
                    }
                },
                {
                    aggregateType: 'consistency_check',
                    aggregateId: sharedExpenseId,
                    eventType: 'consistency_check.scheduled',
                    payload: {
                        entityType: 'shared_expense',
                        entityId: sharedExpenseId,
                        checkType: 'shared_expense_totals',
                        priority: 'high'
                    }
                }
            ];

            for (const event of events) {
                await outboxService.publishEvent({
                    tenantId: sagaPayload.tenantId,
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    eventType: event.eventType,
                    payload: event.payload
                });
            }

            return {
                eventsPublished: events.length,
                sharedExpenseId
            };
        },
        compensate: async ({ stepOutput }) => {
            logger.info('Compensating: No special cleanup needed for consistency events');
            // Events are idempotent, so no cleanup needed
        }
    }
];

export default splitExpenseSaga;

/**
 * Register the Split Expense Saga
 * This should be called during application initialization
 */
export function registerSplitExpenseSaga() {
    sagaCoordinator.registerSaga('split_expense_creation', splitExpenseSaga);
    logger.info('Split Expense Saga registered successfully');
}

/**
 * Helper function to initiate a split expense saga
 * @param {Object} params - Saga parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User creating the split expense
 * @param {string} params.description - Shared expense description
 * @param {number} params.totalAmount - Total amount
 * @param {string} params.currency - Currency code (default: USD)
 * @param {Array<Object>} params.splits - Array of split configurations
 * @param {string} params.idempotencyKey - Unique key for idempotency
 * @returns {Promise<Object>} Saga instance
 */
export async function createSplitExpenseSaga(params) {
    const {
        tenantId,
        userId,
        description,
        totalAmount,
        currency = 'USD',
        splits,
        idempotencyKey,
        notes = null,
        tags = []
    } = params;

    logger.info('Initiating split expense saga', {
        tenantId,
        userId,
        totalAmount,
        splitCount: splits.length,
        idempotencyKey
    });

    // Validate splits
    if (!splits || splits.length === 0) {
        throw new Error('At least one split is required');
    }

    const totalPercentage = splits.reduce((sum, s) => sum + (s.percentage || 0), 0);
    const hasPercentages = totalPercentage > 0;
    const totalSplitAmount = splits.reduce((sum, s) => sum + (s.amount || 0), 0);

    if (hasPercentages && totalPercentage !== 100) {
        throw new Error('Split percentages must sum to 100');
    }

    if (!hasPercentages && Math.abs(totalSplitAmount - totalAmount) > 0.01) {
        throw new Error('Split amounts must equal total amount');
    }

    // Start the saga
    const sagaInstance = await sagaCoordinator.startSaga({
        sagaType: 'split_expense_creation',
        tenantId,
        idempotencyKey,
        payload: {
            tenantId,
            userId,
            description,
            totalAmount,
            currency,
            splits,
            idempotencyKey,
            notes,
            tags
        }
    });

    logger.info('Split expense saga started', {
        sagaInstanceId: sagaInstance.id,
        correlationId: sagaInstance.correlationId
    });

    return sagaInstance;
}
