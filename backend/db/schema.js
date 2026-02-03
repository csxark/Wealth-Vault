
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision } from 'drizzle-orm/pg-core';
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
    taxCategoryId: uuid('tax_category_id').references(() => taxCategories.id, { onDelete: 'set null' }),
    taxDeductibilityConfidence: doublePrecision('tax_deductibility_confidence').default(0), // AI confidence (0-1)
    taxNotes: text('tax_notes'), // User or AI notes about tax treatment
    taxYear: integer('tax_year'), // Which tax year this applies to
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
