import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import gamificationService from '../services/gamificationService.js';

const router = express.Router();

// Get user achievements
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const achievements = await gamificationService.getUserAchievements(userId);
    res.json({
      success: true,
      data: achievements
    });
  } catch (error) {
    console.error('Error fetching user achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch achievements'
    });
  }
});

// Get achievement progress
router.get('/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const progress = await gamificationService.getUserProgress(userId);
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Error fetching achievement progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch achievement progress'
    });
  }
});

// Get available achievements
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const achievements = await gamificationService.getAvailableAchievements(userId);
    res.json({
      success: true,
      data: achievements
    });
  } catch (error) {
    console.error('Error fetching available achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available achievements'
    });
  }
});

// Get achievement statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await gamificationService.getUserStats(userId);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching achievement stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch achievement statistics'
    });
  }
});

// Get gamification dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboard = await gamificationService.getGamificationDashboard(userId);
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Error fetching gamification dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gamification dashboard'
    });
  }
});

// Manually trigger achievement check (for testing)
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const results = await gamificationService.checkAllAchievements(userId);

    res.json({
      success: true,
      data: results,
      message: `Checked achievements for user`
    });
  } catch (error) {
    console.error('Error checking achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check achievements'
    });
  }
});

export default router;
