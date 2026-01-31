
import express from 'express';
import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { protect, checkOwnership } from '../middleware/auth.js';
import { logAudit, AuditActions, ResourceTypes } from '../middleware/auditLogger.js';
import { getUserAuditTrail, getRecentSecurityEvents } from '../services/auditService.js';

const router = express.Router();

// Helper to sanitize user object
const getPublicProfile = (user) => {
  const { password, ...publicUser } = user;
  return publicUser;
};

// @route   GET /api/users
// @desc    Get all users (admin only - for future use)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    // Only return current user for now
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    delete user.password;

    res.json({
      success: true,
      count: 1,
      data: [user]
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching users' });
  }
});

// @route   GET /api/users/audit-trail
// @desc    Get user's audit trail / activity log
// @access  Private
router.get('/audit-trail', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, action, startDate, endDate } = req.query;

    const result = await getUserAuditTrail(req.user.id, {
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100), // Max 100 per page
      action,
      startDate,
      endDate,
    });

    res.json({
      success: true,
      data: {
        logs: result.logs.map(log => ({
          id: log.id,
          action: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          status: log.status,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          metadata: log.metadata,
          createdAt: log.createdAt,
        })),
        pagination: result.pagination,
      },
    });
  } catch (error) {
    console.error('Get audit trail error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching audit trail' });
  }
});

// @route   GET /api/users/security-events
// @desc    Get user's recent security events (login, logout, password changes)
// @access  Private
router.get('/security-events', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const events = await getRecentSecurityEvents(
      req.user.id,
      Math.min(parseInt(limit, 10), 50) // Max 50 events
    );

    res.json({
      success: true,
      data: {
        events: events.map(event => ({
          id: event.id,
          action: event.action,
          status: event.status,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: event.metadata,
          createdAt: event.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get security events error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching security events' });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', protect, checkOwnership('User'), async (req, res) => {
  try {
    const user = req.resource;
    res.json({
      success: true,
      data: { user: getPublicProfile(user) }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching user' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user account
// @access  Private
router.delete('/:id', protect, checkOwnership('User'), async (req, res) => {
  try {
    await db.update(users)
      .set({ isActive: false })
      .where(eq(users.id, req.user.id));

    // Log account deactivation
    logAudit(req, {
      userId: req.user.id,
      action: AuditActions.ACCOUNT_DEACTIVATE,
      resourceType: ResourceTypes.USER,
      resourceId: req.user.id,
      status: 'success',
    });

    res.json({ success: true, message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting user' });
  }
});

// @route   GET /api/users/:id/stats
// @desc    Get user financial statistics
// @access  Private
router.get('/:id/stats', protect, checkOwnership('User'), async (req, res) => {
  try {
    const user = req.resource;

    const stats = {
      monthlyIncome: user.monthlyIncome,
      monthlyBudget: user.monthlyBudget,
      emergencyFund: user.emergencyFund,
      currency: user.currency,
      memberSince: user.createdAt,
      lastLogin: user.lastLogin
    };

    res.json({ success: true, data: { stats } });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching user statistics' });
  }
});

// @route   PUT /api/users/preferences
// @desc    Update user preferences (notifications, theme, etc.)
// @access  Private
router.put('/preferences', protect, async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({ success: false, message: 'Preferences object is required' });
    }

    const [updatedUser] = await db.update(users)
      .set({
        preferences: {
          ...req.user.preferences,
          ...preferences
        },
        updatedAt: new Date()
      })
      .where(eq(users.id, req.user.id))
      .returning();

    // Log preference update
    logAudit(req, {
      userId: req.user.id,
      action: AuditActions.USER_UPDATE,
      resourceType: ResourceTypes.USER,
      resourceId: req.user.id,
      metadata: { updatedPreferences: Object.keys(preferences) },
      status: 'success',
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: { preferences: updatedUser.preferences }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating preferences' });
  }
});

export default router;
