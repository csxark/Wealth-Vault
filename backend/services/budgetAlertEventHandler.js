/**
 * Budget Alert Event Handler
 * 
 * Handles event-driven budget alert triggers when expenses are created/updated
 * Integrates with outbox pattern for reliable event processing
 */

import budgetAlertService from './budgetAlertService.js';
import * as cacheService from './cacheService.js';
import logger from '../utils/logger.js';

/**
 * Process outbox event for budget alert evaluation
 * Called by the outbox dispatcher when expense events are published
 */
export const handleExpenseEvent = async (event) => {
  try {
    const { eventType, payload } = event;

    if (eventType === 'expense.created' || eventType === 'expense.updated') {
      const { tenantId, userId, categoryId, amount } = payload;

      logger.info('Processing expense event for budget alerts', {
        eventType,
        userId,
        categoryId,
        amount,
      });

      // Invalidate cache for this category to trigger fresh computation
      await budgetAlertService.invalidateAggregateCache(userId, categoryId);

      // Recompute aggregate for current period
      const aggregate = await budgetAlertService.computeBudgetAggregate(userId, categoryId, 'monthly', tenantId);

      if (!aggregate) {
        logger.warn('Failed to compute aggregate after expense event', {
          userId,
          categoryId,
        });
        return;
      }

      // Evaluate all budget alerts for this category
      const firedAlerts = await budgetAlertService.evaluateBudgetAlert(
        tenantId,
        userId,
        categoryId,
        aggregate.totalSpent
      );

      if (firedAlerts.length > 0) {
        logger.info('Budget alerts fired', {
          userId,
          categoryId,
          count: firedAlerts.length,
          alerts: firedAlerts.map(a => a.alertType),
        });
      }

      return {
        success: true,
        alertsFired: firedAlerts.length,
        aggregate,
      };
    }

    if (eventType === 'expense.deleted') {
      const { userId, categoryId } = payload;

      // Invalidate and recompute on deletion
      await budgetAlertService.invalidateAggregateCache(userId, categoryId);
      const aggregate = await budgetAlertService.computeBudgetAggregate(userId, categoryId, 'monthly');

      logger.info('Expense deleted, cache invalidated', {
        userId,
        categoryId,
      });

      return {
        success: true,
        aggregate,
      };
    }

    return {
      success: false,
      error: `Unknown event type: ${eventType}`,
    };
  } catch (error) {
    logger.error('Error handling expense event for budget alerts', {
      error: error.message,
      event,
    });
    throw error;
  }
};

/**
 * Process scheduled refresh of materialized views
 * Called by scheduler (e.g., every 30 minutes)
 */
export const handleScheduledMaterializationRefresh = async (tenantId = null) => {
  try {
    logger.info('Starting scheduled materialized view refresh', { tenantId });

    const result = await budgetAlertService.refreshStaleMaterializedViews(tenantId);

    logger.info('Scheduled refresh completed', {
      tenantId,
      refreshedCount: result.refreshedCount,
      totalStale: result.totalStale,
    });

    return result;
  } catch (error) {
    logger.error('Error in scheduled materialized view refresh', {
      error: error.message,
      tenantId,
    });
    throw error;
  }
};

/**
 * Handle deduplication cleanup
 * Called by scheduler to clean expired deduplication entries
 */
export const handleDeduplicationCleanup = async () => {
  try {
    const db = require('../config/db.js').default;
    const { alertDeduplication } = require('../db/schema.js');
    const { lt } = require('drizzle-orm');

    const now = new Date();
    const deleted = await db
      .delete(alertDeduplication)
      .where(lt(alertDeduplication.expiresAt, now));

    logger.info('Deduplication entries cleaned up', {
      deletedCount: deleted.rowCount || 0,
    });

    return {
      success: true,
      deletedCount: deleted.rowCount || 0,
    };
  } catch (error) {
    logger.error('Error in deduplication cleanup', {
      error: error.message,
    });
    throw error;
  }
};

export default {
  handleExpenseEvent,
  handleScheduledMaterializationRefresh,
  handleDeduplicationCleanup,
};
