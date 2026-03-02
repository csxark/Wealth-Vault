import { pgTable, uuid, varchar, text, timestamp, decimal, jsonb, boolean, integer, foreignKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { tenants, users, expenses } from './schema.js';

/**
 * Portfolio Rebalancing Schema
 * 
 * Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting
 * 
 * Features:
 * - Multi-currency portfolio tracking
 * - Allocation target management
 * - Tax-loss harvesting recommendations
 * - Rebalancing transaction history
 * - Cost basis tracking
 * - Portfolio drift monitoring
 */

export const portfolioHoldings = pgTable(
  'portfolio_holdings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    
    // Asset identification
    assetSymbol: varchar('asset_symbol', { length: 20 }).notNull(), // e.g., "BTC", "ETH", "AAPL", "EUR"
    assetType: varchar('asset_type', { length: 50 }).notNull(), // cryptocurrency, stock, bond, commodity, fiat
    baseCurrency: varchar('base_currency', { length: 3 }).notNull().default('USD'), // e.g., "USD", "EUR", "GBP"
    
    // Holdings
    quantity: decimal('quantity', { precision: 18, scale: 8 }).notNull(), // Amount held (8 decimals for crypto)
    acquisitionCost: decimal('acquisition_cost', { precision: 18, scale: 2 }).notNull(), // Total cost basis in base currency
    currentValue: decimal('current_value', { precision: 18, scale: 2 }).notNull(), // Current market value
    
    // Cost basis tracking
    costBasisHistory: jsonb('cost_basis_history').notNull().default({}), // [{price, quantity, date, fee}]
    averageCostPerUnit: decimal('average_cost_per_unit', { precision: 18, scale: 8 }).notNull(), // FIFO/LIFO calculated
    
    // Gains/Losses
    unrealizedGain: decimal('unrealized_gain', { precision: 18, scale: 2 }).notNull().default('0'),
    unrealizedGainPercent: decimal('unrealized_gain_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    realizedGain: decimal('realized_gain', { precision: 18, scale: 2 }).notNull().default('0'), // From completed sales
    
    // Tax tracking
    taxLotIds: text('tax_lot_ids').array(), // References to specific purchases for tax harvesting
    holdingPeriod: varchar('holding_period', { length: 20 }), // short-term or long-term
    isLongTerm: boolean('is_long_term').default(false), // > 1 year = long-term capital gain
    
    // Last updated
    lastPriceUpdate: timestamp('last_price_update'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userCurrencyIdx: index('idx_portfolio_holdings_user_asset').on(table.userId, table.assetSymbol),
    tenantIdx: index('idx_portfolio_holdings_tenant').on(table.tenantId),
  })
);

export const allocationTargets = pgTable(
  'allocation_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    
    // Target definition
    targetName: varchar('target_name', { length: 100 }).notNull(), // e.g., "Conservative", "Growth", "Crypto-Heavy"
    description: text('description'),
    strategy: varchar('strategy', { length: 50 }).notNull(), // conservative, balanced, aggressive, crypto, index-following
    riskProfile: varchar('risk_profile', { length: 20 }).notNull(), // low, medium, high
    
    // Allocation breakdown
    allocations: jsonb('allocations').notNull(), // {assetSymbol: {target: 0.30, minBound: 0.25, maxBound: 0.35}}
    rebalancingThreshold: decimal('rebalancing_threshold', { precision: 3, scale: 2 }).notNull().default('0.05'), // 5% drift tolerance
    
    // Rebalancing config
    autoRebalance: boolean('auto_rebalance').default(false),
    rebalanceFrequency: varchar('rebalance_frequency', { length: 20 }), // daily, weekly, monthly, quarterly
    rebalanceDay: integer('rebalance_day'), // Day of month (1-31) or day of week (1-7)
    nextRebalanceDate: timestamp('next_rebalance_date'),
    
    // Tax optimization
    taxOptimization: boolean('tax_optimization').enabled().default(true),
    preferTaxLoss: boolean('prefer_tax_loss').default(true),
    minGainForRealization: decimal('min_gain_for_realization', { precision: 18, scale: 2 }).default('100'), // Only harvest gains > $100
    
    // Cost control
    maxTransactionCost: decimal('max_transaction_cost', { precision: 18, scale: 2 }), // Max total fees allowed
    maxSlippage: decimal('max_slippage', { precision: 5, scale: 2 }).default('0.50'), // Max 0.5% slippage
    preferredExchanges: text('preferred_exchanges').array(), // ['kraken', 'coinbase', 'interactive-brokers']
    
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userStrategyIdx: uniqueIndex('idx_allocation_targets_user_strategy')
      .on(table.userId, table.strategy)
      .where(table.isActive),
    tenantIdx: index('idx_allocation_targets_tenant').on(table.tenantId),
  })
);

export const rebalancingRecommendations = pgTable(
  'rebalancing_recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    allocationTargetId: uuid('allocation_target_id')
      .notNull()
      .references(() => allocationTargets.id, { onDelete: 'cascade' }),
    
    // Portfolio state
    portfolioValue: decimal('portfolio_value', { precision: 18, scale: 2 }).notNull(),
    currentAllocations: jsonb('current_allocations').notNull(), // {assetSymbol: {value: 1000, percent: 0.30}}
    targetAllocations: jsonb('target_allocations').notNull(), // {assetSymbol: {target: 0.35, value: 1050}}
    deviations: jsonb('deviations').notNull(), // {assetSymbol: {deviation: 0.05, direction: 'overweight'}}
    
    // Rebalancing moves
    moves: jsonb('moves').notNull(), // [{from: 'BTC', to: 'ETH', amount: 100, reason: 'rebalance'}]
    estimatedCost: decimal('estimated_cost', { precision: 18, scale: 2 }).notNull(), // Total transaction fees
    estimatedSlippage: decimal('estimated_slippage', { precision: 18, scale: 2 }).notNull(), // Price impact
    taxImpact: jsonb('tax_impact').notNull(), // {realizedGains: 500, realizedLosses: 200, netTaxCost: -150}
    
    // Tax harvesting opportunities
    taxHarvestingMoves: jsonb('tax_harvesting_moves').notNull(), // [{sell: 'AAPL', buy: 'VTI', loss: 250, purpose: 'harvest'}]
    harvestablelosses: decimal('harvestable_losses', { precision: 18, scale: 2 }).default('0'), // Total losses available to harvest
    
    // Recommendation state
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, approved, accepted, executed, expired, rejected
    priority: varchar('priority', { length: 20 }).notNull().default('medium'), // low, medium, high, urgent(drift > 20%)
    
    // Execution tracking
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(), // Recommendations expire (market changes)
    actionedAt: timestamp('actioned_at'), // When user accepted/executed
    rejectionReason: text('rejection_reason'), // Why rejected
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userRecentIdx: index('idx_rebalancing_rec_user_status')
      .on(table.userId, table.status, table.createdAt),
    statusIdx: index('idx_rebalancing_rec_status').on(table.status),
  })
);

export const rebalancingTransactions = pgTable(
  'rebalancing_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recommendationId: uuid('recommendation_id')
      .references(() => rebalancingRecommendations.id, { onDelete: 'set null' }),
    
    // Transaction details
    transactionType: varchar('transaction_type', { length: 20 }).notNull(), // swap, sell-buy, harvest, rebalance
    fromAsset: varchar('from_asset', { length: 20 }).notNull(),
    toAsset: varchar('to_asset', { length: 20 }).notNull(),
    fromQuantity: decimal('from_quantity', { precision: 18, scale: 8 }).notNull(),
    toQuantity: decimal('to_quantity', { precision: 18, scale: 8 }).notNull(),
    executionPrice: decimal('execution_price', { precision: 18, scale: 8 }).notNull(),
    
    // Costs and fees
    baseCurrency: varchar('base_currency', { length: 3 }).notNull().default('USD'),
    transactionFee: decimal('transaction_fee', { precision: 18, scale: 2 }).notNull().default('0'),
    feeType: varchar('fee_type', { length: 20 }), // fixed, percentage, tiered
    exchangeRate: decimal('exchange_rate', { precision: 18, scale: 8 }), // If currency conversion
    slippage: decimal('slippage', { precision: 18, scale: 2 }).notNull().default('0'),
    
    // Tax implications
    realizedGain: decimal('realized_gain', { precision: 18, scale: 2 }).default('0'),
    realizedLoss: decimal('realized_loss', { precision: 18, scale: 2 }).default('0'),
    gainType: varchar('gain_type', { length: 20 }), // short-term, long-term
    isTaxHarvest: boolean('is_tax_harvest').default(false),
    
    // Execution state
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, submitted, filled, failed, cancelled
    executedAt: timestamp('executed_at'),
    confirmationHash: varchar('confirmation_hash', { length: 255 }), // TX hash or confirmation ID
    
    // Metadata
    exchangeName: varchar('exchange_name', { length: 100 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userRecentIdx: index('idx_rebalancing_tx_user_date')
      .on(table.userId, table.executedAt),
    statusIdx: index('idx_rebalancing_tx_status').on(table.status),
    assetPairIdx: index('idx_rebalancing_tx_assets')
      .on(table.fromAsset, table.toAsset),
  })
);

export const taxLots = pgTable(
  'tax_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    holdingId: uuid('holding_id')
      .references(() => portfolioHoldings.id, { onDelete: 'cascade' }),
    
    // Lot identification
    assetSymbol: varchar('asset_symbol', { length: 20 }).notNull(),
    quantity: decimal('quantity', { precision: 18, scale: 8 }).notNull(),
    costBasis: decimal('cost_basis', { precision: 18, scale: 2 }).notNull(), // Total value at purchase
    costPerUnit: decimal('cost_per_unit', { precision: 18, scale: 8 }).notNull(),
    acquisitionDate: timestamp('acquisition_date').notNull(),
    
    // Current valuation
    currentValue: decimal('current_value', { precision: 18, scale: 2 }).notNull(),
    unrealizedGain: decimal('unrealized_gain', { precision: 18, scale: 2 }).notNull(),
    gainPercent: decimal('gain_percent', { precision: 7, scale: 2 }).notNull(),
    
    // Holding period classification
    purchaseDate: timestamp('purchase_date').notNull(),
    isLongTerm: boolean('is_long_term').notNull(),
    daysHeld: integer('days_held').notNull(),
    
    // Tax harvesting
    canBeHarvested: boolean('can_be_harvested').default(true),
    harvestPriority: integer('harvest_priority').default(100), // Lower = higher priority for harvesting
    lastHarvestedAt: timestamp('last_harvested_at'),
    washSaleExcludeUntil: timestamp('wash_sale_exclude_until'), // IRS wash sale rule
    
    // Disposition
    status: varchar('status', { length: 20 }).notNull().default('open'), // open, partial-sold, fully-sold, harvested
    sellDate: timestamp('sell_date'),
    realizedGain: decimal('realized_gain', { precision: 18, scale: 2 }).default('0'),
    realizedLoss: decimal('realized_loss', { precision: 18, scale: 2 }).default('0'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userAssetIdx: index('idx_tax_lots_user_asset')
      .on(table.userId, table.assetSymbol, table.status),
    harvestableIdx: index('idx_tax_lots_harvestable')
      .on(table.canBeHarvested, table.unrealizedGain),
  })
);

export const rebalancingMetrics = pgTable(
  'rebalancing_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    allocationTargetId: uuid('allocation_target_id')
      .references(() => allocationTargets.id, { onDelete: 'cascade' }),
    
    // Period
    periodType: varchar('period_type', { length: 20 }).notNull(), // daily, weekly, monthly, quarterly, yearly
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    
    // Portfolio metrics
    portfolioValue: decimal('portfolio_value', { precision: 18, scale: 2 }).notNull(),
    previousValue: decimal('previous_value', { precision: 18, scale: 2 }).notNull(),
    totalReturn: decimal('total_return', { precision: 7, scale: 2 }).notNull(),
    
    // Drift metrics
    maxAllocationDrift: decimal('max_allocation_drift', { precision: 5, scale: 2 }).notNull(), // Largest deviation
    averageAllocationDrift: decimal('average_allocation_drift', { precision: 5, scale: 2 }).notNull(),
    driftTrend: varchar('drift_trend', { length: 20 }), // increasing, stable, decreasing
    
    // Rebalancing activity
    rebalancingCount: integer('rebalancing_count').default(0),
    totalRebalancingCost: decimal('total_rebalancing_cost', { precision: 18, scale: 2 }).default('0'),
    averageCostPerRebalance: decimal('average_cost_per_rebalance', { precision: 18, scale: 2 }).default('0'),
    
    // Tax metrics
    realizedGains: decimal('realized_gains', { precision: 18, scale: 2 }).default('0'),
    realizedLosses: decimal('realized_losses', { precision: 18, scale: 2 }).default('0'),
    harvestedLosses: decimal('harvested_losses', { precision: 18, scale: 2 }).default('0'),
    estimatedTaxCost: decimal('estimated_tax_cost', { precision: 18, scale: 2 }).default('0'),
    
    // Performance vs target
    targetAlignmentScore: decimal('target_alignment_score', { precision: 5, scale: 2 }).default('100'), // 0-100
    efficiencyScore: decimal('efficiency_score', { precision: 5, scale: 2 }).default('100'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userPeriodIdx: index('idx_rebalancing_metrics_user_period')
      .on(table.userId, table.periodStart, table.periodEnd),
    driftIdx: index('idx_rebalancing_metrics_drift')
      .on(table.maxAllocationDrift),
  })
);

// Relations
export const portfolioHoldingsRelations = {
  allocation: {
    references: () => allocationTargets.id,
    foreignKeyName: 'portfolio_holdings_allocation_fk',
  },
};

// Zod schemas for validation
export const createPortfolioHoldingSchema = createInsertSchema(portfolioHoldings);
export const createAllocationTargetSchema = createInsertSchema(allocationTargets);
export const createRebalancingRecommendationSchema = createInsertSchema(rebalancingRecommendations);
export const createRebalancingTransactionSchema = createInsertSchema(rebalancingTransactions);
export const createTaxLotSchema = createInsertSchema(taxLots);
export const createRebalancingMetricsSchema = createInsertSchema(rebalancingMetrics);
