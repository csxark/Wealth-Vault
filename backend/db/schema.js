
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
