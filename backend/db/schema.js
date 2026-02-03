
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

// Asset Relations
export const fixedAssetsRelations = relations(fixedAssets, ({ one, many }) => ({
    user: one(users, {
        fields: [fixedAssets.userId],
        references: [users.id],
    }),
    valuations: many(assetValuations),
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
        inactivity threshold: 90, // Days of inactivity
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
}));

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

// Tax Relations
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
