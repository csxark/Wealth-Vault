import express from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { protect } from '../middleware/auth.js';
import notificationService from '../services/notificationService.js';

const router = express.Router();

/**
 * @swagger
 * /notifications/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscription
 *             properties:
 *               subscription:
 *                 type: object
 *                 description: Push subscription object from browser
 *     responses:
 *       200:
 *         description: Successfully subscribed to push notifications
 *       400:
 *         description: Invalid subscription data
 *       401:
 *         description: Unauthorized
 */
router.post('/subscribe', protect, [
  body('subscription').isObject().withMessage('Subscription object is required'),
  body('subscription.endpoint').isURL().withMessage('Valid endpoint URL is required'),
], asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Invalid subscription data').send(res);
  }

  const { subscription } = req.body;
  const userId = req.user.id;

  try {
    // Store the subscription in database
    const success = await notificationService.storePushSubscription(
      userId,
      subscription,
      req.headers['user-agent']
    );

    if (!success) {
      return new ApiResponse(500, null, 'Failed to store push subscription').send(res);
    }

    return new ApiResponse(200, null, 'Successfully subscribed to push notifications').send(res);
  } catch (error) {
    console.error('Push subscription failed:', error);
    return new ApiResponse(500, null, 'Failed to subscribe to push notifications').send(res);
  }
}));

/**
 * @swagger
 * /notifications/unsubscribe:
 *   post:
 *     summary: Unsubscribe from push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully unsubscribed from push notifications
 *       401:
 *         description: Unauthorized
 */
router.post('/unsubscribe', protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  try {
    const success = await notificationService.removeAllPushSubscriptions(userId);

    if (!success) {
      return new ApiResponse(500, null, 'Failed to unsubscribe from push notifications').send(res);
    }

    return new ApiResponse(200, null, 'Successfully unsubscribed from push notifications').send(res);
  } catch (error) {
    console.error('Push unsubscription failed:', error);
    return new ApiResponse(500, null, 'Failed to unsubscribe from push notifications').send(res);
  }
}));

/**
 * @swagger
 * /notifications/test:
 *   post:
 *     summary: Send test push notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test notification sent
 *       401:
 *         description: Unauthorized
 */
router.post('/test', protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  try {
    const success = await notificationService.sendNotification(userId, {
      title: 'Test Notification',
      message: 'This is a test push notification from Wealth Vault!',
      type: 'test',
      data: {
        requireInteraction: true,
        actions: [
          { action: 'view', title: 'View Dashboard' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      }
    });

    if (success) {
      return new ApiResponse(200, null, 'Test notification sent successfully').send(res);
    } else {
      return new ApiResponse(500, null, 'Failed to send test notification').send(res);
    }
  } catch (error) {
    console.error('Test notification failed:', error);
    return new ApiResponse(500, null, 'Failed to send test notification').send(res);
  }
}));

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences retrieved
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: boolean
 *               push:
 *                 type: boolean
 *               budgetAlerts:
 *                 type: boolean
 *               goalReminders:
 *                 type: boolean
 *               securityAlerts:
 *                 type: boolean
 *               weeklyReports:
 *                 type: boolean
 *               marketing:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: Invalid preferences data
 *       401:
 *         description: Unauthorized
 */
router.get('/preferences', protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  try {
    // In a real implementation, you'd fetch from database
    // For now, return default preferences
    const preferences = {
      email: true,
      push: true,
      budgetAlerts: true,
      goalReminders: true,
      securityAlerts: true,
      weeklyReports: false,
      marketing: false
    };

    return new ApiResponse(200, preferences, 'Notification preferences retrieved').send(res);
  } catch (error) {
    console.error('Get preferences failed:', error);
    return new ApiResponse(500, null, 'Failed to retrieve preferences').send(res);
  }
}));

router.put('/preferences', protect, [
  body('email').optional().isBoolean(),
  body('push').optional().isBoolean(),
  body('budgetAlerts').optional().isBoolean(),
  body('goalReminders').optional().isBoolean(),
  body('securityAlerts').optional().isBoolean(),
  body('weeklyReports').optional().isBoolean(),
  body('marketing').optional().isBoolean(),
], asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return new ApiResponse(400, null, 'Invalid preferences data').send(res);
  }

  const userId = req.user.id;
  const preferences = req.body;

  try {
    // In a real implementation, you'd update user preferences in database
    console.log(`[Preferences] User ${userId} updated preferences:`, preferences);

    return new ApiResponse(200, preferences, 'Notification preferences updated successfully').send(res);
  } catch (error) {
    console.error('Update preferences failed:', error);
    return new ApiResponse(500, null, 'Failed to update preferences').send(res);
  }
}));

export default router;