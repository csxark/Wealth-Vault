
import express from 'express';
import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { protect, checkOwnership } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
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
router.get('/', protect, asyncHandler(async (req, res, next) => {
  // Only return current user for now
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
  if (!user) {
    return next(new AppError(404, 'User not found'));
  }
  delete user.password;

  return new ApiResponse(200, [user], 'User retrieved successfully').send(res);
}));

// @route   GET /api/users/audit-trail
// @desc    Get user's audit trail / activity log
// @access  Private
router.get('/audit-trail', protect, asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, action, startDate, endDate } = req.query;

  const result = await getUserAuditTrail(req.user.id, {
    page: parseInt(page, 10),
    limit: Math.min(parseInt(limit, 10), 100), // Max 100 per page
    action,
    startDate,
    endDate,
  });

  return new ApiResponse(200, {
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
  }, 'Audit trail retrieved successfully').send(res);
}));

// @route   GET /api/users/security-events
// @desc    Get user's recent security events (login, logout, password changes)
// @access  Private
router.get('/security-events', protect, asyncHandler(async (req, res, next) => {
  const { limit = 10 } = req.query;

  const events = await getRecentSecurityEvents(
    req.user.id,
    Math.min(parseInt(limit, 10), 50) // Max 50 events
  );

  return new ApiResponse(200, {
    events: events.map(event => ({
      id: event.id,
      action: event.action,
      status: event.status,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })),
  }, 'Security events retrieved successfully').send(res);
}));

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', protect, checkOwnership('User'), asyncHandler(async (req, res, next) => {
  const user = req.resource;
  return new ApiResponse(200, { user: getPublicProfile(user) }, 'User retrieved successfully').send(res);
}));

// @route   DELETE /api/users/:id
// @desc    Delete user account
// @access  Private
router.delete('/:id', protect, checkOwnership('User'), asyncHandler(async (req, res, next) => {
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

  return new ApiResponse(200, null, 'Account deactivated successfully').send(res);
}));

// @route   GET /api/users/:id/stats
// @desc    Get user financial statistics
// @access  Private
router.get('/:id/stats', protect, checkOwnership('User'), asyncHandler(async (req, res, next) => {
  const user = req.resource;

  const stats = {
    monthlyIncome: user.monthlyIncome,
    monthlyBudget: user.monthlyBudget,
    emergencyFund: user.emergencyFund,
    currency: user.currency,
    memberSince: user.createdAt,
    lastLogin: user.lastLogin
  };

  return new ApiResponse(200, { stats }, 'User stats retrieved successfully').send(res);
}));

// @route   PUT /api/users/preferences
// @desc    Update user preferences (notifications, theme, etc.)
// @access  Private
router.put('/preferences', protect, asyncHandler(async (req, res, next) => {
  const { preferences } = req.body;

  if (!preferences) {
    return next(new AppError(400, 'Preferences object is required'));
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

  return new ApiResponse(200, { preferences: updatedUser.preferences }, 'Preferences updated successfully').send(res);
}));

export default router;
