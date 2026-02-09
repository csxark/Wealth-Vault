
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// CORE LAYER
// ============================================================================

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
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'set null' }),
    budget: numeric('budget', { precision: 12, scale: 2 }).default('0'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const expenses = pgTable('expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    vaultId: uuid('vault_id'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    date: timestamp('date').defaultNow().notNull(),
    paymentMethod: text('payment_method').default('other'),
    isRecurring: boolean('is_recurring').default(false),
    status: text('status').default('completed'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_expenses_user_date').on(table.userId, table.date),
}));

export const subscriptions = pgTable('subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    billingCycle: text('billing_cycle').default('monthly'), // weekly, biweekly, monthly, quarterly, yearly
    startDate: timestamp('start_date'),
    nextRenewalDate: timestamp('next_renewal_date').notNull(),
    status: text('status').default('active'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const subscriptionUsage = pgTable('subscription_usage', {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    month: text('month').notNull(), // YYYY-MM
    usageCount: integer('usage_count').default(0),
    lastUsedAt: timestamp('last_used_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cancellationSuggestions = pgTable('cancellation_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    reason: text('reason').notNull(),
    severity: text('severity').default('medium'), // low, medium, high
    status: text('status').default('pending'), // pending, ignored, cancelled
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// VAULTS & COLLABORATION
// ============================================================================

export const vaults = pgTable('vaults', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currency: text('currency').default('USD'),
    isActive: boolean('is_active').default(true),
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

export const vaultInvites = pgTable('vault_invites', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    status: text('status').default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
});

export const vaultBalances = pgTable('vault_balances', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).default('0').notNull(),
    currency: text('currency').default('USD'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const settlements = pgTable('settlements', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    payerId: uuid('payer_id').references(() => users.id).notNull(),
    payeeId: uuid('payee_id').references(() => users.id).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const debtTransactions = pgTable('debt_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    paidById: uuid('paid_by_id').references(() => users.id).notNull(),
    owedById: uuid('owed_by_id').references(() => users.id).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    isSettled: boolean('is_settled').default(false),
});

// ============================================================================
// GOALS & SAVINGS
// ============================================================================

export const goals = pgTable('goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).default('0'),
    deadline: timestamp('deadline'),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const goalMilestones = pgTable('goal_milestones', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    isCompleted: boolean('is_completed').default(false),
});

export const savingsRoundups = pgTable('savings_roundups', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    roundUpAmount: numeric('round_up_amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// INFRASTRUCTURE & SECURITY
// ============================================================================

export const deviceSessions = pgTable('device_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    deviceId: text('device_id').notNull(),
    refreshToken: text('refresh_token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const tokenBlacklist = pgTable('token_blacklist', {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
});

export const securityEvents = pgTable('security_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    eventType: text('event_type').notNull(),
    severity: text('severity').default('info'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    details: jsonb('details'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const securityMarkers = pgTable('security_markers', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    markerType: text('marker_type').notNull(),
    severity: text('severity').default('medium'),
    status: text('status').default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const disputedTransactions = pgTable('disputed_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').default('open'),
});

// ============================================================================
// CURRENCY & FX (#267)
// ============================================================================

export const exchangeRates = pgTable('exchange_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    baseCurrency: text('base_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    rate: doublePrecision('rate').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const currencyWallets = pgTable('currency_wallets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    balance: numeric('balance', { precision: 18, scale: 8 }).default('0'),
    isDefault: boolean('is_default').default(false),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

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
    status: text('status').default('completed'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const fxRates = pgTable('fx_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull().unique(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    volatility: numeric('volatility', { precision: 5, scale: 2 }).default('0'),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

export const arbitrageOpportunities = pgTable('arbitrage_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull(),
    type: text('type').notNull(),
    expectedProfit: numeric('expected_profit', { precision: 5, scale: 2 }),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// FORENSICS & PREDICTIONS
// ============================================================================

export const auditSnapshots = pgTable('audit_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: timestamp('snapshot_date').notNull(),
    accountState: jsonb('account_state').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const stateDeltas = pgTable('state_deltas', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resourceType: text('resource_type').notNull(),
    operation: text('operation').notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const forensicQueries = pgTable('forensic_queries', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    queryType: text('query_type').notNull(),
    status: text('status').default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
});

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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectedBalance: numeric('projected_balance', { precision: 12, scale: 2 }).notNull(),
    confidence: doublePrecision('confidence'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const balanceSnapshots = pgTable('balance_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').defaultNow().notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).notNull(),
});

export const liquidityAlerts = pgTable('liquidity_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('active'),
});

export const transferSuggestions = pgTable('transfer_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
});

export const forecasts = pgTable('forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    forecastType: text('forecast_type').notNull(),
    forecastData: jsonb('forecast_data').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// INVESTMENTS & DEBT
// ============================================================================

export const portfolios = pgTable('portfolios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    riskTolerance: text('risk_tolerance').default('moderate'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const investments = pgTable('investments', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    quantity: numeric('quantity', { precision: 15, scale: 6 }).notNull(),
    averageCost: numeric('average_cost', { precision: 12, scale: 4 }).notNull(),
});

export const investmentTransactions = pgTable('investment_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    type: text('type').notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    date: timestamp('date').defaultNow(),
});

export const priceHistory = pgTable('price_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    close: numeric('close', { precision: 12, scale: 4 }).notNull(),
    date: timestamp('date').notNull(),
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
    debts: many(debts),
    payoffStrategies: many(payoffStrategies),
    refinanceOpportunities: many(refinanceOpportunities),
    properties: many(properties),
    tenantLeases: many(tenantLeases),
    simulationResults: many(simulationResults),
    riskProfile: one(riskProfiles),
    balanceSnapshots: many(balanceSnapshots),
    forecastSnapshots: many(forecastSnapshots),
    liquidityAlerts: many(liquidityAlerts),
    transferSuggestions: many(transferSuggestions),
    properties: many(properties),
    tenantLeases: many(tenantLeases),
}));

export const debtPayments = pgTable('debt_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date').notNull(),
});

export const payoffStrategies = pgTable('payoff_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyName: text('strategy_name').notNull(),
    isActive: boolean('is_active').default(true),
});

export const amortizationSchedules = pgTable('amortization_schedules', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    scheduledDate: timestamp('scheduled_date').notNull(),
    paymentAmount: numeric('payment_amount', { precision: 12, scale: 2 }).notNull(),
    remainingBalance: numeric('remaining_balance', { precision: 12, scale: 2 }).notNull(),
});

export const refinanceOpportunities = pgTable('refinance_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    potentialSavings: numeric('potential_savings', { precision: 12, scale: 2 }).notNull(),
});

// ============================================================================
// TAX LAYER
// ============================================================================

export const taxProfiles = pgTable('tax_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    taxYear: integer('tax_year').notNull(),
});

export const taxBrackets = pgTable('tax_brackets', {
    id: uuid('id').defaultRandom().primaryKey(),
    taxYear: integer('tax_year').notNull(),
    rate: numeric('rate', { precision: 5, scale: 2 }).notNull(),
});

export const taxDeductions = pgTable('tax_deductions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
});

export const taxReports = pgTable('tax_reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taxYear: integer('tax_year').notNull(),
    pdfUrl: text('pdf_url'),
});

// ============================================================================
// REAL ESTATE LAYER (#265)
// ============================================================================

export const fixedAssets = pgTable('fixed_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull(),
});

export const properties = pgTable('properties', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioName: text('scenario_name').notNull(),
    configurations: jsonb('configurations'), // { inflationRate, investmentReturn, timeHorizon }
    results: jsonb('results'), // { p10, p50, p90, yearlyProjections: [] }
    createdAt: timestamp('created_at').defaultNow(),
});

// Risk Profiles
export const riskProfiles = pgTable('risk_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).unique().notNull(),
    riskTolerance: text('risk_tolerance').notNull(), // 'low', 'medium', 'high', 'aggressive'
    targetReturn: numeric('target_return', { precision: 5, scale: 2 }),
    maxDrawdown: numeric('max_drawdown', { precision: 5, scale: 2 }),
    preferredAssetMix: jsonb('preferred_asset_mix'), // { stocks: 60, bonds: 30, crypto: 10 }
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
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

export const riskProfilesRelations = relations(riskProfiles, ({ one }) => ({
    user: one(users, {
        fields: [riskProfiles.userId],
        references: [users.id],
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
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tenantName: text('tenant_name').notNull(),
    leaseStart: timestamp('lease_start').notNull(),
    leaseEnd: timestamp('lease_end').notNull(),
    monthlyRent: numeric('monthly_rent', { precision: 12, scale: 2 }).notNull(),
});

export const propertyMaintenance = pgTable('property_maintenance', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    cost: numeric('cost', { precision: 12, scale: 2 }).notNull(),
    description: text('description').notNull(),
});

export const propertyROISnapshots = pgTable('property_roi_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    netOperatingIncome: numeric('net_operating_income', { precision: 12, scale: 2 }).notNull(),
});

// ============================================================================
// CORPORATE & BUSINESS LAYER (#271)
// ============================================================================

export const corporateEntities = pgTable('corporate_entities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    parentEntityId: uuid('parent_entity_id').references(() => corporateEntities.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    legalForm: text('legal_form').notNull(),
    taxId: text('tax_id').unique(),
});

export const employees = pgTable('employees', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    salary: numeric('salary', { precision: 12, scale: 2 }).notNull(),
});

export const payrollRuns = pgTable('payroll_runs', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    totalGross: numeric('total_gross', { precision: 12, scale: 2 }).notNull(),
});

export const dividendPayouts = pgTable('dividend_payouts', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
});

export const businessLedgers = pgTable('business_ledgers', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => corporateEntities.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    type: text('type').notNull(), // revenue, expense, asset, liability, equity
    description: text('description').notNull(),
});

// ============================================================================
// BUDGETING LAYER
// ============================================================================

export const budgetAlerts = pgTable('budget_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threshold: integer('threshold').notNull(),
});

export const budgetRules = pgTable('budget_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    ruleType: text('rule_type').notNull(),
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
});

export const reports = pgTable('reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
    categories: many(categories),
    expenses: many(expenses),
    subscriptions: many(subscriptions),
    goals: many(goals),
    deviceSessions: many(deviceSessions),
    vaultMemberships: many(vaultMembers),
    ownedVaults: many(vaults),
    securityEvents: many(securityEvents),
    reports: many(reports),
    budgetAlerts: many(budgetAlerts),
    auditLogs: many(auditLogs),
    currencyWallets: many(currencyWallets),
    corporateEntities: many(corporateEntities),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    user: one(users, { fields: [categories.userId], references: [users.id] }),
    expenses: many(expenses),
    subscriptions: many(subscriptions),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    user: one(users, { fields: [expenses.userId], references: [users.id] }),
    category: one(categories, { fields: [expenses.categoryId], references: [categories.id] }),
    vault: one(vaults, { fields: [expenses.vaultId], references: [vaults.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
    user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
    usage: many(subscriptionUsage),
    suggestions: many(cancellationSuggestions),
}));

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
    owner: one(users, { fields: [vaults.ownerId], references: [users.id] }),
    members: many(vaultMembers),
    balances: many(vaultBalances),
}));

export const corporateEntitiesRelations = relations(corporateEntities, ({ one, many }) => ({
    user: one(users, { fields: [corporateEntities.userId], references: [users.id] }),
    parent: one(corporateEntities, { fields: [corporateEntities.parentEntityId], references: [corporateEntities.id], relationName: 'subsidiaries' }),
    subsidiaries: many(corporateEntities, { relationName: 'subsidiaries' }),
    employees: many(employees),
    payrollRuns: many(payrollRuns),
    ledgerEntries: many(businessLedgers),
}));

export const currencyWalletsRelations = relations(currencyWallets, ({ one, many }) => ({
    user: one(users, { fields: [currencyWallets.userId], references: [users.id] }),
    vault: one(vaults, { fields: [currencyWallets.vaultId], references: [vaults.id] }),
    transactionsFrom: many(fxTransactions, { relationName: 'sourceWallet' }),
    transactionsTo: many(fxTransactions, { relationName: 'targetWallet' }),
}));
