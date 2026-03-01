import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import db from '../config/db.js';
import { 
  achievementDefinitions, 
  userAchievements, 
  userPoints, 
  pointsHistory, 
  userStreaks,
  users,
  expenses,
  goals,
  challenges,
  challengeParticipants,
  financialHealthScores,
  emergencyFundGoals
} from '../db/schema.js';
import notificationService from './notificationService.js';

/**
 * Gamification Service
 * Handles points, achievements, badges, streaks, and levels
 */

// Points configuration
const POINTS_CONFIG = {
  DAILY_LOGIN: 10,
  EXPENSE_LOGGED: 5,
  GOAL_CREATED: 25,
  GOAL_COMPLETED: 100,
  BUDGET_CREATED: 25,
  CHALLENGE_JOINED: 15,
  CHALLENGE_COMPLETED: 75,
  PROFILE_COMPLETE: 50,
  EMERGENCY_FUND_MILESTONE: 50,
  STREAK_BONUS: 25, // Bonus for maintaining streaks
};

// Level calculation: each level requires more points
const calculateLevelFromPoints = (totalPoints) => {
  // Level formula: level = floor(sqrt(points / 100)) + 1
  // Level 1: 0-99, Level 2: 100-399, Level 3: 400-899, etc.
  return Math.floor(Math.sqrt(totalPoints / 100)) + 1;
};

const calculatePointsForNextLevel = (currentLevel) => {
  // Points needed for next level: (level^2 - (level-1)^2) * 100
  const currentLevelPoints = Math.pow(currentLevel - 1, 2) * 100;
  const nextLevelPoints = Math.pow(currentLevel, 2) * 100;
  return nextLevelPoints - currentLevelPoints;
};

/**
 * Initialize user gamification data
 * @param {string} userId - User ID
 */
export const initializeUserGamification = async (userId) => {
  try {
    // Check if user already has gamification data
    const [existingPoints] = await db
      .select()
      .from(userPoints)
      .where(eq(userPoints.userId, userId));

    if (existingPoints) {
      return existingPoints;
    }

    // Create new user points record
    const [newPoints] = await db
      .insert(userPoints)
      .values({
        userId,
        totalPoints: 0,
        lifetimePoints: 0,
        currentLevel: 1,
        totalBadges: 0,
        currentStreak: 0,
        longestStreak: 0,
        weeklyPoints: 0,
        monthlyPoints: 0,
        pointsToNextLevel: calculatePointsForNextLevel(1),
        levelProgress: 0
      })
      .returning();

    // Initialize default streaks
    const streakTypes = ['daily_login', 'budget_adherence', 'savings_contribution', 'expense_log'];
    for (const streakType of streakTypes) {
      await db
        .insert(userStreaks)
        .values({
          userId,
          streakType,
          currentCount: 0,
          longestCount: 0,
          isActive: true
        })
        .onConflictDoNothing();
    }

    return newPoints;
  } catch (error) {
    console.error('Error initializing user gamification:', error);
    throw error;
  }
};

/**
 * Add points to user
 * @param {string} userId - User ID
 * @param {number} points - Points to add
 * @param {string} actionType - Type of action that earned points
 * @param {string} description - Description of the action
 * @param {string} referenceId - Optional reference to related entity
 */
export const addPoints = async (userId, points, actionType, description, referenceId = null) => {
  try {
    // Ensure user has gamification data
    await initializeUserGamification(userId);

    // Get current user points
    const [currentPoints] = await db
      .select()
      .from(userPoints)
      .where(eq(userPoints.userId, userId));

    if (!currentPoints) {
      throw new Error('User points record not found');
    }

    // Calculate new level
    const newLifetimePoints = currentPoints.lifetimePoints + points;
    const newTotalPoints = currentPoints.totalPoints + points;
    const newLevel = calculateLevelFromPoints(newLifetimePoints);
    const leveledUp = newLevel > currentPoints.currentLevel;

    // Calculate points to next level
    const pointsForNextLevel = calculatePointsForNextLevel(newLevel);
    const levelStartPoints = Math.pow(newLevel - 1, 2) * 100;
    const levelProgress = newLifetimePoints - levelStartPoints;

    // Update user points
    const [updatedPoints] = await db
      .update(userPoints)
      .set({
        totalPoints: newTotalPoints,
        lifetimePoints: newLifetimePoints,
        currentLevel: newLevel,
        weeklyPoints: currentPoints.weeklyPoints + points,
        monthlyPoints: currentPoints.monthlyPoints + points,
        pointsToNextLevel: pointsForNextLevel,
        levelProgress: Math.min(levelProgress, pointsForNextLevel),
        lastActivityDate: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userPoints.userId, userId))
      .returning();

    // Record points history
    await db
      .insert(pointsHistory)
      .values({
        userId,
        points,
        actionType,
        description,
        referenceId
      });

    // Send level up notification
    if (leveledUp) {
      await notificationService.sendNotification(userId, {
        title: '🎉 Level Up!',
        message: `Congratulations! You've reached Level ${newLevel}!`,
        type: 'success'
      });
    }

    return {
      points: updatedPoints,
      leveledUp,
      newLevel
    };
  } catch (error) {
    console.error('Error adding points:', error);
    throw error;
  }
};

/**
 * Award achievement to user
 * @param {string} userId - User ID
 * @param {string} achievementCode - Achievement code
 */
export const awardAchievement = async (userId, achievementCode) => {
  try {
    // Get achievement definition
    const [achievementDef] = await db
      .select()
      .from(achievementDefinitions)
      .where(and(
        eq(achievementDefinitions.code, achievementCode),
        eq(achievementDefinitions.isActive, true)
      ));

    if (!achievementDef) {
      throw new Error(`Achievement not found: ${achievementCode}`);
    }

    // Check if user already has this achievement
    const [existingAchievement] = await db
      .select()
      .from(userAchievements)
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.achievementId, achievementDef.id)
      ));

    if (existingAchievement?.isCompleted) {
      return { alreadyEarned: true, achievement: existingAchievement };
    }

    // Create or update user achievement
    let userAchievement;
    if (existingAchievement) {
      [userAchievement] = await db
        .update(userAchievements)
        .set({
          isCompleted: true,
          progress: achievementDef.rewardPoints,
          completedAt: new Date(),
          earnedAt: new Date()
        })
        .where(eq(userAchievements.id, existingAchievement.id))
        .returning();
    } else {
      [userAchievement] = await db
        .insert(userAchievements)
        .values({
          userId,
          achievementId: achievementDef.id,
          isCompleted: true,
          progress: achievementDef.rewardPoints,
          completedAt: new Date(),
          earnedAt: new Date()
        })
        .returning();
    }

    // Update user badges count
    await db
      .update(userPoints)
      .set({
        totalBadges: sql`${userPoints.totalBadges} + 1`,
        updatedAt: new Date()
      })
      .where(eq(userPoints.userId, userId));

    // Award points for achievement
    if (achievementDef.rewardPoints > 0) {
      await addPoints(
        userId,
        achievementDef.rewardPoints,
        'achievement_earned',
        `Earned achievement: ${achievementDef.name}`,
        achievementDef.id
      );
    }

    // Send notification
    await notificationService.sendNotification(userId, {
      title: '🏆 Achievement Unlocked!',
      message: `You've earned: ${achievementDef.name}`,
      type: 'success'
    });

    return {
      alreadyEarned: false,
      achievement: {
        ...userAchievement,
        definition: achievementDef
      }
    };
  } catch (error) {
    console.error('Error awarding achievement:', error);
    throw error;
  }
};

/**
 * Update streak for user
 * @param {string} userId - User ID
 * @param {string} streakType - Type of streak
 */
export const updateStreak = async (userId, streakType) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get current streak
    const [streak] = await db
      .select()
      .from(userStreaks)
      .where(and(
        eq(userStreaks.userId, userId),
        eq(userStreaks.streakType, streakType)
      ));

    if (!streak) {
      // Create new streak
      await db
        .insert(userStreaks)
        .values({
          userId,
          streakType,
          currentCount: 1,
          longestCount: 1,
          startDate: today,
          lastActivityDate: today,
          isActive: true
        });

      await addPoints(userId, POINTS_CONFIG.STREAK_BONUS, 'streak_started', `Started ${streakType} streak`);
      return { currentStreak: 1, isNewStreak: true };
    }

    const lastActivity = new Date(streak.lastActivityDate);
    lastActivity.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));

    let newCount = streak.currentCount;
    let isNewStreak = false;

    if (daysDiff === 0) {
      // Same day, no change
      return { currentStreak: newCount, isNewStreak: false };
    } else if (daysDiff === 1) {
      // Consecutive day, increment streak
      newCount = streak.currentCount + 1;
      isNewStreak = newCount === 1;
    } else {
      // Streak broken, reset
      newCount = 1;
      isNewStreak = true;
    }

    const newLongest = Math.max(streak.longestCount, newCount);

    // Update streak
    await db
      .update(userStreaks)
      .set({
        currentCount: newCount,
        longestCount: newLongest,
        lastActivityDate: today,
        updatedAt: new Date()
      })
      .where(eq(userStreaks.id, streak.id));

    // Update main user streak
    await db
      .update(userPoints)
      .set({
        currentStreak: newCount,
        longestStreak: newLongest,
        updatedAt: new Date()
      })
      .where(eq(userPoints.userId, userId));

    // Award streak bonus points
    if (isNewStreak && newCount > 1) {
      await addPoints(
        userId,
        POINTS_CONFIG.STREAK_BONUS,
        'streak_continued',
        `${streakType} streak: ${newCount} days!`
      );
    }

    return { currentStreak: newCount, isNewStreak };
  } catch (error) {
    console.error('Error updating streak:', error);
    throw error;
  }
};

/**
 * Get user achievements
 * @param {string} userId - User ID
 */
export const getUserAchievements = async (userId) => {
  try {
    const achievements = await db
      .select({
        id: userAchievements.id,
        progress: userAchievements.progress,
        isCompleted: userAchievements.isCompleted,
        earnedAt: userAchievements.earnedAt,
        completedAt: userAchievements.completedAt,
        achievementId: achievementDefinitions.id,
        code: achievementDefinitions.code,
        name: achievementDefinitions.name,
        description: achievementDefinitions.description,
        category: achievementDefinitions.category,
        icon: achievementDefinitions.icon,
        tier: achievementDefinitions.tier,
        rewardPoints: achievementDefinitions.rewardPoints
      })
      .from(userAchievements)
      .leftJoin(achievementDefinitions, eq(userAchievements.achievementId, achievementDefinitions.id))
      .where(eq(userAchievements.userId, userId))
      .orderBy(desc(userAchievements.earnedAt));

    return achievements;
  } catch (error) {
    console.error('Error getting user achievements:', error);
    throw error;
  }
};

/**
 * Get available achievements (not yet earned)
 * @param {string} userId - User ID
 */
export const getAvailableAchievements = async (userId) => {
  try {
    const earnedAchievements = await db
      .select({ achievementId: userAchievements.achievementId })
      .from(userAchievements)
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.isCompleted, true)
      ));

    const earnedIds = earnedAchievements.map(a => a.achievementId);

    const available = await db
      .select()
      .from(achievementDefinitions)
      .where(and(
        eq(achievementDefinitions.isActive, true),
        earnedIds.length > 0 ? sql`${achievementDefinitions.id} NOT IN (${earnedIds})` : undefined
      ))
      .orderBy(achievementDefinitions.displayOrder);

    return available;
  } catch (error) {
    console.error('Error getting available achievements:', error);
    throw error;
  }
};

/**
 * Get user progress (points, level, streaks)
 * @param {string} userId - User ID
 */
export const getUserProgress = async (userId) => {
  try {
    // Ensure gamification is initialized
    await initializeUserGamification(userId);

    const [points] = await db
      .select()
      .from(userPoints)
      .where(eq(userPoints.userId, userId));

    if (!points) {
      return null;
    }

    // Get active streaks
    const streaks = await db
      .select()
      .from(userStreaks)
      .where(and(
        eq(userStreaks.userId, userId),
        eq(userStreaks.isActive, true)
      ));

    // Get recent points history
    const recentHistory = await db
      .select()
      .from(pointsHistory)
      .where(eq(pointsHistory.userId, userId))
      .orderBy(desc(pointsHistory.createdAt))
      .limit(10);

    return {
      points: points.totalPoints,
      lifetimePoints: points.lifetimePoints,
      level: points.currentLevel,
      levelProgress: points.levelProgress,
      pointsToNextLevel: points.pointsToNextLevel,
      badges: points.totalBadges,
      currentStreak: points.currentStreak,
      longestStreak: points.longestStreak,
      weeklyPoints: points.weeklyPoints,
      monthlyPoints: points.monthlyPoints,
      streaks: streaks.map(s => ({
        type: s.streakType,
        current: s.currentCount,
        longest: s.longestCount
      })),
      recentHistory
    };
  } catch (error) {
    console.error('Error getting user progress:', error);
    throw error;
  }
};

/**
 * Get user statistics
 * @param {string} userId - User ID
 */
export const getUserStats = async (userId) => {
  try {
    // Get total achievements
    const [totalAchievements] = await db
      .select({ count: sql<number>`count(*)` })
      .from(achievementDefinitions)
      .where(eq(achievementDefinitions.isActive, true));

    // Get earned achievements
    const [earnedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userAchievements)
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.isCompleted, true)
      ));

    // Get total points earned
    const [lifetimePoints] = await db
      .select({ total: sql<number>`COALESCE(SUM(${pointsHistory.points}), 0)` })
      .from(pointsHistory)
      .where(eq(pointsHistory.userId, userId));

    // Get points by category
    const pointsByAction = await db
      .select({
        actionType: pointsHistory.actionType,
        total: sql<number>`SUM(${pointsHistory.points})`
      })
      .from(pointsHistory)
      .where(eq(pointsHistory.userId, userId))
      .groupBy(pointsHistory.actionType);

    // Get achievements by tier
    const achievementsByTier = await db
      .select({
        tier: achievementDefinitions.tier,
        count: sql<number>`count(*)`
      })
      .from(userAchievements)
      .leftJoin(achievementDefinitions, eq(userAchievements.achievementId, achievementDefinitions.id))
      .where(and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.isCompleted, true)
      ))
      .groupBy(achievementDefinitions.tier);

    return {
      totalAchievements: totalAchievements?.count || 0,
      earnedAchievements: earnedCount?.count || 0,
      lifetimePoints: lifetimePoints?.total || 0,
      pointsByAction,
      achievementsByTier,
      completionPercentage: totalAchievements?.count > 0 
        ? ((earnedCount?.count || 0) / totalAchievements.count) * 100 
        : 0
    };
  } catch (error) {
    console.error('Error getting user stats:', error);
    throw error;
  }
};

/**
 * Check all achievements for a user
 * @param {string} userId - User ID
 */
export const checkAllAchievements = async (userId) => {
  try {
    const results = [];

    // Get user data for checking
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error('User not found');

    // Get expense count
    const [expenseCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(expenses)
      .where(eq(expenses.userId, userId));

    // Get goals
    const userGoals = await db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId));

    const completedGoals = userGoals.filter(g => g.status === 'completed').length;
    const activeGoals = userGoals.filter(g => g.status === 'active').length;

    // Get challenges
    const [joinedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(challengeParticipants)
      .where(eq(challengeParticipants.userId, userId));

    const [completedChallenges] = await db
      .select({ count: sql<number>`count(*)` })
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'completed')
      ));

    // Get financial health score
    const [healthScore] = await db
      .select()
      .from(financialHealthScores)
      .where(eq(financialHealthScores.userId, userId))
      .orderBy(desc(financialHealthScores.calculatedAt))
      .limit(1);

    // Get emergency fund
    const [emergencyFund] = await db
      .select()
      .from(emergencyFundGoals)
      .where(eq(emergencyFundGoals.userId, userId));

    // Get user points for level checking
    await initializeUserGamification(userId);
    const [userPointsData] = await db
      .select()
      .from(userPoints)
      .where(eq(userPoints.userId, userId));

    // Check each achievement
    const achievements = await db
      .select()
      .from(achievementDefinitions)
      .where(eq(achievementDefinitions.isActive, true));

    for (const achievement of achievements) {
      let shouldAward = false;
      const criteria = achievement.criteria;

      switch (criteria.type) {
        case 'action_count':
          if (criteria.metric === 'expenses_logged' && expenseCount?.count >= criteria.value) {
            shouldAward = true;
          } else if (criteria.metric === 'challenges_joined' && joinedCount?.count >= criteria.value) {
            shouldAward = true;
          } else if (criteria.metric === 'challenges_completed' && completedChallenges?.count >= criteria.value) {
            shouldAward = true;
          }
          break;

        case 'milestone':
          if (criteria.metric === 'goal_created' && activeGoals > 0) {
            shouldAward = true;
          } else if (criteria.metric === 'goals_completed' && completedGoals >= criteria.value) {
            shouldAward = true;
          } else if (criteria.metric === 'total_savings') {
            const totalSavings = userGoals
              .filter(g => g.type === 'savings')
              .reduce((sum, g) => sum + parseFloat(g.currentAmount || 0), 0);
            if (totalSavings >= criteria.value) shouldAward = true;
          } else if (criteria.metric === 'emergency_fund_months' && emergencyFund) {
            if (emergencyFund.currentSavings >= emergencyFund.targetAmount * criteria.value) {
              shouldAward = true;
            }
          }
          break;

        case 'score':
          if (criteria.metric === 'financial_health_score' && healthScore) {
            if (healthScore.overallScore >= criteria.value) shouldAward = true;
          }
          break;

        case 'level':
          if (userPointsData && userPointsData.currentLevel >= criteria.value) {
            shouldAward = true;
          }
          break;

        case 'streak':
          const streak = await db
            .select()
            .from(userStreaks)
            .where(and(
              eq(userStreaks.userId, userId),
              eq(userStreaks.streakType, criteria.metric)
            ));
          if (streak[0]?.currentCount >= criteria.value) {
            shouldAward = true;
          }
          break;
      }

      if (shouldAward) {
        const result = await awardAchievement(userId, achievement.code);
        if (!result.alreadyEarned) {
          results.push(achievement);
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error checking achievements:', error);
    throw error;
  }
};

/**
 * Record daily login
 * @param {string} userId - User ID
 */
export const recordDailyLogin = async (userId) => {
  try {
    // Update streak
    await updateStreak(userId, 'daily_login');

    // Add daily login points
    const result = await addPoints(
      userId,
      POINTS_CONFIG.DAILY_LOGIN,
      'daily_login',
      'Daily login bonus'
    );

    return result;
  } catch (error) {
    console.error('Error recording daily login:', error);
    throw error;
  }
};

/**
 * Record expense logged
 * @param {string} userId - User ID
 */
export const recordExpenseLogged = async (userId) => {
  try {
    // Update streak
    await updateStreak(userId, 'expense_log');

    // Add expense logged points
    const result = await addPoints(
      userId,
      POINTS_CONFIG.EXPENSE_LOGGED,
      'expense_logged',
      'Expense logged'
    );

    // Check achievements
    await checkAllAchievements(userId);

    return result;
  } catch (error) {
    console.error('Error recording expense logged:', error);
    throw error;
  }
};

/**
 * Record goal created
 * @param {string} userId - User ID
 * @param {string} goalId - Goal ID
 */
export const recordGoalCreated = async (userId, goalId) => {
  try {
    const result = await addPoints(
      userId,
      POINTS_CONFIG.GOAL_CREATED,
      'goal_created',
      'Goal created',
      goalId
    );

    // Check achievements
    await checkAllAchievements(userId);

    return result;
  } catch (error) {
    console.error('Error recording goal created:', error);
    throw error;
  }
};

/**
 * Record goal completed
 * @param {string} userId - User ID
 * @param {string} goalId - Goal ID
 */
export const recordGoalCompleted = async (userId, goalId) => {
  try {
    // Update streak
    await updateStreak(userId, 'savings_contribution');

    const result = await addPoints(
      userId,
      POINTS_CONFIG.GOAL_COMPLETED,
      'goal_completed',
      'Goal completed!',
      goalId
    );

    // Check achievements
    await checkAllAchievements(userId);

    return result;
  } catch (error) {
    console.error('Error recording goal completed:', error);
    throw error;
  }
};

/**
 * Record challenge joined
 * @param {string} userId - User ID
 * @param {string} challengeId - Challenge ID
 */
export const recordChallengeJoined = async (userId, challengeId) => {
  try {
    const result = await addPoints(
      userId,
      POINTS_CONFIG.CHALLENGE_JOINED,
      'challenge_joined',
      'Joined a challenge',
      challengeId
    );

    // Check achievements
    await checkAllAchievements(userId);

    return result;
  } catch (error) {
    console.error('Error recording challenge joined:', error);
    throw error;
  }
};

/**
 * Record challenge completed
 * @param {string} userId - User ID
 * @param {string} challengeId - Challenge ID
 */
export const recordChallengeCompleted = async (userId, challengeId) => {
  try {
    const result = await addPoints(
      userId,
      POINTS_CONFIG.CHALLENGE_COMPLETED,
      'challenge_completed',
      'Challenge completed!',
      challengeId
    );

    // Check achievements
    await checkAllAchievements(userId);

    return result;
  } catch (error) {
    console.error('Error recording challenge completed:', error);
    throw error;
  }
};

/**
 * Record budget created
 * @param {string} userId - User ID
 */
export const recordBudgetCreated = async (userId) => {
  try {
    const result = await addPoints(
      userId,
      POINTS_CONFIG.BUDGET_CREATED,
      'budget_created',
      'Budget created'
    );

    // Check achievements
    await checkAllAchievements(userId);

    return result;
  } catch (error) {
    console.error('Error recording budget created:', error);
    throw error;
  }
};

/**
 * Get gamification dashboard data
 * @param {string} userId - User ID
 */
export const getGamificationDashboard = async (userId) => {
  try {
    // Initialize if needed
    await initializeUserGamification(userId);

    // Get all data in parallel
    const [progress, achievements, stats, available] = await Promise.all([
      getUserProgress(userId),
      getUserAchievements(userId),
      getUserStats(userId),
      getAvailableAchievements(userId)
    ]);

    // Get financial health score
    const [healthScore] = await db
      .select()
      .from(financialHealthScores)
      .where(eq(financialHealthScores.userId, userId))
      .orderBy(desc(financialHealthScores.calculatedAt))
      .limit(1);

    return {
      progress,
      achievements: achievements.slice(0, 6), // Recent achievements
      availableAchievements: available.slice(0, 4), // Available to earn
      stats,
      healthScore: healthScore ? {
        score: healthScore.overallScore,
        rating: healthScore.rating
      } : null
    };
  } catch (error) {
    console.error('Error getting gamification dashboard:', error);
    throw error;
  }
};

export default {
  initializeUserGamification,
  addPoints,
  awardAchievement,
  updateStreak,
  getUserAchievements,
  getAvailableAchievements,
  getUserProgress,
  getUserStats,
  checkAllAchievements,
  recordDailyLogin,
  recordExpenseLogged,
  recordGoalCreated,
  recordGoalCompleted,
  recordChallengeJoined,
  recordChallengeCompleted,
  recordBudgetCreated,
  getGamificationDashboard
};
