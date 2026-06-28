/**
 * Smart Benchmarking Service
 * Provides peer comparison and spending benchmarks for user categories
 * Helps users understand how their spending compares to similar cohorts
 */

import db from '../config/db.js';
import {
    spendingBenchmarks,
    userSpendingProfiles,
    expenses,
    categories,
    users
} from '../db/schema-smart-notifications.js';
import { eq, and, gte, desc, sql, ne } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'benchmarks:';
const MIN_PEERS_FOR_BENCHMARK = 5;

/**
 * Calculate spending benchmarks for a category across all users
 * Creates cohort-based comparisons
 */
export const calculateCategoryBenchmarks = async (categoryId, tenantId, period = 'monthly') => {
    try {
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        // Get all users' spending for this category in the current month
        const allUserSpending = await db
            .select({
                userId: expenses.userId,
                totalSpent: sql`SUM(${expenses.amount})`,
                transactionCount: sql`COUNT(${expenses.id})`,
                avgTransaction: sql`AVG(${expenses.amount})`
            })
            .from(expenses)
            .where(and(
                eq(expenses.categoryId, categoryId),
                eq(expenses.status, 'completed'),
                // Current month
                gte(expenses.date, new Date(today.getFullYear(), today.getMonth(), 1))
            ))
            .groupBy(expenses.userId)
            .orderBy(desc(sql`SUM(${expenses.amount})`));

        if (!allUserSpending || allUserSpending.length < MIN_PEERS_FOR_BENCHMARK) {
            logger.warn('Insufficient users for benchmarking', {
                categoryId,
                userCount: allUserSpending?.length || 0
            });
            return null;
        }

        // Convert to numeric and sort
        const spendingValues = allUserSpending
            .map(u => parseFloat(u.totalSpent))
            .filter(v => v > 0)
            .sort((a, b) => a - b);

        // Calculate statistics
        const avgSpending = spendingValues.reduce((a, b) => a + b, 0) / spendingValues.length;
        const medianSpending = spendingValues[Math.floor(spendingValues.length / 2)];
        const stdDev = Math.sqrt(
            spendingValues.reduce((sum, val) => sum + Math.pow(val - avgSpending, 2), 0) / spendingValues.length
        );

        // Calculate percentiles
        const percentile10 = spendingValues[Math.floor(spendingValues.length * 0.1)];
        const percentile25 = spendingValues[Math.floor(spendingValues.length * 0.25)];
        const percentile75 = spendingValues[Math.floor(spendingValues.length * 0.75)];
        const percentile90 = spendingValues[Math.floor(spendingValues.length * 0.9)];

        // Check for previous month's benchmark to calculate trend
        const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const previousMonthStr = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;

        const previousBenchmark = await db.query.spendingBenchmarks.findFirst({
            where: and(
                eq(spendingBenchmarks.categoryId, categoryId),
                eq(spendingBenchmarks.benchmarkMonthYear, previousMonthStr),
                eq(spendingBenchmarks.period, 'monthly')
            )
        });

        const monthOverMonthChange = previousBenchmark
            ? ((avgSpending - parseFloat(previousBenchmark.averageSpending)) / parseFloat(previousBenchmark.averageSpending) * 100)
            : 0;

        // Determine trend direction
        let trendDirection = 'stable';
        if (monthOverMonthChange > 5) {
            trendDirection = 'increasing';
        } else if (monthOverMonthChange < -5) {
            trendDirection = 'decreasing';
        }

        // Store benchmark
        const benchmark = await db.insert(spendingBenchmarks).values({
            tenantId,
            categoryId,
            benchmarkName: `Overall Category Benchmark`,
            benchmarkDescription: `Spending patterns for ${categoryId} across all users`,
            cohortSize: spendingValues.length,
            demographicCriteria: { type: 'all_users' },
            averageSpending: avgSpending.toFixed(2),
            medianSpending: medianSpending.toFixed(2),
            percentile10: percentile10?.toFixed(2),
            percentile25: percentile25?.toFixed(2),
            percentile75: percentile75?.toFixed(2),
            percentile90: percentile90?.toFixed(2),
            stdDeviation: stdDev.toFixed(2),
            period,
            benchmarkMonthYear: currentMonth,
            trendDirection,
            monthOverMonthChange: monthOverMonthChange.toFixed(2),
            dataQualityScore: 0.95,
            lastUpdatedAt: new Date()
        }).returning();

        logger.info('Category benchmark calculated', {
            categoryId,
            avgSpending: avgSpending.toFixed(2),
            cohortSize: spendingValues.length
        });

        return benchmark[0];
    } catch (error) {
        logger.error('Error calculating category benchmarks', {
            error: error.message,
            categoryId
        });
        throw error;
    }
};

/**
 * Create user spending profile for benchmarking
 * Aggregates user's spending data by category
 */
export const createUserSpendingProfile = async (userId, categoryId, tenantId, demographics = {}) => {
    try {
        // Get spending data for last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const monthlyData = await db
            .select({
                month: sql`DATE_TRUNC('month', ${expenses.date})`,
                totalSpent: sql`SUM(${expenses.amount})`,
                transactionCount: sql`COUNT(${expenses.id})`,
                avgTransaction: sql`AVG(${expenses.amount})`
            })
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.categoryId, categoryId),
                gte(expenses.date, threeMonthsAgo),
                eq(expenses.status, 'completed')
            ))
            .groupBy(sql`DATE_TRUNC('month', ${expenses.date})`)
            .orderBy(sql`DATE_TRUNC('month', ${expenses.date})`);

        if (!monthlyData || monthlyData.length === 0) {
            logger.warn('No spending data for user profile', { userId, categoryId });
            return null;
        }

        // Get top merchants
        const topMerchants = await db
            .select({
                merchant: expenses.merchant,
                totalSpent: sql`SUM(${expenses.amount})`
            })
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.categoryId, categoryId),
                gte(expenses.date, threeMonthsAgo),
                eq(expenses.status, 'completed')
            ))
            .groupBy(expenses.merchant)
            .orderBy(desc(sql`SUM(${expenses.amount})`))
            .limit(5);

        // Calculate statistics
        const monthlySpending = monthlyData.map(m => parseFloat(m.totalSpent));
        const averageMonthlySpendin = monthlySpending.reduce((a, b) => a + b, 0) / monthlySpending.length;
        const totalTransactions = monthlyData.reduce((sum, m) => sum + parseInt(m.transactionCount), 0);
        const avgTransactionSize = monthlyData.reduce((sum, m) => sum + parseFloat(m.avgTransaction), 0) / monthlyData.length;

        // Calculate trend (last month vs first month)
        const spendingTrend = monthlySpending.length > 1
            ? ((monthlySpending[monthlySpending.length - 1] - monthlySpending[0]) / monthlySpending[0] * 100)
            : 0;

        // Calculate volatility
        const avgMonthly = averageMonthlySpendin;
        const volatility = Math.sqrt(
            monthlySpending.reduce((sum, val) => sum + Math.pow(val - avgMonthly, 2), 0) / monthlySpending.length
        );

        // Get benchmark for comparison
        const benchmark = await db.query.spendingBenchmarks.findFirst({
            where: and(
                eq(spendingBenchmarks.categoryId, categoryId),
                eq(spendingBenchmarks.period, 'monthly')
            ),
            orderBy: desc(spendingBenchmarks.createdAt),
            limit: 1
        });

        let benchmarkPercentile = 50; // Default to median
        let isOutlier = false;

        if (benchmark) {
            const userPercentile = calculatePercentile(
                averageMonthlySpendin,
                parseFloat(benchmark.averageSpending),
                parseFloat(benchmark.stdDeviation)
            );
            benchmarkPercentile = userPercentile;
            isOutlier = userPercentile < 10 || userPercentile > 90;
        }

        // Calculate top merchants percentage
        const topMerchantsTotal = topMerchants.reduce((sum, m) => sum + parseFloat(m.totalSpent), 0);
        const topMerchantsPercentage = (topMerchantsTotal / (averageMonthlySpendin * monthlySpending.length) * 100);

        // Create or update profile
        const profile = await db
            .insert(userSpendingProfiles)
            .values({
                tenantId,
                userId,
                categoryId,
                ageRange: demographics.ageRange,
                householdIncomeRange: demographics.householdIncomeRange,
                familyStatus: demographics.familyStatus,
                location: demographics.location,
                period: 'monthly',
                averageMonthlySpendin: averageMonthlySpendin.toString(),
                averageTransactionSize: avgTransactionSize.toString(),
                transactionFrequency: Math.round(totalTransactions / monthlySpending.length),
                spendingTrend: spendingTrend.toFixed(2),
                volatility: volatility.toFixed(2),
                topMerchants: topMerchants.map(m => ({
                    merchant: m.merchant,
                    spending: parseFloat(m.totalSpent).toFixed(2)
                })),
                topMerchantsPercentage: topMerchantsPercentage.toFixed(2),
                benchmarkPercentile: benchmarkPercentile.toFixed(2),
                isOutlier
            })
            .onConflictDoUpdate({
                target: [userSpendingProfiles.userId, userSpendingProfiles.categoryId],
                set: {
                    averageMonthlySpendin: averageMonthlySpendin.toString(),
                    spendingTrend: spendingTrend.toFixed(2),
                    volatility: volatility.toFixed(2),
                    benchmarkPercentile: benchmarkPercentile.toFixed(2),
                    isOutlier,
                    updatedAt: new Date()
                }
            })
            .returning();

        logger.info('User spending profile created', {
            userId,
            categoryId,
            averageMonthly: averageMonthlySpendin,
            benchmarkPercentile
        });

        return profile[0];
    } catch (error) {
        logger.error('Error creating user spending profile', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

/**
 * Calculate which percentile the user is in compared to peers
 */
const calculatePercentile = (userSpending, avgSpending, stdDev) => {
    if (stdDev === 0) return 50;

    // Simplified percentile calculation using z-score
    const zScore = (userSpending - avgSpending) / stdDev;
    
    // Approximation of normal distribution CDF
    const percentile = 50 + 34.1 * (zScore > 0 ? 1 : -1) * Math.tanh(Math.abs(zScore) / 2);
    
    return Math.max(0, Math.min(100, Math.round(percentile)));
};

/**
 * Get spending benchmarks for a category with filters
 */
export const getBenchmarks = async (categoryId, tenantId, filters = {}) => {
    try {
        const { period = 'monthly', demographicCriteria = null } = filters;
        const cacheKey = `${CACHE_PREFIX}${categoryId}:${period}`;

        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const benchmarks = await db.query.spendingBenchmarks.findMany({
            where: and(
                eq(spendingBenchmarks.categoryId, categoryId),
                eq(spendingBenchmarks.period, period)
            ),
            orderBy: desc(spendingBenchmarks.benchmarkMonthYear)
        });

        // Cache for 24 hours (benchmarks are relatively stable)
        await cacheService.set(cacheKey, benchmarks, 86400);

        return benchmarks;
    } catch (error) {
        logger.error('Error retrieving benchmarks', {
            error: error.message,
            categoryId
        });
        throw error;
    }
};

/**
 * Compare user's spending to peers in their cohort
 */
export const compareToPheer = async (userId, categoryId, tenantId) => {
    try {
        const cacheKey = `${CACHE_PREFIX}${userId}:${categoryId}:peer_comparison`;
        
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Get user's profile
        const userProfile = await db.query.userSpendingProfiles.findFirst({
            where: and(
                eq(userSpendingProfiles.userId, userId),
                eq(userSpendingProfiles.categoryId, categoryId)
            )
        });

        if (!userProfile) {
            return null;
        }

        // Get category benchmark
        const benchmark = await db.query.spendingBenchmarks.findFirst({
            where: and(
                eq(spendingBenchmarks.categoryId, categoryId),
                eq(spendingBenchmarks.period, 'monthly')
            ),
            orderBy: desc(spendingBenchmarks.createdAt),
            limit: 1
        });

        if (!benchmark) {
            return null;
        }

        const userSpending = parseFloat(userProfile.averageMonthlySpendin);
        const avgSpending = parseFloat(benchmark.averageSpending);
        const medianSpending = parseFloat(benchmark.medianSpending);

        const comparison = {
            userSpending,
            avgSpending,
            medianSpending,
            percentile: parseFloat(userProfile.benchmarkPercentile),
            isOutlier: userProfile.isOutlier,
            comparison: {
                vsAverage: userSpending > avgSpending ? 'above' : 'below',
                vsAverageAmount: Math.abs(userSpending - avgSpending).toFixed(2),
                vsAveragePct: ((Math.abs(userSpending - avgSpending) / avgSpending) * 100).toFixed(1),
                vsMedian: userSpending > medianSpending ? 'above' : 'below',
                vsMedianAmount: Math.abs(userSpending - medianSpending).toFixed(2)
            },
            insight: userProfile.isOutlier
                ? `Your spending is significantly different from peers. You're in the ${Math.round(userProfile.benchmarkPercentile)}th percentile.`
                : `Your spending is typical for this category. You're around the ${Math.round(userProfile.benchmarkPercentile)}th percentile.`,
            benchmark
        };

        // Cache for 1 hour
        await cacheService.set(cacheKey, comparison, 3600);

        return comparison;
    } catch (error) {
        logger.error('Error comparing to peers', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

/**
 * Get user spending profile
 */
export const getUserSpendingProfile = async (userId, categoryId) => {
    try {
        const profile = await db.query.userSpendingProfiles.findFirst({
            where: and(
                eq(userSpendingProfiles.userId, userId),
                eq(userSpendingProfiles.categoryId, categoryId)
            )
        });

        return profile;
    } catch (error) {
        logger.error('Error retrieving user spending profile', {
            error: error.message,
            userId,
            categoryId
        });
        throw error;
    }
};

export default {
    calculateCategoryBenchmarks,
    createUserSpendingProfile,
    getBenchmarks,
    compareToPheer,
    getUserSpendingProfile
};
