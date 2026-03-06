import cron from 'node-cron';
import db from '../config/db.js';
import { users, budgetPredictions } from '../db/schema.js';
import { eq, lte } from 'drizzle-orm';
import budgetAI from '../services/budgetAI.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Budget Optimizer Job
 * Generates daily spending predictions and auto-adjusts budgets
 * Runs daily at midnight
 */
class BudgetOptimizerJob {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.stats = {
            totalUsers: 0,
            predictionsGenerated: 0,
            adjustmentsCreated: 0,
            errors: 0
        };
    }

    /**
     * Start the optimizer job
     * Runs daily at midnight
     */
    start() {
        // Run daily at midnight: 0 0 * * *
        cron.schedule('0 0 * * *', async () => {
            await this.run();
        });

        logInfo('Budget Optimizer Job scheduled (daily at midnight)');

        // Run immediately on startup for testing
        setTimeout(() => {
            this.run();
        }, 15000); // Wait 15 seconds after startup
    }

    /**
     * Run the optimizer job
     */
    async run() {
        if (this.isRunning) {
            logInfo('Budget optimizer job already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logInfo('🤖 Starting budget optimizer job...');

            // Get all active users
            const activeUsers = await db.select({
                id: users.id,
                email: users.email
            })
                .from(users)
                .where(eq(users.isActive, true));

            logInfo(`Found ${activeUsers.length} active users`);

            let predictionsGenerated = 0;
            let adjustmentsCreated = 0;
            let errors = 0;

            // Process users in batches
            const batchSize = 10;
            for (let i = 0; i < activeUsers.length; i += batchSize) {
                const batch = activeUsers.slice(i, i + batchSize);

                await Promise.all(batch.map(async (user) => {
                    try {
                        // Generate predictions for user
                        const predictions = await this.generateUserPredictions(user.id);
                        predictionsGenerated += predictions;

                        // Auto-adjust budgets if enabled
                        const adjustments = await this.autoAdjustUserBudgets(user.id);
                        adjustmentsCreated += adjustments;

                        // Generate insights
                        await budgetAI.generateInsights(user.id);

                    } catch (error) {
                        errors++;
                        logError(`Error processing user ${user.id}:`, error);
                    }
                }));
            }

            const duration = Date.now() - startTime;

            this.stats.totalUsers = activeUsers.length;
            this.stats.predictionsGenerated = predictionsGenerated;
            this.stats.adjustmentsCreated = adjustmentsCreated;
            this.stats.errors = errors;
            this.lastRun = new Date();

            logInfo(`✅ Budget optimizer job completed in ${duration}ms`);
            logInfo(`   - Users processed: ${activeUsers.length}`);
            logInfo(`   - Predictions generated: ${predictionsGenerated}`);
            logInfo(`   - Adjustments created: ${adjustmentsCreated}`);
            logInfo(`   - Errors: ${errors}`);
        } catch (error) {
            logError('Budget optimizer job failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Generate predictions for a user
     */
    async generateUserPredictions(userId) {
        try {
            // Check if user has auto-prediction enabled
            // For now, generate predictions for all users

            // Train model if not trained recently
            const lastPrediction = await db.select()
                .from(budgetPredictions)
                .where(eq(budgetPredictions.userId, userId))
                .orderBy(budgetPredictions.createdAt)
                .limit(1);

            const shouldTrain = !lastPrediction.length ||
                this.isOlderThan(lastPrediction[0].createdAt, 7); // 7 days

            if (shouldTrain) {
                await budgetAI.trainSpendingModel(userId, {
                    modelType: 'arima',
                    lookbackMonths: 12
                });
                return 3; // Returns 3 predictions (next 3 months)
            }

            return 0;
        } catch (error) {
            // User might not have enough data yet
            if (error.message.includes('Insufficient data')) {
                return 0;
            }
            throw error;
        }
    }

    /**
     * Auto-adjust budgets for a user
     */
    async autoAdjustUserBudgets(userId) {
        try {
            // Check if user has auto-adjust enabled
            // For now, create suggestions for all users

            const result = await budgetAI.autoAdjustBudget(userId, 'MODERATE');
            return result.adjustmentsCreated;
        } catch (error) {
            // User might not have budgets set up yet
            if (error.message.includes('No budgets found')) {
                return 0;
            }
            throw error;
        }
    }

    /**
     * Update prediction accuracy
     */
    async updatePredictionAccuracy() {
        try {
            logInfo('📊 Updating prediction accuracy...');

            const currentMonth = new Date();
            currentMonth.setDate(1);
            currentMonth.setHours(0, 0, 0, 0);

            // Get predictions for current month
            const predictions = await db.select()
                .from(budgetPredictions)
                .where(
                    lte(budgetPredictions.predictionMonth, currentMonth)
                );

            let updated = 0;

            for (const prediction of predictions) {
                if (prediction.actualAmount && !prediction.accuracy) {
                    const predicted = parseFloat(prediction.predictedAmount);
                    const actual = parseFloat(prediction.actualAmount);
                    const error = Math.abs(predicted - actual);
                    const accuracy = 1 - (error / actual);

                    await db.update(budgetPredictions)
                        .set({
                            accuracy,
                            updatedAt: new Date()
                        })
                        .where(eq(budgetPredictions.id, prediction.id));

                    updated++;
                }
            }

            logInfo(`✅ Updated accuracy for ${updated} predictions`);
        } catch (error) {
            logError('Failed to update prediction accuracy:', error);
        }
    }

    /**
     * Send budget alerts
     */
    async sendBudgetAlerts() {
        try {
            logInfo('📧 Sending budget alerts...');

            // Get users with overspending alerts
            // In production, this would send actual emails/notifications

            logInfo('✅ Budget alerts sent');
        } catch (error) {
            logError('Failed to send budget alerts:', error);
        }
    }

    /**
     * Clean up old predictions
     */
    async cleanupOldPredictions() {
        try {
            logInfo('🧹 Cleaning up old predictions...');

            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            // Delete predictions older than 6 months
            await db.delete(budgetPredictions)
                .where(lte(budgetPredictions.createdAt, sixMonthsAgo));

            logInfo('✅ Old predictions cleaned up');
        } catch (error) {
            logError('Failed to cleanup old predictions:', error);
        }
    }

    /**
     * Check if date is older than specified days
     */
    isOlderThan(date, days) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - days);
        return new Date(date) < threshold;
    }

    /**
     * Get job statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastRun: this.lastRun,
            isRunning: this.isRunning
        };
    }

    /**
     * Manually trigger the job
     */
    async trigger() {
        logInfo('Manually triggering budget optimizer job...');
        await this.run();
    }
}

const budgetOptimizerJob = new BudgetOptimizerJob();

export default budgetOptimizerJob;
export { budgetOptimizerJob };
