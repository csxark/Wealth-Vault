/**
 * Smart Alerts Event Handler
 * Handles real-time evaluation and triggering of smart budget alerts when expenses occur
 * Integrates with the outbox pattern for reliable event processing
 */

import * as smartNotificationsService from './smartNotificationsService.js';
import * as smartRecommendationsService from './smartRecommendationsService.js';
import * as smartBenchmarkingService from './smartBenchmarkingService.js';
import * as cacheService from './cacheService.js';
import db from '../config/db.js';
import { categories, budgets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger.js';

/**
 * Handle expense creation/update event and trigger smart alerts
 * Called by the outbox dispatcher when expense events are published
 */
export const handleSmartAlertEvent = async (event) => {
  try {
    const { eventType, payload } = event;

    if (eventType === 'expense.created' || eventType === 'expense.updated') {
      const { tenantId, userId, categoryId, amount, merchant } = payload;

      logger.info('Processing expense event for smart alerts', {
        eventType,
        userId,
        categoryId,
        amount,
        merchant
      });

      // Get category info including budget
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, categoryId)
      });

      if (!category) {
        logger.warn('Category not found for alert processing', { categoryId });
        return {
          success: false,
          error: 'Category not found'
        };
      }

      // Get user's budget for this category
      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.categoryId, categoryId)
      });

      if (!budget) {
        logger.debug('No budget configured for category', { categoryId });
        return {
          success: false,
          error: 'No budget configured'
        };
      }

      // Compute current spending for the period
      const aggregate = await computeCurrentSpending(userId, categoryId);

      if (!aggregate) {
        logger.warn('Failed to compute spending aggregate', { userId, categoryId });
        return {
          success: false,
          error: 'Failed to compute aggregate'
        };
      }

      // Evaluate smart alert rules
      const triggeredAlerts = await smartNotificationsService.evaluateSmartAlerts(
        userId,
        categoryId,
        aggregate.totalSpent,
        parseFloat(budget.amount),
        tenantId
      );

      // Generate recommendations if spending pattern changed significantly
      if (shouldGenerateRecommendations(amount, aggregate.totalSpent, parseFloat(budget.amount))) {
        await generateRecommendationsAsync(userId, categoryId, tenantId);
      }

      // Update user spending profile for benchmarking
      await updateSpendingProfileAsync(userId, categoryId, tenantId);

      logger.info('Smart alerts processed', {
        userId,
        categoryId,
        alertsTriggered: triggeredAlerts.length,
        currentSpent: aggregate.totalSpent
      });

      return {
        success: true,
        alertsFired: triggeredAlerts.length,
        aggregate
      };
    }

    if (eventType === 'expense.deleted') {
      const { userId, categoryId } = payload;

      logger.info('Expense deleted, recomputing smart alerts', {
        userId,
        categoryId
      });

      // Invalidate aggregate cache
      await cacheService.delete(`smart_notifications:${userId}:rules:${categoryId}`);

      // Recompute aggregate
      const aggregate = await computeCurrentSpending(userId, categoryId);

      return {
        success: true,
        aggregate
      };
    }

    return {
      success: false,
      error: `Unknown event type: ${eventType}`
    };
  } catch (error) {
    logger.error('Error handling smart alert event', {
      error: error.message,
      event
    });
    throw error;
  }
};

/**
 * Compute current spending for a category in the current period
 */
const computeCurrentSpending = async (userId, categoryId) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // This would be implemented using the budgetAlertService
    // For now, return a placeholder that would need to be filled in
    const aggregate = {
      userId,
      categoryId,
      period: 'monthly',
      periodStart: monthStart.toISOString(),
      periodEnd: monthEnd.toISOString(),
      totalSpent: 0, // Would be computed from expenses
      totalCount: 0,
      avgTransaction: 0
    };

    return aggregate;
  } catch (error) {
    logger.error('Error computing current spending', {
      error: error.message,
      userId,
      categoryId
    });
    return null;
  }
};

/**
 * Determine if we should generate new recommendations
 * Generate when spending reaches significant thresholds
 */
const shouldGenerateRecommendations = (newExpense, currentSpent, budgetAmount) => {
  const spendingPercentage = (currentSpent / budgetAmount) * 100;

  // Generate recommendations at key thresholds
  return spendingPercentage > 60 && spendingPercentage < 65; // First time after 60%
};

/**
 * Generate recommendations asynchronously (non-blocking)
 */
const generateRecommendationsAsync = async (userId, categoryId, tenantId) => {
  try {
    // Schedule async generation
    setImmediate(async () => {
      await smartRecommendationsService.generateMerchantConsolidationRecommendations(
        userId,
        categoryId,
        tenantId
      );

      await smartRecommendationsService.generateSpendingPatternInsights(
        userId,
        categoryId,
        tenantId
      );

      logger.info('Recommendations generated', { userId, categoryId });
    });
  } catch (error) {
    logger.error('Error in async recommendation generation', {
      error: error.message,
      userId,
      categoryId
    });
  }
};

/**
 * Update spending profile asynchronously
 */
const updateSpendingProfileAsync = async (userId, categoryId, tenantId) => {
  try {
    setImmediate(async () => {
      await smartBenchmarkingService.createUserSpendingProfile(
        userId,
        categoryId,
        tenantId
      );

      logger.debug('Spending profile updated', { userId, categoryId });
    });
  } catch (error) {
    logger.error('Error updating spending profile', {
      error: error.message,
      userId,
      categoryId
    });
  }
};

/**
 * Scheduled batch processing of smart alerts
 * Run periodically to evaluate all active rules and send summaries
 */
export const processScheduledSmartAlerts = async () => {
  try {
    logger.info('Starting scheduled smart alert processing');

    // This would query all active smart alert rules
    // and recompute spending for each one
    // Then send daily/weekly summaries as configured

    logger.info('Scheduled smart alert processing completed');
  } catch (error) {
    logger.error('Error in scheduled smart alert processing', {
      error: error.message
    });
  }
};

export default {
  handleSmartAlertEvent,
  processScheduledSmartAlerts
};
