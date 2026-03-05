/**
 * Habits Routes
 * API endpoints for financial health scores, badges, habit logs, and coaching
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { 
  calculateFinancialHealthScore, 
  saveUserScore, 
  getUserScore 
} from '../services/behaviorEngine.js';
import {
  analyzeSpendingPsychology,
  detectSpendingHabits,
  generateWeeklyCoachingTips
} from '../services/habitAI.js';
import { db } from '../config/db.js';
import { userScores, badges, habitLogs, expenses } from '../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

const router = express.Router();

/**
 * GET /api/habits/score
 * Get current financial health score
 */
router.get('/score', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if score exists and is recent (less than 24 hours old)
    let score = await getUserScore(userId);
    
    const needsRecalculation = !score || 
      (new Date() - new Date(score.lastCalculatedAt)) > 24 * 60 * 60 * 1000;

    if (needsRecalculation) {
      // Calculate new score
      const calculatedScore = await calculateFinancialHealthScore(userId);
      score = await saveUserScore(userId, calculatedScore);
    }

    res.json({
      success: true,
      data: {
        overallScore: score.overallScore,
        breakdown: {
          budgetAdherence: score.budgetAdherenceScore,
          savingsRate: score.savingsRateScore,
          consistency: score.consistencyScore,
          impulseControl: score.impulseControlScore,
          planning: score.planningScore
        },
        gamification: {
          level: score.level,
          experiencePoints: score.experiencePoints,
          nextLevelThreshold: score.nextLevelThreshold,
          progress: ((score.experiencePoints / score.nextLevelThreshold) * 100).toFixed(1)
        },
        streaks: {
          current: score.currentStreak,
          longest: score.longestStreak
        },
        insights: score.insights,
        strengths: score.strengths,
        improvements: score.improvements,
        lastCalculatedAt: score.lastCalculatedAt,
        nextCalculation: new Date(new Date(score.lastCalculatedAt).getTime() + 24 * 60 * 60 * 1000)
      }
    });
  } catch (error) {
    console.error('Error fetching financial health score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch financial health score'
    });
  }
});

/**
 * POST /api/habits/score/recalculate
 * Force recalculation of financial health score
 */
router.post('/score/recalculate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const calculatedScore = await calculateFinancialHealthScore(userId);
    const savedScore = await saveUserScore(userId, calculatedScore);

    res.json({
      success: true,
      message: 'Financial health score recalculated successfully',
      data: savedScore
    });
  } catch (error) {
    console.error('Error recalculating score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recalculate score'
    });
  }
});

/**
 * GET /api/habits/score/history
 * Get score history and trends
 */
router.get('/score/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = '90' } = req.query; // Days to look back

    const score = await getUserScore(userId);
    
    if (!score || !score.scoreHistory) {
      return res.json({
        success: true,
        data: {
          history: [],
          trend: 'neutral',
          averageScore: 0
        }
      });
    }

    const daysBack = parseInt(period);
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    
    const filteredHistory = score.scoreHistory
      .filter(entry => new Date(entry.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate trend
    let trend = 'neutral';
    if (filteredHistory.length >= 2) {
      const firstScore = filteredHistory[0].overallScore;
      const lastScore = filteredHistory[filteredHistory.length - 1].overallScore;
      const change = lastScore - firstScore;
      
      if (change > 5) trend = 'improving';
      else if (change < -5) trend = 'declining';
    }

    const averageScore = filteredHistory.length > 0
      ? filteredHistory.reduce((sum, entry) => sum + entry.overallScore, 0) / filteredHistory.length
      : 0;

    res.json({
      success: true,
      data: {
        history: filteredHistory,
        trend,
        averageScore: Math.round(averageScore),
        periodDays: daysBack,
        dataPoints: filteredHistory.length
      }
    });
  } catch (error) {
    console.error('Error fetching score history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch score history'
    });
  }
});

/**
 * GET /api/habits/badges
 * Get all badges (earned and available)
 */
router.get('/badges', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status = 'all' } = req.query; // all, earned, available

    let query = db.query.badges.findMany({
      where: eq(badges.userId, userId),
      orderBy: [desc(badges.earnedAt), badges.displayOrder]
    });

    let userBadges = await query;

    // Filter by status
    if (status === 'earned') {
      userBadges = userBadges.filter(b => b.isUnlocked);
    } else if (status === 'available') {
      userBadges = userBadges.filter(b => !b.isUnlocked);
    }

    // Group by category
    const byCategory = userBadges.reduce((acc, badge) => {
      const category = badge.category || 'general';
      if (!acc[category]) acc[category] = [];
      acc[category].push(badge);
      return acc;
    }, {});

    // Calculate statistics
    const totalBadges = userBadges.length;
    const earnedCount = userBadges.filter(b => b.isUnlocked).length;
    const completionRate = totalBadges > 0 ? ((earnedCount / totalBadges) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        badges: userBadges,
        byCategory,
        statistics: {
          total: totalBadges,
          earned: earnedCount,
          available: totalBadges - earnedCount,
          completionRate: parseFloat(completionRate)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching badges:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch badges'
    });
  }
});

/**
 * POST /api/habits/badges/:id/claim
 * Claim an earned badge
 */
router.post('/badges/:id/claim', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const badgeId = req.params.id;

    // Fetch badge
    const badge = await db.query.badges.findFirst({
      where: and(
        eq(badges.id, badgeId),
        eq(badges.userId, userId)
      )
    });

    if (!badge) {
      return res.status(404).json({
        success: false,
        error: 'Badge not found'
      });
    }

    if (badge.isUnlocked) {
      return res.status(400).json({
        success: false,
        error: 'Badge already claimed'
      });
    }

    // Check if requirements are met
    if (badge.progress < 100) {
      return res.status(400).json({
        success: false,
        error: 'Badge requirements not yet met',
        currentProgress: badge.progress
      });
    }

    // Update badge and award XP
    const [updatedBadge] = await db
      .update(badges)
      .set({
        isUnlocked: true,
        earnedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(badges.id, badgeId))
      .returning();

    // Award experience points
    const currentScore = await getUserScore(userId);
    if (currentScore && badge.experienceReward) {
      await db
        .update(userScores)
        .set({
          experiencePoints: currentScore.experiencePoints + badge.experienceReward,
          updatedAt: new Date()
        })
        .where(eq(userScores.userId, userId));
    }

    res.json({
      success: true,
      message: `Badge "${badge.badgeName}" claimed successfully!`,
      data: {
        badge: updatedBadge,
        xpAwarded: badge.experienceReward
      }
    });
  } catch (error) {
    console.error('Error claiming badge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to claim badge'
    });
  }
});

/**
 * GET /api/habits/logs
 * Get detected habit patterns
 */
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, limit = 50, offset = 0 } = req.query;

    let whereConditions = [eq(habitLogs.userId, userId)];
    
    if (category) {
      whereConditions.push(eq(habitLogs.habitCategory, category));
    }

    const logs = await db.query.habitLogs.findMany({
      where: and(...whereConditions),
      orderBy: [desc(habitLogs.loggedAt)],
      limit: parseInt(limit),
      offset: parseInt(offset),
      with: {
        relatedExpense: true,
        relatedGoal: true
      }
    });

    // Calculate summary statistics
    const positiveCount = logs.filter(l => l.habitCategory === 'positive').length;
    const negativeCount = logs.filter(l => l.habitCategory === 'negative').length;
    const neutralCount = logs.filter(l => l.habitCategory === 'neutral').length;
    
    const avgImpact = logs.length > 0
      ? logs.reduce((sum, log) => sum + log.impactScore, 0) / logs.length
      : 0;

    res.json({
      success: true,
      data: {
        logs,
        summary: {
          total: logs.length,
          positive: positiveCount,
          negative: negativeCount,
          neutral: neutralCount,
          averageImpact: Math.round(avgImpact)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching habit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch habit logs'
    });
  }
});

/**
 * POST /api/habits/logs/:id/acknowledge
 * Acknowledge a detected habit
 */
router.post('/logs/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const logId = req.params.id;
    const { correctionAction } = req.body;

    const log = await db.query.habitLogs.findFirst({
      where: and(
        eq(habitLogs.id, logId),
        eq(habitLogs.userId, userId)
      )
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Habit log not found'
      });
    }

    const [updated] = await db
      .update(habitLogs)
      .set({
        userAcknowledged: true,
        acknowledgedAt: new Date(),
        correctionAction: correctionAction || null
      })
      .where(eq(habitLogs.id, logId))
      .returning();

    // Award XP for acknowledging
    const currentScore = await getUserScore(userId);
    if (currentScore) {
      await db
        .update(userScores)
        .set({
          experiencePoints: currentScore.experiencePoints + 10, // 10 XP for self-awareness
          updatedAt: new Date()
        })
        .where(eq(userScores.userId, userId));
    }

    res.json({
      success: true,
      message: 'Habit acknowledged successfully',
      data: updated,
      xpAwarded: 10
    });
  } catch (error) {
    console.error('Error acknowledging habit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge habit'
    });
  }
});

/**
 * GET /api/habits/coaching
 * Get AI-generated coaching tips
 */
router.get('/coaching', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const score = await getUserScore(userId);
    
    if (!score) {
      return res.json({
        success: true,
        data: {
          tips: [{
            title: 'Get Started',
            message: 'Begin tracking your expenses to receive personalized coaching.',
            actionableStep: 'Add your first expense',
            category: 'general',
            motivationLevel: 'encourage'
          }],
          weeklyChallenge: null,
          encouragement: 'Welcome to your financial health journey!'
        }
      });
    }

    const coachingTips = await generateWeeklyCoachingTips(userId, score);

    res.json({
      success: true,
      data: coachingTips
    });
  } catch (error) {
    console.error('Error generating coaching tips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate coaching tips'
    });
  }
});

/**
 * GET /api/habits/psychology
 * Get psychological analysis of spending patterns
 */
router.get('/psychology', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { days = 30 } = req.query;

    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
    
    const analysis = await analyzeSpendingPsychology(userId, startDate);

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error generating psychological analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate psychological analysis'
    });
  }
});

/**
 * GET /api/habits/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Parallel fetch all dashboard data
    const [score, earnedBadges, recentHabits, totalBadgeCount] = await Promise.all([
      getUserScore(userId),
      db.query.badges.findMany({
        where: and(
          eq(badges.userId, userId),
          eq(badges.isUnlocked, true)
        ),
        orderBy: [desc(badges.earnedAt)],
        limit: 5
      }),
      db.query.habitLogs.findMany({
        where: eq(habitLogs.userId, userId),
        orderBy: [desc(habitLogs.loggedAt)],
        limit: 10
      }),
      db.select({ count: sql`COUNT(*)` }).from(badges).where(eq(badges.userId, userId))
    ]);

    const dashboardData = {
      score: score ? {
        overall: score.overallScore,
        level: score.level,
        xp: score.experiencePoints,
        nextLevel: score.nextLevelThreshold,
        streak: score.currentStreak
      } : null,
      badges: {
        recentlyEarned: earnedBadges,
        totalEarned: earnedBadges.length,
        totalAvailable: Number(totalBadgeCount[0]?.count || 0)
      },
      recentHabits: recentHabits.slice(0, 5),
      quickStats: {
        positiveHabits: recentHabits.filter(h => h.habitCategory === 'positive').length,
        needsAttention: recentHabits.filter(h => h.habitCategory === 'negative').length
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
});

/**
 * GET /api/habits/leaderboard
 * Optional: Get leaderboard (top scores)
 */
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const topScores = await db
      .select({
        userId: userScores.userId,
        overallScore: userScores.overallScore,
        level: userScores.level,
        currentStreak: userScores.currentStreak
      })
      .from(userScores)
      .orderBy(desc(userScores.overallScore), desc(userScores.level))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        leaderboard: topScores,
        yourRank: topScores.findIndex(s => s.userId === req.user.userId) + 1
      }
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

export default router;
