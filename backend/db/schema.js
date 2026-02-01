
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

// User Financial Health Scores Table (Behavioral Finance)
export const userScores = pgTable('user_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    overallScore: integer('overall_score').default(0), // 0-100
    budgetAdherenceScore: integer('budget_adherence_score').default(0), // 0-100
    savingsRateScore: integer('savings_rate_score').default(0), // 0-100
    consistencyScore: integer('consistency_score').default(0), // 0-100
    impulseControlScore: integer('impulse_control_score').default(0), // 0-100
    planningScore: integer('planning_score').default(0), // 0-100
    scoreHistory: jsonb('score_history').default([]), // Array of historical scores: [{ date, overallScore, breakdown }]
    insights: jsonb('insights').default({}), // AI-generated insights about spending behavior
    strengths: jsonb('strengths').default([]), // Array of positive behaviors
    improvements: jsonb('improvements').default([]), // Array of areas to improve
    currentStreak: integer('current_streak').default(0), // Days of positive financial behavior
    longestStreak: integer('longest_streak').default(0),
    level: integer('level').default(1), // Gamification level (1-100)
    experiencePoints: integer('experience_points').default(0),
    nextLevelThreshold: integer('next_level_threshold').default(100),
    lastCalculatedAt: timestamp('last_calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Badges Table (Gamification)
export const badges = pgTable('badges', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    badgeType: text('badge_type').notNull(), // 'budget_master', 'savings_champion', 'consistency_king', etc.
    badgeName: text('badge_name').notNull(),
    badgeDescription: text('badge_description').notNull(),
    badgeIcon: text('badge_icon').default('🏆'),
    badgeTier: text('badge_tier').default('bronze'), // bronze, silver, gold, platinum, diamond
    requirement: jsonb('requirement').notNull(), // { type, threshold, description }
    progress: integer('progress').default(0), // Current progress towards requirement
    earnedAt: timestamp('earned_at'),
    isUnlocked: boolean('is_unlocked').default(false),
    experienceReward: integer('experience_reward').default(50),
    metadata: jsonb('metadata').default({
        category: 'general',
        rarity: 'common',
        displayOrder: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Habit Logs Table (Behavioral Tracking)
export const habitLogs = pgTable('habit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    habitType: text('habit_type').notNull(), // 'impulse_buy', 'weekend_overspend', 'budget_check', 'savings_deposit', etc.
    habitCategory: text('habit_category').notNull(), // 'positive', 'negative', 'neutral'
    description: text('description').notNull(),
    detectedBy: text('detected_by').default('system'), // 'system', 'ai', 'user'
    confidence: doublePrecision('confidence').default(0.8), // AI confidence in detection (0-1)
    impactScore: integer('impact_score').default(0), // -100 to +100 (negative = bad habit, positive = good habit)
    relatedExpenseId: uuid('related_expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    relatedGoalId: uuid('related_goal_id').references(() => goals.id, { onDelete: 'set null' }),
    contextData: jsonb('context_data').default({}), // { dayOfWeek, timeOfDay, location, amount, category, trigger }
    aiAnalysis: jsonb('ai_analysis').default({}), // Gemini's psychological analysis
    userAcknowledged: boolean('user_acknowledged').default(false),
    acknowledgedAt: timestamp('acknowledged_at'),
    correctionAction: text('correction_action'), // What user did to address negative habit
    loggedAt: timestamp('logged_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Tax Categories Table
export const taxCategories = pgTable('tax_categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryName: text('category_name').notNull().unique(),
    deductibilityType: text('deductibility_type').notNull(), // 'fully_deductible', 'partially_deductible', 'non_deductible'
    deductibilityRate: doublePrecision('deductibility_rate').default(0), // 0-1 (e.g., 0.5 = 50% deductible)
    taxJurisdiction: text('tax_jurisdiction').default('US_FEDERAL'), // 'US_FEDERAL', 'US_STATE', 'UK', 'CA', etc.
    description: text('description'),
    applicableExpenseCategories: text('applicable_expense_categories').array(), // Array of expense category names
    irs_code: text('irs_code'), // IRS tax code reference (e.g., 'Section 162')
    conditionsForDeductibility: jsonb('conditions_for_deductibility').default({}), // Requirements to qualify
    exampleExpenses: text('example_expenses').array(),
    maxDeductionLimit: doublePrecision('max_deduction_limit'), // Annual limit, if any
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User Tax Profiles Table
export const userTaxProfiles = pgTable('user_tax_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    filingStatus: text('filing_status').notNull(), // 'single', 'married_jointly', 'married_separately', 'head_of_household'
    taxJurisdiction: text('tax_jurisdiction').default('US_FEDERAL'),
    stateOfResidence: text('state_of_residence'),
    annualIncome: doublePrecision('annual_income').default(0),
    estimatedTaxBracket: text('estimated_tax_bracket'), // '10%', '12%', '22%', '24%', '32%', '35%', '37%'
    standardDeduction: doublePrecision('standard_deduction').default(0), // Automatically calculated based on filing status
    dependents: integer('dependents').default(0),
    selfEmployed: boolean('self_employed').default(false),
    businessOwner: boolean('business_owner').default(false),
    quarterlyTaxPayer: boolean('quarterly_tax_payer').default(false),
    lastFilingDate: timestamp('last_filing_date'),
    nextFilingDeadline: timestamp('next_filing_deadline'),
    taxPreferences: jsonb('tax_preferences').default({}), // { aggressiveDeductions, riskTolerance, auditWorry }
    witholdingAllowances: integer('witholding_allowances').default(0),
    estimatedQuarterlyPayments: doublePrecision('estimated_quarterly_payments').default(0),
    ytdTaxPaid: doublePrecision('ytd_tax_paid').default(0), // Year-to-date tax paid
    ytdTaxableIncome: doublePrecision('ytd_taxable_income').default(0),
    ytdDeductions: doublePrecision('ytd_deductions').default(0),
    aiTaxAdvice: jsonb('ai_tax_advice').default({}), // Gemini AI recommendations
    lastAIAnalysisDate: timestamp('last_ai_analysis_date'),
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
    userScore: many(userScores),
    badges: many(badges),
    habitLogs: many(habitLogs),
    taxProfile: many(userTaxProfiles),
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

export const expensesRelations = relations(expenses, ({ one }) => ({
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
    taxCategory: one(taxCategories, {
        fields: [expenses.taxCategoryId],
        references: [taxCategories.id],
    }),
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

export const userScoresRelations = relations(userScores, ({ one }) => ({
    user: one(users, {
        fields: [userScores.userId],
        references: [users.id],
    }),
}));

export const badgesRelations = relations(badges, ({ one }) => ({
    user: one(users, {
        fields: [badges.userId],
        references: [users.id],
    }),
}));

export const habitLogsRelations = relations(habitLogs, ({ one }) => ({
    user: one(users, {
        fields: [habitLogs.userId],
        references: [users.id],
    }),
    relatedExpense: one(expenses, {
        fields: [habitLogs.relatedExpenseId],
        references: [expenses.id],
    }),
    relatedGoal: one(goals, {
        fields: [habitLogs.relatedGoalId],
        references: [goals.id],
    }),
}));

export const userTaxProfilesRelations = relations(userTaxProfiles, ({ one }) => ({
    user: one(users, {
        fields: [userTaxProfiles.userId],
        references: [users.id],
    }),
}));

// No relations needed for exchangeRates and taxCategories as they are standalone reference tables

