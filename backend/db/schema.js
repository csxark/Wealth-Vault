
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
    // Tax-related fields
    isTaxDeductible: boolean('is_tax_deductible').default(false),
    taxCategoryId: uuid('tax_category_id').references(() => taxCategories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    taxYear: integer('tax_year'), // The tax year this expense applies to
    taxNotes: text('tax_notes'), // Additional notes for tax purposes
    notes: text('notes'),
    status: text('status').default('completed'),
    metadata: jsonb('metadata').default({
        createdBy: 'system',
        lastModified: null,
        version: 1,
        flags: []
    }),
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

// Expense Shares Table (for splitting expenses among family members)
export const expenseShares = pgTable('expense_shares', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    shareAmount: numeric('share_amount', { precision: 12, scale: 2 }).notNull(),
    sharePercentage: doublePrecision('share_percentage'), // Optional percentage split
    isPaid: boolean('is_paid').default(false),
    paidAt: timestamp('paid_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Reimbursements Table (for tracking owed and settled amounts)
export const reimbursements = pgTable('reimbursements', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    toUserId: uuid('to_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    status: text('status').default('pending'), // pending, completed, cancelled
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }), // Optional link to original expense
    completedAt: timestamp('completed_at'),
    dueDate: timestamp('due_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Family Settings Table (for family-specific configurations)
export const familySettings = pgTable('family_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull().unique(),
    familyName: text('family_name'),
    defaultSplitMethod: text('default_split_method').default('equal'), // equal, percentage, custom
    currency: text('currency').default('USD'),
    monthlyBudget: numeric('monthly_budget', { precision: 12, scale: 2 }),
    enableReimbursements: boolean('enable_reimbursements').default(true),
    enableHealthScoring: boolean('enable_health_scoring').default(true),
    notificationSettings: jsonb('notification_settings').default({
        expenseAdded: true,
        reimbursementDue: true,
        goalMilestone: true,
        monthlySummary: true
    }),
    privacySettings: jsonb('privacy_settings').default({
        shareExpenses: 'family', // family, none
        shareGoals: 'family',
        shareHealthScore: 'family'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Shared Budgets Table (for collaborative budgeting)
export const sharedBudgets = pgTable('shared_budgets', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    totalBudget: numeric('total_budget', { precision: 12, scale: 2 }).notNull(),
    currentSpent: numeric('current_spent', { precision: 12, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    period: text('period').default('monthly'), // monthly, yearly
    startDate: timestamp('start_date').defaultNow(),
    endDate: timestamp('end_date'),
    approvalRequired: boolean('approval_required').default(false),
    approvalThreshold: numeric('approval_threshold', { precision: 12, scale: 2 }), // Expenses above this need approval
    isActive: boolean('is_active').default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').default({
        categories: [], // Allowed categories
        contributors: [], // User IDs who can contribute
        approvers: [] // User IDs who can approve
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Expense Approvals Table (for approval workflows)
export const expenseApprovals = pgTable('expense_approvals', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').default('pending'), // pending, approved, rejected
    approvalNotes: text('approval_notes'),
    requestedAt: timestamp('requested_at').defaultNow(),
    approvedAt: timestamp('approved_at'),
    metadata: jsonb('metadata').default({
        budgetId: null,
        amount: 0,
        category: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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

// Recurring Expenses Table
export const recurringExpenses = pgTable('recurring_expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    frequency: text('frequency').notNull(), // 'daily', 'weekly', 'monthly', 'yearly'
    interval: integer('interval').default(1), // every N days/weeks/months/years
    startDate: timestamp('start_date').defaultNow().notNull(),
    endDate: timestamp('end_date'), // optional end date
    nextDueDate: timestamp('next_due_date').notNull(),
    lastGeneratedDate: timestamp('last_generated_date'),
    isActive: boolean('is_active').default(true),
    isPaused: boolean('is_paused').default(false),
    paymentMethod: text('payment_method').default('other'),
    tags: jsonb('tags').default([]),
    notes: text('notes'),
    metadata: jsonb('metadata').default({
        totalGenerated: 0,
        lastAmount: 0,
        createdBy: 'user'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Subscriptions Table
export const subscriptions = pgTable('subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    serviceName: text('service_name').notNull(),
    description: text('description'),
    cost: numeric('cost', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    frequency: text('frequency').notNull(), // 'weekly', 'monthly', 'quarterly', 'yearly'
    renewalDate: timestamp('renewal_date').notNull(),
    autoRenewal: boolean('auto_renewal').default(true),
    status: text('status').default('active'), // 'active', 'cancelled', 'paused', 'expired'
    paymentMethod: text('payment_method').default('credit_card'),
    website: text('website'),
    loginCredentials: jsonb('login_credentials'), // { username, password } - encrypted
    tags: jsonb('tags').default([]),
    notes: text('notes'),
    cancellationDate: timestamp('cancellation_date'),
    lastChargedDate: timestamp('last_charged_date'),
    nextChargeDate: timestamp('next_charge_date'),
    trialEndDate: timestamp('trial_end_date'),
    isTrial: boolean('is_trial').default(false),
    metadata: jsonb('metadata').default({
        detectedFromExpense: false,
        expenseId: null,
        annualCost: 0,
        costTrend: [],
        lastReminderSent: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Bills Table (for automated bill payment reminders)
export const bills = pgTable('bills', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    name: text('name').notNull(), // e.g., "Electric Bill", "Rent"
    description: text('description'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    frequency: text('frequency').notNull(), // 'weekly', 'monthly', 'quarterly', 'yearly', 'one_time'
    dueDate: timestamp('due_date').notNull(),
    status: text('status').default('pending'), // 'pending', 'paid', 'overdue', 'scheduled', 'cancelled'
    autoPay: boolean('auto_pay').default(false),
    paymentMethod: text('payment_method').default('other'), // 'credit_card', 'debit_card', 'bank_transfer', 'check', 'cash', 'other'
    reminderDays: integer('reminder_days').default(3), // Days before due date to send reminder
    smartScheduleEnabled: boolean('smart_schedule_enabled').default(false),
    optimalPaymentDate: timestamp('optimal_payment_date'), // Suggested date based on cash flow
    scheduledPaymentDate: timestamp('scheduled_payment_date'), // User-scheduled payment date
    lastPaidDate: timestamp('last_paid_date'),
    payee: text('payee'), // Who to pay (e.g., "City Power Company")
    payeeAccount: text('payee_account'), // Account number or reference
    isRecurring: boolean('is_recurring').default(true),
    endDate: timestamp('end_date'), // For bills with end date (e.g., loan payments)
    tags: jsonb('tags').default([]),
    notes: text('notes'),
    // Detection metadata
    detectedFromExpense: boolean('detected_from_expense').default(false),
    detectionConfidence: integer('detection_confidence').default(0), // 0-100
    sourceExpenseIds: jsonb('source_expense_ids').default([]), // IDs of expenses that triggered detection
    // Smart scheduling metadata
    cashFlowAnalysis: jsonb('cash_flow_analysis').default({
        suggestedDate: null,
        confidence: 0,
        reason: null
    }),
    metadata: jsonb('metadata').default({
        lastReminderSent: null,
        reminderCount: 0,
        paymentHistory: [],
        lateFeeAmount: 0,
        gracePeriodDays: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Debts Table (for debt payoff tracking)
export const debts = pgTable('debts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    name: text('name').notNull(), // e.g., "Credit Card", "Car Loan"
    description: text('description'),
    type: text('type').notNull(), // 'credit_card', 'student_loan', 'car_loan', 'mortgage', 'personal_loan', 'medical', 'other'
    lender: text('lender'), // Bank or creditor name
    originalBalance: numeric('original_balance', { precision: 12, scale: 2 }).notNull(),
    currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull(),
    interestRate: doublePrecision('interest_rate').notNull(), // Annual interest rate (e.g., 18.99 for 18.99%)
    minimumPayment: numeric('minimum_payment', { precision: 12, scale: 2 }).notNull(),
    dueDate: timestamp('due_date'), // Monthly due date
    startDate: timestamp('start_date').defaultNow(), // When the debt was added/started
    estimatedPayoffDate: timestamp('estimated_payoff_date'), // Calculated payoff date
    isPriority: boolean('is_priority').default(false), // Mark as high priority
    status: text('status').default('active'), // 'active', 'paid_off', 'defaulted', 'in_collection'
    currency: text('currency').default('USD'),
    accountNumber: text('account_number'), // Masked account number
    notes: text('notes'),
    tags: jsonb('tags').default([]),
    metadata: jsonb('metadata').default({
        totalPaid: 0,
        totalInterestPaid: 0,
        paymentCount: 0,
        lastPaymentDate: null,
        interestCompounding: 'monthly', // 'daily', 'monthly', 'yearly'
        autopayEnabled: false
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Debt Payments Table (for tracking individual payments)
export const debtPayments = pgTable('debt_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    principalAmount: numeric('principal_amount', { precision: 12, scale: 2 }), // Portion applied to principal
    interestAmount: numeric('interest_amount', { precision: 12, scale: 2 }), // Portion applied to interest
    paymentDate: timestamp('payment_date').defaultNow().notNull(),
    paymentMethod: text('payment_method').default('other'), // 'credit_card', 'debit_card', 'bank_transfer', 'check', 'cash', 'other'
    isExtraPayment: boolean('is_extra_payment').default(false), // Above minimum payment
    notes: text('notes'),
    metadata: jsonb('metadata').default({
        balanceBefore: 0,
        balanceAfter: 0,
        confirmationNumber: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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

// Financial Health Scores Table
export const financialHealthScores = pgTable('financial_health_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    overallScore: doublePrecision('overall_score').notNull(),
    rating: text('rating').notNull(),
    dtiScore: doublePrecision('dti_score').notNull(),
    savingsRateScore: doublePrecision('savings_rate_score').notNull(),
    volatilityScore: doublePrecision('volatility_score').notNull(),
    emergencyFundScore: doublePrecision('emergency_fund_score').notNull(),
    budgetAdherenceScore: doublePrecision('budget_adherence_score').notNull(),
    goalProgressScore: doublePrecision('goal_progress_score').notNull(),
    metrics: jsonb('metrics').notNull(),
    recommendation: text('recommendation').notNull(),
    insights: jsonb('insights').notNull(),
    cashFlowPrediction: jsonb('cash_flow_prediction').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    calculatedAt: timestamp('calculated_at').defaultNow(),
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

// Bills Relations
export const billsRelations = relations(bills, ({ one }) => ({
    user: one(users, {
        fields: [bills.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [bills.categoryId],
        references: [categories.id],
    }),
}));

// Debts Relations
export const debtsRelations = relations(debts, ({ one, many }) => ({
    user: one(users, {
        fields: [debts.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [debts.categoryId],
        references: [categories.id],
    }),
    payments: many(debtPayments),
}));

// Debt Payments Relations
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

// No relations needed for exchangeRates as it's a standalone reference table

// Investment Relations
export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
    user: one(users, {
        fields: [portfolios.userId],
        references: [users.id],
    }),
    investments: many(investments),
}));

export const investmentsRelations = relations(investments, ({ one, many }) => ({
    portfolio: one(portfolios, {
        fields: [investments.portfolioId],
        references: [portfolios.id],
    }),
    user: one(users, {
        fields: [investments.userId],
        references: [users.id],
    }),
    transactions: many(investmentTransactions),
    priceHistory: many(priceHistory),
}));

export const investmentTransactionsRelations = relations(investmentTransactions, ({ one }) => ({
    investment: one(investments, {
        fields: [investmentTransactions.investmentId],
        references: [investments.id],
    }),
    portfolio: one(portfolios, {
        fields: [investmentTransactions.portfolioId],
        references: [portfolios.id],
    }),
    user: one(users, {
        fields: [investmentTransactions.userId],
        references: [users.id],
    }),
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
    investment: one(investments, {
        fields: [priceHistory.investmentId],
        references: [investments.id],
    }),
}));

// Family Relations
export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
    expense: one(expenses, {
        fields: [expenseShares.expenseId],
        references: [expenses.id],
    }),
    vault: one(vaults, {
        fields: [expenseShares.vaultId],
        references: [vaults.id],
    }),
    user: one(users, {
        fields: [expenseShares.userId],
        references: [users.id],
    }),
}));

export const reimbursementsRelations = relations(reimbursements, ({ one }) => ({
    vault: one(vaults, {
        fields: [reimbursements.vaultId],
        references: [vaults.id],
    }),
    fromUser: one(users, {
        fields: [reimbursements.fromUserId],
        references: [users.id],
        relationName: 'reimbursements_from'
    }),
    toUser: one(users, {
        fields: [reimbursements.toUserId],
        references: [users.id],
        relationName: 'reimbursements_to'
    }),
    expense: one(expenses, {
        fields: [reimbursements.expenseId],
        references: [expenses.id],
    }),
}));

export const familySettingsRelations = relations(familySettings, ({ one }) => ({
    vault: one(vaults, {
        fields: [familySettings.vaultId],
        references: [vaults.id],
    }),
}));

// Shared Budgets Relations
export const sharedBudgetsRelations = relations(sharedBudgets, ({ one, many }) => ({
    vault: one(vaults, {
        fields: [sharedBudgets.vaultId],
        references: [vaults.id],
    }),
    createdBy: one(users, {
        fields: [sharedBudgets.createdBy],
        references: [users.id],
    }),
}));

// Expense Approvals Relations
export const expenseApprovalsRelations = relations(expenseApprovals, ({ one }) => ({
    expense: one(expenses, {
        fields: [expenseApprovals.expenseId],
        references: [expenses.id],
    }),
    vault: one(vaults, {
        fields: [expenseApprovals.vaultId],
        references: [vaults.id],
    }),
    requestedBy: one(users, {
        fields: [expenseApprovals.requestedBy],
        references: [users.id],
        relationName: 'expense_approvals_requested_by'
    }),
    approvedBy: one(users, {
        fields: [expenseApprovals.approvedBy],
        references: [users.id],
        relationName: 'expense_approvals_approved_by'
    }),
}));

// Update vaults relations to include family tables
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
    expenseShares: many(expenseShares),
    reimbursements: many(reimbursements),
    familySettings: one(familySettings),
    sharedBudgets: many(sharedBudgets),
    expenseApprovals: many(expenseApprovals),
}));

// Bank Accounts Table (for Plaid integration)

export const bankAccounts = pgTable('bank_accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    plaidAccountId: text('plaid_account_id').notNull(),
    plaidItemId: text('plaid_item_id').notNull(),
    name: text('name').notNull(),
    officialName: text('official_name'),
    type: text('type').notNull(), // checking, savings, credit, loan, investment
    subtype: text('subtype'), // checking, savings, credit_card, etc.
    mask: text('mask'), // last 4 digits
    institutionId: text('institution_id').notNull(),
    institutionName: text('institution_name').notNull(),
    balanceCurrent: numeric('balance_current', { precision: 15, scale: 2 }),
    balanceAvailable: numeric('balance_available', { precision: 15, scale: 2 }),
    currency: text('currency').default('USD'),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Bank Transactions Table (raw transactions from Plaid)
export const bankTransactions = pgTable('bank_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, { onDelete: 'cascade' }).notNull(),
    plaidTransactionId: text('plaid_transaction_id').notNull().unique(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }), // Link to imported expense
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    originalDescription: text('original_description'),
    date: timestamp('date').notNull(),
    category: jsonb('category'), // Plaid's category hierarchy
    categoryId: text('category_id'), // Plaid's category ID
    pending: boolean('pending').default(false),
    pendingTransactionId: text('pending_transaction_id'),
    accountOwner: text('account_owner'),
    location: jsonb('location'), // { address, city, region, postal_code, country, lat, lon, store_number }
    paymentMeta: jsonb('payment_meta'), // { reference_number, ppd_id, payee, by_order_of, payer, payment_method, payment_processor, reason }
    transactionType: text('transaction_type'), // digital, place, special, unresolved
    transactionCode: text('transaction_code'), // adjustment, atm, bank_charge, bill_payment, etc.
    isImported: boolean('is_imported').default(false),
    importStatus: text('import_status').default('pending'), // pending, imported, duplicate, error
    importError: text('import_error'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Update users relations to include portfolios, subscriptions, bills, debts, and family relations
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
    portfolios: many(portfolios),
    subscriptions: many(subscriptions),
    bills: many(bills),
    debts: many(debts),
    debtPayments: many(debtPayments),
    expenseShares: many(expenseShares),
    sentReimbursements: many(reimbursements, { relationName: 'reimbursements_from' }),
    receivedReimbursements: many(reimbursements, { relationName: 'reimbursements_to' }),
    bankAccounts: many(bankAccounts),
    bankTransactions: many(bankTransactions),
    emergencyFundGoals: many(emergencyFundGoals),
    creditScores: many(creditScores),
    creditScoreAlerts: many(creditScoreAlerts),
    billNegotiations: many(billNegotiation),
    negotiationAttempts: many(negotiationAttempts),
}));





// Bank Accounts Relations
export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
    user: one(users, {
        fields: [bankAccounts.userId],
        references: [users.id],
    }),
    transactions: many(bankTransactions),
}));

// Bank Transactions Relations
export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
    user: one(users, {
        fields: [bankTransactions.userId],
        references: [users.id],
    }),
    bankAccount: one(bankAccounts, {
        fields: [bankTransactions.bankAccountId],
        references: [bankAccounts.id],
    }),
    expense: one(expenses, {
        fields: [bankTransactions.expenseId],
        references: [expenses.id],
    }),
}));

// Savings Roundups Relations
export const savingsRoundupsRelations = relations(savingsRoundups, ({ one }) => ({
    user: one(users, {
        fields: [savingsRoundups.userId],
        references: [users.id],
    }),
    goal: one(goals, {
        fields: [savingsRoundups.goalId],
        references: [goals.id],
    }),
    expense: one(expenses, {
        fields: [savingsRoundups.expenseId],
        references: [expenses.id],
    }),
}));

// Education Content Table
export const educationContent = pgTable('education_content', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    content: text('content').notNull(), // Full article content or video URL
    type: text('type').notNull(), // 'article', 'video', 'infographic'
    category: text('category').notNull(), // 'budgeting', 'saving', 'investing', 'debt', 'credit', 'general'
    difficulty: text('difficulty').default('beginner'), // 'beginner', 'intermediate', 'advanced'
    estimatedReadTime: integer('estimated_read_time').default(5), // in minutes
    tags: jsonb('tags').default([]),
    isActive: boolean('is_active').default(true),
    targetAudience: jsonb('target_audience').default({}), // { minScore: 0, maxScore: 100, financialHealthAreas: ['savings', 'budgeting'] }
    metadata: jsonb('metadata').default({
        author: null,
        source: null,
        lastReviewed: null,
        viewCount: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Education Quizzes Table
export const educationQuizzes = pgTable('education_quizzes', {
    id: uuid('id').defaultRandom().primaryKey(),
    contentId: uuid('content_id').references(() => educationContent.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    questions: jsonb('questions').notNull(), // Array of question objects with options and correct answers
    passingScore: integer('passing_score').default(70), // Minimum percentage to pass
    timeLimit: integer('time_limit'), // Time limit in minutes, null for no limit
    maxAttempts: integer('max_attempts').default(3),
    isActive: boolean('is_active').default(true),
    difficulty: text('difficulty').default('beginner'),
    tags: jsonb('tags').default([]),
    metadata: jsonb('metadata').default({
        totalQuestions: 0,
        averageScore: 0,
        completionRate: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User Education Progress Table
export const userEducationProgress = pgTable('user_education_progress', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    contentId: uuid('content_id').references(() => educationContent.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').default('not_started'), // 'not_started', 'in_progress', 'completed'
    progress: doublePrecision('progress').default(0), // 0-100 percentage
    timeSpent: integer('time_spent').default(0), // Time spent in minutes
    completedAt: timestamp('completed_at'),
    lastAccessedAt: timestamp('last_accessed_at').defaultNow(),
    quizScore: integer('quiz_score'), // Score percentage if quiz completed
    quizPassed: boolean('quiz_passed').default(false),
    metadata: jsonb('metadata').default({
        bookmarks: [],
        notes: '',
        favorite: false
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Quiz Attempts Table
export const quizAttempts = pgTable('quiz_attempts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    quizId: uuid('quiz_id').references(() => educationQuizzes.id, { onDelete: 'cascade' }).notNull(),
    attemptNumber: integer('attempt_number').default(1),
    answers: jsonb('answers').notNull(), // User's answers
    score: integer('score').notNull(), // Percentage score
    passed: boolean('passed').default(false),
    timeTaken: integer('time_taken'), // Time taken in minutes
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    metadata: jsonb('metadata').default({
        correctAnswers: 0,
        totalQuestions: 0,
        questionBreakdown: []
    }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Education Content Relations
export const educationContentRelations = relations(educationContent, ({ many }) => ({
    quizzes: many(educationQuizzes),
    userProgress: many(userEducationProgress),
}));

// Education Quizzes Relations
export const educationQuizzesRelations = relations(educationQuizzes, ({ one, many }) => ({
    content: one(educationContent, {
        fields: [educationQuizzes.contentId],
        references: [educationContent.id],
    }),
    attempts: many(quizAttempts),
}));

// User Education Progress Relations
export const userEducationProgressRelations = relations(userEducationProgress, ({ one }) => ({
    user: one(users, {
        fields: [userEducationProgress.userId],
        references: [users.id],
    }),
    content: one(educationContent, {
        fields: [userEducationProgress.contentId],
        references: [educationContent.id],
    }),
}));

// Quiz Attempts Relations
export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
    user: one(users, {
        fields: [quizAttempts.userId],
        references: [users.id],
    }),
    quiz: one(educationQuizzes, {
        fields: [quizAttempts.quizId],
        references: [educationQuizzes.id],
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

// Cash Flow Models Table (for storing trained ML models per user)
export const cashFlowModels = pgTable('cash_flow_models', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    modelType: text('model_type').notNull(), // 'tensorflow', 'linear_regression', 'neural_network'
    modelData: jsonb('model_data').notNull(), // Serialized model weights/parameters
    modelArchitecture: jsonb('model_architecture'), // Model structure (layers, neurons, etc.)
    trainingData: jsonb('training_data'), // Reference to training dataset used
    accuracy: doublePrecision('accuracy'), // Model accuracy score (0-1)
    lastTrained: timestamp('last_trained').defaultNow(),
    nextRetraining: timestamp('next_retraining'), // When to retrain the model
    isActive: boolean('is_active').default(true),
    currency: text('currency').default('USD'),
    metadata: jsonb('metadata').default({
        trainingSamples: 0,
        features: [], // Features used in training
        hyperparameters: {}, // Learning rate, epochs, etc.
        performanceMetrics: {}, // MSE, MAE, R2, etc.
        version: 1
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

// Challenges Table (Social Financial Challenges)
export const challenges = pgTable('challenges', {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    targetType: text('target_type').notNull(), // 'save_amount', 'reduce_expense', 'increase_income'
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    targetCategoryId: uuid('target_category_id').references(() => categories.id, { onDelete: 'set null' }), // For reduce_expense challenges
    currency: text('currency').default('USD'),
    startDate: timestamp('start_date').defaultNow().notNull(),
    endDate: timestamp('end_date').notNull(),
    isPublic: boolean('is_public').default(true),
    maxParticipants: integer('max_participants'), // Optional limit
    status: text('status').default('active'), // 'active', 'completed', 'cancelled'
    rules: jsonb('rules').default({}), // Additional rules like frequency, milestones
    metadata: jsonb('metadata').default({
        tags: [],
        difficulty: 'medium',
        category: 'savings'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Challenge Participants Table
export const challengeParticipants = pgTable('challenge_participants', {
    id: uuid('id').defaultRandom().primaryKey(),
    challengeId: uuid('challenge_id').references(() => challenges.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    joinedAt: timestamp('joined_at').defaultNow(),
    currentProgress: numeric('current_progress', { precision: 12, scale: 2 }).default('0'),
    targetProgress: numeric('target_progress', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('active'), // 'active', 'completed', 'withdrawn'
    lastUpdated: timestamp('last_updated').defaultNow(),
    metadata: jsonb('metadata').default({
        milestones: [],
        streak: 0,
        bestStreak: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Challenges Relations
export const challengesRelations = relations(challenges, ({ one, many }) => ({
    creator: one(users, {
        fields: [challenges.creatorId],
        references: [users.id],
    }),
    targetCategory: one(categories, {
        fields: [challenges.targetCategoryId],
        references: [categories.id],
    }),
    participants: many(challengeParticipants),
}));

// Challenge Participants Relations
export const challengeParticipantsRelations = relations(challengeParticipants, ({ one }) => ({
    challenge: one(challenges, {
        fields: [challengeParticipants.challengeId],
        references: [challenges.id],
    }),
    user: one(users, {
        fields: [challengeParticipants.userId],
        references: [users.id],
    }),
}));

// Emergency Fund Goals Table
export const emergencyFundGoals = pgTable('emergency_fund_goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    targetMonths: integer('target_months').notNull().default(3), // 3-6 months of expenses
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    currentSavings: numeric('current_savings', { precision: 12, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    status: text('status').default('active'), // 'active', 'completed', 'paused'
    monthlyExpenses: numeric('monthly_expenses', { precision: 12, scale: 2 }).default('0'), // For calculation
    notes: text('notes'),
    metadata: jsonb('metadata').default({
        lastContribution: null,
        totalContributions: 0,
        contributionHistory: []
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Tax Categories Table (IRS category codes)
export const taxCategories = pgTable('tax_categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(), // IRS category code (e.g., 'DED_MEDICAL', 'DED_CHARITY')
    name: text('name').notNull(), // Display name (e.g., 'Medical & Dental Expenses')
    description: text('description'), // Detailed description
    categoryType: text('category_type').notNull(), // 'deduction', 'credit', 'exemption'
    irsReference: text('irs_reference'), // IRS publication or form reference
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({
        examples: [], // Example expenses that qualify
        documentationRequired: false,
        limits: null // Annual limits if applicable
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Tax Reports Table (for generated tax reports)
export const taxReports = pgTable('tax_reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taxYear: integer('tax_year').notNull(),
    reportType: text('report_type').notNull(), // 'summary', 'detailed', 'schedule_c', 'schedule_a'
    format: text('format').notNull(), // 'pdf', 'excel', 'csv'
    url: text('url').notNull(),
    totalDeductions: numeric('total_deductions', { precision: 15, scale: 2 }).default('0'),
    totalCredits: numeric('total_credits', { precision: 15, scale: 2 }).default('0'),
    status: text('status').default('generated'), // 'generated', 'downloaded', 'archived'
    metadata: jsonb('metadata').default({
        expenseCount: 0,
        categoriesIncluded: [],
        generatedBy: 'system'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});


// Emergency Fund Goals Relations
export const emergencyFundGoalsRelations = relations(emergencyFundGoals, ({ one }) => ({
    user: one(users, {
        fields: [emergencyFundGoals.userId],
        references: [users.id],
    }),
}));

// Tax Categories Relations
export const taxCategoriesRelations = relations(taxCategories, ({ many }) => ({
    expenses: many(expenses),
}));

// Tax Reports Relations
export const taxReportsRelations = relations(taxReports, ({ one }) => ({
    user: one(users, {
        fields: [taxReports.userId],
        references: [users.id],
    }),
}));

// Credit Scores Relations
export const creditScoresRelations = relations(creditScores, ({ one }) => ({
    user: one(users, {
        fields: [creditScores.userId],
        references: [users.id],
    }),
}));

// Credit Score Alerts Relations
export const creditScoreAlertsRelations = relations(creditScoreAlerts, ({ one }) => ({
    user: one(users, {
        fields: [creditScoreAlerts.userId],
        references: [users.id],
    }),
    creditScore: one(creditScores, {
        fields: [creditScoreAlerts.creditScoreId],
        references: [creditScores.id],
    }),
}));

// Credit Scores Table
export const creditScores = pgTable('credit_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    bureau: text('bureau').notNull(), // 'equifax', 'experian', 'transunion'
    score: integer('score').notNull(), // Credit score (300-850)
    rating: text('rating').notNull(), // 'poor', 'fair', 'good', 'very_good', 'excellent'
    previousScore: integer('previous_score'), // Previous score for comparison
    scoreChange: integer('score_change'), // Change from previous score
    factors: jsonb('factors').default([]), // Factors affecting the score
    accountNumber: text('account_number'), // Masked account number
    reportDate: timestamp('report_date'), // Date of the credit report
    metadata: jsonb('metadata').default({
        inquiryCount: 0,
        accountCount: 0,
        latePayments: 0,
        creditUtilization: 0
    }),
    isActive: boolean('is_active').default(true),
    lastUpdated: timestamp('last_updated').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Credit Score Alerts Table
export const creditScoreAlerts = pgTable('credit_score_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    creditScoreId: uuid('credit_score_id').references(() => creditScores.id, { onDelete: 'cascade' }).notNull(),
    alertType: text('alert_type').notNull(), // 'score_increase', 'score_decrease', 'new_inquiry', 'new_account', 'late_payment', 'account_closed'
    oldValue: integer('old_value'), // Previous score value
    newValue: integer('new_value'), // New score value
    change: integer('change'), // Change amount (positive or negative)
    message: text('message').notNull(), // Alert message
    description: text('description'), // Detailed description
    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),
    metadata: jsonb('metadata').default({
        bureau: null,
        accountNumber: null,
        details: {}
    }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Retirement Planning Table
export const retirementPlanning = pgTable('retirement_planning', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currentAge: integer('current_age').notNull(),
    retirementAge: integer('retirement_age').notNull(),
    currentSavings: numeric('current_savings', { precision: 15, scale: 2 }).notNull().default('0'),
    desiredRetirementSavings: numeric('desired_retirement_savings', { precision: 15, scale: 2 }).notNull(),
    expectedAnnualReturn: doublePrecision('expected_annual_return').default(0.07), // 7% default
    yearsToRetirement: integer('years_to_retirement').notNull(),
    monthlyContribution: numeric('monthly_contribution', { precision: 12, scale: 2 }).default('0'),
    totalAmountNeeded: numeric('total_amount_needed', { precision: 15, scale: 2 }).notNull(), // Amount needed to save from now until retirement
    inflationRate: doublePrecision('inflation_rate').default(0.03), // 3% default
    currency: text('currency').default('USD'),
    // Calculation results
    calculatedMonthlyContribution: numeric('calculated_monthly_contribution', { precision: 12, scale: 2 }).default('0'),
    projectedRetirementAmount: numeric('projected_retirement_amount', { precision: 15, scale: 2 }).default('0'),
    retirementGoalMet: boolean('retirement_goal_met').default(false),
    shortfallAmount: numeric('shortfall_amount', { precision: 15, scale: 2 }).default('0'),
    // Analysis
    status: text('status').default('active'), // 'active', 'on_track', 'off_track', 'ahead'
    lastCalculatedAt: timestamp('last_calculated_at').defaultNow(),
    metadata: jsonb('metadata').default({
        assumptions: {}, // Store calculation assumptions
        scenarioAnalysis: [], // Different scenarios (conservative, moderate, aggressive)
        milestones: [] // Age-based milestones
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Net Worth Tracker Table
export const netWorth = pgTable('net_worth', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Assets
    cash: numeric('cash', { precision: 15, scale: 2 }).default('0'),
    savingsAccount: numeric('savings_account', { precision: 15, scale: 2 }).default('0'),
    checkingAccount: numeric('checking_account', { precision: 15, scale: 2 }).default('0'),
    emergencyFund: numeric('emergency_fund', { precision: 15, scale: 2 }).default('0'),
    investments: numeric('investments', { precision: 15, scale: 2 }).default('0'),
    retirementAccounts: numeric('retirement_accounts', { precision: 15, scale: 2 }).default('0'),
    realEstate: numeric('real_estate', { precision: 15, scale: 2 }).default('0'),
    vehicles: numeric('vehicles', { precision: 15, scale: 2 }).default('0'),
    otherAssets: numeric('other_assets', { precision: 15, scale: 2 }).default('0'),
    totalAssets: numeric('total_assets', { precision: 15, scale: 2 }).default('0'),
    
    // Liabilities
    creditCardDebt: numeric('credit_card_debt', { precision: 15, scale: 2 }).default('0'),
    autoLoans: numeric('auto_loans', { precision: 15, scale: 2 }).default('0'),
    studentLoans: numeric('student_loans', { precision: 15, scale: 2 }).default('0'),
    mortgage: numeric('mortgage', { precision: 15, scale: 2 }).default('0'),
    personalLoans: numeric('personal_loans', { precision: 15, scale: 2 }).default('0'),
    otherLiabilities: numeric('other_liabilities', { precision: 15, scale: 2 }).default('0'),
    totalLiabilities: numeric('total_liabilities', { precision: 15, scale: 2 }).default('0'),
    
    // Net Worth (Assets - Liabilities)
    netWorth: numeric('net_worth', { precision: 15, scale: 2 }).default('0'),
    
    // Currency and metadata
    currency: text('currency').default('USD'),
    notes: text('notes'),
    metadata: jsonb('metadata').default({
        previousNetWorth: null,
        changes: [],
        breakdown: {}
    }),
    
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Bill Negotiation Table
export const billNegotiation = pgTable('bill_negotiation', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    billId: uuid('bill_id').references(() => bills.id, { onDelete: 'cascade' }).notNull(),
    
    // Negotiation Tips & Strategies
    category: text('category').notNull(), // 'utilities', 'insurance', 'internet', 'phone', 'subscription', 'loan', 'services', 'other'
    tips: jsonb('tips').default([]), // Array of negotiation tips
    strategies: jsonb('strategies').default([]), // Array of strategies with difficulty levels
    
    // Savings Analysis
    currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).notNull(),
    estimatedSavings: numeric('estimated_savings', { precision: 12, scale: 2 }).default('0'),
    estimatedSavingsPercentage: numeric('estimated_savings_percentage', { precision: 5, scale: 2 }).default('0'),
    annualSavingsPotential: numeric('annual_savings_potential', { precision: 12, scale: 2 }).default('0'),
    
    // Negotiation Progress
    status: text('status').default('pending'), // 'pending', 'attempted', 'successful', 'unsuccessful', 'no_action'
    attemptCount: integer('attempt_count').default(0),
    lastAttemptDate: timestamp('last_attempt_date'),
    
    // Negotiation Results
    newAmount: numeric('new_amount', { precision: 12, scale: 2 }),
    savingsAchieved: numeric('savings_achieved', { precision: 12, scale: 2 }),
    negotiationNotes: text('negotiation_notes'),
    
    // Comparable Data
    marketAverage: numeric('market_average', { precision: 12, scale: 2 }),
    savingsPotential: jsonb('savings_potential').default({ low: 0, medium: 0, high: 0 }),
    
    // Metadata
    providerInfo: jsonb('provider_info').default({}),
    successTips: jsonb('success_tips').default([]),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }).default('0.5'),
    
    metadata: jsonb('metadata').default({
        lastRecommendedAt: null,
        userEngaged: false,
        tags: []
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Negotiation Tips Table (Pre-defined tips by category)
export const negotiationTips = pgTable('negotiation_tips', {
    id: uuid('id').defaultRandom().primaryKey(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    strategy: text('strategy').notNull(),
    difficulty: text('difficulty').default('medium'), // 'easy', 'medium', 'hard'
    estimatedSavings: numeric('estimated_savings', { precision: 5, scale: 2 }).default('0'),
    successRate: numeric('success_rate', { precision: 3, scale: 2 }).default('0.5'),
    implementationTime: text('implementation_time'),
    tags: jsonb('tags').default([]),
    
    // Contact templates
    scriptTemplate: text('script_template'),
    bestTimeToNegotiate: text('best_time_to_negotiate'),
    requiredDocuments: jsonb('required_documents').default([]),
    
    isActive: boolean('is_active').default(true),
    displayOrder: integer('display_order').default(0),
    
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Negotiation Attempts Table
export const negotiationAttempts = pgTable('negotiation_attempts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    billNegotiationId: uuid('bill_negotiation_id').references(() => billNegotiation.id, { onDelete: 'cascade' }).notNull(),
    
    // Attempt Details
    attemptNumber: integer('attempt_number').notNull(),
    attemptDate: timestamp('attempt_date').defaultNow(),
    contactMethod: text('contact_method'), // 'phone', 'email', 'chat', 'in_person'
    
    // Results
    status: text('status').default('pending'), // 'pending', 'in_progress', 'successful', 'unsuccessful', 'waiting'
    outcomeDescription: text('outcome_description'),
    
    // Financial Impact
    amountBefore: numeric('amount_before', { precision: 12, scale: 2 }),
    amountAfter: numeric('amount_after', { precision: 12, scale: 2 }),
    savings: numeric('savings', { precision: 12, scale: 2 }),
    
    // Follow-up
    followUpDate: timestamp('follow_up_date'),
    followUpNotes: text('follow_up_notes'),
    
    // Additional Context
    tipsUsed: jsonb('tips_used').default([]),
    notes: text('notes'),
    
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Bill Negotiation Relations
export const billNegotiationRelations = relations(billNegotiation, ({ one, many }) => ({
    user: one(users, {
        fields: [billNegotiation.userId],
        references: [users.id],
    }),
    bill: one(bills, {
        fields: [billNegotiation.billId],
        references: [bills.id],
    }),
    attempts: many(negotiationAttempts),
}));

// Negotiation Attempts Relations
export const negotiationAttemptsRelations = relations(negotiationAttempts, ({ one }) => ({
    user: one(users, {
        fields: [negotiationAttempts.userId],
        references: [users.id],
    }),
    billNegotiation: one(billNegotiation, {
        fields: [negotiationAttempts.billNegotiationId],
        references: [billNegotiation.id],
    }),
}));
