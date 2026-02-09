import db from '../config/db.js';
import { budgetPredictions, spendingPatterns, budgetAdjustments, categoryInsights, expenses, categories, budgets } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import spendingPredictor from './spendingPredictor.js';

/**
 * Budget AI - ML-powered budget management and predictions
 * Automatically adjusts budgets based on spending patterns
 */
class BudgetAI {
    constructor() {
        this.models = {
            ARIMA: 'arima',
            LSTM: 'lstm',
            PROPHET: 'prophet',
            MOVING_AVERAGE: 'moving_average'
        };

        this.adjustmentRules = {
            CONSERVATIVE: { maxAdjustment: 0.10, minDataPoints: 6 },
            MODERATE: { maxAdjustment: 0.20, minDataPoints: 4 },
            AGGRESSIVE: { maxAdjustment: 0.40, minDataPoints: 3 }
        };
    }

    /**
     * Train spending model for a user
     */
    async trainSpendingModel(userId, options = {}) {
        try {
            const {
                categoryId = null,
                modelType = this.models.ARIMA,
                lookbackMonths = 12
            } = options;

            console.log(`🤖 Training ${modelType} model for user ${userId}...`);

            // Get historical expense data
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - lookbackMonths);

            const historicalExpenses = await this.getHistoricalExpenses(userId, categoryId, startDate);

            if (historicalExpenses.length < 3) {
                throw new Error('Insufficient data for training (minimum 3 months required)');
            }

            // Analyze spending patterns
            const patterns = await spendingPredictor.analyzeHistoricalPatterns(userId, categoryId);

            // Store patterns
            await this.storeSpendingPatterns(userId, categoryId, patterns, startDate);

            // Generate predictions for next 3 months
            const predictions = await this.generatePredictions(userId, categoryId, modelType, patterns);

            console.log(`✅ Model trained successfully. Generated ${predictions.length} predictions.`);

            return {
                success: true,
                modelType,
                patternsDetected: patterns,
                predictions,
                dataPoints: historicalExpenses.length
            };
        } catch (error) {
            console.error('Failed to train spending model:', error);
            throw error;
        }
    }

    /**
     * Get historical expenses for analysis
     */
    async getHistoricalExpenses(userId, categoryId, startDate) {
        let query = db.select({
            id: expenses.id,
            amount: expenses.amount,
            categoryId: expenses.categoryId,
            date: expenses.date,
            description: expenses.description
        })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, startDate)
                )
            )
            .orderBy(expenses.date);

        if (categoryId) {
            query = query.where(eq(expenses.categoryId, categoryId));
        }

        return await query;
    }

    /**
     * Store spending patterns
     */
    async storeSpendingPatterns(userId, categoryId, patterns, startDate) {
        const endDate = new Date();

        const [pattern] = await db.insert(spendingPatterns).values({
            userId,
            categoryId,
            patternType: patterns.type,
            frequency: patterns.frequency,
            averageAmount: patterns.average.toString(),
            medianAmount: patterns.median.toString(),
            standardDeviation: patterns.stdDev,
            minAmount: patterns.min.toString(),
            maxAmount: patterns.max.toString(),
            growthRate: patterns.growthRate,
            seasonalityIndex: patterns.seasonality,
            anomalyCount: patterns.anomalies?.length || 0,
            dataPoints: patterns.dataPoints,
            analysisStartDate: startDate,
            analysisEndDate: endDate
        }).returning();

        return pattern;
    }

    /**
     * Generate predictions for future months
     */
    async generatePredictions(userId, categoryId, modelType, patterns) {
        const predictions = [];
        const currentDate = new Date();

        for (let i = 1; i <= 3; i++) {
            const predictionMonth = new Date(currentDate);
            predictionMonth.setMonth(predictionMonth.getMonth() + i);

            const prediction = await spendingPredictor.predictCategorySpending(
                userId,
                categoryId,
                i,
                modelType
            );

            const [savedPrediction] = await db.insert(budgetPredictions).values({
                userId,
                categoryId,
                predictionMonth,
                predictedAmount: prediction.amount.toString(),
                confidenceScore: prediction.confidence,
                modelType,
                seasonalFactor: prediction.seasonalFactor,
                trendFactor: prediction.trendFactor,
                variance: prediction.variance,
                upperBound: prediction.upperBound.toString(),
                lowerBound: prediction.lowerBound.toString(),
                metadata: {
                    monthsAhead: i,
                    basedOnDataPoints: patterns.dataPoints
                }
            }).returning();

            predictions.push(savedPrediction);
        }

        return predictions;
    }

    /**
     * Predict monthly spending for a category
     */
    async predictMonthlySpending(userId, categoryId, monthsAhead = 1) {
        try {
            // Check if we have recent predictions
            const predictionMonth = new Date();
            predictionMonth.setMonth(predictionMonth.getMonth() + monthsAhead);

            const [existingPrediction] = await db.select()
                .from(budgetPredictions)
                .where(
                    and(
                        eq(budgetPredictions.userId, userId),
                        eq(budgetPredictions.categoryId, categoryId),
                        eq(budgetPredictions.predictionMonth, predictionMonth)
                    )
                )
                .limit(1);

            if (existingPrediction) {
                return existingPrediction;
            }

            // Generate new prediction
            const prediction = await spendingPredictor.predictCategorySpending(
                userId,
                categoryId,
                monthsAhead
            );

            const [saved] = await db.insert(budgetPredictions).values({
                userId,
                categoryId,
                predictionMonth,
                predictedAmount: prediction.amount.toString(),
                confidenceScore: prediction.confidence,
                modelType: prediction.modelType,
                seasonalFactor: prediction.seasonalFactor,
                trendFactor: prediction.trendFactor,
                variance: prediction.variance,
                upperBound: prediction.upperBound.toString(),
                lowerBound: prediction.lowerBound.toString()
            }).returning();

            return saved;
        } catch (error) {
            console.error('Failed to predict monthly spending:', error);
            throw error;
        }
    }

    /**
     * Generate budget recommendations based on predictions
     */
    async generateBudgetRecommendations(userId) {
        try {
            // Get all categories for user
            const userCategories = await db.select()
                .from(categories)
                .where(eq(categories.userId, userId));

            const recommendations = [];

            for (const category of userCategories) {
                // Get prediction for next month
                const prediction = await this.predictMonthlySpending(userId, category.id, 1);

                // Get current budget
                const [currentBudget] = await db.select()
                    .from(budgets)
                    .where(
                        and(
                            eq(budgets.userId, userId),
                            eq(budgets.categoryId, category.id)
                        )
                    )
                    .limit(1);

                if (!currentBudget) continue;

                const predictedAmount = parseFloat(prediction.predictedAmount);
                const currentAmount = parseFloat(currentBudget.amount);
                const difference = predictedAmount - currentAmount;
                const percentageChange = (difference / currentAmount) * 100;

                let recommendationType = 'maintain';
                let reason = 'Current budget is appropriate';

                if (percentageChange > 15) {
                    recommendationType = 'increase';
                    reason = `Predicted spending (${predictedAmount.toFixed(2)}) exceeds budget by ${percentageChange.toFixed(1)}%`;
                } else if (percentageChange < -15) {
                    recommendationType = 'decrease';
                    reason = `Predicted spending (${predictedAmount.toFixed(2)}) is ${Math.abs(percentageChange).toFixed(1)}% below budget`;
                }

                recommendations.push({
                    categoryId: category.id,
                    categoryName: category.name,
                    currentBudget: currentAmount,
                    predictedSpending: predictedAmount,
                    recommendedBudget: predictedAmount,
                    change: difference,
                    percentageChange,
                    type: recommendationType,
                    reason,
                    confidence: prediction.confidenceScore
                });
            }

            return recommendations;
        } catch (error) {
            console.error('Failed to generate budget recommendations:', error);
            throw error;
        }
    }

    /**
     * Auto-adjust budget based on rules
     */
    async autoAdjustBudget(userId, adjustmentRule = 'MODERATE') {
        try {
            const rule = this.adjustmentRules[adjustmentRule];
            const recommendations = await this.generateBudgetRecommendations(userId);

            const adjustments = [];

            for (const rec of recommendations) {
                if (rec.type === 'maintain') continue;

                // Calculate safe adjustment amount
                const maxChange = rec.currentBudget * rule.maxAdjustment;
                let adjustmentAmount = rec.change;

                // Cap adjustment to max allowed
                if (Math.abs(adjustmentAmount) > maxChange) {
                    adjustmentAmount = adjustmentAmount > 0 ? maxChange : -maxChange;
                }

                const newBudget = rec.currentBudget + adjustmentAmount;

                // Create adjustment record
                const [adjustment] = await db.insert(budgetAdjustments).values({
                    userId,
                    categoryId: rec.categoryId,
                    adjustmentType: 'auto',
                    previousAmount: rec.currentBudget.toString(),
                    newAmount: newBudget.toString(),
                    adjustmentPercentage: (adjustmentAmount / rec.currentBudget) * 100,
                    reason: rec.type === 'increase' ? 'overspending' : 'underspending',
                    confidence: rec.confidence,
                    status: 'pending',
                    triggeredBy: 'system',
                    effectiveMonth: new Date(),
                    recommendations: [rec]
                }).returning();

                adjustments.push(adjustment);
            }

            return {
                success: true,
                adjustmentsCreated: adjustments.length,
                adjustments,
                rule: adjustmentRule
            };
        } catch (error) {
            console.error('Failed to auto-adjust budget:', error);
            throw error;
        }
    }

    /**
     * Apply pending budget adjustments
     */
    async applyAdjustments(userId, adjustmentIds) {
        try {
            const applied = [];

            for (const adjustmentId of adjustmentIds) {
                const [adjustment] = await db.select()
                    .from(budgetAdjustments)
                    .where(
                        and(
                            eq(budgetAdjustments.id, adjustmentId),
                            eq(budgetAdjustments.userId, userId),
                            eq(budgetAdjustments.status, 'pending')
                        )
                    )
                    .limit(1);

                if (!adjustment) continue;

                // Update budget
                await db.update(budgets)
                    .set({
                        amount: adjustment.newAmount,
                        updatedAt: new Date()
                    })
                    .where(
                        and(
                            eq(budgets.userId, userId),
                            eq(budgets.categoryId, adjustment.categoryId)
                        )
                    );

                // Mark adjustment as applied
                const [updated] = await db.update(budgetAdjustments)
                    .set({
                        status: 'applied',
                        appliedAt: new Date(),
                        updatedAt: new Date()
                    })
                    .where(eq(budgetAdjustments.id, adjustmentId))
                    .returning();

                applied.push(updated);
            }

            return {
                success: true,
                appliedCount: applied.length,
                adjustments: applied
            };
        } catch (error) {
            console.error('Failed to apply adjustments:', error);
            throw error;
        }
    }

    /**
     * Detect spending anomalies
     */
    async detectAnomalies(userId, categoryId = null) {
        try {
            // Get spending patterns
            let query = db.select()
                .from(spendingPatterns)
                .where(eq(spendingPatterns.userId, userId));

            if (categoryId) {
                query = query.where(eq(spendingPatterns.categoryId, categoryId));
            }

            const patterns = await query;

            const anomalies = [];

            for (const pattern of patterns) {
                // Get recent expenses
                const recentExpenses = await this.getHistoricalExpenses(
                    userId,
                    pattern.categoryId,
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                );

                const average = parseFloat(pattern.averageAmount);
                const stdDev = pattern.standardDeviation;
                const threshold = average + (2 * stdDev); // 2 standard deviations

                for (const expense of recentExpenses) {
                    const amount = parseFloat(expense.amount);
                    if (amount > threshold) {
                        anomalies.push({
                            expenseId: expense.id,
                            categoryId: pattern.categoryId,
                            amount,
                            expected: average,
                            deviation: ((amount - average) / average) * 100,
                            severity: amount > (average + 3 * stdDev) ? 'high' : 'medium'
                        });
                    }
                }
            }

            return anomalies;
        } catch (error) {
            console.error('Failed to detect anomalies:', error);
            throw error;
        }
    }

    /**
     * Generate category insights
     */
    async generateInsights(userId) {
        try {
            const insights = [];

            // Get anomalies
            const anomalies = await this.detectAnomalies(userId);

            for (const anomaly of anomalies) {
                const [insight] = await db.insert(categoryInsights).values({
                    userId,
                    categoryId: anomaly.categoryId,
                    insightType: 'anomaly',
                    severity: anomaly.severity,
                    title: 'Unusual Spending Detected',
                    description: `Spending of $${anomaly.amount} is ${anomaly.deviation.toFixed(1)}% above average`,
                    currentValue: anomaly.amount.toString(),
                    expectedValue: anomaly.expected.toString(),
                    deviation: anomaly.deviation,
                    actionable: true,
                    suggestedActions: [
                        'Review this expense',
                        'Check if it\'s a one-time purchase',
                        'Consider adjusting budget if recurring'
                    ],
                    timeframe: 'month'
                }).returning();

                insights.push(insight);
            }

            // Get budget recommendations
            const recommendations = await this.generateBudgetRecommendations(userId);

            for (const rec of recommendations) {
                if (rec.type === 'maintain') continue;

                const [insight] = await db.insert(categoryInsights).values({
                    userId,
                    categoryId: rec.categoryId,
                    insightType: rec.type === 'increase' ? 'overspending' : 'saving_opportunity',
                    severity: Math.abs(rec.percentageChange) > 30 ? 'high' : 'medium',
                    title: rec.type === 'increase' ? 'Budget Increase Recommended' : 'Saving Opportunity',
                    description: rec.reason,
                    currentValue: rec.currentBudget.toString(),
                    expectedValue: rec.predictedSpending.toString(),
                    deviation: rec.percentageChange,
                    actionable: true,
                    suggestedActions: [
                        rec.type === 'increase'
                            ? `Increase budget to $${rec.recommendedBudget.toFixed(2)}`
                            : `Reduce budget to $${rec.recommendedBudget.toFixed(2)}`
                    ],
                    potentialSavings: rec.type === 'decrease' ? Math.abs(rec.change).toString() : null,
                    timeframe: 'month'
                }).returning();

                insights.push(insight);
            }

            return insights;
        } catch (error) {
            console.error('Failed to generate insights:', error);
            throw error;
        }
    }
}

export default new BudgetAI();
