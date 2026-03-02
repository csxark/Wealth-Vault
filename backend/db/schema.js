
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums for RBAC
export const tenantRoleEnum = pgEnum('tenant_role', ['owner', 'admin', 'manager', 'member', 'viewer']);

// Enums for advanced RBAC
export const rbacEntityTypeEnum = pgEnum('rbac_entity_type', ['role', 'permission', 'member_role', 'member_permission']);

// Enums for outbox and saga
export const outboxEventStatusEnum = pgEnum('outbox_event_status', ['pending', 'processing', 'published', 'failed', 'dead_letter']);
export const sagaStatusEnum = pgEnum('saga_status', ['started', 'step_completed', 'compensating', 'completed', 'failed']);
export const distributedTxStatusEnum = pgEnum('distributed_tx_status', ['started', 'prepared', 'committed', 'aborted', 'failed', 'timed_out']);

// Enums for service authentication
export const serviceStatusEnum = pgEnum('service_status', ['active', 'suspended', 'revoked']);
export const certificateStatusEnum = pgEnum('certificate_status', ['active', 'rotating', 'revoked', 'expired']);

// Tenants Table - Multi-tenancy support
export const tenants = pgTable('tenants', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(), // URL-friendly identifier
    description: text('description'),
    logo: text('logo'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
    status: text('status').default('active'), // active, suspended, deleted
    tier: text('tier').default('free'), // free, pro, enterprise
    maxMembers: integer('max_members').default(5),
    maxProjects: integer('max_projects').default(3),
    features: jsonb('features').default({
        ai: false,
        customReports: false,
        teamCollaboration: false,
        advancedAnalytics: false
    }),
    settings: jsonb('settings').default({
        currency: 'USD',
        timezone: 'UTC',
        language: 'en',
        theme: 'auto'
    }),
    metadata: jsonb('metadata').default({
        createdBy: 'system',
        lastModified: null,
        joinCode: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Tenant Members Table - Manage team members and roles
export const tenantMembers = pgTable('tenant_members', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: tenantRoleEnum('role').default('member'),
    permissions: jsonb('permissions').default([]), // Custom permissions override
    status: text('status').default('active'), // active, pending, invited, deleted
    inviteToken: text('invite_token'), // For pending invites
    inviteExpiresAt: timestamp('invite_expires_at'),
    joinedAt: timestamp('joined_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// RBAC Roles Table - Hierarchical role definitions per tenant
export const rbacRoles = pgTable('rbac_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    parentRoleId: uuid('parent_role_id'),
    isSystem: boolean('is_system').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// RBAC Permissions Table - Permission definitions per tenant
export const rbacPermissions = pgTable('rbac_permissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// RBAC Role Permissions - Role to permission mapping
export const rbacRolePermissions = pgTable('rbac_role_permissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id').references(() => rbacRoles.id, { onDelete: 'cascade' }).notNull(),
    permissionId: uuid('permission_id').references(() => rbacPermissions.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Member Role Assignments - Assign one or more RBAC roles to tenant members
export const tenantMemberRoles = pgTable('tenant_member_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantMemberId: uuid('tenant_member_id').references(() => tenantMembers.id, { onDelete: 'cascade' }).notNull(),
    roleId: uuid('role_id').references(() => rbacRoles.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// RBAC Audit Log - Track all changes to RBAC entities
export const rbacAuditLogs = pgTable('rbac_audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: rbacEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id'),
    changes: jsonb('changes').default({}),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Centralized Audit Logs - Tamper-evident activity logging for compliance and security
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    category: text('category').default('general'),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    method: text('method'),
    path: text('path'),
    statusCode: integer('status_code'),
    outcome: text('outcome').default('success'),
    severity: text('severity').default('low'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').default({}),
    changes: jsonb('changes').default({}),
    previousHash: text('previous_hash'),
    entryHash: text('entry_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Log Snapshots - Signed, timestamped log bundles for regulatory export
export const logSnapshots = pgTable('log_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').default('pending'), // pending, generating, completed, failed
    format: text('format').default('json'), // json, csv
    bundlePath: text('bundle_path'),
    checksum: text('checksum'),
    signature: text('signature'),
    recordCount: integer('record_count').default(0),
    fileSize: integer('file_size'),
    filters: jsonb('filters').default({}),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Log Volume Forecasts - Predictive modeling for log growth and capacity planning
export const logVolumeForecasts = pgTable('log_volume_forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    modelType: text('model_type').default('ensemble'), // linear_trend, exponential_smoothing, moving_average, ensemble
    forecastHorizonDays: integer('forecast_horizon_days').default(30),
    historicalDays: integer('historical_days').default(90),
    confidenceLevel: doublePrecision('confidence_level').default(0.95),
    predictions: jsonb('predictions').notNull(), // Array of daily predictions with dates, volumes, growth rates
    capacityPlanning: jsonb('capacity_planning').notNull(), // Storage needs, scaling recommendations
    dashboard: jsonb('dashboard').notNull(), // Visualization data for frontend
    accuracy: jsonb('accuracy').default({}), // Model accuracy metrics (MAE, RMSE, etc.)
    alertsTriggered: jsonb('alerts_triggered').default([]), // List of alerts generated from this forecast
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').default(true),
    expiresAt: timestamp('expires_at'), // When this forecast should be refreshed
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Log Volume Metrics - Historical log volume data for forecasting
export const logVolumeMetrics = pgTable('log_volume_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').notNull(), // Date for the metric (truncated to day)
    totalRecords: integer('total_records').notNull(),
    totalSizeBytes: integer('total_size_bytes').notNull(),
    categories: jsonb('categories').default({}), // Breakdown by log category
    sources: jsonb('sources').default({}), // Breakdown by log source
    severityLevels: jsonb('severity_levels').default({}), // Breakdown by severity
    compressionRatio: doublePrecision('compression_ratio'), // Current compression effectiveness
    retentionDays: integer('retention_days'), // Current retention policy
    storageTier: text('storage_tier').default('hot'), // hot, warm, cold, archive
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Capacity Alerts - Automated alerts for storage capacity issues
export const capacityAlerts = pgTable('capacity_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    forecastId: uuid('forecast_id').references(() => logVolumeForecasts.id, { onDelete: 'set null' }),
    alertType: text('alert_type').notNull(), // storage_warning, storage_critical, growth_rate_warning, growth_rate_critical
    severity: text('severity').notNull(), // warning, critical
    message: text('message').notNull(),
    data: jsonb('data').default({}), // Additional alert data (thresholds, predictions, etc.)
    status: text('status').default('active'), // active, acknowledged, resolved
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: timestamp('acknowledged_at'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Log Redaction Rules - Configurable field-level redaction for PII protection
export const logRedactionRules = pgTable('log_redaction_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    fieldPath: text('field_path').notNull(), // JSON path to the field (e.g., 'user.email', 'request.headers.authorization')
    redactionType: text('redaction_type').notNull(), // mask, hash, tokenize, remove
    fieldType: text('field_type'), // email, phone, ssn, credit_card, ip_address, name, address, custom
    pattern: text('pattern'), // Optional regex pattern for custom field detection
    priority: integer('priority').default(50), // 0-100, higher priority rules are applied first
    description: text('description'),
    isActive: boolean('is_active').default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

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
    emailVerified: boolean('email_verified').default(false),
    emailVerificationToken: text('email_verification_token'),
    emailVerificationExpires: timestamp('email_verification_expires'),
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
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
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
    version: integer('version').default(1).notNull(), // Optimistic locking version
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
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
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
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    title: text('title').notNull(),
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

// Goal Contribution Line Items - Immutable per-goal audit trail for precise progress
export const goalContributionLineItems = pgTable('goal_contribution_line_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    rawAmount: numeric('raw_amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD').notNull(),
    entryType: text('entry_type').default('contribution').notNull(), // contribution, adjustment, reconciliation
    description: text('description'),
    idempotencyKey: text('idempotency_key').unique(),
    sourceExpenseId: uuid('source_expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// GOAL CONTRIBUTION VOLATILITY SMOOTHER - Issue #713
// ============================================================================

// Goal Contribution Smoothing Configs - Configuration for contribution smoothing per user/goal
export const goalContributionSmoothingConfigs = pgTable('goal_contribution_smoothing_configs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    
    // Smoothing Parameters
    rollingWindowMonths: integer('rolling_window_months').default(3),
    smoothingFactor: numeric('smoothing_factor', { precision: 3, scale: 2 }).default('0.70'),
    varianceThresholdPercentage: numeric('variance_threshold_percentage', { precision: 5, scale: 2 }).default('25.00'),
    
    // Guardrails
    minContributionAmount: numeric('min_contribution_amount', { precision: 12, scale: 2 }).default('0'),
    maxContributionAmount: numeric('max_contribution_amount', { precision: 12, scale: 2 }),
    maxMonthOverMonthChangePct: numeric('max_month_over_month_change_pct', { precision: 5, scale: 2 }).default('30.00'),
    
    // Flags
    enableSmoothing: boolean('enable_smoothing').default(true),
    enableCashflowDetection: boolean('enable_cashflow_detection').default(true),
    requireManualOverride: boolean('require_manual_override').default(false),
    
    // Metadata
    lastCalculatedAt: timestamp('last_calculated_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Cashflow History - Rolling cashflow history for smoothing calculations
export const goalCashflowHistory = pgTable('goal_cashflow_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    
    // Cashflow Data
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').default('monthly'),
    
    // Financial Metrics
    totalIncome: numeric('total_income', { precision: 15, scale: 2 }).default('0').notNull(),
    totalExpenses: numeric('total_expenses', { precision: 15, scale: 2 }).default('0').notNull(),
    netCashflow: numeric('net_cashflow', { precision: 15, scale: 2 }).notNull(),
    discretionaryCashflow: numeric('discretionary_cashflow', { precision: 15, scale: 2 }),
    
    // Goal Contributions
    totalGoalContributions: numeric('total_goal_contributions', { precision: 15, scale: 2 }).default('0'),
    contributionCount: integer('contribution_count').default(0),
    
    // Volatility Metrics
    incomeVolatility: numeric('income_volatility', { precision: 5, scale: 2 }),
    expenseVolatility: numeric('expense_volatility', { precision: 5, scale: 2 }),
    cashflowVolatility: numeric('cashflow_volatility', { precision: 5, scale: 2 }),
    
    // Metadata
    dataSource: text('data_source').default('calculated'),
    isComplete: boolean('is_complete').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Goal Contribution Recommendations - Smoothed contribution recommendations
export const goalContributionRecommendations = pgTable('goal_contribution_recommendations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    configId: uuid('config_id').references(() => goalContributionSmoothingConfigs.id, { onDelete: 'set null' }),
    
    // Recommendation Period
    recommendationDate: timestamp('recommendation_date').notNull(),
    validFrom: timestamp('valid_from').notNull(),
    validUntil: timestamp('valid_until').notNull(),
    
    // Smoothed Recommendation
    rawCalculatedAmount: numeric('raw_calculated_amount', { precision: 12, scale: 2 }).notNull(),
    smoothedAmount: numeric('smoothed_amount', { precision: 12, scale: 2 }).notNull(),
    previousAmount: numeric('previous_amount', { precision: 12, scale: 2 }),
    amountChange: numeric('amount_change', { precision: 12, scale: 2 }),
    amountChangePercentage: numeric('amount_change_percentage', { precision: 5, scale: 2 }),
    
    // Variance Band
    varianceBandLower: numeric('variance_band_lower', { precision: 12, scale: 2 }).notNull(),
    varianceBandUpper: numeric('variance_band_upper', { precision: 12, scale: 2 }).notNull(),
    varianceBandPercentage: numeric('variance_band_percentage', { precision: 5, scale: 2 }).default('15.00'),
    
    // Confidence Metrics
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }).notNull(),
    confidenceLevel: text('confidence_level').notNull(),
    stabilityIndex: numeric('stability_index', { precision: 5, scale: 2 }),
    
    // Supporting Data
    rollingAvgCashflow: numeric('rolling_avg_cashflow', { precision: 12, scale: 2 }),
    rollingAvgContributions: numeric('rolling_avg_contributions', { precision: 12, scale: 2 }),
    cashflowTrend: text('cashflow_trend'),
    majorCashflowShiftDetected: boolean('major_cashflow_shift_detected').default(false),
    
    // Recommendation Status
    status: text('status').default('pending'),
    userFeedback: text('user_feedback'),
    overrideAmount: numeric('override_amount', { precision: 12, scale: 2 }),
    overrideReason: text('override_reason'),
    
    // Metadata
    algorithmVersion: text('algorithm_version').default('v1.0'),
    calculationMetadata: jsonb('calculation_metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    acceptedAt: timestamp('accepted_at'),
});

// Goal Cashflow Events - Major cashflow shifts that trigger recalculation
export const goalCashflowEvents = pgTable('goal_cashflow_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    
    // Event Details
    eventType: text('event_type').notNull(),
    detectedAt: timestamp('detected_at').notNull(),
    eventDate: timestamp('event_date').notNull(),
    severity: text('severity').notNull(),
    
    // Event Metrics
    previousAvgValue: numeric('previous_avg_value', { precision: 12, scale: 2 }),
    newValue: numeric('new_value', { precision: 12, scale: 2 }),
    percentageChange: numeric('percentage_change', { precision: 5, scale: 2 }),
    deviationFromNorm: numeric('deviation_from_norm', { precision: 5, scale: 2 }),
    
    // Impact on Goals
    affectedGoalIds: jsonb('affected_goal_ids').default([]),
    recommendationInvalidated: boolean('recommendation_invalidated').default(false),
    
    // Event Resolution
    acknowledged: boolean('acknowledged').default(false),
    acknowledgedAt: timestamp('acknowledged_at'),
    requiresUserAction: boolean('requires_user_action').default(false),
    resolved: boolean('resolved').default(false),
    resolvedAt: timestamp('resolved_at'),
    
    // Metadata
    description: text('description'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// GOAL ADJUSTMENT EXPLAINABILITY TIMELINE - Issue #715
// ============================================================================

// Goal Adjustment Explanations - Logs every significant change to contribution recommendations with detailed reasons
export const goalAdjustmentExplanations = pgTable('goal_adjustment_explanations', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Recommendation reference
    previousRecommendationId: uuid('previous_recommendation_id').references(() => goalContributionRecommendations.id, { onDelete: 'set null' }),
    newRecommendationId: uuid('new_recommendation_id').references(() => goalContributionRecommendations.id, { onDelete: 'cascade' }).notNull(),
    
    // Change details
    previousAmount: numeric('previous_amount', { precision: 12, scale: 2 }).notNull(),
    newAmount: numeric('new_amount', { precision: 12, scale: 2 }).notNull(),
    amountChange: numeric('amount_change', { precision: 12, scale: 2 }).notNull(),
    amountChangePercentage: numeric('amount_change_percentage', { precision: 5, scale: 2 }).notNull(),
    
    // Attribution Factors - Why did the recommendation change?
    attributionFactors: jsonb('attribution_factors').default({}), // Array of {factor, description, impact_pct, severity}
    
    // Primary drivers
    incomeDelta: numeric('income_delta', { precision: 12, scale: 2 }),
    incomeDeltaPct: numeric('income_delta_pct', { precision: 5, scale: 2 }),
    incomeContext: text('income_context'),
    
    expenseDelta: numeric('expense_delta', { precision: 12, scale: 2 }),
    expenseDeltaPct: numeric('expense_delta_pct', { precision: 5, scale: 2 }),
    expenseContext: text('expense_context'),
    
    // Temporal drivers
    daysToDeadline: integer('days_to_deadline'),
    deadlinePressureScore: numeric('deadline_pressure_score', { precision: 3, scale: 2 }), // 0.0 to 1.0
    deadlinePressureReason: text('deadline_pressure_reason'),
    
    // Priority/Goal drivers
    priorityShift: integer('priority_shift'), // Change in priority score
    priorityContext: text('priority_context'),
    goalProgressPct: numeric('goal_progress_pct', { precision: 5, scale: 2 }),
    goalRemainingDays: integer('goal_remaining_days'),
    
    // Confidence and stability
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }).notNull(), // 0.0 to 1.0
    confidenceLevel: text('confidence_level').notNull(), // low, medium, high
    stabilityIndex: numeric('stability_index', { precision: 5, scale: 2 }),
    
    // User behavior context
    recentContributionHistory: jsonb('recent_contribution_history').default({}), // Last 6 months contributions
    volatilityTrend: text('volatility_trend'), // increasing, stable, decreasing
    
    // Market/Economic context
    macroFactors: jsonb('macro_factors').default({}), // Interest rates, inflation, market conditions
    externalContext: text('external_context'),
    
    // Human-readable explanation
    summary: text('summary').notNull(), // "Why changed" in plain language
    detailedExplanation: text('detailed_explanation'), // Longer form explanation
    recommendationText: text('recommendation_text'), // Action recommendation to user
    
    // Event classification
    eventType: text('event_type').notNull().default('adjustment'), // 'adjustment', 'reset', 'goal_completion_adjustment'
    severity: text('severity').notNull().default('normal'), // 'critical', 'high', 'normal', 'minor'
    
    // Approval/Review tracking
    requiresReview: boolean('requires_review').default(false),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewStatus: text('review_status').default('pending'), // pending, approved, flagged, dismissed
    reviewNotes: text('review_notes'),
    reviewedAt: timestamp('reviewed_at'),
    
    // User response tracking
    userAcknowledged: boolean('user_acknowledged').default(false),
    acknowledgedAt: timestamp('acknowledged_at'),
    userFeedback: text('user_feedback'),
    userFeedbackType: text('user_feedback_type'), // understood, confused, disagree_too_high, disagree_too_low
    
    // Metadata
    algorithmVersion: text('algorithm_version').default('v1.0'),
    triggerSource: text('trigger_source').notNull(), // 'cashflow_change', 'goal_progress_update', 'priority_shift', 'manual_override', 'system_rebalance'
    calculationMetadata: jsonb('calculation_metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Adjustment Attribution Details - Detailed attribution showing which factors contributed to the change
export const goalAdjustmentAttributionDetails = pgTable('goal_adjustment_attribution_details', {
    id: uuid('id').defaultRandom().primaryKey(),
    explanationId: uuid('explanation_id').references(() => goalAdjustmentExplanations.id, { onDelete: 'cascade' }).notNull(),
    
    // Factor information
    factorCategory: text('factor_category').notNull(), // 'income', 'expense', 'deadline', 'priority', 'cashflow', 'macro', 'user_behavior'
    factorName: text('factor_name').notNull(), // Specific factor name
    factorDescription: text('factor_description').notNull(), // Human-readable description
    
    // Attribution impact
    impactPercentage: numeric('impact_percentage', { precision: 5, scale: 2 }).notNull(), // % contribution to the change
    impactAmount: numeric('impact_amount', { precision: 12, scale: 2 }), // Absolute dollar impact
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }), // 0.0 to 1.0
    
    // Metric values
    previousValue: numeric('previous_value', { precision: 18, scale: 4 }),
    currentValue: numeric('current_value', { precision: 18, scale: 4 }),
    thresholdValue: numeric('threshold_value', { precision: 18, scale: 4 }),
    
    // Context details
    comparisonText: text('comparison_text'), // e.g., "Income increased by 15% vs Aug average"
    severityIndicator: text('severity_indicator'), // 'critical_change','significant_change', 'moderate_change', 'minor_change'
    
    // Related data
    metricSource: text('metric_source'), // 'cashflow_analysis', 'goal_progress', 'calendar_countdown', 'priority_engine', 'macro_feed'
    dataLookbackDays: integer('data_lookback_days'), // How far back data was analyzed
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Goal Adjustment Timeline - Immutable timeline of all adjustments for audit and historical analysis
export const goalAdjustmentTimeline = pgTable('goal_adjustment_timeline', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Timeline event
    eventDate: timestamp('event_date').notNull().defaultNow(),
    eventSequence: integer('event_sequence').notNull(), // Chronological order
    
    // Reference to detailed explanation
    explanationId: uuid('explanation_id').references(() => goalAdjustmentExplanations.id, { onDelete: 'cascade' }).notNull(),
    
    // Summary snapshot
    previousRecommendationAmount: numeric('previous_recommendation_amount', { precision: 12, scale: 2 }).notNull(),
    newRecommendationAmount: numeric('new_recommendation_amount', { precision: 12, scale: 2 }).notNull(),
    primaryDriverFactor: text('primary_driver_factor').notNull(), // top factor that drove change
    
    // User interaction tracking
    userViewed: boolean('user_viewed').default(false),
    userViewedAt: timestamp('user_viewed_at'),
    userInteracted: boolean('user_interacted').default(false),
    userInteractionType: text('user_interaction_type'), // 'acknowledged', 'dismissed', 'requested_adjustment', 'flagged_unclear'
    userInteractionAt: timestamp('user_interaction_at'),
    
    // Engagement metric
    engagementScore: integer('engagement_score').default(0), // Points for user engagement with explanation
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Goal Adjustment Insights - Pre-computed insights for dashboard display
export const goalAdjustmentInsights = pgTable('goal_adjustment_insights', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Most common adjustment drivers
    topFactors: jsonb('top_factors').default({}), // [{factor, count, avg_impact_pct}, ...]
    
    // Volatility analysis
    adjustmentFrequency: text('adjustment_frequency').notNull(), // 'very_stable', 'stable', 'volatile', 'very_volatile'
    adjustmentsLast30Days: integer('adjustments_last_30_days').default(0),
    avgDaysBetweenAdjustments: numeric('avg_days_between_adjustments', { precision: 10, scale: 2 }),
    
    // Trend analysis
    trend: text('trend').notNull(), // 'increasing_recommendations', 'decreasing_recommendations', 'stable'
    trendDirection: integer('trend_direction').default(0), // -1, 0, +1
    
    // Trust score
    userTrustScore: numeric('user_trust_score', { precision: 3, scale: 2 }).default('0.5'), // Based on user feedback and engagement
    clarityScore: numeric('clarity_score', { precision: 3, scale: 2 }).default('0.5'), // Based on user understanding (engagement metrics)
    
    // Recommendations for improvement
    improvementAreas: jsonb('improvement_areas').default([]), // Areas where explanations could be clearer
    
    lastCalculatedAt: timestamp('last_calculated_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Goal Adjustment Comparison - Store comparisons between predicted and actual recommendation changes
export const goalAdjustmentComparison = pgTable('goal_adjustment_comparison', {
    id: uuid('id').defaultRandom().primaryKey(),
    explanationId: uuid('explanation_id').references(() => goalAdjustmentExplanations.id, { onDelete: 'cascade' }).notNull(),
    
    // Model prediction vs actual
    predictedAdjustmentAmount: numeric('predicted_adjustment_amount', { precision: 12, scale: 2 }),
    actualAdjustmentAmount: numeric('actual_adjustment_amount', { precision: 12, scale: 2 }),
    predictionAccuracyScore: numeric('prediction_accuracy_score', { precision: 3, scale: 2 }), // 0-1
    
    // Contributing factors comparison
    predictedTopFactors: jsonb('predicted_top_factors'),
    actualTopFactors: jsonb('actual_top_factors'),
    factorAccuracyMatch: numeric('factor_accuracy_match', { precision: 3, scale: 2 }), // % of predicted factors that were actual
    
    // Model version
    modelVersion: text('model_version'),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// MULTI-GOAL BUDGET GUARDRAIL OPTIMIZER - Issue #714
// ============================================================================

// Budget Guardrail Policies - Define minimum essential expense coverage
export const budgetGuardrailPolicies = pgTable('budget_guardrail_policies', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    
    // Policy Configuration
    policyName: text('policy_name').notNull(),
    description: text('description'),
    
    // Essential Expense Definition
    protectedCategoryIds: jsonb('protected_category_ids').default([]),
    minimumMonthlyLivingCost: numeric('minimum_monthly_living_cost', { precision: 12, scale: 2 }).notNull(),
    livingCostCalculationMethod: text('living_cost_calculation_method').default('manual'),
    
    // Historical calculation parameters
    historicalLookbackMonths: integer('historical_lookback_months').default(6),
    percentileThreshold: numeric('percentile_threshold', { precision: 3, scale: 2 }).default('0.75'),
    
    // Buffer & Safety Settings
    safetyBufferPercentage: numeric('safety_buffer_percentage', { precision: 5, scale: 2 }).default('15.00'),
    includeEmergencyFundContribution: boolean('include_emergency_fund_contribution').default(true),
    emergencyFundTargetMonths: integer('emergency_fund_target_months').default(3),
    
    // Goal Allocation Caps
    maxGoalAllocationPercentage: numeric('max_goal_allocation_percentage', { precision: 5, scale: 2 }).default('50.00'),
    priorityGoalIds: jsonb('priority_goal_ids').default([]),
    
    // Enforcement Flags
    isActive: boolean('is_active').default(true),
    enforceStrictly: boolean('enforce_strictly').default(true),
    allowOverride: boolean('allow_override').default(false),
    overrideRequireApproval: boolean('override_require_approval').default(true),
    
    // Metadata
    lastCalculatedAt: timestamp('last_calculated_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Safe Allocation Calculations - Store calculated safe-to-allocate amounts
export const safeAllocationCalculations = pgTable('safe_allocation_calculations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id').references(() => budgetGuardrailPolicies.id, { onDelete: 'cascade' }).notNull(),
    
    // Calculation Period
    calculationDate: timestamp('calculation_date').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').default('monthly'),
    
    // Income & Essential Expenses Breakdown
    projectedIncome: numeric('projected_income', { precision: 15, scale: 2 }).notNull(),
    projectedEssentialExpenses: numeric('projected_essential_expenses', { precision: 12, scale: 2 }).notNull(),
    essentialExpenseBreakdown: jsonb('essential_expense_breakdown').default({}),
    
    // Safety Considerations
    safetyBufferAmount: numeric('safety_buffer_amount', { precision: 12, scale: 2 }).notNull(),
    emergencyFundContribution: numeric('emergency_fund_contribution', { precision: 12, scale: 2 }).default('0'),
    discretionaryMinimum: numeric('discretionary_minimum', { precision: 12, scale: 2 }),
    
    // Allocation Limits
    safeToAllocateAmount: numeric('safe_to_allocate_amount', { precision: 12, scale: 2 }).notNull(),
    safeToAllocatePercentage: numeric('safe_to_allocate_percentage', { precision: 5, scale: 2 }).notNull(),
    
    // Goal Caps Per Goal
    goalAllocationLimits: jsonb('goal_allocation_limits').notNull(),
    
    // Confidence & Coverage
    confidenceLevel: text('confidence_level'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
    coverageStatus: text('coverage_status').notNull(),
    
    // Recommendations
    recommendations: jsonb('recommendations').default([]),
    
    // Metadata
    dataQuality: jsonb('data_quality').default({}),
    calculationMetadata: jsonb('calculation_metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Guardrail Allocations - Track allocations made with guardrail enforcement
export const guardrailAllocations = pgTable('guardrail_allocations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id').references(() => budgetGuardrailPolicies.id, { onDelete: 'cascade' }).notNull(),
    calculationId: uuid('calculation_id').references(() => safeAllocationCalculations.id, { onDelete: 'cascade' }).notNull(),
    
    // Goal Allocation
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Requested vs. Approved
    requestedAmount: numeric('requested_amount', { precision: 12, scale: 2 }).notNull(),
    approvedAmount: numeric('approved_amount', { precision: 12, scale: 2 }).notNull(),
    guardrailReducedAmount: numeric('guardrail_reduced_amount', { precision: 12, scale: 2 }),
    reductionReason: text('reduction_reason'),
    
    // Allocation Details
    allocationDate: timestamp('allocation_date').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    
    // Status & Approval
    status: text('status').default('pending'),
    approvalStatus: text('approval_status'),
    
    // Override Information
    overridden: boolean('overridden').default(false),
    overrideApprovedBy: uuid('override_approved_by').references(() => users.id, { onDelete: 'set null' }),
    overrideApprovedAt: timestamp('override_approved_at'),
    overrideReason: text('override_reason'),
    
    // Implementation
    allocatedAt: timestamp('allocated_at'),
    actualAllocatedAmount: numeric('actual_allocated_amount', { precision: 12, scale: 2 }),
    
    // Metadata
    complianceNotes: text('compliance_notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Guardrail Violations - Track instances where allocations would violate guardrails
export const guardrailViolations = pgTable('guardrail_violations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id').references(() => budgetGuardrailPolicies.id, { onDelete: 'cascade' }).notNull(),
    allocationId: uuid('allocation_id').references(() => guardrailAllocations.id, { onDelete: 'set null' }),
    
    // Violation Details
    violationType: text('violation_type').notNull(),
    severity: text('severity').notNull(),
    
    // Calculation Details
    thresholdValue: numeric('threshold_value', { precision: 12, scale: 2 }).notNull(),
    actualValue: numeric('actual_value', { precision: 12, scale: 2 }).notNull(),
    shortfallAmount: numeric('shortfall_amount', { precision: 12, scale: 2 }),
    shortfallPercentage: numeric('shortfall_percentage', { precision: 5, scale: 2 }),
    
    // Detection
    detectedAt: timestamp('detected_at').notNull(),
    violationDate: timestamp('violation_date').notNull(),
    
    // Resolution
    resolved: boolean('resolved').default(false),
    resolvedAt: timestamp('resolved_at'),
    resolutionAction: text('resolution_action'),
    
    // Context
    affectedCategories: jsonb('affected_categories').default([]),
    affectedGoals: jsonb('affected_goals').default([]),
    recommendedAction: text('recommended_action'),
    
    // Metadata
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Guardrail Compliance Snapshots - Track compliance over time
export const guardrailComplianceSnapshots = pgTable('guardrail_compliance_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id').references(() => budgetGuardrailPolicies.id, { onDelete: 'cascade' }).notNull(),
    
    // Period
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').default('monthly'),
    
    // Compliance Status
    wasCompliant: boolean('was_compliant').notNull(),
    compliancePercentage: numeric('compliance_percentage', { precision: 5, scale: 2 }),
    violationsCount: integer('violations_count').default(0),
    criticalViolationsCount: integer('critical_violations_count').default(0),
    
    // Financial Summary
    actualIncome: numeric('actual_income', { precision: 15, scale: 2 }),
    actualEssentialExpenses: numeric('actual_essential_expenses', { precision: 12, scale: 2 }),
    actualGoalAllocations: numeric('actual_goal_allocations', { precision: 12, scale: 2 }),
    actualDiscretionary: numeric('actual_discretionary', { precision: 12, scale: 2 }),
    
    // vs. Expected
    varianceFromExpected: jsonb('variance_from_expected').default({}),
    
    // Health Score
    guardrailHealthScore: numeric('guardrail_health_score', { precision: 5, scale: 2 }),
    trend: text('trend'),
    
    // Metadata
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Device Sessions Table for token management
export const deviceSessions = pgTable('device_sessions', {
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

// Outbox Events Table - Transactional outbox pattern for reliable event publishing
export const outboxEvents = pgTable('outbox_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    aggregateType: text('aggregate_type').notNull(), // tenant, user, expense, goal, etc.
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(), // tenant.created, user.invited, expense.created, etc.
    payload: jsonb('payload').notNull().default({}),
    metadata: jsonb('metadata').default({}),
    status: outboxEventStatusEnum('status').default('pending'),
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at'),
    publishedAt: timestamp('published_at'),
    // Row-level locking fields to prevent duplicate processing
    processingBy: text('processing_by'), // Worker ID processing this event
    processingStartedAt: timestamp('processing_started_at'), // When processing started (for heartbeat timeout)
    lastHeartbeat: timestamp('last_heartbeat'), // Last heartbeat from processing worker
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Saga Instances Table - Track long-running distributed transactions
export const sagaInstances = pgTable('saga_instances', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    sagaType: text('saga_type').notNull(), // tenant_onboarding, member_invitation, billing_payment, etc.
    correlationId: uuid('correlation_id').notNull().unique(),
    status: sagaStatusEnum('status').default('started'),
    currentStep: text('current_step'),
    stepIndex: integer('step_index').default(0),
    totalSteps: integer('total_steps').notNull(),
    payload: jsonb('payload').notNull().default({}),
    stepResults: jsonb('step_results').default([]),
    compensationData: jsonb('compensation_data').default({}),
    error: text('error'),
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Saga Step Executions Table - Track individual step execution history
export const sagaStepExecutions = pgTable('saga_step_executions', {
    id: uuid('id').defaultRandom().primaryKey(),
    sagaInstanceId: uuid('saga_instance_id').references(() => sagaInstances.id, { onDelete: 'cascade' }).notNull(),
    stepName: text('step_name').notNull(),
    stepIndex: integer('step_index').notNull(),
    status: text('status').notNull(), // started, completed, failed, compensating, compensated
    input: jsonb('input').default({}),
    output: jsonb('output').default({}),
    error: text('error'),
    compensated: boolean('compensated').default(false),
    retryCount: integer('retry_count').default(0),
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    compensatedAt: timestamp('compensated_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Idempotency Keys Table - Prevent duplicate financial operation execution
export const idempotencyKeys = pgTable('idempotency_keys', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    requestHash: text('request_hash'),
    status: text('status').default('processing'), // processing, completed, failed
    responseCode: integer('response_code'),
    responseBody: jsonb('response_body').default({}),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Distributed Transaction Logs - Track 2PC-like lifecycle for financial operations
export const distributedTransactionLogs = pgTable('distributed_transaction_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    transactionType: text('transaction_type').notNull(),
    operationKey: text('operation_key').notNull().unique(),
    sagaInstanceId: uuid('saga_instance_id').references(() => sagaInstances.id, { onDelete: 'set null' }),
    status: distributedTxStatusEnum('status').default('started'),
    phase: text('phase').default('init'), // init, prepare, commit, abort
    timeoutAt: timestamp('timeout_at'),
    lastError: text('last_error'),
    payload: jsonb('payload').default({}),
    result: jsonb('result').default({}),
    recoveryRequired: boolean('recovery_required').default(false),
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Service Identities Table - Machine identities for internal services
export const serviceIdentities = pgTable('service_identities', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceName: text('service_name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    serviceType: text('service_type').notNull(), // api, worker, scheduler, external
    status: serviceStatusEnum('status').default('active'),
    allowedScopes: jsonb('allowed_scopes').default([]).notNull(), // e.g., ['read:tenant', 'write:audit']
    metadata: jsonb('metadata').default({}),
    lastAuthAt: timestamp('last_auth_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Service Certificates Table - mTLS certificates for services
export const serviceCertificates = pgTable('service_certificates', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id').references(() => serviceIdentities.id, { onDelete: 'cascade' }).notNull(),
    certificateId: text('certificate_id').notNull().unique(), // Unique identifier for the cert
    serialNumber: text('serial_number').notNull().unique(),
    fingerprint: text('fingerprint').notNull().unique(), // SHA-256 fingerprint
    publicKey: text('public_key').notNull(), // PEM format
    privateKey: text('private_key'), // Encrypted PEM format (only stored if managed internally)
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    status: certificateStatusEnum('status').default('active'),
    notBefore: timestamp('not_before').notNull(),
    notAfter: timestamp('not_after').notNull(),
    rotationScheduledAt: timestamp('rotation_scheduled_at'),
    revokedAt: timestamp('revoked_at'),
    revokedReason: text('revoked_reason'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Service Auth Logs Table - Audit trail for service authentication attempts
export const serviceAuthLogs = pgTable('service_auth_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id').references(() => serviceIdentities.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    certificateId: text('certificate_id'),
    authMethod: text('auth_method').notNull(), // mtls, jwt, mtls+jwt
    outcome: text('outcome').notNull(), // success, failure
    failureReason: text('failure_reason'),
    requestedScopes: jsonb('requested_scopes').default([]),
    grantedScopes: jsonb('granted_scopes').default([]),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Budget Alerts Table - Track budget alert thresholds and configurations
export const budgetAlerts = pgTable('budget_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    alertType: text('alert_type').notNull(), // 'threshold', 'daily_limit', 'weekly_limit', 'monthly_budget'
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(), // Alert triggers at this amount
    thresholdPercentage: numeric('threshold_percentage', { precision: 5, scale: 2 }).default('80'), // Or percentage of budget
    scope: text('scope').default('monthly'), // 'daily', 'weekly', 'monthly', 'yearly'
    isActive: boolean('is_active').default(true),
    notificationChannels: jsonb('notification_channels').default(['email', 'in-app']), // Channels to notify
    metadata: jsonb('metadata').default({
        lastTriggeredAt: null,
        triggerCount: 0,
        createdReason: 'user_configured'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Budget Aggregates Table - Materialized view data with version control for race condition prevention
export const budgetAggregates = pgTable('budget_aggregates', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    period: text('period').notNull(), // 'daily', 'weekly', 'monthly', 'yearly'
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    totalSpent: numeric('total_spent', { precision: 12, scale: 2 }).default('0').notNull(),
    totalCount: integer('total_count').default(0).notNull(),
    averageTransaction: numeric('average_transaction', { precision: 12, scale: 2 }).default('0'),
    maxTransaction: numeric('max_transaction', { precision: 12, scale: 2 }).default('0'),
    minTransaction: numeric('min_transaction', { precision: 12, scale: 2 }).default('0'),
    version: integer('version').default(1).notNull(), // Optimistic locking version
    // Isolation level and consistency tracking
    isolationLevel: text('isolation_level').default('read_committed'), // read_committed, serializable
    computedAt: timestamp('computed_at').defaultNow(),
    refreshedAt: timestamp('refreshed_at'),
    nextRefreshAt: timestamp('next_refresh_at'),
    isStale: boolean('is_stale').default(false),
    metadata: jsonb('metadata').default({
        sourceCount: 0,
        lastEventId: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Alert Deduplication Table - Prevent duplicate alert firings using event-driven deduplication
export const alertDeduplication = pgTable('alert_deduplication', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    budgetAlertId: uuid('budget_alert_id').references(() => budgetAlerts.id, { onDelete: 'cascade' }).notNull(),
    deduplicationKey: text('deduplication_key').notNull(), // hash of alert trigger conditions
    lastFiredAt: timestamp('last_fired_at'),
    fireCount: integer('fire_count').default(0),
    isActive: boolean('is_active').default(true),
    // TTL for deduplication window - prevents duplicate alerts within certain timeframe
    deduplicationWindowMs: integer('deduplication_window_ms').default(3600000), // 1 hour default
    expiresAt: timestamp('expires_at').notNull(), // When this deduplication entry expires
    metadata: jsonb('metadata').default({
        reason: null,
        suppressedCount: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    ownedTenants: many(tenants),
    tenantMembers: many(tenantMembers),
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    goalContributionLineItems: many(goalContributionLineItems),
    deviceSessions: many(deviceSessions),
    rbacAuditLogs: many(rbacAuditLogs),
    auditLogs: many(auditLogs),
    budgetAlerts: many(budgetAlerts),
    budgetAggregates: many(budgetAggregates),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
    owner: one(users, {
        fields: [tenants.ownerId],
        references: [users.id],
    }),
    members: many(tenantMembers),
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    goalContributionLineItems: many(goalContributionLineItems),
    rbacRoles: many(rbacRoles),
    rbacPermissions: many(rbacPermissions),
    rbacAuditLogs: many(rbacAuditLogs),
    auditLogs: many(auditLogs),
    logSnapshots: many(logSnapshots),
    logVolumeForecasts: many(logVolumeForecasts),
    logVolumeMetrics: many(logVolumeMetrics),
    capacityAlerts: many(capacityAlerts),
    budgetAlerts: many(budgetAlerts),
    budgetAggregates: many(budgetAggregates),
    alertDeduplication: many(alertDeduplication),
}));

export const tenantMembersRelations = relations(tenantMembers, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [tenantMembers.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [tenantMembers.userId],
        references: [users.id],
    }),
    memberRoles: many(tenantMemberRoles),
}));

export const rbacRolesRelations = relations(rbacRoles, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [rbacRoles.tenantId],
        references: [tenants.id],
    }),
    parentRole: one(rbacRoles, {
        fields: [rbacRoles.parentRoleId],
        references: [rbacRoles.id],
        relationName: 'rbac_role_hierarchy'
    }),
    childRoles: many(rbacRoles, {
        relationName: 'rbac_role_hierarchy'
    }),
    rolePermissions: many(rbacRolePermissions),
    memberRoles: many(tenantMemberRoles),
}));

export const rbacPermissionsRelations = relations(rbacPermissions, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [rbacPermissions.tenantId],
        references: [tenants.id],
    }),
    rolePermissions: many(rbacRolePermissions),
}));

export const rbacRolePermissionsRelations = relations(rbacRolePermissions, ({ one }) => ({
    role: one(rbacRoles, {
        fields: [rbacRolePermissions.roleId],
        references: [rbacRoles.id],
    }),
    permission: one(rbacPermissions, {
        fields: [rbacRolePermissions.permissionId],
        references: [rbacPermissions.id],
    }),
}));

export const tenantMemberRolesRelations = relations(tenantMemberRoles, ({ one }) => ({
    tenantMember: one(tenantMembers, {
        fields: [tenantMemberRoles.tenantMemberId],
        references: [tenantMembers.id],
    }),
    role: one(rbacRoles, {
        fields: [tenantMemberRoles.roleId],
        references: [rbacRoles.id],
    }),
}));

export const rbacAuditLogsRelations = relations(rbacAuditLogs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [rbacAuditLogs.tenantId],
        references: [tenants.id],
    }),
    actor: one(users, {
        fields: [rbacAuditLogs.actorUserId],
        references: [users.id],
    }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [auditLogs.tenantId],
        references: [tenants.id],
    }),
    actor: one(users, {
        fields: [auditLogs.actorUserId],
        references: [users.id],
    }),
}));

export const logSnapshotsRelations = relations(logSnapshots, ({ one }) => ({
    tenant: one(tenants, {
        fields: [logSnapshots.tenantId],
        references: [tenants.id],
    }),
    requester: one(users, {
        fields: [logSnapshots.requestedBy],
        references: [users.id],
    }),
}));

export const logVolumeForecastsRelations = relations(logVolumeForecasts, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [logVolumeForecasts.tenantId],
        references: [tenants.id],
    }),
    generator: one(users, {
        fields: [logVolumeForecasts.generatedBy],
        references: [users.id],
    }),
    alerts: many(capacityAlerts),
}));

export const logVolumeMetricsRelations = relations(logVolumeMetrics, ({ one }) => ({
    tenant: one(tenants, {
        fields: [logVolumeMetrics.tenantId],
        references: [tenants.id],
    }),
}));

export const capacityAlertsRelations = relations(capacityAlerts, ({ one }) => ({
    tenant: one(tenants, {
        fields: [capacityAlerts.tenantId],
        references: [tenants.id],
    }),
    forecast: one(logVolumeForecasts, {
        fields: [capacityAlerts.forecastId],
        references: [logVolumeForecasts.id],
    }),
    acknowledger: one(users, {
        fields: [capacityAlerts.acknowledgedBy],
        references: [users.id],
    }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [categories.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [categories.userId],
        references: [users.id],
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
    expenses: many(expenses),
    goals: many(goals),
    budgetAlerts: many(budgetAlerts),
    budgetAggregates: many(budgetAggregates),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    tenant: one(tenants, {
        fields: [expenses.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [expenses.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [expenses.categoryId],
        references: [categories.id],
    }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goals.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [goals.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [goals.categoryId],
        references: [categories.id],
    }),
}));

export const goalContributionLineItemsRelations = relations(goalContributionLineItems, ({ one }) => ({
    goal: one(goals, {
        fields: [goalContributionLineItems.goalId],
        references: [goals.id],
    }),
    tenant: one(tenants, {
        fields: [goalContributionLineItems.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [goalContributionLineItems.userId],
        references: [users.id],
    }),
    sourceExpense: one(expenses, {
        fields: [goalContributionLineItems.sourceExpenseId],
        references: [expenses.id],
    }),
}));

// Relations for Goal Contribution Volatility Smoother - Issue #713
export const goalContributionSmoothingConfigsRelations = relations(goalContributionSmoothingConfigs, ({ one, many }) => ({
    user: one(users, {
        fields: [goalContributionSmoothingConfigs.userId],
        references: [users.id],
    }),
    goal: one(goals, {
        fields: [goalContributionSmoothingConfigs.goalId],
        references: [goals.id],
    }),
    vault: one(vaults, {
        fields: [goalContributionSmoothingConfigs.vaultId],
        references: [vaults.id],
    }),
    recommendations: many(goalContributionRecommendations),
}));

export const goalCashflowHistoryRelations = relations(goalCashflowHistory, ({ one }) => ({
    user: one(users, {
        fields: [goalCashflowHistory.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalCashflowHistory.vaultId],
        references: [vaults.id],
    }),
}));

export const goalContributionRecommendationsRelations = relations(goalContributionRecommendations, ({ one }) => ({
    user: one(users, {
        fields: [goalContributionRecommendations.userId],
        references: [users.id],
    }),
    goal: one(goals, {
        fields: [goalContributionRecommendations.goalId],
        references: [goals.id],
    }),
    vault: one(vaults, {
        fields: [goalContributionRecommendations.vaultId],
        references: [vaults.id],
    }),
    config: one(goalContributionSmoothingConfigs, {
        fields: [goalContributionRecommendations.configId],
        references: [goalContributionSmoothingConfigs.id],
    }),
}));

export const goalCashflowEventsRelations = relations(goalCashflowEvents, ({ one }) => ({
    user: one(users, {
        fields: [goalCashflowEvents.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalCashflowEvents.vaultId],
        references: [vaults.id],
    }),
}));

// Relations for Goal Adjustment Explainability Timeline - Issue #715
export const goalAdjustmentExplanationsRelations = relations(goalAdjustmentExplanations, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [goalAdjustmentExplanations.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [goalAdjustmentExplanations.userId],
        references: [users.id],
    }),
    goal: one(goals, {
        fields: [goalAdjustmentExplanations.goalId],
        references: [goals.id],
    }),
    previousRecommendation: one(goalContributionRecommendations, {
        fields: [goalAdjustmentExplanations.previousRecommendationId],
        references: [goalContributionRecommendations.id],
    }),
    newRecommendation: one(goalContributionRecommendations, {
        fields: [goalAdjustmentExplanations.newRecommendationId],
        references: [goalContributionRecommendations.id],
    }),
    reviewer: one(users, {
        fields: [goalAdjustmentExplanations.reviewedBy],
        references: [users.id],
    }),
    attributionDetails: many(goalAdjustmentAttributionDetails),
    timelineEntries: many(goalAdjustmentTimeline),
    comparison: one(goalAdjustmentComparison),
}));

export const goalAdjustmentAttributionDetailsRelations = relations(goalAdjustmentAttributionDetails, ({ one }) => ({
    explanation: one(goalAdjustmentExplanations, {
        fields: [goalAdjustmentAttributionDetails.explanationId],
        references: [goalAdjustmentExplanations.id],
    }),
}));

export const goalAdjustmentTimelineRelations = relations(goalAdjustmentTimeline, ({ one }) => ({
    user: one(users, {
        fields: [goalAdjustmentTimeline.userId],
        references: [users.id],
    }),
    goal: one(goals, {
        fields: [goalAdjustmentTimeline.goalId],
        references: [goals.id],
    }),
    explanation: one(goalAdjustmentExplanations, {
        fields: [goalAdjustmentTimeline.explanationId],
        references: [goalAdjustmentExplanations.id],
    }),
}));

export const goalAdjustmentInsightsRelations = relations(goalAdjustmentInsights, ({ one }) => ({
    user: one(users, {
        fields: [goalAdjustmentInsights.userId],
        references: [users.id],
    }),
    goal: one(goals, {
        fields: [goalAdjustmentInsights.goalId],
        references: [goals.id],
    }),
}));

export const goalAdjustmentComparisonRelations = relations(goalAdjustmentComparison, ({ one }) => ({
    explanation: one(goalAdjustmentExplanations, {
        fields: [goalAdjustmentComparison.explanationId],
        references: [goalAdjustmentExplanations.id],
    }),
}));

// Relations for Multi-Goal Budget Guardrail Optimizer - Issue #714
export const budgetGuardrailPoliciesRelations = relations(budgetGuardrailPolicies, ({ one, many }) => ({
    user: one(users, {
        fields: [budgetGuardrailPolicies.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [budgetGuardrailPolicies.vaultId],
        references: [vaults.id],
    }),
    allocations: many(guardrailAllocations),
    violations: many(guardrailViolations),
    complianceSnapshots: many(guardrailComplianceSnapshots),
    safeAllocations: many(safeAllocationCalculations),
}));

export const safeAllocationCalculationsRelations = relations(safeAllocationCalculations, ({ one }) => ({
    user: one(users, {
        fields: [safeAllocationCalculations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [safeAllocationCalculations.vaultId],
        references: [vaults.id],
    }),
    policy: one(budgetGuardrailPolicies, {
        fields: [safeAllocationCalculations.policyId],
        references: [budgetGuardrailPolicies.id],
    }),
}));

export const guardrailAllocationsRelations = relations(guardrailAllocations, ({ one }) => ({
    user: one(users, {
        fields: [guardrailAllocations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [guardrailAllocations.vaultId],
        references: [vaults.id],
    }),
    policy: one(budgetGuardrailPolicies, {
        fields: [guardrailAllocations.policyId],
        references: [budgetGuardrailPolicies.id],
    }),
    calculation: one(safeAllocationCalculations, {
        fields: [guardrailAllocations.calculationId],
        references: [safeAllocationCalculations.id],
    }),
    goal: one(goals, {
        fields: [guardrailAllocations.goalId],
        references: [goals.id],
    }),
    approver: one(users, {
        fields: [guardrailAllocations.overrideApprovedBy],
        references: [users.id],
    }),
}));

export const guardrailViolationsRelations = relations(guardrailViolations, ({ one }) => ({
    user: one(users, {
        fields: [guardrailViolations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [guardrailViolations.vaultId],
        references: [vaults.id],
    }),
    policy: one(budgetGuardrailPolicies, {
        fields: [guardrailViolations.policyId],
        references: [budgetGuardrailPolicies.id],
    }),
    allocation: one(guardrailAllocations, {
        fields: [guardrailViolations.allocationId],
        references: [guardrailAllocations.id],
    }),
}));

export const guardrailComplianceSnapshotsRelations = relations(guardrailComplianceSnapshots, ({ one }) => ({
    user: one(users, {
        fields: [guardrailComplianceSnapshots.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [guardrailComplianceSnapshots.vaultId],
        references: [vaults.id],
    }),
    policy: one(budgetGuardrailPolicies, {
        fields: [guardrailComplianceSnapshots.policyId],
        references: [budgetGuardrailPolicies.id],
    }),
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

// Password Reset Tokens Table
export const passwordResetTokens = pgTable('password_reset_tokens', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    token: text('token').notNull().unique(),
    hashedToken: text('hashed_token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    used: boolean('used').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    usedAt: timestamp('used_at'),
}, (table) => {
    return {
        userIdIdx: index('idx_password_reset_tokens_user_id').on(table.userId),
        tokenIdx: index('idx_password_reset_tokens_token').on(table.token),
        expiresAtIdx: index('idx_password_reset_tokens_expires_at').on(table.expiresAt),
    };
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

export const outboxEventsRelations = relations(outboxEvents, ({ one }) => ({
    tenant: one(tenants, {
        fields: [outboxEvents.tenantId],
        references: [tenants.id],
    }),
}));


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
// BAYESIAN PRIVATE DEBT DEFAULT PREDICTOR & YAR ENGINE (#496)
// ============================================================================

// Debt Bayesian Parameters - Store Bayesian inference parameters for private debt
export const debtBayesianParams = pgTable('debt_bayesian_params', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),

    // Bayesian Prior Parameters
    priorAlpha: numeric('prior_alpha', { precision: 10, scale: 4 }).default('1.0'), // Beta distribution α for default prior
    priorBeta: numeric('prior_beta', { precision: 10, scale: 4 }).default('99.0'), // Beta distribution β for default prior

    // Posterior Parameters (updated with evidence)
    posteriorAlpha: numeric('posterior_alpha', { precision: 10, scale: 4 }).default('1.0'),
    posteriorBeta: numeric('posterior_beta', { precision: 10, scale: 4 }).default('99.0'),

    // Current Probability Estimates
    subjectiveProbabilityOfDefault: numeric('subjective_probability_of_default', { precision: 8, scale: 6 }).default('0.0100'), // 1% default
    credibleInterval95Low: numeric('credible_interval_95_low', { precision: 8, scale: 6 }),
    credibleInterval95High: numeric('credible_interval_95_high', { precision: 8, scale: 6 }),

    // Historical Evidence
    onTimePayments: integer('on_time_payments').default(0),
    latePayments: integer('late_payments').default(0),
    missedPayments: integer('missed_payments').default(0),

    // Payment Velocity Metrics
    avgPaymentVelocity: numeric('avg_payment_velocity', { precision: 5, scale: 2 }).default('1.00'), // 1.00 = on time, <1 = early, >1 = late
    paymentVelocityStdDev: numeric('payment_velocity_std_dev', { precision: 5, scale: 2 }),

    // Borrower-Specific Risk Factors
    borrowerCreditSpread: numeric('borrower_credit_spread', { precision: 8, scale: 4 }), // Spread over risk-free rate in basis points
    borrowerLeverageRatio: numeric('borrower_leverage_ratio', { precision: 8, scale: 4 }), // Debt/EBITDA
    borrowerInterestCoverageRatio: numeric('borrower_interest_coverage_ratio', { precision: 8, scale: 4 }), // EBITDA/Interest

    // Macro-Economic Sensitivity
    baseRateSensitivity: numeric('base_rate_sensitivity', { precision: 5, scale: 4 }).default('0.10'), // % change in default prob per 1% rate change
    gdpGrowthSensitivity: numeric('gdp_growth_sensitivity', { precision: 5, scale: 4 }).default('-0.05'), // Negative: higher GDP = lower default

    // Risk Classification
    riskTier: text('risk_tier').default('investment_grade'), // 'investment_grade', 'high_yield', 'distressed', 'default'
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }).default('0.50'), // 0-1, model confidence

    lastUpdated: timestamp('last_updated').defaultNow(),
    lastPaymentDate: timestamp('last_payment_date'),
    nextPaymentExpectedDate: timestamp('next_payment_expected_date'),

    metadata: jsonb('metadata').default({}), // Additional factors, notes, manual adjustments
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_bayesian_params_user').on(table.userId),
    debtIdx: index('idx_bayesian_params_debt').on(table.debtId),
    riskTierIdx: index('idx_bayesian_params_risk_tier').on(table.riskTier),
    updatedIdx: index('idx_bayesian_params_updated').on(table.lastUpdated),
}));

// Loan Collateral Metadata - Track collateral backing private loans
export const loanCollateralMetadata = pgTable('loan_collateral_metadata', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),

    // Collateral Details
    collateralType: text('collateral_type').notNull(), // 'real_estate', 'securities', 'cash', 'equipment', 'inventory', 'ip', 'receivables'
    collateralDescription: text('collateral_description'),

    // Valuation
    initialValue: numeric('initial_value', { precision: 18, scale: 2 }).notNull(),
    currentValue: numeric('current_value', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    lastValuationDate: timestamp('last_valuation_date').defaultNow(),
    valuationSource: text('valuation_source').default('appraisal'), // 'appraisal', 'market', 'self_reported', 'model'

    // Loan-to-Value Metrics
    loanAmount: numeric('loan_amount', { precision: 18, scale: 2 }).notNull(),
    currentLTV: numeric('current_ltv', { precision: 5, scale: 4 }).notNull(), // Loan / Current Value
    initialLTV: numeric('initial_ltv', { precision: 5, scale: 4 }).notNull(),
    maintenanceLTV: numeric('maintenance_ltv', { precision: 5, scale: 4 }).default('0.8000'), // Trigger for margin call
    liquidationLTV: numeric('liquidation_ltv', { precision: 5, scale: 4 }).default('0.9000'), // Force liquidation threshold

    // Margin Call Tracking
    marginCallRequired: boolean('margin_call_required').default(false),
    marginCallDate: timestamp('margin_call_date'),
    marginCallAmount: numeric('margin_call_amount', { precision: 18, scale: 2 }),
    marginCallStatus: text('margin_call_status').default('none'), // 'none', 'pending', 'satisfied', 'defaulted'
    marginCallDueDate: timestamp('margin_call_due_date'),

    // Collateral Quality Indicators
    liquidityScore: numeric('liquidity_score', { precision: 3, scale: 2 }).default('0.50'), // 0-1, how quickly can be sold
    volatilityScore: numeric('volatility_score', { precision: 3, scale: 2 }).default('0.50'), // 0-1, price stability
    juniorLienExists: boolean('junior_lien_exists').default(false), // Is this first lien?
    juniorLienAmount: numeric('junior_lien_amount', { precision: 18, scale: 2 }),

    // Insurance & Protection
    isInsured: boolean('is_insured').default(false),
    insuranceValue: numeric('insurance_value', { precision: 18, scale: 2 }),
    insuranceExpiryDate: timestamp('insurance_expiry_date'),

    // Monitoring
    revaluationFrequencyDays: integer('revaluation_frequency_days').default(90),
    nextRevaluationDate: timestamp('next_revaluation_date'),
    alertThreshold: numeric('alert_threshold', { precision: 5, scale: 4 }).default('0.7500'), // Alert if LTV exceeds this

    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}), // Legal docs, custodian info, etc.
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_collateral_user').on(table.userId),
    debtIdx: index('idx_collateral_debt').on(table.debtId),
    ltvIdx: index('idx_collateral_ltv').on(table.currentLTV),
    marginCallIdx: index('idx_collateral_margin_call').on(table.marginCallRequired),
    typeIdx: index('idx_collateral_type').on(table.collateralType),
}));

// Default Simulations - Monte Carlo simulation results for Yield-at-Risk
export const defaultSimulations = pgTable('default_simulations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

    // Simulation Configuration
    simulationName: text('simulation_name').notNull(),
    simulationType: text('simulation_type').default('portfolio_yar'), // 'portfolio_yar', 'single_loan', 'stress_test'
    debtIds: jsonb('debt_ids').notNull(), // Array of debt IDs in portfolio
    horizonMonths: integer('horizon_months').default(12), // Forecast horizon
    iterationCount: integer('iteration_count').default(10000), // Monte Carlo iterations

    // Simulation Results - Yield-at-Risk (YaR)
    expectedYield: numeric('expected_yield', { precision: 8, scale: 4 }), // Expected annual yield
    yieldAtRisk99: numeric('yield_at_risk_99', { precision: 8, scale: 4 }), // 99% confidence interval loss
    yieldAtRisk95: numeric('yield_at_risk_95', { precision: 8, scale: 4 }), // 95% confidence interval loss
    yieldAtRisk90: numeric('yield_at_risk_90', { precision: 8, scale: 4 }), // 90% confidence interval loss

    // Portfolio-Wide Default Statistics
    portfolioDefaultProbability: numeric('portfolio_default_prob', { precision: 8, scale: 6 }), // Aggregate default probability
    expectedLoss: numeric('expected_loss', { precision: 18, scale: 2 }), // Dollar amount of expected loss
    unexpectedLoss: numeric('unexpected_loss', { precision: 18, scale: 2 }), // Volatility of loss

    // Value-at-Risk Equivalents
    var99: numeric('var_99', { precision: 18, scale: 2 }), // 99% VaR in dollar terms
    var95: numeric('var_95', { precision: 18, scale: 2 }), // 95% VaR
    cvar99: numeric('cvar_99', { precision: 18, scale: 2 }), // Conditional VaR (Expected Shortfall)

    // Distribution Metrics
    lossDistributionMean: numeric('loss_distribution_mean', { precision: 18, scale: 2 }),
    lossDistributionStdDev: numeric('loss_distribution_std_dev', { precision: 18, scale: 2 }),
    lossDistributionSkewness: numeric('loss_distribution_skewness', { precision: 8, scale: 4 }),
    lossDistributionKurtosis: numeric('loss_distribution_kurtosis', { precision: 8, scale: 4 }),

    // Scenario-Specific Results
    macroScenario: text('macro_scenario').default('base_case'), // 'base_case', 'recession', 'boom', 'stress'
    baseRateAssumption: numeric('base_rate_assumption', { precision: 5, scale: 4 }), // Fed Funds Rate assumption
    gdpGrowthAssumption: numeric('gdp_growth_assumption', { precision: 5, scale: 4 }), // GDP growth assumption
    creditSpreadAssumption: numeric('credit_spread_assumption', { precision: 5, scale: 4 }), // Credit spread assumption

    // Detailed Results Path Distribution
    pathDistribution: jsonb('path_distribution').default([]), // Array of percentile results [{percentile: 1, yield: -0.05}, ...]
    worstCaseScenarios: jsonb('worst_case_scenarios').default([]), // Top 10 worst simulation paths

    // Execution Details
    executionTimeMs: integer('execution_time_ms'),
    convergenceAchieved: boolean('convergence_achieved').default(true),
    randomSeed: integer('random_seed'),

    status: text('status').default('completed'), // 'running', 'completed', 'failed'
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    metadata: jsonb('metadata').default({}),
}, (table) => ({
    userIdx: index('idx_simulations_user').on(table.userId),
    typeIdx: index('idx_simulations_type').on(table.simulationType),
    statusIdx: index('idx_simulations_status').on(table.status),
    createdIdx: index('idx_simulations_created').on(table.createdAt),
    export const sagaInstancesRelations = relations(sagaInstances, ({ one, many }) => ({
        tenant: one(tenants, {
            fields: [sagaInstances.tenantId],
            references: [tenants.id],
        }),
        stepExecutions: many(sagaStepExecutions),
    }));

    export const sagaStepExecutionsRelations = relations(sagaStepExecutions, ({ one }) => ({
        sagaInstance: one(sagaInstances, {
            fields: [sagaStepExecutions.sagaInstanceId],
            references: [sagaInstances.id],
        }),
    }));

    export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
        tenant: one(tenants, {
            fields: [idempotencyKeys.tenantId],
            references: [tenants.id],
        }),
        user: one(users, {
            fields: [idempotencyKeys.userId],
            references: [users.id],
        }),
    }));

    export const distributedTransactionLogsRelations = relations(distributedTransactionLogs, ({ one }) => ({
        tenant: one(tenants, {
            fields: [distributedTransactionLogs.tenantId],
            references: [tenants.id],
        }),
        user: one(users, {
            fields: [distributedTransactionLogs.userId],
            references: [users.id],
        }),
        sagaInstance: one(sagaInstances, {
            fields: [distributedTransactionLogs.sagaInstanceId],
            references: [sagaInstances.id],
        }),
    }));

    export const serviceIdentitiesRelations = relations(serviceIdentities, ({ many }) => ({
        certificates: many(serviceCertificates),
        authLogs: many(serviceAuthLogs),
    }));

    export const serviceCertificatesRelations = relations(serviceCertificates, ({ one }) => ({
        service: one(serviceIdentities, {
            fields: [serviceCertificates.serviceId],
            references: [serviceIdentities.id],
        }),
    }));

    export const taxLots = pgTable('tax_lots', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
        vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
        assetSymbol: text('asset_symbol').notNull(),
        quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
        purchasePrice: numeric('purchase_price', { precision: 20, scale: 2 }).notNull(),
        purchaseDate: timestamp('purchase_date').notNull(),
        isSold: boolean('is_sold').default(false),
        soldDate: timestamp('sold_date'),
        soldPrice: numeric('sold_price', { precision: 20, scale: 2 }),
        metadata: jsonb('metadata').default({}),
        createdAt: timestamp('created_at').defaultNow(),
    });

    export const washSaleWindows = pgTable('wash_sale_windows', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        assetSymbol: text('asset_symbol').notNull(),
        windowStart: timestamp('window_start').notNull(),
        windowEnd: timestamp('window_end').notNull(),
        restrictedVaultIds: jsonb('restricted_vault_ids').notNull(), // List of vaults where purchase is forbidden or flagged
        reason: text('reason'), // e.g., "Harvest of Lot ID 123"
        isActive: boolean('is_active').default(true),
        createdAt: timestamp('created_at').defaultNow(),
    });

    export const harvestEvents = pgTable('harvest_events', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        assetSymbol: text('asset_symbol').notNull(),
        totalLossHarvested: numeric('total_loss_harvested', { precision: 20, scale: 2 }).notNull(),
        proxyAssetSuggested: text('proxy_asset_suggested'),
        status: text('status').default('proposed'), // proposed, executed, completed
        metadata: jsonb('metadata').default({}), // contains list of lot IDs harvested
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
    // DYNASTY TRUST & GRAT SIMULATOR (#511)
    // ============================================================================

    export const trustStructures = pgTable('trust_structures', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        trustName: text('trust_name').notNull(),
        trustType: text('trust_type').notNull(), // 'GRAT', 'Dynasty', 'IDGT', 'CRT'
        grantorId: uuid('grantor_id').references(() => users.id).notNull(),
        vaultId: uuid('vault_id').references(() => vaults.id).notNull(), // The vault holding trust assets
        initialFundingAmount: numeric('initial_funding_amount', { precision: 20, scale: 2 }).notNull(),
        hurdleRate: numeric('hurdle_rate', { precision: 5, scale: 4 }), // Section 7520 rate
        termYears: integer('term_years'),
        annuityPayoutPrc: numeric('annuity_payout_prc', { precision: 10, scale: 6 }), // For GRATs
        annuityPayerVaultId: uuid('annuity_payer_vault_id').references(() => vaults.id),
        status: text('status').default('active'), // 'active', 'terminated', 'exhausted'
        metadata: jsonb('metadata').default({}),
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    });

    export const beneficiaryClasses = pgTable('beneficiary_classes', {
        id: uuid('id').defaultRandom().primaryKey(),
        trustId: uuid('trust_id').references(() => trustStructures.id, { onDelete: 'cascade' }).notNull(),
        beneficiaryName: text('beneficiary_name').notNull(),
        beneficiaryType: text('beneficiary_type').default('individual'), // 'individual', 'charity', 'sub-trust'
        relationship: text('relationship'),
        allocationPrc: numeric('allocation_prc', { precision: 5, scale: 4 }).notNull(),
        vaultId: uuid('vault_id').references(() => vaults.id), // Beneficiary's target vault
        generation: integer('generation').default(1), // 1 = children, 2 = grandchildren, etc.
        metadata: jsonb('metadata').default({}),
        createdAt: timestamp('created_at').defaultNow(),
    });

    export const irs7520Rates = pgTable('irs_7520_rates', {
        id: uuid('id').defaultRandom().primaryKey(),
        effectiveMonth: integer('effective_month').notNull(),
        effectiveYear: integer('effective_year').notNull(),
        rate: numeric('rate', { precision: 5, scale: 4 }).notNull(),
        createdAt: timestamp('created_at').defaultNow(),
    }, (table) => ({
        dateIdx: index('idx_irs_7520_date').on(table.effectiveYear, table.effectiveMonth),
    }));

    export const taxExemptions = pgTable('tax_exemptions', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        exemptionType: text('exemption_type').notNull(), // 'LIFETIME_ESTATE', 'GST'
        taxYear: integer('tax_year').notNull(),
        totalLimit: numeric('total_limit', { precision: 20, scale: 2 }).notNull(),
        usedAmount: numeric('used_amount', { precision: 20, scale: 2 }).default('0'),
        metadata: jsonb('metadata').default({}),
        updatedAt: timestamp('updated_at').defaultNow(),
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
    // MONTE CARLO FORECASTING LAYER
    // ============================================================================

    // Forecast Scenarios Table
    // Stores simulation parameters and "What-If" variables for Monte Carlo forecasting
    export const forecastScenarios = pgTable('forecast_scenarios', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

        // Scenario identity
        scenarioName: text('scenario_name').notNull(),
        description: text('description'),
        scenarioType: text('scenario_type').notNull().default('baseline'), // 'baseline', 'optimistic', 'pessimistic', 'custom'

        // Simulation parameters
        simulationCount: integer('simulation_count').default(10000), // Number of Monte Carlo runs
        forecastHorizonDays: integer('forecast_horizon_days').default(365), // How far to predict
        confidenceLevel: numeric('confidence_level', { precision: 3, scale: 2 }).default('0.90'), // P10, P50, P90

        // Revenue modeling
        revenueParams: jsonb('revenue_params').default({
            meanMonthly: 0,
            stdDeviation: 0,
            distribution: 'normal', // 'normal', 'lognormal', 'uniform'
            growthRate: 0,
            seasonality: []
        }),

        // Expense modeling
        expenseParams: jsonb('expense_params').default({
            fixedCosts: 0,
            variableCostsMean: 0,
            variableCostsStdDev: 0,
            shockProbability: 0.05, // Probability of expense shock
            shockMagnitude: 1.5 // Multiplier when shock occurs
        }),

        // External economic markers
        economicFactors: jsonb('economic_factors').default({
            inflationRate: 0.03,
            interestRate: 0.05,
            marketVolatility: 0.15,
            unemploymentRate: 0.04
        }),

        // Cash reserve constraints
        initialCashBalance: numeric('initial_cash_balance', { precision: 15, 2 }).default('0'),
        minimumCashReserve: numeric('minimum_cash_reserve', { precision: 15, 2 }).default('0'),

        // Simulation results cache
        lastSimulationResults: jsonb('last_simulation_results').default({}),
        lastRunAt: timestamp('last_run_at'),

        // Status
        isActive: boolean('is_active').default(true),
        isLocked: boolean('is_locked').default(false), // Prevent modifications during simulation

        // Metadata
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    });

    // Forecast Simulation Results Table
    // Stores individual simulation run results for detailed analysis
    export const forecastSimulationResults = pgTable('forecast_simulation_results', {
        id: uuid('id').defaultRandom().primaryKey(),
        scenarioId: uuid('scenario_id').references(() => forecastScenarios.id, { onDelete: 'cascade' }).notNull(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

        // Simulation batch identifier
        batchId: uuid('batch_id').notNull(), // Groups results from single simulation run
        simulationNumber: integer('simulation_number').notNull(), // 1 to N

        // Timeline data (daily cashflow projections)
        cashflowTimeline: jsonb('cashflow_timeline').notNull().default('[]'), // [{day: 1, balance: 1000, revenue: 500, expenses: 300}, ...]

        // Key metrics from this simulation path
        finalCashBalance: numeric('final_cash_balance', { precision: 15, 2 }).notNull(),
        minCashBalance: numeric('min_cash_balance', { precision: 15, 2 }).notNull(),
        maxCashBalance: numeric('max_cash_balance', { precision: 15, 2 }).notNull(),
        dayOfMinBalance: integer('day_of_min_balance'),
        daysToCashDepletion: integer('days_to_cash_depletion'), // NULL if never depleted

        // Statistical markers
        totalRevenue: numeric('total_revenue', { precision: 15, 2 }).notNull(),
        totalExpenses: numeric('total_expenses', { precision: 15, 2 }).notNull(),
        netCashFlow: numeric('net_cash_flow', { precision: 15, 2 }).notNull(),
        volatilityScore: doublePrecision('volatility_score'), // Std dev of daily changes

        // Risk events encountered
        expenseShockCount: integer('expense_shock_count').default(0),
        revenueDroughtDays: integer('revenue_drought_days').default(0), // Days with below-average revenue

        // Execution metadata
        executionTimeMs: integer('execution_time_ms'),
        seedValue: integer('seed_value'), // Random seed for reproducibility

        // Timestamps
        createdAt: timestamp('created_at').defaultNow(),
    });

    // Forecast Aggregates Table
    // Pre-computed statistical aggregates for fast dashboard rendering
    export const forecastAggregates = pgTable('forecast_aggregates', {
        id: uuid('id').defaultRandom().primaryKey(),
        scenarioId: uuid('scenario_id').references(() => forecastScenarios.id, { onDelete: 'cascade' }).notNull().unique(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        batchId: uuid('batch_id').notNull(),

        // Confidence intervals (P10, P50, P90)
        p10FinalBalance: numeric('p10_final_balance', { precision: 15, 2 }).notNull(), // 10th percentile - pessimistic
        p50FinalBalance: numeric('p50_final_balance', { precision: 15, 2 }).notNull(), // 50th percentile - median
        p90FinalBalance: numeric('p90_final_balance', { precision: 15, 2 }).notNull(), // 90th percentile - optimistic

        // Cashflow runway analysis
        p10DaysToDepletion: integer('p10_days_to_depletion'), // 10% chance of running out by this day
        p50DaysToDepletion: integer('p50_days_to_depletion'), // Median runway
        p90DaysToDepletion: integer('p90_days_to_depletion'), // 90% safe until this day
        depletionProbability: numeric('depletion_probability', { precision: 5, 4 }), // % of sims that depleted

        // Fan chart data (daily percentile bands)
        dailyPercentiles: jsonb('daily_percentiles').notNull().default('[]'), // [{day: 1, p10: 900, p25: 950, p50: 1000, p75: 1050, p90: 1100}, ...]

        // Distribution histograms
        finalBalanceDistribution: jsonb('final_balance_distribution').default('[]'), // Histogram bins
        dailyVolatilityDistribution: jsonb('daily_volatility_distribution').default('[]'),

        // Summary statistics
        meanFinalBalance: numeric('mean_final_balance', { precision: 15, 2 }).notNull(),
        stdDevFinalBalance: numeric('std_dev_final_balance', { precision: 15, 2 }).notNull(),
        skewness: doublePrecision('skewness'), // Distribution skewness
        kurtosis: doublePrecision('kurtosis'), // Distribution kurtosis (tail risk)

        // Risk metrics
        valueatRisk95: numeric('value_at_risk_95', { precision: 15, 2 }), // 95% VaR
        conditionalVaR95: numeric('conditional_var_95', { precision: 15, 2 }), // Expected shortfall
        maxDrawdown: numeric('max_drawdown', { precision: 15, 2 }), // Worst drop from peak

        // Simulation metadata
        totalSimulations: integer('total_simulations').notNull(),
        successfulSimulations: integer('successful_simulations').notNull(),
        failedSimulations: integer('failed_simulations').default(0),
        totalExecutionTimeMs: integer('total_execution_time_ms'),

        // Timestamps
        computedAt: timestamp('computed_at').defaultNow(),
        createdAt: timestamp('created_at').defaultNow(),
    });

    // Runway Alert Thresholds Table
    // User-defined thresholds for proactive alerts based on simulation results
    export const runwayAlertThresholds = pgTable('runway_alert_thresholds', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),

        // Alert trigger conditions
        minDaysRunwayP50: integer('min_days_runway_p50').default(90), // Alert if median runway < 90 days
        maxDepletionProbability: numeric('max_depletion_probability', { precision: 5, 4 }).default('0.20'), // Alert if >20% depletion risk
        minCashReserveP10: numeric('min_cash_reserve_p10', { precision: 15, 2 }).default('5000'), // Alert if P10 balance < $5k

        // Notification preferences
        notificationChannels: jsonb('notification_channels').default({
            email: true,
            push: true,
            sms: false,
            inApp: true
        }),

        // Circuit breaker settings
        enableCircuitBreaker: boolean('enable_circuit_breaker').default(false), // Auto-block risky expenses
        circuitBreakerThreshold: numeric('circuit_breaker_threshold', { precision: 5, 4 }).default('0.30'), // Trip at 30% depletion risk

        // Alert history
        lastTriggeredAt: timestamp('last_triggered_at'),
        alertCount: integer('alert_count').default(0),

        // Status
        isActive: boolean('is_active').default(true),

        // Timestamps
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
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
        internalDebts: many(internalDebts),
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
        shadowEntities: many(shadowEntities),
        governanceResolutions: many(governanceResolutions),
        votingRecords: many(votingRecords),
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
        loansGiven: many(internalDebts, { relationName: 'lending' }),
        loansTaken: many(internalDebts, { relationName: 'borrowing' }),
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

    export const internalDebtsRelations = relations(internalDebts, ({ one }) => ({
        user: one(users, { fields: [internalDebts.userId], references: [users.id] }),
        lenderVault: one(vaults, { fields: [internalDebts.lenderVaultId], references: [vaults.id], relationName: 'lending' }),
        borrowerVault: one(vaults, { fields: [internalDebts.borrowerVaultId], references: [vaults.id], relationName: 'borrowing' }),
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

    // ============================================================================
    // INSTITUTIONAL GOVERNANCE & MULTI-RESOLUTION PROTOCOL (#453)
    // ============================================================================

    export const shadowEntities = pgTable('shadow_entities', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        name: text('name').notNull(), // e.g., "Family Trust", "Wealth LLC"
        entityType: text('entity_type').notNull(), // 'trust', 'llc', 'family_office'
        taxId: text('tax_id'),
        legalAddress: text('legal_address'),
        metadata: jsonb('metadata').default({}),
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    });

    export const bylawDefinitions = pgTable('bylaw_definitions', {
        id: uuid('id').defaultRandom().primaryKey(),
        entityId: uuid('entity_id').references(() => shadowEntities.id, { onDelete: 'cascade' }),
        vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
        thresholdAmount: numeric('threshold_amount', { precision: 24, scale: 8 }).notNull(),
        requiredQuorum: doublePrecision('required_quorum').notNull(), // e.g., 0.66 for 2/3
        votingPeriodHours: integer('voting_period_hours').default(48),
        autoExecute: boolean('auto_execute').default(true),
        isActive: boolean('is_active').default(true),
        createdAt: timestamp('created_at').defaultNow(),
    });

    export const governanceResolutions = pgTable('governance_resolutions', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        bylawId: uuid('bylaw_id').references(() => bylawDefinitions.id, { onDelete: 'cascade' }).notNull(),
        resolutionType: text('resolution_type').notNull(), // 'spend', 'transfer', 'bylaw_change'
        status: text('status').default('open'), // 'open', 'passed', 'failed', 'executed'
        payload: jsonb('payload').notNull(), // The transaction details being proposed
        votesFor: integer('votes_for').default(0),
        votesAgainst: integer('votes_against').default(0),
        totalEligibleVotes: integer('total_eligible_votes').notNull(),
        expiresAt: timestamp('expires_at').notNull(),
        createdAt: timestamp('created_at').defaultNow(),
        executedAt: timestamp('executed_at'),
    });

    export const votingRecords = pgTable('voting_records', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        resolutionId: uuid('resolution_id').references(() => governanceResolutions.id, { onDelete: 'cascade' }).notNull(),
        vote: text('vote').notNull(), // 'yes', 'no'
        votedAt: timestamp('voted_at').defaultNow(),
        reason: text('reason'),
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
        isSealed: boolean('is_sealed').default(false),
        auditAnchorId: uuid('audit_anchor_id').references(() => auditAnchors.id),
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
        isSealed: boolean('is_sealed').default(false),
        auditAnchorId: uuid('audit_anchor_id').references(() => auditAnchors.id),
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

    // ============================================================================
    // IMMUTABLE GOVERNANCE & MERKLE AUDITS (#475)
    // ============================================================================

    export const auditAnchors = pgTable('audit_anchors', {
        id: uuid('id').defaultRandom().primaryKey(),
        merkleRoot: text('merkle_root').notNull(),
        previousAnchorId: uuid('previous_anchor_id'), // Hash chain link
        eventCount: integer('event_count').notNull(),
        sealedAt: timestamp('sealed_at').defaultNow(),
        periodStart: timestamp('period_start').notNull(),
        periodEnd: timestamp('period_end').notNull(),
        sealMetadata: jsonb('seal_metadata').default({}), // Storage for range info
    });

    export const auditAnchorsRelations = relations(auditAnchors, ({ one }) => ({
        previousAnchor: one(auditAnchors, { fields: [auditAnchors.previousAnchorId], references: [auditAnchors.id] }),
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

    // Removed duplicate taxLots definition (defined at line 1399)

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

    // Removed duplicate escrowContracts definition (defined at line 4852)

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
    });

    export const investmentRecommendations = pgTable('investment_recommendations', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }),
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
    }));

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

    export const harvestOpportunitiesRelations = relations(harvestOpportunities, ({ one }) => ({
        user: one(users, { fields: [harvestOpportunities.userId], references: [users.id] }),
        investment: one(investments, { fields: [harvestOpportunities.investmentId], references: [investments.id] }),
    }));

    export const washSaleLogsRelations = relations(washSaleLogs, ({ one }) => ({
        user: one(users, { fields: [washSaleLogs.userId], references: [users.id] }),
        investment: one(investments, { fields: [washSaleLogs.investmentId], references: [investments.id] }),
        replacementLot: one(taxLots, { fields: [washSaleLogs.replacementLotId], references: [taxLots.id] }),
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

    export const shadowEntitiesRelations = relations(shadowEntities, ({ one, many }) => ({
        user: one(users, { fields: [shadowEntities.userId], references: [users.id] }),
        bylaws: many(bylawDefinitions),
    }));

    export const bylawDefinitionsRelations = relations(bylawDefinitions, ({ one, many }) => ({
        entity: one(shadowEntities, { fields: [bylawDefinitions.entityId], references: [shadowEntities.id] }),
        vault: one(vaults, { fields: [bylawDefinitions.vaultId], references: [vaults.id] }),
        resolutions: many(governanceResolutions),
    }));

    export const governanceResolutionsRelations = relations(governanceResolutions, ({ one, many }) => ({
        user: one(users, { fields: [governanceResolutions.userId], references: [users.id] }),
        bylaw: one(bylawDefinitions, { fields: [governanceResolutions.bylawId], references: [bylawDefinitions.id] }),
        votes: many(votingRecords),
    }));

    export const votingRecordsRelations = relations(votingRecords, ({ one }) => ({
        user: one(users, { fields: [votingRecords.userId], references: [users.id] }),
        resolution: one(governanceResolutions, { fields: [votingRecords.resolutionId], references: [governanceResolutions.id] }),
    }));

    // ============================================================================
    // AUTONOMOUS "FINANCIAL AUTOPILOT" & EVENT-DRIVEN WORKFLOW ORCHESTRATOR (#461)
    // ============================================================================


    export const autopilotWorkflows = pgTable('autopilot_workflows', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        name: text('name').notNull(),
        description: text('description'),
        status: text('status').default('draft').notNull(), // 'active', 'paused', 'draft', 'archived'
        triggerLogic: text('trigger_logic').default('AND').notNull(), // 'AND' | 'OR'
        domain: text('domain').notNull(), // 'VAULT','EXPENSE','INVESTMENT','DEBT','GOVERNANCE','MACRO'
        priority: integer('priority').default(0),
        cooldownMinutes: integer('cooldown_minutes').default(60),
        lastExecutedAt: timestamp('last_executed_at'),
        executionCount: integer('execution_count').default(0),
        maxExecutions: integer('max_executions'),
        dslDefinition: jsonb('dsl_definition').default({}),
        metadata: jsonb('metadata').default({}),
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    }, (table) => ({
        userIdx: index('idx_autopilot_user').on(table.userId),
        statusIdx: index('idx_autopilot_status').on(table.status),
        domainIdx: index('idx_autopilot_domain').on(table.domain),
    }));

    export const workflowTriggers = pgTable('workflow_triggers', {
        id: uuid('id').defaultRandom().primaryKey(),
        workflowId: uuid('workflow_id').references(() => autopilotWorkflows.id, { onDelete: 'cascade' }).notNull(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        variable: text('variable').notNull(),
        operator: text('operator').notNull(),
        thresholdValue: numeric('threshold_value', { precision: 24, scale: 8 }).notNull(),
        scopeVaultId: uuid('scope_vault_id').references(() => vaults.id, { onDelete: 'set null' }),
        currentStatus: boolean('current_status').default(false),
        lastCheckedAt: timestamp('last_checked_at').defaultNow(),
        lastValueObserved: numeric('last_value_observed', { precision: 24, scale: 8 }),
        createdAt: timestamp('created_at').defaultNow(),
    }, (table) => ({
        workflowIdx: index('idx_trigger_workflow').on(table.workflowId),
        userIdx: index('idx_trigger_user').on(table.userId),
        variableIdx: index('idx_trigger_variable').on(table.variable),
    }));

    export const workflowActions = pgTable('workflow_actions', {
        id: uuid('id').defaultRandom().primaryKey(),
        workflowId: uuid('workflow_id').references(() => autopilotWorkflows.id, { onDelete: 'cascade' }).notNull(),
        stepOrder: integer('step_order').notNull(),
        actionType: text('action_type').notNull(),
        parameters: jsonb('parameters').default({}),
        abortOnFailure: boolean('abort_on_failure').default(true),
        lastRunStatus: text('last_run_status').default('pending'),
        createdAt: timestamp('created_at').defaultNow(),
    }, (table) => ({
        workflowStepIdx: index('idx_action_workflow_step').on(table.workflowId, table.stepOrder),
    }));

    export const workflowExecutionLogs = pgTable('workflow_execution_logs', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        workflowId: uuid('workflow_id').references(() => autopilotWorkflows.id, { onDelete: 'cascade' }).notNull(),
        triggerEvent: text('trigger_event'),
        resultStatus: text('result_status').notNull(),
        triggerSnapshot: jsonb('trigger_snapshot').default({}),
        actionResults: jsonb('action_results').default([]),
        summary: text('summary'),
        executedAt: timestamp('executed_at').defaultNow(),
        durationMs: integer('duration_ms'),
    });

    // Autopilot relations
    export const autopilotWorkflowsRelations = relations(autopilotWorkflows, ({ one, many }) => ({
        user: one(users, { fields: [autopilotWorkflows.userId], references: [users.id] }),
        triggers: many(workflowTriggers),
        actions: many(workflowActions),
        executionLogs: many(workflowExecutionLogs),
    }));

    export const workflowTriggersRelations = relations(workflowTriggers, ({ one }) => ({
        workflow: one(autopilotWorkflows, { fields: [workflowTriggers.workflowId], references: [autopilotWorkflows.id] }),
        user: one(users, { fields: [workflowTriggers.userId], references: [users.id] }),
        vault: one(vaults, { fields: [workflowTriggers.scopeVaultId], references: [vaults.id] }),
    }));

    export const workflowActionsRelations = relations(workflowActions, ({ one }) => ({
        workflow: one(autopilotWorkflows, { fields: [workflowActions.workflowId], references: [autopilotWorkflows.id] }),
    }));

    export const workflowExecutionLogsRelations = relations(workflowExecutionLogs, ({ one }) => ({
        user: one(users, { fields: [workflowExecutionLogs.userId], references: [users.id] }),
        workflow: one(autopilotWorkflows, { fields: [workflowExecutionLogs.workflowId], references: [autopilotWorkflows.id] }),
    }));

    // ============================================================================
    // STRESS TESTING & TOPOLOGY VISUALIZER (#465)
    // ============================================================================

    export const topologySnapshots = pgTable('topology_snapshots', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        nodeCount: integer('node_count').notNull(),
        linkCount: integer('link_count').notNull(),
        totalNetworkWealth: numeric('total_network_wealth', { precision: 15, scale: 2 }).notNull(),
        maxFragilityIndex: numeric('max_fragility_index', { precision: 8, scale: 4 }),
        graphData: jsonb('graph_data').notNull(), // D3 compatible JSON
        createdAt: timestamp('created_at').defaultNow(),
    });

    export const stressTestSimulations = pgTable('stress_test_simulations', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        targetVaultId: uuid('target_vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
        shockPercentage: numeric('shock_percentage', { precision: 5, scale: 2 }).notNull(), // 0 to 100
        totalNetworkLoss: numeric('total_network_loss', { precision: 15, scale: 2 }).notNull(),
        insolventVaultsCount: integer('insolvent_vaults_count').default(0),
        maxImpactLevel: integer('max_impact_level').default(0), // How deep the shock propagated
        results: jsonb('results').notNull(), // Vault by vault impacts
        isSystemTriggered: boolean('is_system_triggered').default(false),
        createdAt: timestamp('created_at').defaultNow(),
    });

    // ============================================================================
    // PROBABILISTIC MONTE CARLO LONGEVITY & ESTATE-TAX FORECASTER (#480)
    // ============================================================================

    export const monteCarloRuns = pgTable('monte_carlo_runs', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        simulationParams: jsonb('simulation_params').notNull(),
        longevityRiskScore: numeric('longevity_risk_score', { precision: 5, scale: 2 }), // probability of outliving capital
        estateTaxBreachYear: integer('estate_tax_breach_year'),
        successRate: numeric('success_rate', { precision: 5, scale: 2 }),
        percentiles: jsonb('percentiles').notNull(), // 10th, 50th, 90th percentile trajectories
        createdAt: timestamp('created_at').defaultNow(),
    });

    export const mortalityAssumptions = pgTable('mortality_assumptions', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        currentAge: integer('current_age').notNull(),
        targetRetirementAge: integer('target_retirement_age').notNull(),
        lifeExpectancy: integer('life_expectancy').notNull(),
        healthMultiplier: numeric('health_multiplier', { precision: 3, scale: 2 }).default('1.00'), // Adjusts base mortality table
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    });

    export const estateBrackets = pgTable('estate_brackets', {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
        jurisdiction: text('jurisdiction').notNull(), // e.g. "US_FEDERAL", "STATE_NY"
        exemptionThreshold: numeric('exemption_threshold', { precision: 20, scale: 2 }).notNull(),
        taxRatePercentage: numeric('tax_rate_percentage', { precision: 5, scale: 2 }).notNull(),
        // SMART ESCROW & STOCHASTIC HEDGING SYSTEM (#481)
        // ============================================================================

        export const escrowContracts = pgTable('escrow_contracts', {
            id: uuid('id').defaultRandom().primaryKey(),
            userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
            title: text('title').notNull(),
            description: text('description'),
            baseCurrency: text('base_currency').notNull(), // User's home currency (e.g., USD)
            escrowCurrency: text('escrow_currency').notNull(), // Lock currency (e.g., EUR)
            totalAmount: numeric('total_amount', { precision: 20, scale: 2 }).notNull(),
            lockedAmount: numeric('locked_amount', { precision: 20, scale: 2 }).notNull(),
            status: text('status').default('active'), // active, completed, defaulted, liquidated
            vaultId: uuid('vault_id').references(() => vaults.id), // Where funds are backed
            multiSigConfig: jsonb('multi_sig_config').notNull(), // Keys/Signers required
            expiryDate: timestamp('expiry_date'),
            createdAt: timestamp('created_at').defaultNow(),
        });

        export const trancheReleases = pgTable('tranche_releases', {
            id: uuid('id').defaultRandom().primaryKey(),
            contractId: uuid('contract_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
            milestoneName: text('milestone_name').notNull(),
            amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
            isReleased: boolean('is_released').default(false),
            signaturesCollected: jsonb('signatures_collected').default([]),
            releasedAt: timestamp('released_at'),
        });

        export const activeHedges = pgTable('active_hedges', {
            id: uuid('id').defaultRandom().primaryKey(),
            contractId: uuid('contract_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
            hedgeType: text('hedge_type').notNull(), // FORWARD, SYNTH_STABLE, SWAP
            notionalAmount: numeric('notional_amount', { precision: 20, scale: 2 }).notNull(),
            entryRate: numeric('entry_rate', { precision: 12, scale: 6 }).notNull(),
            currentValue: numeric('current_value', { precision: 20, scale: 2 }),
            marginBuffer: numeric('margin_buffer', { precision: 20, scale: 2 }),
            lastRevaluationAt: timestamp('last_revaluation_at').defaultNow(),
        });

        export const escrowAuditLogs = pgTable('escrow_audit_logs', {
            id: uuid('id').defaultRandom().primaryKey(),
            contractId: uuid('contract_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
            action: text('action').notNull(), // SIGNATURE_CAST, TRANCHE_RELEASE, HEDGE_ADJUST, MARGIN_CALL
            actor: text('actor').notNull(),
            details: jsonb('details'),
            timestamp: timestamp('timestamp').defaultNow(),
        });
        // ============================================================================
        // MILP-BASED CROSS-BORDER LIQUIDITY OPTIMIZER (#476)
        // ============================================================================

        export const transferPaths = pgTable('transfer_paths', {
            id: uuid('id').defaultRandom().primaryKey(),
            userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
            sourceVaultId: uuid('source_vault_id').references(() => vaults.id).notNull(),
            destinationVaultId: uuid('destination_vault_id').references(() => vaults.id).notNull(),
            baseFee: numeric('base_fee', { precision: 10, scale: 2 }).default('0'), // Transaction flat fee
            platformFeePct: numeric('platform_fee_pct', { precision: 5, scale: 4 }).default('0'), // 0.001 = 0.1%
            averageProcessingTimeDays: integer('avg_processing_time_days').default(1),
            isInternational: boolean('is_international').default(false),
            isActive: boolean('is_active').default(true),
        });

        export const entityTaxRules = pgTable('entity_tax_rules', {
            id: uuid('id').defaultRandom().primaryKey(),
            userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
            sourceEntityId: uuid('source_entity_id').references(() => entities.id).notNull(),
            destinationEntityId: uuid('destination_entity_id').references(() => entities.id).notNull(),
            withholdingTaxPct: numeric('withholding_tax_pct', { precision: 5, scale: 4 }).default('0'),
            regulatoryFilingRequired: boolean('regulatory_filing_required').default(false),
        });

        export const optimizationRuns = pgTable('optimization_runs', {
            id: uuid('id').defaultRandom().primaryKey(),
            userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
            targetAmountUSD: numeric('target_amount_usd', { precision: 20, scale: 2 }).notNull(),
            destinationVaultId: uuid('destination_vault_id').references(() => vaults.id).notNull(),
            optimalPath: jsonb('optimal_path').notNull(), // Array of steps
            totalEstimatedFeeUSD: numeric('total_estimated_fee_usd', { precision: 15, scale: 2 }),
            totalTaxImpactUSD: numeric('total_tax_impact_usd', { precision: 15, scale: 2 }),
            status: text('status').default('calculated'), // calculated, executed, failed
            createdAt: timestamp('created_at').defaultNow(),
        });
        // ============================================================================
        // CRYPTOGRAPHIC MERKLE AUDIT TRAIL (#475)
        // ============================================================================

        export const auditAnchors = pgTable('audit_anchors', {
            id: uuid('id').defaultRandom().primaryKey(),
            merkleRoot: text('merkle_root').notNull(),
            startSlot: timestamp('start_slot').notNull(),
            endSlot: timestamp('end_slot').notNull(),
            previousAnchorHash: text('previous_anchor_hash'), // For hash chaining anchors
            eventCount: integer('event_count').default(0),
            signature: text('signature'), // Optional: System signature of the root
            createdAt: timestamp('created_at').defaultNow(),
        });

        // ============================================================================
        // ASYMMETRIC SPV PARTNERSHIP & LP/GP WATERFALL DISTRIBUTION ENGINE (#510)
        // ============================================================================

        export const spvEntities = pgTable('spv_entities', {
            id: uuid('id').defaultRandom().primaryKey(),
            userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
            name: text('name').notNull(),
            description: text('description'),
            gpEntityId: uuid('gp_entity_id').references(() => entities.id), // The entity managing the SPV
            status: text('status').default('active'), // 'active', 'liquidating', 'closed'
            initialAssetValue: numeric('initial_asset_value', { precision: 20, scale: 2 }),
            totalCommittedCapital: numeric('total_committed_capital', { precision: 20, scale: 2 }).default('0'),
            totalCalledCapital: numeric('total_called_capital', { precision: 20, scale: 2 }).default('0'),
            // MULTI-SIG TREASURY & SOCIAL RECOVERY LAYER (#497)
            // ============================================================================

            // Vault Guardians - Shamir Secret Sharing shard holders
            export const vaultGuardians = pgTable('vault_guardians', {
                id: uuid('id').defaultRandom().primaryKey(),
                vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
                userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Vault owner
                guardianUserId: uuid('guardian_user_id').references(() => users.id).notNull(), // Guardian

                // Guardian Identity
                guardianEmail: text('guardian_email').notNull(),
                guardianName: text('guardian_name').notNull(),
                guardianRole: text('guardian_role').notNull(), // 'family', 'lawyer', 'accountant', 'trustee', 'executor', 'friend'

                // Shamir Secret Sharing
                shardIndex: integer('shard_index').notNull(), // 1-7
                encryptedShard: text('encrypted_shard').notNull(), // Encrypted with guardian's public key
                shardChecksum: text('shard_checksum').notNull(), // Hash for integrity verification

                // Permissions
                canInitiateRecovery: boolean('can_initiate_recovery').default(true),
                canApproveTransactions: boolean('can_approve_transactions').default(false),
                approvalWeight: integer('approval_weight').default(1), // For weighted multi-sig

                // Status
                isActive: boolean('is_active').default(true),
                activatedAt: timestamp('activated_at'),
                lastVerifiedAt: timestamp('last_verified_at'), // Last time guardian confirmed their shard

                // Metadata

                // ============================================================================
                // ASYMMETRIC SPV PARTNERSHIP & LP/GP WATERFALL DISTRIBUTION ENGINE (#510)
                // ============================================================================

                export const spvEntities = pgTable('spv_entities', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    name: text('name').notNull(),
                    description: text('description'),
                    gpEntityId: uuid('gp_entity_id').references(() => entities.id), // The entity managing the SPV
                    status: text('status').default('active'), // 'active', 'liquidating', 'closed'
                    initialAssetValue: numeric('initial_asset_value', { precision: 20, scale: 2 }),
                    totalCommittedCapital: numeric('total_committed_capital', { precision: 20, scale: 2 }).default('0'),
                    totalCalledCapital: numeric('total_called_capital', { precision: 20, scale: 2 }).default('0'),
                    metadata: jsonb('metadata').default({}),
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                export const lpCommitments = pgTable('lp_commitments', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    spvId: uuid('spv_id').references(() => spvEntities.id, { onDelete: 'cascade' }).notNull(),
                    lpEntityId: uuid('lp_entity_id').references(() => entities.id).notNull(), // Target entity for the commitment
                    committedAmount: numeric('committed_amount', { precision: 20, scale: 2 }).notNull(),
                    calledAmount: numeric('called_amount', { precision: 20, scale: 2 }).default('0'),
                    ownershipPrc: numeric('ownership_prc', { precision: 7, scale: 4 }).notNull(), // Percentage of capital stake
                    status: text('status').default('active'),
                    metadata: jsonb('metadata').default({}),
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                export const waterfallTiers = pgTable('waterfall_tiers', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    spvId: uuid('spv_id').references(() => spvEntities.id, { onDelete: 'cascade' }).notNull(),
                    tierOrder: integer('tier_order').notNull(), // 1, 2, 3...
                    name: text('name').notNull(), // e.g. '8% Preferred Return'
                    allocationType: text('allocation_type').notNull(), // 'hurdle', 'catch_up', 'carried_interest'
                    thresholdIrr: numeric('threshold_irr', { precision: 5, scale: 4 }), // Hurdle rate (e.g. 0.08)
                    lpSplit: numeric('lp_split', { precision: 5, scale: 4 }).notNull(), // Percentage to LPs (e.g. 1.0 for preferred)
                    gpSplit: numeric('gp_split', { precision: 5, scale: 4 }).notNull(), // Percentage to GPs (e.g. 0.0)
                    metadata: jsonb('metadata').default({}),
                });

                export const capitalCalls = pgTable('capital_calls', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    spvId: uuid('spv_id').references(() => spvEntities.id, { onDelete: 'cascade' }).notNull(),
                    callAmount: numeric('call_amount', { precision: 20, scale: 2 }).notNull(),
                    callDate: timestamp('call_date').defaultNow(),
                    dueDate: timestamp('due_date'),
                    status: text('status').default('open'), // 'open', 'completed', 'overdue'
                    description: text('description'),
                    metadata: jsonb('metadata').default({}),
                });

                // SPV Relations
                export const spvEntitiesRelations = relations(spvEntities, ({ one, many }) => ({
                    user: one(users, { fields: [spvEntities.userId], references: [users.id] }),
                    gpEntity: one(entities, { fields: [spvEntities.gpEntityId], references: [entities.id] }),
                    commitments: many(lpCommitments),
                    tiers: many(waterfallTiers),
                    calls: many(capitalCalls),
                }));

                export const lpCommitmentsRelations = relations(lpCommitments, ({ one }) => ({
                    spv: one(spvEntities, { fields: [lpCommitments.spvId], references: [spvEntities.id] }),
                    lpEntity: one(entities, { fields: [lpCommitments.lpEntityId], references: [entities.id] }),
                }));

                export const waterfallTiersRelations = relations(waterfallTiers, ({ one }) => ({
                    spv: one(spvEntities, { fields: [waterfallTiers.spvId], references: [spvEntities.id] }),
                }));

                export const capitalCallsRelations = relations(capitalCalls, ({ one }) => ({
                    spv: one(spvEntities, { fields: [capitalCalls.spvId], references: [spvEntities.id] }),
                }));

                // ============================================================================
                // ALGORITHMIC OPTIONS COLLAR & DERIVATIVES ENGINE (#509)
                // ============================================================================

                export const optionsPositions = pgTable('options_positions', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    investmentId: uuid('investment_id').references(() => investments.id).notNull(), // Underlying asset
                    vaultId: uuid('vault_id').references(() => vaults.id).notNull(), // Vault holding the collateral
                    type: text('type').notNull(), // 'call', 'put'
                    optionStyle: text('option_style').default('american'), // 'american', 'european'
                    strikePrice: numeric('strike_price', { precision: 20, scale: 2 }).notNull(),
                    expirationDate: timestamp('expiration_date').notNull(),
                    contractsCount: numeric('contracts_count', { precision: 20, scale: 4 }).notNull(), // 1 contract usually = 100 shares
                    premiumPerUnit: numeric('premium_per_unit', { precision: 10, scale: 4 }),
                    status: text('status').default('open'), // 'open', 'closed', 'expired', 'assigned'
                    strategyId: uuid('strategy_id'), // Link to a grouped strategy like a Collar
                    isCovered: boolean('is_covered').default(true),
                    metadata: jsonb('metadata').default({}),
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                // Recovery Requests - State machine for social recovery process
                export const recoveryRequests = pgTable('recovery_requests', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Vault owner
                    initiatorGuardianId: uuid('initiator_guardian_id').references(() => vaultGuardians.id).notNull(),

                    // Recovery Configuration
                    requiredShards: integer('required_shards').notNull().default(3), // M in M-of-N threshold
                    totalShards: integer('total_shards').notNull().default(5), // N in M-of-N threshold

                    // State Machine
                    status: text('status').notNull().default('initiated'), // 'initiated', 'collecting_shards', 'cure_period', 'challenged', 'approved', 'executed', 'rejected', 'expired'

                    // Cure Period (multi-day waiting period before execution)
                    curePeriodDays: integer('cure_period_days').notNull().default(7), // Default 7-day wait
                    cureExpiresAt: timestamp('cure_expires_at'), // When cure period ends

                    // Challenge Mechanism
                    challengedAt: timestamp('challenged_at'),
                    challengedByUserId: uuid('challenged_by_user_id').references(() => users.id),
                    challengeReason: text('challenge_reason'),

                    // Recovery Target
                    newOwnerEmail: text('new_owner_email').notNull(), // Email of recovery recipient
                    newOwnerUserId: uuid('new_owner_user_id').references(() => users.id), // Set after email verification

                    // Execution
                    shardsCollected: integer('shards_collected').default(0),
                    reconstructedSecretHash: text('reconstructed_secret_hash'), // Hash of reconstructed secret for verification
                    executedAt: timestamp('executed_at'),
                    executedByUserId: uuid('executed_by_user_id').references(() => users.id),

                    // Timestamps
                    initiatedAt: timestamp('initiated_at').defaultNow(),
                    expiresAt: timestamp('expires_at').notNull(), // Absolute expiration (30 days from initiation)
                    completedAt: timestamp('completed_at'),

                    // Metadata
                    metadata: jsonb('metadata').default({}),
                    auditLog: jsonb('audit_log').default([]), // State transitions log
                });

                // Guardian Votes - Individual guardian shard submissions for recovery
                export const guardianVotes = pgTable('guardian_votes', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    recoveryRequestId: uuid('recovery_request_id').references(() => recoveryRequests.id, { onDelete: 'cascade' }).notNull(),
                    guardianId: uuid('guardian_id').references(() => vaultGuardians.id, { onDelete: 'cascade' }).notNull(),

                    // Vote Type
                    voteType: text('vote_type').notNull(), // 'shard_submission', 'approval', 'rejection', 'challenge'

                    // Shard Submission (for recovery)
                    submittedShard: text('submitted_shard'), // Decrypted shard provided by guardian
                    shardVerified: boolean('shard_verified').default(false),

                    // Transaction Approval (for recursive multi-sig)
                    transactionId: uuid('transaction_id'), // Reference to pending transaction
                    approvalDecision: text('approval_decision'), // 'approve', 'reject', 'abstain'

                    // Verification
                    signatureProof: text('signature_proof'), // Digital signature for non-repudiation
                    ipAddress: text('ip_address'),
                    userAgent: text('user_agent'),

                    // Time-Lock Constraints
                    submittedAt: timestamp('submitted_at').defaultNow(),
                    expiresAt: timestamp('expires_at'), // Time-locked signature validity

                    // Metadata
                    comments: text('comments'),
                    metadata: jsonb('metadata').default({}),
                });

                // Recursive Multi-Sig Rules - Complex approval logic for high-stakes transactions
                export const recursiveMultiSigRules = pgTable('recursive_multi_sig_rules', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

                    // Rule Configuration
                    ruleName: text('rule_name').notNull(),
                    ruleDescription: text('rule_description'),
                    priority: integer('priority').default(0), // Higher priority rules evaluated first

                    // Trigger Conditions
                    triggerType: text('trigger_type').notNull(), // 'transaction_amount', 'vault_withdrawal', 'ownership_transfer', 'guardian_change'
                    minAmount: numeric('min_amount', { precision: 20, scale: 2 }), // Minimum transaction amount to trigger
                    maxAmount: numeric('max_amount', { precision: 20, scale: 2 }), // Maximum transaction amount covered

                    // Approval Logic (stored as JSONB for flexibility)
                    // Example: {"operator": "OR", "conditions": [
                    //   {"operator": "AND", "rules": [{"role": "admin", "count": 1}, {"role": "lawyer", "count": 2}]},
                    //   {"operator": "ALL", "roles": ["family"], "count": 5}
                    // ]}
                    approvalLogic: jsonb('approval_logic').notNull(),

                    // Timeout Configuration
                    approvalTimeoutHours: integer('approval_timeout_hours').default(72), // 3 days default
                    requiresUnanimous: boolean('requires_unanimous').default(false),

                    // Status
                    isActive: boolean('is_active').default(true),

                    // Metadata
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });
                export const strategyLegs = pgTable('strategy_legs', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    strategyName: text('strategy_name').notNull(), // e.g. 'Zero-Cost Collar', 'Covered Call'
                    strategyType: text('strategy_type').notNull(),
                    underlyingInvestmentId: uuid('underlying_investment_id').references(() => investments.id).notNull(),
                    status: text('status').default('active'),
                    netPremium: numeric('net_premium', { precision: 20, scale: 2 }), // Total cost/credit to set up
                    targetDelta: numeric('target_delta', { precision: 5, scale: 4 }), // e.g. 0.3 for a standard protective put
                    metadata: jsonb('metadata').default({}),
                    createdAt: timestamp('created_at').defaultNow(),
                });

                export const impliedVolSurfaces = pgTable('implied_vol_surfaces', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    investmentId: uuid('investment_id').references(() => investments.id).notNull(),
                    observationDate: timestamp('observation_date').defaultNow(),
                    impliedVol: numeric('implied_vol', { precision: 10, scale: 6 }), // Decimal percentage
                    tenorDays: integer('tenor_days'), // e.g. 30, 60, 90
                    moneyness: numeric('moneyness', { precision: 5, scale: 2 }), // e.g. 1.0 (ATM), 1.1 (OTM)
                    source: text('source').default('market_oracle'),
                });

                // Push Subscriptions Table - For browser push notifications
                export const pushSubscriptions = pgTable('push_subscriptions', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    endpoint: text('endpoint').notNull(), // Push service endpoint URL
                    p256dh: text('p256dh').notNull(), // P-256 elliptic curve Diffie-Hellman public key
                    auth: text('auth').notNull(), // Authentication secret
                    userAgent: text('user_agent'), // Browser/device info
                    isActive: boolean('is_active').default(true),
                    lastUsed: timestamp('last_used').defaultNow(),
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                // Derivatives Relations
                export const optionsPositionsRelations = relations(optionsPositions, ({ one }) => ({
                    user: one(users, { fields: [optionsPositions.userId], references: [users.id] }),
                    investment: one(investments, { fields: [optionsPositions.investmentId], references: [investments.id] }),
                    vault: one(vaults, { fields: [optionsPositions.vaultId], references: [vaults.id] }),
                    strategy: one(strategyLegs, { fields: [optionsPositions.strategyId], references: [strategyLegs.id] }),
                }));

                export const strategyLegsRelations = relations(strategyLegs, ({ one, many }) => ({
                    user: one(users, { fields: [strategyLegs.userId], references: [users.id] }),
                    underlying: one(investments, { fields: [strategyLegs.underlyingInvestmentId], references: [investments.id] }),
                    legs: many(optionsPositions),
                }));

                export const impliedVolSurfacesRelations = relations(impliedVolSurfaces, ({ one }) => ({
                    investment: one(investments, { fields: [impliedVolSurfaces.investmentId], references: [investments.id] }),
                }));

                // ============================================================================
                // NON-FINANCIAL "PASSION ASSET" INDEXING & COLLATERALIZATION ENGINE (#536)
                // ============================================================================

                export const passionAssets = pgTable('passion_assets', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    name: text('name').notNull(), // e.g., "1962 Ferrari 250 GTO"
                    assetCategory: text('asset_category').notNull(), // 'art', 'car', 'watch', 'wine', 'collectible'
                    description: text('description'),
                    acquisitionDate: timestamp('acquisition_date'),
                    acquisitionCost: numeric('acquisition_cost', { precision: 20, scale: 2 }),
                    currentEstimatedValue: numeric('current_estimated_value', { precision: 20, scale: 2 }),
                    vaultId: uuid('vault_id').references(() => vaults.id), // Physical or digital representation in a vault
                    status: text('status').default('active'), // 'active', 'collateralized', 'sold', 'lost'
                    metadata: jsonb('metadata').default({}), // e.g., { make: 'Ferrari', model: '250 GTO', year: 1962 }
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                export const assetAppraisals = pgTable('asset_appraisals', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    assetId: uuid('asset_id').references(() => passionAssets.id, { onDelete: 'cascade' }).notNull(),
                    appraisalValue: numeric('appraisal_value', { precision: 20, scale: 2 }).notNull(),
                    appraiserName: text('appraiser_name'), // e.g., "Sotheby's", "Hagerty"
                    appraisalDate: timestamp('appraisal_date').defaultNow(),
                    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }), // 0.00 to 1.00
                    valuationSource: text('valuation_source').notNull(), // 'expert', 'index', 'auction_result'
                    metadata: jsonb('metadata').default({}),
                });

                export const provenanceRecords = pgTable('provenance_records', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    assetId: uuid('asset_id').references(() => passionAssets.id, { onDelete: 'cascade' }).notNull(),
                    recordType: text('record_type').notNull(), // 'ownership_change', 'restoration', 'storage_audit', 'insurance_update'
                    eventDate: timestamp('event_date').notNull(),
                    description: text('description'),
                    actorName: text('actor_name'), // Person or institution involved
                    isVerified: boolean('is_verified').default(false),
                    auditAnchorId: uuid('audit_anchor_id'), // Link to Merkle audit trail for immutability
                    metadata: jsonb('metadata').default({}),
                });

                export const passionLoanContracts = pgTable('passion_loan_contracts', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    assetId: uuid('asset_id').references(() => passionAssets.id).notNull(),
                    loanAmount: numeric('loan_amount', { precision: 20, scale: 2 }).notNull(),
                    interestRate: numeric('interest_rate', { precision: 5, scale: 4 }).notNull(), // Annual %
                    ltvRatio: numeric('ltv_ratio', { precision: 5, scale: 4 }).notNull(), // Loan-to-Value at inception
                    status: text('status').default('active'), // 'active', 'liquidated', 'repaid'
                    expiryDate: timestamp('expiry_date'),
                    vaultId: uuid('vault_id').references(() => vaults.id), // The vault where the loan funds are held/issued
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                // Passion Asset Relations
                export const passionAssetsRelations = relations(passionAssets, ({ one, many }) => ({
                    user: one(users, { fields: [passionAssets.userId], references: [users.id] }),
                    vault: one(vaults, { fields: [passionAssets.vaultId], references: [vaults.id] }),
                    appraisals: many(assetAppraisals),
                    provenance: many(provenanceRecords),
                    loans: many(passionLoanContracts),
                }));

                export const assetAppraisalsRelations = relations(assetAppraisals, ({ one }) => ({
                    asset: one(passionAssets, { fields: [assetAppraisals.assetId], references: [passionAssets.id] }),
                }));

                export const provenanceRecordsRelations = relations(provenanceRecords, ({ one }) => ({
                    asset: one(passionAssets, { fields: [provenanceRecords.assetId], references: [passionAssets.id] }),
                }));

                export const passionLoanContractsRelations = relations(passionLoanContracts, ({ one }) => ({
                    user: one(users, { fields: [passionLoanContracts.userId], references: [users.id] }),
                    asset: one(passionAssets, { fields: [passionLoanContracts.assetId], references: [passionAssets.id] }),
                    vault: one(vaults, { fields: [passionLoanContracts.vaultId], references: [vaults.id] }),
                }));

                // ============================================================================
                // PHILANTHROPIC "ALPHA" ENGINE & CRT OPTIMIZER (#535)
                // ============================================================================

                export const charitableTrusts = pgTable('charitable_trusts', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
                    name: text('name').notNull(),
                    trustType: text('trust_type').notNull(), // 'CRAT' (Annuity), 'CRUT' (Unitrust)
                    initialContribution: numeric('initial_contribution', { precision: 20, scale: 2 }).notNull(),
                    currentValue: numeric('current_value', { precision: 20, scale: 2 }).notNull(),
                    payoutRate: numeric('payout_rate', { precision: 5, scale: 4 }).notNull(), // 5% min, but must pass 10% rule
                    termYears: integer('term_years').notNull(),
                    irsRate: numeric('irs_rate', { precision: 5, scale: 4 }).notNull(), // Section 7520 rate at inception
                    charityEntityId: uuid('charity_entity_id').references(() => entities.id),
                    vaultId: uuid('vault_id').references(() => vaults.id),
                    status: text('status').default('active'),
                    metadata: jsonb('metadata').default({}),
                    createdAt: timestamp('created_at').defaultNow(),
                    updatedAt: timestamp('updated_at').defaultNow(),
                });

                export const crtPayouts = pgTable('crt_payouts', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    trustId: uuid('trust_id').references(() => charitableTrusts.id, { onDelete: 'cascade' }).notNull(),
                    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
                    payoutDate: timestamp('payout_date').defaultNow(),
                    taxCharacter: text('tax_character'), // ordinary, capital_gain, tax_free
                    ledgerEntryId: uuid('ledger_entry_id'),
                });

                export const crtProjections = pgTable('crt_projections', {
                    id: uuid('id').defaultRandom().primaryKey(),
                    trustId: uuid('trust_id').references(() => charitableTrusts.id, { onDelete: 'cascade' }).notNull(),
                    projectionYear: integer('projection_year').notNull(),
                    estimatedRemainder: numeric('estimated_remainder', { precision: 20, scale: 2 }).notNull(),
                    estimatedIncomeToGrantor: numeric('estimated_income_to_grantor', { precision: 20, scale: 2 }),
                    growthRateAssumption: numeric('growth_rate_assumption', { precision: 5, scale: 4 }),
                });

                // Charitable Relations
                export const charitableTrustsRelations = relations(charitableTrusts, ({ one, many }) => ({
                    user: one(users, { fields: [charitableTrusts.userId], references: [users.id] }),
                    charity: one(entities, { fields: [charitableTrusts.charityEntityId], references: [entities.id] }),
                    vault: one(vaults, { fields: [charitableTrusts.vaultId], references: [vaults.id] }),
                    payouts: many(crtPayouts),
                    projections: many(crtProjections),
                }));

                export const crtPayoutsRelations = relations(crtPayouts, ({ one }) => ({
                    trust: one(charitableTrusts, { fields: [crtPayouts.trustId], references: [charitableTrusts.id] }),
                }));

                export const crtProjectionsRelations = relations(crtProjections, ({ one }) => ({
                    trust: one(charitableTrusts, { fields: [crtProjections.trustId], references: [charitableTrusts.id] }),
                }));

                export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
                    user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
                }));
                export const serviceAuthLogsRelations = relations(serviceAuthLogs, ({ one }) => ({
                    service: one(serviceIdentities, {
                        fields: [serviceAuthLogs.serviceId],
                        references: [serviceIdentities.id],
                    }),
                }));

                export const budgetAlertsRelations = relations(budgetAlerts, ({ one, many }) => ({
                    tenant: one(tenants, {
                        fields: [budgetAlerts.tenantId],
                        references: [tenants.id],
                    }),
                    user: one(users, {
                        fields: [budgetAlerts.userId],
                        references: [users.id],
                    }),
                    category: one(categories, {
                        fields: [budgetAlerts.categoryId],
                        references: [categories.id],
                    }),
                    deduplicationEntries: many(alertDeduplication),
                }));

                export const budgetAggregatesRelations = relations(budgetAggregates, ({ one }) => ({
                    tenant: one(tenants, {
                        fields: [budgetAggregates.tenantId],
                        references: [tenants.id],
                    }),
                    user: one(users, {
                        fields: [budgetAggregates.userId],
                        references: [users.id],
                    }),
                    category: one(categories, {
                        fields: [budgetAggregates.categoryId],
                        references: [categories.id],
                    }),
                }));

                export const alertDeduplicationRelations = relations(alertDeduplication, ({ one }) => ({
                    tenant: one(tenants, {
                        fields: [alertDeduplication.tenantId],
                        references: [tenants.id],
                    }),
                    budgetAlert: one(budgetAlerts, {
                        fields: [alertDeduplication.budgetAlertId],
                        references: [budgetAlerts.id],
                    }),
                }));

                // Export forecast schema tables
                export * from './schema-forecast.js';

                // Export drift detection schema tables
                export * from './schema-drift-detection.js';

                // Export goal sharing schema tables
                export * from './schema-goal-sharing.js';

                // Export anomaly detection schema tables
                export * from './schema-anomaly-detection.js';

                // Export portfolio rebalancing schema tables
                export * from './schema-portfolio-rebalancing.js';
                // Export smart notifications and recommendations schema tables
                export * from './schema-smart-notifications.js';
export const sagaInstancesRelations = relations(sagaInstances, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [sagaInstances.tenantId],
        references: [tenants.id],
    }),
    stepExecutions: many(sagaStepExecutions),
}));

export const sagaStepExecutionsRelations = relations(sagaStepExecutions, ({ one }) => ({
    sagaInstance: one(sagaInstances, {
        fields: [sagaStepExecutions.sagaInstanceId],
        references: [sagaInstances.id],
    }),
}));

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
    tenant: one(tenants, {
        fields: [idempotencyKeys.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [idempotencyKeys.userId],
        references: [users.id],
    }),
}));

export const distributedTransactionLogsRelations = relations(distributedTransactionLogs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [distributedTransactionLogs.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [distributedTransactionLogs.userId],
        references: [users.id],
    }),
    sagaInstance: one(sagaInstances, {
        fields: [distributedTransactionLogs.sagaInstanceId],
        references: [sagaInstances.id],
    }),
}));

export const serviceIdentitiesRelations = relations(serviceIdentities, ({ many }) => ({
    certificates: many(serviceCertificates),
    authLogs: many(serviceAuthLogs),
}));

export const serviceCertificatesRelations = relations(serviceCertificates, ({ one }) => ({
    service: one(serviceIdentities, {
        fields: [serviceCertificates.serviceId],
        references: [serviceIdentities.id],
    }),
}));

export const taxLots = pgTable('tax_lots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    assetSymbol: text('asset_symbol').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 20, scale: 2 }).notNull(),
    purchaseDate: timestamp('purchase_date').notNull(),
    isSold: boolean('is_sold').default(false),
    soldDate: timestamp('sold_date'),
    soldPrice: numeric('sold_price', { precision: 20, scale: 2 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const washSaleWindows = pgTable('wash_sale_windows', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assetSymbol: text('asset_symbol').notNull(),
    windowStart: timestamp('window_start').notNull(),
    windowEnd: timestamp('window_end').notNull(),
    restrictedVaultIds: jsonb('restricted_vault_ids').notNull(), // List of vaults where purchase is forbidden or flagged
    reason: text('reason'), // e.g., "Harvest of Lot ID 123"
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const harvestEvents = pgTable('harvest_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assetSymbol: text('asset_symbol').notNull(),
    totalLossHarvested: numeric('total_loss_harvested', { precision: 20, scale: 2 }).notNull(),
    proxyAssetSuggested: text('proxy_asset_suggested'),
    status: text('status').default('proposed'), // proposed, executed, completed
    metadata: jsonb('metadata').default({}), // contains list of lot IDs harvested
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
// DYNASTY TRUST & GRAT SIMULATOR (#511)
// ============================================================================

export const trustStructures = pgTable('trust_structures', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    trustName: text('trust_name').notNull(),
    trustType: text('trust_type').notNull(), // 'GRAT', 'Dynasty', 'IDGT', 'CRT'
    grantorId: uuid('grantor_id').references(() => users.id).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id).notNull(), // The vault holding trust assets
    initialFundingAmount: numeric('initial_funding_amount', { precision: 20, scale: 2 }).notNull(),
    hurdleRate: numeric('hurdle_rate', { precision: 5, scale: 4 }), // Section 7520 rate
    termYears: integer('term_years'),
    annuityPayoutPrc: numeric('annuity_payout_prc', { precision: 10, scale: 6 }), // For GRATs
    annuityPayerVaultId: uuid('annuity_payer_vault_id').references(() => vaults.id),
    status: text('status').default('active'), // 'active', 'terminated', 'exhausted'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const beneficiaryClasses = pgTable('beneficiary_classes', {
    id: uuid('id').defaultRandom().primaryKey(),
    trustId: uuid('trust_id').references(() => trustStructures.id, { onDelete: 'cascade' }).notNull(),
    beneficiaryName: text('beneficiary_name').notNull(),
    beneficiaryType: text('beneficiary_type').default('individual'), // 'individual', 'charity', 'sub-trust'
    relationship: text('relationship'),
    allocationPrc: numeric('allocation_prc', { precision: 5, scale: 4 }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id), // Beneficiary's target vault
    generation: integer('generation').default(1), // 1 = children, 2 = grandchildren, etc.
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const irs7520Rates = pgTable('irs_7520_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    effectiveMonth: integer('effective_month').notNull(),
    effectiveYear: integer('effective_year').notNull(),
    rate: numeric('rate', { precision: 5, scale: 4 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    dateIdx: index('idx_irs_7520_date').on(table.effectiveYear, table.effectiveMonth),
}));

export const taxExemptions = pgTable('tax_exemptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    exemptionType: text('exemption_type').notNull(), // 'LIFETIME_ESTATE', 'GST'
    taxYear: integer('tax_year').notNull(),
    totalLimit: numeric('total_limit', { precision: 20, scale: 2 }).notNull(),
    usedAmount: numeric('used_amount', { precision: 20, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    updatedAt: timestamp('updated_at').defaultNow(),
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
// MONTE CARLO FORECASTING LAYER
// ============================================================================

// Forecast Scenarios Table
// Stores simulation parameters and "What-If" variables for Monte Carlo forecasting
export const forecastScenarios = pgTable('forecast_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Scenario identity
    scenarioName: text('scenario_name').notNull(),
    description: text('description'),
    scenarioType: text('scenario_type').notNull().default('baseline'), // 'baseline', 'optimistic', 'pessimistic', 'custom'
    
    // Simulation parameters
    simulationCount: integer('simulation_count').default(10000), // Number of Monte Carlo runs
    forecastHorizonDays: integer('forecast_horizon_days').default(365), // How far to predict
    confidenceLevel: numeric('confidence_level', { precision: 3, scale: 2 }).default('0.90'), // P10, P50, P90
    
    // Revenue modeling
    revenueParams: jsonb('revenue_params').default({
        meanMonthly: 0,
        stdDeviation: 0,
        distribution: 'normal', // 'normal', 'lognormal', 'uniform'
        growthRate: 0,
        seasonality: []
    }),
    
    // Expense modeling
    expenseParams: jsonb('expense_params').default({
        fixedCosts: 0,
        variableCostsMean: 0,
        variableCostsStdDev: 0,
        shockProbability: 0.05, // Probability of expense shock
        shockMagnitude: 1.5 // Multiplier when shock occurs
    }),
    
    // External economic markers
    economicFactors: jsonb('economic_factors').default({
        inflationRate: 0.03,
        interestRate: 0.05,
        marketVolatility: 0.15,
        unemploymentRate: 0.04
    }),
    
    // Cash reserve constraints
    initialCashBalance: numeric('initial_cash_balance', { precision: 15, 2 }).default('0'),
    minimumCashReserve: numeric('minimum_cash_reserve', { precision: 15, 2 }).default('0'),
    
    // Simulation results cache
    lastSimulationResults: jsonb('last_simulation_results').default({}),
    lastRunAt: timestamp('last_run_at'),
    
    // Status
    isActive: boolean('is_active').default(true),
    isLocked: boolean('is_locked').default(false), // Prevent modifications during simulation
    
    // Metadata
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Forecast Simulation Results Table
// Stores individual simulation run results for detailed analysis
export const forecastSimulationResults = pgTable('forecast_simulation_results', {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id').references(() => forecastScenarios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Simulation batch identifier
    batchId: uuid('batch_id').notNull(), // Groups results from single simulation run
    simulationNumber: integer('simulation_number').notNull(), // 1 to N
    
    // Timeline data (daily cashflow projections)
    cashflowTimeline: jsonb('cashflow_timeline').notNull().default('[]'), // [{day: 1, balance: 1000, revenue: 500, expenses: 300}, ...]
    
    // Key metrics from this simulation path
    finalCashBalance: numeric('final_cash_balance', { precision: 15, 2 }).notNull(),
    minCashBalance: numeric('min_cash_balance', { precision: 15, 2 }).notNull(),
    maxCashBalance: numeric('max_cash_balance', { precision: 15, 2 }).notNull(),
    dayOfMinBalance: integer('day_of_min_balance'),
    daysToCashDepletion: integer('days_to_cash_depletion'), // NULL if never depleted
    
    // Statistical markers
    totalRevenue: numeric('total_revenue', { precision: 15, 2 }).notNull(),
    totalExpenses: numeric('total_expenses', { precision: 15, 2 }).notNull(),
    netCashFlow: numeric('net_cash_flow', { precision: 15, 2 }).notNull(),
    volatilityScore: doublePrecision('volatility_score'), // Std dev of daily changes
    
    // Risk events encountered
    expenseShockCount: integer('expense_shock_count').default(0),
    revenueDroughtDays: integer('revenue_drought_days').default(0), // Days with below-average revenue
    
    // Execution metadata
    executionTimeMs: integer('execution_time_ms'),
    seedValue: integer('seed_value'), // Random seed for reproducibility
    
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
});

// Forecast Aggregates Table
// Pre-computed statistical aggregates for fast dashboard rendering
export const forecastAggregates = pgTable('forecast_aggregates', {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id').references(() => forecastScenarios.id, { onDelete: 'cascade' }).notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    batchId: uuid('batch_id').notNull(),
    
    // Confidence intervals (P10, P50, P90)
    p10FinalBalance: numeric('p10_final_balance', { precision: 15, 2 }).notNull(), // 10th percentile - pessimistic
    p50FinalBalance: numeric('p50_final_balance', { precision: 15, 2 }).notNull(), // 50th percentile - median
    p90FinalBalance: numeric('p90_final_balance', { precision: 15, 2 }).notNull(), // 90th percentile - optimistic
    
    // Cashflow runway analysis
    p10DaysToDepletion: integer('p10_days_to_depletion'), // 10% chance of running out by this day
    p50DaysToDepletion: integer('p50_days_to_depletion'), // Median runway
    p90DaysToDepletion: integer('p90_days_to_depletion'), // 90% safe until this day
    depletionProbability: numeric('depletion_probability', { precision: 5, 4 }), // % of sims that depleted
    
    // Fan chart data (daily percentile bands)
    dailyPercentiles: jsonb('daily_percentiles').notNull().default('[]'), // [{day: 1, p10: 900, p25: 950, p50: 1000, p75: 1050, p90: 1100}, ...]
    
    // Distribution histograms
    finalBalanceDistribution: jsonb('final_balance_distribution').default('[]'), // Histogram bins
    dailyVolatilityDistribution: jsonb('daily_volatility_distribution').default('[]'),
    
    // Summary statistics
    meanFinalBalance: numeric('mean_final_balance', { precision: 15, 2 }).notNull(),
    stdDevFinalBalance: numeric('std_dev_final_balance', { precision: 15, 2 }).notNull(),
    skewness: doublePrecision('skewness'), // Distribution skewness
    kurtosis: doublePrecision('kurtosis'), // Distribution kurtosis (tail risk)
    
    // Risk metrics
    valueatRisk95: numeric('value_at_risk_95', { precision: 15, 2 }), // 95% VaR
    conditionalVaR95: numeric('conditional_var_95', { precision: 15, 2 }), // Expected shortfall
    maxDrawdown: numeric('max_drawdown', { precision: 15, 2 }), // Worst drop from peak
    
    // Simulation metadata
    totalSimulations: integer('total_simulations').notNull(),
    successfulSimulations: integer('successful_simulations').notNull(),
    failedSimulations: integer('failed_simulations').default(0),
    totalExecutionTimeMs: integer('total_execution_time_ms'),
    
    // Timestamps
    computedAt: timestamp('computed_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Runway Alert Thresholds Table
// User-defined thresholds for proactive alerts based on simulation results
export const runwayAlertThresholds = pgTable('runway_alert_thresholds', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    
    // Alert trigger conditions
    minDaysRunwayP50: integer('min_days_runway_p50').default(90), // Alert if median runway < 90 days
    maxDepletionProbability: numeric('max_depletion_probability', { precision: 5, 4 }).default('0.20'), // Alert if >20% depletion risk
    minCashReserveP10: numeric('min_cash_reserve_p10', { precision: 15, 2 }).default('5000'), // Alert if P10 balance < $5k
    
    // Notification preferences
    notificationChannels: jsonb('notification_channels').default({
        email: true,
        push: true,
        sms: false,
        inApp: true
    }),
    
    // Circuit breaker settings
    enableCircuitBreaker: boolean('enable_circuit_breaker').default(false), // Auto-block risky expenses
    circuitBreakerThreshold: numeric('circuit_breaker_threshold', { precision: 5, 4 }).default('0.30'), // Trip at 30% depletion risk
    
    // Alert history
    lastTriggeredAt: timestamp('last_triggered_at'),
    alertCount: integer('alert_count').default(0),
    
    // Status
    isActive: boolean('is_active').default(true),
    
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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
    internalDebts: many(internalDebts),
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
    shadowEntities: many(shadowEntities),
    governanceResolutions: many(governanceResolutions),
    votingRecords: many(votingRecords),
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
    loansGiven: many(internalDebts, { relationName: 'lending' }),
    loansTaken: many(internalDebts, { relationName: 'borrowing' }),
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

export const internalDebtsRelations = relations(internalDebts, ({ one }) => ({
    user: one(users, { fields: [internalDebts.userId], references: [users.id] }),
    lenderVault: one(vaults, { fields: [internalDebts.lenderVaultId], references: [vaults.id], relationName: 'lending' }),
    borrowerVault: one(vaults, { fields: [internalDebts.borrowerVaultId], references: [vaults.id], relationName: 'borrowing' }),
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
    patternType: text('pattern_type').default('merchant'), // merchant, keyword, amount, hybrid
    falsePositiveCount: integer('false_positive_count').default(0),
    lastMatchedAt: timestamp('last_matched_at'),
    enabled: boolean('enabled').default(true),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_cat_patterns_user').on(table.userId),
    patternIdx: index('idx_cat_patterns_text').on(table.pattern),
}));

// ============================================================================
// ISSUE #639: SMART EXPENSE CATEGORIZATION & MERCHANT RECOGNITION
// ============================================================================

// Merchant Ratings - User ratings and feedback for merchants
export const merchantRatings = pgTable('merchant_ratings', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }).notNull(),
    review: text('review'),
    feedbackType: text('feedback_type'), // positive, negative, neutral
    helpfulCount: integer('helpful_count').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_merchant_ratings_user').on(table.userId),
    merchantIdx: index('idx_merchant_ratings_merchant').on(table.merchantId),
}));

// Expense Corrections - Track user corrections for training loop
export const expenseCorrections = pgTable('expense_corrections', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    originalCategoryId: uuid('original_category_id').references(() => categories.id, { onDelete: 'set null' }),
    correctedCategoryId: uuid('corrected_category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    confidenceBefore: numeric('confidence_before', { precision: 5, scale: 4 }),
    confidenceAfter: numeric('confidence_after', { precision: 5, scale: 4 }),
    reason: text('reason'), // user_correction, ai_suggestion, rule_applied
    feedback: text('feedback'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_expense_corrections_user').on(table.userId),
    expenseIdx: index('idx_expense_corrections_expense').on(table.expenseId),
    dateIdx: index('idx_expense_corrections_date').on(table.createdAt),
}));

// OCR Results - Store OCR extraction results from receipts
export const ocrResults = pgTable('ocr_results', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    receiptFileUrl: text('receipt_file_url').notNull(),
    extractedMerchant: text('extracted_merchant'),
    extractedAmount: numeric('extracted_amount', { precision: 12, scale: 2 }),
    extractedDate: timestamp('extracted_date'),
    extractedDescription: text('extracted_description'),
    ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 4 }),
    extractionRaw: jsonb('extraction_raw'),
    validationStatus: text('validation_status').default('pending'), // pending, valid, invalid, requires_review
    validationNotes: text('validation_notes'),
    processedBy: text('processed_by').default('tesseract'),
    processingTimeMs: integer('processing_time_ms'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    expenseIdx: index('idx_ocr_results_expense').on(table.expenseId),
    statusIdx: index('idx_ocr_results_status').on(table.validationStatus),
    dateIdx: index('idx_ocr_results_date').on(table.createdAt),
}));

// Category Suggestions - Log categorization suggestions
export const categorySuggestions = pgTable('category_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    suggestedCategoryId: uuid('suggested_category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
    suggestionSource: text('suggestion_source').notNull(), // merchant_pattern, ml_model, rule_based, historical
    alternativePredictions: jsonb('alternative_predictions'),
    wasAccepted: boolean('was_accepted'),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_category_suggestions_user').on(table.userId),
    expenseIdx: index('idx_category_suggestions_expense').on(table.expenseId),
    confidenceIdx: index('idx_category_suggestions_confidence').on(table.confidenceScore),
}));

// Merchant Logos - Logo records for merchants
export const merchantLogos = pgTable('merchant_logos', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }).notNull(),
    logoUrl: text('logo_url').notNull(),
    logoUrlHd: text('logo_url_hd'),
    colorPrimary: text('color_primary'),
    colorSecondary: text('color_secondary'),
    logoSource: text('logo_source').default('user'), // user, system, external_api
    isVerified: boolean('is_verified').default(false),
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    merchantIdx: index('idx_merchant_logos_merchant').on(table.merchantId),
}));

// Receipt Metadata - Detailed receipt information
export const receiptMetadata = pgTable('receipt_metadata', {
    id: uuid('id').defaultRandom().primaryKey(),
    ocrResultId: uuid('ocr_result_id').references(() => ocrResults.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    fileName: text('file_name'),
    fileSize: integer('file_size'),
    fileType: text('file_type'), // pdf, jpg, png, etc.
    imageWidth: integer('image_width'),
    imageHeight: integer('image_height'),
    imageQuality: text('image_quality'), // poor, fair, good, excellent
    detectedLanguage: text('detected_language').default('en'),
    hasQrCode: boolean('has_qr_code').default(false),
    qrCodeValue: text('qr_code_value'),
    storeLocation: text('store_location'),
    paymentMethodDetected: text('payment_method_detected'),
    currencyDetected: text('currency_detected'),
    itemsDetected: jsonb('items_detected'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    ocrIdx: index('idx_receipt_metadata_ocr').on(table.ocrResultId),
    expenseIdx: index('idx_receipt_metadata_expense').on(table.expenseId),
}));

// Training Data Snapshots - ML model improvement tracking
export const categorizationTrainingSnapshots = pgTable('categorization_training_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: timestamp('snapshot_date').notNull(),
    totalExpensesUsed: integer('total_expenses_used'),
    totalCorrections: integer('total_corrections'),
    modelAccuracy: numeric('model_accuracy', { precision: 5, scale: 4 }),
    modelPrecision: numeric('model_precision', { precision: 5, scale: 4 }),
    modelRecall: numeric('model_recall', { precision: 5, scale: 4 }),
    f1Score: numeric('f1_score', { precision: 5, scale: 4 }),
    topCategories: jsonb('top_categories'),
    improvementsMade: text('improvements_made'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_training_snapshots_user').on(table.userId),
    dateIdx: index('idx_training_snapshots_date').on(table.snapshotDate),
}));

// Merchant Frequency Patterns - Recurring transaction patterns
export const merchantFrequencyPatterns = pgTable('merchant_frequency_patterns', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    frequencyType: text('frequency_type').notNull(), // daily, weekly, biweekly, monthly, quarterly, yearly
    averageDaysBetween: numeric('average_days_between', { precision: 8, scale: 2 }),
    averageAmount: numeric('average_amount', { precision: 12, scale: 2 }),
    lastOccurrenceDate: timestamp('last_occurrence_date'),
    nextPredictedDate: timestamp('next_predicted_date'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }),
    occurrenceCount: integer('occurrence_count').default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_merchant_frequency_user').on(table.userId),
    merchantIdx: index('idx_merchant_frequency_merchant').on(table.merchantId),
    typeIdx: index('idx_merchant_frequency_type').on(table.frequencyType),
}));

// ============================================================================
// REAL-TIME TAX OPTIMIZATION & DEDUCTION TRACKING (#641)
// ============================================================================

// Tax Profiles - User tax filing status and configuration
export const taxProfiles = pgTable('tax_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    filingStatus: text('filing_status').notNull().default('single'), // single, married_joint, married_separate, head_of_household
    state: text('state'), // State code for state tax
    isSelfEmployed: boolean('is_self_employed').default(false),
    hasDependents: boolean('has_dependents').default(false),
    dependentCount: integer('dependent_count').default(0),
    taxYear: integer('tax_year').notNull(),
    standardDeduction: numeric('standard_deduction', { precision: 12, scale: 2 }),
    usesItemizedDeductions: boolean('uses_itemized_deductions').default(false),
    estimatedAnnualIncome: numeric('estimated_annual_income', { precision: 12, scale: 2 }),
    withholdingYtd: numeric('withholding_ytd', { precision: 12, scale: 2 }).default('0'),
    w2JobsCount: integer('w2_jobs_count').default(0),
    hasInvestmentIncome: boolean('has_investment_income').default(false),
    hasRentalIncome: boolean('has_rental_income').default(false),
    qbiEligible: boolean('qbi_eligible').default(false),
    preferences: jsonb('preferences').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userYearIdx: index('idx_tax_profiles_user_year').on(table.userId, table.taxYear),
}));

// Tax Deductions - Tracked deductible expenses
export const taxDeductions = pgTable('tax_deductions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    deductionCategory: text('deduction_category').notNull(),
    deductionType: text('deduction_type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    deductionDate: timestamp('deduction_date').notNull(),
    taxYear: integer('tax_year').notNull(),
    description: text('description'),
    notes: text('notes'),
    vendor: text('vendor'),
    receiptUrl: text('receipt_url'),
    isRecurring: boolean('is_recurring').default(false),
    isAutoDetected: boolean('is_auto_detected').default(false),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
    proofDocuments: jsonb('proof_documents').default([]),
    irsForm: text('irs_form'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userYearIdx: index('idx_tax_deductions_user_year').on(table.userId, table.taxYear),
    expenseIdx: index('idx_tax_deductions_expense').on(table.expenseId),
    categoryIdx: index('idx_tax_deductions_category').on(table.deductionCategory),
}));

// Tax Estimates - Real-time tax liability calculations
export const taxEstimates = pgTable('tax_estimates', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taxYear: integer('tax_year').notNull(),
    calculationDate: timestamp('calculation_date').notNull().defaultNow(),
    grossIncome: numeric('gross_income', { precision: 12, scale: 2 }).notNull(),
    adjustedGrossIncome: numeric('adjusted_gross_income', { precision: 12, scale: 2 }).notNull(),
    taxableIncome: numeric('taxable_income', { precision: 12, scale: 2 }).notNull(),
    totalDeductions: numeric('total_deductions', { precision: 12, scale: 2 }).default('0'),
    federalTax: numeric('federal_tax', { precision: 12, scale: 2 }).notNull(),
    stateTax: numeric('state_tax', { precision: 12, scale: 2 }).default('0'),
    selfEmploymentTax: numeric('self_employment_tax', { precision: 12, scale: 2 }).default('0'),
    totalTax: numeric('total_tax', { precision: 12, scale: 2 }).notNull(),
    withholdingYtd: numeric('withholding_ytd', { precision: 12, scale: 2 }).default('0'),
    estimatedPaymentsYtd: numeric('estimated_payments_ytd', { precision: 12, scale: 2 }).default('0'),
    amountOwed: numeric('amount_owed', { precision: 12, scale: 2 }),
    refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }),
    effectiveTaxRate: numeric('effective_tax_rate', { precision: 5, scale: 2 }),
    marginalTaxRate: numeric('marginal_tax_rate', { precision: 5, scale: 2 }),
    nextTaxBracketThreshold: numeric('next_tax_bracket_threshold', { precision: 12, scale: 2 }),
    scenarioName: text('scenario_name'),
    isProjection: boolean('is_projection').default(false),
    calculationDetails: jsonb('calculation_details').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userYearIdx: index('idx_tax_estimates_user_year').on(table.userId, table.taxYear),
}));

// Tax Optimization Suggestions - AI-generated tax strategies
export const taxOptimizationSuggestions = pgTable('tax_optimization_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    suggestionType: text('suggestion_type').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    potentialSavings: numeric('potential_savings', { precision: 12, scale: 2 }),
    priorityScore: integer('priority_score').default(50),
    actionRequired: text('action_required'),
    deadline: timestamp('deadline'),
    taxYear: integer('tax_year').notNull(),
    isTimeSensitive: boolean('is_time_sensitive').default(false),
    complexityLevel: text('complexity_level').default('medium'),
    requiresProfessional: boolean('requires_professional').default(false),
    relatedAccountType: text('related_account_type'),
    suggestedAmount: numeric('suggested_amount', { precision: 12, scale: 2 }),
    details: jsonb('details').default({}),
    status: text('status').default('pending'),
    appliedAt: timestamp('applied_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userStatusIdx: index('idx_tax_optimization_user_status').on(table.userId, table.status),
}));

// Quarterly Tax Payments - Estimated tax payment tracking
export const quarterlyTaxPayments = pgTable('quarterly_tax_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    taxYear: integer('tax_year').notNull(),
    quarter: integer('quarter').notNull(),
    dueDate: timestamp('due_date').notNull(),
    estimatedAmount: numeric('estimated_amount', { precision: 12, scale: 2 }).notNull(),
    safeHarborAmount: numeric('safe_harbor_amount', { precision: 12, scale: 2 }),
    recommendedAmount: numeric('recommended_amount', { precision: 12, scale: 2 }),
    actualAmountPaid: numeric('actual_amount_paid', { precision: 12, scale: 2 }),
    paymentDate: timestamp('payment_date'),
    paymentMethod: text('payment_method'),
    confirmationNumber: text('confirmation_number'),
    isPaid: boolean('is_paid').default(false),
    reminderSent: boolean('reminder_sent').default(false),
    penaltyRisk: text('penalty_risk').default('low'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userYearIdx: index('idx_quarterly_payments_user_year').on(table.userId, table.taxYear),
    dueIdx: index('idx_quarterly_payments_due').on(table.dueDate, table.isPaid),
}));

// Tax Deadlines - Important tax dates and reminders
export const taxDeadlines = pgTable('tax_deadlines', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    deadlineType: text('deadline_type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: timestamp('due_date').notNull(),
    taxYear: integer('tax_year').notNull(),
    isUniversal: boolean('is_universal').default(true),
    filingStatus: text('filing_status'),
    isCompleted: boolean('is_completed').default(false),
    reminderDaysBefore: integer('reminder_days_before').default(14),
    reminderSent: boolean('reminder_sent').default(false),
    priority: text('priority').default('medium'),
    relatedForm: text('related_form'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_tax_deadlines_user_date').on(table.userId, table.dueDate),
    universalIdx: index('idx_tax_deadlines_universal').on(table.isUniversal, table.dueDate),
}));

// Tax Advantaged Accounts - 401k, IRA, HSA tracking
export const taxAdvantagedAccounts = pgTable('tax_advantaged_accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accountType: text('account_type').notNull(),
    accountName: text('account_name'),
    employerOffered: boolean('employer_offered').default(false),
    contributionLimit: numeric('contribution_limit', { precision: 12, scale: 2 }).notNull(),
    catchUpLimit: numeric('catch_up_limit', { precision: 12, scale: 2 }),
    ytdContributions: numeric('ytd_contributions', { precision: 12, scale: 2 }).default('0'),
    employerMatchRate: numeric('employer_match_rate', { precision: 5, scale: 2 }),
    employerMatchLimit: numeric('employer_match_limit', { precision: 12, scale: 2 }),
    ytdEmployerContributions: numeric('ytd_employer_contributions', { precision: 12, scale: 2 }).default('0'),
    remainingContributionSpace: numeric('remaining_contribution_space', { precision: 12, scale: 2 }),
    recommendedContribution: numeric('recommended_contribution', { precision: 12, scale: 2 }),
    taxYear: integer('tax_year').notNull(),
    accountStatus: text('account_status').default('active'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userYearIdx: index('idx_tax_advantaged_user_year').on(table.userId, table.taxYear),
}));

// Tax Scenarios - "What if" tax planning simulations
export const taxScenarios = pgTable('tax_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioName: text('scenario_name').notNull(),
    description: text('description'),
    taxYear: integer('tax_year').notNull(),
    baseEstimateId: uuid('base_estimate_id').references(() => taxEstimates.id, { onDelete: 'set null' }),
    scenarioEstimateId: uuid('scenario_estimate_id').references(() => taxEstimates.id, { onDelete: 'set null' }),
    changes: jsonb('changes').notNull().default({}),
    taxImpact: numeric('tax_impact', { precision: 12, scale: 2 }),
    isFavorable: boolean('is_favorable'),
    assumptions: text('assumptions'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_tax_scenarios_user').on(table.userId, table.taxYear),
}));

// Tax Documents - Receipt and document vault
export const taxDocuments = pgTable('tax_documents', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    deductionId: uuid('deduction_id').references(() => taxDeductions.id, { onDelete: 'set null' }),
    documentType: text('document_type').notNull(),
    documentCategory: text('document_category').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),
    taxYear: integer('tax_year').notNull(),
    documentDate: timestamp('document_date'),
    vendorName: text('vendor_name'),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    ocrData: jsonb('ocr_data'),
    isOcrProcessed: boolean('is_ocr_processed').default(false),
    tags: text('tags').array(),
    notes: text('notes'),
    uploadedAt: timestamp('uploaded_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userYearIdx: index('idx_tax_documents_user_year').on(table.userId, table.taxYear),
    deductionIdx: index('idx_tax_documents_deduction').on(table.deductionId),
}));

// Tax Brackets - Federal and state tax bracket data
export const taxBrackets = pgTable('tax_brackets', {
    id: uuid('id').defaultRandom().primaryKey(),
    jurisdiction: text('jurisdiction').notNull(),
    taxYear: integer('tax_year').notNull(),
    filingStatus: text('filing_status').notNull(),
    bracketNumber: integer('bracket_number').notNull(),
    incomeFloor: numeric('income_floor', { precision: 12, scale: 2 }).notNull(),
    incomeCeiling: numeric('income_ceiling', { precision: 12, scale: 2 }),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    lookupIdx: index('idx_tax_brackets_lookup').on(table.jurisdiction, table.taxYear, table.filingStatus),
}));

// ============================================================================
// ADVANCED PORTFOLIO ANALYTICS & PERFORMANCE ATTRIBUTION (#653)
// ============================================================================

// Portfolio Snapshots - Daily portfolio valuations
export const portfolioSnapshots = pgTable('portfolio_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date').notNull(),
    totalValue: numeric('total_value', { precision: 18, scale: 2 }).notNull(),
    liquidValue: numeric('liquid_value', { precision: 18, scale: 2 }),
    investedValue: numeric('invested_value', { precision: 18, scale: 2 }),
    cashBalance: numeric('cash_balance', { precision: 18, scale: 2 }),
    netDeposits: numeric('net_deposits', { precision: 18, scale: 2 }).default('0'),
    dailyChange: numeric('daily_change', { precision: 18, scale: 2 }),
    dailyChangePercent: numeric('daily_change_percent', { precision: 8, scale: 4 }),
    holdingsSnapshot: jsonb('holdings_snapshot').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_portfolio_snapshots_user_date').on(table.userId, table.snapshotDate),
    vaultDateIdx: index('idx_portfolio_snapshots_vault_date').on(table.vaultId, table.snapshotDate),
}));

// Performance Metrics - Calculated returns and performance indicators
export const performanceMetrics = pgTable('performance_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    periodType: text('period_type').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    beginningValue: numeric('beginning_value', { precision: 18, scale: 2 }).notNull(),
    endingValue: numeric('ending_value', { precision: 18, scale: 2 }).notNull(),
    netCashFlow: numeric('net_cash_flow', { precision: 18, scale: 2 }).default('0'),
    simpleReturn: numeric('simple_return', { precision: 10, scale: 6 }),
    timeWeightedReturn: numeric('time_weighted_return', { precision: 10, scale: 6 }),
    moneyWeightedReturn: numeric('money_weighted_return', { precision: 10, scale: 6 }),
    annualizedReturn: numeric('annualized_return', { precision: 10, scale: 6 }),
    totalGainLoss: numeric('total_gain_loss', { precision: 18, scale: 2 }),
    realizedGains: numeric('realized_gains', { precision: 18, scale: 2 }),
    unrealizedGains: numeric('unrealized_gains', { precision: 18, scale: 2 }),
    dividendIncome: numeric('dividend_income', { precision: 18, scale: 2 }),
    interestIncome: numeric('interest_income', { precision: 18, scale: 2 }),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userPeriodIdx: index('idx_performance_metrics_user_period').on(table.userId, table.periodType, table.periodEnd),
    vaultPeriodIdx: index('idx_performance_metrics_vault_period').on(table.vaultId, table.periodType, table.periodEnd),
}));

// Benchmark Prices - Historical benchmark index prices
export const benchmarkPrices = pgTable('benchmark_prices', {
    id: uuid('id').defaultRandom().primaryKey(),
    benchmarkSymbol: text('benchmark_symbol').notNull(),
    benchmarkName: text('benchmark_name').notNull(),
    priceDate: timestamp('price_date').notNull(),
    openPrice: numeric('open_price', { precision: 12, scale: 4 }),
    highPrice: numeric('high_price', { precision: 12, scale: 4 }),
    lowPrice: numeric('low_price', { precision: 12, scale: 4 }),
    closePrice: numeric('close_price', { precision: 12, scale: 4 }).notNull(),
    adjustedClose: numeric('adjusted_close', { precision: 12, scale: 4 }),
    volume: numeric('volume', { precision: 20, scale: 0 }),
    dailyReturn: numeric('daily_return', { precision: 10, scale: 6 }),
    dataSource: text('data_source').default('yahoo_finance'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    symbolDateIdx: index('idx_benchmark_prices_symbol_date').on(table.benchmarkSymbol, table.priceDate),
}));

// Benchmark Comparisons - Portfolio vs benchmark analysis
export const benchmarkComparisons = pgTable('benchmark_comparisons', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    benchmarkSymbol: text('benchmark_symbol').notNull(),
    periodType: text('period_type').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    portfolioReturn: numeric('portfolio_return', { precision: 10, scale: 6 }).notNull(),
    benchmarkReturn: numeric('benchmark_return', { precision: 10, scale: 6 }).notNull(),
    relativeReturn: numeric('relative_return', { precision: 10, scale: 6 }),
    trackingError: numeric('tracking_error', { precision: 10, scale: 6 }),
    informationRatio: numeric('information_ratio', { precision: 10, scale: 6 }),
    upCaptureRatio: numeric('up_capture_ratio', { precision: 10, scale: 6 }),
    downCaptureRatio: numeric('down_capture_ratio', { precision: 10, scale: 6 }),
    correlation: numeric('correlation', { precision: 8, scale: 6 }),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userBenchmarkIdx: index('idx_benchmark_comparisons_user_benchmark').on(table.userId, table.benchmarkSymbol, table.periodEnd),
}));

// Risk Metrics - Calculated risk measures
export const riskMetrics = pgTable('risk_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    periodType: text('period_type').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    volatility: numeric('volatility', { precision: 10, scale: 6 }),
    downsideDeviation: numeric('downside_deviation', { precision: 10, scale: 6 }),
    sharpeRatio: numeric('sharpe_ratio', { precision: 10, scale: 6 }),
    sortinoRatio: numeric('sortino_ratio', { precision: 10, scale: 6 }),
    maxDrawdown: numeric('max_drawdown', { precision: 10, scale: 6 }),
    maxDrawdownStart: timestamp('max_drawdown_start'),
    maxDrawdownEnd: timestamp('max_drawdown_end'),
    maxDrawdownRecoveryDate: timestamp('max_drawdown_recovery_date'),
    currentDrawdown: numeric('current_drawdown', { precision: 10, scale: 6 }),
    beta: numeric('beta', { precision: 10, scale: 6 }),
    alpha: numeric('alpha', { precision: 10, scale: 6 }),
    var95: numeric('var_95', { precision: 18, scale: 2 }),
    cvar95: numeric('cvar_95', { precision: 18, scale: 2 }),
    calmarRatio: numeric('calmar_ratio', { precision: 10, scale: 6 }),
    riskFreeRate: numeric('risk_free_rate', { precision: 6, scale: 4 }).default('0.045'),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userPeriodIdx: index('idx_risk_metrics_user_period').on(table.userId, table.periodType, table.periodEnd),
}));

// Performance Attributions - Return decomposition by asset/sector
export const performanceAttributions = pgTable('performance_attributions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    attributionType: text('attribution_type').notNull(),
    categoryName: text('category_name').notNull(),
    beginningValue: numeric('beginning_value', { precision: 18, scale: 2 }),
    endingValue: numeric('ending_value', { precision: 18, scale: 2 }),
    weightPercent: numeric('weight_percent', { precision: 8, scale: 4 }),
    totalReturn: numeric('total_return', { precision: 10, scale: 6 }),
    contributionToReturn: numeric('contribution_to_return', { precision: 10, scale: 6 }),
    capitalGain: numeric('capital_gain', { precision: 18, scale: 2 }),
    dividendIncome: numeric('dividend_income', { precision: 18, scale: 2 }),
    realizedGain: numeric('realized_gain', { precision: 18, scale: 2 }),
    unrealizedGain: numeric('unrealized_gain', { precision: 18, scale: 2 }),
    details: jsonb('details').default({}),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userTypeIdx: index('idx_performance_attributions_user_type').on(table.userId, table.attributionType, table.periodEnd),
}));

// Sector Allocations - Sector exposure tracking
export const sectorAllocations = pgTable('sector_allocations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    allocationDate: timestamp('allocation_date').notNull(),
    sectorName: text('sector_name').notNull(),
    allocationValue: numeric('allocation_value', { precision: 18, scale: 2 }).notNull(),
    allocationPercent: numeric('allocation_percent', { precision: 8, scale: 4 }).notNull(),
    numberOfHoldings: integer('number_of_holdings').default(0),
    topHoldings: jsonb('top_holdings').default([]),
    sectorReturnYtd: numeric('sector_return_ytd', { precision: 10, scale: 6 }),
    benchmarkSectorWeight: numeric('benchmark_sector_weight', { precision: 8, scale: 4 }),
    overUnderWeight: numeric('over_under_weight', { precision: 8, scale: 4 }),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_sector_allocations_user_date').on(table.userId, table.allocationDate),
}));

// Geographic Allocations - Geographic exposure tracking
export const geographicAllocations = pgTable('geographic_allocations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    allocationDate: timestamp('allocation_date').notNull(),
    region: text('region').notNull(),
    country: text('country'),
    allocationValue: numeric('allocation_value', { precision: 18, scale: 2 }).notNull(),
    allocationPercent: numeric('allocation_percent', { precision: 8, scale: 4 }).notNull(),
    numberOfHoldings: integer('number_of_holdings').default(0),
    currencyExposure: text('currency_exposure'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_geographic_allocations_user_date').on(table.userId, table.allocationDate),
}));

// Performance Alerts - Alert configurations and history
export const performanceAlerts = pgTable('performance_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    alertType: text('alert_type').notNull(),
    alertName: text('alert_name').notNull(),
    description: text('description'),
    thresholdValue: numeric('threshold_value', { precision: 10, scale: 6 }),
    comparisonOperator: text('comparison_operator').default('greater_than'),
    benchmarkSymbol: text('benchmark_symbol'),
    isActive: boolean('is_active').default(true),
    priority: text('priority').default('medium'),
    notificationChannels: jsonb('notification_channels').default(['email', 'push']),
    triggeredAt: timestamp('triggered_at'),
    triggerCount: integer('trigger_count').default(0),
    lastTriggeredValue: numeric('last_triggered_value', { precision: 10, scale: 6 }),
    triggerDetails: jsonb('trigger_details'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userActiveIdx: index('idx_performance_alerts_user_active').on(table.userId, table.isActive),
}));

// Performance Reports - Generated report metadata
export const performanceReports = pgTable('performance_reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    reportType: text('report_type').notNull(),
    reportPeriodStart: timestamp('report_period_start').notNull(),
    reportPeriodEnd: timestamp('report_period_end').notNull(),
    reportFormat: text('report_format').default('pdf'),
    fileUrl: text('file_url'),
    fileName: text('file_name'),
    fileSize: integer('file_size'),
    reportSections: jsonb('report_sections').default([]),
    generationStatus: text('generation_status').default('pending'),
    generatedAt: timestamp('generated_at'),
    errorMessage: text('error_message'),
    downloadCount: integer('download_count').default(0),
    lastDownloadedAt: timestamp('last_downloaded_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userStatusIdx: index('idx_performance_reports_user_status').on(table.userId, table.generationStatus, table.createdAt),
}));

// ============================================================================
// AI-POWERED SMART ASSET ALLOCATION ADVISOR (#654)
// ============================================================================

// User Profiles - Risk tolerance and financial profiling
export const userProfiles = pgTable('user_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    riskTolerance: text('risk_tolerance').notNull().default('moderate'),
    riskScore: numeric('risk_score', { precision: 5, scale: 2 }).notNull().default('50'),
    ageGroup: text('age_group'),
    incomeLevel: text('income_level'),
    jobStability: text('job_stability'),
    employmentType: text('employment_type'),
    debtRatio: numeric('debt_ratio', { precision: 5, scale: 2 }).default('0'),
    liquidityRatio: numeric('liquidity_ratio', { precision: 5, scale: 2 }).default('0'),
    netWorth: numeric('net_worth', { precision: 15, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_user_profiles_user_id').on(table.userId),
    riskIdx: index('idx_user_profiles_risk_tolerance').on(table.riskTolerance),
}));

// Allocation Recommendations - AI-powered portfolio recommendations
export const allocationRecommendations = pgTable('allocation_recommendations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    recommendationDate: timestamp('recommendation_date').defaultNow(),
    equityPercentage: numeric('equity_percentage', { precision: 5, scale: 2 }).notNull(),
    bondPercentage: numeric('bond_percentage', { precision: 5, scale: 2 }).notNull(),
    cashPercentage: numeric('cash_percentage', { precision: 5, scale: 2 }).notNull(),
    alternativesPercentage: numeric('alternatives_percentage', { precision: 5, scale: 2 }).default('0'),
    realEstatePercentage: numeric('real_estate_percentage', { precision: 5, scale: 2 }).default('0'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }).default('80'),
    expectedReturn: numeric('expected_return', { precision: 5, scale: 2 }).notNull(),
    expectedVolatility: numeric('expected_volatility', { precision: 5, scale: 2 }).notNull(),
    sharpeRatio: numeric('sharpe_ratio', { precision: 5, scale: 2 }),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_allocation_recommendations_user_id').on(table.userId),
    vaultIdx: index('idx_allocation_recommendations_vault_id').on(table.vaultId),
    statusIdx: index('idx_allocation_recommendations_status').on(table.status),
}));

// Allocation Targets - Goal-specific allocation targets
export const allocationTargets = pgTable('allocation_targets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id'),
    equityPercentage: numeric('equity_percentage', { precision: 5, scale: 2 }).notNull(),
    bondPercentage: numeric('bond_percentage', { precision: 5, scale: 2 }).notNull(),
    cashPercentage: numeric('cash_percentage', { precision: 5, scale: 2 }).notNull(),
    alternativesPercentage: numeric('alternatives_percentage', { precision: 5, scale: 2 }).default('0'),
    targetDate: timestamp('target_date').notNull(),
    expectedReturn: numeric('expected_return', { precision: 5, scale: 2 }).notNull(),
    fundingGap: numeric('funding_gap', { precision: 15, scale: 2 }),
    probability: numeric('probability', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_allocation_targets_user_id').on(table.userId),
    goalIdx: index('idx_allocation_targets_goal_id').on(table.goalId),
    dateIdx: index('idx_allocation_targets_target_date').on(table.targetDate),
}));

// Glide Paths - Automatic allocation adjustments over time
export const glidePaths = pgTable('glide_paths', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id'),
    startAllocation: jsonb('start_allocation').notNull(),
    endAllocation: jsonb('end_allocation').notNull(),
    startDate: timestamp('start_date').notNull(),
    targetDate: timestamp('target_date').notNull(),
    adjustmentFrequency: text('adjustment_frequency').default('yearly'),
    currentAllocation: jsonb('current_allocation').notNull(),
    nextAdjustmentDate: timestamp('next_adjustment_date'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_glide_paths_user_id').on(table.userId),
    goalIdx: index('idx_glide_paths_goal_id').on(table.goalId),
    adjustIdx: index('idx_glide_paths_next_adjustment').on(table.nextAdjustmentDate),
}));

// Scenario Projections - Monte Carlo scenario analysis
export const scenarioProjections = pgTable('scenario_projections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    scenarioType: text('scenario_type').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    projections: jsonb('projections').notNull(),
    successProbability: numeric('success_probability', { precision: 5, scale: 2 }),
    endingValue: numeric('ending_value', { precision: 15, scale: 2 }),
    volatility: numeric('volatility', { precision: 5, scale: 2 }),
    maxDrawdown: numeric('max_drawdown', { precision: 5, scale: 2 }),
    monteCarloIterations: integer('monte_carlo_iterations').default(1000),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_scenario_projections_user_id').on(table.userId),
    typeIdx: index('idx_scenario_projections_scenario_type').on(table.scenarioType),
}));

// Asset Class Allocations - Granular asset class tracking
export const assetClassAllocations = pgTable('asset_class_allocations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    allocationId: uuid('allocation_id').references(() => allocationRecommendations.id, { onDelete: 'cascade' }),
    assetClass: text('asset_class').notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }).notNull(),
    targetValue: numeric('target_value', { precision: 15, scale: 2 }),
    currentValue: numeric('current_value', { precision: 15, scale: 2 }),
    variance: numeric('variance', { precision: 5, scale: 2 }),
    drift: numeric('drift', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_asset_class_allocations_user_id').on(table.userId),
    allocIdx: index('idx_asset_class_allocations_allocation_id').on(table.allocationId),
}));

// Peer Benchmarks - Allocation benchmarking data
export const peerBenchmarks = pgTable('peer_benchmarks', {
    id: uuid('id').defaultRandom().primaryKey(),
    profileGroup: text('profile_group').notNull(),
    assetClass: text('asset_class').notNull(),
    medianAllocation: numeric('median_allocation', { precision: 5, scale: 2 }).notNull(),
    p25Allocation: numeric('p25_allocation', { precision: 5, scale: 2 }),
    p75Allocation: numeric('p75_allocation', { precision: 5, scale: 2 }),
    count: integer('count').default(0),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

// Allocation Change History - Track allocation modifications
export const allocationChangeHistory = pgTable('allocation_change_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    allocationId: uuid('allocation_id').references(() => allocationRecommendations.id, { onDelete: 'cascade' }),
    previousAllocation: jsonb('previous_allocation'),
    newAllocation: jsonb('new_allocation').notNull(),
    reason: text('reason'),
    changedDate: timestamp('changed_date').defaultNow(),
    changedBy: uuid('changed_by').references(() => users.id),
}, (table) => ({
    userIdx: index('idx_allocation_change_history_user_id').on(table.userId),
    allocIdx: index('idx_allocation_change_history_allocation_id').on(table.allocationId),
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

// ============================================================================
// INSTITUTIONAL GOVERNANCE & MULTI-RESOLUTION PROTOCOL (#453)
// ============================================================================

export const shadowEntities = pgTable('shadow_entities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(), // e.g., "Family Trust", "Wealth LLC"
    entityType: text('entity_type').notNull(), // 'trust', 'llc', 'family_office'
    taxId: text('tax_id'),
    legalAddress: text('legal_address'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const bylawDefinitions = pgTable('bylaw_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id').references(() => shadowEntities.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    thresholdAmount: numeric('threshold_amount', { precision: 24, scale: 8 }).notNull(),
    requiredQuorum: doublePrecision('required_quorum').notNull(), // e.g., 0.66 for 2/3
    votingPeriodHours: integer('voting_period_hours').default(48),
    autoExecute: boolean('auto_execute').default(true),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const governanceResolutions = pgTable('governance_resolutions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    bylawId: uuid('bylaw_id').references(() => bylawDefinitions.id, { onDelete: 'cascade' }).notNull(),
    resolutionType: text('resolution_type').notNull(), // 'spend', 'transfer', 'bylaw_change'
    status: text('status').default('open'), // 'open', 'passed', 'failed', 'executed'
    payload: jsonb('payload').notNull(), // The transaction details being proposed
    votesFor: integer('votes_for').default(0),
    votesAgainst: integer('votes_against').default(0),
    totalEligibleVotes: integer('total_eligible_votes').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    executedAt: timestamp('executed_at'),
});

export const votingRecords = pgTable('voting_records', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    resolutionId: uuid('resolution_id').references(() => governanceResolutions.id, { onDelete: 'cascade' }).notNull(),
    vote: text('vote').notNull(), // 'yes', 'no'
    votedAt: timestamp('voted_at').defaultNow(),
    reason: text('reason'),
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
    isSealed: boolean('is_sealed').default(false),
    auditAnchorId: uuid('audit_anchor_id').references(() => auditAnchors.id),
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
    isSealed: boolean('is_sealed').default(false),
    auditAnchorId: uuid('audit_anchor_id').references(() => auditAnchors.id),
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

// ============================================================================
// IMMUTABLE GOVERNANCE & MERKLE AUDITS (#475)
// ============================================================================

export const auditAnchors = pgTable('audit_anchors', {
    id: uuid('id').defaultRandom().primaryKey(),
    merkleRoot: text('merkle_root').notNull(),
    previousAnchorId: uuid('previous_anchor_id'), // Hash chain link
    eventCount: integer('event_count').notNull(),
    sealedAt: timestamp('sealed_at').defaultNow(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    sealMetadata: jsonb('seal_metadata').default({}), // Storage for range info
});

export const auditAnchorsRelations = relations(auditAnchors, ({ one }) => ({
    previousAnchor: one(auditAnchors, { fields: [auditAnchors.previousAnchorId], references: [auditAnchors.id] }),
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

// Removed duplicate taxLots definition (defined at line 1399)

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

// Removed duplicate escrowContracts definition (defined at line 4852)

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
});

export const investmentRecommendations = pgTable('investment_recommendations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }),
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
}));

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

export const harvestOpportunitiesRelations = relations(harvestOpportunities, ({ one }) => ({
    user: one(users, { fields: [harvestOpportunities.userId], references: [users.id] }),
    investment: one(investments, { fields: [harvestOpportunities.investmentId], references: [investments.id] }),
}));

export const washSaleLogsRelations = relations(washSaleLogs, ({ one }) => ({
    user: one(users, { fields: [washSaleLogs.userId], references: [users.id] }),
    investment: one(investments, { fields: [washSaleLogs.investmentId], references: [investments.id] }),
    replacementLot: one(taxLots, { fields: [washSaleLogs.replacementLotId], references: [taxLots.id] }),
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

export const shadowEntitiesRelations = relations(shadowEntities, ({ one, many }) => ({
    user: one(users, { fields: [shadowEntities.userId], references: [users.id] }),
    bylaws: many(bylawDefinitions),
}));

export const bylawDefinitionsRelations = relations(bylawDefinitions, ({ one, many }) => ({
    entity: one(shadowEntities, { fields: [bylawDefinitions.entityId], references: [shadowEntities.id] }),
    vault: one(vaults, { fields: [bylawDefinitions.vaultId], references: [vaults.id] }),
    resolutions: many(governanceResolutions),
}));

export const governanceResolutionsRelations = relations(governanceResolutions, ({ one, many }) => ({
    user: one(users, { fields: [governanceResolutions.userId], references: [users.id] }),
    bylaw: one(bylawDefinitions, { fields: [governanceResolutions.bylawId], references: [bylawDefinitions.id] }),
    votes: many(votingRecords),
}));

export const votingRecordsRelations = relations(votingRecords, ({ one }) => ({
    user: one(users, { fields: [votingRecords.userId], references: [users.id] }),
    resolution: one(governanceResolutions, { fields: [votingRecords.resolutionId], references: [governanceResolutions.id] }),
}));

// ============================================================================
// AUTONOMOUS "FINANCIAL AUTOPILOT" & EVENT-DRIVEN WORKFLOW ORCHESTRATOR (#461)
// ============================================================================


export const autopilotWorkflows = pgTable('autopilot_workflows', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').default('draft').notNull(), // 'active', 'paused', 'draft', 'archived'
    triggerLogic: text('trigger_logic').default('AND').notNull(), // 'AND' | 'OR'
    domain: text('domain').notNull(), // 'VAULT','EXPENSE','INVESTMENT','DEBT','GOVERNANCE','MACRO'
    priority: integer('priority').default(0),
    cooldownMinutes: integer('cooldown_minutes').default(60),
    lastExecutedAt: timestamp('last_executed_at'),
    executionCount: integer('execution_count').default(0),
    maxExecutions: integer('max_executions'),
    dslDefinition: jsonb('dsl_definition').default({}),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_autopilot_user').on(table.userId),
    statusIdx: index('idx_autopilot_status').on(table.status),
    domainIdx: index('idx_autopilot_domain').on(table.domain),
}));

export const workflowTriggers = pgTable('workflow_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id').references(() => autopilotWorkflows.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    variable: text('variable').notNull(),
    operator: text('operator').notNull(),
    thresholdValue: numeric('threshold_value', { precision: 24, scale: 8 }).notNull(),
    scopeVaultId: uuid('scope_vault_id').references(() => vaults.id, { onDelete: 'set null' }),
    currentStatus: boolean('current_status').default(false),
    lastCheckedAt: timestamp('last_checked_at').defaultNow(),
    lastValueObserved: numeric('last_value_observed', { precision: 24, scale: 8 }),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    workflowIdx: index('idx_trigger_workflow').on(table.workflowId),
    userIdx: index('idx_trigger_user').on(table.userId),
    variableIdx: index('idx_trigger_variable').on(table.variable),
}));

export const workflowActions = pgTable('workflow_actions', {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id').references(() => autopilotWorkflows.id, { onDelete: 'cascade' }).notNull(),
    stepOrder: integer('step_order').notNull(),
    actionType: text('action_type').notNull(),
    parameters: jsonb('parameters').default({}),
    abortOnFailure: boolean('abort_on_failure').default(true),
    lastRunStatus: text('last_run_status').default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    workflowStepIdx: index('idx_action_workflow_step').on(table.workflowId, table.stepOrder),
}));

export const workflowExecutionLogs = pgTable('workflow_execution_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    workflowId: uuid('workflow_id').references(() => autopilotWorkflows.id, { onDelete: 'cascade' }).notNull(),
    triggerEvent: text('trigger_event'),
    resultStatus: text('result_status').notNull(),
    triggerSnapshot: jsonb('trigger_snapshot').default({}),
    actionResults: jsonb('action_results').default([]),
    summary: text('summary'),
    executedAt: timestamp('executed_at').defaultNow(),
    durationMs: integer('duration_ms'),
});

// Autopilot relations
export const autopilotWorkflowsRelations = relations(autopilotWorkflows, ({ one, many }) => ({
    user: one(users, { fields: [autopilotWorkflows.userId], references: [users.id] }),
    triggers: many(workflowTriggers),
    actions: many(workflowActions),
    executionLogs: many(workflowExecutionLogs),
}));

export const workflowTriggersRelations = relations(workflowTriggers, ({ one }) => ({
    workflow: one(autopilotWorkflows, { fields: [workflowTriggers.workflowId], references: [autopilotWorkflows.id] }),
    user: one(users, { fields: [workflowTriggers.userId], references: [users.id] }),
    vault: one(vaults, { fields: [workflowTriggers.scopeVaultId], references: [vaults.id] }),
}));

export const workflowActionsRelations = relations(workflowActions, ({ one }) => ({
    workflow: one(autopilotWorkflows, { fields: [workflowActions.workflowId], references: [autopilotWorkflows.id] }),
}));

export const workflowExecutionLogsRelations = relations(workflowExecutionLogs, ({ one }) => ({
    user: one(users, { fields: [workflowExecutionLogs.userId], references: [users.id] }),
    workflow: one(autopilotWorkflows, { fields: [workflowExecutionLogs.workflowId], references: [autopilotWorkflows.id] }),
}));

// ============================================================================
// STRESS TESTING & TOPOLOGY VISUALIZER (#465)
// ============================================================================

export const topologySnapshots = pgTable('topology_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    nodeCount: integer('node_count').notNull(),
    linkCount: integer('link_count').notNull(),
    totalNetworkWealth: numeric('total_network_wealth', { precision: 15, scale: 2 }).notNull(),
    maxFragilityIndex: numeric('max_fragility_index', { precision: 8, scale: 4 }),
    graphData: jsonb('graph_data').notNull(), // D3 compatible JSON
    createdAt: timestamp('created_at').defaultNow(),
});

export const stressTestSimulations = pgTable('stress_test_simulations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    targetVaultId: uuid('target_vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    shockPercentage: numeric('shock_percentage', { precision: 5, scale: 2 }).notNull(), // 0 to 100
    totalNetworkLoss: numeric('total_network_loss', { precision: 15, scale: 2 }).notNull(),
    insolventVaultsCount: integer('insolvent_vaults_count').default(0),
    maxImpactLevel: integer('max_impact_level').default(0), // How deep the shock propagated
    results: jsonb('results').notNull(), // Vault by vault impacts
    isSystemTriggered: boolean('is_system_triggered').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// PROBABILISTIC MONTE CARLO LONGEVITY & ESTATE-TAX FORECASTER (#480)
// ============================================================================

export const monteCarloRuns = pgTable('monte_carlo_runs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    simulationParams: jsonb('simulation_params').notNull(),
    longevityRiskScore: numeric('longevity_risk_score', { precision: 5, scale: 2 }), // probability of outliving capital
    estateTaxBreachYear: integer('estate_tax_breach_year'),
    successRate: numeric('success_rate', { precision: 5, scale: 2 }),
    percentiles: jsonb('percentiles').notNull(), // 10th, 50th, 90th percentile trajectories
    createdAt: timestamp('created_at').defaultNow(),
});

export const mortalityAssumptions = pgTable('mortality_assumptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currentAge: integer('current_age').notNull(),
    targetRetirementAge: integer('target_retirement_age').notNull(),
    lifeExpectancy: integer('life_expectancy').notNull(),
    healthMultiplier: numeric('health_multiplier', { precision: 3, scale: 2 }).default('1.00'), // Adjusts base mortality table
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const estateBrackets = pgTable('estate_brackets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    jurisdiction: text('jurisdiction').notNull(), // e.g. "US_FEDERAL", "STATE_NY"
    exemptionThreshold: numeric('exemption_threshold', { precision: 20, scale: 2 }).notNull(),
    taxRatePercentage: numeric('tax_rate_percentage', { precision: 5, scale: 2 }).notNull(),
// SMART ESCROW & STOCHASTIC HEDGING SYSTEM (#481)
// ============================================================================

export const escrowContracts = pgTable('escrow_contracts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    baseCurrency: text('base_currency').notNull(), // User's home currency (e.g., USD)
    escrowCurrency: text('escrow_currency').notNull(), // Lock currency (e.g., EUR)
    totalAmount: numeric('total_amount', { precision: 20, scale: 2 }).notNull(),
    lockedAmount: numeric('locked_amount', { precision: 20, scale: 2 }).notNull(),
    status: text('status').default('active'), // active, completed, defaulted, liquidated
    vaultId: uuid('vault_id').references(() => vaults.id), // Where funds are backed
    multiSigConfig: jsonb('multi_sig_config').notNull(), // Keys/Signers required
    expiryDate: timestamp('expiry_date'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const trancheReleases = pgTable('tranche_releases', {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
    milestoneName: text('milestone_name').notNull(),
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
    isReleased: boolean('is_released').default(false),
    signaturesCollected: jsonb('signatures_collected').default([]),
    releasedAt: timestamp('released_at'),
});

export const activeHedges = pgTable('active_hedges', {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
    hedgeType: text('hedge_type').notNull(), // FORWARD, SYNTH_STABLE, SWAP
    notionalAmount: numeric('notional_amount', { precision: 20, scale: 2 }).notNull(),
    entryRate: numeric('entry_rate', { precision: 12, scale: 6 }).notNull(),
    currentValue: numeric('current_value', { precision: 20, scale: 2 }),
    marginBuffer: numeric('margin_buffer', { precision: 20, scale: 2 }),
    lastRevaluationAt: timestamp('last_revaluation_at').defaultNow(),
});

export const escrowAuditLogs = pgTable('escrow_audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id').references(() => escrowContracts.id, { onDelete: 'cascade' }).notNull(),
    action: text('action').notNull(), // SIGNATURE_CAST, TRANCHE_RELEASE, HEDGE_ADJUST, MARGIN_CALL
    actor: text('actor').notNull(),
    details: jsonb('details'),
    timestamp: timestamp('timestamp').defaultNow(),
});
// ============================================================================
// MILP-BASED CROSS-BORDER LIQUIDITY OPTIMIZER (#476)
// ============================================================================

export const transferPaths = pgTable('transfer_paths', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceVaultId: uuid('source_vault_id').references(() => vaults.id).notNull(),
    destinationVaultId: uuid('destination_vault_id').references(() => vaults.id).notNull(),
    baseFee: numeric('base_fee', { precision: 10, scale: 2 }).default('0'), // Transaction flat fee
    platformFeePct: numeric('platform_fee_pct', { precision: 5, scale: 4 }).default('0'), // 0.001 = 0.1%
    averageProcessingTimeDays: integer('avg_processing_time_days').default(1),
    isInternational: boolean('is_international').default(false),
    isActive: boolean('is_active').default(true),
});

export const entityTaxRules = pgTable('entity_tax_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceEntityId: uuid('source_entity_id').references(() => entities.id).notNull(),
    destinationEntityId: uuid('destination_entity_id').references(() => entities.id).notNull(),
    withholdingTaxPct: numeric('withholding_tax_pct', { precision: 5, scale: 4 }).default('0'),
    regulatoryFilingRequired: boolean('regulatory_filing_required').default(false),
});

export const optimizationRuns = pgTable('optimization_runs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    targetAmountUSD: numeric('target_amount_usd', { precision: 20, scale: 2 }).notNull(),
    destinationVaultId: uuid('destination_vault_id').references(() => vaults.id).notNull(),
    optimalPath: jsonb('optimal_path').notNull(), // Array of steps
    totalEstimatedFeeUSD: numeric('total_estimated_fee_usd', { precision: 15, scale: 2 }),
    totalTaxImpactUSD: numeric('total_tax_impact_usd', { precision: 15, scale: 2 }),
    status: text('status').default('calculated'), // calculated, executed, failed
    createdAt: timestamp('created_at').defaultNow(),
});
// ============================================================================
// CRYPTOGRAPHIC MERKLE AUDIT TRAIL (#475)
// ============================================================================

export const auditAnchors = pgTable('audit_anchors', {
    id: uuid('id').defaultRandom().primaryKey(),
    merkleRoot: text('merkle_root').notNull(),
    startSlot: timestamp('start_slot').notNull(),
    endSlot: timestamp('end_slot').notNull(),
    previousAnchorHash: text('previous_anchor_hash'), // For hash chaining anchors
    eventCount: integer('event_count').default(0),
    signature: text('signature'), // Optional: System signature of the root
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// ASYMMETRIC SPV PARTNERSHIP & LP/GP WATERFALL DISTRIBUTION ENGINE (#510)
// ============================================================================

export const spvEntities = pgTable('spv_entities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    gpEntityId: uuid('gp_entity_id').references(() => entities.id), // The entity managing the SPV
    status: text('status').default('active'), // 'active', 'liquidating', 'closed'
    initialAssetValue: numeric('initial_asset_value', { precision: 20, scale: 2 }),
    totalCommittedCapital: numeric('total_committed_capital', { precision: 20, scale: 2 }).default('0'),
    totalCalledCapital: numeric('total_called_capital', { precision: 20, scale: 2 }).default('0'),
// MULTI-SIG TREASURY & SOCIAL RECOVERY LAYER (#497)
// ============================================================================

// Vault Guardians - Shamir Secret Sharing shard holders
export const vaultGuardians = pgTable('vault_guardians', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Vault owner
    guardianUserId: uuid('guardian_user_id').references(() => users.id).notNull(), // Guardian
    
    // Guardian Identity
    guardianEmail: text('guardian_email').notNull(),
    guardianName: text('guardian_name').notNull(),
    guardianRole: text('guardian_role').notNull(), // 'family', 'lawyer', 'accountant', 'trustee', 'executor', 'friend'
    
    // Shamir Secret Sharing
    shardIndex: integer('shard_index').notNull(), // 1-7
    encryptedShard: text('encrypted_shard').notNull(), // Encrypted with guardian's public key
    shardChecksum: text('shard_checksum').notNull(), // Hash for integrity verification
    
    // Permissions
    canInitiateRecovery: boolean('can_initiate_recovery').default(true),
    canApproveTransactions: boolean('can_approve_transactions').default(false),
    approvalWeight: integer('approval_weight').default(1), // For weighted multi-sig
    
    // Status
    isActive: boolean('is_active').default(true),
    activatedAt: timestamp('activated_at'),
    lastVerifiedAt: timestamp('last_verified_at'), // Last time guardian confirmed their shard
    
    // Metadata

// ============================================================================
// ASYMMETRIC SPV PARTNERSHIP & LP/GP WATERFALL DISTRIBUTION ENGINE (#510)
// ============================================================================

export const spvEntities = pgTable('spv_entities', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    gpEntityId: uuid('gp_entity_id').references(() => entities.id), // The entity managing the SPV
    status: text('status').default('active'), // 'active', 'liquidating', 'closed'
    initialAssetValue: numeric('initial_asset_value', { precision: 20, scale: 2 }),
    totalCommittedCapital: numeric('total_committed_capital', { precision: 20, scale: 2 }).default('0'),
    totalCalledCapital: numeric('total_called_capital', { precision: 20, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const lpCommitments = pgTable('lp_commitments', {
    id: uuid('id').defaultRandom().primaryKey(),
    spvId: uuid('spv_id').references(() => spvEntities.id, { onDelete: 'cascade' }).notNull(),
    lpEntityId: uuid('lp_entity_id').references(() => entities.id).notNull(), // Target entity for the commitment
    committedAmount: numeric('committed_amount', { precision: 20, scale: 2 }).notNull(),
    calledAmount: numeric('called_amount', { precision: 20, scale: 2 }).default('0'),
    ownershipPrc: numeric('ownership_prc', { precision: 7, scale: 4 }).notNull(), // Percentage of capital stake
    status: text('status').default('active'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const waterfallTiers = pgTable('waterfall_tiers', {
    id: uuid('id').defaultRandom().primaryKey(),
    spvId: uuid('spv_id').references(() => spvEntities.id, { onDelete: 'cascade' }).notNull(),
    tierOrder: integer('tier_order').notNull(), // 1, 2, 3...
    name: text('name').notNull(), // e.g. '8% Preferred Return'
    allocationType: text('allocation_type').notNull(), // 'hurdle', 'catch_up', 'carried_interest'
    thresholdIrr: numeric('threshold_irr', { precision: 5, scale: 4 }), // Hurdle rate (e.g. 0.08)
    lpSplit: numeric('lp_split', { precision: 5, scale: 4 }).notNull(), // Percentage to LPs (e.g. 1.0 for preferred)
    gpSplit: numeric('gp_split', { precision: 5, scale: 4 }).notNull(), // Percentage to GPs (e.g. 0.0)
    metadata: jsonb('metadata').default({}),
});

export const capitalCalls = pgTable('capital_calls', {
    id: uuid('id').defaultRandom().primaryKey(),
    spvId: uuid('spv_id').references(() => spvEntities.id, { onDelete: 'cascade' }).notNull(),
    callAmount: numeric('call_amount', { precision: 20, scale: 2 }).notNull(),
    callDate: timestamp('call_date').defaultNow(),
    dueDate: timestamp('due_date'),
    status: text('status').default('open'), // 'open', 'completed', 'overdue'
    description: text('description'),
    metadata: jsonb('metadata').default({}),
});

// SPV Relations
export const spvEntitiesRelations = relations(spvEntities, ({ one, many }) => ({
    user: one(users, { fields: [spvEntities.userId], references: [users.id] }),
    gpEntity: one(entities, { fields: [spvEntities.gpEntityId], references: [entities.id] }),
    commitments: many(lpCommitments),
    tiers: many(waterfallTiers),
    calls: many(capitalCalls),
}));

export const lpCommitmentsRelations = relations(lpCommitments, ({ one }) => ({
    spv: one(spvEntities, { fields: [lpCommitments.spvId], references: [spvEntities.id] }),
    lpEntity: one(entities, { fields: [lpCommitments.lpEntityId], references: [entities.id] }),
}));

export const waterfallTiersRelations = relations(waterfallTiers, ({ one }) => ({
    spv: one(spvEntities, { fields: [waterfallTiers.spvId], references: [spvEntities.id] }),
}));

export const capitalCallsRelations = relations(capitalCalls, ({ one }) => ({
    spv: one(spvEntities, { fields: [capitalCalls.spvId], references: [spvEntities.id] }),
}));

// ============================================================================
// ALGORITHMIC OPTIONS COLLAR & DERIVATIVES ENGINE (#509)
// ============================================================================

export const optionsPositions = pgTable('options_positions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    investmentId: uuid('investment_id').references(() => investments.id).notNull(), // Underlying asset
    vaultId: uuid('vault_id').references(() => vaults.id).notNull(), // Vault holding the collateral
    type: text('type').notNull(), // 'call', 'put'
    optionStyle: text('option_style').default('american'), // 'american', 'european'
    strikePrice: numeric('strike_price', { precision: 20, scale: 2 }).notNull(),
    expirationDate: timestamp('expiration_date').notNull(),
    contractsCount: numeric('contracts_count', { precision: 20, scale: 4 }).notNull(), // 1 contract usually = 100 shares
    premiumPerUnit: numeric('premium_per_unit', { precision: 10, scale: 4 }),
    status: text('status').default('open'), // 'open', 'closed', 'expired', 'assigned'
    strategyId: uuid('strategy_id'), // Link to a grouped strategy like a Collar
    isCovered: boolean('is_covered').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Recovery Requests - State machine for social recovery process
export const recoveryRequests = pgTable('recovery_requests', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Vault owner
    initiatorGuardianId: uuid('initiator_guardian_id').references(() => vaultGuardians.id).notNull(),
    
    // Recovery Configuration
    requiredShards: integer('required_shards').notNull().default(3), // M in M-of-N threshold
    totalShards: integer('total_shards').notNull().default(5), // N in M-of-N threshold
    
    // State Machine
    status: text('status').notNull().default('initiated'), // 'initiated', 'collecting_shards', 'cure_period', 'challenged', 'approved', 'executed', 'rejected', 'expired'
    
    // Cure Period (multi-day waiting period before execution)
    curePeriodDays: integer('cure_period_days').notNull().default(7), // Default 7-day wait
    cureExpiresAt: timestamp('cure_expires_at'), // When cure period ends
    
    // Challenge Mechanism
    challengedAt: timestamp('challenged_at'),
    challengedByUserId: uuid('challenged_by_user_id').references(() => users.id),
    challengeReason: text('challenge_reason'),
    
    // Recovery Target
    newOwnerEmail: text('new_owner_email').notNull(), // Email of recovery recipient
    newOwnerUserId: uuid('new_owner_user_id').references(() => users.id), // Set after email verification
    
    // Execution
    shardsCollected: integer('shards_collected').default(0),
    reconstructedSecretHash: text('reconstructed_secret_hash'), // Hash of reconstructed secret for verification
    executedAt: timestamp('executed_at'),
    executedByUserId: uuid('executed_by_user_id').references(() => users.id),
    
    // Timestamps
    initiatedAt: timestamp('initiated_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(), // Absolute expiration (30 days from initiation)
    completedAt: timestamp('completed_at'),
    
    // Metadata
    metadata: jsonb('metadata').default({}),
    auditLog: jsonb('audit_log').default([]), // State transitions log
});

// Guardian Votes - Individual guardian shard submissions for recovery
export const guardianVotes = pgTable('guardian_votes', {
    id: uuid('id').defaultRandom().primaryKey(),
    recoveryRequestId: uuid('recovery_request_id').references(() => recoveryRequests.id, { onDelete: 'cascade' }).notNull(),
    guardianId: uuid('guardian_id').references(() => vaultGuardians.id, { onDelete: 'cascade' }).notNull(),
    
    // Vote Type
    voteType: text('vote_type').notNull(), // 'shard_submission', 'approval', 'rejection', 'challenge'
    
    // Shard Submission (for recovery)
    submittedShard: text('submitted_shard'), // Decrypted shard provided by guardian
    shardVerified: boolean('shard_verified').default(false),
    
    // Transaction Approval (for recursive multi-sig)
    transactionId: uuid('transaction_id'), // Reference to pending transaction
    approvalDecision: text('approval_decision'), // 'approve', 'reject', 'abstain'
    
    // Verification
    signatureProof: text('signature_proof'), // Digital signature for non-repudiation
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    
    // Time-Lock Constraints
    submittedAt: timestamp('submitted_at').defaultNow(),
    expiresAt: timestamp('expires_at'), // Time-locked signature validity
    
    // Metadata
    comments: text('comments'),
    metadata: jsonb('metadata').default({}),
});

// Recursive Multi-Sig Rules - Complex approval logic for high-stakes transactions
export const recursiveMultiSigRules = pgTable('recursive_multi_sig_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Rule Configuration
    ruleName: text('rule_name').notNull(),
    ruleDescription: text('rule_description'),
    priority: integer('priority').default(0), // Higher priority rules evaluated first
    
    // Trigger Conditions
    triggerType: text('trigger_type').notNull(), // 'transaction_amount', 'vault_withdrawal', 'ownership_transfer', 'guardian_change'
    minAmount: numeric('min_amount', { precision: 20, scale: 2 }), // Minimum transaction amount to trigger
    maxAmount: numeric('max_amount', { precision: 20, scale: 2 }), // Maximum transaction amount covered
    
    // Approval Logic (stored as JSONB for flexibility)
    // Example: {"operator": "OR", "conditions": [
    //   {"operator": "AND", "rules": [{"role": "admin", "count": 1}, {"role": "lawyer", "count": 2}]},
    //   {"operator": "ALL", "roles": ["family"], "count": 5}
    // ]}
    approvalLogic: jsonb('approval_logic').notNull(),
    
    // Timeout Configuration
    approvalTimeoutHours: integer('approval_timeout_hours').default(72), // 3 days default
    requiresUnanimous: boolean('requires_unanimous').default(false),
    
    // Status
    isActive: boolean('is_active').default(true),
    
    // Metadata
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
export const strategyLegs = pgTable('strategy_legs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    strategyName: text('strategy_name').notNull(), // e.g. 'Zero-Cost Collar', 'Covered Call'
    strategyType: text('strategy_type').notNull(),
    underlyingInvestmentId: uuid('underlying_investment_id').references(() => investments.id).notNull(),
    status: text('status').default('active'),
    netPremium: numeric('net_premium', { precision: 20, scale: 2 }), // Total cost/credit to set up
    targetDelta: numeric('target_delta', { precision: 5, scale: 4 }), // e.g. 0.3 for a standard protective put
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const impliedVolSurfaces = pgTable('implied_vol_surfaces', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id).notNull(),
    observationDate: timestamp('observation_date').defaultNow(),
    impliedVol: numeric('implied_vol', { precision: 10, scale: 6 }), // Decimal percentage
    tenorDays: integer('tenor_days'), // e.g. 30, 60, 90
    moneyness: numeric('moneyness', { precision: 5, scale: 2 }), // e.g. 1.0 (ATM), 1.1 (OTM)
    source: text('source').default('market_oracle'),
});

// Push Subscriptions Table - For browser push notifications
export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    endpoint: text('endpoint').notNull(), // Push service endpoint URL
    p256dh: text('p256dh').notNull(), // P-256 elliptic curve Diffie-Hellman public key
    auth: text('auth').notNull(), // Authentication secret
    userAgent: text('user_agent'), // Browser/device info
    isActive: boolean('is_active').default(true),
    lastUsed: timestamp('last_used').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Derivatives Relations
export const optionsPositionsRelations = relations(optionsPositions, ({ one }) => ({
    user: one(users, { fields: [optionsPositions.userId], references: [users.id] }),
    investment: one(investments, { fields: [optionsPositions.investmentId], references: [investments.id] }),
    vault: one(vaults, { fields: [optionsPositions.vaultId], references: [vaults.id] }),
    strategy: one(strategyLegs, { fields: [optionsPositions.strategyId], references: [strategyLegs.id] }),
}));

export const strategyLegsRelations = relations(strategyLegs, ({ one, many }) => ({
    user: one(users, { fields: [strategyLegs.userId], references: [users.id] }),
    underlying: one(investments, { fields: [strategyLegs.underlyingInvestmentId], references: [investments.id] }),
    legs: many(optionsPositions),
}));

export const impliedVolSurfacesRelations = relations(impliedVolSurfaces, ({ one }) => ({
    investment: one(investments, { fields: [impliedVolSurfaces.investmentId], references: [investments.id] }),
}));

// ============================================================================
// NON-FINANCIAL "PASSION ASSET" INDEXING & COLLATERALIZATION ENGINE (#536)
// ============================================================================

export const passionAssets = pgTable('passion_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(), // e.g., "1962 Ferrari 250 GTO"
    assetCategory: text('asset_category').notNull(), // 'art', 'car', 'watch', 'wine', 'collectible'
    description: text('description'),
    acquisitionDate: timestamp('acquisition_date'),
    acquisitionCost: numeric('acquisition_cost', { precision: 20, scale: 2 }),
    currentEstimatedValue: numeric('current_estimated_value', { precision: 20, scale: 2 }),
    vaultId: uuid('vault_id').references(() => vaults.id), // Physical or digital representation in a vault
    status: text('status').default('active'), // 'active', 'collateralized', 'sold', 'lost'
    metadata: jsonb('metadata').default({}), // e.g., { make: 'Ferrari', model: '250 GTO', year: 1962 }
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const assetAppraisals = pgTable('asset_appraisals', {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id').references(() => passionAssets.id, { onDelete: 'cascade' }).notNull(),
    appraisalValue: numeric('appraisal_value', { precision: 20, scale: 2 }).notNull(),
    appraiserName: text('appraiser_name'), // e.g., "Sotheby's", "Hagerty"
    appraisalDate: timestamp('appraisal_date').defaultNow(),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }), // 0.00 to 1.00
    valuationSource: text('valuation_source').notNull(), // 'expert', 'index', 'auction_result'
    metadata: jsonb('metadata').default({}),
});

export const provenanceRecords = pgTable('provenance_records', {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id').references(() => passionAssets.id, { onDelete: 'cascade' }).notNull(),
    recordType: text('record_type').notNull(), // 'ownership_change', 'restoration', 'storage_audit', 'insurance_update'
    eventDate: timestamp('event_date').notNull(),
    description: text('description'),
    actorName: text('actor_name'), // Person or institution involved
    isVerified: boolean('is_verified').default(false),
    auditAnchorId: uuid('audit_anchor_id'), // Link to Merkle audit trail for immutability
    metadata: jsonb('metadata').default({}),
});

export const passionLoanContracts = pgTable('passion_loan_contracts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assetId: uuid('asset_id').references(() => passionAssets.id).notNull(),
    loanAmount: numeric('loan_amount', { precision: 20, scale: 2 }).notNull(),
    interestRate: numeric('interest_rate', { precision: 5, scale: 4 }).notNull(), // Annual %
    ltvRatio: numeric('ltv_ratio', { precision: 5, scale: 4 }).notNull(), // Loan-to-Value at inception
    status: text('status').default('active'), // 'active', 'liquidated', 'repaid'
    expiryDate: timestamp('expiry_date'),
    vaultId: uuid('vault_id').references(() => vaults.id), // The vault where the loan funds are held/issued
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Passion Asset Relations
export const passionAssetsRelations = relations(passionAssets, ({ one, many }) => ({
    user: one(users, { fields: [passionAssets.userId], references: [users.id] }),
    vault: one(vaults, { fields: [passionAssets.vaultId], references: [vaults.id] }),
    appraisals: many(assetAppraisals),
    provenance: many(provenanceRecords),
    loans: many(passionLoanContracts),
}));

export const assetAppraisalsRelations = relations(assetAppraisals, ({ one }) => ({
    asset: one(passionAssets, { fields: [assetAppraisals.assetId], references: [passionAssets.id] }),
}));

export const provenanceRecordsRelations = relations(provenanceRecords, ({ one }) => ({
    asset: one(passionAssets, { fields: [provenanceRecords.assetId], references: [passionAssets.id] }),
}));

export const passionLoanContractsRelations = relations(passionLoanContracts, ({ one }) => ({
    user: one(users, { fields: [passionLoanContracts.userId], references: [users.id] }),
    asset: one(passionAssets, { fields: [passionLoanContracts.assetId], references: [passionAssets.id] }),
    vault: one(vaults, { fields: [passionLoanContracts.vaultId], references: [vaults.id] }),
}));
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
    user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));
export const serviceAuthLogsRelations = relations(serviceAuthLogs, ({ one }) => ({
    service: one(serviceIdentities, {
        fields: [serviceAuthLogs.serviceId],
        references: [serviceIdentities.id],
    }),
}));

export const budgetAlertsRelations = relations(budgetAlerts, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [budgetAlerts.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [budgetAlerts.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [budgetAlerts.categoryId],
        references: [categories.id],
    }),
    deduplicationEntries: many(alertDeduplication),
}));

export const budgetAggregatesRelations = relations(budgetAggregates, ({ one }) => ({
    tenant: one(tenants, {
        fields: [budgetAggregates.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [budgetAggregates.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [budgetAggregates.categoryId],
        references: [categories.id],
    }),
}));

export const alertDeduplicationRelations = relations(alertDeduplication, ({ one }) => ({
    tenant: one(tenants, {
        fields: [alertDeduplication.tenantId],
        references: [tenants.id],
    }),
    budgetAlert: one(budgetAlerts, {
        fields: [alertDeduplication.budgetAlertId],
        references: [budgetAlerts.id],
    }),
}));

// ============================================================================
// RELATIONS FOR ISSUE #639: SMART EXPENSE CATEGORIZATION & MERCHANT RECOGNITION
// ============================================================================

export const merchantRatingsRelations = relations(merchantRatings, ({ one }) => ({
    merchant: one(merchants, {
        fields: [merchantRatings.merchantId],
        references: [merchants.id],
    }),
    user: one(users, {
        fields: [merchantRatings.userId],
        references: [users.id],
    }),
}));

export const expenseCorrectionsRelations = relations(expenseCorrections, ({ one }) => ({
    expense: one(expenses, {
        fields: [expenseCorrections.expenseId],
        references: [expenses.id],
    }),
    user: one(users, {
        fields: [expenseCorrections.userId],
        references: [users.id],
    }),
    originalCategory: one(categories, {
        fields: [expenseCorrections.originalCategoryId],
        references: [categories.id],
    }),
    correctedCategory: one(categories, {
        fields: [expenseCorrections.correctedCategoryId],
        references: [categories.id],
    }),
}));

export const ocrResultsRelations = relations(ocrResults, ({ one }) => ({
    expense: one(expenses, {
        fields: [ocrResults.expenseId],
        references: [expenses.id],
    }),
}));

export const categorySuggestionsRelations = relations(categorySuggestions, ({ one }) => ({
    expense: one(expenses, {
        fields: [categorySuggestions.expenseId],
        references: [expenses.id],
    }),
    user: one(users, {
        fields: [categorySuggestions.userId],
        references: [users.id],
    }),
    suggestedCategory: one(categories, {
        fields: [categorySuggestions.suggestedCategoryId],
        references: [categories.id],
    }),
}));

export const merchantLogosRelations = relations(merchantLogos, ({ one }) => ({
    merchant: one(merchants, {
        fields: [merchantLogos.merchantId],
        references: [merchants.id],
    }),
}));

export const receiptMetadataRelations = relations(receiptMetadata, ({ one }) => ({
    ocrResult: one(ocrResults, {
        fields: [receiptMetadata.ocrResultId],
        references: [ocrResults.id],
    }),
    expense: one(expenses, {
        fields: [receiptMetadata.expenseId],
        references: [expenses.id],
    }),
}));

export const categorizationTrainingSnapshotsRelations = relations(categorizationTrainingSnapshots, ({ one }) => ({
    user: one(users, {
        fields: [categorizationTrainingSnapshots.userId],
        references: [users.id],
    }),
}));

export const merchantFrequencyPatternsRelations = relations(merchantFrequencyPatterns, ({ one }) => ({
    merchant: one(merchants, {
        fields: [merchantFrequencyPatterns.merchantId],
        references: [merchants.id],
    }),
    user: one(users, {
        fields: [merchantFrequencyPatterns.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// RELATIONS FOR ISSUE #641: REAL-TIME TAX OPTIMIZATION & DEDUCTION TRACKING
// ============================================================================

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

export const taxEstimatesRelations = relations(taxEstimates, ({ one }) => ({
    user: one(users, {
        fields: [taxEstimates.userId],
        references: [users.id],
    }),
}));

export const taxOptimizationSuggestionsRelations = relations(taxOptimizationSuggestions, ({ one }) => ({
    user: one(users, {
        fields: [taxOptimizationSuggestions.userId],
        references: [users.id],
    }),
}));

export const quarterlyTaxPaymentsRelations = relations(quarterlyTaxPayments, ({ one }) => ({
    user: one(users, {
        fields: [quarterlyTaxPayments.userId],
        references: [users.id],
    }),
}));

export const taxDeadlinesRelations = relations(taxDeadlines, ({ one }) => ({
    user: one(users, {
        fields: [taxDeadlines.userId],
        references: [users.id],
    }),
}));

export const taxAdvantagedAccountsRelations = relations(taxAdvantagedAccounts, ({ one }) => ({
    user: one(users, {
        fields: [taxAdvantagedAccounts.userId],
        references: [users.id],
    }),
}));

export const taxScenariosRelations = relations(taxScenarios, ({ one, many }) => ({
    user: one(users, {
        fields: [taxScenarios.userId],
        references: [users.id],
    }),
    baseEstimate: one(taxEstimates, {
        fields: [taxScenarios.baseEstimateId],
        references: [taxEstimates.id],
    }),
    scenarioEstimate: one(taxEstimates, {
        fields: [taxScenarios.scenarioEstimateId],
        references: [taxEstimates.id],
    }),
}));

export const taxDocumentsRelations = relations(taxDocuments, ({ one }) => ({
    user: one(users, {
        fields: [taxDocuments.userId],
        references: [users.id],
    }),
    deduction: one(taxDeductions, {
        fields: [taxDocuments.deductionId],
        references: [taxDeductions.id],
    }),
}));

// ============================================================================
// RELATIONS FOR ISSUE #653: ADVANCED PORTFOLIO ANALYTICS & PERFORMANCE ATTRIBUTION
// ============================================================================

export const portfolioSnapshotsRelations = relations(portfolioSnapshots, ({ one }) => ({
    user: one(users, {
        fields: [portfolioSnapshots.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [portfolioSnapshots.vaultId],
        references: [vaults.id],
    }),
}));

export const performanceMetricsRelations = relations(performanceMetrics, ({ one }) => ({
    user: one(users, {
        fields: [performanceMetrics.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [performanceMetrics.vaultId],
        references: [vaults.id],
    }),
}));

export const benchmarkComparisonsRelations = relations(benchmarkComparisons, ({ one }) => ({
    user: one(users, {
        fields: [benchmarkComparisons.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [benchmarkComparisons.vaultId],
        references: [vaults.id],
    }),
}));

export const riskMetricsRelations = relations(riskMetrics, ({ one }) => ({
    user: one(users, {
        fields: [riskMetrics.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [riskMetrics.vaultId],
        references: [vaults.id],
    }),
}));

export const performanceAttributionsRelations = relations(performanceAttributions, ({ one }) => ({
    user: one(users, {
        fields: [performanceAttributions.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [performanceAttributions.vaultId],
        references: [vaults.id],
    }),
}));

export const sectorAllocationsRelations = relations(sectorAllocations, ({ one }) => ({
    user: one(users, {
        fields: [sectorAllocations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [sectorAllocations.vaultId],
        references: [vaults.id],
    }),
}));

export const geographicAllocationsRelations = relations(geographicAllocations, ({ one }) => ({
    user: one(users, {
        fields: [geographicAllocations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [geographicAllocations.vaultId],
        references: [vaults.id],
    }),
}));

export const performanceAlertsRelations = relations(performanceAlerts, ({ one }) => ({
    user: one(users, {
        fields: [performanceAlerts.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [performanceAlerts.vaultId],
        references: [vaults.id],
    }),
}));

export const performanceReportsRelations = relations(performanceReports, ({ one }) => ({
    user: one(users, {
        fields: [performanceReports.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [performanceReports.vaultId],
        references: [vaults.id],
    }),
}));

// Asset Allocation Relations
export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
    user: one(users, {
        fields: [userProfiles.userId],
        references: [users.id],
    }),
}));

export const allocationRecommendationsRelations = relations(allocationRecommendations, ({ one, many }) => ({
    user: one(users, {
        fields: [allocationRecommendations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [allocationRecommendations.vaultId],
        references: [vaults.id],
    }),
    assetClasses: many(assetClassAllocations),
    changeHistory: many(allocationChangeHistory),
}));

export const allocationTargetsRelations = relations(allocationTargets, ({ one }) => ({
    user: one(users, {
        fields: [allocationTargets.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [allocationTargets.vaultId],
        references: [vaults.id],
    }),
}));

export const glidePathsRelations = relations(glidePaths, ({ one }) => ({
    user: one(users, {
        fields: [glidePaths.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [glidePaths.vaultId],
        references: [vaults.id],
    }),
}));

export const scenarioProjectionsRelations = relations(scenarioProjections, ({ one }) => ({
    user: one(users, {
        fields: [scenarioProjections.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [scenarioProjections.vaultId],
        references: [vaults.id],
    }),
}));

export const assetClassAllocationsRelations = relations(assetClassAllocations, ({ one }) => ({
    user: one(users, {
        fields: [assetClassAllocations.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [assetClassAllocations.vaultId],
        references: [vaults.id],
    }),
    allocation: one(allocationRecommendations, {
        fields: [assetClassAllocations.allocationId],
        references: [allocationRecommendations.id],
    }),
}));

export const allocationChangeHistoryRelations = relations(allocationChangeHistory, ({ one }) => ({
    user: one(users, {
        fields: [allocationChangeHistory.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [allocationChangeHistory.vaultId],
        references: [vaults.id],
    }),
    allocation: one(allocationRecommendations, {
        fields: [allocationChangeHistory.allocationId],
        references: [allocationRecommendations.id],
    }),
    changedByUser: one(users, {
        fields: [allocationChangeHistory.changedBy],
        references: [users.id],
    }),
}));

// ============================================================================
// RECURRING TRANSACTIONS & BILL TRACKING (#663)
// ============================================================================

// Recurring Transactions - Auto-detected and manual recurring charges
export const recurringTransactions = pgTable('recurring_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    merchantId: uuid('merchant_id'),
    transactionName: text('transaction_name').notNull(),
    description: text('description'),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    category: text('category'),
    frequency: text('frequency').notNull(),
    customFrequencyDays: integer('custom_frequency_days'),
    customFrequencyCount: integer('custom_frequency_count').default(1),
    nextDueDate: timestamp('next_due_date'),
    lastPaymentDate: timestamp('last_payment_date'),
    status: text('status').default('active'),
    detectionMethod: text('detection_method').default('manual'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }).default('0'),
    notes: text('notes'),
    autoDetectedAt: timestamp('auto_detected_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_recurring_transactions_user_id').on(table.userId),
    vaultIdx: index('idx_recurring_transactions_vault_id').on(table.vaultId),
    statusIdx: index('idx_recurring_transactions_status').on(table.status),
    dueIdx: index('idx_recurring_transactions_next_due').on(table.nextDueDate),
}));

// Bill Payments - Individual bill payment tracking
export const billPayments = pgTable('bill_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }).notNull(),
    billDate: timestamp('bill_date').notNull(),
    dueDate: timestamp('due_date').notNull(),
    status: text('status').default('scheduled'),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    actualAmount: numeric('actual_amount', { precision: 15, scale: 2 }),
    paymentDate: timestamp('payment_date'),
    paymentMethod: text('payment_method'),
    notes: text('notes'),
    relatedTransactionId: uuid('related_transaction_id').references(() => transactions.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_bill_payments_user_id').on(table.userId),
    recurringIdx: index('idx_bill_payments_recurring_id').on(table.recurringTransactionId),
    statusIdx: index('idx_bill_payments_status').on(table.status),
    dueIdx: index('idx_bill_payments_due_date').on(table.dueDate),
}));

// Subscription Metadata - Details about subscriptions
export const subscriptionMetadata = pgTable('subscription_metadata', {
    id: uuid('id').defaultRandom().primaryKey(),
    recurringTransactionId: uuid('recurring_transaction_id').unique().references(() => recurringTransactions.id, { onDelete: 'cascade' }).notNull(),
    subscriptionType: text('subscription_type'),
    accountId: text('account_id'),
    accountEmail: text('account_email'),
    serviceProvider: text('service_provider'),
    businessName: text('business_name'),
    cancellationUrl: text('cancellation_url'),
    contactInfo: text('contact_info'),
    autoRenewal: boolean('auto_renewal').default(true),
    renewalDate: timestamp('renewal_date'),
    estimatedYearlyValue: numeric('estimated_yearly_value', { precision: 15, scale: 2 }),
    features: jsonb('features').default('[]'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Duplicate Subscriptions - Flag potential duplicate charges
export const duplicateSubscriptions = pgTable('duplicate_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    primaryRecurringId: uuid('primary_recurring_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }).notNull(),
    duplicateRecurringId: uuid('duplicate_recurring_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }).notNull(),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
    reason: text('reason'),
    status: text('status').default('pending_review'),
    createdAt: timestamp('created_at').defaultNow(),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
}, (table) => ({
    userIdx: index('idx_duplicate_subscriptions_user_id').on(table.userId),
    primaryIdx: index('idx_duplicate_subscriptions_primary_id').on(table.primaryRecurringId),
}));

// Recurring Alerts - Notifications for bills and subscriptions
export const recurringAlerts = pgTable('recurring_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    alertType: text('alert_type').notNull(),
    alertDate: timestamp('alert_date').notNull(),
    dueDate: timestamp('due_date'),
    message: text('message').notNull(),
    severity: text('severity').default('medium'),
    isRead: boolean('is_read').default(false),
    isResolved: boolean('is_resolved').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at'),
    resolvedAt: timestamp('resolved_at'),
}, (table) => ({
    userIdx: index('idx_recurring_alerts_user_id').on(table.userId),
    typeIdx: index('idx_recurring_alerts_type').on(table.alertType),
    readIdx: index('idx_recurring_alerts_is_read').on(table.isRead),
}));

// Bill Categories - User-defined bill categories
export const billCategories = pgTable('bill_categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryName: text('category_name').notNull(),
    categoryType: text('category_type').notNull(),
    budgetLimit: numeric('budget_limit', { precision: 15, scale: 2 }),
    description: text('description'),
    color: text('color').default('#3B82F6'),
    icon: text('icon'),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_bill_categories_user_id').on(table.userId),
}));

// Payment Reminders - Notification scheduling
export const paymentReminders = pgTable('payment_reminders', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }).notNull(),
    reminderDays: integer('reminder_days').default(7),
    lastReminderDate: timestamp('last_reminder_date'),
    nextReminderDate: timestamp('next_reminder_date'),
    isActive: boolean('is_active').default(true),
    reminderChannels: jsonb('reminder_channels').default('["email"]'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_payment_reminders_user_id').on(table.userId),
    nextReminderIdx: index('idx_payment_reminders_next_reminder').on(table.nextReminderDate),
}));

// Recurring Transaction History - Change audit trail
export const recurringTransactionHistory = pgTable('recurring_transaction_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    recurringTransactionId: uuid('recurring_transaction_id').references(() => recurringTransactions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    previousAmount: numeric('previous_amount', { precision: 15, scale: 2 }),
    newAmount: numeric('new_amount', { precision: 15, scale: 2 }),
    previousFrequency: text('previous_frequency'),
    newFrequency: text('new_frequency'),
    previousStatus: text('previous_status'),
    newStatus: text('new_status'),
    changeType: text('change_type').notNull(),
    reason: text('reason'),
    changedDate: timestamp('changed_date').defaultNow(),
    changedBy: uuid('changed_by').references(() => users.id),
}, (table) => ({
    recurringIdx: index('idx_recurring_transaction_history_recurring_id').on(table.recurringTransactionId),
    userIdx: index('idx_recurring_transaction_history_user_id').on(table.userId),
}));

// Merchant Info - Known merchants for subscription detection
export const merchantInfo = pgTable('merchant_info', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantName: text('merchant_name').notNull().unique(),
    displayName: text('display_name'),
    logoUrl: text('logo_url'),
    websiteUrl: text('website_url'),
    industry: text('industry'),
    category: text('category'),
    subscriptionType: text('subscription_type'),
    commonFrequency: text('common_frequency'),
    isKnownSubscription: boolean('is_known_subscription').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    nameIdx: index('idx_merchant_info_name').on(table.merchantName),
    categoryIdx: index('idx_merchant_info_category').on(table.category),
}));

// Bill Reports - Monthly/yearly bill summaries
export const billReports = pgTable('bill_reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    reportMonth: text('report_month').notNull(),
    totalRecurring: numeric('total_recurring', { precision: 15, scale: 2 }),
    totalPaid: numeric('total_paid', { precision: 15, scale: 2 }),
    billCount: integer('bill_count').default(0),
    paidCount: integer('paid_count').default(0),
    overdueCount: integer('overdue_count').default(0),
    skippedCount: integer('skipped_count').default(0),
    categoryBreakdown: jsonb('category_breakdown').default('{}'),
    generatedAt: timestamp('generated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_bill_reports_user_id').on(table.userId),
    monthIdx: index('idx_bill_reports_month').on(table.reportMonth),
}));

// Relations for Recurring Transactions
export const recurringTransactionsRelations = relations(recurringTransactions, ({ one, many }) => ({
    user: one(users, {
        fields: [recurringTransactions.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [recurringTransactions.vaultId],
        references: [vaults.id],
    }),
    billPayments: many(billPayments),
    subscriptionMetadata: one(subscriptionMetadata, {
        fields: [recurringTransactions.id],
        references: [subscriptionMetadata.recurringTransactionId],
    }),
    alerts: many(recurringAlerts),
    reminders: many(paymentReminders),
    history: many(recurringTransactionHistory),
}));

export const billPaymentsRelations = relations(billPayments, ({ one }) => ({
    user: one(users, {
        fields: [billPayments.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [billPayments.vaultId],
        references: [vaults.id],
    }),
    recurringTransaction: one(recurringTransactions, {
        fields: [billPayments.recurringTransactionId],
        references: [recurringTransactions.id],
    }),
    relatedTransaction: one(transactions, {
        fields: [billPayments.relatedTransactionId],
        references: [transactions.id],
    }),
}));

export const subscriptionMetadataRelations = relations(subscriptionMetadata, ({ one }) => ({
    recurringTransaction: one(recurringTransactions, {
        fields: [subscriptionMetadata.recurringTransactionId],
        references: [recurringTransactions.id],
    }),
}));

export const duplicateSubscriptionsRelations = relations(duplicateSubscriptions, ({ one }) => ({
    user: one(users, {
        fields: [duplicateSubscriptions.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [duplicateSubscriptions.vaultId],
        references: [vaults.id],
    }),
    primaryRecurring: one(recurringTransactions, {
        fields: [duplicateSubscriptions.primaryRecurringId],
        references: [recurringTransactions.id],
    }),
    duplicateRecurring: one(recurringTransactions, {
        fields: [duplicateSubscriptions.duplicateRecurringId],
        references: [recurringTransactions.id],
    }),
    reviewedByUser: one(users, {
        fields: [duplicateSubscriptions.reviewedBy],
        references: [users.id],
    }),
}));

export const recurringAlertsRelations = relations(recurringAlerts, ({ one }) => ({
    user: one(users, {
        fields: [recurringAlerts.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [recurringAlerts.vaultId],
        references: [vaults.id],
    }),
    recurringTransaction: one(recurringTransactions, {
        fields: [recurringAlerts.recurringTransactionId],
        references: [recurringTransactions.id],
    }),
}));

export const billCategoriesRelations = relations(billCategories, ({ one }) => ({
    user: one(users, {
        fields: [billCategories.userId],
        references: [users.id],
    }),
}));

export const paymentRemindersRelations = relations(paymentReminders, ({ one }) => ({
    user: one(users, {
        fields: [paymentReminders.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [paymentReminders.vaultId],
        references: [vaults.id],
    }),
    recurringTransaction: one(recurringTransactions, {
        fields: [paymentReminders.recurringTransactionId],
        references: [recurringTransactions.id],
    }),
}));

export const recurringTransactionHistoryRelations = relations(recurringTransactionHistory, ({ one }) => ({
    recurringTransaction: one(recurringTransactions, {
        fields: [recurringTransactionHistory.recurringTransactionId],
        references: [recurringTransactions.id],
    }),
    user: one(users, {
        fields: [recurringTransactionHistory.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [recurringTransactionHistory.vaultId],
        references: [vaults.id],
    }),
    changedByUser: one(users, {
        fields: [recurringTransactionHistory.changedBy],
        references: [users.id],
    }),
}));

export const billReportsRelations = relations(billReports, ({ one }) => ({
    user: one(users, {
        fields: [billReports.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [billReports.vaultId],
        references: [vaults.id],
    }),
}));

// ============================================================================
// FINANCIAL GOALS & SAVINGS TRACKER (#664)
// ============================================================================

// Financial Goals - Core goal definitions
export const financialGoals = pgTable('financial_goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    goalName: text('goal_name').notNull(),
    description: text('description'),
    goalType: text('goal_type').notNull(),
    category: text('category').notNull(),
    targetAmount: numeric('target_amount', { precision: 15, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 15, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    targetDate: timestamp('target_date').notNull(),
    priority: integer('priority').default(0),
    importance: integer('importance').default(50),
    riskTolerance: text('risk_tolerance').default('moderate'),
    status: text('status').default('planning'),
    progressPercentage: numeric('progress_percentage', { precision: 5, scale: 2 }).default('0'),
    isAutoTracked: boolean('is_auto_tracked').default(false),
    autoCalculateSavings: boolean('auto_calculate_savings').default(true),
    tags: jsonb('tags').default('[]'),
    notes: text('notes'),
    customProperties: jsonb('custom_properties').default('{}'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    startedAt: timestamp('started_at'),
    achievedAt: timestamp('achieved_at'),
    abandonedAt: timestamp('abandoned_at'),
}, (table) => ({
    userIdx: index('idx_financial_goals_user_id').on(table.userId),
    vaultIdx: index('idx_financial_goals_vault_id').on(table.vaultId),
    statusIdx: index('idx_financial_goals_status').on(table.status),
    categoryIdx: index('idx_financial_goals_category').on(table.category),
    targetDateIdx: index('idx_financial_goals_target_date').on(table.targetDate),
    priorityIdx: index('idx_financial_goals_priority').on(table.priority),
}));

// Goal Progress Snapshots - Versioned progress tracking
export const goalProgressSnapshots = pgTable('goal_progress_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    contributedAmount: numeric('contributed_amount', { precision: 15, scale: 2 }).notNull(),
    contributedPercentage: numeric('contributed_percentage', { precision: 5, scale: 2 }).notNull(),
    remainingAmount: numeric('remaining_amount', { precision: 15, scale: 2 }).notNull(),
    status: text('status').notNull(),
    daysElapsed: integer('days_elapsed'),
    daysRemaining: integer('days_remaining'),
    paceRatio: numeric('pace_ratio', { precision: 5, scale: 2 }),
    requiredMonthlyAmount: numeric('required_monthly_amount', { precision: 15, scale: 2 }),
    requiredWeeklyAmount: numeric('required_weekly_amount', { precision: 15, scale: 2 }),
    monthlyContributionTrend: numeric('monthly_contribution_trend', { precision: 15, scale: 2 }),
    achievementProbability: numeric('achievement_probability', { precision: 5, scale: 2 }),
    confidenceLevel: text('confidence_level'),
    projectedCompletionDate: timestamp('projected_completion_date'),
    varianceFromPace: numeric('variance_from_pace', { precision: 5, scale: 2 }),
    varianceTrend: text('variance_trend'),
    snapshotType: text('snapshot_type').default('periodic'),
    calculatedBy: text('calculated_by').default('system'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    goalIdx: index('idx_progress_snapshots_goal_id').on(table.goalId),
    userIdx: index('idx_progress_snapshots_user_id').on(table.userId),
    statusIdx: index('idx_progress_snapshots_status').on(table.status),
}));

// Savings Plans - Contribution schedules
export const savingsPlans = pgTable('savings_plans', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    startingAmount: numeric('starting_amount', { precision: 15, scale: 2 }).notNull(),
    targetAmount: numeric('target_amount', { precision: 15, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 15, scale: 2 }).notNull(),
    timeToTargetMonths: integer('time_to_target_months').notNull(),
    baseMonthlyAmount: numeric('base_monthly_amount', { precision: 15, scale: 2 }).notNull(),
    weeklyAmount: numeric('weekly_amount', { precision: 15, scale: 2 }),
    biweeklyAmount: numeric('biweekly_amount', { precision: 15, scale: 2 }),
    requiredMonthlyAmount: numeric('required_monthly_amount', { precision: 15, scale: 2 }),
    contributionFrequency: text('contribution_frequency').default('monthly'),
    customFrequencyDays: integer('custom_frequency_days'),
    bufferPercentage: numeric('buffer_percentage', { precision: 5, scale: 2 }).default('10'),
    bufferAmount: numeric('buffer_amount', { precision: 15, scale: 2 }),
    adjustedMonthlyAmount: numeric('adjusted_monthly_amount', { precision: 15, scale: 2 }),
    paymentMethod: text('payment_method'),
    autoDebitEnabled: boolean('auto_debit_enabled').default(false),
    autoDebitDate: integer('auto_debit_date'),
    targetAccountId: uuid('target_account_id'),
    previousVersions: integer('previous_versions').default(0),
    adjustmentReason: text('adjustment_reason'),
    lastAdjustedAt: timestamp('last_adjusted_at'),
    status: text('status').default('active'),
    successRate: numeric('success_rate', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    goalIdx: index('idx_savings_plans_goal_id').on(table.goalId),
    userIdx: index('idx_savings_plans_user_id').on(table.userId),
    statusIdx: index('idx_savings_plans_status').on(table.status),
}));

// Goal Milestones - Progress checkpoints
export const goalMilestones = pgTable('goal_milestones', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    milestoneName: text('milestone_name').notNull(),
    milestoneType: text('milestone_type').notNull(),
    milestoneValue: numeric('milestone_value', { precision: 15, scale: 2 }),
    percentageValue: numeric('percentage_value', { precision: 5, scale: 2 }),
    targetDate: timestamp('target_date'),
    sequenceOrder: integer('sequence_order').default(0),
    status: text('status').default('pending'),
    achievedDate: timestamp('achieved_date'),
    timeToAchieveDays: integer('time_to_achieve_days'),
    celebrationEnabled: boolean('celebration_enabled').default(true),
    celebrationMessage: text('celebration_message'),
    badgeEarned: text('badge_earned'),
    motivationMessage: text('motivation_message'),
    notificationSent: boolean('notification_sent').default(false),
    isAutomatic: boolean('is_automatic').default(false),
    customProperties: jsonb('custom_properties').default('{}'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    goalIdx: index('idx_milestones_goal_id').on(table.goalId),
    userIdx: index('idx_milestones_user_id').on(table.userId),
    statusIdx: index('idx_milestones_status').on(table.status),
    sequenceIdx: index('idx_milestones_sequence').on(table.sequenceOrder),
}));

// Milestone Achievements - Track completions
export const milestoneAchievements = pgTable('milestone_achievements', {
    id: uuid('id').defaultRandom().primaryKey(),
    milestoneId: uuid('milestone_id').references(() => goalMilestones.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    achievedDate: timestamp('achieved_date').notNull(),
    achievementStatus: text('achievement_status').default('completed'),
    daysAheadOrBehind: integer('days_ahead_or_behind'),
    badgeType: text('badge_type'),
    badgeDescription: text('badge_description'),
    pointsEarned: integer('points_earned').default(0),
    celebrationShared: boolean('celebration_shared').default(false),
    sharedAt: timestamp('shared_at'),
    sharingPlatform: text('sharing_platform'),
    motivationFactor: numeric('motivation_factor', { precision: 5, scale: 2 }),
    nextMilestoneId: uuid('next_milestone_id').references(() => goalMilestones.id, { onDelete: 'set null' }),
    achievementNote: text('achievement_note'),
    mediaUrl: text('media_url'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    milestoneIdx: index('idx_achievements_milestone_id').on(table.milestoneId),
    goalIdx: index('idx_achievements_goal_id').on(table.goalId),
    userIdx: index('idx_achievements_user_id').on(table.userId),
}));

// Goal Transactions Link - Connect transactions to goals
export const goalTransactionsLink = pgTable('goal_transactions_link', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    contributedAmount: numeric('contributed_amount', { precision: 15, scale: 2 }).notNull(),
    contributionDate: timestamp('contribution_date').notNull(),
    transactionType: text('transaction_type'),
    isAutomatic: boolean('is_automatic').default(false),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
    linkingReason: text('linking_reason'),
    notes: text('notes'),
    linkedAt: timestamp('linked_at').defaultNow(),
    unlinkedAt: timestamp('unlinked_at'),
}, (table) => ({
    goalIdx: index('idx_goal_transactions_goal_id').on(table.goalId),
    transactionIdx: index('idx_goal_transactions_transaction_id').on(table.transactionId),
    userIdx: index('idx_goal_transactions_user_id').on(table.userId),
}));

// Goal Timeline Projections - Monte Carlo simulations
export const goalTimelineProjections = pgTable('goal_timeline_projections', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    projectionType: text('projection_type').notNull(),
    simulationCount: integer('simulation_count').default(1000),
    successProbability: numeric('success_probability', { precision: 5, scale: 2 }),
    confidenceLevel: text('confidence_level'),
    projectedCompletionDate: timestamp('projected_completion_date'),
    medianCompletionDate: timestamp('median_completion_date'),
    earliestCompletionDate: timestamp('earliest_completion_date'),
    latestCompletionDate: timestamp('latest_completion_date'),
    currentAmount: numeric('current_amount', { precision: 15, scale: 2 }),
    targetAmount: numeric('target_amount', { precision: 15, scale: 2 }),
    bestCaseAmount: numeric('best_case_amount', { precision: 15, scale: 2 }),
    worstCaseAmount: numeric('worst_case_amount', { precision: 15, scale: 2 }),
    mostLikelyAmount: numeric('most_likely_amount', { precision: 15, scale: 2 }),
    monthlyVariance: numeric('monthly_variance', { precision: 15, scale: 2 }),
    returnVariance: numeric('return_variance', { precision: 5, scale: 2 }),
    percentiles: jsonb('percentiles').default('{}'),
    scenarioResults: jsonb('scenario_results').default('{}'),
    generatedAt: timestamp('generated_at').notNull(),
    validUntil: timestamp('valid_until'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    goalIdx: index('idx_projections_goal_id').on(table.goalId),
    userIdx: index('idx_projections_user_id').on(table.userId),
    successIdx: index('idx_projections_success_probability').on(table.successProbability),
}));

// Goal Analytics Snapshots - Historical insights
export const goalAnalyticsSnapshots = pgTable('goal_analytics_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    snapshotMonth: text('snapshot_month').notNull(),
    healthScore: numeric('health_score', { precision: 5, scale: 2 }),
    healthStatus: text('health_status'),
    riskLevel: text('risk_level'),
    priorityScore: numeric('priority_score', { precision: 5, scale: 2 }),
    achievabilityScore: numeric('achievability_score', { precision: 5, scale: 2 }),
    progressVelocity: numeric('progress_velocity', { precision: 15, scale: 2 }),
    trendDirection: text('trend_direction'),
    trendStrength: text('trend_strength'),
    momentum: numeric('momentum', { precision: 5, scale: 2 }),
    recommendedAction: text('recommended_action'),
    insightMessages: jsonb('insight_messages').default('[]'),
    alerts: jsonb('alerts').default('[]'),
    metrics: jsonb('metrics').default('{}'),
    analysisData: jsonb('analysis_data').default('{}'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    goalIdx: index('idx_analytics_goal_id').on(table.goalId),
    userIdx: index('idx_analytics_user_id').on(table.userId),
    monthIdx: index('idx_analytics_snapshot_month').on(table.snapshotMonth),
    healthIdx: index('idx_analytics_health_status').on(table.healthStatus),
}));

// Relations for Financial Goals
export const financialGoalsRelations = relations(financialGoals, ({ one, many }) => ({
    user: one(users, {
        fields: [financialGoals.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [financialGoals.vaultId],
        references: [vaults.id],
    }),
    progressSnapshots: many(goalProgressSnapshots),
    savingsPlan: one(savingsPlans, {
        fields: [financialGoals.id],
        references: [savingsPlans.goalId],
    }),
    milestones: many(goalMilestones),
    transactionLinks: many(goalTransactionsLink),
    projections: many(goalTimelineProjections),
    analytics: many(goalAnalyticsSnapshots),
}));

export const goalProgressSnapshotsRelations = relations(goalProgressSnapshots, ({ one }) => ({
    goal: one(financialGoals, {
        fields: [goalProgressSnapshots.goalId],
        references: [financialGoals.id],
    }),
    user: one(users, {
        fields: [goalProgressSnapshots.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalProgressSnapshots.vaultId],
        references: [vaults.id],
    }),
}));

export const savingsPlansRelations = relations(savingsPlans, ({ one }) => ({
    goal: one(financialGoals, {
        fields: [savingsPlans.goalId],
        references: [financialGoals.id],
    }),
    user: one(users, {
        fields: [savingsPlans.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [savingsPlans.vaultId],
        references: [vaults.id],
    }),
}));

export const goalMilestonesRelations = relations(goalMilestones, ({ one, many }) => ({
    goal: one(financialGoals, {
        fields: [goalMilestones.goalId],
        references: [financialGoals.id],
    }),
    user: one(users, {
        fields: [goalMilestones.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalMilestones.vaultId],
        references: [vaults.id],
    }),
    achievements: many(milestoneAchievements),
}));

export const milestoneAchievementsRelations = relations(milestoneAchievements, ({ one }) => ({
    milestone: one(goalMilestones, {
        fields: [milestoneAchievements.milestoneId],
        references: [goalMilestones.id],
    }),
    goal: one(financialGoals, {
        fields: [milestoneAchievements.goalId],
        references: [financialGoals.id],
    }),
    user: one(users, {
        fields: [milestoneAchievements.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [milestoneAchievements.vaultId],
        references: [vaults.id],
    }),
    nextMilestone: one(goalMilestones, {
        fields: [milestoneAchievements.nextMilestoneId],
        references: [goalMilestones.id],
    }),
}));

export const goalTransactionsLinkRelations = relations(goalTransactionsLink, ({ one }) => ({
    goal: one(financialGoals, {
        fields: [goalTransactionsLink.goalId],
        references: [financialGoals.id],
    }),
    transaction: one(transactions, {
        fields: [goalTransactionsLink.transactionId],
        references: [transactions.id],
    }),
    user: one(users, {
        fields: [goalTransactionsLink.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalTransactionsLink.vaultId],
        references: [vaults.id],
    }),
}));

export const goalTimelineProjectionsRelations = relations(goalTimelineProjections, ({ one }) => ({
    goal: one(financialGoals, {
        fields: [goalTimelineProjections.goalId],
        references: [financialGoals.id],
    }),
    user: one(users, {
        fields: [goalTimelineProjections.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalTimelineProjections.vaultId],
        references: [vaults.id],
    }),
}));

export const goalAnalyticsSnapshotsRelations = relations(goalAnalyticsSnapshots, ({ one }) => ({
    goal: one(financialGoals, {
        fields: [goalAnalyticsSnapshots.goalId],
        references: [financialGoals.id],
    }),
    user: one(users, {
        fields: [goalAnalyticsSnapshots.userId],
        references: [users.id],
    }),
    vault: one(vaults, {
        fields: [goalAnalyticsSnapshots.vaultId],
        references: [vaults.id],
    }),
}));

// ============================================================================
// MULTI-ACCOUNT AGGREGATION & HOUSEHOLD PORTFOLIO MANAGEMENT (#656)
// ============================================================================

// Household Groups - Multi-account household aggregation
export const households = pgTable('households', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    householdType: text('household_type').default('family'), // 'family', 'joint', 'business', 'trust'
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
    baseCurrency: text('base_currency').default('USD'),
    aggregationFrequency: text('aggregation_frequency').default('daily'), // 'real_time', 'hourly', 'daily', 'weekly'
    rebalancingEnabled: boolean('rebalancing_enabled').default(false),
    collaborativeApprovalsRequired: boolean('collaborative_approvals_required').default(false),
    minApproversRequired: integer('min_approvers_required').default(1),
    isPrivate: boolean('is_private').default(true),
    hiddenAssets: jsonb('hidden_assets').default([]),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    createdByIdx: index('idx_households_created_by').on(table.createdBy),
    typeIdx: index('idx_households_type').on(table.householdType),
}));

// Household Members - Multi-member roles and permissions
export const householdMembers = pgTable('household_members', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: text('role').notNull().default('member'), // 'primary', 'secondary', 'viewer', 'approver', 'advisor'
    permissions: jsonb('permissions').default([]),
    canApproveRebalancing: boolean('can_approve_rebalancing').default(false),
    canApproveTransfers: boolean('can_approve_transfers').default(false),
    canViewAllAccounts: boolean('can_view_all_accounts').default(true),
    visibleVaultIds: jsonb('visible_vault_ids').default([]),
    hiddenVaultIds: jsonb('hidden_vault_ids').default([]),
    relationship: text('relationship'), // 'spouse', 'child', 'parent', 'business_partner', 'trustee', 'advisor', 'other'
    joinedAt: timestamp('joined_at').defaultNow(),
    status: text('status').default('active'), // 'active', 'pending', 'inactive', 'revoked'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    householdIdx: index('idx_household_members_household').on(table.householdId),
    userIdx: index('idx_household_members_user').on(table.userId),
    roleIdx: index('idx_household_members_role').on(table.role),
    uniqueMembers: sql`CONSTRAINT unique_household_member UNIQUE (household_id, user_id)`,
}));

// Household Accounts - Links vaults to households
export const householdAccounts = pgTable('household_accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').notNull(),
    accountName: text('account_name').notNull(),
    accountType: text('account_type').notNull(), // 'checking', 'savings', 'investment', 'retirement', 'real_estate', 'crypto'
    primaryOwnerId: uuid('primary_owner_id').references(() => users.id, { onDelete: 'set null' }),
    isJoint: boolean('is_joint').default(false),
    jointOwnerIds: jsonb('joint_owner_ids').default([]),
    requiredForTaxReporting: boolean('required_for_tax_reporting').default(false),
    taxFileId: text('tax_file_id'),
    isHidden: boolean('is_hidden').default(false),
    hiddenFromMemberIds: jsonb('hidden_from_member_ids').default([]),
    includeInNetWorth: boolean('include_in_net_worth').default(true),
    weight: numeric('weight', { precision: 5, scale: 4 }).default('1.0'),
    metadata: jsonb('metadata').default({}),
    addedAt: timestamp('added_at').defaultNow(),
}, (table) => ({
    householdIdx: index('idx_household_accounts_household').on(table.householdId),
    vaultIdx: index('idx_household_accounts_vault').on(table.vaultId),
    jointIdx: index('idx_household_accounts_joint').on(table.isJoint),
    uniqueAccount: sql`CONSTRAINT unique_household_vault UNIQUE (household_id, vault_id)`,
}));

// Household Snapshots - Daily aggregated net worth & allocation snapshots
export const householdSnapshots = pgTable('household_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    snapshotDate: text('snapshot_date').notNull(), // YYYY-MM-DD format for easy querying
    totalNetWorth: numeric('total_net_worth', { precision: 20, scale: 2 }).notNull(),
    totalAssets: numeric('total_assets', { precision: 20, scale: 2 }).notNull(),
    totalLiabilities: numeric('total_liabilities', { precision: 20, scale: 2 }).notNull(),
    cashBalance: numeric('cash_balance', { precision: 20, scale: 2 }).default('0'),
    investmentValue: numeric('investment_value', { precision: 20, scale: 2 }).default('0'),
    realEstateValue: numeric('real_estate_value', { precision: 20, scale: 2 }).default('0'),
    cryptoValue: numeric('crypto_value', { precision: 20, scale: 2 }).default('0'),
    accountCount: integer('account_count').default(0),
    baseCurrency: text('base_currency').default('USD'),
    includesHiddenAccounts: boolean('includes_hidden_accounts').default(false),
    assetAllocation: jsonb('asset_allocation').default({}),
    allocationVsTarget: jsonb('allocation_vs_target').default({}),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    householdDateIdx: index('idx_household_snapshots_household_date').on(table.householdId, table.snapshotDate),
    dateIdx: index('idx_household_snapshots_date').on(table.snapshotDate),
}));

// Rebalancing Orders - Household-wide rebalancing moves
export const householdRebalancingOrders = pgTable('household_rebalancing_orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    initiatedBy: uuid('initiated_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
    orderType: text('order_type').notNull(), // 'auto', 'manual', 'scenario'
    targetAllocation: jsonb('target_allocation').notNull(),
    currentAllocation: jsonb('current_allocation').notNull(),
    suggestedMoves: jsonb('suggested_moves').notNull(),
    estimatedTransactionCosts: numeric('estimated_transaction_costs', { precision: 20, scale: 2 }).default('0'),
    estimatedTaxImpact: numeric('estimated_tax_impact', { precision: 20, scale: 2 }).default('0'),
    requiresApproval: boolean('requires_approval').default(false),
    approvals: jsonb('approvals').default([]),
    allApprovalsReceived: boolean('all_approvals_received').default(false),
    status: text('status').notNull().default('proposed'), // 'proposed', 'approved', 'executing', 'completed', 'cancelled'
    executedAt: timestamp('executed_at'),
    executionNotes: text('execution_notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    householdIdx: index('idx_rebalancing_household').on(table.householdId),
    initiatedByIdx: index('idx_rebalancing_initiated_by').on(table.initiatedBy),
    statusIdx: index('idx_rebalancing_status').on(table.status),
}));

// Joint Goals - Household-level financial goals
export const householdGoals = pgTable('household_goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
    goalName: text('goal_name').notNull(),
    goalType: text('goal_type').notNull(), // 'education', 'home', 'vacation', 'retirement', 'emergency', 'custom'
    description: text('description'),
    targetAmount: numeric('target_amount', { precision: 20, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 20, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    deadline: timestamp('deadline').notNull(),
    priority: text('priority').default('medium'), // 'low', 'medium', 'high', 'critical'
    fundingStrategy: text('funding_strategy').default('proportional'), // 'proportional', 'equal', 'custom'
    memberContributions: jsonb('member_contributions').default({}),
    approvalRequired: boolean('approval_required').default(false),
    requiresConsensus: boolean('requires_consensus').default(false),
    approvedBy: jsonb('approved_by').default([]),
    status: text('status').default('active'), // 'active', 'paused', 'completed', 'abandoned'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    householdIdx: index('idx_household_goals_household').on(table.householdId),
    deadlineIdx: index('idx_household_goals_deadline').on(table.deadline),
    statusIdx: index('idx_household_goals_status').on(table.status),
}));

// Household Spending - Consolidated spending across all member accounts
export const householdSpendingSummaries = pgTable('household_spending_summaries', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    summaryDate: text('summary_date').notNull(), // YYYY-MM-DD format
    summaryPeriod: text('summary_period').default('month'), // 'day', 'week', 'month', 'quarter', 'year'
    totalSpending: numeric('total_spending', { precision: 20, scale: 2 }).notNull(),
    totalIncome: numeric('total_income', { precision: 20, scale: 2 }).default('0'),
    netCashFlow: numeric('net_cash_flow', { precision: 20, scale: 2 }).default('0'),
    memberSpending: jsonb('member_spending').default({}),
    memberIncome: jsonb('member_income').default({}),
    categoryBreakdown: jsonb('category_breakdown').default({}),
    percentChangeFromPrior: numeric('percent_change_from_prior', { precision: 5, scale: 2 }).default('0'),
    forecastedMonthlySpend: numeric('forecasted_monthly_spend', { precision: 20, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    householdDateIdx: index('idx_household_spending_household_date').on(table.householdId, table.summaryDate),
}));

// Collaborative Approvals - General approval workflow for household changes
export const householdApprovals = pgTable('household_approvals', {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
    requestType: text('request_type').notNull(), // 'rebalancing', 'transfer', 'goal_change', 'member_add', 'account_link'
    referenceId: uuid('reference_id'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
    description: text('description'),
    requiredApprovers: jsonb('required_approvers').notNull().default([]),
    currentApprovals: jsonb('current_approvals').default([]),
    rejections: jsonb('rejections').default([]),
    minApprovalsRequired: integer('min_approvals_required').default(1),
    status: text('status').notNull().default('pending'), // 'pending', 'approved', 'rejected', 'withdrawn'
    decidedAt: timestamp('decided_at'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    householdIdx: index('idx_household_approvals_household').on(table.householdId),
    statusIdx: index('idx_household_approvals_status').on(table.status),
    typeIdx: index('idx_household_approvals_type').on(table.requestType),
}));

// Relations
export const householdsRelations = relations(households, ({ one, many }) => ({
    createdByUser: one(users, { fields: [households.createdBy], references: [users.id] }),
    members: many(householdMembers),
    accounts: many(householdAccounts),
    snapshots: many(householdSnapshots),
    rebalancingOrders: many(householdRebalancingOrders),
    goals: many(householdGoals),
    spendingSummaries: many(householdSpendingSummaries),
    approvals: many(householdApprovals),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
    household: one(households, { fields: [householdMembers.householdId], references: [households.id] }),
    user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const householdAccountsRelations = relations(householdAccounts, ({ one }) => ({
    household: one(households, { fields: [householdAccounts.householdId], references: [households.id] }),
    primaryOwner: one(users, { fields: [householdAccounts.primaryOwnerId], references: [users.id] }),
}));

export const householdSnapshotsRelations = relations(householdSnapshots, ({ one }) => ({
    household: one(households, { fields: [householdSnapshots.householdId], references: [households.id] }),
}));

export const householdRebalancingOrdersRelations = relations(householdRebalancingOrders, ({ one }) => ({
    household: one(households, { fields: [householdRebalancingOrders.householdId], references: [households.id] }),
    initiator: one(users, { fields: [householdRebalancingOrders.initiatedBy], references: [users.id] }),
}));

export const householdGoalsRelations = relations(householdGoals, ({ one }) => ({
    household: one(households, { fields: [householdGoals.householdId], references: [households.id] }),
    createdBy: one(users, { fields: [householdGoals.createdByUserId], references: [users.id] }),
}));

export const householdSpendingSummariesRelations = relations(householdSpendingSummaries, ({ one }) => ({
    household: one(households, { fields: [householdSpendingSummaries.householdId], references: [households.id] }),
}));

export const householdApprovalsRelations = relations(householdApprovals, ({ one }) => ({
    household: one(households, { fields: [householdApprovals.householdId], references: [households.id] }),
    requestedByUser: one(users, { fields: [householdApprovals.requestedBy], references: [users.id] }),
    decidedByUser: one(users, { fields: [householdApprovals.decidedBy], references: [users.id] }),
}));

// ==========================================
// ISSUE #716: Goal Failure Early-Warning System
// ==========================================

// Track risk score changes over time for goals
export const goalRiskTracking = pgTable('goal_risk_tracking', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    previousRiskLevel: text('previous_risk_level'), // 'low', 'medium', 'high'
    currentRiskLevel: text('current_risk_level').notNull(),
    riskScore: numeric('risk_score', { precision: 5, scale: 2 }).notNull(), // 0-100
    previousRiskScore: numeric('previous_risk_score', { precision: 5, scale: 2 }),
    transitionType: text('transition_type'), // 'escalation', 'improvement', 'stable'
    contributingFactors: jsonb('contributing_factors').default('{}'), // { missedContributions, deadlineProximity, paceRatio, etc. }
    calculatedAt: timestamp('calculated_at').defaultNow(),
    metadata: jsonb('metadata').default('{}'),
}, (table) => ({
    goalIdx: index('idx_goal_risk_tracking_goal_id').on(table.goalId),
    userIdx: index('idx_goal_risk_tracking_user_id').on(table.userId),
    riskLevelIdx: index('idx_goal_risk_tracking_risk_level').on(table.currentRiskLevel),
    calculatedAtIdx: index('idx_goal_risk_tracking_calculated_at').on(table.calculatedAt),
}));

// Track contribution streaks and missed contributions
export const contributionStreaks = pgTable('contribution_streaks', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    streakType: text('streak_type').notNull(), // 'active', 'missed', 'recovered'
    currentStreak: integer('current_streak').default(0), // Days or contribution periods
    longestStreak: integer('longest_streak').default(0),
    lastContributionDate: timestamp('last_contribution_date'),
    missedCount: integer('missed_count').default(0), // Consecutive missed contributions
    expectedFrequency: text('expected_frequency').default('monthly'), // 'weekly', 'biweekly', 'monthly'
    nextExpectedDate: timestamp('next_expected_date'),
    isAtRisk: boolean('is_at_risk').default(false), // True if approaching threshold
    riskThreshold: integer('risk_threshold').default(2), // Number of missed contributions before alert
    lastUpdated: timestamp('last_updated').defaultNow(),
    metadata: jsonb('metadata').default('{}'),
}, (table) => ({
    goalIdx: index('idx_contribution_streaks_goal_id').on(table.goalId),
    userIdx: index('idx_contribution_streaks_user_id').on(table.userId),
    atRiskIdx: index('idx_contribution_streaks_at_risk').on(table.isAtRisk),
}));

// Goal Failure Early-Warning Alerts Log
export const goalFailureAlerts = pgTable('goal_failure_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id').references(() => financialGoals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    alertType: text('alert_type').notNull(), // 'risk_escalation', 'missed_contribution_streak', 'deadline_proximity', 'recovery_needed'
    severity: text('severity').notNull(), // 'low', 'medium', 'high', 'critical'
    title: text('title').notNull(),
    message: text('message').notNull(),
    recoveryActions: jsonb('recovery_actions').default('[]'), // Array of recommended actions
    triggerData: jsonb('trigger_data').default('{}'), // Data that triggered the alert
    sentVia: jsonb('sent_via').default('[]'), // ['in-app', 'push', 'email']
    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),
    isDismissed: boolean('is_dismissed').default(false),
    dismissedAt: timestamp('dismissed_at'),
    actionTaken: text('action_taken'), // User's response
    actionTakenAt: timestamp('action_taken_at'),
    createdAt: timestamp('created_at').defaultNow(),
    expiresAt: timestamp('expires_at'), // Alert expiry (optional)
    metadata: jsonb('metadata').default('{}'),
}, (table) => ({
    goalIdx: index('idx_goal_failure_alerts_goal_id').on(table.goalId),
    userIdx: index('idx_goal_failure_alerts_user_id').on(table.userId),
    alertTypeIdx: index('idx_goal_failure_alerts_alert_type').on(table.alertType),
    severityIdx: index('idx_goal_failure_alerts_severity').on(table.severity),
    isReadIdx: index('idx_goal_failure_alerts_is_read').on(table.isRead),
    createdAtIdx: index('idx_goal_failure_alerts_created_at').on(table.createdAt),
}));

// Relations for Goal Failure Early-Warning System
export const goalRiskTrackingRelations = relations(goalRiskTracking, ({ one }) => ({
    goal: one(financialGoals, { fields: [goalRiskTracking.goalId], references: [financialGoals.id] }),
    user: one(users, { fields: [goalRiskTracking.userId], references: [users.id] }),
}));

export const contributionStreaksRelations = relations(contributionStreaks, ({ one }) => ({
    goal: one(financialGoals, { fields: [contributionStreaks.goalId], references: [financialGoals.id] }),
    user: one(users, { fields: [contributionStreaks.userId], references: [users.id] }),
}));

export const goalFailureAlertsRelations = relations(goalFailureAlerts, ({ one }) => ({
    goal: one(financialGoals, { fields: [goalFailureAlerts.goalId], references: [financialGoals.id] }),
    user: one(users, { fields: [goalFailureAlerts.userId], references: [users.id] }),
}));

// Export forecast schema tables
export * from './schema-forecast.js';

// Export drift detection schema tables
export * from './schema-drift-detection.js';

// Export goal sharing schema tables
export * from './schema-goal-sharing.js';

// Export anomaly detection schema tables
export * from './schema-anomaly-detection.js';

// Export portfolio rebalancing schema tables
export * from './schema-portfolio-rebalancing.js';
// Export smart notifications and recommendations schema tables
export * from './schema-smart-notifications.js';
