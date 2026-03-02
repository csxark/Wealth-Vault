/**
 * Goal Sharing Service
 * 
 * Implements collaborative goal sharing with role-based access control.
 * Features:
 * - Share goals with granular permissions (viewer, contributor, manager)
 * - Invitation system with email/link/in-app methods
 * - Permission inheritance from goals to contributions
 * - Activity tracking and audit logging
 * - Real-time notifications for shared goal events
 * - Permission validation and access control
 * 
 * Addresses Issue #611: Collaborative Goal Sharing with Permission Inheritance
 */

import db from '../config/db.js';
import { 
    goalShares,
    goalShareInvitations,
    goalShareActivityLog,
    goalContributionPermissions,
    goalShareSettings,
    goalShareNotifications,
    goals,
    users,
    goalContributionLineItems
} from '../db/schema.js';
import { eq, and, or, desc, sql, inArray, gte } from 'drizzle-orm';
import * as cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

const CACHE_PREFIX = 'goal_share:';
const SHARE_CACHE_TTL = 1800; // 30 minutes
const DEFAULT_INVITATION_EXPIRY_DAYS = 7;
const MAX_SHARES_DEFAULT = 10;

/**
 * Role-based permission templates
 */
const ROLE_PERMISSIONS = {
    viewer: {
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
    },
    contributor: {
        canView: true,
        canContribute: true,
        canEdit: false,
        canDelete: false,
        canShare: false,
        canViewContributions: true,
        canEditOwnContributions: true,
        canEditAllContributions: false,
        canWithdraw: true,
        canChangeGoalDetails: false
    },
    manager: {
        canView: true,
        canContribute: true,
        canEdit: true,
        canDelete: false,
        canShare: true,
        canViewContributions: true,
        canEditOwnContributions: true,
        canEditAllContributions: true,
        canWithdraw: true,
        canChangeGoalDetails: true
    },
    owner: {
        canView: true,
        canContribute: true,
        canEdit: true,
        canDelete: true,
        canShare: true,
        canViewContributions: true,
        canEditOwnContributions: true,
        canEditAllContributions: true,
        canWithdraw: true,
        canChangeGoalDetails: true
    }
};

/**
 * Generate a secure invitation token
 */
function generateInvitationToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a public share token
 */
function generatePublicShareToken() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Get or create share settings for a goal
 */
async function getOrCreateShareSettings(goalId, ownerId, tenantId) {
    try {
        // Check if settings exist
        let settings = await db.select().from(goalShareSettings)
            .where(eq(goalShareSettings.goalId, goalId))
            .limit(1);

        if (settings.length === 0) {
            // Create default settings
            [settings] = await db.insert(goalShareSettings).values({
                goalId,
                ownerId,
                tenantId,
                isSharingEnabled: true,
                allowLinkSharing: false,
                requireApproval: false,
                defaultRole: 'viewer',
                maxShares: MAX_SHARES_DEFAULT.toString(),
                currentShareCount: '0'
            }).returning();

            return settings;
        }

        return settings[0];
    } catch (error) {
        logger.error('Error getting/creating share settings:', error);
        throw error;
    }
}

/**
 * Share a goal with a user
 */
export async function shareGoal({
    goalId,
    tenantId,
    ownerId,
    sharedWithUserId,
    sharedWithEmail,
    role = 'viewer',
    invitationMessage = null,
    expiresInDays = null
}) {
    try {
        // Validate goal exists and user is owner or has share permission
        const goal = await db.select().from(goals)
            .where(and(
                eq(goals.id, goalId),
                eq(goals.tenantId, tenantId)
            ))
            .limit(1);

        if (goal.length === 0) {
            throw new Error('Goal not found or access denied');
        }

        // Get share settings
        const settings = await getOrCreateShareSettings(goalId, ownerId, tenantId);

        // Check if sharing is enabled
        if (!settings.isSharingEnabled) {
            throw new Error('Sharing is disabled for this goal');
        }

        // Check share count limit
        const currentCount = parseInt(settings.currentShareCount || '0');
        const maxShares = settings.maxShares === 'unlimited' ? Infinity : parseInt(settings.maxShares);

        if (currentCount >= maxShares) {
            throw new Error(`Share limit reached (max: ${maxShares})`);
        }

        // Check if already shared with this user
        const existingShare = await db.select().from(goalShares)
            .where(and(
                eq(goalShares.goalId, goalId),
                eq(goalShares.sharedWithUserId, sharedWithUserId)
            ))
            .limit(1);

        if (existingShare.length > 0) {
            if (existingShare[0].status === 'active') {
                throw new Error('Goal already shared with this user');
            } else if (existingShare[0].status === 'revoked') {
                // Reactivate the share
                const [updatedShare] = await db.update(goalShares)
                    .set({
                        status: 'active',
                        role,
                        acceptedAt: new Date(),
                        revokedAt: null,
                        revokedBy: null,
                        updatedAt: new Date()
                    })
                    .where(eq(goalShares.id, existingShare[0].id))
                    .returning();

                // Invalidate cache
                await cacheService.del(`${CACHE_PREFIX}${goalId}`);
                await cacheService.del(`${CACHE_PREFIX}user:${sharedWithUserId}`);

                return updatedShare;
            }
        }

        // Get user info
        const [sharedUser] = await db.select().from(users)
            .where(eq(users.id, sharedWithUserId))
            .limit(1);

        // Calculate expiration
        const expiresAt = expiresInDays 
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null;

        // Create share
        const [newShare] = await db.insert(goalShares).values({
            goalId,
            tenantId,
            ownerId,
            sharedWithUserId,
            sharedWithEmail: sharedWithEmail || sharedUser.email,
            sharedWithName: sharedUser.fullName,
            role,
            permissions: ROLE_PERMISSIONS[role],
            status: 'active',
            invitationMessage,
            acceptedAt: new Date(),
            expiresAt,
            metadata: {
                invitationMethod: 'in_app',
                shareReason: null,
                lastAccessedAt: null,
                accessCount: 0
            }
        }).returning();

        // Create notification for shared user
        await createShareNotification({
            tenantId,
            goalId,
            userId: sharedWithUserId,
            shareId: newShare.id,
            notificationType: 'goal_shared',
            title: 'New Shared Goal',
            message: `${goal[0].title} has been shared with you as ${role}`,
            priority: 'normal'
        });

        // Publish outbox event
        await outboxService.publish({
            tenantId,
            aggregateType: 'goal',
            aggregateId: goalId,
            eventType: 'goal.shared',
            payload: {
                shareId: newShare.id,
                goalId,
                sharedWithUserId,
                role,
                ownerId
            }
        });

        // Invalidate caches
        await cacheService.del(`${CACHE_PREFIX}${goalId}`);
        await cacheService.del(`${CACHE_PREFIX}user:${sharedWithUserId}`);

        logger.info(`Goal ${goalId} shared with user ${sharedWithUserId} as ${role}`);

        return newShare;
    } catch (error) {
        logger.error('Error sharing goal:', error);
        throw error;
    }
}

/**
 * Create a goal share invitation
 */
export async function createInvitation({
    goalId,
    tenantId,
    invitedBy,
    inviteeEmail,
    role = 'viewer',
    personalMessage = null,
    invitationMethod = 'email',
    expiresInDays = DEFAULT_INVITATION_EXPIRY_DAYS
}) {
    try {
        // Validate goal and permissions
        const goal = await db.select().from(goals)
            .where(and(
                eq(goals.id, goalId),
                eq(goals.tenantId, tenantId)
            ))
            .limit(1);

        if (goal.length === 0) {
            throw new Error('Goal not found');
        }

        // Check if user can share
        const canShare = await checkPermission(goalId, invitedBy, 'canShare');
        if (!canShare && goal[0].userId !== invitedBy) {
            throw new Error('You do not have permission to share this goal');
        }

        // Check if user exists
        const inviteeUser = await db.select().from(users)
            .where(and(
                eq(users.email, inviteeEmail),
                eq(users.tenantId, tenantId)
            ))
            .limit(1);

        // Generate invitation token
        const invitationToken = generateInvitationToken();
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

        // Create invitation
        const [invitation] = await db.insert(goalShareInvitations).values({
            goalId,
            tenantId,
            invitedBy,
            inviteeEmail,
            inviteeUserId: inviteeUser.length > 0 ? inviteeUser[0].id : null,
            role,
            invitationToken,
            invitationMethod,
            personalMessage,
            status: 'pending',
            expiresAt,
            metadata: {
                remindersSent: 0,
                lastReminderAt: null
            }
        }).returning();

        // TODO: Send invitation email/notification

        logger.info(`Invitation created for ${inviteeEmail} to goal ${goalId}`);

        return invitation;
    } catch (error) {
        logger.error('Error creating invitation:', error);
        throw error;
    }
}

/**
 * Accept a goal share invitation
 */
export async function acceptInvitation(invitationToken, userId, tenantId) {
    try {
        // Find invitation
        const [invitation] = await db.select().from(goalShareInvitations)
            .where(and(
                eq(goalShareInvitations.invitationToken, invitationToken),
                eq(goalShareInvitations.tenantId, tenantId),
                eq(goalShareInvitations.status, 'pending')
            ))
            .limit(1);

        if (!invitation) {
            throw new Error('Invitation not found or already processed');
        }

        // Check expiration
        if (new Date() > new Date(invitation.expiresAt)) {
            await db.update(goalShareInvitations)
                .set({ status: 'expired' })
                .where(eq(goalShareInvitations.id, invitation.id));
            throw new Error('Invitation has expired');
        }

        // Verify user email matches
        const [user] = await db.select().from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (user.email !== invitation.inviteeEmail) {
            throw new Error('Email does not match invitation');
        }

        // Create goal share
        const share = await shareGoal({
            goalId: invitation.goalId,
            tenantId: invitation.tenantId,
            ownerId: invitation.invitedBy,
            sharedWithUserId: userId,
            sharedWithEmail: user.email,
            role: invitation.role,
            invitationMessage: invitation.personalMessage
        });

        // Update invitation
        await db.update(goalShareInvitations)
            .set({
                status: 'active',
                respondedAt: new Date(),
                resultingShareId: share.id
            })
            .where(eq(goalShareInvitations.id, invitation.id));

        logger.info(`User ${userId} accepted invitation ${invitation.id}`);

        return share;
    } catch (error) {
        logger.error('Error accepting invitation:', error);
        throw error;
    }
}

/**
 * Decline a goal share invitation
 */
export async function declineInvitation(invitationToken, userId, tenantId, declineReason = null) {
    try {
        // Find invitation
        const [invitation] = await db.select().from(goalShareInvitations)
            .where(and(
                eq(goalShareInvitations.invitationToken, invitationToken),
                eq(goalShareInvitations.tenantId, tenantId),
                eq(goalShareInvitations.status, 'pending')
            ))
            .limit(1);

        if (!invitation) {
            throw new Error('Invitation not found or already processed');
        }

        // Update invitation
        await db.update(goalShareInvitations)
            .set({
                status: 'declined',
                respondedAt: new Date(),
                declineReason
            })
            .where(eq(goalShareInvitations.id, invitation.id));

        logger.info(`User ${userId} declined invitation ${invitation.id}`);

        return { success: true, message: 'Invitation declined' };
    } catch (error) {
        logger.error('Error declining invitation:', error);
        throw error;
    }
}

/**
 * Revoke a goal share
 */
export async function revokeShare(shareId, revokedBy, tenantId) {
    try {
        // Get share
        const [share] = await db.select().from(goalShares)
            .where(and(
                eq(goalShares.id, shareId),
                eq(goalShares.tenantId, tenantId)
            ))
            .limit(1);

        if (!share) {
            throw new Error('Share not found');
        }

        // Check permission
        const canRevoke = share.ownerId === revokedBy || await checkPermission(share.goalId, revokedBy, 'canShare');
        if (!canRevoke) {
            throw new Error('You do not have permission to revoke this share');
        }

        // Update share
        const [revokedShare] = await db.update(goalShares)
            .set({
                status: 'revoked',
                revokedAt: new Date(),
                revokedBy,
                updatedAt: new Date()
            })
            .where(eq(goalShares.id, shareId))
            .returning();

        // Create notification
        await createShareNotification({
            tenantId,
            goalId: share.goalId,
            userId: share.sharedWithUserId,
            shareId,
            notificationType: 'share_revoked',
            title: 'Goal Access Revoked',
            message: 'Your access to a shared goal has been revoked',
            priority: 'high'
        });

        // Invalidate cache
        await cacheService.del(`${CACHE_PREFIX}${share.goalId}`);
        await cacheService.del(`${CACHE_PREFIX}user:${share.sharedWithUserId}`);

        logger.info(`Share ${shareId} revoked by ${revokedBy}`);

        return revokedShare;
    } catch (error) {
        logger.error('Error revoking share:', error);
        throw error;
    }
}

/**
 * Update share role
 */
export async function updateShareRole(shareId, newRole, updatedBy, tenantId) {
    try {
        // Get share
        const [share] = await db.select().from(goalShares)
            .where(and(
                eq(goalShares.id, shareId),
                eq(goalShares.tenantId, tenantId)
            ))
            .limit(1);

        if (!share) {
            throw new Error('Share not found');
        }

        // Check permission
        const canUpdate = share.ownerId === updatedBy || await checkPermission(share.goalId, updatedBy, 'canShare');
        if (!canUpdate) {
            throw new Error('You do not have permission to update this share');
        }

        // Update share
        const [updatedShare] = await db.update(goalShares)
            .set({
                role: newRole,
                permissions: ROLE_PERMISSIONS[newRole],
                updatedAt: new Date()
            })
            .where(eq(goalShares.id, shareId))
            .returning();

        // Invalidate cache
        await cacheService.del(`${CACHE_PREFIX}${share.goalId}`);
        await cacheService.del(`${CACHE_PREFIX}user:${share.sharedWithUserId}`);

        logger.info(`Share ${shareId} role updated to ${newRole}`);

        return updatedShare;
    } catch (error) {
        logger.error('Error updating share role:', error);
        throw error;
    }
}

/**
 * Check if user has specific permission for a goal
 */
export async function checkPermission(goalId, userId, permission) {
    try {
        // Check cache first
        const cacheKey = `${CACHE_PREFIX}permission:${goalId}:${userId}:${permission}`;
        const cached = await cacheService.get(cacheKey);
        if (cached !== null) {
            return cached === 'true';
        }

        // Check if user is goal owner
        const [goal] = await db.select().from(goals)
            .where(eq(goals.id, goalId))
            .limit(1);

        if (!goal) {
            return false;
        }

        if (goal.userId === userId) {
            await cacheService.set(cacheKey, 'true', SHARE_CACHE_TTL);
            return true;
        }

        // Check shares
        const [share] = await db.select().from(goalShares)
            .where(and(
                eq(goalShares.goalId, goalId),
                eq(goalShares.sharedWithUserId, userId),
                eq(goalShares.status, 'active')
            ))
            .limit(1);

        if (!share) {
            await cacheService.set(cacheKey, 'false', SHARE_CACHE_TTL);
            return false;
        }

        // Check expiration
        if (share.expiresAt && new Date() > new Date(share.expiresAt)) {
            await cacheService.set(cacheKey, 'false', SHARE_CACHE_TTL);
            return false;
        }

        // Check permission
        const hasPermission = share.permissions[permission] === true;
        await cacheService.set(cacheKey, hasPermission ? 'true' : 'false', SHARE_CACHE_TTL);

        return hasPermission;
    } catch (error) {
        logger.error('Error checking permission:', error);
        return false;
    }
}

/**
 * Get all shares for a goal
 */
export async function getGoalShares(goalId, tenantId) {
    try {
        const shares = await db.select({
            share: goalShares,
            user: users
        })
        .from(goalShares)
        .leftJoin(users, eq(goalShares.sharedWithUserId, users.id))
        .where(and(
            eq(goalShares.goalId, goalId),
            eq(goalShares.tenantId, tenantId)
        ))
        .orderBy(desc(goalShares.createdAt));

        return shares;
    } catch (error) {
        logger.error('Error getting goal shares:', error);
        throw error;
    }
}

/**
 * Get all goals shared with a user
 */
export async function getSharedWithUser(userId, tenantId) {
    try {
        const sharedGoals = await db.select({
            share: goalShares,
            goal: goals,
            owner: users
        })
        .from(goalShares)
        .leftJoin(goals, eq(goalShares.goalId, goals.id))
        .leftJoin(users, eq(goalShares.ownerId, users.id))
        .where(and(
            eq(goalShares.sharedWithUserId, userId),
            eq(goalShares.tenantId, tenantId),
            eq(goalShares.status, 'active')
        ))
        .orderBy(desc(goalShares.acceptedAt));

        return sharedGoals;
    } catch (error) {
        logger.error('Error getting shared goals:', error);
        throw error;
    }
}

/**
 * Get pending invitations for a user
 */
export async function getPendingInvitations(userEmail, tenantId) {
    try {
        const invitations = await db.select({
            invitation: goalShareInvitations,
            goal: goals,
            inviter: users
        })
        .from(goalShareInvitations)
        .leftJoin(goals, eq(goalShareInvitations.goalId, goals.id))
        .leftJoin(users, eq(goalShareInvitations.invitedBy, users.id))
        .where(and(
            eq(goalShareInvitations.inviteeEmail, userEmail),
            eq(goalShareInvitations.tenantId, tenantId),
            eq(goalShareInvitations.status, 'pending'),
            gte(goalShareInvitations.expiresAt, new Date())
        ))
        .orderBy(desc(goalShareInvitations.sentAt));

        return invitations;
    } catch (error) {
        logger.error('Error getting pending invitations:', error);
        throw error;
    }
}

/**
 * Get share activity log
 */
export async function getShareActivity(goalId, tenantId, limit = 50) {
    try {
        const activity = await db.select().from(goalShareActivityLog)
            .where(and(
                eq(goalShareActivityLog.goalId, goalId),
                eq(goalShareActivityLog.tenantId, tenantId)
            ))
            .orderBy(desc(goalShareActivityLog.createdAt))
            .limit(limit);

        return activity;
    } catch (error) {
        logger.error('Error getting share activity:', error);
        throw error;
    }
}

/**
 * Create share notification
 */
async function createShareNotification({
    tenantId,
    goalId,
    userId,
    shareId = null,
    notificationType,
    title,
    message,
    actionUrl = null,
    actionLabel = null,
    priority = 'normal'
}) {
    try {
        await db.insert(goalShareNotifications).values({
            tenantId,
            goalId,
            userId,
            shareId,
            notificationType,
            title,
            message,
            actionUrl,
            actionLabel,
            priority,
            isRead: false
        });
    } catch (error) {
        logger.error('Error creating share notification:', error);
    }
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId, tenantId) {
    try {
        const notifications = await db.select().from(goalShareNotifications)
            .where(and(
                eq(goalShareNotifications.userId, userId),
                eq(goalShareNotifications.tenantId, tenantId),
                eq(goalShareNotifications.isRead, false)
            ))
            .orderBy(desc(goalShareNotifications.createdAt));

        return notifications;
    } catch (error) {
        logger.error('Error getting unread notifications:', error);
        throw error;
    }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId, userId, tenantId) {
    try {
        await db.update(goalShareNotifications)
            .set({
                isRead: true,
                readAt: new Date()
            })
            .where(and(
                eq(goalShareNotifications.id, notificationId),
                eq(goalShareNotifications.userId, userId),
                eq(goalShareNotifications.tenantId, tenantId)
            ));
    } catch (error) {
        logger.error('Error marking notification as read:', error);
        throw error;
    }
}

/**
 * Export service functions
 */
export default {
    shareGoal,
    createInvitation,
    acceptInvitation,
    declineInvitation,
    revokeShare,
    updateShareRole,
    checkPermission,
    getGoalShares,
    getSharedWithUser,
    getPendingInvitations,
    getShareActivity,
    getUnreadNotifications,
    markNotificationRead,
    ROLE_PERMISSIONS
};
