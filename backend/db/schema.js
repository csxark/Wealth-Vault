
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision, index } from 'drizzle-orm/pg-core';
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

// Vaults Module
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

export const vaultBalances = pgTable('vault_balances', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).default('0').notNull(),
    currency: text('currency').default('USD'),
    createdAt: timestamp('created_at').defaultNow(),
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

export const fixedAssets = pgTable('fixed_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull(),
    appreciationRate: numeric('appreciation_rate', { precision: 5, scale: 2 }),
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
// TAX MODULE
// ============================================================================

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
    vaultMemberships: many(vaultMembers),
    ownedVaults: many(vaults),
    debts: many(debts),
    taxProfile: one(taxProfiles, { fields: [users.id], references: [taxProfiles.userId] }),
    properties: many(properties),
    corporateEntities: many(corporateEntities),
    dividendPayouts: many(dividendPayouts),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    user: one(users, { fields: [categories.userId], references: [users.id] }),
    parentCategory: one(categories, { fields: [categories.parentCategoryId], references: [categories.id], relationName: 'subcategories' }),
    subcategories: many(categories, { relationName: 'subcategories' }),
    expenses: many(expenses),
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

export const goalsRelations = relations(goals, ({ one }) => ({
    user: one(users, { fields: [goals.userId], references: [users.id] }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
    user: one(users, { fields: [portfolios.userId], references: [users.id] }),
    investments: many(investments),
}));

export const investmentsRelations = relations(investments, ({ one }) => ({
    portfolio: one(portfolios, { fields: [investments.portfolioId], references: [portfolios.id] }),
    user: one(users, { fields: [investments.userId], references: [users.id] }),
}));

export const fixedAssetsRelations = relations(fixedAssets, ({ one }) => ({
    user: one(users, { fields: [fixedAssets.userId], references: [users.id] }),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
    user: one(users, { fields: [debts.userId], references: [users.id] }),
    payments: many(debtPayments),
    amortizationSchedules: many(amortizationSchedules),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
    debt: one(debts, { fields: [debtPayments.debtId], references: [debts.id] }),
    user: one(users, { fields: [debtPayments.userId], references: [users.id] }),
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
// ADVANCED TRANSACTION CATEGORIZATION (#299)
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
