/**
 * Goal Sharing Schema
 * 
 * Database schema for collaborative goal sharing with permission inheritance
 * Implements role-based access control for shared financial goals
 * 
 * Issue #611: Collaborative Goal Sharing with Permission Inheritance
 */

import { pgTable, uuid, text, timestamp, jsonb, boolean, pgEnum, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users, goals } from './schema.js';

// Enum for share roles
export const goalShareRoleEnum = pgEnum('goal_share_role', ['viewer', 'contributor', 'manager', 'owner']);

// Enum for share status
export const goalShareStatusEnum = pgEnum('goal_share_status', ['pending', 'active', 'revoked', 'expired', 'declined']);

// Enum for invitation method
export const invitationMethodEnum = pgEnum('invitation_method', ['email', 'link', 'in_app']);

// Goal Shares - Manages who has access to a goal
export const goalShares = pgTable('goal_shares', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Owner information
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Shared with user
    sharedWithUserId: uuid('shared_with_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sharedWithEmail: text('shared_with_email'),
    sharedWithName: text('shared_with_name'),
    
    // Permission details
    role: goalShareRoleEnum('role').notNull(),
    permissions: jsonb('permissions').default({
        canView: true,
        canContribute: false,
        canEdit: false,
        canDelete: false,
        canShare: false,
        canViewContributions: true,
        canEditOwnContributions: false,
        canEditAllContributions: false,
        canWithdraw: false,
        canChangeGoalDetails: false
    }),
    
    // Status
    status: goalShareStatusEnum('status').default('active').notNull(),
    
    // Invitation details
    invitedAt: timestamp('invited_at').defaultNow(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at'),
    
    // Personal message
    invitationMessage: text('invitation_message'),
    
    // Metadata
    metadata: jsonb('metadata').default({
        invitationMethod: 'email',
        shareReason: null,
        lastAccessedAt: null,
        accessCount: 0
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    // Ensure unique share per user per goal
    uniqueUserGoalShare: unique('unique_user_goal_share').on(table.goalId, table.sharedWithUserId)
}));

// Goal Share Invitations - Track pending invitations
export const goalShareInvitations = pgTable('goal_share_invitations', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Inviter
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Invitee
    inviteeEmail: text('invitee_email').notNull(),
    inviteeUserId: uuid('invitee_user_id').references(() => users.id, { onDelete: 'cascade' }),
    
    // Invitation details
    role: goalShareRoleEnum('role').notNull(),
    invitationToken: text('invitation_token').notNull().unique(),
    invitationMethod: invitationMethodEnum('invitation_method').default('email').notNull(),
    
    // Message
    personalMessage: text('personal_message'),
    
    // Status
    status: goalShareStatusEnum('status').default('pending').notNull(),
    sentAt: timestamp('sent_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    
    // Response
    respondedAt: timestamp('responded_at'),
    declineReason: text('decline_reason'),
    
    // Resulting share (if accepted)
    resultingShareId: uuid('resulting_share_id').references(() => goalShares.id, { onDelete: 'set null' }),
    
    // Metadata
    metadata: jsonb('metadata').default({
        remindersSent: 0,
        lastReminderAt: null
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Share Activity Log - Audit trail for shared goals
export const goalShareActivityLog = pgTable('goal_share_activity_log', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    shareId: uuid('share_id').references(() => goalShares.id, { onDelete: 'cascade' }),
    
    // Actor
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userEmail: text('user_email'),
    userName: text('user_name'),
    
    // Activity details
    activityType: text('activity_type').notNull(), // shared, accepted, revoked, contributed, edited, etc.
    action: text('action').notNull(),
    description: text('description'),
    
    // Changes
    changesBefore: jsonb('changes_before'),
    changesAfter: jsonb('changes_after'),
    
    // Context
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Goal Contribution Permissions - Track who can modify specific contributions
export const goalContributionPermissions = pgTable('goal_contribution_permissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    contributionId: uuid('contribution_id').notNull(), // References goal_contributions.id
    
    // Permission holder
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Inherited from share
    inheritedFromShareId: uuid('inherited_from_share_id').references(() => goalShares.id, { onDelete: 'cascade' }),
    
    // Specific permissions
    canEdit: boolean('can_edit').default(false).notNull(),
    canDelete: boolean('can_delete').default(false).notNull(),
    canView: boolean('can_view').default(true).notNull(),
    
    // Ownership
    isOwner: boolean('is_owner').default(false).notNull(),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Share Settings - Per-goal sharing configuration
export const goalShareSettings = pgTable('goal_share_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull().unique(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Sharing settings
    isSharingEnabled: boolean('is_sharing_enabled').default(true).notNull(),
    allowLinkSharing: boolean('allow_link_sharing').default(false).notNull(),
    requireApproval: boolean('require_approval').default(false).notNull(),
    
    // Default permissions for new shares
    defaultRole: goalShareRoleEnum('default_role').default('viewer').notNull(),
    
    // Limits
    maxShares: text('max_shares').default('10'), // Can be 'unlimited'
    currentShareCount: text('current_share_count').default('0'),
    
    // Link sharing
    publicShareToken: text('public_share_token').unique(),
    publicShareExpiresAt: timestamp('public_share_expires_at'),
    linkShareRole: goalShareRoleEnum('link_share_role').default('viewer'),
    
    // Contribution rules for shared goal
    contributionRules: jsonb('contribution_rules').default({
        requireApprovalForContributions: false,
        minContributionAmount: null,
        maxContributionAmount: null,
        allowWithdrawals: false
    }),
    
    // Notifications
    notifyOnNewShare: boolean('notify_on_new_share').default(true),
    notifyOnContribution: boolean('notify_on_contribution').default(true),
    notifyOnMilestone: boolean('notify_on_milestone').default(true),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goal Share Notifications - Track notification preferences
export const goalShareNotifications = pgTable('goal_share_notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    shareId: uuid('share_id').references(() => goalShares.id, { onDelete: 'cascade' }),
    
    // Notification details
    notificationType: text('notification_type').notNull(), // new_contribution, milestone_reached, goal_updated, etc.
    title: text('title').notNull(),
    message: text('message').notNull(),
    
    // Status
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at'),
    
    // Actions
    actionUrl: text('action_url'),
    actionLabel: text('action_label'),
    
    // Priority
    priority: text('priority').default('normal'), // low, normal, high, urgent
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// Relations
// ========================================

export const goalSharesRelations = relations(goalShares, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [goalShares.tenantId],
        references: [tenants.id],
    }),
    goal: one(goals, {
        fields: [goalShares.goalId],
        references: [goals.id],
    }),
    owner: one(users, {
        fields: [goalShares.ownerId],
        references: [users.id],
    }),
    sharedWithUser: one(users, {
        fields: [goalShares.sharedWithUserId],
        references: [users.id],
    }),
    activityLogs: many(goalShareActivityLog),
    contributionPermissions: many(goalContributionPermissions),
}));

export const goalShareInvitationsRelations = relations(goalShareInvitations, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goalShareInvitations.tenantId],
        references: [tenants.id],
    }),
    goal: one(goals, {
        fields: [goalShareInvitations.goalId],
        references: [goals.id],
    }),
    inviter: one(users, {
        fields: [goalShareInvitations.invitedBy],
        references: [users.id],
    }),
    inviteeUser: one(users, {
        fields: [goalShareInvitations.inviteeUserId],
        references: [users.id],
    }),
    resultingShare: one(goalShares, {
        fields: [goalShareInvitations.resultingShareId],
        references: [goalShares.id],
    }),
}));

export const goalShareActivityLogRelations = relations(goalShareActivityLog, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goalShareActivityLog.tenantId],
        references: [tenants.id],
    }),
    goal: one(goals, {
        fields: [goalShareActivityLog.goalId],
        references: [goals.id],
    }),
    share: one(goalShares, {
        fields: [goalShareActivityLog.shareId],
        references: [goalShares.id],
    }),
    user: one(users, {
        fields: [goalShareActivityLog.userId],
        references: [users.id],
    }),
}));

export const goalContributionPermissionsRelations = relations(goalContributionPermissions, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goalContributionPermissions.tenantId],
        references: [tenants.id],
    }),
    goal: one(goals, {
        fields: [goalContributionPermissions.goalId],
        references: [goals.id],
    }),
    user: one(users, {
        fields: [goalContributionPermissions.userId],
        references: [users.id],
    }),
    inheritedFromShare: one(goalShares, {
        fields: [goalContributionPermissions.inheritedFromShareId],
        references: [goalShares.id],
    }),
}));

export const goalShareSettingsRelations = relations(goalShareSettings, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goalShareSettings.tenantId],
        references: [tenants.id],
    }),
    goal: one(goals, {
        fields: [goalShareSettings.goalId],
        references: [goals.id],
    }),
    owner: one(users, {
        fields: [goalShareSettings.ownerId],
        references: [users.id],
    }),
}));

export const goalShareNotificationsRelations = relations(goalShareNotifications, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goalShareNotifications.tenantId],
        references: [tenants.id],
    }),
    goal: one(goals, {
        fields: [goalShareNotifications.goalId],
        references: [goals.id],
    }),
    user: one(users, {
        fields: [goalShareNotifications.userId],
        references: [users.id],
    }),
    share: one(goalShares, {
        fields: [goalShareNotifications.shareId],
        references: [goalShares.id],
    }),
}));

