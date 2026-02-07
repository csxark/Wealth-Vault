
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users Table
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    profilePicture: text('profile_picture').default(''),
    dateOfBirth: timestamp('date_of_birth'),
    phoneNumber: text('phone_number'),
    currency: text('currency').default('USD'),
    monthlyIncome: numeric('monthly_income', { precision: 12, scale: 2 }).default('0'),
    monthlyBudget: numeric('monthly_budget', { precision: 12, scale: 2 }).default('0'),
    emergencyFund: numeric('emergency_fund', { precision: 12, scale: 2 }).default('0'),
    isActive: boolean('is_active').default(true),
    lastLogin: timestamp('last_login').defaultNow(),
    // MFA Fields
    mfaEnabled: boolean('mfa_enabled').default(false),
    mfaSecret: text('mfa_secret'),
    mfaRecoveryCodes: jsonb('mfa_recovery_codes').default([]),
    mfaBackupCodes: jsonb('mfa_backup_codes').default([]),
    preferences: jsonb('preferences').default({
        notifications: { email: true, push: true, sms: false },
        theme: 'auto',
        language: 'en'
    }),
    // Savings Round-Up Settings
    savingsRoundUpEnabled: boolean('savings_round_up_enabled').default(false),
    savingsGoalId: uuid('savings_goal_id').references(() => goals.id, { onDelete: 'set null' }),
    roundUpToNearest: numeric('round_up_to_nearest', { precision: 5, scale: 2 }).default('1.00'), // Round up to nearest dollar or custom amount
    // Peer Comparison Settings
    peerComparisonConsent: boolean('peer_comparison_consent').default(false),
    ageGroup: text('age_group'), // '18-24', '25-34', '35-44', '45-54', '55-64', '65+'
    incomeRange: text('income_range'), // '0-25000', '25001-50000', '50001-75000', '75001-100000', '100001+'
    location: text('location'), // City or region for grouping
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Categories Table
export const categories = pgTable('categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#3B82F6'),
    icon: text('icon').default('tag'),
    type: text('type').default('expense'), // enum: 'expense', 'income', 'both'
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    budget: jsonb('budget').default({ monthly: 0, yearly: 0 }),
    spendingLimit: numeric('spending_limit', { precision: 12, scale: 2 }).default('0'),
    priority: integer('priority').default(0),
    metadata: jsonb('metadata').default({
        usageCount: 0,
        lastUsed: null,
        averageAmount: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Expenses Table
export const expenses = pgTable('expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }), // Added for shared vaults
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    subcategory: text('subcategory'),
    date: timestamp('date').defaultNow().notNull(),
    paymentMethod: text('payment_method').default('other'),
    location: jsonb('location'), // { name, address, coordinates: { lat, lng } }
    tags: jsonb('tags').default([]), // Store generic array as JSONB or text[]
    receipt: jsonb('receipt'),
    isRecurring: boolean('is_recurring').default(false),
    recurringPattern: jsonb('recurring_pattern'), // { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: 1, endDate?: Date }
    nextExecutionDate: timestamp('next_execution_date'), // When the next recurring transaction should be created
    lastExecutedDate: timestamp('last_executed_date'), // When this recurring pattern was last executed
    recurringSourceId: uuid('recurring_source_id'), // Reference to the original recurring expense (for cloned transactions)
    notes: text('notes'),
    status: text('status').default('completed'),
    metadata: jsonb('metadata').default({
        createdBy: 'system',
        lastModified: null,
        version: 1,
        flags: []
    }),
    // Tax-related fields
    isTaxDeductible: boolean('is_tax_deductible').default(false),
    taxCategoryId: uuid('tax_category_id'), // .references(() => taxCategories.id, { onDelete: 'set null' }), FIX: taxCategories not defined
    taxDeductibilityConfidence: doublePrecision('tax_deductibility_confidence').default(0), // AI confidence (0-1)
    taxNotes: text('tax_notes'), // User or AI notes about tax treatment
    taxYear: integer('tax_year'), // Which tax year this applies to
    createdAt: timestamp('created_at').defaultNow(),

    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userDateIdx: index('idx_expenses_user_date').on(table.userId, table.date),
        userCategoryIdx: index('idx_expenses_user_category').on(table.userId, table.categoryId),
    };
});

// Subscriptions Table
export const subscriptions = pgTable('subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    billingCycle: text('billing_cycle').default('monthly'), // monthly, yearly, weekly
    nextPaymentDate: timestamp('next_payment_date').notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Vaults Table (Collaborative Shared Wallets)
export const vaults = pgTable('vaults', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currency: text('currency').default('USD'),
    metadata: jsonb('metadata').default({}),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Vault Members Junction Table
export const vaultMembers = pgTable('vault_members', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: text('role').notNull().default('member'), // owner, member, viewer
    joinedAt: timestamp('joined_at').defaultNow(),
});

// Vault Invites Table
export const vaultInvites = pgTable('vault_invites', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    inviterId: uuid('inviter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    role: text('role').default('member'),
    status: text('status').default('pending'), // pending, accepted, rejected, expired
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Vault Balances Table (Track internal debts within a vault)
export const vaultBalances = pgTable('vault_balances', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).default('0').notNull(), // Positive = they are owed, Negative = they owe
    currency: text('currency').default('USD'),
    lastSettlementAt: timestamp('last_settlement_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Settlements Table (Track who owes whom and payment confirmations)
export const settlements = pgTable('settlements', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    payerId: uuid('payer_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Who paid
    payeeId: uuid('payee_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Who received
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description'),
    relatedExpenseId: uuid('related_expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    status: text('status').default('pending'), // pending, confirmed, cancelled
    confirmedByPayer: boolean('confirmed_by_payer').default(false),
    confirmedByPayee: boolean('confirmed_by_payee').default(false),
    settledAt: timestamp('settled_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Debt Transactions Table (History of who paid for what in shared expenses)
export const debtTransactions = pgTable('debt_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    paidById: uuid('paid_by_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Who actually paid
    owedById: uuid('owed_by_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Who owes
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // Amount owed
    splitType: text('split_type').default('equal'), // equal, percentage, exact
    splitValue: numeric('split_value', { precision: 12, scale: 2 }), // For percentage or exact splits
    isSettled: boolean('is_settled').default(false),
    settledAt: timestamp('settled_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Goals Table
export const goals = pgTable('goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }), // Goals can also belong to vaults
    title: text('title').notNull(),
    description: text('description'),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    type: text('type').default('savings'),
    priority: text('priority').default('medium'),
    status: text('status').default('active'),
    deadline: timestamp('deadline').notNull(),
    startDate: timestamp('start_date').defaultNow(),
    completedDate: timestamp('completed_date'),
    milestones: jsonb('milestones').default([]),
    recurringContribution: jsonb('recurring_contribution').default({ amount: 0, frequency: 'monthly' }),
    tags: jsonb('tags').default([]),
    notes: text('notes'),
    isPublic: boolean('is_public').default(false),
    metadata: jsonb('metadata').default({
        lastContribution: null,
        totalContributions: 0,
        averageContribution: 0,
        streakDays: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Milestones Table
export const goalMilestones = pgTable('goal_milestones', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).default('0'),
    deadline: timestamp('deadline'),
    isCompleted: boolean('is_completed').default(false),
    completedDate: timestamp('completed_date'),
    order: integer('order').default(0),
    metadata: jsonb('metadata').default({
        badgeEarned: false,
        notificationSent: false
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Savings Round-Ups Table
export const savingsRoundups = pgTable('savings_roundups', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
    roundedAmount: numeric('rounded_amount', { precision: 12, scale: 2 }).notNull(),
    roundUpAmount: numeric('round_up_amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    status: text('status').default('pending'), // pending, transferred, failed
    transferId: text('transfer_id'), // Plaid transfer ID
    transferDate: timestamp('transfer_date'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').default({
        roundUpToNearest: '1.00',
        createdBy: 'system'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Device Sessions Table for token management
export const deviceSessions = pgTable('device_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    deviceId: text('device_id').notNull(),
    deviceName: text('device_name'),
    deviceType: text('device_type').default('web'), // web, mobile, tablet
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    refreshToken: text('refresh_token').notNull().unique(),
    accessToken: text('access_token'),
    isActive: boolean('is_active').default(true),
    lastActivity: timestamp('last_activity').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Exchange Rates Table
export const exchangeRates = pgTable('exchange_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    baseCurrency: text('base_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    rate: doublePrecision('rate').notNull(),
    source: text('source').default('exchangerate-api'), // API source
    validFrom: timestamp('valid_from').defaultNow(),
    validUntil: timestamp('valid_until'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Audit Snapshots Table (for Time Machine feature)
export const auditSnapshots = pgTable('audit_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: timestamp('snapshot_date').notNull(),
    totalBalance: numeric('total_balance', { precision: 12, scale: 2 }).notNull(),
    accountState: jsonb('account_state').notNull(), // Complete state: { expenses, goals, categories, budgets }
    transactionCount: integer('transaction_count').default(0),
    checksum: text('checksum').notNull(), // SHA-256 hash for integrity verification
    compressionType: text('compression_type').default('gzip'), // Compression method used
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// State Deltas Table (for incremental audit tracking)
export const stateDeltas = pgTable('state_deltas', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(), // 'expense', 'goal', 'category', 'budget'
    resourceId: uuid('resource_id').notNull(),
    operation: text('operation').notNull(), // 'CREATE', 'UPDATE', 'DELETE'
    beforeState: jsonb('before_state'), // State before the change
    afterState: jsonb('after_state'), // State after the change
    changedFields: jsonb('changed_fields').default([]), // Array of field names that changed
    triggeredBy: text('triggered_by').default('user'), // 'user', 'system', 'api', 'cron'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Forensic Queries Table (for tracking replay requests)
export const forensicQueries = pgTable('forensic_queries', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    queryType: text('query_type').notNull(), // 'replay', 'trace', 'explain'
    targetDate: timestamp('target_date'), // For time-travel queries
    targetResourceId: uuid('target_resource_id'), // For transaction tracing
    queryParams: jsonb('query_params').default({}),
    resultSummary: jsonb('result_summary'), // Cached result summary
    aiExplanation: text('ai_explanation'), // Gemini-generated natural language explanation
    executionTime: integer('execution_time'), // Milliseconds
    status: text('status').default('pending'), // 'pending', 'completed', 'failed'
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
});

// Forecast Snapshots Table (for Cash Flow Forecasting)
export const forecastSnapshots = pgTable('forecast_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    forecastDate: timestamp('forecast_date').notNull(), // The date this forecast was generated
    projectedBalance: numeric('projected_balance', { precision: 12, scale: 2 }).notNull(),
    confidence: doublePrecision('confidence').default(0), // Confidence score (0-100)
    predictions: jsonb('predictions').default([]), // Array of daily predictions: [{ date, income, expenses, balance }]
    anomalies: jsonb('anomalies').default([]), // Detected anomalies: [{ type, description, severity, date }]
    trends: jsonb('trends').default({}), // { recurringPatterns: [], seasonalTrends: [], growthRate: 0 }
    dangerZones: jsonb('danger_zones').default([]), // Predicted negative balance periods: [{ startDate, endDate, severity, projectedBalance }]
    aiInsights: jsonb('ai_insights').default({}), // Gemini AI-generated insights
    metadata: jsonb('metadata').default({
        analysisVersion: '1.0',
        dataPoints: 0,
        historicalMonths: 0,
        forecastDays: 30
    }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Balance Snapshots Table (Daily balance tracking for historical analysis)
export const balanceSnapshots = pgTable('balance_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').defaultNow().notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).notNull(),
    income: numeric('income', { precision: 12, scale: 2 }).default('0'),
    expense: numeric('expense', { precision: 12, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        userDateIdx: index('idx_balance_snapshots_user_date').on(table.userId, table.date),
    };
});

// Liquidity Alerts Table
export const liquidityAlerts = pgTable('liquidity_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
    alertDays: integer('alert_days').default(7), // alert if balance falls below threshold within X days
    isActive: boolean('is_active').default(true),
    lastTriggeredAt: timestamp('last_triggered_at'),
    severity: text('severity').default('warning'), // 'warning', 'critical'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_liquidity_alerts_user_id').on(table.userId),
    };
});

// Transfer Suggestions Table (AI-generated recommendations for account optimization)
export const transferSuggestions = pgTable('transfer_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceVaultId: uuid('source_vault_id').references(() => vaults.id, { onDelete: 'set null' }),
    destVaultId: uuid('dest_vault_id').references(() => vaults.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
    suggestedDate: timestamp('suggested_date'),
    status: text('status').default('pending'), // 'pending', 'accepted', 'ignored', 'executed'
    aiConfidence: doublePrecision('ai_confidence'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_transfer_suggestions_user_id').on(table.userId),
    };
});

// Token Blacklist Table
export const tokenBlacklist = pgTable('token_blacklist', {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    tokenType: text('token_type').notNull(), // access, refresh
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').default('logout'), // logout, password_change, security
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Security Events Table
export const securityEvents = pgTable('security_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    eventType: text('event_type').notNull(), // login_success, login_failed, mfa_enabled, mfa_disabled, password_changed, suspicious_activity
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    location: jsonb('location'), // { city, country, latitude, longitude }
    deviceInfo: jsonb('device_info'), // { deviceId, deviceName, deviceType }
    status: text('status').default('info'), // info, warning, critical
    details: jsonb('details').default({}),
    notified: boolean('notified').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

//Audit Logs Table (Enterprise-Grade Security Trail)
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(), // e.g., AUTH_LOGIN, EXPENSE_UPDATE, CATEGORY_DELETE
    resourceType: text('resource_type'), // user, expense, goal, category, etc.
    resourceId: uuid('resource_id'),
    originalState: jsonb('original_state'), // State before change
    newState: jsonb('new_state'), // State after change
    delta: jsonb('delta'), // Computed differences
    deltaHash: text('delta_hash'), // Cryptographic hash of the delta (SHA-256)
    metadata: jsonb('metadata').default({}),
    status: text('status').default('success'), // success, failure
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),
    requestId: text('request_id'), // For correlation
    performedAt: timestamp('performed_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Reports Table
export const reports = pgTable('reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'monthly_digest', 'tax_summary', 'custom'
    format: text('format').notNull(), // 'pdf', 'excel'
    url: text('url').notNull(),
    period: text('period'), // '2023-10'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Budget Alerts Table
export const budgetAlerts = pgTable('budget_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    threshold: integer('threshold').notNull(), // 50, 80, 100
    period: text('period').notNull(), // '2023-10'
    triggeredAt: timestamp('triggered_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

// Budget Rules Table
export const budgetRules = pgTable('budget_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ruleType: text('rule_type').notNull(), // 'percentage', 'amount', 'frequency'
    condition: jsonb('condition').notNull(), // { operator: '>', value: 500, period: 'week' }
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
    period: text('period').notNull(), // 'daily', 'weekly', 'monthly', 'yearly'
    notificationType: text('notification_type').notNull(), // 'email', 'push', 'in_app'
    isActive: boolean('is_active').default(true),
    lastTriggered: timestamp('last_triggered'),
    metadata: jsonb('metadata').default({
        triggerCount: 0,
        lastAmount: 0,
        createdBy: 'user'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Security Markers Table (Anomaly Detection)
export const securityMarkers = pgTable('security_markers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    markerType: text('marker_type').notNull(), // 'anomaly_detected', 'high_risk_description', 'geo_anomaly', 'rapid_fire', 'unusual_amount'
    severity: text('severity').notNull().default('medium'), // 'low', 'medium', 'high', 'critical'
    status: text('status').notNull().default('pending'), // 'pending', 'cleared', 'disputed', 'blocked'
    detectionMethod: text('detection_method').notNull(), // 'statistical_analysis', 'ai_detection', 'rule_based', 'mixed'
    anomalyDetails: jsonb('anomaly_details').notNull().default({}), // { reason, baselineValue, currentValue, deviationPercent, patternType }
    aiAnalysis: jsonb('ai_analysis').default({}), // { risk_score, scam_indicators, recommendation, confidence }
    requiresMFA: boolean('requires_mfa').default(false),
    mfaVerifiedAt: timestamp('mfa_verified_at'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),
    autoResolve: boolean('auto_resolve').default(false), // Auto-clear after N days if no issues
    autoResolveAt: timestamp('auto_resolve_at'),
    metadata: jsonb('metadata').default({
        triggerRules: [],
        userNotified: false,
        escalationLevel: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Disputed Transactions Table
export const disputedTransactions = pgTable('disputed_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    securityMarkerId: uuid('security_marker_id').references(() => securityMarkers.id, { onDelete: 'set null' }),
    disputeType: text('dispute_type').notNull(), // 'unauthorized', 'fraudulent', 'incorrect_amount', 'duplicate', 'other'
    disputeReason: text('dispute_reason').notNull(),
    disputeStatus: text('dispute_status').notNull().default('open'), // 'open', 'investigating', 'resolved', 'rejected', 'closed'
    originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
    disputedAmount: numeric('disputed_amount', { precision: 12, scale: 2 }),
    evidence: jsonb('evidence').default([]), // Array of evidence items: [{ type, url, description, uploadedAt }]
    merchantInfo: jsonb('merchant_info').default({}), // { name, category, location, contactInfo }
    resolutionDetails: jsonb('resolution_details').default({}), // { outcome, refundAmount, resolutionDate, notes }
    priority: text('priority').default('normal'), // 'low', 'normal', 'high', 'urgent'
    assignedTo: uuid('assigned_to').references(() => users.id), // For admin/support assignment
    communicationLog: jsonb('communication_log').default([]), // Timeline of updates
    isBlocked: boolean('is_blocked').default(true), // Whether transaction is blocked from ledger
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Portfolios Table
export const portfolios = pgTable('portfolios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currency: text('currency').default('USD'),
    totalValue: numeric('total_value', { precision: 15, scale: 2 }).default('0'),
    totalCost: numeric('total_cost', { precision: 15, scale: 2 }).default('0'),
    totalGainLoss: numeric('total_gain_loss', { precision: 15, scale: 2 }).default('0'),
    totalGainLossPercent: doublePrecision('total_gain_loss_percent').default(0),
    isActive: boolean('is_active').default(true),
    riskTolerance: text('risk_tolerance').default('moderate'), // conservative, moderate, aggressive
    investmentStrategy: text('investment_strategy'), // growth, income, balanced, etc.
    targetAllocation: jsonb('target_allocation').default({}), // { 'stocks': 60, 'bonds': 30, 'cash': 10 }
    metadata: jsonb('metadata').default({
        lastUpdated: null,
        performanceHistory: [],
        rebalancingNeeded: false
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Investments Table
export const investments = pgTable('investments', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(), // AAPL, GOOGL, etc.
    name: text('name').notNull(), // Apple Inc., Alphabet Inc.
    type: text('type').notNull(), // stock, etf, mutual_fund, bond, crypto
    assetClass: text('asset_class').default('equity'), // equity, fixed_income, alternative, cash
    sector: text('sector'), // technology, healthcare, financials, etc.
    country: text('country').default('US'),
    currency: text('currency').default('USD'),
    quantity: numeric('quantity', { precision: 15, scale: 6 }).notNull(),
    averageCost: numeric('average_cost', { precision: 12, scale: 4 }).notNull(),
    currentPrice: numeric('current_price', { precision: 12, scale: 4 }),
    marketValue: numeric('market_value', { precision: 15, scale: 2 }),
    totalCost: numeric('total_cost', { precision: 15, scale: 2 }),
    unrealizedGainLoss: numeric('unrealized_gain_loss', { precision: 15, scale: 2 }),
    unrealizedGainLossPercent: doublePrecision('unrealized_gain_loss_percent'),
    dividendYield: doublePrecision('dividend_yield'),
    peRatio: doublePrecision('pe_ratio'),
    marketCap: numeric('market_cap', { precision: 18, scale: 2 }),
    lastPriceUpdate: timestamp('last_price_update'),
    isActive: boolean('is_active').default(true),
    tags: jsonb('tags').default([]),
    notes: text('notes'),
    metadata: jsonb('metadata').default({
        exchange: null,
        cusip: null,
        isin: null,
        lastDividend: null,
        dividendFrequency: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Investment Transactions Table
export const investmentTransactions = pgTable('investment_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    type: text('type').notNull(), // buy, sell, dividend, split, fee
    quantity: numeric('quantity', { precision: 15, scale: 6 }).notNull(),
    price: numeric('price', { precision: 12, scale: 4 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(),
    fees: numeric('fees', { precision: 10, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    exchangeRate: doublePrecision('exchange_rate').default(1),
    date: timestamp('date').defaultNow().notNull(),
    broker: text('broker'),
    orderId: text('order_id'),
    notes: text('notes'),
    metadata: jsonb('metadata').default({
        settlementDate: null,
        commission: 0,
        taxes: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Price History Table
export const priceHistory = pgTable('price_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    date: timestamp('date').notNull(),
    open: numeric('open', { precision: 12, scale: 4 }),
    high: numeric('high', { precision: 12, scale: 4 }),
    low: numeric('low', { precision: 12, scale: 4 }),
    close: numeric('close', { precision: 12, scale: 4 }).notNull(),
    volume: integer('volume'),
    adjustedClose: numeric('adjusted_close', { precision: 12, scale: 4 }),
    dividend: numeric('dividend', { precision: 10, scale: 4 }).default('0'),
    splitRatio: doublePrecision('split_ratio').default(1),
    currency: text('currency').default('USD'),
    source: text('source').default('yahoo'), // yahoo, alpha_vantage, manual
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    deviceSessions: many(deviceSessions),
    vaultMemberships: many(vaultMembers),
    ownedVaults: many(vaults),
    securityEvents: many(securityEvents),
    reports: many(reports),
    budgetAlerts: many(budgetAlerts),
    auditLogs: many(auditLogs),
    securityMarkers: many(securityMarkers),
    disputedTransactions: many(disputedTransactions),
    balanceSnapshots: many(balanceSnapshots),
    forecastSnapshots: many(forecastSnapshots),
    liquidityAlerts: many(liquidityAlerts),
    transferSuggestions: many(transferSuggestions),
    properties: many(properties),
    tenantLeases: many(tenantLeases),
}));

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
    owner: one(users, {
        fields: [vaults.ownerId],
        references: [users.id],
    }),
    members: many(vaultMembers),
    expenses: many(expenses),
    goals: many(goals),
    invites: many(vaultInvites),
    reports: many(reports),
    balances: many(vaultBalances),
    settlements: many(settlements),
    debtTransactions: many(debtTransactions),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
    user: one(users, {
        fields: [reports.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [reports.vaultId],
        references: [vaults.id],
    }),
}));

export const vaultMembersRelations = relations(vaultMembers, ({ one }) => ({
    vault: one(vaults, {
        fields: [vaultMembers.vaultId],
        references: [vaults.id],
    }),
    user: one(users, {
        fields: [vaultMembers.userId],
        references: [users.id],
    }),
}));

export const budgetAlertsRelations = relations(budgetAlerts, ({ one }) => ({
    user: one(users, {
        fields: [budgetAlerts.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [budgetAlerts.categoryId],
        references: [categories.id],
    }),
    vault: one(vaults, {
        fields: [budgetAlerts.vaultId],
        references: [vaults.id],
    }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    user: one(users, {
        fields: [categories.userId],
        references: [users.id],
    }),
    parentCategory: one(categories, {
        fields: [categories.parentCategoryId],
        references: [categories.id],
        relationName: 'parent_child_category'
    }),
    childCategories: many(categories, {
        relationName: 'parent_child_category'
    }),
    expenses: many(expenses),
    goals: many(goals),
    subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
    user: one(users, {
        fields: [subscriptions.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [subscriptions.categoryId],
        references: [categories.id],
    }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
    user: one(users, {
        fields: [expenses.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [expenses.categoryId],
        references: [categories.id],
    }),
    vault: one(vaults, {
        fields: [expenses.vaultId],
        references: [vaults.id],
    }),
    securityMarkers: many(securityMarkers),
    disputes: many(disputedTransactions),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
    user: one(users, {
        fields: [goals.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [goals.categoryId],
        references: [categories.id],
    }),
    vault: one(vaults, {
        fields: [goals.vaultId],
        references: [vaults.id],
    }),
}));

export const deviceSessionsRelations = relations(deviceSessions, ({ one }) => ({
    user: one(users, {
        fields: [deviceSessions.userId],
        references: [users.id],
    }),
}));

export const tokenBlacklistRelations = relations(tokenBlacklist, ({ one }) => ({
    user: one(users, {
        fields: [tokenBlacklist.userId],
        references: [users.id],
    }),
}));
export const forecastSnapshotsRelations = relations(forecastSnapshots, ({ one }) => ({
    user: one(users, {
        fields: [forecastSnapshots.userId],
        references: [users.id],
    }),
}));


export const vaultBalancesRelations = relations(vaultBalances, ({ one }) => ({
    vault: one(vaults, {
        fields: [vaultBalances.vaultId],
        references: [vaults.id],
    }),
    user: one(users, {
        fields: [vaultBalances.userId],
        references: [users.id],
    }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
    vault: one(vaults, {
        fields: [settlements.vaultId],
        references: [vaults.id],
    }),
    payer: one(users, {
        fields: [settlements.payerId],
        references: [users.id],
    }),
    payee: one(users, {
        fields: [settlements.payeeId],
        references: [users.id],
    }),
    relatedExpense: one(expenses, {
        fields: [settlements.relatedExpenseId],
        references: [expenses.id],
    }),
}));

export const debtTransactionsRelations = relations(debtTransactions, ({ one }) => ({
    vault: one(vaults, {
        fields: [debtTransactions.vaultId],
        references: [vaults.id],
    }),
    expense: one(expenses, {
        fields: [debtTransactions.expenseId],
        references: [expenses.id],
    }),
    paidBy: one(users, {
        fields: [debtTransactions.paidById],
        references: [users.id],
    }),
    owedBy: one(users, {
        fields: [debtTransactions.owedById],
        references: [users.id],
    }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    user: one(users, {
        fields: [auditLogs.userId],
        references: [users.id],
    }),
}));

export const securityMarkersRelations = relations(securityMarkers, ({ one, many }) => ({
    user: one(users, {
        fields: [securityMarkers.userId],
        references: [users.id],
    }),
    expense: one(expenses, {
        fields: [securityMarkers.expenseId],
        references: [expenses.id],
    }),
    reviewer: one(users, {
        fields: [securityMarkers.reviewedBy],
        references: [users.id],
    }),
    disputes: many(disputedTransactions),
}));

export const disputedTransactionsRelations = relations(disputedTransactions, ({ one }) => ({
    user: one(users, {
        fields: [disputedTransactions.userId],
        references: [users.id],
    }),
    expense: one(expenses, {
        fields: [disputedTransactions.expenseId],
        references: [expenses.id],
    }),
    securityMarker: one(securityMarkers, {
        fields: [disputedTransactions.securityMarkerId],
        references: [securityMarkers.id],
    }),
    assignee: one(users, {
        fields: [disputedTransactions.assignedTo],
        references: [users.id],
    }),
}));


// Audit Snapshots Relations
export const auditSnapshotsRelations = relations(auditSnapshots, ({ one }) => ({
    user: one(users, {
        fields: [auditSnapshots.userId],
        references: [users.id],
    }),
}));

// State Deltas Relations
export const stateDeltasRelations = relations(stateDeltas, ({ one }) => ({
    user: one(users, {
        fields: [stateDeltas.userId],
        references: [users.id],
    }),
}));

// Forensic Queries Relations
export const forensicQueriesRelations = relations(forensicQueries, ({ one }) => ({
    user: one(users, {
        fields: [forensicQueries.userId],
        references: [users.id],
    }),
}));

// No relations needed for exchangeRates as it's a standalone reference table
// Multi-Currency Wallets
export const currencyWallets = pgTable('currency_wallets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(), // 'USD', 'EUR', 'BTC'
    balance: numeric('balance', { precision: 18, scale: 8 }).default('0'), // High precision for crypto
    isDefault: boolean('is_default').default(false),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// FX Transactions (Conversions)
export const fxTransactions = pgTable('fx_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceWalletId: uuid('source_wallet_id').references(() => currencyWallets.id),
    targetWalletId: uuid('target_wallet_id').references(() => currencyWallets.id),
    sourceCurrency: text('source_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    sourceAmount: numeric('source_amount', { precision: 18, scale: 8 }).notNull(),
    targetAmount: numeric('target_amount', { precision: 18, scale: 8 }).notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 8 }).notNull(),
    fee: numeric('fee', { precision: 12, scale: 2 }).default('0'),
    status: text('status').default('completed'), // 'pending', 'completed', 'failed'
    metadata: jsonb('metadata'), // Store arbitrage details if AI triggered
    createdAt: timestamp('created_at').defaultNow(),
});

// Real-Time FX Rates Cache
export const fxRates = pgTable('fx_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull().unique(), // 'USD/EUR'
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    change24h: numeric('change_24h', { precision: 5, scale: 2 }).default('0'),
    volatility: numeric('volatility', { precision: 5, scale: 2 }).default('0'), // High volatility alert
    lastUpdated: timestamp('last_updated').defaultNow(),
});

// Arbitrage Opportunities (AI Predictions)
export const arbitrageOpportunities = pgTable('arbitrage_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull(),
    type: text('type').notNull(), // 'buy_signal', 'sell_signal'
    currentRate: numeric('current_rate', { precision: 18, scale: 8 }),
    predictedRate: numeric('predicted_rate', { precision: 18, scale: 8 }),
    confidence: numeric('confidence', { precision: 5, scale: 2 }), // 0-100
    expectedProfit: numeric('expected_profit', { precision: 5, scale: 2 }), // Percentage
    validUntil: timestamp('valid_until'),
    status: text('status').default('active'), // 'active', 'expired', 'executed'
    createdAt: timestamp('created_at').defaultNow(),
});

// Define Relations
export const currencyWalletsRelations = relations(currencyWallets, ({ one, many }) => ({
    user: one(users, {
        fields: [currencyWallets.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [currencyWallets.vaultId],
        references: [vaults.id],
    }),
    transactionsFrom: many(fxTransactions, { relationName: 'sourceWallet' }),
    transactionsTo: many(fxTransactions, { relationName: 'targetWallet' }),
}));

export const fxTransactionsRelations = relations(fxTransactions, ({ one }) => ({
    user: one(users, {
        fields: [fxTransactions.userId],
        references: [users.id],
    }),
    sourceWallet: one(currencyWallets, {
        fields: [fxTransactions.sourceWalletId],
        references: [currencyWallets.id],
        relationName: 'sourceWallet',
    }),
    targetWallet: one(currencyWallets, {
        fields: [fxTransactions.targetWalletId],
        references: [currencyWallets.id],
        relationName: 'targetWallet',
    }),
}));

// Fixed Assets (Real Estate, Gold, Art, Vehicles, etc.)
export const fixedAssets = pgTable('fixed_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(), // 'real_estate', 'vehicle', 'jewelry', 'art', 'collectible', 'other'
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    purchaseDate: timestamp('purchase_date'),
    currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    location: text('location'), // For real estate
    description: text('description'),
    isLiquid: boolean('is_liquid').default(false),
    appreciationRate: numeric('appreciation_rate', { precision: 5, scale: 2 }), // Annual %
    metadata: jsonb('metadata'), // verification docs, insurance info
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Asset Valuation History
export const assetValuations = pgTable('asset_valuations', {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id').references(() => fixedAssets.id, { onDelete: 'cascade' }).notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    date: timestamp('date').defaultNow(),
    source: text('source').default('manual'), // 'manual', 'market_adjustment', 'appraisal'
});

// Simulation Results (Monte Carlo)
export const simulationResults = pgTable('simulation_results', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioName: text('scenario_name').notNull(),
    configurations: jsonb('configurations'), // { inflationRate, investmentReturn, timeHorizon }
    results: jsonb('results'), // { p10, p50, p90, yearlyProjections: [] }
    createdAt: timestamp('created_at').defaultNow(),
});

// Market Indices (for reference growth rates)
export const marketIndices = pgTable('market_indices', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // 'S&P500', 'Gold', 'RealEstate_US'
    currentValue: numeric('current_value', { precision: 12, scale: 2 }),
    avgAnnualReturn: numeric('avg_annual_return', { precision: 5, scale: 2 }),
    volatility: numeric('volatility', { precision: 5, scale: 2 }),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

// Properties Table (Extended Real Estate Details)
export const properties = pgTable('properties', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assetId: uuid('asset_id').references(() => fixedAssets.id, { onDelete: 'cascade' }),
    propertyType: text('property_type').notNull(), // 'residential', 'commercial', 'industrial', 'land'
    address: text('address').notNull(),
    units: integer('units').default(1),
    squareFootage: integer('square_footage'),
    lotSize: numeric('lot_size', { precision: 10, scale: 2 }),
    yearBuilt: integer('year_built'),
    amenities: jsonb('amenities').default([]),
    noi: numeric('noi', { precision: 12, scale: 2 }), // Net Operating Income
    capRate: numeric('cap_rate', { precision: 5, scale: 2 }),
    occupancyStatus: text('occupancy_status').default('vacant'), // 'occupied', 'vacant', 'maintenance'
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Tenant Leases Table
export const tenantLeases = pgTable('tenant_leases', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tenantName: text('tenant_name').notNull(),
    tenantContact: text('tenant_contact'),
    leaseStart: timestamp('lease_start').notNull(),
    leaseEnd: timestamp('lease_end').notNull(),
    monthlyRent: numeric('monthly_rent', { precision: 12, scale: 2 }).notNull(),
    securityDeposit: numeric('security_deposit', { precision: 12, scale: 2 }),
    status: text('status').default('active'), // 'active', 'expired', 'terminated', 'pending'
    paymentStatus: text('payment_status').default('paid'), // 'paid', 'overdue', 'partial'
    renewalWindowDays: integer('renewal_window_days').default(30),
    autoRenew: boolean('auto_renew').default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Property Maintenance Logs
export const propertyMaintenance = pgTable('property_maintenance', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taskName: text('task_name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'repair', 'renovation', 'routine', 'emergency'
    cost: numeric('cost', { precision: 12, scale: 2 }).default('0'),
    vendorInfo: text('vendor_info'),
    status: text('status').default('pending'), // 'pending', 'in_progress', 'completed'
    scheduledDate: timestamp('scheduled_date'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Property ROI Snapshots
export const propertyROISnapshots = pgTable('property_roi_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: timestamp('snapshot_date').defaultNow(),
    grossIncome: numeric('gross_income', { precision: 12, scale: 2 }),
    operatingExpenses: numeric('operating_expenses', { precision: 12, scale: 2 }),
    noi: numeric('noi', { precision: 12, scale: 2 }),
    cashOnCashReturn: numeric('cash_on_cash_return', { precision: 5, scale: 2 }),
    capRate: numeric('cap_rate', { precision: 5, scale: 2 }),
    occupancyRate: numeric('occupancy_rate', { precision: 5, scale: 2 }),
    totalAppreciation: numeric('total_appreciation', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Asset Relations
export const fixedAssetsRelations = relations(fixedAssets, ({ one, many }) => ({
    user: one(users, {
        fields: [fixedAssets.userId],
        references: [users.id],
    }),
    valuations: many(assetValuations),
    property: one(properties),
}));

export const assetValuationsRelations = relations(assetValuations, ({ one }) => ({
    asset: one(fixedAssets, {
        fields: [assetValuations.assetId],
        references: [fixedAssets.id],
    }),
}));

export const simulationResultsRelations = relations(simulationResults, ({ one }) => ({
    user: one(users, {
        fields: [simulationResults.userId],
        references: [users.id],
    }),
}));

// Properties Relations
export const propertiesRelations = relations(properties, ({ one, many }) => ({
    user: one(users, {
        fields: [properties.userId],
        references: [users.id],
    }),
    asset: one(fixedAssets, {
        fields: [properties.assetId],
        references: [fixedAssets.id],
    }),
    leases: many(tenantLeases),
    maintenance: many(propertyMaintenance),
    roiSnapshots: many(propertyROISnapshots),
}));

// Tenant Leases Relations
export const tenantLeasesRelations = relations(tenantLeases, ({ one }) => ({
    property: one(properties, {
        fields: [tenantLeases.propertyId],
        references: [properties.id],
    }),
    user: one(users, {
        fields: [tenantLeases.userId],
        references: [users.id],
    }),
}));

// Property Maintenance Relations
export const propertyMaintenanceRelations = relations(propertyMaintenance, ({ one }) => ({
    property: one(properties, {
        fields: [propertyMaintenance.propertyId],
        references: [properties.id],
    }),
    user: one(users, {
        fields: [propertyMaintenance.userId],
        references: [users.id],
    }),
}));

// Property ROI Snapshots Relations
export const propertyROISnapshotsRelations = relations(propertyROISnapshots, ({ one }) => ({
    property: one(properties, {
        fields: [propertyROISnapshots.propertyId],
        references: [properties.id],
    }),
    user: one(users, {
        fields: [propertyROISnapshots.userId],
        references: [users.id],
    }),
}));

// Family Roles (Hierarchical Governance)
export const familyRoles = pgTable('family_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: text('role').notNull(), // 'owner', 'parent', 'child', 'trustee', 'beneficiary'
    permissions: jsonb('permissions').default({
        canApprove: false,
        canCreateExpense: true,
        requiresApproval: false,
        approvalThreshold: 0, // Amount above which approval needed
        canManageRoles: false,
        canViewAll: true
    }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at').defaultNow(),
    expiresAt: timestamp('expires_at'), // Optional role expiration
    isActive: boolean('is_active').default(true),
});

// Approval Requests (Maker-Checker Workflow)
export const approvalRequests = pgTable('approval_requests', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    requesterId: uuid('requester_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(), // 'expense', 'goal', 'transfer', 'role_change'
    resourceId: uuid('resource_id'), // ID of the pending resource
    action: text('action').notNull(), // 'create', 'update', 'delete'
    requestData: jsonb('request_data').notNull(), // Full payload of the request
    amount: numeric('amount', { precision: 12, scale: 2 }), // For expense approvals
    status: text('status').default('pending'), // 'pending', 'approved', 'rejected', 'auto_approved'
    approvedBy: uuid('approved_by').references(() => users.id),
    rejectedBy: uuid('rejected_by').references(() => users.id),
    approvalReason: text('approval_reason'),
    rejectionReason: text('rejection_reason'),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    expiresAt: timestamp('expires_at'), // Auto-reject after X days
    metadata: jsonb('metadata'), // Voting history, comments
    createdAt: timestamp('created_at').defaultNow(),
});

// Inheritance Rules (Digital Will)
export const inheritanceRules = pgTable('inheritance_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id').references(() => users.id).notNull(),
    assetType: text('asset_type'), // 'vault', 'fixed_asset', 'all'
    assetId: uuid('asset_id'), // Specific asset or null for all
    distributionPercentage: numeric('distribution_percentage', { precision: 5, scale: 2 }), // % share
    conditions: jsonb('conditions').default({
        inactivityThreshold: 90, // Days of inactivity
        requiresProofOfDeath: false,
        immediateTransfer: false,
        trusteeApprovalRequired: false
    }),
    trusteeId: uuid('trustee_id').references(() => users.id), // Optional executor
    status: text('status').default('active'), // 'active', 'triggered', 'executed', 'revoked'
    triggeredAt: timestamp('triggered_at'),
    executedAt: timestamp('executed_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Inactivity Triggers (Dead Man's Switch Monitoring)
export const inactivityTriggers = pgTable('inactivity_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
    lastActivityType: text('last_activity_type'), // 'login', 'api_call', 'manual_ping'
    inactivityDays: integer('inactivity_days').default(0),
    warningsSent: integer('warnings_sent').default(0),
    lastWarningAt: timestamp('last_warning_at'),
    status: text('status').default('active'), // 'active', 'warned', 'triggered'
    triggeredAt: timestamp('triggered_at'),
    challengeToken: text('challenge_token'), // For proof-of-life verification
    challengeSentAt: timestamp('challenge_sent_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations for Governance Tables
export const familyRolesRelations = relations(familyRoles, ({ one }) => ({
    vault: one(vaults, {
        fields: [familyRoles.vaultId],
        references: [vaults.id],
    }),
    user: one(users, {
        fields: [familyRoles.userId],
        references: [users.id],
    }),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
    vault: one(vaults, {
        fields: [approvalRequests.vaultId],
        references: [vaults.id],
    }),
    requester: one(users, {
        fields: [approvalRequests.requesterId],
        references: [users.id],
    }),
}));

export const inheritanceRulesRelations = relations(inheritanceRules, ({ one }) => ({
    user: one(users, {
        fields: [inheritanceRules.userId],
        references: [users.id],
    }),
    beneficiary: one(users, {
        fields: [inheritanceRules.beneficiaryId],
        references: [users.id],
    }),
}));

export const inactivityTriggersRelations = relations(inactivityTriggers, ({ one }) => ({
    user: one(users, {
        fields: [inactivityTriggers.userId],
        references: [users.id],
    }),
}));// ============================================================================
// DEBT CONSOLIDATION CALCULATOR TABLES
// ============================================================================

// Debts Table - Core debt tracking
export const debts = pgTable('debts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    debtType: text('debt_type').notNull(), // 'credit_card', 'personal_loan', 'mortgage', 'auto_loan', 'student_loan', 'medical', 'other'
    principalAmount: numeric('principal_amount', { precision: 12, scale: 2 }).notNull(),
    currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull(),
    apr: numeric('apr', { precision: 5, scale: 3 }).notNull(), // Annual Percentage Rate as decimal
    minimumPayment: numeric('minimum_payment', { precision: 12, scale: 2 }).notNull(),
    paymentDueDay: integer('payment_due_day'), // 1-28
    termMonths: integer('term_months'), // null for revolving debts
    startDate: timestamp('start_date'),
    estimatedPayoffDate: timestamp('estimated_payoff_date'),
    isActive: boolean('is_active').default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_debts_user_id').on(table.userId),
    };
});

// Debt Payments Table - Track payments made
export const debtPayments = pgTable('debt_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date').notNull(),
    principalPayment: numeric('principal_payment', { precision: 12, scale: 2 }).notNull(),
    interestPayment: numeric('interest_payment', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text('payment_method'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_debt_payments_user_id').on(table.userId),
        debtIdIdx: index('idx_debt_payments_debt_id').on(table.debtId),
    };
});

// Payoff Strategies Table - Store user's selected payoff strategy
export const payoffStrategies = pgTable('payoff_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyName: text('strategy_name').notNull(), // 'avalanche', 'snowball', 'custom'
    customPriorityOrder: jsonb('custom_priority_order'), // Array of debt IDs in priority order
    monthlyExtraPayment: numeric('monthly_extra_payment', { precision: 12, scale: 2 }).default('0'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_payoff_strategies_user_id').on(table.userId),
    };
});

// Amortization Schedules Table - Generated payment schedules
export const amortizationSchedules = pgTable('amortization_schedules', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    strategyId: uuid('strategy_id').references(() => payoffStrategies.id, { onDelete: 'set null' }),
    scheduledDate: timestamp('scheduled_date').notNull(),
    paymentNumber: integer('payment_number').notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    principalComponent: numeric('principal_component', { precision: 12, scale: 2 }).notNull(),
    interestComponent: numeric('interest_component', { precision: 12, scale: 2 }).notNull(),
    remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 }).notNull(),
    isPaid: boolean('is_paid').default(false),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        debtIdIdx: index('idx_amortization_debt_id').on(table.debtId),
        strategyIdIdx: index('idx_amortization_strategy_id').on(table.strategyId),
    };
});

// Refinance Opportunities Table - Detected refinancing opportunities
export const refinanceOpportunities = pgTable('refinance_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    currentApr: numeric('current_apr', { precision: 5, scale: 3 }).notNull(),
    suggestedApr: numeric('suggested_apr', { precision: 5, scale: 3 }).notNull(),
    potentialSavings: numeric('potential_savings', { precision: 12, scale: 2 }).notNull(),
    monthsSaved: integer('months_saved'),
    recommendation: text('recommendation'),
    marketRateEstimate: numeric('market_rate_estimate', { precision: 5, scale: 3 }),
    isReviewed: boolean('is_reviewed').default(false),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_refinance_user_id').on(table.userId),
        debtIdIdx: index('idx_refinance_debt_id').on(table.debtId),
    };
});

// ============================================================================
// DEBT RELATIONS
// ============================================================================

export const debtsRelations = relations(debts, ({ one, many }) => ({
    user: one(users, {
        fields: [debts.userId],
        references: [users.id],
    }),
    payments: many(debtPayments),
    amortizationSchedules: many(amortizationSchedules),
    refinanceOpportunities: many(refinanceOpportunities),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
    debt: one(debts, {
        fields: [debtPayments.debtId],
        references: [debts.id],
    }),
    user: one(users, {
        fields: [debtPayments.userId],
        references: [users.id],
    }),
}));

export const payoffStrategiesRelations = relations(payoffStrategies, ({ one, many }) => ({
    user: one(users, {
        fields: [payoffStrategies.userId],
        references: [users.id],
    }),
    amortizationSchedules: many(amortizationSchedules),
}));

export const amortizationSchedulesRelations = relations(amortizationSchedules, ({ one }) => ({
    debt: one(debts, {
        fields: [amortizationSchedules.debtId],
        references: [debts.id],
    }),
    strategy: one(payoffStrategies, {
        fields: [amortizationSchedules.strategyId],
        references: [payoffStrategies.id],
    }),
}));

export const refinanceOpportunitiesRelations = relations(refinanceOpportunities, ({ one }) => ({
    user: one(users, {
        fields: [refinanceOpportunities.userId],
        references: [users.id],
    }),
    debt: one(debts, {
        fields: [refinanceOpportunities.debtId],
        references: [debts.id],
    }),
}));

// ============================================================================
// DEBT CONSOLIDATION CALCULATOR TABLES
// ============================================================================

// Debts Table - Core debt tracking
const debtTypes = ['credit_card', 'personal_loan', 'mortgage', 'auto_loan', 'student_loan', 'medical', 'other'];

export const debts = pgTable('debts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    debtType: text('debt_type').notNull(),
    principalAmount: numeric('principal_amount', { precision: 12, scale: 2 }).notNull(),
    currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull(),
    apr: numeric('apr', { precision: 5, scale: 3 }).notNull(), // Annual Percentage Rate as decimal
    minimumPayment: numeric('minimum_payment', { precision: 12, scale: 2 }).notNull(),
    paymentDueDay: integer('payment_due_day'), // 1-28
    termMonths: integer('term_months'), // null for revolving debts
    startDate: timestamp('start_date'),
    estimatedPayoffDate: timestamp('estimated_payoff_date'),
    isActive: boolean('is_active').default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
    index('idx_debts_user_id').on(table.userId),
]);

// Debt Payments Table - Track payments made

export const debtPayments = pgTable('debt_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date').notNull(),
    principalPayment: numeric('principal_payment', { precision: 12, scale: 2 }).notNull(),
    interestPayment: numeric('interest_payment', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text('payment_method'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('idx_debt_payments_user_id').on(table.userId),
    index('idx_debt_payments_debt_id').on(table.debtId),
]);

// Payoff Strategies Table - Store user's selected payoff strategy
const strategyNames = ['avalanche', 'snowball', 'custom'];

export const payoffStrategies = pgTable('payoff_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyName: text('strategy_name').notNull(),
    customPriorityOrder: jsonb('custom_priority_order'), // Array of debt IDs in priority order
    monthlyExtraPayment: numeric('monthly_extra_payment', { precision: 12, scale: 2 }).default('0'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
    index('idx_payoff_strategies_user_id').on(table.userId),
]);

// Amortization Schedules Table - Generated payment schedules

export const amortizationSchedules = pgTable('amortization_schedules', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    strategyId: uuid('strategy_id').references(() => payoffStrategies.id, { onDelete: 'set null' }),
    scheduledDate: timestamp('scheduled_date').notNull(),
    paymentNumber: integer('payment_number').notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    principalComponent: numeric('principal_component', { precision: 12, scale: 2 }).notNull(),
    interestComponent: numeric('interest_component', { precision: 12, scale: 2 }).notNull(),
    remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 }).notNull(),
    isPaid: boolean('is_paid').default(false),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('idx_amortization_debt_id').on(table.debtId),
    index('idx_amortization_strategy_id').on(table.strategyId),
]);

// Refinance Opportunities Table - Detected refinancing opportunities

export const refinanceOpportunities = pgTable('refinance_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    currentApr: numeric('current_apr', { precision: 5, scale: 3 }).notNull(),
    suggestedApr: numeric('suggested_apr', { precision: 5, scale: 3 }).notNull(),
    potentialSavings: numeric('potential_savings', { precision: 12, scale: 2 }).notNull(),
    monthsSaved: integer('months_saved'),
    recommendation: text('recommendation'),
    marketRateEstimate: numeric('market_rate_estimate', { precision: 5, scale: 3 }),
    isReviewed: boolean('is_reviewed').default(false),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('idx_refinance_user_id').on(table.userId),
    index('idx_refinance_debt_id').on(table.debtId),
]);

// ============================================================================
// TAX TABLES
// ============================================================================

// Tax Profiles (User Tax Configuration)
export const taxProfiles = pgTable('tax_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    country: text('country').default('US'),
    filingStatus: text('filing_status').default('single'), // 'single', 'married_joint', 'married_separate', 'head_of_household'
    taxYear: integer('tax_year').notNull(),
    annualIncome: numeric('annual_income', { precision: 12, scale: 2 }),
    standardDeduction: numeric('standard_deduction', { precision: 12, scale: 2 }),
    useItemizedDeductions: boolean('use_itemized_deductions').default(false),
    stateCode: text('state_code'), // 'CA', 'NY', etc.
    taxBracketData: jsonb('tax_bracket_data'), // Cached bracket info
    lastCalculated: timestamp('last_calculated'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Tax Brackets (Configurable Tax Rates)
export const taxBrackets = pgTable('tax_brackets', {
    id: uuid('id').defaultRandom().primaryKey(),
    country: text('country').default('US'),
    taxYear: integer('tax_year').notNull(),
    filingStatus: text('filing_status').notNull(),
    bracketLevel: integer('bracket_level').notNull(), // 1, 2, 3...
    minIncome: numeric('min_income', { precision: 12, scale: 2 }).notNull(),
    maxIncome: numeric('max_income', { precision: 12, scale: 2 }), // NULL for highest bracket
    rate: numeric('rate', { precision: 5, scale: 2 }).notNull(), // Percentage
    createdAt: timestamp('created_at').defaultNow(),
});

// Tax Deductions (AI-Detected & Manual)
export const taxDeductions = pgTable('tax_deductions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    taxYear: integer('tax_year').notNull(),
    category: text('category').notNull(), // 'business_expense', 'medical', 'charitable', 'mortgage_interest', 'education'
    description: text('description'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    deductionType: text('deduction_type').default('itemized'), // 'standard', 'itemized', 'above_the_line'
    aiDetected: boolean('ai_detected').default(false),
    confidence: doublePrecision('confidence').default(0), // AI confidence 0-1
    aiReasoning: text('ai_reasoning'), // Gemini's explanation
    status: text('status').default('pending'), // 'pending', 'approved', 'rejected', 'claimed'
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    metadata: jsonb('metadata'), // Receipt info, notes
    createdAt: timestamp('created_at').defaultNow(),
});

// Tax Reports (Generated Tax Summaries)
export const taxReports = pgTable('tax_reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taxYear: integer('tax_year').notNull(),
    reportType: text('report_type').default('annual'), // 'quarterly', 'annual', 'estimated'
    totalIncome: numeric('total_income', { precision: 12, scale: 2 }),
    totalDeductions: numeric('total_deductions', { precision: 12, scale: 2 }),
    taxableIncome: numeric('taxable_income', { precision: 12, scale: 2 }),
    totalTaxOwed: numeric('total_tax_owed', { precision: 12, scale: 2 }),
    effectiveTaxRate: numeric('effective_tax_rate', { precision: 5, scale: 2 }),
    marginalTaxRate: numeric('marginal_tax_rate', { precision: 5, scale: 2 }),
    estimatedRefund: numeric('estimated_refund', { precision: 12, scale: 2 }),
    breakdown: jsonb('breakdown'), // Detailed calculations
    pdfUrl: text('pdf_url'),
    status: text('status').default('draft'), // 'draft', 'final', 'filed'
    generatedAt: timestamp('generated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// DEBT RELATIONS
// ============================================================================

export const debtsRelations = relations(debts, ({ one, many }) => ({
    user: one(users, {
        fields: [debts.userId],
        references: [users.id],
    }),
    payments: many(debtPayments),
    amortizationSchedules: many(amortizationSchedules),
    refinanceOpportunities: many(refinanceOpportunities),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
    debt: one(debts, {
        fields: [debtPayments.debtId],
        references: [debts.id],
    }),
    user: one(users, {
        fields: [debtPayments.userId],
        references: [users.id],
    }),
}));

export const payoffStrategiesRelations = relations(payoffStrategies, ({ one, many }) => ({
    user: one(users, {
        fields: [payoffStrategies.userId],
        references: [users.id],
    }),
    amortizationSchedules: many(amortizationSchedules),
}));

export const amortizationSchedulesRelations = relations(amortizationSchedules, ({ one }) => ({
    debt: one(debts, {
        fields: [amortizationSchedules.debtId],
        references: [debts.id],
    }),
    strategy: one(payoffStrategies, {
        fields: [amortizationSchedules.strategyId],
        references: [payoffStrategies.id],
    }),
}));

export const refinanceOpportunitiesRelations = relations(refinanceOpportunities, ({ one }) => ({
    user: one(users, {
        fields: [refinanceOpportunities.userId],
        references: [users.id],
    }),
    debt: one(debts, {
        fields: [refinanceOpportunities.debtId],
        references: [debts.id],
    }),
}));

// Update usersRelations to include debt relations
export const usersRelations = relations(users, ({ many }) => ({
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    deviceSessions: many(deviceSessions),
    vaultMemberships: many(vaultMembers),
    ownedVaults: many(vaults),
    securityEvents: many(securityEvents),
    reports: many(reports),
    budgetAlerts: many(budgetAlerts),
    auditLogs: many(auditLogs),
    securityMarkers: many(securityMarkers),
    disputedTransactions: many(disputedTransactions),
    debts: many(debts),
    payoffStrategies: many(payoffStrategies),
    refinanceOpportunities: many(refinanceOpportunities),
}));

// ============================================================================
// TAX RELATIONS
// ============================================================================

export const taxProfilesRelations = relations(taxProfiles, ({ one }) => ({
    user: one(users, {
        fields: [taxProfiles.userId],
        references: [users.id],
    }),
}));

export const taxDeductionsRelations = relations(taxDeductions, ({ one }) => ({
    user: one(users, {
        fields: [taxDeductions.userId],
        references: [users.id],
    }),
    expense: one(expenses, {
        fields: [taxDeductions.expenseId],
        references: [expenses.id],
    }),
}));

export const taxReportsRelations = relations(taxReports, ({ one }) => ({
    user: one(users, {
        fields: [taxReports.userId],
        references: [users.id],
    }),
}));

export const balanceSnapshotsRelations = relations(balanceSnapshots, ({ one }) => ({
    user: one(users, {
        fields: [balanceSnapshots.userId],
        references: [users.id],
    }),
}));

export const liquidityAlertsRelations = relations(liquidityAlerts, ({ one }) => ({
    user: one(users, {
        fields: [liquidityAlerts.userId],
        references: [users.id],
    }),
}));

export const transferSuggestionsRelations = relations(transferSuggestions, ({ one }) => ({
    user: one(users, {
        fields: [transferSuggestions.userId],
        references: [users.id],
    }),
    sourceVault: one(vaults, {
        fields: [transferSuggestions.sourceVaultId],
        references: [vaults.id],
    }),
    destVault: one(vaults, {
        fields: [transferSuggestions.destVaultId],
        references: [vaults.id],
    }),
}));

// Forecasts Table (for AI-driven budget forecasting and simulations)
export const forecasts = pgTable('forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    forecastType: text('forecast_type').notNull(), // 'expense', 'income', 'budget', 'cash_flow'
    period: text('period').notNull(), // 'monthly', 'quarterly', 'yearly'
    forecastData: jsonb('forecast_data').notNull(), // Array of prediction points with dates and values
    parameters: jsonb('parameters').notNull(), // Model parameters, confidence intervals, etc.
    accuracy: doublePrecision('accuracy'), // Model accuracy score (0-1)
    confidenceLevel: doublePrecision('confidence_level').default(0.95), // Statistical confidence level
    scenario: text('scenario').default('baseline'), // 'baseline', 'optimistic', 'pessimistic', 'custom'
    isSimulation: boolean('is_simulation').default(false), // True for user-created what-if scenarios
    simulationInputs: jsonb('simulation_inputs'), // User inputs for simulations (e.g., income changes, expense adjustments)
    currency: text('currency').default('USD'),
    metadata: jsonb('metadata').default({
        modelType: 'linear_regression', // 'linear_regression', 'exponential_smoothing', 'arima'
        trainingDataPoints: 0,
        seasonalAdjustment: false,
        externalFactors: [], // inflation, market trends, etc.
        lastTrained: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecasts Relations
export const forecastsRelations = relations(forecasts, ({ one }) => ({
    user: one(users, {
        fields: [forecasts.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [forecasts.categoryId],
        references: [categories.id],
    }),
}));
