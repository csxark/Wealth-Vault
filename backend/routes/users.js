import express from 'express';
import { protect, checkOwnership } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (admin only - for future use)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    // For now, only return current user
    // In the future, this could be expanded for admin functionality
    const users = await User.find({ _id: req.user._id })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', protect, checkOwnership('User'), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.resource.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user account
// @access  Private
router.delete('/:id', protect, checkOwnership('User'), async (req, res) => {
  try {
    // Soft delete - mark as inactive instead of removing
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { isActive: false },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
});

// @route   GET /api/users/:id/stats
// @desc    Get user financial statistics
// @access  Private
router.get('/:id/stats', protect, checkOwnership('User'), async (req, res) => {
  try {
    // This would typically aggregate data from expenses, goals, etc.
    // For now, return basic user stats
    const user = req.resource;
    
    const stats = {
      monthlyIncome: user.monthlyIncome,
      monthlyBudget: user.monthlyBudget,
      emergencyFund: user.emergencyFund,
      currency: user.currency,
      memberSince: user.createdAt,
      lastLogin: user.lastLogin
    };

    res.json({
      success: true,
      data: {
        stats
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user statistics'
    });
  }
});

export default router;
