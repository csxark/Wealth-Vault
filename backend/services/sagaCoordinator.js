import db from '../config/db.js';
import { sagaInstances, sagaStepExecutions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Saga Coordinator - Manages distributed transactions with compensation logic
 * 
 * Implements the Saga pattern for long-running business processes that span multiple services.
 * Each saga consists of multiple steps, and each step has a compensating action for rollback.
 * 
 * If any step fails, the coordinator automatically triggers compensation for all completed steps
 * in reverse order to maintain consistency.
 */

class SagaCoordinator {
    constructor() {
        this.sagas = new Map(); // Registry of saga definitions
    }

    /**
     * Register a saga definition
     * @param {string} sagaType - Unique saga type identifier
     * @param {Array<Object>} steps - Array of saga steps
     * @param {Function} steps[].execute - Forward action function
     * @param {Function} steps[].compensate - Rollback action function
     * @param {string} steps[].name - Step name
     */
    registerSaga(sagaType, steps) {
        if (!sagaType || !Array.isArray(steps) || steps.length === 0) {
            throw new Error('Invalid saga definition: sagaType and steps are required');
        }

        // Validate each step has execute and compensate functions
        steps.forEach((step, index) => {
            if (!step.name || typeof step.execute !== 'function' || typeof step.compensate !== 'function') {
                throw new Error(`Step ${index} must have name, execute, and compensate functions`);
            }
        });

        this.sagas.set(sagaType, steps);
        logger.info('Saga registered', { sagaType, stepCount: steps.length });
    }

    /**
     * Start a new saga instance
     * @param {Object} params - Saga parameters
     * @param {string} params.sagaType - Type of saga to start
     * @param {string} params.tenantId - Tenant ID
     * @param {Object} params.payload - Initial saga payload
     * @returns {Promise<Object>} Created saga instance
     */
    async startSaga({ sagaType, tenantId, payload, executeAsync = true, timeoutMs = 30000 }) {
        const steps = this.sagas.get(sagaType);
        
        if (!steps) {
            throw new Error(`Saga type '${sagaType}' is not registered`);
        }

        const correlationId = uuidv4();

        try {
            const [instance] = await db.insert(sagaInstances).values({
                tenantId: tenantId || null,
                sagaType,
                correlationId,
                status: 'started',
                currentStep: steps[0].name,
                stepIndex: 0,
                totalSteps: steps.length,
                payload,
                stepResults: [],
                compensationData: {}
            }).returning();

            logger.info('Saga started', {
                sagaId: instance.id,
                sagaType,
                correlationId,
                totalSteps: steps.length
            });

            if (executeAsync) {
                this.executeSaga(instance.id).catch(err => {
                    logger.error('Saga execution error', {
                        sagaId: instance.id,
                        error: err.message
                    });
                });

                return instance;
            }

            await this.executeSagaWithTimeout(instance.id, timeoutMs);
            return await this.getSagaInstance(instance.id);
        } catch (error) {
            logger.error('Failed to start saga', {
                error: error.message,
                sagaType,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Execute saga steps sequentially
     * @param {string} sagaId - Saga instance ID
     * @private
     */
    async executeSaga(sagaId) {
        try {
            let instance = await this.getSagaInstance(sagaId);
            const steps = this.sagas.get(instance.sagaType);

            if (!steps) {
                throw new Error(`Saga type '${instance.sagaType}' is not registered`);
            }

            while (instance.stepIndex < instance.totalSteps) {
                const step = steps[instance.stepIndex];
                
                try {
                    // Execute the step
                    const stepResult = await this.executeStep(instance, step);
                    
                    // Move to next step
                    instance = await this.moveToNextStep(instance, stepResult);
                } catch (error) {
                    // Step failed - trigger compensation
                    logger.error('Step execution failed, starting compensation', {
                        sagaId: instance.id,
                        step: step.name,
                        error: error.message
                    });
                    
                    await this.triggerCompensation(instance, error.message);
                    return;
                }
            }

            // All steps completed successfully
            await this.markSagaAsCompleted(sagaId);
            
        } catch (error) {
            logger.error('Fatal saga execution error', {
                sagaId,
                error: error.message
            });
            await this.markSagaAsFailed(sagaId, error.message);
        }
    }

    /**
     * Execute saga with timeout guard
     * @param {string} sagaId
     * @param {number} timeoutMs
     */
    async executeSagaWithTimeout(sagaId, timeoutMs = 30000) {
        let timeoutHandle;

        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`Saga execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        try {
            await Promise.race([
                this.executeSaga(sagaId),
                timeoutPromise
            ]);
        } catch (error) {
            await this.markSagaAsFailed(sagaId, error.message);
            throw error;
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    /**
     * Execute a single saga step
     * @param {Object} instance - Saga instance
     * @param {Object} step - Step definition
     * @returns {Promise<Object>} Step execution result
     * @private
     */
    async executeStep(instance, step) {
        const stepExecution = await this.recordStepStart(instance.id, step.name, instance.stepIndex);

        try {
            // Build step input from saga payload and previous step results
            const stepInput = {
                sagaPayload: instance.payload,
                previousResults: instance.stepResults,
                tenantId: instance.tenantId
            };

            // Execute the step
            const result = await step.execute(stepInput);

            // Record successful completion
            await this.recordStepCompletion(stepExecution.id, result);

            logger.info('Step completed successfully', {
                sagaId: instance.id,
                step: step.name,
                stepIndex: instance.stepIndex
            });

            return result;

        } catch (error) {
            // Record failure
            await this.recordStepFailure(stepExecution.id, error.message);
            throw error;
        }
    }

    /**
     * Move saga to next step
     * @param {Object} instance - Current saga instance
     * @param {Object} stepResult - Result from current step
     * @returns {Promise<Object>} Updated saga instance
     * @private
     */
    async moveToNextStep(instance, stepResult) {
        const nextStepIndex = instance.stepIndex + 1;
        const steps = this.sagas.get(instance.sagaType);
        const nextStep = steps[nextStepIndex];

        const [updatedInstance] = await db
            .update(sagaInstances)
            .set({
                stepIndex: nextStepIndex,
                currentStep: nextStep ? nextStep.name : null,
                status: nextStepIndex < instance.totalSteps ? 'step_completed' : 'completed',
                stepResults: [...instance.stepResults, stepResult],
                updatedAt: new Date()
            })
            .where(eq(sagaInstances.id, instance.id))
            .returning();

        return updatedInstance;
    }

    /**
     * Trigger compensation for all completed steps
     * @param {Object} instance - Saga instance
     * @param {string} errorMessage - Error that triggered compensation
     * @private
     */
    async triggerCompensation(instance, errorMessage) {
        try {
            // Mark saga as compensating
            await db
                .update(sagaInstances)
                .set({
                    status: 'compensating',
                    error: errorMessage,
                    updatedAt: new Date()
                })
                .where(eq(sagaInstances.id, instance.id));

            // Get all completed steps
            const completedSteps = await db
                .select()
                .from(sagaStepExecutions)
                .where(
                    and(
                        eq(sagaStepExecutions.sagaInstanceId, instance.id),
                        eq(sagaStepExecutions.status, 'completed')
                    )
                )
                .orderBy(sagaStepExecutions.stepIndex);

            const steps = this.sagas.get(instance.sagaType);

            // Compensate in reverse order
            for (let i = completedSteps.length - 1; i >= 0; i--) {
                const stepExec = completedSteps[i];
                const step = steps[stepExec.stepIndex];

                try {
                    logger.info('Compensating step', {
                        sagaId: instance.id,
                        step: step.name
                    });

                    // Mark as compensating
                    await db
                        .update(sagaStepExecutions)
                        .set({
                            status: 'compensating',
                            updatedAt: new Date()
                        })
                        .where(eq(sagaStepExecutions.id, stepExec.id));

                    // Execute compensation
                    await step.compensate({
                        sagaPayload: instance.payload,
                        stepOutput: stepExec.output,
                        tenantId: instance.tenantId
                    });

                    // Mark as compensated
                    await db
                        .update(sagaStepExecutions)
                        .set({
                            status: 'compensated',
                            compensated: true,
                            compensatedAt: new Date(),
                            updatedAt: new Date()
                        })
                        .where(eq(sagaStepExecutions.id, stepExec.id));

                    logger.info('Step compensated successfully', {
                        sagaId: instance.id,
                        step: step.name
                    });

                } catch (compensationError) {
                    logger.error('Compensation failed', {
                        sagaId: instance.id,
                        step: step.name,
                        error: compensationError.message
                    });
                    // Continue with other compensations even if one fails
                }
            }

            // Mark saga as failed
            await this.markSagaAsFailed(instance.id, errorMessage);

        } catch (error) {
            logger.error('Fatal compensation error', {
                sagaId: instance.id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Record step start
     * @private
     */
    async recordStepStart(sagaInstanceId, stepName, stepIndex) {
        const [stepExec] = await db.insert(sagaStepExecutions).values({
            sagaInstanceId,
            stepName,
            stepIndex,
            status: 'started',
            input: {},
            retryCount: 0
        }).returning();

        return stepExec;
    }

    /**
     * Record step completion
     * @private
     */
    async recordStepCompletion(stepExecutionId, output) {
        await db
            .update(sagaStepExecutions)
            .set({
                status: 'completed',
                output,
                completedAt: new Date()
            })
            .where(eq(sagaStepExecutions.id, stepExecutionId));
    }

    /**
     * Record step failure
     * @private
     */
    async recordStepFailure(stepExecutionId, error) {
        await db
            .update(sagaStepExecutions)
            .set({
                status: 'failed',
                error
            })
            .where(eq(sagaStepExecutions.id, stepExecutionId));
    }

    /**
     * Mark saga as completed
     * @private
     */
    async markSagaAsCompleted(sagaId) {
        await db
            .update(sagaInstances)
            .set({
                status: 'completed',
                completedAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(sagaInstances.id, sagaId));

        logger.info('Saga completed successfully', { sagaId });
    }

    /**
     * Mark saga as failed
     * @private
     */
    async markSagaAsFailed(sagaId, error) {
        await db
            .update(sagaInstances)
            .set({
                status: 'failed',
                error,
                failedAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(sagaInstances.id, sagaId));

        logger.warn('Saga failed', { sagaId, error });
    }

    /**
     * Get saga instance by ID
     */
    async getSagaInstance(sagaId) {
        const [instance] = await db
            .select()
            .from(sagaInstances)
            .where(eq(sagaInstances.id, sagaId));

        if (!instance) {
            throw new Error(`Saga instance ${sagaId} not found`);
        }

        return instance;
    }

    /**
     * Get saga by correlation ID
     */
    async getSagaByCorrelationId(correlationId) {
        const [instance] = await db
            .select()
            .from(sagaInstances)
            .where(eq(sagaInstances.correlationId, correlationId));

        return instance;
    }

    /**
     * Get step executions for a saga
     */
    async getSagaSteps(sagaId) {
        const steps = await db
            .select()
            .from(sagaStepExecutions)
            .where(eq(sagaStepExecutions.sagaInstanceId, sagaId))
            .orderBy(sagaStepExecutions.stepIndex);

        return steps;
    }
}

export default new SagaCoordinator();
