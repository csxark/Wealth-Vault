/**
 * Goal Sharing API Routes
 * 
 * Provides endpoints for collaborative goal sharing with role-based permissions
 * Implements invitation system with permission inheritance to contributions
 * 
 * Issue #611: Collaborative Goal Sharing with Permission Inheritance
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { goals } from '../db/schema.js';
import goalSharingService from '../services/goalSharingService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /goal-sharing/share:
 *   post:
 *     summary: Share a goal with another user
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goalId
 *               - sharedWithUserId
 *             properties:
 *               goalId:
 *                 type: string
 *                 format: uuid
 *               sharedWithUserId:
 *                 type: string
 *                 format: uuid
 *               role:
 *                 type: string
 *                 enum: [viewer, contributor, manager]
 *                 default: viewer
 *               invitationMessage:
 *                 type: string
 *               expiresInDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *     responses:
 *       201:
 *         description: Goal shared successfully
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Permission denied
 *       500:
 *         description: Server error
 */
router.post(
    '/share',
    protect,
    [
        body('goalId').isUUID().withMessage('Valid goal ID is required'),
        body('sharedWithUserId').isUUID().withMessage('Valid user ID is required'),
        body('role').optional().isIn(['viewer', 'contributor', 'manager']).withMessage('Invalid role'),
        body('invitationMessage').optional().isString().trim(),
        body('expiresInDays').optional().isInt({ min: 1, max: 365 }).withMessage('Expiration must be between 1 and 365 days')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { goalId, sharedWithUserId, role = 'viewer', invitationMessage, expiresInDays } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Verify goal exists and user has permission
            const goal = await db.query.goals.findFirst({
                where: and(
                    eq(goals.id, goalId),
                    eq(goals.tenantId, tenantId)
                )
            });

            if (!goal) {
                return res.status(404).json({ error: 'Goal not found' });
            }

            // Check if user is owner or has share permission
            if (goal.userId !== userId) {
                const canShare = await goalSharingService.checkPermission(goalId, userId, 'canShare');
                if (!canShare) {
                    return res.status(403).json({ error: 'You do not have permission to share this goal' });
                }
            }

            // Share goal
            const share = await goalSharingService.shareGoal({
                goalId,
                tenantId,
                ownerId: userId,
                sharedWithUserId,
                role,
                invitationMessage,
                expiresInDays
            });

            res.status(201).json({
                success: true,
                message: 'Goal shared successfully',
                share
            });
        } catch (error) {
            logger.error('Error sharing goal:', error);
            res.status(500).json({ error: error.message || 'Failed to share goal' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/invite:
 *   post:
 *     summary: Create a goal share invitation
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goalId
 *               - inviteeEmail
 *             properties:
 *               goalId:
 *                 type: string
 *                 format: uuid
 *               inviteeEmail:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [viewer, contributor, manager]
 *                 default: viewer
 *               personalMessage:
 *                 type: string
 *               invitationMethod:
 *                 type: string
 *                 enum: [email, link, in_app]
 *                 default: email
 *               expiresInDays:
 *                 type: integer
 *                 default: 7
 *     responses:
 *       201:
 *         description: Invitation created successfully
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Permission denied
 *       500:
 *         description: Server error
 */
router.post(
    '/invite',
    protect,
    [
        body('goalId').isUUID().withMessage('Valid goal ID is required'),
        body('inviteeEmail').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('role').optional().isIn(['viewer', 'contributor', 'manager']).withMessage('Invalid role'),
        body('personalMessage').optional().isString().trim(),
        body('invitationMethod').optional().isIn(['email', 'link', 'in_app']).withMessage('Invalid invitation method'),
        body('expiresInDays').optional().isInt({ min: 1, max: 365 }).withMessage('Expiration must be between 1 and 365 days')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { goalId, inviteeEmail, role = 'viewer', personalMessage, invitationMethod = 'email', expiresInDays = 7 } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Create invitation
            const invitation = await goalSharingService.createInvitation({
                goalId,
                tenantId,
                invitedBy: userId,
                inviteeEmail,
                role,
                personalMessage,
                invitationMethod,
                expiresInDays
            });

            res.status(201).json({
                success: true,
                message: 'Invitation created successfully',
                invitation
            });
        } catch (error) {
            logger.error('Error creating invitation:', error);
            res.status(500).json({ error: error.message || 'Failed to create invitation' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/invitations/accept/{token}:
 *   post:
 *     summary: Accept a goal share invitation
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *       400:
 *         description: Invalid token or expired invitation
 *       500:
 *         description: Server error
 */
router.post(
    '/invitations/accept/:token',
    protect,
    [
        param('token').isString().withMessage('Valid token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { token } = req.params;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Accept invitation
            const share = await goalSharingService.acceptInvitation(token, userId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Invitation accepted successfully',
                share
            });
        } catch (error) {
            logger.error('Error accepting invitation:', error);
            res.status(400).json({ error: error.message || 'Failed to accept invitation' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/invitations/decline/{token}:
 *   post:
 *     summary: Decline a goal share invitation
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               declineReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation declined successfully
 *       400:
 *         description: Invalid token
 *       500:
 *         description: Server error
 */
router.post(
    '/invitations/decline/:token',
    protect,
    [
        param('token').isString().withMessage('Valid token is required'),
        body('declineReason').optional().isString().trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { token } = req.params;
            const { declineReason } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Decline invitation
            const result = await goalSharingService.declineInvitation(token, userId, tenantId, declineReason);

            res.status(200).json(result);
        } catch (error) {
            logger.error('Error declining invitation:', error);
            res.status(400).json({ error: error.message || 'Failed to decline invitation' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/invitations/pending:
 *   get:
 *     summary: Get pending invitations for current user
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending invitations
 *       500:
 *         description: Server error
 */
router.get(
    '/invitations/pending',
    protect,
    async (req, res) => {
        try {
            const userEmail = req.user.email;
            const tenantId = req.user.tenantId;

            const invitations = await goalSharingService.getPendingInvitations(userEmail, tenantId);

            res.status(200).json({
                success: true,
                invitations
            });
        } catch (error) {
            logger.error('Error getting pending invitations:', error);
            res.status(500).json({ error: 'Failed to retrieve pending invitations' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/revoke/{shareId}:
 *   delete:
 *     summary: Revoke a goal share
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shareId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Share revoked successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Share not found
 *       500:
 *         description: Server error
 */
router.delete(
    '/revoke/:shareId',
    protect,
    [
        param('shareId').isUUID().withMessage('Valid share ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { shareId } = req.params;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Revoke share
            const revokedShare = await goalSharingService.revokeShare(shareId, userId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Share revoked successfully',
                share: revokedShare
            });
        } catch (error) {
            logger.error('Error revoking share:', error);
            const statusCode = error.message.includes('permission') ? 403 : 500;
            res.status(statusCode).json({ error: error.message || 'Failed to revoke share' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/update-role/{shareId}:
 *   patch:
 *     summary: Update share role
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shareId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [viewer, contributor, manager]
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Permission denied
 *       500:
 *         description: Server error
 */
router.patch(
    '/update-role/:shareId',
    protect,
    [
        param('shareId').isUUID().withMessage('Valid share ID is required'),
        body('role').isIn(['viewer', 'contributor', 'manager']).withMessage('Invalid role')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { shareId } = req.params;
            const { role } = req.body;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Update share role
            const updatedShare = await goalSharingService.updateShareRole(shareId, role, userId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Role updated successfully',
                share: updatedShare
            });
        } catch (error) {
            logger.error('Error updating share role:', error);
            const statusCode = error.message.includes('permission') ? 403 : 500;
            res.status(statusCode).json({ error: error.message || 'Failed to update role' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/goal/{goalId}/shares:
 *   get:
 *     summary: Get all shares for a goal
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of goal shares
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Goal not found
 *       500:
 *         description: Server error
 */
router.get(
    '/goal/:goalId/shares',
    protect,
    [
        param('goalId').isUUID().withMessage('Valid goal ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { goalId } = req.params;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Verify goal exists and user has view permission
            const goal = await db.query.goals.findFirst({
                where: and(
                    eq(goals.id, goalId),
                    eq(goals.tenantId, tenantId)
                )
            });

            if (!goal) {
                return res.status(404).json({ error: 'Goal not found' });
            }

            // Check permission
            if (goal.userId !== userId) {
                const canView = await goalSharingService.checkPermission(goalId, userId, 'canView');
                if (!canView) {
                    return res.status(403).json({ error: 'You do not have permission to view this goal' });
                }
            }

            // Get shares
            const shares = await goalSharingService.getGoalShares(goalId, tenantId);

            res.status(200).json({
                success: true,
                shares
            });
        } catch (error) {
            logger.error('Error getting goal shares:', error);
            res.status(500).json({ error: 'Failed to retrieve goal shares' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/shared-with-me:
 *   get:
 *     summary: Get all goals shared with current user
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shared goals
 *       500:
 *         description: Server error
 */
router.get(
    '/shared-with-me',
    protect,
    async (req, res) => {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            const sharedGoals = await goalSharingService.getSharedWithUser(userId, tenantId);

            res.status(200).json({
                success: true,
                sharedGoals
            });
        } catch (error) {
            logger.error('Error getting shared goals:', error);
            res.status(500).json({ error: 'Failed to retrieve shared goals' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/goal/{goalId}/activity:
 *   get:
 *     summary: Get share activity log for a goal
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Share activity log
 *       403:
 *         description: Permission denied
 *       500:
 *         description: Server error
 */
router.get(
    '/goal/:goalId/activity',
    protect,
    [
        param('goalId').isUUID().withMessage('Valid goal ID is required'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { goalId } = req.params;
            const { limit = 50 } = req.query;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Check permission
            const canView = await goalSharingService.checkPermission(goalId, userId, 'canView');
            if (!canView) {
                return res.status(403).json({ error: 'You do not have permission to view this goal activity' });
            }

            // Get activity
            const activity = await goalSharingService.getShareActivity(goalId, tenantId, parseInt(limit));

            res.status(200).json({
                success: true,
                activity
            });
        } catch (error) {
            logger.error('Error getting share activity:', error);
            res.status(500).json({ error: 'Failed to retrieve share activity' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/notifications/unread:
 *   get:
 *     summary: Get unread notifications for current user
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of unread notifications
 *       500:
 *         description: Server error
 */
router.get(
    '/notifications/unread',
    protect,
    async (req, res) => {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            const notifications = await goalSharingService.getUnreadNotifications(userId, tenantId);

            res.status(200).json({
                success: true,
                notifications
            });
        } catch (error) {
            logger.error('Error getting unread notifications:', error);
            res.status(500).json({ error: 'Failed to retrieve notifications' });
        }
    }
);

/**
 * @swagger
 * /goal-sharing/notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Goal Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.patch(
    '/notifications/:notificationId/read',
    protect,
    [
        param('notificationId').isUUID().withMessage('Valid notification ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { notificationId } = req.params;
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            await goalSharingService.markNotificationRead(notificationId, userId, tenantId);

            res.status(200).json({
                success: true,
                message: 'Notification marked as read'
            });
        } catch (error) {
            logger.error('Error marking notification as read:', error);
            res.status(500).json({ error: 'Failed to mark notification as read' });
        }
    }
);

export default router;
