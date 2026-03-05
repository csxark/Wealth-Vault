/**
 * Goal Sharing Service Tests
 * 
 * Tests for collaborative goal sharing with role-based permissions:
 * - Goal sharing with different roles
 * - Invitation creation and acceptance
 * - Permission inheritance to contributions
 * - Permission validation
 * - Activity logging
 * - Notifications
 * 
 * Issue #611: Collaborative Goal Sharing with Permission Inheritance
 */

import db from '../config/db.js';
import goalSharingService from '../services/goalSharingService.js';
import * as cacheService from '../services/cacheService.js';
import { 
    goalShares,
    goalShareInvitations,
    goalShareActivityLog,
    goalContributionPermissions,
    goalShareSettings,
    goalShareNotifications,
    goals, 
    users, 
    tenants 
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

let testTenantId, testOwnerId, testSharedUserId, testGoalId;

describe('Goal Sharing Service - Collaborative Sharing', () => {
    beforeEach(async () => {
        // Create test tenant
        const [tenant] = await db
            .insert(tenants)
            .values({
                name: 'Test Tenant Goal Sharing',
                slug: `test-goal-sharing-${Date.now()}`,
                ownerId: null,
            })
            .returning();
        testTenantId = tenant.id;

        // Create test owner
        const [owner] = await db
            .insert(users)
            .values({
                email: `owner-${Date.now()}@example.com`,
                password: 'hashed_password',
                firstName: 'Goal',
                lastName: 'Owner',
                fullName: 'Goal Owner',
                tenantId: testTenantId,
            })
            .returning();
        testOwnerId = owner.id;

        // Update tenant owner
        await db
            .update(tenants)
            .set({ ownerId: testOwnerId })
            .where(eq(tenants.id, testTenantId));

        // Create shared user
        const [sharedUser] = await db
            .insert(users)
            .values({
                email: `shared-${Date.now()}@example.com`,
                password: 'hashed_password',
                firstName: 'Shared',
                lastName: 'User',
                fullName: 'Shared User',
                tenantId: testTenantId,
            })
            .returning();
        testSharedUserId = sharedUser.id;

        // Create test goal
        const [goal] = await db
            .insert(goals)
            .values({
                tenantId: testTenantId,
                userId: testOwnerId,
                title: 'Emergency Fund',
                targetAmount: '10000',
                currentAmount: '2000',
                deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            })
            .returning();
        testGoalId = goal.id;
    });

    afterEach(async () => {
        // Cleanup test data in correct order
        await db.delete(goalShareNotifications).where(eq(goalShareNotifications.tenantId, testTenantId));
        await db.delete(goalShareActivityLog).where(eq(goalShareActivityLog.tenantId, testTenantId));
        await db.delete(goalContributionPermissions).where(eq(goalContributionPermissions.tenantId, testTenantId));
        await db.delete(goalShareInvitations).where(eq(goalShareInvitations.tenantId, testTenantId));
        await db.delete(goalShares).where(eq(goalShares.tenantId, testTenantId));
        await db.delete(goalShareSettings).where(eq(goalShareSettings.tenantId, testTenantId));
        await db.delete(goals).where(eq(goals.id, testGoalId));
        await db.delete(users).where(eq(users.id, testSharedUserId));
        await db.delete(users).where(eq(users.id, testOwnerId));
        await db.delete(tenants).where(eq(tenants.id, testTenantId));

        // Clear cache
        await cacheService.del(`goal_share:${testGoalId}`);
        await cacheService.del(`goal_share:user:${testSharedUserId}`);
    });

    describe('Goal Sharing - Basic Operations', () => {
        it('should share a goal with viewer role', async () => {
            const share = await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            expect(share).toBeDefined();
            expect(share.goalId).toBe(testGoalId);
            expect(share.sharedWithUserId).toBe(testSharedUserId);
            expect(share.role).toBe('viewer');
            expect(share.status).toBe('active');
            expect(share.permissions.canView).toBe(true);
            expect(share.permissions.canContribute).toBe(false);
            expect(share.permissions.canEdit).toBe(false);
        });

        it('should share a goal with contributor role', async () => {
            const share = await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'contributor'
            });

            expect(share.role).toBe('contributor');
            expect(share.permissions.canView).toBe(true);
            expect(share.permissions.canContribute).toBe(true);
            expect(share.permissions.canEditOwnContributions).toBe(true);
            expect(share.permissions.canWithdraw).toBe(true);
            expect(share.permissions.canEdit).toBe(false);
        });

        it('should share a goal with manager role', async () => {
            const share = await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'manager'
            });

            expect(share.role).toBe('manager');
            expect(share.permissions.canView).toBe(true);
            expect(share.permissions.canContribute).toBe(true);
            expect(share.permissions.canEdit).toBe(true);
            expect(share.permissions.canShare).toBe(true);
            expect(share.permissions.canEditAllContributions).toBe(true);
            expect(share.permissions.canChangeGoalDetails).toBe(true);
            expect(share.permissions.canDelete).toBe(false);
        });

        it('should prevent sharing same goal twice with same user', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            await expect(
                goalSharingService.shareGoal({
                    goalId: testGoalId,
                    tenantId: testTenantId,
                    ownerId: testOwnerId,
                    sharedWithUserId: testSharedUserId,
                    role: 'contributor'
                })
            ).rejects.toThrow('already shared');
        });

        it('should create goal share settings automatically', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const [settings] = await db.select().from(goalShareSettings)
                .where(eq(goalShareSettings.goalId, testGoalId))
                .limit(1);

            expect(settings).toBeDefined();
            expect(settings.isSharingEnabled).toBe(true);
            expect(settings.currentShareCount).toBe('1');
        });
    });

    describe('Invitation System', () => {
        it('should create goal share invitation', async () => {
            const invitation = await goalSharingService.createInvitation({
                goalId: testGoalId,
                tenantId: testTenantId,
                invitedBy: testOwnerId,
                inviteeEmail: 'new-user@example.com',
                role: 'contributor',
                personalMessage: 'Join my savings goal!',
                invitationMethod: 'email',
                expiresInDays: 7
            });

            expect(invitation).toBeDefined();
            expect(invitation.goalId).toBe(testGoalId);
            expect(invitation.inviteeEmail).toBe('new-user@example.com');
            expect(invitation.role).toBe('contributor');
            expect(invitation.status).toBe('pending');
            expect(invitation.invitationToken).toBeDefined();
            expect(invitation.personalMessage).toBe('Join my savings goal!');
        });

        it('should accept invitation and create share', async () => {
            const invitation = await goalSharingService.createInvitation({
                goalId: testGoalId,
                tenantId: testTenantId,
                invitedBy: testOwnerId,
                inviteeEmail: 'shared-' + Date.now() + '@example.com',
                role: 'contributor',
                expiresInDays: 7
            });

            // Update shared user email to match invitation
            await db.update(users)
                .set({ email: invitation.inviteeEmail })
                .where(eq(users.id, testSharedUserId));

            const share = await goalSharingService.acceptInvitation(
                invitation.invitationToken,
                testSharedUserId,
                testTenantId
            );

            expect(share).toBeDefined();
            expect(share.goalId).toBe(testGoalId);
            expect(share.sharedWithUserId).toBe(testSharedUserId);
            expect(share.status).toBe('active');

            // Verify invitation status updated
            const [updatedInvitation] = await db.select().from(goalShareInvitations)
                .where(eq(goalShareInvitations.id, invitation.id))
                .limit(1);

            expect(updatedInvitation.status).toBe('active');
            expect(updatedInvitation.resultingShareId).toBe(share.id);
        });

        it('should decline invitation', async () => {
            const invitation = await goalSharingService.createInvitation({
                goalId: testGoalId,
                tenantId: testTenantId,
                invitedBy: testOwnerId,
                inviteeEmail: 'shared-' + Date.now() + '@example.com',
                role: 'viewer',
                expiresInDays: 7
            });

            await db.update(users)
                .set({ email: invitation.inviteeEmail })
                .where(eq(users.id, testSharedUserId));

            const result = await goalSharingService.declineInvitation(
                invitation.invitationToken,
                testSharedUserId,
                testTenantId,
                'Not interested'
            );

            expect(result.success).toBe(true);

            // Verify invitation status
            const [updatedInvitation] = await db.select().from(goalShareInvitations)
                .where(eq(goalShareInvitations.id, invitation.id))
                .limit(1);

            expect(updatedInvitation.status).toBe('declined');
            expect(updatedInvitation.declineReason).toBe('Not interested');
        });

        it('should reject expired invitation', async () => {
            const invitation = await goalSharingService.createInvitation({
                goalId: testGoalId,
                tenantId: testTenantId,
                invitedBy: testOwnerId,
                inviteeEmail: 'shared-' + Date.now() + '@example.com',
                role: 'viewer',
                expiresInDays: 7
            });

            // Manually expire invitation
            await db.update(goalShareInvitations)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(goalShareInvitations.id, invitation.id));

            await db.update(users)
                .set({ email: invitation.inviteeEmail })
                .where(eq(users.id, testSharedUserId));

            await expect(
                goalSharingService.acceptInvitation(
                    invitation.invitationToken,
                    testSharedUserId,
                    testTenantId
                )
            ).rejects.toThrow('expired');
        });
    });

    describe('Permission Management', () => {
        it('should check view permission for viewer', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const canView = await goalSharingService.checkPermission(
                testGoalId,
                testSharedUserId,
                'canView'
            );
            const canContribute = await goalSharingService.checkPermission(
                testGoalId,
                testSharedUserId,
                'canContribute'
            );

            expect(canView).toBe(true);
            expect(canContribute).toBe(false);
        });

        it('should check all permissions for manager', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'manager'
            });

            const canView = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canView');
            const canContribute = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canContribute');
            const canEdit = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canEdit');
            const canShare = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canShare');
            const canDelete = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canDelete');

            expect(canView).toBe(true);
            expect(canContribute).toBe(true);
            expect(canEdit).toBe(true);
            expect(canShare).toBe(true);
            expect(canDelete).toBe(false); // Only owner can delete
        });

        it('should grant all permissions to goal owner', async () => {
            const canView = await goalSharingService.checkPermission(testGoalId, testOwnerId, 'canView');
            const canEdit = await goalSharingService.checkPermission(testGoalId, testOwnerId, 'canEdit');
            const canDelete = await goalSharingService.checkPermission(testGoalId, testOwnerId, 'canDelete');

            expect(canView).toBe(true);
            expect(canEdit).toBe(true);
            expect(canDelete).toBe(true);
        });

        it('should update share role and permissions', async () => {
            const share = await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const updatedShare = await goalSharingService.updateShareRole(
                share.id,
                'contributor',
                testOwnerId,
                testTenantId
            );

            expect(updatedShare.role).toBe('contributor');
            expect(updatedShare.permissions.canContribute).toBe(true);
            expect(updatedShare.permissions.canEditOwnContributions).toBe(true);
        });

        it('should revoke share', async () => {
            const share = await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'contributor'
            });

            const revokedShare = await goalSharingService.revokeShare(
                share.id,
                testOwnerId,
                testTenantId
            );

            expect(revokedShare.status).toBe('revoked');
            expect(revokedShare.revokedAt).toBeDefined();
            expect(revokedShare.revokedBy).toBe(testOwnerId);

            // Check permission no longer works
            const canView = await goalSharingService.checkPermission(
                testGoalId,
                testSharedUserId,
                'canView'
            );
            expect(canView).toBe(false);
        });
    });

    describe('Query Operations', () => {
        it('should get all shares for a goal', async () => {
            // Create another shared user
            const [anotherUser] = await db.insert(users).values({
                email: `another-${Date.now()}@example.com`,
                password: 'hashed_password',
                firstName: 'Another',
                lastName: 'User',
                fullName: 'Another User',
                tenantId: testTenantId,
            }).returning();

            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: anotherUser.id,
                role: 'contributor'
            });

            const shares = await goalSharingService.getGoalShares(testGoalId, testTenantId);

            expect(shares).toHaveLength(2);
            expect(shares[0].share).toBeDefined();
            expect(shares[0].user).toBeDefined();

            // Cleanup
            await db.delete(users).where(eq(users.id, anotherUser.id));
        });

        it('should get all goals shared with a user', async () => {
            // Create another goal
            const [anotherGoal] = await db.insert(goals).values({
                tenantId: testTenantId,
                userId: testOwnerId,
                title: 'Vacation Fund',
                targetAmount: '5000',
                currentAmount: '1000',
                deadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            }).returning();

            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            await goalSharingService.shareGoal({
                goalId: anotherGoal.id,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'contributor'
            });

            const sharedGoals = await goalSharingService.getSharedWithUser(testSharedUserId, testTenantId);

            expect(sharedGoals).toHaveLength(2);
            expect(sharedGoals[0].goal).toBeDefined();
            expect(sharedGoals[0].share).toBeDefined();
            expect(sharedGoals[0].owner).toBeDefined();

            // Cleanup
            await db.delete(goals).where(eq(goals.id, anotherGoal.id));
        });

        it('should get pending invitations for user email', async () => {
            const testEmail = `pending-${Date.now()}@example.com`;

            await goalSharingService.createInvitation({
                goalId: testGoalId,
                tenantId: testTenantId,
                invitedBy: testOwnerId,
                inviteeEmail: testEmail,
                role: 'contributor',
                expiresInDays: 7
            });

            const invitations = await goalSharingService.getPendingInvitations(testEmail, testTenantId);

            expect(invitations).toHaveLength(1);
            expect(invitations[0].invitation).toBeDefined();
            expect(invitations[0].goal).toBeDefined();
            expect(invitations[0].inviter).toBeDefined();
            expect(invitations[0].invitation.inviteeEmail).toBe(testEmail);
        });
    });

    describe('Activity Logging', () => {
        it('should log share creation activity', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const activity = await goalSharingService.getShareActivity(testGoalId, testTenantId, 10);

            expect(activity.length).toBeGreaterThan(0);
            expect(activity[0].activityType).toBeDefined();
            expect(activity[0].action).toBeDefined();
        });

        it('should limit activity results', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const activity = await goalSharingService.getShareActivity(testGoalId, testTenantId, 5);

            expect(activity.length).toBeLessThanOrEqual(5);
        });
    });

    describe('Notifications', () => {
        it('should get unread notifications for user', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const notifications = await goalSharingService.getUnreadNotifications(testSharedUserId, testTenantId);

            expect(notifications.length).toBeGreaterThan(0);
            expect(notifications[0].isRead).toBe(false);
        });

        it('should mark notification as read', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            const [notification] = await goalSharingService.getUnreadNotifications(testSharedUserId, testTenantId);

            await goalSharingService.markNotificationRead(notification.id, testSharedUserId, testTenantId);

            const [updatedNotification] = await db.select().from(goalShareNotifications)
                .where(eq(goalShareNotifications.id, notification.id))
                .limit(1);

            expect(updatedNotification.isRead).toBe(true);
            expect(updatedNotification.readAt).toBeDefined();
        });
    });

    describe('Cache Integration', () => {
        it('should cache permission checks', async () => {
            await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'contributor'
            });

            // First check - should hit database
            const canView1 = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canView');
            // Second check - should hit cache
            const canView2 = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canView');

            expect(canView1).toBe(true);
            expect(canView2).toBe(true);
        });

        it('should invalidate cache on share update', async () => {
            const share = await goalSharingService.shareGoal({
                goalId: testGoalId,
                tenantId: testTenantId,
                ownerId: testOwnerId,
                sharedWithUserId: testSharedUserId,
                role: 'viewer'
            });

            await goalSharingService.updateShareRole(share.id, 'manager', testOwnerId, testTenantId);

            // Cache should be cleared
            const canShare = await goalSharingService.checkPermission(testGoalId, testSharedUserId, 'canShare');
            expect(canShare).toBe(true);
        });
    });
});
