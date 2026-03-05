// Schema definitions for Cross-Currency Goal FX (Issue #570)
import { pgTable, uuid, text, integer, timestamp, jsonb, numeric, boolean } from 'drizzle-orm/pg-core';
import { tenants, goals, users, goalContributionLineItems } from './schema.js';

// FX Rate Snapshots - Historical exchange rates
export const fxRateSnapshots = pgTable('fx_rate_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    
    // Rate details
    sourceCurrency: text('source_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 8 }).notNull(),
    
    // Timestamp locking
    rateTimestamp: timestamp('rate_timestamp').notNull(),
    rateSource: text('rate_source').notNull().default('market'),
    
    // Policy metadata
    policyType: text('policy_type').notNull().default('transaction_time'),
    policyVersion: integer('policy_version').notNull().default(1),
    
    // Validity tracking
    isActive: boolean('is_active').notNull().default(true),
    validFrom: timestamp('valid_from').defaultNow(),
    validUntil: timestamp('valid_until'),
    
    // Override handling
    isOverride: boolean('is_override').default(false),
    overrideReason: text('override_reason'),
    overriddenByUserId: uuid('overridden_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    
    // Audit
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// FX Conversion Policies - Tenant-specific policies
export const fxConversionPolicies = pgTable('fx_conversion_policies', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    
    // Policy definition
    policyType: text('policy_type').notNull(),
    policyName: text('policy_name').notNull(),
    description: text('description'),
    
    // Configuration
    baseCurrency: text('base_currency').notNull().default('USD'),
    roundingMode: text('rounding_mode').notNull().default('HALF_UP'),
    roundingDecimals: integer('rounding_decimals').notNull().default(2),
    
    // Rate lookup strategy
    rateLookupWindowHours: integer('rate_lookup_window_hours').notNull().default(24),
    useForwardRates: boolean('use_forward_rates').default(false),
    fallbackRateSource: text('fallback_rate_source').default('manual'),
    
    // Allowed currencies
    allowedCurrencies: jsonb('allowed_currencies').default('[]'),
    
    // Version control
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    
    // Audit
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Contribution FX Details - FX normalization tracking
export const goalContributionFxDetails = pgTable('goal_contribution_fx_details', {
    id: uuid('id').defaultRandom().primaryKey(),
    lineItemId: uuid('line_item_id').references(() => goalContributionLineItems.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    
    // Original amount details
    originalCurrency: text('original_currency').notNull(),
    originalAmountCents: integer('original_amount_cents').notNull(),
    
    // Normalized details
    baseCurrency: text('base_currency').notNull(),
    normalizedAmountCents: integer('normalized_amount_cents').notNull(),
    
    // FX details
    fxRate: numeric('fx_rate', { precision: 18, scale: 8 }).notNull(),
    fxRateId: uuid('fx_rate_id').references(() => fxRateSnapshots.id, { onDelete: 'set null' }),
    fxTimestamp: timestamp('fx_timestamp').notNull(),
    policyType: text('policy_type').notNull(),
    policyVersion: integer('policy_version').notNull(),
    
    // Tracking
    isNormalized: boolean('is_normalized').notNull().default(true),
    normalizationVersion: integer('normalization_version').notNull().default(1),
    
    // Audit
    normalizedAt: timestamp('normalized_at').defaultNow(),
    normalizedBy: text('normalized_by').default('system'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// FX Reconciliation Audit - Track all conversions and corrections
export const fxReconciliationAudit = pgTable('fx_reconciliation_audit', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Context
    reconciliationType: text('reconciliation_type').notNull(),
    triggerReason: text('trigger_reason'),
    
    // Before state
    previousTotalCents: integer('previous_total_cents').notNull(),
    previousNormalizedCurrency: text('previous_normalized_currency').notNull(),
    previousFxRateId: uuid('previous_fx_rate_id').references(() => fxRateSnapshots.id, { onDelete: 'set null' }),
    
    // After state
    newTotalCents: integer('new_total_cents').notNull(),
    newNormalizedCurrency: text('new_normalized_currency').notNull(),
    newFxRateId: uuid('new_fx_rate_id').references(() => fxRateSnapshots.id, { onDelete: 'set null' }),
    
    // Impact
    correctionAmountCents: integer('correction_amount_cents'),
    correctionPercentage: numeric('correction_percentage', { precision: 8, scale: 4 }),
    affectedContributions: integer('affected_contributions').notNull(),
    
    // Affected rates
    oldRate: numeric('old_rate', { precision: 18, scale: 8 }),
    newRate: numeric('new_rate', { precision: 18, scale: 8 }),
    rateChangePercentage: numeric('rate_change_percentage', { precision: 8, scale: 4 }),
    
    // Metadata
    affectedCurrencies: jsonb('affected_currencies').default('[]'),
    manualOverride: boolean('manual_override').default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvalNotes: text('approval_notes'),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// FX Rate Cache - Fast lookup table
export const fxRateCache = pgTable('fx_rate_cache', {
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    sourceCurrency: text('source_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    
    // Most recent data
    latestRate: numeric('latest_rate', { precision: 18, scale: 8 }).notNull(),
    latestRateTimestamp: timestamp('latest_rate_timestamp').notNull(),
    latestRateId: uuid('latest_rate_id').references(() => fxRateSnapshots.id, { onDelete: 'set null' }),
    
    // Cache metadata
    cachedAt: timestamp('cached_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    hitCount: integer('hit_count').default(0),
    
    primaryKey: (table) => [table.tenantId, table.sourceCurrency, table.targetCurrency],
});
