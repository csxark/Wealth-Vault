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
    inviterId: uuid('inviter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    role: text('role').default('member'),
    status: text('status').default('pending'), // pending, accepted, rejected, expired
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
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