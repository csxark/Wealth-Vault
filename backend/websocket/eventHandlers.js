/**
 * Event Handlers
 * 
 * Business logic for emitting events on relevant actions
 * These should be called from route handlers and services
 */

import { EventTypes } from './eventTypes.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize event handlers
 * Call this in server.js to set up all event listeners
 */
export function initializeEventHandlers(broadcast, db, tables) {
  /**
   * ============ EXPENSE EVENTS ============
   */

  export const expenseEvents = {
    /**
     * Emit when expense is created
     */
    onExpenseCreated: (expense) => {
      broadcast.toTenant(expense.tenantId, EventTypes.EXPENSE_CREATED, {
        id: expense.id,
        userId: expense.userId,
        amount: parseFloat(expense.amount),
        description: expense.description,
        categoryId: expense.categoryId,
        date: expense.date,
        createdAt: expense.createdAt
      });

      logger.info('Expense created event emitted', {
        expenseId: expense.id,
        tenantId: expense.tenantId
      });
    },

    /**
     * Emit when expense is updated
     */
    onExpenseUpdated: (expenseId, tenantId, changes) => {
      broadcast.toTenant(tenantId, EventTypes.EXPENSE_UPDATED, {
        id: expenseId,
        changes,
        updatedAt: new Date()
      });

      logger.info('Expense updated event emitted', {
        expenseId,
        tenantId,
        changedFields: Object.keys(changes)
      });
    },

    /**
     * Emit when expense is deleted
     */
    onExpenseDeleted: (expense) => {
      broadcast.toTenant(expense.tenantId, EventTypes.EXPENSE_DELETED, {
        id: expense.id,
        userId: expense.userId,
        amount: parseFloat(expense.amount),
        deletedAt: new Date()
      });

      logger.info('Expense deleted event emitted', {
        expenseId: expense.id,
        tenantId: expense.tenantId
      });
    },

    /**
     * Emit when multiple expenses are deleted
     */
    onExpensesBulkDeleted: (tenantId, count) => {
      broadcast.toTenant(tenantId, EventTypes.EXPENSES_BULK_DELETED, {
        count,
        deletedAt: new Date()
      });

      logger.info('Bulk delete event emitted', {
        tenantId,
        count
      });
    }
  };

  /**
   * ============ CATEGORY EVENTS ============
   */

  export const categoryEvents = {
    /**
     * Emit when category is created
     */
    onCategoryCreated: (category) => {
      broadcast.toTenant(category.tenantId, EventTypes.CATEGORY_CREATED, {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        type: category.type,
        createdAt: category.createdAt
      });

      logger.info('Category created event emitted', {
        categoryId: category.id,
        tenantId: category.tenantId
      });
    },

    /**
     * Emit when category is updated
     */
    onCategoryUpdated: (categoryId, tenantId, changes) => {
      broadcast.toTenant(tenantId, EventTypes.CATEGORY_UPDATED, {
        id: categoryId,
        changes,
        updatedAt: new Date()
      });

      logger.info('Category updated event emitted', {
        categoryId,
        tenantId
      });
    },

    /**
     * Emit when category is deleted
     */
    onCategoryDeleted: (categoryId, tenantId) => {
      broadcast.toTenant(tenantId, EventTypes.CATEGORY_DELETED, {
        id: categoryId,
        deletedAt: new Date()
      });

      logger.info('Category deleted event emitted', {
        categoryId,
        tenantId
      });
    }
  };

  /**
   * ============ GOAL EVENTS ============
   */

  export const goalEvents = {
    /**
     * Emit when goal is created
     */
    onGoalCreated: (goal) => {
      broadcast.toTenant(goal.tenantId, EventTypes.GOAL_CREATED, {
        id: goal.id,
        userId: goal.userId,
        title: goal.title,
        targetAmount: parseFloat(goal.targetAmount),
        deadline: goal.deadline,
        createdAt: goal.createdAt
      });

      logger.info('Goal created event emitted', {
        goalId: goal.id,
        tenantId: goal.tenantId
      });
    },

    /**
     * Emit when goal is achieved
     */
    onGoalAchieved: (goal) => {
      broadcast.toTenant(goal.tenantId, EventTypes.GOAL_ACHIEVED, {
        id: goal.id,
        userId: goal.userId,
        title: goal.title,
        targetAmount: parseFloat(goal.targetAmount),
        achievedAt: new Date()
      });

      // Also notify individual user
      broadcast.toUser(goal.userId, 'goal-achievement', {
        goalTitle: goal.title,
        goalId: goal.id
      });

      logger.info('Goal achievement event emitted', {
        goalId: goal.id,
        tenantId: goal.tenantId,
        userId: goal.userId
      });
    },

    /**
     * Emit when milestone is completed
     */
    onMilestoneCompleted: (goalId, tenantId, milestone) => {
      broadcast.toTenant(tenantId, EventTypes.MILESTONE_COMPLETED, {
        goalId,
        milestone,
        completedAt: new Date()
      });

      logger.info('Milestone completed event emitted', {
        goalId,
        tenantId
      });
    }
  };

  /**
   * ============ BUDGET EVENTS ============
   */

  export const budgetEvents = {
    /**
     * Emit budget warning (80% spent)
     */
    onBudgetWarning: (tenantId, userId, categoryName, spent, limit) => {
      const percentage = (spent / limit) * 100;

      broadcast.toTenant(tenantId, EventTypes.BUDGET_WARNING, {
        userId,
        categoryName,
        spent: parseFloat(spent),
        limit: parseFloat(limit),
        percentage: Math.round(percentage),
        warningAt: new Date()
      });

      // Notify user specifically
      broadcast.toUser(userId, 'budget-alert', {
        type: 'warning',
        message: `You've spent ${Math.round(percentage)}% of your ${categoryName} budget`,
        categoryName,
        percentage
      });

      logger.info('Budget warning event emitted', {
        tenantId,
        userId,
        categoryName,
        percentage
      });
    },

    /**
     * Emit budget exceeded
     */
    onBudgetExceeded: (tenantId, userId, categoryName, spent, limit) => {
      const overBy = spent - limit;

      broadcast.toTenant(tenantId, EventTypes.BUDGET_EXCEEDED, {
        userId,
        categoryName,
        spent: parseFloat(spent),
        limit: parseFloat(limit),
        overBy: parseFloat(overBy),
        exceededAt: new Date()
      });

      // Notify user specifically
      broadcast.toUser(userId, 'budget-alert', {
        type: 'exceeded',
        message: `You've exceeded your ${categoryName} budget by ${overBy.toFixed(2)}`,
        categoryName,
        overBy
      });

      logger.info('Budget exceeded event emitted', {
        tenantId,
        userId,
        categoryName,
        overBy
      });
    }
  };

  /**
   * ============ TEAM EVENTS ============
   */

  export const teamEvents = {
    /**
     * Emit when member joins tenant
     */
    onMemberJoined: (tenantId, user, role) => {
      broadcast.toTenant(tenantId, EventTypes.MEMBER_JOINED, {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role,
        joinedAt: new Date()
      });

      logger.info('Member joined event emitted', {
        tenantId,
        userId: user.id,
        email: user.email
      });
    },

    /**
     * Emit when member leaves tenant
     */
    onMemberLeft: (tenantId, userId, memberName) => {
      broadcast.toTenant(tenantId, EventTypes.MEMBER_LEFT, {
        userId,
        memberName,
        leftAt: new Date()
      });

      logger.info('Member left event emitted', {
        tenantId,
        userId
      });
    },

    /**
     * Emit when member role changes
     */
    onMemberRoleChanged: (tenantId, userId, oldRole, newRole, changedBy) => {
      broadcast.toTenant(tenantId, EventTypes.MEMBER_ROLE_CHANGED, {
        userId,
        oldRole,
        newRole,
        changedBy,
        changedAt: new Date()
      });

      // Notify affected user
      broadcast.toUser(userId, 'role-updated', {
        newRole,
        message: `Your role has been changed to ${newRole}`
      });

      logger.info('Member role changed event emitted', {
        tenantId,
        userId,
        newRole
      });
    }
  };

  /**
   * ============ ANALYTICS EVENTS ============
   */

  export const analyticsEvents = {
    /**
     * Emit when monthly report is ready
     */
    onMonthlyReportReady: (tenantId, userId, month, reportUrl, stats) => {
      broadcast.toUser(userId, EventTypes.MONTHLY_REPORT_READY, {
        month,
        reportUrl,
        totalExpenses: parseFloat(stats.totalExpenses),
        avgExpense: parseFloat(stats.avgExpense),
        topCategory: stats.topCategory,
        readyAt: new Date()
      });

      logger.info('Monthly report ready event emitted', {
        tenantId,
        userId,
        month
      });
    },

    /**
     * Emit when analytics are updated
     */
    onAnalyticsUpdated: (tenantId, summary) => {
      broadcast.toTenant(tenantId, EventTypes.ANALYTICS_UPDATED, {
        summary,
        updatedAt: new Date()
      });

      logger.info('Analytics updated event emitted', {
        tenantId
      });
    }
  };

  /**
   * ============ SYNC EVENTS ============
   */

  export const syncEvents = {
    /**
     * Emit when sync starts
     */
    onSyncStarted: (tenantId, syncType) => {
      broadcast.toTenant(tenantId, EventTypes.SYNC_STARTED, {
        syncType,
        startedAt: new Date()
      });

      logger.info('Sync started event emitted', {
        tenantId,
        syncType
      });
    },

    /**
     * Emit when sync completes
     */
    onSyncCompleted: (tenantId, syncType, itemsProcessed) => {
      broadcast.toTenant(tenantId, EventTypes.SYNC_COMPLETED, {
        syncType,
        itemsProcessed,
        completedAt: new Date()
      });

      logger.info('Sync completed event emitted', {
        tenantId,
        syncType,
        itemsProcessed
      });
    }
  };

  /**
   * ============ ERROR EVENTS ============
   */

  export const errorEvents = {
    /**
     * Emit when error occurs
     */
    onErrorOccurred: (tenantId, userId, errorMessage, errorCode) => {
      broadcast.toTenant(tenantId, EventTypes.ERROR_OCCURRED, {
        userId,
        message: errorMessage,
        code: errorCode,
        timestamp: new Date()
      });

      logger.error('Error event emitted', {
        tenantId,
        userId,
        errorCode,
        message: errorMessage
      });
    }
  };

  return {
    expenseEvents,
    categoryEvents,
    goalEvents,
    budgetEvents,
    teamEvents,
    analyticsEvents,
    syncEvents,
    errorEvents
  };
}

export default initializeEventHandlers;
