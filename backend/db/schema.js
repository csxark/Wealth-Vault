
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
    preferences: jsonb('preferences').default({
        notifications: { email: true, push: true, sms: false },
        theme: 'auto',
        language: 'en'
    }),
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

// Goals Table
export const goals = pgTable('goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
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

// Audit Logs Table
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g., AUTH_LOGIN, AUTH_LOGOUT, CREATE_EXPENSE, DELETE_EXPENSE, UPDATE_PROFILE
    resourceType: text('resource_type'), // e.g., 'expense', 'user', 'goal', 'category'
    resourceId: uuid('resource_id'), // ID of the affected resource
    metadata: jsonb('metadata').default({}), // { ip, userAgent, oldValue, newValue, etc. }
    status: text('status').default('success'), // 'success', 'failure'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    deviceSessions: many(deviceSessions),
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
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
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
    user: one(users, {
        fields: [goals.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [goals.categoryId],
        references: [goals.id],
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
