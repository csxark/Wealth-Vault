/**
 * Event Types & Schemas
 * 
 * Defines all event types that can be broadcast across the system
 */

export const EventTypes = {
  // Expense Events
  EXPENSE_CREATED: 'expense:created',
  EXPENSE_UPDATED: 'expense:updated',
  EXPENSE_DELETED: 'expense:deleted',
  EXPENSE_ARCHIVED: 'expense:archived',
  EXPENSES_BULK_DELETED: 'expenses:bulk-deleted',

  // Category Events
  CATEGORY_CREATED: 'category:created',
  CATEGORY_UPDATED: 'category:updated',
  CATEGORY_DELETED: 'category:deleted',
  CATEGORY_REORDERED: 'category:reordered',

  // Goal Events
  GOAL_CREATED: 'goal:created',
  GOAL_UPDATED: 'goal:updated',
  GOAL_ACHIEVED: 'goal:achieved',
  GOAL_DELETED: 'goal:deleted',
  MILESTONE_ADDED: 'milestone:added',
  MILESTONE_COMPLETED: 'milestone:completed',

  // Budget Events
  BUDGET_WARNING: 'budget:warning',
  BUDGET_EXCEEDED: 'budget:exceeded',
  CATEGORY_BUDGET_EXCEEDED: 'category-budget:exceeded',

  // Team Events
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  MEMBER_ROLE_CHANGED: 'member:role-changed',
  MEMBER_INVITED: 'member:invited',

  // Tenant Events
  TENANT_CREATED: 'tenant:created',
  TENANT_UPDATED: 'tenant:updated',
  TENANT_SETTINGS_CHANGED: 'tenant:settings-changed',

  // User Events
  USER_UPDATED: 'user:updated',
  USER_PREFERENCES_CHANGED: 'user:preferences-changed',

  // Transaction Events
  RECURRING_TRANSACTION_PROCESSED: 'recurring:processed',

  // Analytics Events
  MONTHLY_REPORT_READY: 'report:monthly-ready',
  ANALYTICS_UPDATED: 'analytics:updated',

  // Notification Events
  NOTIFICATION_CREATED: 'notification:created',
  NOTIFICATION_DISMISSED: 'notification:dismissed',

  // System Events
  SYNC_STARTED: 'sync:started',
  SYNC_COMPLETED: 'sync:completed',
  ERROR_OCCURRED: 'error:occurred'
};

/**
 * Event Payload Schemas
 */
export const EventSchemas = {
  // Expense Created
  [EventTypes.EXPENSE_CREATED]: {
    id: 'string',
    tenantId: 'string',
    userId: 'string',
    amount: 'number',
    description: 'string',
    categoryId: 'string?',
    date: 'date',
    createdAt: 'date'
  },

  // Expense Updated
  [EventTypes.EXPENSE_UPDATED]: {
    id: 'string',
    tenantId: 'string',
    changes: {
      amount: 'number?',
      description: 'string?',
      categoryId: 'string?',
      date: 'date?'
    },
    updatedAt: 'date'
  },

  // Expense Deleted
  [EventTypes.EXPENSE_DELETED]: {
    id: 'string',
    tenantId: 'string',
    userId: 'string',
    amount: 'number',
    deletedAt: 'date'
  },

  // Goal Achieved
  [EventTypes.GOAL_ACHIEVED]: {
    id: 'string',
    tenantId: 'string',
    userId: 'string',
    title: 'string',
    targetAmount: 'number',
    achievedAt: 'date'
  },

  // Budget Warning
  [EventTypes.BUDGET_WARNING]: {
    tenantId: 'string',
    userId: 'string',
    categoryId: 'string?',
    budgetName: 'string',
    spent: 'number',
    limit: 'number',
    percentage: 'number',
    remainingDays: 'number'
  },

  // Budget Exceeded
  [EventTypes.BUDGET_EXCEEDED]: {
    tenantId: 'string',
    userId: 'string',
    categoryId: 'string?',
    budgetName: 'string',
    spent: 'number',
    limit: 'number',
    overBy: 'number'
  },

  // Member Joined
  [EventTypes.MEMBER_JOINED]: {
    tenantId: 'string',
    userId: 'string',
    firstName: 'string',
    lastName: 'string',
    email: 'string',
    role: 'string',
    joinedAt: 'date'
  },

  // Member Role Changed
  [EventTypes.MEMBER_ROLE_CHANGED]: {
    tenantId: 'string',
    userId: 'string',
    oldRole: 'string',
    newRole: 'string',
    changedBy: 'string',
    changedAt: 'date'
  },

  // Monthly Report Ready
  [EventTypes.MONTHLY_REPORT_READY]: {
    tenantId: 'string',
    userId: 'string',
    month: 'string',
    reportUrl: 'string',
    totalExpenses: 'number',
    readyAt: 'date'
  }
};

/**
 * Event Priority Levels
 */
export const EventPriority = {
  LOW: 1,        // General updates
  NORMAL: 2,     // Standard operations
  HIGH: 3,       // Important changes
  CRITICAL: 4    // Errors, security events
};

/**
 * Event Configuration
 */
export const EventConfig = {
  // Which events should be persisted to database
  persistedEvents: [
    EventTypes.EXPENSE_CREATED,
    EventTypes.GOAL_ACHIEVED,
    EventTypes.BUDGET_EXCEEDED,
    EventTypes.MEMBER_JOINED,
    EventTypes.ERROR_OCCURRED
  ],

  // Which events should trigger notifications
  notifiableEvents: [
    EventTypes.GOAL_ACHIEVED,
    EventTypes.BUDGET_EXCEEDED,
    EventTypes.BUDGET_WARNING,
    EventTypes.MEMBER_JOINED,
    EventTypes.ERROR_OCCURRED
  ],

  // Event TTL in database (days)
  eventRetention: {
    [EventTypes.EXPENSE_CREATED]: 90,
    [EventTypes.EXPENSE_UPDATED]: 90,
    [EventTypes.GOAL_ACHIEVED]: 365,
    [EventTypes.BUDGET_EXCEEDED]: 365,
    [EventTypes.ERROR_OCCURRED]: 30
  },

  // Debouncing for rapid events
  debounceEvents: {
    [EventTypes.ANALYTICS_UPDATED]: 5000,  // 5 seconds
    [EventTypes.SYNC_COMPLETED]: 2000     // 2 seconds
  }
};

export default EventTypes;
