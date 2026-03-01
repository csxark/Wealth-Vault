/**
 * Smart Recommendations Service
 * Generates AI-driven spending reduction recommendations
 * Implements merchant consolidation analysis and spending pattern insights
 */

import db from '../config/db.js';
import {
    smartRecommendations,
    merchantConsolidationAnalysis,
    expenses,
    categories,
    users
} from '../db/schema-smart-notifications.js';
import { eq, and, gte, lte, desc, sql, gt } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import * as forecastingService from './forecastingService.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'recommendations:';
const MIN_MERCHANTS_FOR_CONSOLIDATION = 3;
const CONSOLIDATION_MIN_SAVINGS_PCT = 5; // Only recommend if 5%+ savings

/**
 * Generate merchant consolidation recommendations
 * Analyzes spending across multiple merchants and recommends consolidation
 */
export const generateMerchantConsolidationRecommendations = async (userId, categoryId, tenantId) => {
    try {
        // Get expenses for last 3 months by merchant
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

        const expensesByMerchant = await db
            .select({
                merchant: expenses.merchant,
                totalSpent: sql`COALESCE(SUM(${expenses.amount}), 0)`,
                transactionCount: sql`COUNT(*)`,
                avgTransaction: sql`COALESCE(AVG(${expenses.amount}), 0)`
            })
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.categoryId, categoryId),
                gte(expenses.date, thirtyDaysAgo),
                eq(expenses.status, 'completed')
            ))
            .groupBy(expenses.merchant)
            .orderBy(desc(sql`SUM(${expenses.amount})`));

        if (!expensesByMerchant || expensesByMerchant.length < MIN_MERCHANTS_FOR_CONSOLIDATION) {
            logger.info('Insufficient merchants for consolidation analysis', {
                userId,
                categoryId,
                merchantCount: expensesByMerchant.length
            });
            return [];
        }

        const recommendations = [];
        const totalSpending = expensesByMerchant.reduce((sum, m) => sum + parseFloat(m.totalSpent), 0);

        // Find top merchant (consolidation target)
        const topMerchant = expensesByMerchant[0];
        const topMerchantSpending = parseFloat(topMerchant.totalSpent);

        // Analyze consolidation opportunity
        let consolidationTargetSpending = topMerchantSpending;
        let estimatedSavings = 0;

        // Calculate potential savings through negotiation/rewards
        for (let i = 1; i < expensesByMerchant.length; i++) {
            const merchant = expensesByMerchant[i];
            const merchantSpending = parseFloat(merchant.totalSpent);
            
            // Estimate 3-5% savings from consolidation (loyalty rewards, bulk discounts)
            const savingsPercentage = 3 + Math.random() * 2;
            const merchantSavings = (merchantSpending * savingsPercentage) / 100;
            estimatedSavings += merchantSavings;
            consolidationTargetSpending += merchantSpending;
        }

        const savingsPercentage = (estimatedSavings / totalSpending) * 100;

        // Only create recommendation if savings meet threshold
        if (savingsPercentage >= CONSOLIDATION_MIN_SAVINGS_PCT) {
            // Check if similar recommendation already exists
            const existingConsolidation = await db.query.merchantConsolidationAnalysis.findFirst({
                where: and(
                    eq(merchantConsolidationAnalysis.userId, userId),
                    eq(merchantConsolidationAnalysis.categoryId, categoryId),
                    eq(merchantConsolidationAnalysis.status, 'identified')
                )
            });

            if (!existingConsolidation) {
                // Create consolidation analysis record
                const consolidationAnalysis = await db.insert(merchantConsolidationAnalysis).values({
                    tenantId,
                    userId,
                    categoryId,
                    primaryMerchant: topMerchant.merchant,
                    alternateMerchants: expensesByMerchant.slice(1).map(m => m.merchant),
                    totalCurrentSpending: totalSpending.toString(),
                    consolidationTargetSpending: consolidationTargetSpending.toString(),
                    estimatedSavings: estimatedSavings.toString(),
                    savingsPercentage: savingsPercentage.toFixed(2),
                    status: 'identified',
                    merchantCounts: expensesByMerchant.reduce((acc, m) => {
                        acc[m.merchant] = parseInt(m.transactionCount);
                        return acc;
                    }, {}),
                    consolidationStrategy: {
                        approach: 'consolidate_merchants',
                        targetMerchant: topMerchant.merchant,
                        strategy: 'Focus all purchases on top merchant for loyalty rewards and bulk discounts',
                        estimatedImplementationDays: 30
                    }
                }).returning();

                // Create recommendation
                const recommendation = await db.insert(smartRecommendations).values({
                    tenantId,
                    userId,
                    categoryId,
                    recommendationType: 'merchant_consolidation',
                    title: `Consolidate ${topMerchant.merchant} spending`,
                    description: `Consolidate purchases across ${expensesByMerchant.length} different merchants to ${topMerchant.merchant} for better rewards and discounts. Save an estimated $${estimatedSavings.toFixed(2)}/month.`,
                    estimatedMonthlySavings: estimatedSavings.toString(),
                    savingsPercentage: savingsPercentage.toFixed(2),
                    savingsConfidenceScore: 0.85,
                    actionItems: [
                        `Switch all ${categoryId} purchases to ${topMerchant.merchant}`,
                        `Join loyalty program at ${topMerchant.merchant} if available`,
                        `Set reminders to consolidate scattered purchases`,
                        'Monitor monthly savings from consolidation'
                    ],
                    implementationDifficulty: 'easy',
                    timeToImplementDays: 7,
                    supportingData: {
                        merchantBreakdown: expensesByMerchant.map(m => ({
                            merchant: m.merchant,
                            spending: parseFloat(m.totalSpent),
                            transactions: parseInt(m.transactionCount),
                            avgTransaction: parseFloat(m.avgTransaction)
                        })),
                        period: '90_days',
                        totalSpending
                    },
                    benchmarkData: {
                        industryAverage: totalSpending / 3, // Simplified
                        peerComparison: 'Above average merchant fragmentation',
                        consolidationBenefit: 'High'
                    },
                    status: 'suggested',
                    priorityScore: 0.85,
                    relevanceScore: 0.90,
                    generatedBy: 'merchant_consolidation_analysis',
                    analysisVersion: '1.0'
                }).returning();

                recommendations.push({
                    type: 'merchant_consolidation',
                    recommendation: recommendation[0],
                    analysis: consolidationAnalysis[0]
                });
            }
        }

        return recommendations;
    } catch (error) {
        logger.error('Error generating merchant consolidation recommendations', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

/**
 * Generate spending pattern insights and budget optimization recommendations
 */
export const generateSpendingPatternInsights = async (userId, categoryId, tenantId) => {
    try {
        // Get spending data for last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // Get monthly spending trends
        const monthlyData = await db
            .select({
                month: sql`DATE_TRUNC('month', ${expenses.date})`,
                totalSpent: sql`SUM(${expenses.amount})`,
                transactionCount: sql`COUNT(*)`
            })
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.categoryId, categoryId),
                gte(expenses.date, sixMonthsAgo),
                eq(expenses.status, 'completed')
            ))
            .groupBy(sql`DATE_TRUNC('month', ${expenses.date})`)
            .orderBy(sql`DATE_TRUNC('month', ${expenses.date})`);

        if (!monthlyData || monthlyData.length < 3) {
            logger.info('Insufficient data for spending pattern analysis', {
                userId,
                categoryId
            });
            return [];
        }

        // Convert to numeric values
        const monthlySpending = monthlyData.map(m => parseFloat(m.totalSpent));
        const avgMonthly = monthlySpending.reduce((a, b) => a + b, 0) / monthlySpending.length;
        const maxMonthly = Math.max(...monthlySpending);
        const minMonthly = Math.min(...monthlySpending);

        // Calculate trend
        const recentMonths = monthlySpending.slice(-3);
        const olderMonths = monthlySpending.slice(0, -3);
        const recentAvg = recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length;
        const olderAvg = olderMonths.reduce((a, b) => a + b, 0) / olderMonths.length;
        const trendPercentage = ((recentAvg - olderAvg) / olderAvg) * 100;

        const recommendations = [];

        // Recommendation 1: If spending increasing, suggest budget review
        if (trendPercentage > 10) {
            const recommendation = await db.insert(smartRecommendations).values({
                tenantId,
                userId,
                categoryId,
                recommendationType: 'spending_pattern',
                title: 'Spending trend increasing',
                description: `Your ${categories.name} spending has increased ${trendPercentage.toFixed(1)}% over the past 3 months. Consider reviewing your budget or identifying cost-saving opportunities.`,
                estimatedMonthlySavings: ((recentAvg - avgMonthly) * 0.5).toString(), // Conservative 50% reduction potential
                savingsPercentage: ((recentAvg - avgMonthly) / recentAvg * 100 * 0.5).toFixed(2),
                savingsConfidenceScore: 0.60,
                actionItems: [
                    'Review recent transactions for unusual purchases',
                    'Identify behavior changes that led to increased spending',
                    'Set a stricter monthly budget',
                    'Track daily spending to catch overruns early'
                ],
                implementationDifficulty: 'moderate',
                timeToImplementDays: 14,
                supportingData: {
                    recentAvg: recentAvg.toFixed(2),
                    historicalAvg: avgMonthly.toFixed(2),
                    trendPercentage: trendPercentage.toFixed(1),
                    monthlyData: monthlySpending.map(s => parseFloat(s).toFixed(2))
                },
                status: 'suggested',
                priorityScore: 0.75,
                relevanceScore: 0.80,
                generatedBy: 'trend_detection',
                analysisVersion: '1.0'
            }).returning();

            recommendations.push({
                type: 'spending_pattern',
                recommendation: recommendation[0]
            });
        }

        // Recommendation 2: High volatility suggestion
        const stdDev = Math.sqrt(
            monthlySpending.reduce((sum, val) => sum + Math.pow(val - avgMonthly, 2), 0) / monthlySpending.length
        );
        const coefficientOfVariation = stdDev / avgMonthly;

        if (coefficientOfVariation > 0.3) {
            const recommendation = await db.insert(smartRecommendations).values({
                tenantId,
                userId,
                categoryId,
                recommendationType: 'spending_pattern',
                title: 'High spending volatility detected',
                description: `Your ${categoryId} spending varies significantly month-to-month. Setting a budget with adjustment for variability could help you plan better.`,
                estimatedMonthlySavings: '0',
                savingsPercentage: null,
                savingsConfidenceScore: 0.70,
                actionItems: [
                    'Identify triggers for high-spending months',
                    'Set monthly budget with 20% buffer for volatility',
                    'Use weekly spending checks instead of monthly',
                    'Plan for seasonal variations in advance'
                ],
                implementationDifficulty: 'easy',
                timeToImplementDays: 3,
                supportingData: {
                    avgMonthly: avgMonthly.toFixed(2),
                    stdDev: stdDev.toFixed(2),
                    coefficientOfVariation: coefficientOfVariation.toFixed(2),
                    maxMonthly: maxMonthly.toFixed(2),
                    minMonthly: minMonthly.toFixed(2)
                },
                status: 'suggested',
                priorityScore: 0.65,
                relevanceScore: 0.75,
                generatedBy: 'volatility_analysis',
                analysisVersion: '1.0'
            }).returning();

            recommendations.push({
                type: 'volatility_warning',
                recommendation: recommendation[0]
            });
        }

        return recommendations;
    } catch (error) {
        logger.error('Error generating spending pattern insights', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

/**
 * Get all recommendations for a user
 */
export const getRecommendations = async (userId, filters = {}) => {
    try {
        const { categoryId = null, status = 'suggested', limit = 20, offset = 0 } = filters;
        const cacheKey = `${CACHE_PREFIX}${userId}:${categoryId || 'all'}:${status}`;

        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const where = status
            ? and(eq(smartRecommendations.userId, userId), eq(smartRecommendations.status, status))
            : eq(smartRecommendations.userId, userId);

        const recommendations = await db.query.smartRecommendations.findMany({
            where: categoryId
                ? and(where, eq(smartRecommendations.categoryId, categoryId))
                : where,
            orderBy: [
                desc(smartRecommendations.priorityScore),
                desc(smartRecommendations.createdAt)
            ],
            limit,
            offset
        });

        // Cache for 1 hour
        await cacheService.set(cacheKey, recommendations, 3600);

        return recommendations;
    } catch (error) {
        logger.error('Error retrieving recommendations', {
            error: error.message,
            userId
        });
        throw error;
    }
};

/**
 * Accept or implement a recommendation
 */
export const acceptRecommendation = async (recommendationId, userId) => {
    try {
        const updated = await db.update(smartRecommendations)
            .set({
                status: 'accepted',
                implementedAt: new Date(),
                updatedAt: new Date()
            })
            .where(and(
                eq(smartRecommendations.id, recommendationId),
                eq(smartRecommendations.userId, userId)
            ))
            .returning();

        if (updated.length > 0) {
            await cacheService.delete(`${CACHE_PREFIX}${userId}`);
        }

        return updated[0];
    } catch (error) {
        logger.error('Error accepting recommendation', {
            error: error.message,
            recommendationId,
            userId
        });
        throw error;
    }
};

/**
 * Dismiss a recommendation
 */
export const dismissRecommendation = async (recommendationId, userId, reason = null) => {
    try {
        const updated = await db.update(smartRecommendations)
            .set({
                status: 'dismissed',
                dismissedAt: new Date(),
                userFeedback: reason,
                updatedAt: new Date()
            })
            .where(and(
                eq(smartRecommendations.id, recommendationId),
                eq(smartRecommendations.userId, userId)
            ))
            .returning();

        if (updated.length > 0) {
            await cacheService.delete(`${CACHE_PREFIX}${userId}`);
        }

        return updated[0];
    } catch (error) {
        logger.error('Error dismissing recommendation', {
            error: error.message,
            recommendationId,
            userId
        });
        throw error;
    }
};

/**
 * Get merchant consolidation analysis for a category
 */
export const getMerchantConsolidationAnalysis = async (userId, categoryId) => {
    try {
        const analysis = await db.query.merchantConsolidationAnalysis.findMany({
            where: and(
                eq(merchantConsolidationAnalysis.userId, userId),
                eq(merchantConsolidationAnalysis.categoryId, categoryId)
            ),
            orderBy: desc(merchantConsolidationAnalysis.estimatedSavings)
        });

        return analysis;
    } catch (error) {
        logger.error('Error retrieving merchant consolidation analysis', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

export default {
    generateMerchantConsolidationRecommendations,
    generateSpendingPatternInsights,
    getRecommendations,
    acceptRecommendation,
    dismissRecommendation,
    getMerchantConsolidationAnalysis
};
