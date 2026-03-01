// backend/db/schema-bulk-import.js
// Issue #636: Bulk Expense Import & Auto-Reconciliation Schema

import { pgTable, uuid, varchar, text, timestamp, integer, numeric, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './schema.js';

// Enums
export const importStatusEnum = pgEnum('import_status', [
    'pending',
    'parsing',
    'matching',
    'reviewing',
    'completed',
    'failed',
    'cancelled'
]);

export const importSourceEnum = pgEnum('import_source', [
    'csv',
    'excel',
    'bank_api',
    'manual',
    'plaid',
    'finicity'
]);

export const matchStatusEnum = pgEnum('match_status', [
    'pending',
    'auto_matched',
    'manual_matched',
    'rejected',
    'duplicate',
    'new'
]);

export const reconciliationActionEnum = pgEnum('reconciliation_action', [
    'approve',
    'reject',
    'edit',
    'merge',
    'skip'
]);

export const bankConnectionStatusEnum = pgEnum('bank_connection_status', [
    'connected',
    'disconnected',
    'error',
    'pending',
    'expired'
]);

// Table: import_sessions
// Tracks bulk import operations
export const importSessions = pgTable('import_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(),
    
    // Session metadata
    session_name: varchar('session_name', { length: 255 }),
    import_source: importSourceEnum('import_source').notNull(),
    file_name: varchar('file_name', { length: 255 }),
    file_size: integer('file_size'), // bytes
    file_path: text('file_path'), // Temporary storage location
    
    // Format detection
    detected_format: varchar('detected_format', { length: 100 }),
    column_mappings: jsonb('column_mappings'), // {csv_column: field_name}
    date_format: varchar('date_format', { length: 50 }),
    currency: varchar('currency', { length: 3 }).default('USD'),
    
    // Processing state
    status: importStatusEnum('status').notNull().default('pending'),
    total_rows: integer('total_rows').default(0),
    rows_processed: integer('rows_processed').default(0),
    rows_imported: integer('rows_imported').default(0),
    rows_skipped: integer('rows_skipped').default(0),
    rows_failed: integer('rows_failed').default(0),
    
    // Match statistics
    auto_matched: integer('auto_matched').default(0),
    manual_review_needed: integer('manual_review_needed').default(0),
    duplicates_found: integer('duplicates_found').default(0),
    new_transactions: integer('new_transactions').default(0),
    
    // Processing details
    processing_started_at: timestamp('processing_started_at'),
    processing_completed_at: timestamp('processing_completed_at'),
    processing_duration_ms: integer('processing_duration_ms'),
    
    // Error handling
    error_message: text('error_message'),
    error_details: jsonb('error_details'),
    
    // Configuration
    auto_categorize: boolean('auto_categorize').default(true),
    auto_match: boolean('auto_match').default(true),
    skip_duplicates: boolean('skip_duplicates').default(true),
    
    // Metadata
    metadata: jsonb('metadata').default({}),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow()
});

// Table: import_records
// Individual records from an import session
export const importRecords = pgTable('import_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    session_id: uuid('session_id').notNull().references(() => importSessions.id, { onDelete: 'cascade' }),
    
    // Record position
    row_number: integer('row_number').notNull(),
    
    // Parsed data
    transaction_date: timestamp('transaction_date').notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    description: text('description'),
    merchant_name: varchar('merchant_name', { length: 255 }),
    category: varchar('category', { length: 100 }),
    account_name: varchar('account_name', { length: 255 }),
    reference_number: varchar('reference_number', { length: 100 }),
    
    // Matching results
    match_status: matchStatusEnum('match_status').notNull().default('pending'),
    matched_expense_id: uuid('matched_expense_id'),
    match_confidence: numeric('match_confidence', { precision: 5, 2 }), // 0-100
    match_reason: text('match_reason'),
    
    // Categorization
    suggested_category: varchar('suggested_category', { length: 100 }),
    categorization_confidence: numeric('categorization_confidence', { precision: 5, 2 }),
    
    // Duplicate detection
    is_duplicate: boolean('is_duplicate').default(false),
    duplicate_of_expense_id: uuid('duplicate_of_expense_id'),
    duplicate_score: numeric('duplicate_score', { precision: 5, 2 }),
    
    // Processing
    is_imported: boolean('is_imported').default(false),
    imported_expense_id: uuid('imported_expense_id'),
    import_error: text('import_error'),
    
    // Raw data
    raw_data: jsonb('raw_data'), // Original CSV row
    
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow()
});

// Table: reconciliation_matches
// Proposed matches between imported records and existing expenses
export const reconciliationMatches = pgTable('reconciliation_matches', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    session_id: uuid('session_id').notNull().references(() => importSessions.id, { onDelete: 'cascade' }),
    import_record_id: uuid('import_record_id').notNull().references(() => importRecords.id, { onDelete: 'cascade' }),
    
    // Match details
    existing_expense_id: uuid('existing_expense_id').notNull(),
    match_confidence: numeric('match_confidence', { precision: 5, 2 }).notNull(),
    
    // Matching criteria
    match_factors: jsonb('match_factors'), // {amount: true, date: true, merchant: true, ...}
    match_algorithm: varchar('match_algorithm', { length: 50 }), // 'exact', 'fuzzy', 'ml'
    
    // Match scores
    amount_similarity: numeric('amount_similarity', { precision: 5, 2 }),
    date_similarity: numeric('date_similarity', { precision: 5, 2 }),
    merchant_similarity: numeric('merchant_similarity', { precision: 5, 2 }),
    description_similarity: numeric('description_similarity', { precision: 5, 2 }),
    
    // Review state
    review_status: varchar('review_status', { length: 20 }).default('pending'), // pending, approved, rejected
    reviewed_by: uuid('reviewed_by'),
    reviewed_at: timestamp('reviewed_at'),
    
    // User action
    action_taken: reconciliationActionEnum('action_taken'),
    action_notes: text('action_notes'),
    
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow()
});

// Table: import_mappings
// Saved column mapping templates for future imports
export const importMappings = pgTable('import_mappings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(),
    
    // Template details
    template_name: varchar('template_name', { length: 255 }).notNull(),
    description: text('description'),
    
    // Source identification
    import_source: importSourceEnum('import_source').notNull(),
    bank_name: varchar('bank_name', { length: 255 }),
    account_type: varchar('account_type', { length: 50 }), // checking, credit_card, savings
    
    // Mapping configuration
    column_mappings: jsonb('column_mappings').notNull(), // {csv_column: field_name}
    header_row: integer('header_row').default(1),
    data_start_row: integer('data_start_row').default(2),
    
    // Format settings
    date_format: varchar('date_format', { length: 50 }),
    decimal_separator: varchar('decimal_separator', { length: 1 }).default('.'),
    thousands_separator: varchar('thousands_separator', { length: 1 }).default(','),
    currency: varchar('currency', { length: 3 }).default('USD'),
    
    // Processing rules
    skip_negative_amounts: boolean('skip_negative_amounts').default(false),
    invert_amounts: boolean('invert_amounts').default(false), // Some banks use negative for credits
    auto_categorize: boolean('auto_categorize').default(true),
    
    // Usage tracking
    usage_count: integer('usage_count').default(0),
    last_used_at: timestamp('last_used_at'),
    
    // State
    is_active: boolean('is_active').default(true),
    is_default: boolean('is_default').default(false),
    
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow()
});

// Table: bank_connections
// Connected bank accounts for automatic transaction sync
export const bankConnections = pgTable('bank_connections', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(),
    
    // Bank details
    bank_name: varchar('bank_name', { length: 255 }).notNull(),
    account_name: varchar('account_name', { length: 255 }).notNull(),
    account_type: varchar('account_type', { length: 50 }), // checking, credit_card, savings
    account_number_last4: varchar('account_number_last4', { length: 4 }),
    
    // Connection details
    connection_provider: varchar('connection_provider', { length: 50 }), // plaid, finicity, manual
    provider_account_id: varchar('provider_account_id', { length: 255 }),
    access_token: text('access_token'), // Encrypted
    refresh_token: text('refresh_token'), // Encrypted
    
    // Connection state
    status: bankConnectionStatusEnum('status').notNull().default('pending'),
    connection_error: text('connection_error'),
    
    // Sync configuration
    auto_sync_enabled: boolean('auto_sync_enabled').default(true),
    sync_frequency: varchar('sync_frequency', { length: 20 }).default('daily'), // hourly, daily, weekly
    last_sync_at: timestamp('last_sync_at'),
    next_sync_at: timestamp('next_sync_at'),
    sync_lookback_days: integer('sync_lookback_days').default(30),
    
    // Sync statistics
    total_syncs: integer('total_syncs').default(0),
    successful_syncs: integer('successful_syncs').default(0),
    failed_syncs: integer('failed_syncs').default(0),
    total_transactions_imported: integer('total_transactions_imported').default(0),
    
    // Processing rules
    import_mapping_id: uuid('import_mapping_id').references(() => importMappings.id),
    auto_categorize: boolean('auto_categorize').default(true),
    skip_duplicates: boolean('skip_duplicates').default(true),
    
    // Security
    consent_expires_at: timestamp('consent_expires_at'),
    requires_reauth: boolean('requires_reauth').default(false),
    
    // Metadata
    metadata: jsonb('metadata').default({}),
    
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow()
});

// Table: import_history
// Archive of completed import sessions for audit trail
export const importHistory = pgTable('import_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    session_id: uuid('session_id').notNull().references(() => importSessions.id, { onDelete: 'cascade' }),
    
    // Summary
    import_source: importSourceEnum('import_source').notNull(),
    total_rows: integer('total_rows').notNull(),
    rows_imported: integer('rows_imported').notNull(),
    rows_skipped: integer('rows_skipped').notNull(),
    
    // Duration
    processing_duration_ms: integer('processing_duration_ms'),
    
    // Results
    new_expenses_created: integer('new_expenses_created').default(0),
    existing_expenses_matched: integer('existing_expenses_matched').default(0),
    duplicates_skipped: integer('duplicates_skipped').default(0),
    
    // Financial impact
    total_amount_imported: numeric('total_amount_imported', { precision: 15, 2 }),
    
    // Metadata
    performed_by: uuid('performed_by').notNull(),
    summary: text('summary'),
    
    created_at: timestamp('created_at').notNull().defaultNow()
});

// Indexes for performance

// Import sessions
// CREATE INDEX idx_import_sessions_tenant_status ON import_sessions(tenant_id, status);
// CREATE INDEX idx_import_sessions_user ON import_sessions(user_id);
// CREATE INDEX idx_import_sessions_created ON import_sessions(created_at DESC);

// Import records
// CREATE INDEX idx_import_records_session ON import_records(session_id);
// CREATE INDEX idx_import_records_match_status ON import_records(match_status);
// CREATE INDEX idx_import_records_duplicate ON import_records(is_duplicate) WHERE is_duplicate = true;
// CREATE INDEX idx_import_records_imported ON import_records(is_imported);

// Reconciliation matches
// CREATE INDEX idx_reconciliation_session ON reconciliation_matches(session_id);
// CREATE INDEX idx_reconciliation_record ON reconciliation_matches(import_record_id);
// CREATE INDEX idx_reconciliation_expense ON reconciliation_matches(existing_expense_id);
// CREATE INDEX idx_reconciliation_review ON reconciliation_matches(review_status);

// Import mappings
// CREATE INDEX idx_import_mappings_tenant_user ON import_mappings(tenant_id, user_id);
// CREATE INDEX idx_import_mappings_active ON import_mappings(is_active) WHERE is_active = true;
// CREATE INDEX idx_import_mappings_default ON import_mappings(tenant_id) WHERE is_default = true;

// Bank connections
// CREATE INDEX idx_bank_connections_user ON bank_connections(user_id);
// CREATE INDEX idx_bank_connections_status ON bank_connections(status);
// CREATE INDEX idx_bank_connections_next_sync ON bank_connections(next_sync_at) WHERE auto_sync_enabled = true;

// Import history
// CREATE INDEX idx_import_history_tenant ON import_history(tenant_id);
// CREATE INDEX idx_import_history_session ON import_history(session_id);
// CREATE INDEX idx_import_history_created ON import_history(created_at DESC);
