
import express from 'express';
import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { protect, checkOwnership } from '../middleware/auth.js';

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

export default router;
