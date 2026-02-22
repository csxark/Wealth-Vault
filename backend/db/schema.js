
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision, index, serial, varchar, date } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// CORE LAYER
// ============================================================================

// ============================================================================
// CORE TABLES
// ============================================================================

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
    mfaEnabled: boolean('mfa_enabled').default(false),
    mfaSecret: text('mfa_secret'),
    preferences: jsonb('preferences').default({
        notifications: { email: true, push: true, sms: false },
        theme: 'auto',
        language: 'en'
    }),
    savingsRoundUpEnabled: boolean('savings_round_up_enabled').default(false),
    savingsGoalId: uuid('savings_goal_id'), // Linked to goals.id later in relations
    roundUpToNearest: numeric('round_up_to_nearest', { precision: 5, scale: 2 }).default('1.00'),
    peerComparisonConsent: boolean('peer_comparison_consent').default(false),
    ageGroup: text('age_group'),
    incomeRange: text('income_range'),
    location: text('location'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const categories = pgTable('categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#3B82F6'),
    icon: text('icon').default('tag'),
    type: text('type').default('expense'),
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    budget: jsonb('budget').default({ monthly: 0, yearly: 0 }),
    spendingLimit: numeric('spending_limit', { precision: 12, scale: 2 }).default('0'),
    priority: integer('priority').default(0),
    metadata: jsonb('metadata').default({ usageCount: 0, lastUsed: null, averageAmount: 0 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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

export const expenses = pgTable('expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    vaultId: uuid('vault_id'), // References vaults.id later
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    date: timestamp('date').defaultNow().notNull(),
    paymentMethod: text('payment_method').default('other'),
    location: jsonb('location'),
    tags: jsonb('tags').default([]),
    receipt: jsonb('receipt'),
    isRecurring: boolean('is_recurring').default(false),
    recurringPattern: jsonb('recurring_pattern'),
    nextExecutionDate: timestamp('next_execution_date'),
    lastExecutedDate: timestamp('last_executed_date'),
    notes: text('notes'),
    status: text('status').default('completed'),
    isTaxDeductible: boolean('is_tax_deductible').default(false),
    taxCategoryId: uuid('tax_category_id'),
    taxYear: integer('tax_year'),
    metadata: jsonb('metadata').default({ createdBy: 'system', version: 1 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_expenses_user_date').on(table.userId, table.date),
    userCategoryIdx: index('idx_expenses_user_category').on(table.userId, table.categoryId),
}));

export const expenseShares = pgTable('expense_shares', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    shareAmount: numeric('share_amount', { precision: 12, scale: 2 }).notNull(),
    sharePercentage: doublePrecision('share_percentage'),
    isPaid: boolean('is_paid').default(false),
    paidAt: timestamp('paid_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const reimbursements = pgTable('reimbursements', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    toUserId: uuid('to_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    status: text('status').default('pending'),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at'),
    dueDate: timestamp('due_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const expenseApprovals = pgTable('expense_approvals', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').default('pending'),
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

export const sharedBudgets = pgTable('shared_budgets', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    totalBudget: numeric('total_budget', { precision: 12, scale: 2 }).notNull(),
    currentSpent: numeric('current_spent', { precision: 12, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    period: text('period').default('monthly'),
    startDate: timestamp('start_date').defaultNow(),
    endDate: timestamp('end_date'),
    approvalRequired: boolean('approval_required').default(false),
    approvalThreshold: numeric('approval_threshold', { precision: 12, scale: 2 }),
    isActive: boolean('is_active').default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').default({
        categories: [],
        contributors: [],
        approvers: []
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Vaults Module
export const vaults = pgTable('vaults', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currency: text('currency').default('USD'),
    isActive: boolean('is_active').default(true),
    status: text('status').default('active'), // 'active', 'frozen'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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

export const subscriptionUsage = pgTable('subscription_usage', {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    month: text('month').notNull(), // Format: YYYY-MM
    usageCount: integer('usage_count').default(0),
    usageMinutes: integer('usage_minutes').default(0),
    usageValue: jsonb('usage_value').default({}), // Flexible for different tracking metrics
    lastUsed: timestamp('last_used'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cancellationSuggestions = pgTable('cancellation_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    suggestionType: text('suggestion_type').notNull(), // 'unused', 'low_usage', 'duplicate', 'high_cost'
    severity: text('severity').default('medium'), // 'low', 'medium', 'high'
    reason: text('reason').notNull(),
    potentialSavings: numeric('potential_savings', { precision: 12, scale: 2 }),
    aiAnalysis: jsonb('ai_analysis').default({}),
    confidence: doublePrecision('confidence').default(0.5),
    status: text('status').default('pending'), // 'pending', 'accepted', 'dismissed', 'acted_upon'
    userResponse: text('user_response'),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const vaultMembers = pgTable('vault_members', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at').defaultNow(),
});

export const vaultBalances = pgTable('vault_balances', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).default('0').notNull(),
    currency: text('currency').default('USD'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const settlements = pgTable('settlements', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    payerId: uuid('payer_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    payeeId: uuid('payee_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
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

export const debtTransactions = pgTable('debt_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    paidById: uuid('paid_by_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    owedById: uuid('owed_by_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    splitType: text('split_type').default('equal'), // equal, percentage, exact
    splitValue: numeric('split_value', { precision: 12, scale: 2 }),
    isSettled: boolean('is_settled').default(false),
    settledAt: timestamp('settled_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// DOUBLE-ENTRY LEDGER SYSTEM
// ============================================================================

// Ledger Accounts Table (Chart of Accounts)
export const ledgerAccounts = pgTable('ledger_accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accountCode: text('account_code').notNull(), // e.g., "1000", "2000", "3000"
    accountName: text('account_name').notNull(), // e.g., "Cash", "Accounts Payable", "Revenue"
    accountType: text('account_type').notNull(), // asset, liability, equity, revenue, expense
    category: text('category'), // subcategory like "current_asset", "fixed_asset", etc.
    normalBalance: text('normal_balance').notNull(), // debit or credit
    currency: text('currency').default('USD'),
    parentAccountId: uuid('parent_account_id').references(() => ledgerAccounts.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').default(true),
    isSystem: boolean('is_system').default(false), // System-generated accounts
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Ledger Entries Table (Double-Entry Journal)
export const ledgerEntries = pgTable('ledger_entries', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    journalId: uuid('journal_id').notNull(), // Groups debit/credit pairs
    accountId: uuid('account_id').references(() => ledgerAccounts.id, { onDelete: 'restrict' }).notNull(),
    entryType: text('entry_type').notNull(), // debit or credit
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    baseCurrencyAmount: numeric('base_currency_amount', { precision: 15, scale: 2 }), // Normalized to user's base currency
    fxRate: doublePrecision('fx_rate').default(1.0),
    description: text('description'),
    referenceType: text('reference_type'), // expense, vault, investment, etc.
    referenceId: uuid('reference_id'), // ID of related entity
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'set null' }),
    transactionDate: timestamp('transaction_date').defaultNow(),
    isReversed: boolean('is_reversed').default(false),
    reversedBy: uuid('reversed_by'), // Reference to reversing entry
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// FX Valuation Snapshots Table (Track unrealized gains/losses)
export const fxValuationSnapshots = pgTable('fx_valuation_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accountId: uuid('account_id').references(() => ledgerAccounts.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: timestamp('snapshot_date').defaultNow(),
    originalCurrency: text('original_currency').notNull(),
    baseCurrency: text('base_currency').notNull(),
    originalAmount: numeric('original_amount', { precision: 15, scale: 2 }).notNull(),
    valuationAmount: numeric('valuation_amount', { precision: 15, scale: 2 }).notNull(), // Revalued amount
    fxRate: doublePrecision('fx_rate').notNull(),
    previousFxRate: doublePrecision('previous_fx_rate'),
    unrealizedGainLoss: numeric('unrealized_gain_loss', { precision: 15, scale: 2 }).default('0'),
    realizedGainLoss: numeric('realized_gain_loss', { precision: 15, scale: 2 }).default('0'),
    isRealized: boolean('is_realized').default(false),
    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goals Module
export const goals = pgTable('goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).default('0'),
    deadline: timestamp('deadline').notNull(),
    status: text('status').default('active'),
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

export const financialHealthScores = pgTable('financial_health_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    overallScore: doublePrecision('overall_score').notNull(),
    rating: text('rating').notNull(),
    dtiScore: doublePrecision('dti_score').default(0),
    savingsRateScore: doublePrecision('savings_rate_score').default(0),
    volatilityScore: doublePrecision('volatility_score').default(0),
    emergencyFundScore: doublePrecision('emergency_fund_score').default(0),
    budgetAdherenceScore: doublePrecision('budget_adherence_score').default(0),
    goalProgressScore: doublePrecision('goal_progress_score').default(0),
    metrics: jsonb('metrics').default({
        dti: 0,
        savingsRate: 0,
        volatility: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        emergencyFundMonths: 0,
        budgetAdherence: 0,
        goalProgress: 0
    }),
    recommendation: text('recommendation'),
    insights: jsonb('insights').default([]),
    cashFlowPrediction: jsonb('cash_flow_prediction').default({
        predictedExpenses: 0,
        predictedIncome: 0,
        predictedBalance: 0,
        confidence: 'low',
        warning: null
    }),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_financial_health_scores_user_id').on(table.userId),
        calculatedAtIdx: index('idx_financial_health_scores_calculated_at').on(table.calculatedAt),
        ratingIdx: index('idx_financial_health_scores_rating').on(table.rating),
    };
});

// ============================================================================
// INVESTMENTS & ASSETS
// ============================================================================

export const portfolios = pgTable('portfolios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    totalValue: numeric('total_value', { precision: 15, scale: 2 }).default('0'),
    riskTolerance: text('risk_tolerance').default('moderate'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const investments = pgTable('investments', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // stock, crypto, etf, mutual_fund
    quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
    averageCost: numeric('average_cost', { precision: 18, scale: 8 }).notNull(),
    totalCost: numeric('total_cost', { precision: 18, scale: 2 }).notNull(),
    currentPrice: numeric('current_price', { precision: 18, scale: 8 }),
    marketValue: numeric('market_value', { precision: 18, scale: 2 }),
    unrealizedGainLoss: numeric('unrealized_gain_loss', { precision: 18, scale: 2 }),
    unrealizedGainLossPercent: numeric('unrealized_gain_loss_percent', { precision: 10, scale: 2 }),
    baseCurrencyValue: numeric('base_currency_value', { precision: 18, scale: 2 }),
    baseCurrencyCode: text('base_currency_code'),
    valuationDate: timestamp('valuation_date'),
    lastPriceUpdate: timestamp('last_price_update'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_investments_user').on(table.userId),
    portfolioIdx: index('idx_investments_portfolio').on(table.portfolioId),
    symbolIdx: index('idx_investments_symbol').on(table.symbol),
}));

export const investmentTransactions = pgTable('investment_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    type: text('type').notNull(), // buy, sell, dividend, interest
    quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
    price: numeric('price', { precision: 18, scale: 8 }).notNull(),
    fees: numeric('fees', { precision: 12, scale: 2 }).default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    date: timestamp('date').notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_inv_trans_user').on(table.userId),
    investmentIdx: index('idx_inv_trans_investment').on(table.investmentId),
    dateIdx: index('idx_inv_trans_date').on(table.date),
}));

// Time-Machine: Replay Scenarios
export const replayScenarios = pgTable('replay_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    baselineSnapshotId: uuid('baseline_snapshot_id').references(() => auditSnapshots.id),
    whatIfChanges: jsonb('what_if_changes').notNull(), // { type: 'investment', asset: 'BTC', amount: 1000, date: '2024-01-01' }
    status: text('status').default('pending'), // pending, running, completed, failed
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
});

// Time-Machine: Backtest Results
export const backtestResults = pgTable('backtest_results', {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id').references(() => replayScenarios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    actualNetWorth: numeric('actual_net_worth', { precision: 15, scale: 2 }).notNull(),
    simulatedNetWorth: numeric('simulated_net_worth', { precision: 15, scale: 2 }).notNull(),
    difference: numeric('difference', { precision: 15, scale: 2 }).notNull(),
    differencePercent: doublePrecision('difference_percent').notNull(),
    timelineData: jsonb('timeline_data').notNull(), // Daily snapshots: [{ date, actualValue, simulatedValue }]
    performanceMetrics: jsonb('performance_metrics').default({}), // { sharpeRatio, maxDrawdown, volatility }
    createdAt: timestamp('created_at').defaultNow(),
});

// Time-Machine: Historical Market Data Cache
export const historicalMarketData = pgTable('historical_market_data', {
    id: uuid('id').defaultRandom().primaryKey(),
    symbol: text('symbol').notNull(), // BTC, ETH, AAPL, etc.
    assetType: text('asset_type').notNull(), // crypto, stock, commodity, fx
    date: timestamp('date').notNull(),
    open: numeric('open', { precision: 18, scale: 8 }),
    high: numeric('high', { precision: 18, scale: 8 }),
    low: numeric('low', { precision: 18, scale: 8 }),
    close: numeric('close', { precision: 18, scale: 8 }).notNull(),
    volume: numeric('volume', { precision: 20, scale: 2 }),
    source: text('source').default('coingecko'), // coingecko, yahoo, alpha_vantage
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    symbolDateIdx: index('idx_historical_market_symbol_date').on(table.symbol, table.date),
}));

export const forecastSnapshots = pgTable('forecast_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    quantity: numeric('quantity', { precision: 15, scale: 6 }).notNull(),
    averageCost: numeric('average_cost', { precision: 12, scale: 4 }).notNull(),
    currentPrice: numeric('current_price', { precision: 12, scale: 4 }),
    createdAt: timestamp('created_at').defaultNow(),
});

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
        modelType: 'linear_regression',
        trainingDataPoints: 0,
        seasonalAdjustment: false,
        externalFactors: [],
        lastTrained: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cashFlowModels = pgTable('cash_flow_models', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    modelName: text('model_name').notNull(),
    modelType: text('model_type').notNull(), // 'linear', 'exponential', 'arima', 'neural'
    timeframe: text('timeframe').notNull(), // 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    trainingData: jsonb('training_data').notNull(), // Historical cash flow data used for training
    predictions: jsonb('predictions').notNull(), // Future cash flow predictions with dates and amounts
    accuracy: doublePrecision('accuracy'), // Model accuracy score (0-1)
    parameters: jsonb('parameters'), // Model-specific parameters (coefficients, hyperparameters, etc.)
    validFrom: timestamp('valid_from').notNull(),
    validUntil: timestamp('valid_until'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({
        features: [],
        confidenceIntervals: {},
        seasonalFactors: {}
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

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

export const fxRates = pgTable('fx_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull().unique(), // 'USD/EUR'
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    change24h: numeric('change_24h', { precision: 5, scale: 2 }).default('0'),
    volatility: numeric('volatility', { precision: 5, scale: 2 }).default('0'), // High volatility alert
    lastUpdated: timestamp('last_updated').defaultNow(),
});

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

export const liquidityAlerts = pgTable('liquidity_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
    alertDays: integer('alert_days').default(7),
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

export const tokenBlacklist = pgTable('token_blacklist', {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    tokenType: text('token_type').notNull(), // access, refresh
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').default('logout'), // logout, password_change, security
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

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

export const fixedAssets = pgTable('fixed_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull(),
    baseCurrencyValue: numeric('base_currency_value', { precision: 12, scale: 2 }),
    baseCurrencyCode: text('base_currency_code'),
    valuationDate: timestamp('valuation_date'),
    appreciationRate: numeric('appreciation_rate', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const assetValuations = pgTable('asset_valuations', {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id').references(() => fixedAssets.id, { onDelete: 'cascade' }).notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    date: timestamp('date').defaultNow(),
    source: text('source').default('manual'), // 'manual', 'market_adjustment', 'appraisal'
});

export const riskProfiles = pgTable('risk_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).unique().notNull(),
    riskTolerance: text('risk_tolerance').notNull(), // 'low', 'medium', 'high', 'aggressive'
    targetReturn: numeric('target_return', { precision: 5, scale: 2 }),
    maxDrawdown: numeric('max_drawdown', { precision: 5, scale: 2 }),
    preferredAssetMix: jsonb('preferred_asset_mix'), // { stocks: 60, bonds: 30, crypto: 10 }
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const marketIndices = pgTable('market_indices', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // 'S&P500', 'Gold', 'RealEstate_US'
    currentValue: numeric('current_value', { precision: 12, scale: 2 }),
    avgAnnualReturn: numeric('avg_annual_return', { precision: 5, scale: 2 }),
    volatility: numeric('volatility', { precision: 5, scale: 2 }),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

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
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// BLACK SWAN LIQUIDITY STRESS-TESTER (#272)
// ============================================================================

// Stress Test Scenarios - Simulates crisis events
export const stressScenarios = pgTable('stress_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    scenarioType: text('scenario_type').notNull(), // job_loss, market_crash, medical_emergency, recession
    severity: text('severity').default('moderate'), // mild, moderate, severe, catastrophic
    parameters: jsonb('parameters').notNull(), // { incomeReduction: 100%, marketDrop: 40%, duration: 6 }
    status: text('status').default('pending'), // pending, running, completed, failed
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
});

// Runway Calculations - Cash flow runway projections
export const runwayCalculations = pgTable('runway_calculations', {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id').references(() => stressScenarios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currentBalance: numeric('current_balance', { precision: 15, scale: 2 }).notNull(),
    monthlyBurnRate: numeric('monthly_burn_rate', { precision: 12, scale: 2 }).notNull(),
    runwayDays: integer('runway_days').notNull(), // Days until cash runs out
    zeroBalanceDate: timestamp('zero_balance_date'), // Exact date of depletion
    criticalThresholdDate: timestamp('critical_threshold_date'), // Date when balance hits 20%
    dailyProjections: jsonb('daily_projections').notNull(), // [{ date, balance, income, expenses }]
    recommendations: jsonb('recommendations').default([]), // AI-generated survival strategies
    createdAt: timestamp('created_at').defaultNow(),
});

// Liquidity Rescues - Automated emergency transfers
export const liquidityRescues = pgTable('liquidity_rescues', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioId: uuid('scenario_id').references(() => stressScenarios.id, { onDelete: 'cascade' }),
    triggerDate: timestamp('trigger_date').notNull(),
    triggerReason: text('trigger_reason').notNull(), // balance_critical, runway_depleted, threshold_breach
    sourceWalletId: uuid('source_wallet_id'), // Source for emergency funds
    targetWalletId: uuid('target_wallet_id'), // Target wallet to rescue
    transferAmount: numeric('transfer_amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('pending'), // pending, executed, failed, cancelled
    executedAt: timestamp('executed_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Cash Flow Projections - AI-driven income/expense forecasts
export const cashFlowProjections = pgTable('cash_flow_projections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectionDate: timestamp('projection_date').notNull(),
    projectedIncome: numeric('projected_income', { precision: 12, scale: 2 }).notNull(),
    projectedExpenses: numeric('projected_expenses', { precision: 12, scale: 2 }).notNull(),
    projectedBalance: numeric('projected_balance', { precision: 12, scale: 2 }).notNull(),
    confidence: doublePrecision('confidence').default(0.85), // AI confidence score
    modelType: text('model_type').default('arima'), // arima, lstm, prophet
    seasonalFactors: jsonb('seasonal_factors').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_cash_flow_user_date').on(table.userId, table.projectionDate),
}));

// ============================================================================
// INVESTMENTS & DEBT
// ============================================================================

export const debts = pgTable('debts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    debtType: text('debt_type').notNull(),
    principalAmount: numeric('principal_amount', { precision: 12, scale: 2 }).notNull(),
    currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull(),
    baseCurrencyValue: numeric('base_currency_value', { precision: 12, scale: 2 }),
    baseCurrencyCode: text('base_currency_code'),
    valuationDate: timestamp('valuation_date'),
    apr: numeric('apr', { precision: 5, scale: 3 }).notNull(),
    minimumPayment: numeric('minimum_payment', { precision: 12, scale: 2 }).notNull(),
    paymentDueDay: integer('payment_due_day'),
    termMonths: integer('term_months'),
    estimatedPayoffDate: timestamp('estimated_payoff_date'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const debtPayments = pgTable('debt_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date').notNull(),
    principalPayment: numeric('principal_payment', { precision: 12, scale: 2 }).notNull(),
    interestPayment: numeric('interest_payment', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const payoffStrategies = pgTable('payoff_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyName: text('strategy_name').notNull(),
    monthlyExtraPayment: numeric('monthly_extra_payment', { precision: 12, scale: 2 }).default('0'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

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
});

export const refinanceOpportunities = pgTable('refinance_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    currentApr: numeric('current_apr', { precision: 5, scale: 3 }).notNull(),
    suggestedApr: numeric('suggested_apr', { precision: 5, scale: 3 }).notNull(),
    potentialSavings: numeric('potential_savings', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// ALGORITHMIC DEBT RESTRUCTURING & DEFAULT PREDICTION (#441)
// ============================================================================

export const defaultPredictionScores = pgTable('default_prediction_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    predictionDate: timestamp('prediction_date').defaultNow(),
    probabilityOfDefault: numeric('probability_of_default', { precision: 5, scale: 4 }).notNull(), // 0.0000 to 1.0000
    horizonDays: integer('horizon_days').default(90),
    riskLevel: text('risk_level').notNull(), // 'low', 'medium', 'high', 'critical'
    factors: jsonb('factors').default({}), // Contributing factors (liquidity, cash flow, macro)
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const debtRestructuringPlans = pgTable('debt_restructuring_plans', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    predictionId: uuid('prediction_id').references(() => defaultPredictionScores.id),
    planType: text('plan_type').notNull(), // 'snowball', 'avalanche', 'consolidation', 'emergency_diversion'
    proposedAdjustments: jsonb('proposed_adjustments').notNull(), // Specific debt-payment shifts
    estimatedInterestSavings: numeric('estimated_interest_savings', { precision: 12, scale: 2 }),
    status: text('status').default('proposed'), // 'proposed', 'approved', 'executed', 'dismissed'
    executedAt: timestamp('executed_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const macroEconomicIndicators = pgTable('macro_economic_indicators', {
    id: uuid('id').defaultRandom().primaryKey(),
    indicatorName: text('indicator_name').notNull(), // 'fed_funds_rate', 'libor', 'inflation_rate'
    value: numeric('value', { precision: 8, scale: 4 }).notNull(),
    periodDate: timestamp('period_date').notNull(),
    source: text('source').default('simulated'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// DYNAMIC REBALANCING ORDERS & VAULT CONSOLIDATION (#449)
// ============================================================================

export const rebalancingOrders = pgTable('rebalancing_orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }),
    orderType: text('order_type').notNull(), // 'buy', 'sell'
    assetSymbol: text('asset_symbol').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
    estimatedPrice: numeric('estimated_price', { precision: 18, scale: 2 }).notNull(),
    status: text('status').default('proposed'), // 'proposed', 'approved', 'executed', 'cancelled'
    driftDelta: numeric('drift_delta', { precision: 5, scale: 4 }),
    metadata: jsonb('metadata').default({}),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const vaultConsolidationLogs = pgTable('vault_consolidation_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    consolidationDate: timestamp('consolidation_date').defaultNow(),
    consolidatedBalance: numeric('consolidated_balance', { precision: 18, scale: 2 }).notNull(),
    vaultIds: jsonb('vault_ids').notNull(), // Array of vault IDs consolidated
    assetDistribution: jsonb('asset_distribution').notNull(), // { 'equity': 0.6, 'crypto': 0.4 }
    metadata: jsonb('metadata').default({}),
});

// ============================================================================
// TAX MODULE
// ============================================================================

export const taxCategories = pgTable('tax_categories', {
    id: serial('id').primaryKey(),

    // Category identity
    categoryName: varchar('category_name', { length: 200 }).notNull().unique(),
    description: text('description'),

    // Deductibility rules
    deductibilityType: varchar('deductibility_type', { length: 50 }).notNull(),
    deductibilityRate: numeric('deductibility_rate', { precision: 3, scale: 2 }).default('1.00'),

    // Regulatory compliance
    taxJurisdiction: varchar('tax_jurisdiction', { length: 100 }).default('US_Federal'),
    irsCode: varchar('irs_code', { length: 100 }),
    conditionsForDeductibility: jsonb('conditions_for_deductibility').default('{}'),

    // Limits and thresholds
    maxDeductionLimit: numeric('max_deduction_limit', { precision: 15, scale: 2 }),
    percentageAgiLimit: numeric('percentage_agi_limit', { precision: 5, scale: 2 }),

    // Categorization assistance
    applicableExpenseCategories: text('applicable_expense_categories').array(),
    exampleExpenses: text('example_expenses').array(),
    requiredDocumentation: text('required_documentation').array(),

    // Metadata
    isActive: boolean('is_active').default(true),
    priorityOrder: integer('priority_order').default(0),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const taxProfiles = pgTable('tax_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    country: text('country').default('US'),
    filingStatus: text('filing_status').default('single'),
    taxYear: integer('tax_year').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const taxDeductions = pgTable('tax_deductions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    taxYear: integer('tax_year').notNull(),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const taxBrackets = pgTable('tax_brackets', {
    id: uuid('id').defaultRandom().primaryKey(),
    country: text('country').default('US'),
    taxYear: integer('tax_year').notNull(),
    filingStatus: text('filing_status').notNull(),
    bracketLevel: integer('bracket_level').notNull(),
    minIncome: numeric('min_income', { precision: 12, scale: 2 }).notNull(),
    maxIncome: numeric('max_income', { precision: 12, scale: 2 }),
    rate: numeric('rate', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const taxReports = pgTable('tax_reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taxYear: integer('tax_year').notNull(),
    reportType: text('report_type').default('annual'),
    totalIncome: numeric('total_income', { precision: 12, scale: 2 }),
    totalDeductions: numeric('total_deductions', { precision: 12, scale: 2 }),
    taxableIncome: numeric('taxable_income', { precision: 12, scale: 2 }),
    totalTaxOwed: numeric('total_tax_owed', { precision: 12, scale: 2 }),
    effectiveTaxRate: numeric('effective_tax_rate', { precision: 5, scale: 2 }),
    marginalTaxRate: numeric('marginal_tax_rate', { precision: 5, scale: 2 }),
    estimatedRefund: numeric('estimated_refund', { precision: 12, scale: 2 }),
    breakdown: jsonb('breakdown'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const userTaxProfiles = pgTable('user_tax_profiles', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),

    // Filing status and basic info
    filingStatus: varchar('filing_status', { length: 50 }).default('single').notNull(),
    annualIncome: numeric('annual_income', { precision: 15, scale: 2 }).default('0'),
    estimatedTaxBracket: varchar('estimated_tax_bracket', { length: 20 }),
    standardDeduction: numeric('standard_deduction', { precision: 15, scale: 2 }).default('14600.00'),

    // Taxpayer classification
    dependents: integer('dependents').default(0),
    selfEmployed: boolean('self_employed').default(false),
    businessOwner: boolean('business_owner').default(false),
    quarterlyTaxPayer: boolean('quarterly_tax_payer').default(false),

    // Filing dates
    lastFilingDate: date('last_filing_date'),
    nextFilingDeadline: date('next_filing_deadline'),

    // Tax preferences
    taxPreferences: jsonb('tax_preferences').default('{}'),
    itemizeDeductions: boolean('itemize_deductions').default(false),

    // Year-to-date tracking
    ytdTaxPaid: numeric('ytd_tax_paid', { precision: 15, scale: 2 }).default('0'),
    ytdTaxableIncome: numeric('ytd_taxable_income', { precision: 15, scale: 2 }).default('0'),
    ytdDeductions: numeric('ytd_deductions', { precision: 15, scale: 2 }).default('0'),
    estimatedQuarterlyPayments: numeric('estimated_quarterly_payments', { precision: 15, scale: 2 }).default('0'),

    // AI optimization
    aiTaxAdvice: jsonb('ai_tax_advice').default('{}'),
    lastAiAnalysisDate: timestamp('last_ai_analysis_date'),
    optimizationPreferences: jsonb('optimization_preferences').default('{}'),

    // Reminders and notifications
    reminderPreferences: jsonb('reminder_preferences').default('{"quarterly": true, "annual": true, "threshold_alerts": true}'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// PREDICTIVE TAX-LOSS HARVESTING MODULE (#442)
// ============================================================================

export const taxLossOpportunities = pgTable('tax_loss_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    assetSymbol: text('asset_symbol').notNull(),
    unrealizedLoss: numeric('unrealized_loss', { precision: 18, scale: 2 }).notNull(),
    taxSavingsEstimate: numeric('tax_savings_estimate', { precision: 18, scale: 2 }),
    status: text('status').default('pending'), // 'pending', 'executed', 'dismissed'
    proxyAssetSymbol: text('proxy_asset_symbol'),
    correlationScore: numeric('correlation_score', { precision: 5, scale: 4 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const washSaleViolations = pgTable('wash_sale_violations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }),
    assetSymbol: text('asset_symbol').notNull(),
    violationDate: timestamp('violation_date').notNull(),
    description: text('description'),
    disallowedLoss: numeric('disallowed_loss', { precision: 18, scale: 2 }).notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const assetCorrelationMatrix = pgTable('asset_correlation_matrix', {
    id: uuid('id').defaultRandom().primaryKey(),
    baseAssetSymbol: text('base_asset_symbol').notNull(),
    proxyAssetSymbol: text('proxy_asset_symbol').notNull(),
    correlationCoefficient: numeric('correlation_coefficient', { precision: 5, scale: 4 }).notNull(),
    beta: numeric('beta', { precision: 8, scale: 4 }),
    lastUpdated: timestamp('last_updated').defaultNow(),
}, (table) => ({
    assetPairIdx: index('idx_asset_correlation_pair').on(table.baseAssetSymbol, table.proxyAssetSymbol),
}));

// ============================================================================
// REAL ESTATE MODULE (#265)
// ============================================================================

export const properties = pgTable('properties', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assetId: uuid('asset_id').references(() => fixedAssets.id, { onDelete: 'cascade' }),
    propertyType: text('property_type').notNull(), // 'residential', 'commercial'
    address: text('address').notNull(),
    units: integer('units').default(1),
    squareFootage: numeric('square_footage', { precision: 10, scale: 2 }),
    lotSize: numeric('lot_size', { precision: 10, scale: 2 }),
    yearBuilt: integer('year_built'),
    bedrooms: integer('bedrooms'),
    bathrooms: numeric('bathrooms', { precision: 3, scale: 1 }),
    amenities: jsonb('amenities').default([]),
    noi: numeric('noi', { precision: 12, scale: 2 }),
    capRate: numeric('cap_rate', { precision: 5, scale: 2 }),
    occupancyStatus: text('occupancy_status').default('vacant'),
    monthlyHOA: numeric('monthly_hoa', { precision: 12, scale: 2 }).default('0'),
    annualPropertyTax: numeric('annual_property_tax', { precision: 12, scale: 2 }).default('0'),
    insurancePremium: numeric('insurance_premium', { precision: 12, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const tenantLeases = pgTable('tenant_leases', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tenantName: text('tenant_name').notNull(),
    leaseStart: timestamp('lease_start').notNull(),
    leaseEnd: timestamp('lease_end').notNull(),
    monthlyRent: numeric('monthly_rent', { precision: 12, scale: 2 }).notNull(),
    securityDeposit: numeric('security_deposit', { precision: 12, scale: 2 }),
    paymentDay: integer('payment_day').default(1),
    status: text('status').default('active'),
    autoRenew: boolean('auto_renew').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const propertyMaintenance = pgTable('property_maintenance', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    cost: numeric('cost', { precision: 12, scale: 2 }).notNull(),
    date: timestamp('date').defaultNow(),
    status: text('status').default('completed'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const propertyROISnapshots = pgTable('property_roi_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').defaultNow(),
    netOperatingIncome: numeric('net_operating_income', { precision: 12, scale: 2 }).notNull(),
    capRate: numeric('cap_rate', { precision: 5, scale: 2 }),
    cashOnCashReturn: numeric('cash_on_cash_return', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// CORPORATE & BUSINESS MODULE (#271)
// ============================================================================

export const corporateEntities = pgTable('corporate_entities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    parentEntityId: uuid('parent_entity_id').references(() => corporateEntities.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    legalForm: text('legal_form').notNull(),
    taxId: text('tax_id').unique(),
    registrationNumber: text('registration_number'),
    incorporationDate: timestamp('incorporation_date'),
    jurisdiction: text('jurisdiction').default('US'),
    status: text('status').default('active'),
    metadata: jsonb('metadata').default({ employeesLimit: 50, fiscalYearEnd: '12-31' }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const employees = pgTable('employees', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    role: text('role').notNull(),
    salary: numeric('salary', { precision: 12, scale: 2 }).notNull(),
    payFrequency: text('pay_frequency').default('monthly'), // 'weekly', 'bi-weekly', 'monthly'
    startDate: timestamp('start_date').defaultNow(),
    status: text('status').default('active'),
    bankDetails: jsonb('bank_details'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const payrollRuns = pgTable('payroll_runs', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    totalGross: numeric('total_gross', { precision: 12, scale: 2 }).notNull(),
    totalTax: numeric('total_tax', { precision: 12, scale: 2 }).notNull(),
    totalNet: numeric('total_net', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('draft'),
    paymentDate: timestamp('payment_date'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const dividendPayouts = pgTable('dividend_payouts', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    payoutDate: timestamp('payout_date').defaultNow(),
    type: text('type').default('regular'),
    status: text('status').default('paid'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const businessLedgers = pgTable('business_ledgers', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    transactionDate: timestamp('transaction_date').defaultNow(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    type: text('type').notNull(), // 'revenue', 'expense', 'asset', 'liability', 'equity'
    category: text('category'),
    currency: text('currency').default('USD'),
    refId: uuid('ref_id'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many, one }) => ({
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    deviceSessions: many(deviceSessions),
    vaultMemberships: many(vaultMembers),
    ownedVaults: many(vaults),
    debts: many(debts),
    taxProfile: one(taxProfiles, { fields: [users.id], references: [taxProfiles.userId] }),
    properties: many(properties),
    corporateEntities: many(corporateEntities),
    dividendPayouts: many(dividendPayouts),
    securityEvents: many(securityEvents),
    reports: many(reports),
    budgetAlerts: many(budgetAlerts),
    portfolios: many(portfolios),
    subscriptions: many(subscriptions),
    bills: many(bills),
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
    investmentRiskProfiles: many(investmentRiskProfiles),
    investmentRecommendations: many(investmentRecommendations),
    taxLossOpportunities: many(taxLossOpportunities),
    washSaleViolations: many(washSaleViolations),
    defaultPredictionScores: many(defaultPredictionScores),
    debtRestructuringPlans: many(debtRestructuringPlans),
    targetAllocations: many(targetAllocations),
    rebalancingOrders: many(rebalancingOrders),
    vaultConsolidationLogs: many(vaultConsolidationLogs),
    taxLotInventory: many(taxLotInventory),
    liquidationQueues: many(liquidationQueues),
    marginRequirements: many(marginRequirements),
    collateralSnapshots: many(collateralSnapshots),
    liquidityPools: many(liquidityPools),
    internalClearingLogs: many(internalClearingLogs),
    fxSettlementInstructions: many(fxSettlementInstructions),
    simulationScenarios: many(simulationScenarios),
    simulationResults: many(simulationResults),
}));

export const targetAllocationsRelations = relations(targetAllocations, ({ one }) => ({
    user: one(users, { fields: [targetAllocations.userId], references: [users.id] }),
    portfolio: one(portfolios, { fields: [targetAllocations.portfolioId], references: [portfolios.id] }),
}));

export const rebalancingOrdersRelations = relations(rebalancingOrders, ({ one }) => ({
    user: one(users, { fields: [rebalancingOrders.userId], references: [users.id] }),
    portfolio: one(portfolios, { fields: [rebalancingOrders.portfolioId], references: [portfolios.id] }),
}));

export const vaultConsolidationLogsRelations = relations(vaultConsolidationLogs, ({ one }) => ({
    user: one(users, { fields: [vaultConsolidationLogs.userId], references: [users.id] }),
}));

export const defaultPredictionScoresRelations = relations(defaultPredictionScores, ({ one, many }) => ({
    user: one(users, { fields: [defaultPredictionScores.userId], references: [users.id] }),
    restructuringPlans: many(debtRestructuringPlans),
}));

export const debtRestructuringPlansRelations = relations(debtRestructuringPlans, ({ one }) => ({
    user: one(users, { fields: [debtRestructuringPlans.userId], references: [users.id] }),
    prediction: one(defaultPredictionScores, { fields: [debtRestructuringPlans.predictionId], references: [defaultPredictionScores.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
    user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
    category: one(categories, { fields: [subscriptions.categoryId], references: [categories.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    user: one(users, { fields: [categories.userId], references: [users.id] }),
    parentCategory: one(categories, { fields: [categories.parentCategoryId], references: [categories.id], relationName: 'subcategories' }),
    subcategories: many(categories, { relationName: 'subcategories' }),
    expenses: many(expenses),
    budgetAlerts: many(budgetAlerts),
    subscriptions: many(subscriptions),
}));

export const budgetAlertsRelations = relations(budgetAlerts, ({ one }) => ({
    user: one(users, { fields: [budgetAlerts.userId], references: [users.id] }),
    category: one(categories, { fields: [budgetAlerts.categoryId], references: [categories.id] }),
    vault: one(vaults, { fields: [budgetAlerts.vaultId], references: [vaults.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    user: one(users, { fields: [expenses.userId], references: [users.id] }),
    category: one(categories, { fields: [expenses.categoryId], references: [categories.id] }),
    vault: one(vaults, { fields: [expenses.vaultId], references: [vaults.id] }),
}));

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
    owner: one(users, { fields: [vaults.ownerId], references: [users.id] }),
    members: many(vaultMembers),
    expenses: many(expenses),
}));

export const vaultMembersRelations = relations(vaultMembers, ({ one }) => ({
    vault: one(vaults, { fields: [vaultMembers.vaultId], references: [vaults.id] }),
    user: one(users, { fields: [vaultMembers.userId], references: [users.id] }),
}));

// Bills Table
export const bills = pgTable('bills', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    frequency: text('frequency').notNull(), // 'weekly', 'monthly', 'quarterly', 'yearly', 'one_time'
    dueDate: timestamp('due_date').notNull(),
    status: text('status').default('pending'), // 'pending', 'paid', 'overdue', 'scheduled', 'cancelled'
    autoPay: boolean('auto_pay').default(false),
    paymentMethod: text('payment_method').default('other'), // 'credit_card', 'debit_card', 'bank_transfer', 'check', 'cash', 'other'
    reminderDays: integer('reminder_days').default(3),
    smartScheduleEnabled: boolean('smart_schedule_enabled').default(false),
    optimalPaymentDate: timestamp('optimal_payment_date'),
    scheduledPaymentDate: timestamp('scheduled_payment_date'),
    lastPaidDate: timestamp('last_paid_date'),
    payee: text('payee'),
    payeeAccount: text('payee_account'),
    isRecurring: boolean('is_recurring').default(true),
    endDate: timestamp('end_date'),
    tags: jsonb('tags').default('[]'),
    notes: text('notes'),
    detectedFromExpense: boolean('detected_from_expense').default(false),
    detectionConfidence: integer('detection_confidence').default(0),
    sourceExpenseIds: jsonb('source_expense_ids').default('[]'),
    cashFlowAnalysis: jsonb('cash_flow_analysis').default('{"suggestedDate": null, "confidence": 0, "reason": null}'),
    metadata: jsonb('metadata').default('{"lastReminderSent": null, "reminderCount": 0, "paymentHistory": [], "lateFeeAmount": 0, "gracePeriodDays": 0}'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

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
    payments: many(debtPayments),
    amortizationSchedules: many(amortizationSchedules),
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
    user: one(users, { fields: [goals.userId], references: [users.id] }),
}));

// Ledger System Relations
export const ledgerAccountsRelations = relations(ledgerAccounts, ({ one, many }) => ({
    user: one(users, { fields: [ledgerAccounts.userId], references: [users.id] }),
    parentAccount: one(ledgerAccounts, {
        fields: [ledgerAccounts.parentAccountId],
        references: [ledgerAccounts.id],
        relationName: 'account_hierarchy'
    }),
    childAccounts: many(ledgerAccounts, { relationName: 'account_hierarchy' }),
    entries: many(ledgerEntries),
    valuationSnapshots: many(fxValuationSnapshots),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
    user: one(users, { fields: [ledgerEntries.userId], references: [users.id] }),
    account: one(ledgerAccounts, { fields: [ledgerEntries.accountId], references: [ledgerAccounts.id] }),
    vault: one(vaults, { fields: [ledgerEntries.vaultId], references: [vaults.id] }),
}));

export const fxValuationSnapshotsRelations = relations(fxValuationSnapshots, ({ one }) => ({
    user: one(users, { fields: [fxValuationSnapshots.userId], references: [users.id] }),
    account: one(ledgerAccounts, { fields: [fxValuationSnapshots.accountId], references: [ledgerAccounts.id] }),
    ledgerEntry: one(ledgerEntries, { fields: [fxValuationSnapshots.ledgerEntryId], references: [ledgerEntries.id] }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
    user: one(users, { fields: [portfolios.userId], references: [users.id] }),
    investments: many(investments),
}));

export const investmentsRelations = relations(investments, ({ one }) => ({
    portfolio: one(portfolios, { fields: [investments.portfolioId], references: [portfolios.id] }),
    user: one(users, { fields: [investments.userId], references: [users.id] }),
    vault: one(vaults, { fields: [investments.vaultId], references: [vaults.id] }),
}));

export const fixedAssetsRelations = relations(fixedAssets, ({ one }) => ({
    user: one(users, { fields: [fixedAssets.userId], references: [users.id] }),
}));

export const corporateEntitiesRelations = relations(corporateEntities, ({ one, many }) => ({
    user: one(users, { fields: [corporateEntities.userId], references: [users.id] }),
    parent: one(corporateEntities, { fields: [corporateEntities.parentEntityId], references: [corporateEntities.id], relationName: 'subsidiaries' }),
    subsidiaries: many(corporateEntities, { relationName: 'subsidiaries' }),
    employees: many(employees),
    payrollRuns: many(payrollRuns),
    ledgerEntries: many(businessLedgers),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
    entity: one(corporateEntities, { fields: [employees.entityId], references: [corporateEntities.id] }),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
    user: one(users, { fields: [properties.userId], references: [users.id] }),
    asset: one(fixedAssets, { fields: [properties.assetId], references: [fixedAssets.id] }),
    leases: many(tenantLeases),
    maintenanceLogs: many(propertyMaintenance),
    roiSnapshots: many(propertyROISnapshots),
}));

export const tenantLeasesRelations = relations(tenantLeases, ({ one }) => ({
    property: one(properties, { fields: [tenantLeases.propertyId], references: [properties.id] }),
    user: one(users, { fields: [tenantLeases.userId], references: [users.id] }),
}));

// ============================================================================
// MULTI-VAULT CONSOLIDATION (#288)
// ============================================================================

// Vault Groups - Logical groupings of multiple vaults
export const vaultGroups = pgTable('vault_groups', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false),
    settings: jsonb('settings').default({}),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_vault_groups_user').on(table.userId),
}));

// Vault Group Mappings - Links vaults to groups
export const vaultGroupMappings = pgTable('vault_group_mappings', {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').references(() => vaultGroups.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').notNull(), // Assuming vaultId is handled by vault service
    role: text('role').default('member'), // owner, contributor, viewer
    addedAt: timestamp('added_at').defaultNow(),
}, (table) => ({
    groupIdx: index('idx_vgm_group').on(table.groupId),
    vaultIdx: index('idx_vgm_vault').on(table.vaultId),
}));

// Consolidated Snapshots - Historical performance data for vault groups
export const consolidatedSnapshots = pgTable('consolidated_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').references(() => vaultGroups.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: timestamp('snapshot_date').notNull(),
    totalValue: numeric('total_value', { precision: 18, scale: 2 }).notNull(),
    cashBalance: numeric('cash_balance', { precision: 18, scale: 2 }),
    assetValue: numeric('asset_value', { precision: 18, scale: 2 }),
    liabilityValue: numeric('liability_value', { precision: 18, scale: 2 }),
    netWorth: numeric('net_worth', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    vaultCount: integer('vault_count').default(0),
    performanceMetrics: jsonb('performance_metrics').default({}),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    groupIdx: index('idx_cs_group').on(table.groupId),
    dateIdx: index('idx_cs_date').on(table.snapshotDate),
}));

// Consolidated Analytics - Aggregated analytics across vaults
export const consolidatedAnalytics = pgTable('consolidated_analytics', {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').references(() => vaultGroups.id, { onDelete: 'cascade' }).notNull(),
    analysisType: text('analysis_type').notNull(), // asset_allocation, risk_exposure, yield_analysis, tax_efficiency
    analysisDate: timestamp('analysis_date').notNull(),
    data: jsonb('data').notNull(),
    insights: jsonb('insights').default([]),
    timeframe: text('timeframe').default('month'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    groupIdx: index('idx_ca_group').on(table.groupId),
    typeIdx: index('idx_ca_type').on(table.analysisType),
    dateIdx: index('idx_ca_date').on(table.analysisDate),
}));

// ============================================================================
// RECURRING PAYMENTS & BILL AUTOMATION (#298)
// ============================================================================

// Recurring Transactions - Detected recurring patterns
export const recurringTransactions = pgTable('recurring_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    merchantName: text('merchant_name'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    frequency: text('frequency').notNull(), // daily, weekly, biweekly, monthly, quarterly, yearly
    nextDueDate: timestamp('next_due_date').notNull(),
    lastProcessedDate: timestamp('last_processed_date'),
    status: text('status').default('active'), // active, paused, cancelled, completed
    isAutoPayEnabled: boolean('is_auto_pay_enabled').default(false),
    confidence: doublePrecision('confidence').default(0.85), // Detection confidence
    detectionMethod: text('detection_method').default('pattern'), // pattern, manual, imported
    occurrenceCount: integer('occurrence_count').default(0),
    totalPaid: numeric('total_paid', { precision: 12, scale: 2 }).default(0),
    averageAmount: numeric('average_amount', { precision: 12, scale: 2 }),
    varianceAmount: doublePrecision('variance_amount'),
    paymentMethod: text('payment_method'), // credit_card, bank_account, cash, etc
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_recurring_user').on(table.userId),
    statusIdx: index('idx_recurring_status').on(table.status),
    dueDateIdx: index('idx_recurring_due_date').on(table.nextDueDate),
}));

// Scheduled Payments - Upcoming bill payments
export const scheduledPayments = pgTable('scheduled_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    payeeName: text('payee_name').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    scheduledDate: timestamp('scheduled_date').notNull(),
    dueDate: timestamp('due_date'),
    status: text('status').default('pending'), // pending, processing, completed, failed, cancelled
    paymentMethod: text('payment_method'),
    accountId: text('account_id'), // Reference to payment account
    confirmationNumber: text('confirmation_number'),
    failureReason: text('failure_reason'),
    isAutoPay: boolean('is_auto_pay').default(false),
    reminderSent: boolean('reminder_sent').default(false),
    reminderSentAt: timestamp('reminder_sent_at'),
    processedAt: timestamp('processed_at'),
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_scheduled_user').on(table.userId),
    statusIdx: index('idx_scheduled_status').on(table.status),
    scheduledDateIdx: index('idx_scheduled_date').on(table.scheduledDate),
    recurringIdx: index('idx_scheduled_recurring').on(table.recurringTransactionId),
}));

// Payment Reminders - Notification tracking
export const paymentRemindersTracking = pgTable('payment_reminders_tracking', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scheduledPaymentId: uuid('scheduled_payment_id').references(() => scheduledPayments.id, { onDelete: 'cascade' }),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    reminderType: text('reminder_type').notNull(), // upcoming, due_today, overdue, confirmation
    reminderDate: timestamp('reminder_date').notNull(),
    sentAt: timestamp('sent_at'),
    deliveryMethod: text('delivery_method').default('email'), // email, sms, push, in_app
    status: text('status').default('pending'), // pending, sent, failed
    message: text('message'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_reminder_user').on(table.userId),
    statusIdx: index('idx_reminder_status').on(table.status),
    dateIdx: index('idx_reminder_date').on(table.reminderDate),
}));

// Subscription Tracking - Manage subscriptions
export const subscriptionTracking = pgTable('subscription_tracking', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    category: text('category'), // streaming, software, utilities, etc
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    billingCycle: text('billing_cycle').notNull(), // monthly, yearly, etc
    startDate: timestamp('start_date').notNull(),
    renewalDate: timestamp('renewal_date').notNull(),
    cancellationDate: timestamp('cancellation_date'),
    status: text('status').default('active'), // active, cancelled, expired, trial
    paymentMethod: text('payment_method'),
    website: text('website'),
    cancellationUrl: text('cancellation_url'),
    customerSupportContact: text('customer_support_contact'),
    trialEndDate: timestamp('trial_end_date'),
    autoRenew: boolean('auto_renew').default(true),
    totalSpent: numeric('total_spent', { precision: 12, scale: 2 }).default(0),
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_subscription_user').on(table.userId),
    statusIdx: index('idx_subscription_status').on(table.status),
    renewalIdx: index('idx_subscription_renewal').on(table.renewalDate),
}));

// ============================================================================
// ADVANCED TRANSACTION CATEGORIZATION (#296)
// ============================================================================

// Merchants - Recognized merchant entities
export const merchants = pgTable('merchants', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    defaultCategoryId: uuid('default_category_id').references(() => categories.id, { onDelete: 'set null' }),
    website: text('website'),
    logoUrl: text('logo_url'),
    industry: text('industry'),
    isVerified: boolean('is_verified').default(false),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_merchants_user').on(table.userId),
    nameIdx: index('idx_merchants_name').on(table.normalizedName),
}));

// Categorization Rules - User-defined or system rules
export const categorizationRules = pgTable('categorization_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    priority: integer('priority').default(0),
    conditionType: text('condition_type').notNull(), // text_match, amount_range, date_range, combined
    conditionConfig: jsonb('condition_config').notNull(),
    isActive: boolean('is_active').default(true),
    matchCount: integer('match_count').default(0),
    lastMatchAt: timestamp('last_match_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_cat_rules_user').on(table.userId),
}));

// Categorization Patterns - ML-derived or frequent patterns
export const categorizationPatterns = pgTable('categorization_patterns', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    pattern: text('pattern').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    confidence: doublePrecision('confidence').default(0.0),
    occurrenceCount: integer('occurrence_count').default(1),
    isSystemPattern: boolean('is_system_pattern').default(false),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_cat_patterns_user').on(table.userId),
    patternIdx: index('idx_cat_patterns_text').on(table.pattern),
}));

// ============================================================================
// MULTI-CURRENCY PORTFOLIO MANAGER (#297)
// ============================================================================

// User Currencies - Tracks which currencies a user uses and their preferences
export const userCurrencies = pgTable('user_currencies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currencyCode: text('currency_code').notNull(), // USD, EUR, INR, etc.
    isBaseCurrency: boolean('is_base_currency').default(false),
    exchangeRateSource: text('exchange_rate_source').default('market'), // market, manual
    manualRate: numeric('manual_rate', { precision: 18, scale: 6 }),
    autoRefresh: boolean('auto_refresh').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_user_curr_user').on(table.userId),
    codeIdx: index('idx_user_curr_code').on(table.currencyCode),
}));

// Exchange Rate History - Historical FX rates
export const exchangeRateHistory = pgTable('exchange_rate_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
    source: text('source').default('open_exchange_rates'),
    rateTimestamp: timestamp('rate_timestamp').notNull(),
    metadata: jsonb('metadata').default({}),
}, (table) => ({
    fromIdx: index('idx_fx_from').on(table.fromCurrency),
    toIdx: index('idx_fx_to').on(table.toCurrency),
    dateIdx: index('idx_fx_date').on(table.rateTimestamp),
}));

// ============================================================================
// SELF-ADJUSTING LIQUIDITY BRIDGE & FX SETTLEMENT LAYER (#455)
// ============================================================================

export const liquidityPools = pgTable('liquidity_pools', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currencyCode: text('currency_code').notNull(),
    totalBalance: numeric('total_balance', { precision: 24, scale: 8 }).default('0'),
    lockedLiquidity: numeric('locked_liquidity', { precision: 24, scale: 8 }).default('0'),
    minThreshold: numeric('min_threshold', { precision: 24, scale: 8 }).default('1000'), // Trigger external rail if below
    lastRebalancedAt: timestamp('last_rebalanced_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const internalClearingLogs = pgTable('internal_clearing_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    fromVaultId: uuid('from_vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    toVaultId: uuid('to_vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    amountOrig: numeric('amount_orig', { precision: 24, scale: 8 }).notNull(),
    amountSettled: numeric('amount_settled', { precision: 24, scale: 8 }).notNull(),
    appliedExchangeRate: numeric('applied_exchange_rate', { precision: 18, scale: 6 }).notNull(),
    savingsVsMarket: numeric('savings_vs_market', { precision: 18, scale: 2 }).default('0'),
    settlementStatus: text('settlement_status').default('completed'), // 'completed', 'pending', 'offset'
    clearingMethod: text('clearing_method').default('ledger_offset'), // 'ledger_offset', 'bridge_pool'
    createdAt: timestamp('created_at').defaultNow(),
});

export const fxSettlementInstructions = pgTable('fx_settlement_instructions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    instructionType: text('instruction_type').notNull(), // 'instant', 'limit', 'scheduled'
    priority: text('priority').default('medium'), // 'high', 'medium', 'low'
    sourceCurrency: text('source_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    amount: numeric('amount', { precision: 24, scale: 8 }).notNull(),
    limitRate: numeric('limit_rate', { precision: 18, scale: 6 }),
    status: text('status').default('queued'), // 'queued', 'executing', 'fulfilled', 'cancelled'
    metadata: jsonb('metadata').default({}),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const marketRatesOracle = pgTable('market_rates_oracle', {
    id: uuid('id').defaultRandom().primaryKey(),
    baseCurrency: text('base_currency').notNull(),
    quoteCurrency: text('quote_currency').notNull(),
    midRate: numeric('mid_rate', { precision: 18, scale: 6 }).notNull(),
    bidRate: numeric('bid_rate', { precision: 18, scale: 6 }),
    askRate: numeric('ask_rate', { precision: 18, scale: 6 }),
    volatility24h: numeric('volatility_24h', { precision: 5, scale: 4 }),
    lastUpdated: timestamp('last_updated').defaultNow(),
    source: text('source').default('interbank_direct'),
});

// Currency Hedging Positions - Tracking hedges against FX volatility
export const currencyHedgingPositions = pgTable('currency_hedging_positions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id'), // Optional link to specific portfolio
    baseCurrency: text('base_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    notionalAmount: numeric('notional_amount', { precision: 18, scale: 2 }).notNull(),
    hedgeType: text('hedge_type').notNull(), // forward, option, swap
    entryRate: numeric('entry_rate', { precision: 18, scale: 6 }).notNull(),
    expiryDate: timestamp('expiry_date'),
    status: text('status').default('active'), // active, closed, expired
    gainLoss: numeric('gain_loss', { precision: 18, scale: 2 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_hedge_user').on(table.userId),
    statusIdx: index('idx_hedge_status').on(table.status),
}));

// ============================================================================
// PREDICTIVE "FINANCIAL BUTTERFLY" MONTE CARLO ENGINE (#454)
// ============================================================================

export const simulationScenarios = pgTable('simulation_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    baseYearlyGrowth: numeric('base_yearly_growth', { precision: 5, scale: 2 }).default('7.00'),
    marketVolatility: numeric('market_volatility', { precision: 5, scale: 2 }).default('15.00'),
    inflationRate: numeric('inflation_rate', { precision: 5, scale: 2 }).default('3.00'),
    timeHorizonYears: integer('time_horizon_years').default(30),
    iterationCount: integer('iteration_count').default(10000),
    configuration: jsonb('configuration').default({}), // Custom parameters like spending habits
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const economicVolatilityIndices = pgTable('economic_volatility_indices', {
    id: uuid('id').defaultRandom().primaryKey(),
    indexName: text('index_name').notNull(), // 'VIX', 'CPI', 'FedRates', 'RealEstateIndex'
    currentValue: numeric('current_value', { precision: 12, scale: 4 }).notNull(),
    standardDeviation: numeric('standard_deviation', { precision: 12, scale: 4 }),
    observationDate: timestamp('observation_date').notNull(),
    source: text('source').default('macro_feed'),
    metadata: jsonb('metadata').default({}),
});

// ============================================================================
// GOVERNANCE & INHERITANCE (ESTATE MANAGEMENT)
// ============================================================================

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
        approvalThreshold: 0,
        canManageRoles: false,
        canViewAll: true
    }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at').defaultNow(),
    expiresAt: timestamp('expires_at'),
    isActive: boolean('is_active').default(true),
});

export const familySettings = pgTable('family_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull().unique(),
    familyName: text('family_name'),
    defaultSplitMethod: text('default_split_method').default('equal'),
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
        shareExpenses: 'family',
        shareGoals: 'family',
        shareHealthScore: 'family'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Approval Requests (Maker-Checker Workflow)
export const approvalRequests = pgTable('approval_requests', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    requesterId: uuid('requester_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(), // 'expense', 'goal', 'transfer', 'role_change', 'inheritance_trigger'
    resourceId: uuid('resource_id'),
    action: text('action').notNull(),
    requestData: jsonb('request_data').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    status: text('status').default('pending'), // 'pending', 'approved', 'rejected', 'partially_approved'
    requiredApprovals: integer('required_approvals').default(1),
    currentApprovals: integer('current_approvals').default(0),
    approvedAt: timestamp('approved_at'),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Inheritance Rules (Digital Will / Smart Estate)
export const inheritanceRules = pgTable('inheritance_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id').references(() => users.id).notNull(),
    assetType: text('asset_type'), // 'vault', 'fixed_asset', 'portfolio', 'all'
    assetId: uuid('asset_id'),
    distributionPercentage: numeric('distribution_percentage', { precision: 5, scale: 2 }).default('100.00'),
    conditions: jsonb('conditions').default({
        inactivityThreshold: 90,
        minPortfolioValue: '0', // Dynamic Allocation condition
        requiresExecutorApproval: true,
        multiSigRequirement: 2
    }),
    status: text('status').default('active'), // 'active', 'triggered', 'awaiting_approval', 'executed', 'revoked'
    triggeredAt: timestamp('triggered_at'),
    executedAt: timestamp('executed_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// PORTFOLIO REBALANCING & ASSET DRIFT MANAGER (#308)
// ============================================================================

// Target Allocations - Define desired % for each asset in a portfolio
export const targetAllocations = pgTable('target_allocations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').notNull(), // Links to portfolios table
    assetType: text('asset_type').default('equity'), // 'equity', 'fixed_income', 'commodity', 'cash', 'crypto'
    symbol: text('symbol').notNull(), // Asset symbol (BTC, AAPL, etc)
    targetPercentage: numeric('target_percentage', { precision: 5, scale: 2 }).notNull(), // e.g. 20.00 for 20%
    toleranceBand: numeric('tolerance_band', { precision: 5, scale: 2 }).default('5.00'), // e.g. 5% drift allowed
    rebalanceFrequency: text('rebalance_frequency').default('monthly'), // monthly, quarterly, yearly
    isActive: boolean('is_active').default(true),
    lastRebalancedAt: timestamp('last_rebalanced_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_target_allocations_user').on(table.userId),
    portfolioIdx: index('idx_target_allocations_portfolio').on(table.portfolioId),
}));

// Rebalance History - Logs of performed rebalancing operations
export const rebalanceHistory = pgTable('rebalance_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').notNull(),
    status: text('status').default('proposed'), // proposed, executing, completed, failed
    driftAtExecution: jsonb('drift_at_execution').notNull(), // Snapshot of drift before trades
    tradesPerformed: jsonb('trades_performed').default([]), // List of buy/sell orders
    totalTaxImpact: numeric('total_tax_impact', { precision: 12, scale: 2 }).default('0'),
    feesPaid: numeric('fees_paid', { precision: 12, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_rebalance_history_user').on(table.userId),
}));

// Drift Logs - Hourly health checks for portfolios
export const driftLogs = pgTable('drift_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').notNull(),
    currentAllocations: jsonb('current_allocations').notNull(), // { 'BTC': 25%, 'ETH': 15% }
    maxDriftDetected: numeric('max_drift_detected', { precision: 5, scale: 2 }).notNull(),
    isBreachDetected: boolean('is_breach_detected').default(false),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_drift_logs_user').on(table.userId),
    portfolioIdx: index('idx_drift_logs_portfolio').on(table.portfolioId),
}));

// ============================================================================
// AUDIT & LOGGING SYSTEM (#319)
// ============================================================================

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

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
    user: one(users, { fields: [securityEvents.userId], references: [users.id] }),
}));

export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    originalState: jsonb('original_state'),
    newState: jsonb('new_state'),
    delta: jsonb('delta'),
    deltaHash: text('delta_hash'),
    metadata: jsonb('metadata').default({}),
    status: text('status').default('success'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),
    requestId: text('request_id'),
    performedAt: timestamp('performed_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_audit_user').on(table.userId),
    actionIdx: index('idx_audit_action').on(table.action),
    resourceIdx: index('idx_audit_resource').on(table.resourceType, table.resourceId),
    dateIdx: index('idx_audit_date').on(table.performedAt),
}));

export const auditSnapshots = pgTable('audit_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date').notNull(),
    totalBalance: numeric('total_balance', { precision: 15, scale: 2 }),
    accountState: text('account_state').notNull(), // Compressed/Serialized state
    transactionCount: integer('transaction_count'),
    checksum: text('checksum'),
    compressionType: text('compression_type').default('gzip'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_audit_snapshots_user').on(table.userId),
    dateIdx: index('idx_audit_snapshots_date').on(table.snapshotDate),
}));

export const stateDeltas = pgTable('state_deltas', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(), // expense, goal, investment, etc.
    resourceId: uuid('resource_id').notNull(),
    operation: text('operation').notNull(), // CREATE, UPDATE, DELETE
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    changedFields: jsonb('changed_fields').default([]),
    triggeredBy: text('triggered_by'), // user_action, system_job, recursive_engine
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    checksum: text('checksum'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_state_deltas_user').on(table.userId),
    resourceIdx: index('idx_state_deltas_resource').on(table.resourceType, table.resourceId),
    dateIdx: index('idx_state_deltas_date').on(table.createdAt),
}));

export const forensicQueries = pgTable('forensic_queries', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    queryType: text('query_type').notNull(), // replay, trace, explain
    targetDate: timestamp('target_date'),
    targetResourceId: text('target_resource_id'),
    queryParams: jsonb('query_params').default({}),
    resultSummary: jsonb('result_summary').default({}),
    aiExplanation: jsonb('ai_explanation'),
    executionTime: integer('execution_time'), // ms
    status: text('status').default('pending'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_forensic_user').on(table.userId),
    typeIdx: index('idx_forensic_type').on(table.queryType),
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

export const savingsChallenges = pgTable('savings_challenges', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    duration: integer('duration').notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    rules: jsonb('rules').default({
        minParticipants: 1,
        maxParticipants: null,
        allowLateJoin: false,
        progressTracking: 'automatic'
    }).notNull(),
    rewards: jsonb('rewards').default({
        completionBadge: true,
        leaderboardBonus: false,
        customRewards: []
    }).notNull(),
    metadata: jsonb('metadata').default({
        participantCount: 0,
        totalProgress: 0,
        completionRate: 0
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        creatorIdIdx: index('savings_challenges_creator_id_idx').on(table.creatorId),
        typeIdx: index('savings_challenges_type_idx').on(table.type),
        isActiveIdx: index('savings_challenges_is_active_idx').on(table.isActive),
    };
});

export const userScores = pgTable('user_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    overallScore: doublePrecision('overall_score').default(0),
    budgetAdherence: doublePrecision('budget_adherence').default(0),
    savingsRate: doublePrecision('savings_rate').default(0),
    consistency: doublePrecision('consistency').default(0),
    impulseControl: doublePrecision('impulse_control').default(0),
    planningScore: doublePrecision('planning_score').default(0),
    streakDays: integer('streak_days').default(0),
    level: integer('level').default(1),
    experience: integer('experience').default(0),
    rank: text('rank').default('Bronze'), // Bronze, Silver, Gold, Platinum, Diamond
    metadata: jsonb('metadata').default({
        achievements: [],
        lastCalculated: null,
        milestones: []
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const habitLogs = pgTable('habit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    habitType: text('habit_type').notNull(), // 'expense_logged', 'budget_reviewed', 'goal_updated', 'savings_deposited'
    description: text('description'),
    points: integer('points').default(0),
    metadata: jsonb('metadata').default({
        category: null,
        amount: null,
        relatedResourceId: null
    }),
    loggedAt: timestamp('logged_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_habit_logs_user').on(table.userId),
    dateIdx: index('idx_habit_logs_date').on(table.loggedAt),
}));

export const badges = pgTable('badges', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    badgeType: text('badge_type').notNull(), // 'expense_streak', 'savings_goal', 'budget_master', 'debt_free'
    title: text('title').notNull(),
    description: text('description'),
    icon: text('icon'),
    earnedAt: timestamp('earned_at').defaultNow(),
    metadata: jsonb('metadata').default({
        tier: 'bronze',
        progress: 0,
        requirement: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_badges_user').on(table.userId),
    typeIdx: index('idx_badges_type').on(table.badgeType),
}));

// Inheritance Executors (Multi-Sig verification)

export const inheritanceExecutors = pgTable('inheritance_executors', {
    id: uuid('id').defaultRandom().primaryKey(),
    ruleId: uuid('rule_id').references(() => inheritanceRules.id, { onDelete: 'cascade' }).notNull(),
    executorId: uuid('executor_id').references(() => users.id).notNull(),
    role: text('role').default('executor'), // 'executor', 'witness', 'trustee'
    status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
    approvedAt: timestamp('approved_at'),
    rejectionReason: text('rejection_reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Inactivity Triggers (Dead Man's Switch Monitoring)
export const inactivityTriggers = pgTable('inactivity_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
    lastActivityType: text('last_activity_type'),
    inactivityDays: integer('inactivity_days').default(0),
    warningsSent: integer('warnings_sent').default(0),
    status: text('status').default('active'), // 'active', 'warned', 'triggered'
    challengeToken: text('challenge_token'),
    challengeSentAt: timestamp('challenge_sent_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Asset Step-Up Basis Logs (Tax Optimization)
export const assetStepUpLogs = pgTable('asset_step_up_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id').notNull(), // References vaults.id or fixed_assets.id
    assetType: text('asset_type').notNull(),
    inheritedBy: uuid('inherited_by').references(() => users.id).notNull(),
    inheritedFrom: uuid('inherited_from').references(() => users.id).notNull(),
    originalBasis: numeric('original_basis', { precision: 12, scale: 2 }).notNull(),
    steppedUpBasis: numeric('stepped_up_basis', { precision: 12, scale: 2 }).notNull(),
    valuationDate: timestamp('valuation_date').defaultNow(),
    taxYear: integer('tax_year').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// LIQUIDITY OPTIMIZER L3 (#343)
// ============================================================================

export const creditLines = pgTable('credit_lines', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    provider: text('provider').notNull(), // 'Bank X', 'Credit Card Y'
    type: text('type').notNull(), // 'heloc', 'personal_line', 'credit_card', 'margin'
    creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull(),
    currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).default('0'),
    interestRate: numeric('interest_rate', { precision: 5, scale: 2 }).notNull(), // Annual interest rate
    billingCycleDay: integer('billing_cycle_day').default(1),
    isTaxDeductible: boolean('is_tax_deductible').default(false),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const liquidityProjections = pgTable('liquidity_projections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectionDate: timestamp('projection_date').notNull(),
    baseBalance: numeric('base_balance', { precision: 12, scale: 2 }).notNull(),
    p10Balance: numeric('p10_balance', { precision: 12, scale: 2 }), // 10th percentile (Worst Case)
    p50Balance: numeric('p50_balance', { precision: 12, scale: 2 }), // 50th percentile (Median)
    p90Balance: numeric('p90_balance', { precision: 12, scale: 2 }), // 90th percentile (Best Case)
    liquidityCrunchProbability: doublePrecision('liquidity_crunch_probability').default(0),
    crunchDetectedAt: timestamp('crunch_detected_at'),
    simulationMetadata: jsonb('simulation_metadata').default({ iterations: 1000 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const liquidityOptimizerActions = pgTable('liquidity_optimizer_actions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectionId: uuid('projection_id').references(() => liquidityProjections.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(), // 'asset_sale', 'credit_draw', 'transfer', 'rebalance'
    resourceType: text('resource_type').notNull(), // 'investment', 'credit_line', 'vault'
    resourceId: uuid('resource_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
    impactScore: integer('impact_score'), // 1-100 score of how much this helps
    taxImpact: numeric('tax_impact', { precision: 12, scale: 2 }).default('0'),
    costOfCapital: numeric('cost_of_capital', { precision: 5, scale: 2 }), // Interest rate or loss of gains
    status: text('status').default('proposed'), // 'proposed', 'executed', 'ignored', 'failed'
    executedAt: timestamp('executed_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// BEHAVIORAL FORENSIC ENGINE & FRAUD PREVENTION SHIELD L3 (#342)
// ============================================================================

export const behavioralProfiles = pgTable('behavioral_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    normalcyBaseline: jsonb('normalcy_baseline').default({
        avgTransactionValue: 0,
        spendingVelocity: 0,
        commonGeolocations: [],
        commonDeviceFingerprints: [],
        peakSpendingHours: [],
        categoryDistributions: {}
    }),
    riskScore: integer('risk_score').default(0),
    trustLevel: text('trust_level').default('standard'), // trusted, standard, suspicious, restricted
    lastAnalysisAt: timestamp('last_analysis_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const fraudPreventionShields = pgTable('fraud_prevention_shields', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    isEnabled: boolean('is_enabled').default(true),
    strictnessLevel: text('strictness_level').default('moderate'), // passive, moderate, aggressive, paranoid
    blockingThreshold: integer('blocking_threshold').default(80), // Risk score to automatically block
    reviewThreshold: integer('review_threshold').default(50), // Risk score to hold for verification
    interceptedCount: integer('intercepted_count').default(0),
    totalSaved: numeric('total_saved', { precision: 12, scale: 2 }).default('0'),
    settings: jsonb('settings').default({
        blockHighValue: true,
        blockUnusualLocation: true,
        blockNewDevice: false,
        requireMFABeyondLimit: 1000
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const fraudIntercepts = pgTable('fraud_intercepts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    transactionData: jsonb('transaction_data').notNull(),
    riskScore: integer('risk_score').notNull(),
    riskReasons: jsonb('risk_reasons').default([]),
    status: text('status').default('held'), // held, verified, blocked, released
    verificationMethod: text('verification_method'), // chatbot_mfa, manual_review, security_challenge
    releasedAt: timestamp('released_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// GOVERNANCE RELATIONS
// ============================================================================

export const familyRolesRelations = relations(familyRoles, ({ one }) => ({
    vault: one(vaults, { fields: [familyRoles.vaultId], references: [vaults.id] }),
    user: one(users, { fields: [familyRoles.userId], references: [users.id] }),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
    vault: one(vaults, { fields: [approvalRequests.vaultId], references: [vaults.id] }),
    requester: one(users, { fields: [approvalRequests.requesterId], references: [users.id] }),
}));

export const inheritanceRulesRelations = relations(inheritanceRules, ({ one, many }) => ({
    user: one(users, { fields: [inheritanceRules.userId], references: [users.id] }),
    beneficiary: one(users, { fields: [inheritanceRules.beneficiaryId], references: [users.id] }),
    executors: many(inheritanceExecutors),
}));

export const inheritanceExecutorsRelations = relations(inheritanceExecutors, ({ one }) => ({
    rule: one(inheritanceRules, { fields: [inheritanceExecutors.ruleId], references: [inheritanceRules.id] }),
    executor: one(users, { fields: [inheritanceExecutors.executorId], references: [users.id] }),
}));

export const inactivityTriggersRelations = relations(inactivityTriggers, ({ one }) => ({
    user: one(users, { fields: [inactivityTriggers.userId], references: [users.id] }),
}));

export const assetStepUpLogsRelations = relations(assetStepUpLogs, ({ one }) => ({
    heir: one(users, { fields: [assetStepUpLogs.inheritedBy], references: [users.id] }),
    donor: one(users, { fields: [assetStepUpLogs.inheritedFrom], references: [users.id] }),
}));

export const creditLinesRelations = relations(creditLines, ({ one }) => ({
    user: one(users, { fields: [creditLines.userId], references: [users.id] }),
}));

export const liquidityProjectionsRelations = relations(liquidityProjections, ({ one, many }) => ({
    user: one(users, { fields: [liquidityProjections.userId], references: [users.id] }),
    actions: many(liquidityOptimizerActions),
}));

export const liquidityOptimizerActionsRelations = relations(liquidityOptimizerActions, ({ one }) => ({
    user: one(users, { fields: [liquidityOptimizerActions.userId], references: [users.id] }),
    projection: one(liquidityProjections, { fields: [liquidityOptimizerActions.projectionId], references: [liquidityProjections.id] }),
}));

export const behavioralProfilesRelations = relations(behavioralProfiles, ({ one }) => ({
    user: one(users, { fields: [behavioralProfiles.userId], references: [users.id] }),
}));

export const fraudPreventionShieldsRelations = relations(fraudPreventionShields, ({ one }) => ({
    user: one(users, { fields: [fraudPreventionShields.userId], references: [users.id] }),
}));

export const fraudInterceptsRelations = relations(fraudIntercepts, ({ one }) => ({
    user: one(users, { fields: [fraudIntercepts.userId], references: [users.id] }),
}));

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
// Cross-Vault Arbitrage & Yield Optimization (L3)
export const yieldPools = pgTable('yield_pools', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    provider: text('provider'),
    assetClass: text('asset_class'), // cash, crypto, stocks
    currentApy: numeric('current_apy', { precision: 5, scale: 2 }).notNull(),
    riskScore: integer('risk_score'), // 1-10
    minDeposit: numeric('min_deposit', { precision: 12, scale: 2 }),
    liquidityType: text('liquidity_type'), // instant, daily, monthly
    lastUpdated: timestamp('last_updated').defaultNow(),
});

export const arbitrageStrategies = pgTable('arbitrage_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    isEnabled: boolean('is_enabled').default(false),
    minSpread: numeric('min_spread', { precision: 5, scale: 2 }).default('0.5'), // Minimum % difference to trigger
    autoExecute: boolean('auto_execute').default(false),
    maxTransferCap: numeric('max_transfer_cap', { precision: 12, scale: 2 }),
    restrictedVaultIds: jsonb('restricted_vault_ids').default([]),
    priority: text('priority').default('yield'), // 'yield' or 'debt_reduction'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const arbitrageEvents = pgTable('arbitrage_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyId: uuid('strategy_id').references(() => arbitrageStrategies.id),
    sourceVaultId: uuid('source_id'),
    targetTypeId: uuid('target_id'), // Can be another vault or a debt_id
    targetType: text('target_type'), // 'vault' or 'debt'
    simulatedYieldGain: numeric('simulated_yield_gain', { precision: 12, scale: 2 }),
    simulatedInterestSaved: numeric('simulated_interest_saved', { precision: 12, scale: 2 }),
    netAdvantage: numeric('net_advantage', { precision: 12, scale: 2 }),
    status: text('status').default('detected'), // 'detected', 'executed', 'ignored', 'failed'
    executionLog: jsonb('execution_log').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const crossVaultTransfers = pgTable('cross_vault_transfers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    eventId: uuid('event_id').references(() => arbitrageEvents.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    fromVaultId: uuid('from_vault_id').references(() => vaults.id),
    toVaultId: uuid('to_vault_id').references(() => vaults.id),
    toDebtId: uuid('to_debt_id').references(() => debts.id),
    fee: numeric('fee', { precision: 12, scale: 2 }).default('0'),
    status: text('status').notNull(), // 'pending', 'completed', 'failed'
    transactionHash: text('transaction_hash'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations for Arbitrage
export const arbitrageStrategiesRelations = relations(arbitrageStrategies, ({ one }) => ({
    user: one(users, { fields: [arbitrageStrategies.userId], references: [users.id] }),
}));

export const arbitrageEventsRelations = relations(arbitrageEvents, ({ one, many }) => ({
    user: one(users, { fields: [arbitrageEvents.userId], references: [users.id] }),
    strategy: one(arbitrageStrategies, { fields: [arbitrageEvents.strategyId], references: [arbitrageStrategies.id] }),
    transfers: many(crossVaultTransfers),
}));

export const crossVaultTransfersRelations = relations(crossVaultTransfers, ({ one }) => ({
    event: one(arbitrageEvents, { fields: [crossVaultTransfers.eventId], references: [arbitrageEvents.id] }),
    fromVault: one(vaults, { fields: [crossVaultTransfers.fromVaultId], references: [vaults.id] }),
    toVault: one(vaults, { fields: [crossVaultTransfers.toVaultId], references: [vaults.id] }),
    toDebt: one(debts, { fields: [crossVaultTransfers.toDebtId], references: [debts.id] }),
}));

// Sovereign Heirship & Multi-Sig Succession (L3)
export const successionLogs = pgTable('succession_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').default('searching'), // 'searching', 'triggered', 'multi_sig_pending', 'executing', 'completed', 'failed'
    triggerType: text('trigger_type'), // 'inactivity', 'manual', 'legal_death'
    totalAssetsValue: numeric('total_assets_value', { precision: 12, scale: 2 }),
    requiredApprovals: integer('required_approvals').default(1),
    currentApprovals: integer('current_approvals').default(0),
    activatedAt: timestamp('activated_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    metadata: jsonb('metadata').default({}),
});

export const multiSigApprovals = pgTable('multi_sig_approvals', {
    id: uuid('id').defaultRandom().primaryKey(),
    successionId: uuid('succession_id').references(() => successionLogs.id, { onDelete: 'cascade' }),
    executorId: uuid('executor_id').references(() => users.id).notNull(),
    action: text('action').notNull(), // 'APPROVE', 'REJECT', 'WITNESS'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    signature: text('signature'), // Digital signature hash
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations for Succession
export const successionLogsRelations = relations(successionLogs, ({ one, many }) => ({
    user: one(users, { fields: [successionLogs.userId], references: [users.id] }),
    approvals: many(multiSigApprovals),
}));

export const multiSigApprovalsRelations = relations(multiSigApprovals, ({ one }) => ({
    succession: one(successionLogs, { fields: [multiSigApprovals.successionId], references: [successionLogs.id] }),
    executor: one(users, { fields: [multiSigApprovals.executorId], references: [users.id] }),
}));

// ============================================================================
// PROBABILISTIC FORECASTING & ADAPTIVE REBALANCING (L3) (#361)
// ============================================================================

export const goalRiskProfiles = pgTable('goal_risk_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull().unique(),
    riskLevel: text('risk_level').default('moderate'), // conservative, moderate, aggressive
    autoRebalance: boolean('auto_rebalance').default(false),
    minSuccessProbability: doublePrecision('min_success_probability').default(0.70), // Threshold to trigger rebalance
    lastSimulationAt: timestamp('last_simulation_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const simulationResults = pgTable('simulation_results', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioId: uuid('scenario_id').references(() => simulationScenarios.id, { onDelete: 'cascade' }), // For Butterfly Engine
    resourceId: uuid('resource_id'), // Goal ID or Portfolio ID
    resourceType: text('resource_type').default('goal'), // 'goal', 'portfolio', 'butterfly'
    simulatedOn: timestamp('simulated_on').defaultNow(),
    p10Value: numeric('p10_value', { precision: 18, scale: 2 }), // Worst case (10th percentile)
    p50Value: numeric('p50_value', { precision: 18, scale: 2 }), // Median (50th percentile)
    p90Value: numeric('p90_value', { precision: 18, scale: 2 }), // Best case (90th percentile)
    successProbability: doublePrecision('success_probability'),
    expectedShortfall: numeric('expected_shortfall', { precision: 18, scale: 2 }),
    simulationData: jsonb('simulation_data'), // Array of projected paths [timestamp, value]
    iterations: integer('iterations').default(10000),
    metadata: jsonb('metadata').default({}),
});

export const rebalanceTriggers = pgTable('rebalance_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    previousRiskLevel: text('previous_risk_level'),
    newRiskLevel: text('new_risk_level'),
    triggerReason: text('trigger_reason'), // e.g., 'success_probability_drop'
    simulatedSuccessProbability: doublePrecision('simulated_success_probability'),
    executedAt: timestamp('executed_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

// Relations for Probabilistic Forecasting
export const goalRiskProfilesRelations = relations(goalRiskProfiles, ({ one }) => ({
    goal: one(goals, { fields: [goalRiskProfiles.goalId], references: [goals.id] }),
}));

export const simulationResultsRelations = relations(simulationResults, ({ one }) => ({
    user: one(users, { fields: [simulationResults.userId], references: [users.id] }),
}));

export const rebalanceTriggersRelations = relations(rebalanceTriggers, ({ one }) => ({
    user: one(users, { fields: [rebalanceTriggers.userId], references: [users.id] }),
    goal: one(goals, { fields: [rebalanceTriggers.goalId], references: [goals.id] }),
}));

// ============================================================================
// MULTI-ENTITY INTER-COMPANY CLEARING (L3) (#360)
// ============================================================================

export const entities = pgTable('entities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'personal', 'llc', 'trust', 'corp'
    functionalCurrency: text('functional_currency').default('USD'),
    taxId: text('tax_id'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const interCompanyLedger = pgTable('inter_company_ledger', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    fromEntityId: uuid('from_entity_id').references(() => entities.id).notNull(),
    toEntityId: uuid('to_entity_id').references(() => entities.id).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    description: text('description'),
    transactionType: text('transaction_type').notNull(), // 'loan', 'clearing', 'expense_reimbursement'
    status: text('status').default('pending'), // 'pending', 'cleared', 'disputed'
    clearedAt: timestamp('cleared_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations for Multi-Entity
export const entitiesRelations = relations(entities, ({ one, many }) => ({
    user: one(users, { fields: [entities.userId], references: [users.id] }),
    outboundTransactions: many(interCompanyLedger, { relationName: 'fromEntity' }),
    inboundTransactions: many(interCompanyLedger, { relationName: 'toEntity' }),
}));


export const interCompanyLedgerRelations = relations(interCompanyLedger, ({ one }) => ({
    fromEntity: one(entities, { fields: [interCompanyLedger.fromEntityId], references: [entities.id], relationName: 'fromEntity' }),
    toEntity: one(entities, { fields: [interCompanyLedger.toEntityId], references: [entities.id], relationName: 'toEntity' }),
    user: one(users, { fields: [interCompanyLedger.userId], references: [users.id] }),
}));

// ============================================================================
// AI-DRIVEN TAX-LOSS HARVESTING & WASH-SALE PREVENTION (L3) (#359)
// ============================================================================

export const taxLots = pgTable('tax_lots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
    costBasisPerUnit: numeric('cost_basis_per_unit', { precision: 18, scale: 2 }).notNull(),
    acquiredAt: timestamp('acquired_at').notNull(),
    soldAt: timestamp('sold_at'),
    isSold: boolean('is_sold').default(false),
    washSaleDisallowed: numeric('wash_sale_disallowed', { precision: 18, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const harvestOpportunities = pgTable('harvest_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    estimatedSavings: numeric('estimated_savings', { precision: 18, scale: 2 }).notNull(),
    unrealizedLoss: numeric('unrealized_loss', { precision: 18, scale: 2 }).notNull(),
    status: text('status').default('detected'), // 'detected', 'ignored', 'harvested'
    detectedAt: timestamp('detected_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

export const washSaleLogs = pgTable('wash_sale_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    transactionDate: timestamp('transaction_date').notNull(),
    disallowedLoss: numeric('disallowed_loss', { precision: 18, scale: 2 }).notNull(),
    replacementLotId: uuid('replacement_lot_id').references(() => taxLots.id),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// AUTOMATED TAX-LOT ACCOUNTING & HIFO INVENTORY VALUATION (#448)
// ============================================================================

export const taxLotInventory = pgTable('tax_lot_inventory', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    lotStatus: text('lot_status').default('open'), // 'open', 'closed', 'adjusted', 'split'
    originalQuantity: numeric('original_quantity', { precision: 18, scale: 8 }).notNull(),
    remainingQuantity: numeric('remaining_quantity', { precision: 18, scale: 8 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 18, scale: 2 }).notNull(),
    costBasisPerUnit: numeric('cost_basis_per_unit', { precision: 18, scale: 2 }).notNull(),
    purchaseDate: timestamp('purchase_date').notNull(),
    disposalDate: timestamp('disposal_date'),
    holdingPeriodType: text('holding_period_type'), // 'short_term', 'long_term'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const costBasisAdjustments = pgTable('cost_basis_adjustments', {
    id: uuid('id').defaultRandom().primaryKey(),
    lotId: uuid('lot_id').references(() => taxLotInventory.id, { onDelete: 'cascade' }).notNull(),
    adjustmentAmount: numeric('adjustment_amount', { precision: 18, scale: 2 }).notNull(),
    adjustmentType: text('adjustment_type').notNull(), // 'wash_sale', 'dividend_reinvest', 'corporate_action', 'manual'
    description: text('description'),
    adjustedAt: timestamp('adjusted_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

export const liquidationQueues = pgTable('liquidation_queues', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    totalQuantityToLiquidate: numeric('total_quantity_to_liquidate', { precision: 18, scale: 8 }).notNull(),
    method: text('method').default('HIFO'), // 'FIFO', 'LIFO', 'HIFO', 'SpecificID'
    status: text('status').default('pending'), // 'pending', 'processing', 'completed', 'failed'
    priority: integer('priority').default(1),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// REAL-TIME MARGIN MONITORING & LIQUIDITY STRESS TESTING (#447)
// ============================================================================

export const marginRequirements = pgTable('margin_requirements', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assetType: text('asset_type').notNull(), // 'equity', 'crypto', 'commodity', 'real_estate'
    initialMargin: numeric('initial_margin', { precision: 5, scale: 2 }).notNull(), // e.g., 50.00%
    maintenanceMargin: numeric('maintenance_margin', { precision: 5, scale: 2 }).notNull(), // e.g., 25.00%
    liquidationThreshold: numeric('liquidation_threshold', { precision: 5, scale: 2 }).notNull(), // e.g., 15.00%
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const collateralSnapshots = pgTable('collateral_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    timestamp: timestamp('timestamp').defaultNow(),
    totalCollateralValue: numeric('total_collateral_value', { precision: 18, scale: 2 }).notNull(),
    totalOutstandingDebt: numeric('total_outstanding_debt', { precision: 18, scale: 2 }).notNull(),
    currentLtv: numeric('current_ltv', { precision: 5, scale: 2 }).notNull(),
    marginStatus: text('margin_status').notNull(), // 'safe', 'warning', 'danger', 'margin_call'
    excessLiquidity: numeric('excess_liquidity', { precision: 18, scale: 2 }),
    metadata: jsonb('metadata').default({}),
});

export const stressTestScenarios = pgTable('stress_test_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioName: text('scenario_name').notNull(), // 'Market Crash - 20%', 'Crypto Winter', 'High Inflation'
    dropPercentages: jsonb('drop_percentages').notNull(), // e.g., { 'equity': -0.20, 'crypto': -0.50 }
    description: text('description'),
    riskLevel: text('risk_level').notNull(), // 'high', 'extreme', 'catastrophic'
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations for Tax Optimization
export const taxLotsRelations = relations(taxLots, ({ one }) => ({
    user: one(users, { fields: [taxLots.userId], references: [users.id] }),
    investment: one(investments, { fields: [taxLots.investmentId], references: [investments.id] }),
}));

export const harvestOpportunitiesRelations = relations(harvestOpportunities, ({ one }) => ({
    user: one(users, { fields: [harvestOpportunities.userId], references: [users.id] }),
    investment: one(investments, { fields: [harvestOpportunities.investmentId], references: [investments.id] }),
}));

export const washSaleLogsRelations = relations(washSaleLogs, ({ one }) => ({
    user: one(users, { fields: [washSaleLogs.userId], references: [users.id] }),
    investment: one(investments, { fields: [washSaleLogs.investmentId], references: [investments.id] }),
}));

// ============================================================================
// INTELLIGENT ANOMALY DETECTION & RISK SCORING (L3) (#372)
// ============================================================================

export const userRiskProfiles = pgTable('user_risk_profiles', {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
    avgTransactionAmount: numeric('avg_transaction_amount', { precision: 18, scale: 2 }).default('0'),
    stdDevTransactionAmount: numeric('std_dev_transaction_amount', { precision: 18, scale: 2 }).default('0'),
    dailyVelocityLimit: numeric('daily_velocity_limit', { precision: 18, scale: 2 }).default('10000'),
    riskScore: integer('risk_score').default(0), // 0-100 scale
    lastCalculatedAt: timestamp('last_calculated_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

export const anomalyLogs = pgTable('anomaly_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(), // 'transaction', 'inter_company'
    resourceId: uuid('resource_id').notNull(),
    riskScore: integer('risk_score').notNull(),
    reason: text('reason').notNull(), // 'Z-SCORE_VIOLATION', 'GEOLOCATION_MISMATCH'
    severity: text('severity').notNull(), // 'low', 'medium', 'high', 'critical'
    isFalsePositive: boolean('is_false_positive').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

export const securityCircuitBreakers = pgTable('security_circuit_breakers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').default('active'), // 'active', 'tripped', 'manual_bypass'
    trippedAt: timestamp('tripped_at'),
    reason: text('reason'),
    autoResetAt: timestamp('auto_reset_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations for Anomaly Detection
export const userRiskProfilesRelations = relations(userRiskProfiles, ({ one }) => ({
    user: one(users, { fields: [userRiskProfiles.userId], references: [users.id] }),
}));

export const anomalyLogsRelations = relations(anomalyLogs, ({ one }) => ({
    user: one(users, { fields: [anomalyLogs.userId], references: [users.id] }),
}));

export const securityCircuitBreakersRelations = relations(securityCircuitBreakers, ({ one }) => ({
    user: one(users, { fields: [securityCircuitBreakers.userId], references: [users.id] }),
}));

// ============================================================================
// MULTI-SIG GOVERNANCE & SUCCESSION PROTOCOL (L3) (#371)
// ============================================================================

export const multiSigWallets = pgTable('multi_sig_wallets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    requiredSignatures: integer('required_signatures').default(2),
    totalExecutors: integer('total_executors').default(3),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const executorRoles = pgTable('executor_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    walletId: uuid('wallet_id').references(() => multiSigWallets.id, { onDelete: 'cascade' }).notNull(),
    executorId: uuid('executor_id').references(() => users.id).notNull(), // User assigned as executor
    role: text('role').default('standard'), // 'standard', 'admin', 'successor'
    weight: integer('weight').default(1),
    createdAt: timestamp('created_at').defaultNow(),
});

export const approvalQuests = pgTable('approval_quests', {
    id: uuid('id').defaultRandom().primaryKey(),
    walletId: uuid('wallet_id').references(() => multiSigWallets.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(), // 'vault_withdrawal', 'entity_transfer'
    resourceId: uuid('resource_id').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }),
    status: text('status').default('pending'), // 'pending', 'approved', 'rejected', 'executed'
    proposerId: uuid('proposer_id').references(() => users.id).notNull(),
    signatures: jsonb('signatures').default([]), // List of executor IDs who signed
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const successionRules = pgTable('succession_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    triggerType: text('trigger_type').default('inactivity'), // 'inactivity', 'manual_notarized'
    inactivityDays: integer('inactivity_days').default(90),
    status: text('status').default('active'), // 'active', 'triggered', 'distributed'
    distributionPlan: jsonb('distribution_plan').notNull(), // Array of { entityId, percentage, recipientId }
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const multiSigWalletsRelations = relations(multiSigWallets, ({ one, many }) => ({
    user: one(users, { fields: [multiSigWallets.userId], references: [users.id] }),
    executors: many(executorRoles),
    quests: many(approvalQuests),
}));

export const executorRolesRelations = relations(executorRoles, ({ one }) => ({
    wallet: one(multiSigWallets, { fields: [executorRoles.walletId], references: [multiSigWallets.id] }),
    executor: one(users, { fields: [executorRoles.executorId], references: [users.id] }),
}));

export const approvalQuestsRelations = relations(approvalQuests, ({ one }) => ({
    wallet: one(multiSigWallets, { fields: [approvalQuests.walletId], references: [multiSigWallets.id] }),
    proposer: one(users, { fields: [approvalQuests.proposerId], references: [users.id] }),
}));

export const successionRulesRelations = relations(successionRules, ({ one }) => ({
    user: one(users, { fields: [successionRules.userId], references: [users.id] }),
}));

// ============================================================================
// AUTONOMOUS YIELD OPTIMIZER & LIQUIDITY REBALANCER (L3) (#370)
// ============================================================================

export const yieldStrategies = pgTable('yield_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    targetApy: numeric('target_apy', { precision: 5, scale: 2 }),
    minSafetyBuffer: numeric('min_safety_buffer', { precision: 18, scale: 2 }).default('1000'), // Minimum cash to keep liquid
    riskTolerance: text('risk_tolerance').default('moderate'), // 'conservative', 'moderate', 'aggressive'
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const liquidityBuffers = pgTable('liquidity_buffers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    requiredRunwayMonths: integer('required_runway_months').default(3),
    currentRunwayAmount: numeric('current_runway_amount', { precision: 18, scale: 2 }).default('0'),
    lastCheckedAt: timestamp('last_checked_at').defaultNow(),
});

export const rebalanceExecutionLogs = pgTable('rebalance_execution_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyId: uuid('strategy_id').references(() => yieldStrategies.id),
    fromSource: text('from_source').notNull(), // e.g., 'Vault: Primary'
    toDestination: text('to_destination').notNull(), // e.g., 'Investment: S&P 500'
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    yieldSpread: numeric('yield_spread', { precision: 5, scale: 2 }), // Improvement in APY
    taxImpactEstimated: numeric('tax_impact_estimated', { precision: 18, scale: 2 }).default('0'),
    status: text('status').default('completed'), // 'completed', 'failed', 'simulated'
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const yieldStrategiesRelations = relations(yieldStrategies, ({ one, many }) => ({
    user: one(users, { fields: [yieldStrategies.userId], references: [users.id] }),
    logs: many(rebalanceExecutionLogs),
}));

export const liquidityBuffersRelations = relations(liquidityBuffers, ({ one }) => ({
    user: one(users, { fields: [liquidityBuffers.userId], references: [users.id] }),
    vault: one(vaults, { fields: [liquidityBuffers.vaultId], references: [vaults.id] }),
}));

export const rebalanceExecutionLogsRelations = relations(rebalanceExecutionLogs, ({ one }) => ({
    user: one(users, { fields: [rebalanceExecutionLogs.userId], references: [users.id] }),
    strategy: one(yieldStrategies, { fields: [rebalanceExecutionLogs.strategyId], references: [yieldStrategies.id] }),
}));

// ============================================================================
// AI-DRIVEN MONTE CARLO RETIREMENT SIMULATOR (L3) (#378)
// ============================================================================

export const retirementParameters = pgTable('retirement_parameters', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    targetRetirementAge: integer('target_retirement_age').default(65),
    monthlyRetirementSpending: numeric('monthly_retirement_spending', { precision: 18, scale: 2 }).default('5000'),
    expectedInflationRate: numeric('expected_inflation_rate', { precision: 5, scale: 2 }).default('2.50'),
    expectedSocialSecurity: numeric('expected_social_security', { precision: 18, scale: 2 }).default('0'),
    dynamicWithdrawalEnabled: boolean('dynamic_withdrawal_enabled').default(true), // Guardrails
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const stochasticSimulations = pgTable('stochastic_simulations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    numPaths: integer('num_paths').default(10000),
    horizonYears: integer('horizon_years').default(50),
    successProbability: numeric('success_probability', { precision: 5, scale: 2 }), // 0-100%
    medianNetWorthAtHorizon: numeric('median_net_worth_at_horizon', { precision: 18, scale: 2 }),
    status: text('status').default('completed'), // 'pending', 'processing', 'completed', 'failed'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const probabilityOutcomes = pgTable('probability_outcomes', {
    id: uuid('id').defaultRandom().primaryKey(),
    simulationId: uuid('simulation_id').references(() => stochasticSimulations.id, { onDelete: 'cascade' }).notNull(),
    percentile: integer('percentile').notNull(), // 10, 25, 50, 75, 90
    year: integer('year').notNull(),
    projectedValue: numeric('projected_value', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const retirementParametersRelations = relations(retirementParameters, ({ one }) => ({
    user: one(users, { fields: [retirementParameters.userId], references: [users.id] }),
}));

export const stochasticSimulationsRelations = relations(stochasticSimulations, ({ one, many }) => ({
    user: one(users, { fields: [stochasticSimulations.userId], references: [users.id] }),
    outcomes: many(probabilityOutcomes),
}));

export const probabilityOutcomesRelations = relations(probabilityOutcomes, ({ one }) => ({
    simulation: one(stochasticSimulations, { fields: [probabilityOutcomes.simulationId], references: [stochasticSimulations.id] }),
}));

// ============================================================================
// AUTONOMOUS CROSS-BORDER FX ARBITRAGE & SMART SETTLEMENT (L3) (#379)
// ============================================================================

export const fxHedgingRules = pgTable('fx_hedging_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    hedgeRatio: numeric('hedge_ratio', { precision: 5, scale: 2 }).default('0.50'), // 0.0 to 1.0
    thresholdVolatility: numeric('threshold_volatility', { precision: 5, scale: 2 }).default('0.02'), // 2% 
    status: text('status').default('active'), // 'active', 'paused'
    createdAt: timestamp('created_at').defaultNow(),
});

export const currencySwapLogs = pgTable('currency_swap_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull(),
    arbitrageAlpha: numeric('arbitrage_alpha', { precision: 18, scale: 2 }).default('0'), // Estimated savings vs market
    swapType: text('swap_type').notNull(), // 'triangular', 'direct', 'rebalancing'
    status: text('status').default('completed'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const conversionCorridors = pgTable('conversion_corridors', {
    id: uuid('id').defaultRandom().primaryKey(),
    fromEntityId: uuid('from_entity_id').references(() => entities.id, { onDelete: 'cascade' }).notNull(),
    toEntityId: uuid('to_entity_id').references(() => entities.id, { onDelete: 'cascade' }).notNull(),
    optimalCurrency: text('optimal_currency').notNull(),
    lastSpreadObserved: numeric('last_spread_observed', { precision: 18, scale: 4 }),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const fxHedgingRulesRelations = relations(fxHedgingRules, ({ one }) => ({
    user: one(users, { fields: [fxHedgingRules.userId], references: [users.id] }),
}));

export const currencySwapLogsRelations = relations(currencySwapLogs, ({ one }) => ({
    user: one(users, { fields: [currencySwapLogs.userId], references: [users.id] }),
}));

export const conversionCorridorsRelations = relations(conversionCorridors, ({ one }) => ({
    fromEntity: one(entities, { fields: [conversionCorridors.fromEntityId], references: [entities.id] }),
    toEntity: one(entities, { fields: [conversionCorridors.toEntityId], references: [entities.id] }),
}));

// ============================================================================
// INTELLIGENT DEBT-TO-EQUITY ARBITRAGE & REFINANCE OPTIMIZATION (L3) (#380)
// ============================================================================

export const debtArbitrageRules = pgTable('debt_arbitrage_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    maxLtvRatio: numeric('max_ltv_ratio', { precision: 5, scale: 2 }).default('0.75'), // 75% max LTV for safety
    minInterestSpread: numeric('min_interest_spread', { precision: 5, scale: 2 }).default('0.01'), // 1% minimum spread to trigger
    autoExecute: boolean('auto_execute').default(false),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const refinanceProposals = pgTable('refinance_proposals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    currentRate: numeric('current_rate', { precision: 8, scale: 4 }).notNull(),
    proposedRate: numeric('proposed_rate', { precision: 8, scale: 4 }).notNull(),
    estimatedSavings: numeric('estimated_savings', { precision: 18, scale: 2 }).notNull(),
    monthlySavings: numeric('monthly_savings', { precision: 18, scale: 2 }).notNull(),
    roiMonths: integer('roi_months').notNull(), // Break-even point
    status: text('status').default('pending'), // 'pending', 'accepted', 'ignored', 'expired'
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const equityCollateralMaps = pgTable('equity_collateral_maps', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    assetId: uuid('asset_id').notNull(), // TODO: Add reference when assets table is created
    collateralAmount: numeric('collateral_amount', { precision: 18, scale: 2 }).notNull(),
    ltvAtLock: numeric('ltv_at_lock', { precision: 5, scale: 2 }),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const debtArbitrageRulesRelations = relations(debtArbitrageRules, ({ one }) => ({
    user: one(users, { fields: [debtArbitrageRules.userId], references: [users.id] }),
}));

export const refinanceProposalsRelations = relations(refinanceProposals, ({ one }) => ({
    user: one(users, { fields: [refinanceProposals.userId], references: [users.id] }),
    debt: one(debts, { fields: [refinanceProposals.debtId], references: [debts.id] }),
}));

export const equityCollateralMapsRelations = relations(equityCollateralMaps, ({ one }) => ({
    debt: one(debts, { fields: [equityCollateralMaps.debtId], references: [debts.id] }),
    // TODO: Add asset relation when assets table is created
}));

// ============================================================================
// INTELLIGENT DIVIDEND-GROWTH REBALANCING & CASH-DRAG ELIMINATION (L3) (#387)
// ============================================================================

export const dividendSchedules = pgTable('dividend_schedules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    symbol: text('symbol'),
    exDividendDate: timestamp('ex_dividend_date'),
    paymentDate: timestamp('payment_date'),
    dividendPerShare: numeric('dividend_per_share', { precision: 18, scale: 6 }),
    expectedAmount: numeric('expected_amount', { precision: 18, scale: 2 }),
    actualAmount: numeric('actual_amount', { precision: 18, scale: 2 }),
    status: text('status').default('scheduled'), // 'scheduled', 'received', 'reinvested'
    reinvestedAt: timestamp('reinvested_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const cashDragMetrics = pgTable('cash_drag_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    calculationDate: timestamp('calculation_date').defaultNow(),
    idleCashBalance: numeric('idle_cash_balance', { precision: 18, scale: 2 }).notNull(),
    targetCashReserve: numeric('target_cash_reserve', { precision: 18, scale: 2 }),
    excessCash: numeric('excess_cash', { precision: 18, scale: 2 }),
    opportunityCostDaily: numeric('opportunity_cost_daily', { precision: 18, scale: 4 }), // Lost yield per day
    daysIdle: integer('days_idle').default(0),
    totalDragCost: numeric('total_drag_cost', { precision: 18, scale: 2 }),
    metadata: jsonb('metadata'),
});

export const autoReinvestConfigs = pgTable('auto_reinvest_configs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    isEnabled: boolean('is_enabled').default(true),
    reinvestmentStrategy: text('reinvestment_strategy').default('drift_correction'), // 'drift_correction', 'high_yield_parking', 'sector_rotation'
    minimumCashThreshold: numeric('minimum_cash_threshold', { precision: 18, scale: 2 }).default('1000'),
    rebalanceThreshold: numeric('rebalance_threshold', { precision: 5, scale: 2 }).default('0.05'), // 5% drift triggers rebalance
    targetAllocation: jsonb('target_allocation'), // { 'equity': 0.6, 'bonds': 0.3, 'cash': 0.1 }
    parkingVaultId: uuid('parking_vault_id').references(() => vaults.id),
    lastRebalanceAt: timestamp('last_rebalance_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const dividendSchedulesRelations = relations(dividendSchedules, ({ one }) => ({
    user: one(users, { fields: [dividendSchedules.userId], references: [users.id] }),
    investment: one(investments, { fields: [dividendSchedules.investmentId], references: [investments.id] }),
    vault: one(vaults, { fields: [dividendSchedules.vaultId], references: [vaults.id] }),
}));

export const cashDragMetricsRelations = relations(cashDragMetrics, ({ one }) => ({
    user: one(users, { fields: [cashDragMetrics.userId], references: [users.id] }),
    vault: one(vaults, { fields: [cashDragMetrics.vaultId], references: [vaults.id] }),
}));

export const autoReinvestConfigsRelations = relations(autoReinvestConfigs, ({ one }) => ({
    user: one(users, { fields: [autoReinvestConfigs.userId], references: [users.id] }),
    vault: one(vaults, { fields: [autoReinvestConfigs.vaultId], references: [vaults.id] }),
    parkingVault: one(vaults, { fields: [autoReinvestConfigs.parkingVaultId], references: [vaults.id] }),
}));

// ============================================================================
// GLOBAL TAX-OPTIMIZED ASSET LIQUIDATION & REINVESTMENT ENGINE (L3) (#386)
// ============================================================================

export const taxLotHistory = pgTable('tax_lot_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    acquisitionDate: timestamp('acquisition_date').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
    costBasis: numeric('cost_basis', { precision: 18, scale: 2 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 8 }).notNull(),
    isSold: boolean('is_sold').default(false),
    soldDate: timestamp('sold_date'),
    salePrice: numeric('sale_price', { precision: 18, scale: 8 }),
    realizedGainLoss: numeric('realized_gain_loss', { precision: 18, scale: 2 }),
    holdingPeriodDays: integer('holding_period_days'),
    isLongTerm: boolean('is_long_term').default(false),
    status: text('status').default('open'), // 'open', 'closed', 'harvested'
    createdAt: timestamp('created_at').defaultNow(),
});

export const harvestExecutionLogs = pgTable('harvest_execution_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    batchId: uuid('batch_id').notNull(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }),
    lotsHarvested: jsonb('lots_harvested').notNull(), // Array of tax lot IDs
    totalLossRealized: numeric('total_loss_realized', { precision: 18, scale: 2 }).notNull(),
    taxSavingsEstimated: numeric('tax_savings_estimated', { precision: 18, scale: 2 }).notNull(),
    transactionCosts: numeric('transaction_costs', { precision: 18, scale: 2 }),
    reinvestedIntoId: uuid('reinvested_into_id').references(() => investments.id),
    status: text('status').default('executed'), // 'executed', 'failed', 'pending_reinvestment'
    executionDate: timestamp('execution_date').defaultNow(),
    metadata: jsonb('metadata'),
});

export const assetProxyMappings = pgTable('asset_proxy_mappings', {
    id: uuid('id').defaultRandom().primaryKey(),
    originalSymbol: text('original_symbol').notNull(),
    proxySymbol: text('proxy_symbol').notNull(),
    proxyType: text('proxy_type').notNull(), // 'ETF', 'DirectIndex', 'Stablecoin'
    correlationCoefficient: numeric('correlation_coefficient', { precision: 5, scale: 4 }),
    isActive: boolean('is_active').default(true),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

// Relations
export const taxLotHistoryRelations = relations(taxLotHistory, ({ one }) => ({
    user: one(users, { fields: [taxLotHistory.userId], references: [users.id] }),
    investment: one(investments, { fields: [taxLotHistory.investmentId], references: [investments.id] }),
}));

export const harvestExecutionLogsRelations = relations(harvestExecutionLogs, ({ one }) => ({
    user: one(users, { fields: [harvestExecutionLogs.userId], references: [users.id] }),
    investment: one(investments, { fields: [harvestExecutionLogs.investmentId], references: [investments.id] }),
    reinvestedInto: one(investments, { fields: [harvestExecutionLogs.reinvestedIntoId], references: [investments.id] }),
}));

// ============================================================================
// PROACTIVE MULTI-ENTITY BANKRUPTCY SHIELDING & LIQUIDITY LOCK (L3) (#385)
// ============================================================================

export const shieldTriggers = pgTable('shield_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }),
    triggerType: text('trigger_type').notNull(), // 'credit_drop', 'legal_action', 'liquidity_crunch'
    thresholdValue: numeric('threshold_value', { precision: 18, scale: 2 }),
    currentValue: numeric('current_value', { precision: 18, scale: 2 }),
    isActive: boolean('is_active').default(true),
    sensitivityLevel: text('sensitivity_level').default('medium'), // low, medium, high, emergency
    lastChecked: timestamp('last_checked').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const liquidityLocks = pgTable('liquidity_locks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    lockType: text('lock_type').default('full_freeze'), // partial_withdraw_only, interest_only, full_freeze
    reason: text('reason'),
    triggerId: uuid('trigger_id').references(() => shieldTriggers.id),
    expiresAt: timestamp('expires_at'),
    isUnlocked: boolean('is_unlocked').default(false),
    unlockedBy: uuid('unlocked_by').references(() => users.id),
    multiSigRequired: boolean('multi_sig_required').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const entityTrustMaps = pgTable('entity_trust_maps', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceEntityId: uuid('source_entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    targetTrustId: uuid('target_trust_id').references(() => corporateEntities.id).notNull(), // Treated as trust entity
    transferRatio: numeric('transfer_ratio', { precision: 5, scale: 4 }).default('1.0000'),
    legalBasis: text('legal_basis'),
    isAutoTriggered: boolean('is_auto_triggered').default(true),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const shieldTriggersRelations = relations(shieldTriggers, ({ one, many }) => ({
    user: one(users, { fields: [shieldTriggers.userId], references: [users.id] }),
    entity: one(corporateEntities, { fields: [shieldTriggers.entityId], references: [corporateEntities.id] }),
    locks: many(liquidityLocks),
}));

export const liquidityLocksRelations = relations(liquidityLocks, ({ one }) => ({
    user: one(users, { fields: [liquidityLocks.userId], references: [users.id] }),
    vault: one(vaults, { fields: [liquidityLocks.vaultId], references: [vaults.id] }),
    trigger: one(shieldTriggers, { fields: [liquidityLocks.triggerId], references: [shieldTriggers.id] }),
    unlocker: one(users, { fields: [liquidityLocks.unlockedBy], references: [users.id] }),
}));

export const entityTrustMapsRelations = relations(entityTrustMaps, ({ one }) => ({
    user: one(users, { fields: [entityTrustMaps.userId], references: [users.id] }),
    sourceEntity: one(corporateEntities, { fields: [entityTrustMaps.sourceEntityId], references: [corporateEntities.id] }),
    targetTrust: one(corporateEntities, { fields: [entityTrustMaps.targetTrustId], references: [corporateEntities.id] }),
}));

// ============================================================================
// AI-DRIVEN FINANCIAL ENGINEERING (L3)
// ============================================================================

// DEBT-ARBITRAGE & WACC-OPTIMIZED CAPITAL REALLOCATION ENGINE (#392)
export const debtArbitrageLogs = pgTable('debt_arbitrage_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }),
    investmentId: uuid('investment_id').references(() => investments.id),
    actionType: text('action_type').notNull(), // 'LOAN_TO_INVEST', 'LIQUIDATE_TO_PAYOFF', 'REFINANCE_SWAP'
    arbitrageAlpha: numeric('arbitrage_alpha', { precision: 10, scale: 4 }).notNull(), // Spread %
    amountInvolved: numeric('amount_involved', { precision: 18, scale: 2 }).notNull(),
    estimatedAnnualSavings: numeric('estimated_annual_savings', { precision: 18, scale: 2 }),
    status: text('status').default('proposed'), // 'proposed', 'executed', 'ignored', 'failed'
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const capitalCostSnapshots = pgTable('capital_cost_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    wacc: numeric('wacc', { precision: 10, scale: 4 }).notNull(),
    costOfDebt: numeric('cost_of_debt', { precision: 10, scale: 4 }).notNull(),
    costOfEquity: numeric('cost_of_equity', { precision: 10, scale: 4 }).notNull(),
    totalDebt: numeric('total_debt', { precision: 18, scale: 2 }).notNull(),
    totalEquity: numeric('total_equity', { precision: 18, scale: 2 }).notNull(),
    snapshotDate: timestamp('snapshot_date').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const refinanceRoiMetrics = pgTable('refinance_roi_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currentDebtId: uuid('current_debt_id').references(() => debts.id, { onDelete: 'cascade' }),
    proposedRate: numeric('proposed_rate', { precision: 10, scale: 4 }).notNull(),
    closingCosts: numeric('closing_costs', { precision: 18, scale: 2 }).notNull(),
    breakEvenMonths: integer('break_even_months').notNull(),
    netPresentValue: numeric('net_present_value', { precision: 18, scale: 2 }).notNull(),
    roiPercent: numeric('roi_percent', { precision: 10, scale: 2 }),
    isAutoRecommended: boolean('is_auto_recommended').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

// BLACK-SWAN ADAPTIVE HEDGING & SYNTHETIC ASSET PROTECTION (#408)
export const marketAnomalyDefinitions = pgTable('market_anomaly_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    anomalyType: text('anomaly_type').notNull(), // 'Flash-Crash', 'Hyper-Volatility', 'De-Pegging', 'Bank-Run'
    detectionThreshold: numeric('detection_threshold', { precision: 10, scale: 4 }).notNull(), // e.g. 10% drop in < 1hr
    cooldownPeriodMinutes: integer('cooldown_period_minutes').default(1440), // 24 hours
    autoPivotEnabled: boolean('auto_pivot_enabled').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const hedgeExecutionHistory = pgTable('hedge_execution_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    anomalyId: uuid('anomaly_id').references(() => marketAnomalyDefinitions.id),
    vaultId: uuid('vault_id').references(() => vaults.id),
    actionTaken: text('action_taken').notNull(), // 'SAFE_HAVEN_PIVOT', 'LIQUIDITY_FREEZE', 'SYNTHETIC_HEDGE'
    amountShielded: numeric('amount_shielded', { precision: 18, scale: 2 }).notNull(),
    pnlImpactEstimated: numeric('pnl_impact_estimated', { precision: 18, scale: 2 }),
    status: text('status').default('completed'),
    executionDate: timestamp('execution_date').defaultNow(),
    restoredDate: timestamp('restored_date'),
    metadata: jsonb('metadata'),
});

export const syntheticVaultMappings = pgTable('synthetic_vault_mappings', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceVaultId: uuid('source_vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    safeHavenVaultId: uuid('safe_haven_vault_id').references(() => vaults.id).notNull(), // Usually Stablecoin or Gold-linked
    pivotTriggerRatio: numeric('pivot_trigger_ratio', { precision: 5, scale: 2 }).default('0.50'), // Move 50% on trigger
    priority: integer('priority').default(1),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// MULTI-ENTITY INTER-COMPANY LEDGER & GLOBAL PAYROLL SWEEP (#390)
export const interCompanyTransfers = pgTable('inter_company_transfers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceEntityId: uuid('source_entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    targetEntityId: uuid('target_entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    transferType: text('transfer_type').notNull(), // 'loan', 'revenue_distribution', 'expense_reimbursement'
    loanInterestRate: numeric('loan_interest_rate', { precision: 10, scale: 4 }),
    status: text('status').default('pending'),
    referenceNumber: text('reference_number').unique(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const payrollBuckets = pgTable('payroll_buckets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    bucketName: text('bucket_name').notNull(),
    totalAllocated: numeric('total_allocated', { precision: 18, scale: 2 }).default('0.00'),
    frequency: text('frequency').default('monthly'), // 'weekly', 'bi-weekly', 'monthly'
    nextPayrollDate: timestamp('next_payroll_date'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const taxDeductionLedger = pgTable('tax_deduction_ledger', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    payrollId: uuid('payroll_id'), // Reference to a payout record (dividend payout or future payroll execution)
    taxType: text('tax_type').notNull(), // 'federal_income_tax', 'social_security', 'medicare', 'state_tax'
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    status: text('status').default('pending_filing'), // 'pending_filing', 'filed', 'paid'
    filingDeadline: timestamp('filing_deadline'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const entityConsolidationRules = pgTable('entity_consolidation_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    parentEntityId: uuid('parent_entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    childEntityId: uuid('child_entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    consolidationMethod: text('consolidation_method').default('full'), // 'full', 'equity_method', 'proportionate'
    ownershipStake: numeric('ownership_stake', { precision: 5, scale: 2 }).default('100.00'),
    eliminationEntriesRequired: boolean('elimination_entries_required').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// GLOBAL TAX RESIDENCY & CROSS-BORDER NEXUS RECONCILIATION (#434)
export const taxNexusMappings = pgTable('tax_nexus_mappings', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    nexusType: text('nexus_type').notNull(), // 'physical', 'economic', 'residency'
    thresholdValue: numeric('threshold_value', { precision: 18, scale: 2 }).default('0.00'),
    currentExposure: numeric('current_exposure', { precision: 18, scale: 2 }).default('0.00'),
    isTriggered: boolean('is_triggered').default(false),
    taxRateOverride: numeric('tax_rate_override', { precision: 5, scale: 2 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const entityTaxBrackets = pgTable('entity_tax_brackets', {
    id: uuid('id').defaultRandom().primaryKey(),
    jurisdiction: text('jurisdiction').notNull(),
    entityType: text('entity_type').notNull(), // 'LLC', 'C-Corp', 'S-Corp'
    minIncome: numeric('min_income', { precision: 18, scale: 2 }).notNull(),
    maxIncome: numeric('max_income', { precision: 18, scale: 2 }),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull(),
    effectiveYear: integer('effective_year').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

// AI-DRIVEN MULTI-TIER SUCCESSION EXECUTION & DIGITAL WILL (#406)
export const digitalWillDefinitions = pgTable('digital_will_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    willName: text('will_name').notNull(),
    legalJurisdiction: text('legal_jurisdiction').notNull(),
    executorId: uuid('executor_id').references(() => users.id), // Lead executor
    revocationKeyHash: text('revocation_key_hash'), // For "Living Will" updates
    status: text('status').default('draft'), // 'draft', 'active', 'triggered', 'settled'
    isPublicNotarized: boolean('is_public_notarized').default(false),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const heirIdentityVerifications = pgTable('heir_identity_verifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id).notNull(), // Heir's user account
    willId: uuid('will_id').references(() => digitalWillDefinitions.id, { onDelete: 'cascade' }).notNull(),
    verificationMethod: text('verification_method').notNull(), // 'biometric', 'legal_doc', 'social_vouch'
    verificationStatus: text('verification_status').default('pending'), // 'pending', 'verified', 'rejected'
    verifiedAt: timestamp('verified_at'),
    metadata: jsonb('metadata'),
});

export const trusteeVoteLedger = pgTable('trustee_vote_ledger', {
    id: uuid('id').defaultRandom().primaryKey(),
    willId: uuid('will_id').references(() => digitalWillDefinitions.id, { onDelete: 'cascade' }).notNull(),
    trusteeId: uuid('trustee_id').references(() => users.id).notNull(),
    voteResult: text('vote_result').notNull(), // 'approve_trigger', 'deny_trigger'
    reason: text('reason'),
    votedAt: timestamp('voted_at').defaultNow(),
});

// AUTONOMOUS FINANCIAL EVENT-BUS & WORKFLOW ORCHESTRATION (#433)
export const executionWorkflows = pgTable('execution_workflows', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    entityType: text('entity_type').notNull(), // 'DEBT', 'TAX', 'INVEST', 'LIQUIDITY'
    status: text('status').default('active'), // 'active', 'paused', 'completed'
    triggerLogic: text('trigger_logic').default('AND'), // 'AND', 'OR'
    priority: integer('priority').default(1),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const workflowTriggers = pgTable('workflow_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id').references(() => executionWorkflows.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    variable: text('variable').notNull(), // e.g., 'debt_apr', 'cash_reserve', 'market_volatility'
    operator: text('operator').notNull(), // '>', '<', '==', '>=', '<='
    thresholdValue: numeric('threshold_value', { precision: 18, scale: 4 }).notNull(),
    currentStatus: boolean('current_status').default(false),
    lastCheckedAt: timestamp('last_checked_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const workflowExecutionLogs = pgTable('workflow_execution_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id').references(() => executionWorkflows.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    actionTaken: text('action_taken').notNull(),
    resultStatus: text('result_status').notNull(), // 'success', 'failed', 'pending_approval'
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// CREDIT SCORING & RETIREMENT PLANNING
// ============================================================================

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

// ============================================================================
// RELATIONS
// ============================================================================

export const debtArbitrageLogsRelations = relations(debtArbitrageLogs, ({ one }) => ({
    user: one(users, { fields: [debtArbitrageLogs.userId], references: [users.id] }),
    debt: one(debts, { fields: [debtArbitrageLogs.debtId], references: [debts.id] }),
    investment: one(investments, { fields: [debtArbitrageLogs.investmentId], references: [investments.id] }),
}));

export const capitalCostSnapshotsRelations = relations(capitalCostSnapshots, ({ one }) => ({
    user: one(users, { fields: [capitalCostSnapshots.userId], references: [users.id] }),
}));

export const refinanceRoiMetricsRelations = relations(refinanceRoiMetrics, ({ one }) => ({
    user: one(users, { fields: [refinanceRoiMetrics.userId], references: [users.id] }),
    currentDebt: one(debts, { fields: [refinanceRoiMetrics.currentDebtId], references: [debts.id] }),
}));

export const marketAnomalyDefinitionsRelations = relations(marketAnomalyDefinitions, ({ many, one }) => ({
    user: one(users, { fields: [marketAnomalyDefinitions.userId], references: [users.id] }),
    executions: many(hedgeExecutionHistory),
}));

export const hedgeExecutionHistoryRelations = relations(hedgeExecutionHistory, ({ one }) => ({
    user: one(users, { fields: [hedgeExecutionHistory.userId], references: [users.id] }),
    anomaly: one(marketAnomalyDefinitions, { fields: [hedgeExecutionHistory.anomalyId], references: [marketAnomalyDefinitions.id] }),
    vault: one(vaults, { fields: [hedgeExecutionHistory.vaultId], references: [vaults.id] }),
}));

export const syntheticVaultMappingsRelations = relations(syntheticVaultMappings, ({ one }) => ({
    user: one(users, { fields: [syntheticVaultMappings.userId], references: [users.id] }),
    sourceVault: one(vaults, { fields: [syntheticVaultMappings.sourceVaultId], references: [vaults.id] }),
    safeHavenVault: one(vaults, { fields: [syntheticVaultMappings.safeHavenVaultId], references: [vaults.id] }),
}));
// ============================================================================
// PREDICTIVE LIQUIDITY STRESS-TESTING & AUTONOMOUS INSOLVENCY PREVENTION (#428)

export const userStressTestScenarios = pgTable('user_stress_test_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioName: text('scenario_name').notNull(), // '50% Income Drop', 'Flash-Crash', 'Medical Emergency'
    impactMagnitude: numeric('impact_magnitude', { precision: 5, scale: 2 }).notNull(), // e.g. 0.50 for 50% drop
    variableAffected: text('variable_affected').notNull(), // 'income', 'expense', 'asset_value'
    probabilityWeight: numeric('probability_weight', { precision: 5, scale: 2 }).default('1.00'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const liquidityVelocityLogs = pgTable('liquidity_velocity_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    dailyBurnRate: numeric('daily_burn_rate', { precision: 18, scale: 2 }).notNull(),
    weeklyVelocity: numeric('weekly_velocity', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    measuredAt: timestamp('measured_at').defaultNow(),
});

// DOUBLE-ENTRY LEDGER SYSTEM & REAL-TIME FX REVALUATION (#432)
// Removed duplicate definitions - using versions defined earlier in schema.js


// ============================================================================
// RELATIONS
// ============================================================================

export const interCompanyTransfersRelations = relations(interCompanyTransfers, ({ one }) => ({
    user: one(users, { fields: [interCompanyTransfers.userId], references: [users.id] }),
    sourceEntity: one(corporateEntities, { fields: [interCompanyTransfers.sourceEntityId], references: [corporateEntities.id] }),
    targetEntity: one(corporateEntities, { fields: [interCompanyTransfers.targetEntityId], references: [corporateEntities.id] }),
}));

export const payrollBucketsRelations = relations(payrollBuckets, ({ one }) => ({
    user: one(users, { fields: [payrollBuckets.userId], references: [users.id] }),
    entity: one(corporateEntities, { fields: [payrollBuckets.entityId], references: [corporateEntities.id] }),
    vault: one(vaults, { fields: [payrollBuckets.vaultId], references: [vaults.id] }),
}));

export const taxDeductionLedgerRelations = relations(taxDeductionLedger, ({ one }) => ({
    user: one(users, { fields: [taxDeductionLedger.userId], references: [users.id] }),
    entity: one(corporateEntities, { fields: [taxDeductionLedger.entityId], references: [corporateEntities.id] }),
}));

export const entityConsolidationRulesRelations = relations(entityConsolidationRules, ({ one }) => ({
    user: one(users, { fields: [entityConsolidationRules.userId], references: [users.id] }),
    parentEntity: one(corporateEntities, { fields: [entityConsolidationRules.parentEntityId], references: [corporateEntities.id] }),
    childEntity: one(corporateEntities, { fields: [entityConsolidationRules.childEntityId], references: [corporateEntities.id] }),
}));

export const digitalWillDefinitionsRelations = relations(digitalWillDefinitions, ({ one, many }) => ({
    user: one(users, { fields: [digitalWillDefinitions.userId], references: [users.id] }),
    executor: one(users, { fields: [digitalWillDefinitions.executorId], references: [users.id] }),
    heirs: many(heirIdentityVerifications),
    votes: many(trusteeVoteLedger),
}));

export const heirIdentityVerificationsRelations = relations(heirIdentityVerifications, ({ one }) => ({
    user: one(users, { fields: [heirIdentityVerifications.userId], references: [users.id] }),
    will: one(digitalWillDefinitions, { fields: [heirIdentityVerifications.willId], references: [digitalWillDefinitions.id] }),
}));

export const trusteeVoteLedgerRelations = relations(trusteeVoteLedger, ({ one }) => ({
    will: one(digitalWillDefinitions, { fields: [trusteeVoteLedger.willId], references: [digitalWillDefinitions.id] }),
    trustee: one(users, { fields: [trusteeVoteLedger.trusteeId], references: [users.id] }),
}));

export const creditScoresRelations = relations(creditScores, ({ one }) => ({
    user: one(users, { fields: [creditScores.userId], references: [users.id] }),
}));

export const creditScoreAlertsRelations = relations(creditScoreAlerts, ({ one }) => ({
    user: one(users, { fields: [creditScoreAlerts.userId], references: [users.id] }),
    creditScore: one(creditScores, { fields: [creditScoreAlerts.creditScoreId], references: [creditScores.id] }),
}));
export const retirementPlanningRelations = relations(retirementPlanning, ({ one }) => ({
    user: one(users, { fields: [retirementPlanning.userId], references: [users.id] }),
}));
export const cashFlowProjectionsRelations = relations(cashFlowProjections, ({ one }) => ({
    user: one(users, { fields: [cashFlowProjections.userId], references: [users.id] }),
}));

export const stressTestScenariosRelations = relations(stressTestScenarios, ({ one }) => ({
    user: one(users, { fields: [stressTestScenarios.userId], references: [users.id] }),
}));

export const liquidityVelocityLogsRelations = relations(liquidityVelocityLogs, ({ one }) => ({
    user: one(users, { fields: [liquidityVelocityLogs.userId], references: [users.id] }),
    vault: one(vaults, { fields: [liquidityVelocityLogs.vaultId], references: [vaults.id] }),
}));

export const executionWorkflowsRelations = relations(executionWorkflows, ({ one, many }) => ({
    user: one(users, { fields: [executionWorkflows.userId], references: [users.id] }),
    triggers: many(workflowTriggers),
    logs: many(workflowExecutionLogs),
}));

export const workflowTriggersRelations = relations(workflowTriggers, ({ one }) => ({
    user: one(users, { fields: [workflowTriggers.userId], references: [users.id] }),
    workflow: one(executionWorkflows, { fields: [workflowTriggers.workflowId], references: [executionWorkflows.id] }),
}));

export const workflowExecutionLogsRelations = relations(workflowExecutionLogs, ({ one }) => ({
    user: one(users, { fields: [workflowExecutionLogs.userId], references: [users.id] }),
    workflow: one(executionWorkflows, { fields: [workflowExecutionLogs.workflowId], references: [executionWorkflows.id] }),
}));

export const taxNexusMappingsRelations = relations(taxNexusMappings, ({ one }) => ({
    user: one(users, { fields: [taxNexusMappings.userId], references: [users.id] }),
    entity: one(corporateEntities, { fields: [taxNexusMappings.entityId], references: [corporateEntities.id] }),
}));
// GAMIFICATION TABLES
// ============================================

// Achievement Definitions Table (predefined achievements)
export const achievementDefinitions = pgTable('achievement_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'savings', 'budgeting', 'goals', 'streaks', 'challenges', 'education'
    icon: text('icon'),
    tier: text('tier').notNull().default('bronze'), // 'bronze', 'silver', 'gold', 'platinum', 'diamond'
    pointsRequired: integer('points_required').default(0),
    criteria: jsonb('criteria').notNull(), // { type: 'action_count'|'milestone'|'streak'|'score', value: number, metric: string }
    rewardPoints: integer('reward_points').notNull().default(0),
    rewardBadge: boolean('reward_badge').default(true),
    isActive: boolean('is_active').default(true),
    displayOrder: integer('display_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User Achievements Table (tracks earned achievements)
export const userAchievements = pgTable('user_achievements', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    achievementId: uuid('achievement_id').references(() => achievementDefinitions.id, { onDelete: 'cascade' }).notNull(),
    earnedAt: timestamp('earned_at').defaultNow(),
    progress: integer('progress').default(0),
    isCompleted: boolean('is_completed').default(false),
    completedAt: timestamp('completed_at'),
    metadata: jsonb('metadata').default({}),
});

// User Points System Table
export const userPoints = pgTable('user_points', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    totalPoints: integer('total_points').notNull().default(0),
    lifetimePoints: integer('lifetime_points').notNull().default(0),
    currentLevel: integer('current_level').notNull().default(1),
    totalBadges: integer('total_badges').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    lastActivityDate: timestamp('last_activity_date'),
    weeklyPoints: integer('weekly_points').notNull().default(0),
    monthlyPoints: integer('monthly_points').notNull().default(0),
    pointsToNextLevel: integer('points_to_next_level').notNull().default(100),
    levelProgress: integer('level_progress').notNull().default(0),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Points History Table (transaction log)
export const pointsHistory = pgTable('points_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    points: integer('points').notNull(),
    actionType: text('action_type').notNull(), // 'achievement_earned', 'challenge_completed', 'goal_reached', 'daily_login', etc.
    description: text('description'),
    referenceId: uuid('reference_id'), // Optional reference to related entity
    createdAt: timestamp('created_at').defaultNow(),
});

// User Streaks Table
export const userStreaks = pgTable('user_streaks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    streakType: text('streak_type').notNull(), // 'daily_login', 'budget_adherence', 'savings_contribution', 'expense_log'
    currentCount: integer('current_count').notNull().default(0),
    longestCount: integer('longest_count').notNull().default(0),
    startDate: timestamp('start_date'),
    lastActivityDate: timestamp('last_activity_date'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations for Gamification Tables
export const achievementDefinitionsRelations = relations(achievementDefinitions, ({ many }) => ({
    userAchievements: many(userAchievements),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
    user: one(users, {
        fields: [userAchievements.userId],
        references: [users.id],
    }),
    achievement: one(achievementDefinitions, {
        fields: [userAchievements.achievementId],
        references: [achievementDefinitions.id],
    }),
}));

export const userPointsRelations = relations(userPoints, ({ one }) => ({
    user: one(users, {
        fields: [userPoints.userId],
        references: [users.id],
    }),
}));

export const pointsHistoryRelations = relations(pointsHistory, ({ one }) => ({
    user: one(users, {
        fields: [pointsHistory.userId],
        references: [users.id],
    }),
}));

export const userStreaksRelations = relations(userStreaks, ({ one }) => ({
    user: one(users, {
        fields: [userStreaks.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// REAL-TIME MULTI-PARTY TRUST & ESCROW SETTLEMENT PROTOCOL (#443)
// ============================================================================

export const escrowContracts = pgTable('escrow_contracts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    creatorId: uuid('creator_id').references(() => users.id).notNull(),
    payerId: uuid('payer_id').references(() => users.id).notNull(),
    payeeId: uuid('payee_id').references(() => users.id).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    status: text('status').default('draft'), // 'draft', 'active', 'locked', 'released', 'refunded', 'disputed'
    escrowType: text('escrow_type').notNull(), // 'p2p_lending', 'real_estate', 'succession', 'service_delivery'
    releaseConditions: jsonb('release_conditions').notNull(), // e.g., { type: 'oracle_event', eventId: '...', requiredSignatures: 2 }
    disputeResolution: text('dispute_resolution').default('arbitration'),
    expiresAt: timestamp('expires_at'),
// ============================================
// INVESTMENT PORTFOLIO ANALYZER TABLES
// ============================================

// Investment Risk Profiles Table
export const investmentRiskProfiles = pgTable('investment_risk_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

    // Risk Assessment Answers
    riskScore: integer('risk_score').notNull().default(50),
    riskTolerance: text('risk_tolerance').notNull().default('moderate'), // conservative, moderate, aggressive
    investmentHorizon: text('investment_horizon').notNull().default('medium'), // short, medium, long
    investmentExperience: text('investment_experience').notNull().default('intermediate'), // beginner, intermediate, advanced

    // Financial Profile
    annualIncome: numeric('annual_income', { precision: 15, scale: 2 }).default('0'),
    netWorth: numeric('net_worth', { precision: 15, scale: 2 }).default('0'),
    liquidAssets: numeric('liquid_assets', { precision: 15, scale: 2 }).default('0'),
    emergencyFundMonths: integer('emergency_fund_months').default(3),

    // Investment Goals
    primaryGoal: text('primary_goal').notNull().default('growth'), // growth, income, preservation, balanced
    retirementAge: integer('retirement_age'),
    targetRetirementAmount: numeric('target_retirement_amount', { precision: 15, scale: 2 }),
    monthlyInvestmentCapacity: numeric('monthly_investment_capacity', { precision: 12, scale: 2 }).default('0'),

    // Risk Factors
    hasDebt: boolean('has_debt').default(false),
    debtAmount: numeric('debt_amount', { precision: 15, scale: 2 }).default('0'),
    hasDependents: boolean('has_dependents').default(false),
    dependentCount: integer('dependent_count').default(0),
    hasOtherIncome: boolean('has_other_income').default(false),
    otherIncomeMonthly: numeric('other_income_monthly', { precision: 12, scale: 2 }).default('0'),

    // Market Understanding
    understandsMarketVolatility: boolean('understands_market_volatility').default(false),
    canAffordLosses: boolean('can_afford_losses').default(false),
    maxLossTolerance: numeric('max_loss_tolerance', { precision: 12, scale: 2 }).default('0'),

    // Assessment Details
    assessmentDate: timestamp('assessment_date').defaultNow(),
    lastUpdated: timestamp('last_updated').defaultNow(),
    isActive: boolean('is_active').default(true),

    // Metadata
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const oracleEvents = pgTable('oracle_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: text('event_type').notNull(), // 'property_registration', 'death_certificate', 'loan_repayment_external'
    eventSource: text('event_source').notNull(), // 'county_clerk', 'vital_statistics', 'plaid_webhook'
    externalId: text('external_id').notNull(), // Reference ID from source
    eventData: jsonb('event_data'),
    status: text('status').default('detected'), // 'detected', 'verified', 'processed', 'ignored'
    verifiedAt: timestamp('verified_at'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const escrowSignatures = pgTable('escrow_signatures', {
    id: uuid('id').defaultRandom().primaryKey(),
    escrowId: uuid('escrow_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
    signerId: uuid('signer_id').references(() => users.id).notNull(),
    signature: text('signature').notNull(), // Cryptographic signature
    publicKey: text('public_key'),
    signedData: text('signed_data'), // The payload that was signed
    status: text('status').default('valid'),
    signedAt: timestamp('signed_at').defaultNow(),
});

export const vaultLocks = pgTable('vault_locks', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    lockType: text('lock_type').notNull(), // 'escrow', 'lien', 'security_deposit'
    referenceType: text('reference_type'), // 'escrow_contract', 'loan'
    referenceId: uuid('reference_id'),
    status: text('status').default('active'), // 'active', 'released', 'void'
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata'),
// Investment Recommendations Table
export const investmentRecommendations = pgTable('investment_recommendations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }),

    // Recommendation Details
    recommendationType: text('recommendation_type').notNull(), // buy, sell, hold, diversify, rebalance
    assetSymbol: text('asset_symbol'),
    assetName: text('asset_name'),
    assetType: text('asset_type'), // stock, etf, mutual_fund, bond, crypto

    // Reasoning
    reasoning: text('reasoning').notNull(),
    reasoningFactors: jsonb('reasoning_factors').default([]),

    // Metrics
    expectedReturn: numeric('expected_return', { precision: 8, scale: 4 }),
    riskLevel: text('risk_level').notNull(), // low, medium, high
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }), // 0-100
    timeHorizon: text('time_horizon'), // short, medium, long

    // Priority and Status
    priority: text('priority').default('medium'), // low, medium, high
    status: text('status').default('active'), // active, dismissed, implemented
    expiresAt: timestamp('expires_at'),

    // Financial Impact
    suggestedAmount: numeric('suggested_amount', { precision: 15, scale: 2 }),
    potentialGainLoss: numeric('potential_gain_loss', { precision: 15, scale: 2 }),

    // AI Metadata
    modelVersion: text('model_version'),
    analysisData: jsonb('analysis_data').default({}),

    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Portfolio Rebalancing History Table
export const portfolioRebalancing = pgTable('portfolio_rebalancing', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),

    // Rebalancing Details
    rebalanceType: text('rebalance_type').notNull(), // automatic, suggested, manual
    triggerReason: text('trigger_reason'), // threshold_exceeded, time_based, optimization, manual

    // Before State
    beforeAllocation: jsonb('before_allocation').notNull(),
    beforeValue: numeric('before_value', { precision: 15, scale: 2 }).notNull(),

    // After State
    afterAllocation: jsonb('after_allocation'),
    afterValue: numeric('after_value', { precision: 15, scale: 2 }),

    // Actions Taken
    actions: jsonb('actions').default([]),

    // Status
    status: text('status').default('pending'), // pending, completed, cancelled
    completedAt: timestamp('completed_at'),

    // Metrics
    expectedImprovement: numeric('expected_improvement', { precision: 8, scale: 4 }),
    actualImprovement: numeric('actual_improvement', { precision: 8, scale: 4 }),

    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ESCROW PROTOCOL RELATIONS
export const escrowContractsRelations = relations(escrowContracts, ({ one, many }) => ({
    user: one(users, { fields: [escrowContracts.userId], references: [users.id] }),
    creator: one(users, { fields: [escrowContracts.creatorId], references: [users.id] }),
    payer: one(users, { fields: [escrowContracts.payerId], references: [users.id] }),
    payee: one(users, { fields: [escrowContracts.payeeId], references: [users.id] }),
    vault: one(vaults, { fields: [escrowContracts.vaultId], references: [vaults.id] }),
    signatures: many(escrowSignatures),
}));

export const oracleEventsRelations = relations(oracleEvents, ({ many }) => ({
    linkedContracts: many(escrowContracts),
}));

export const escrowSignaturesRelations = relations(escrowSignatures, ({ one }) => ({
    escrow: one(escrowContracts, { fields: [escrowSignatures.escrowId], references: [escrowContracts.id] }),
    signer: one(users, { fields: [escrowSignatures.signerId], references: [users.id] }),
}));

export const vaultLocksRelations = relations(vaultLocks, ({ one }) => ({
    vault: one(vaults, { fields: [vaultLocks.vaultId], references: [vaults.id] }),
    user: one(users, { fields: [vaultLocks.userId], references: [users.id] }),
}));

export const escrowDisputes = pgTable('escrow_disputes', {
    id: uuid('id').defaultRandom().primaryKey(),
    escrowId: uuid('escrow_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
    initiatorId: uuid('initiator_id').references(() => users.id).notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence'),
    status: text('status').default('open'), // 'open', 'resolved', 'arbitration_pending'
    resolution: text('resolution'), // 'refund_to_payer', 'release_to_payee', 'split'
    resolvedAt: timestamp('resolved_at'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const escrowDisputesRelations = relations(escrowDisputes, ({ one }) => ({
    escrow: one(escrowContracts, { fields: [escrowDisputes.escrowId], references: [escrowContracts.id] }),
    initiator: one(users, { fields: [escrowDisputes.initiatorId], references: [users.id] }),
// Relations for Investment Portfolio Analyzer Tables
export const investmentRiskProfilesRelations = relations(investmentRiskProfiles, ({ one, many }) => ({
    user: one(users, {
        fields: [investmentRiskProfiles.userId],
        references: [users.id],
    }),
}));

export const investmentRecommendationsRelations = relations(investmentRecommendations, ({ one }) => ({
    user: one(users, {
        fields: [investmentRecommendations.userId],
        references: [users.id],
    }),
    portfolio: one(portfolios, {
        fields: [investmentRecommendations.portfolioId],
        references: [portfolios.id],
    }),
}));

export const portfolioRebalancingRelations = relations(portfolioRebalancing, ({ one }) => ({
    user: one(users, {
        fields: [portfolioRebalancing.userId],
        references: [users.id],
    }),
    portfolio: one(portfolios, {
        fields: [portfolioRebalancing.portfolioId],
        references: [portfolios.id],
    }),
}));

export const taxLossOpportunitiesRelations = relations(taxLossOpportunities, ({ one }) => ({
    user: one(users, { fields: [taxLossOpportunities.userId], references: [users.id] }),
    portfolio: one(portfolios, { fields: [taxLossOpportunities.portfolioId], references: [portfolios.id] }),
    investment: one(investments, { fields: [taxLossOpportunities.investmentId], references: [investments.id] }),
}));

export const washSaleViolationsRelations = relations(washSaleViolations, ({ one }) => ({
    user: one(users, { fields: [washSaleViolations.userId], references: [users.id] }),
    investment: one(investments, { fields: [washSaleViolations.investmentId], references: [investments.id] }),
}));

// Update users relations to include new tables - DELETED DUPLICATE

export const taxLotInventoryRelations = relations(taxLotInventory, ({ one, many }) => ({
    user: one(users, { fields: [taxLotInventory.userId], references: [users.id] }),
    portfolio: one(portfolios, { fields: [taxLotInventory.portfolioId], references: [portfolios.id] }),
    investment: one(investments, { fields: [taxLotInventory.investmentId], references: [investments.id] }),
    adjustments: many(costBasisAdjustments),
}));

export const costBasisAdjustmentsRelations = relations(costBasisAdjustments, ({ one }) => ({
    lot: one(taxLotInventory, { fields: [costBasisAdjustments.lotId], references: [taxLotInventory.id] }),
}));

export const liquidationQueuesRelations = relations(liquidationQueues, ({ many, one }) => ({
    user: one(users, { fields: [liquidationQueues.userId], references: [users.id] }),
    investment: one(investments, { fields: [liquidationQueues.investmentId], references: [investments.id] }),
}));

export const marginRequirementsRelations = relations(marginRequirements, ({ one }) => ({
    user: one(users, { fields: [marginRequirements.userId], references: [users.id] }),
}));

export const collateralSnapshotsRelations = relations(collateralSnapshots, ({ one }) => ({
    user: one(users, { fields: [collateralSnapshots.userId], references: [users.id] }),
}));

export const liquidityPoolsRelations = relations(liquidityPools, ({ one }) => ({
    user: one(users, { fields: [liquidityPools.userId], references: [users.id] }),
}));

export const internalClearingLogsRelations = relations(internalClearingLogs, ({ one }) => ({
    user: one(users, { fields: [internalClearingLogs.userId], references: [users.id] }),
    fromVault: one(vaults, { fields: [internalClearingLogs.fromVaultId], references: [vaults.id] }),
    toVault: one(vaults, { fields: [internalClearingLogs.toVaultId], references: [vaults.id] }),
}));

export const fxSettlementInstructionsRelations = relations(fxSettlementInstructions, ({ one }) => ({
    user: one(users, { fields: [fxSettlementInstructions.userId], references: [users.id] }),
}));
