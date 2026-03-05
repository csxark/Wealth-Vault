import { eq, and, desc, gte, lte, or, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { 
  challenges, 
  challengeParticipants, 
  users, 
  expenses, 
  categories,
  challengeComments,
  challengeLikes,
  challengeActivity,
  challengeTemplates,
  userChallengeStats,
  challengeInvitations,
  userPoints,
  goals
} from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';
import notificationService from './notificationService.js';

/**
 * Create a new challenge
 * @param {Object} challengeData - Challenge data
 * @returns {Promise<Object>} - Created challenge
 */
export const createChallenge = async (challengeData) => {
  try {
    const {
      creatorId,
      title,
      description,
      targetType,
      targetAmount,
      targetCategoryId,
      currency = 'USD',
      startDate = new Date(),
      endDate,
      isPublic = true,
      maxParticipants,
      rules = {},
      tags = [],
      difficulty = 'medium',
      category = 'savings'
    } = challengeData;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end <= start) {
      throw new Error('End date must be after start date');
    }

    if (end <= new Date()) {
      throw new Error('End date must be in the future');
    }

    // Validate target type and category
    if (targetType === 'reduce_expense' && !targetCategoryId) {
      throw new Error('Target category is required for expense reduction challenges');
    }

    const [challenge] = await db
      .insert(challenges)
      .values({
        creatorId,
        title,
        description,
        targetType,
        targetAmount: targetAmount.toString(),
        targetCategoryId,
        currency,
        startDate: start,
        endDate: end,
        isPublic,
        maxParticipants,
        status: 'active',
        rules,
        metadata: {
          tags,
          difficulty,
          category
        }
      })
      .returning();

    // Log audit event
    await logAuditEventAsync({
      userId: creatorId,
      action: AuditActions.CREATE,
      resourceType: ResourceTypes.CHALLENGE,
      resourceId: challenge.id,
      metadata: {
        title: challenge.title,
        targetType: challenge.targetType,
        targetAmount: challenge.targetAmount
      },
      status: 'success'
    });

    return challenge;
  } catch (error) {
    console.error('Error creating challenge:', error);
    throw error;
  }
};

/**
 * Get public challenges with optional filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} - Array of challenges
 */
export const getPublicChallenges = async (filters = {}) => {
  try {
    const { category, difficulty, limit = 20, offset = 0 } = filters;

    let whereConditions = [
      eq(challenges.isPublic, true),
      eq(challenges.status, 'active'),
      gte(challenges.endDate, new Date())
    ];

    if (category) {
      whereConditions.push(sql`${challenges.metadata}->>'category' = ${category}`);
    }

    if (difficulty) {
      whereConditions.push(sql`${challenges.metadata}->>'difficulty' = ${difficulty}`);
    }

    const challengesList = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        description: challenges.description,
        targetType: challenges.targetType,
        targetAmount: challenges.targetAmount,
        currency: challenges.currency,
        startDate: challenges.startDate,
        endDate: challenges.endDate,
        maxParticipants: challenges.maxParticipants,
        metadata: challenges.metadata,
        createdAt: challenges.createdAt,
        creator: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName
        },
        participantCount: sql<number>`count(${challengeParticipants.id})`
      })
      .from(challenges)
      .leftJoin(users, eq(challenges.creatorId, users.id))
      .leftJoin(challengeParticipants, eq(challenges.id, challengeParticipants.challengeId))
      .where(and(...whereConditions))
      .groupBy(challenges.id, users.id)
      .orderBy(desc(challenges.createdAt))
      .limit(limit)
      .offset(offset);

    return challengesList;
  } catch (error) {
    console.error('Error fetching public challenges:', error);
    throw error;
  }
};

/**
 * Get user's active challenges
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of user's challenges
 */
export const getUserChallenges = async (userId) => {
  try {
    const userChallenges = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        description: challenges.description,
        targetType: challenges.targetType,
        targetAmount: challenges.targetAmount,
        currency: challenges.currency,
        startDate: challenges.startDate,
        endDate: challenges.endDate,
        status: challenges.status,
        metadata: challenges.metadata,
        participation: {
          id: challengeParticipants.id,
          currentProgress: challengeParticipants.currentProgress,
          targetProgress: challengeParticipants.targetProgress,
          status: challengeParticipants.status,
          joinedAt: challengeParticipants.joinedAt
        }
      })
      .from(challengeParticipants)
      .innerJoin(challenges, eq(challengeParticipants.challengeId, challenges.id))
      .where(and(
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'active'),
        eq(challenges.status, 'active'),
        gte(challenges.endDate, new Date())
      ))
      .orderBy(desc(challenges.createdAt));

    return userChallenges;
  } catch (error) {
    console.error('Error fetching user challenges:', error);
    throw error;
  }
};

/**
 * Join a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @param {number} targetProgress - User's target progress
 * @returns {Promise<Object>} - Challenge participation record
 */
export const joinChallenge = async (challengeId, userId, targetProgress) => {
  try {
    // Check if challenge exists and is active
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(and(
        eq(challenges.id, challengeId),
        eq(challenges.status, 'active'),
        gte(challenges.endDate, new Date())
      ));

    if (!challenge) {
      throw new Error('Challenge not found or not active');
    }

    // Check if user is already participating
    const [existingParticipation] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.userId, userId)
      ));

    if (existingParticipation) {
      throw new Error('Already participating in this challenge');
    }

    // Check participant limit
    if (challenge.maxParticipants) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(challengeParticipants)
        .where(eq(challengeParticipants.challengeId, challengeId));

      if (count >= challenge.maxParticipants) {
        throw new Error('Challenge is full');
      }
    }

    // Create participation record
    const [participant] = await db
      .insert(challengeParticipants)
      .values({
        challengeId,
        userId,
        currentProgress: '0',
        targetProgress: targetProgress.toString(),
        status: 'active'
      })
      .returning();

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.JOIN,
      resourceType: ResourceTypes.CHALLENGE,
      resourceId: challengeId,
      metadata: {
        targetProgress,
        challengeTitle: challenge.title
      },
      status: 'success'
    });

    // Send notification
    await notificationService.sendNotification(userId, {
      title: 'Challenge Joined!',
      message: `You've successfully joined the challenge: ${challenge.title}`,
      type: 'info'
    });

    return participant;
  } catch (error) {
    console.error('Error joining challenge:', error);
    throw error;
  }
};

/**
 * Update progress for a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @param {number} progressAmount - Amount to add to progress
 * @returns {Promise<Object>} - Updated participation record
 */
export const updateProgress = async (challengeId, userId, progressAmount) => {
  try {
    // Get current participation
    const [participant] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'active')
      ));

    if (!participant) {
      throw new Error('Challenge participation not found');
    }

    const currentProgress = parseFloat(participant.currentProgress);
    const newProgress = currentProgress + progressAmount;

    // Update progress
    const [updatedParticipant] = await db
      .update(challengeParticipants)
      .set({
        currentProgress: newProgress.toString(),
        lastUpdated: new Date(),
        updatedAt: new Date()
      })
      .where(eq(challengeParticipants.id, participant.id))
      .returning();

    // Check if challenge is completed
    const targetProgress = parseFloat(participant.targetProgress);
    if (newProgress >= targetProgress) {
      await db
        .update(challengeParticipants)
        .set({
          status: 'completed',
          updatedAt: new Date()
        })
        .where(eq(challengeParticipants.id, participant.id));

      // Send completion notification
      const [challenge] = await db
        .select({ title: challenges.title })
        .from(challenges)
        .where(eq(challenges.id, challengeId));

      await notificationService.sendNotification(userId, {
        title: 'Challenge Completed! 🎉',
        message: `Congratulations! You've completed the challenge: ${challenge.title}`,
        type: 'success'
      });
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.UPDATE,
      resourceType: ResourceTypes.CHALLENGE,
      resourceId: challengeId,
      metadata: {
        progressAmount,
        newProgress,
        completed: newProgress >= targetProgress
      },
      status: 'success'
    });

    return updatedParticipant;
  } catch (error) {
    console.error('Error updating progress:', error);
    throw error;
  }
};

/**
 * Get challenge leaderboard
 * @param {string} challengeId - Challenge ID
 * @returns {Promise<Array>} - Leaderboard data
 */
export const getChallengeLeaderboard = async (challengeId) => {
  try {
    const leaderboard = await db
      .select({
        userId: challengeParticipants.userId,
        currentProgress: challengeParticipants.currentProgress,
        targetProgress: challengeParticipants.targetProgress,
        status: challengeParticipants.status,
        joinedAt: challengeParticipants.joinedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profilePicture: users.profilePicture
        }
      })
      .from(challengeParticipants)
      .innerJoin(users, eq(challengeParticipants.userId, users.id))
      .where(eq(challengeParticipants.challengeId, challengeId))
      .orderBy(desc(sql`CAST(${challengeParticipants.currentProgress} AS DECIMAL)`));

    return leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      progressPercentage: (parseFloat(entry.currentProgress) / parseFloat(entry.targetProgress)) * 100
    }));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw error;
  }
};

/**
 * Calculate automatic progress for challenges based on user activity
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date for calculation
 * @param {Date} endDate - End date for calculation
 * @returns {Promise<void>}
 */
export const calculateAutomaticProgress = async (userId, startDate, endDate) => {
  try {
    // Get user's active challenge participations
    const participations = await db
      .select({
        id: challengeParticipants.id,
        challengeId: challengeParticipants.challengeId,
        currentProgress: challengeParticipants.currentProgress,
        challenge: {
          targetType: challenges.targetType,
          targetCategoryId: challenges.targetCategoryId
        }
      })
      .from(challengeParticipants)
      .innerJoin(challenges, eq(challengeParticipants.challengeId, challenges.id))
      .where(and(
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'active'),
        eq(challenges.status, 'active')
      ));

    for (const participation of participations) {
      let progressAmount = 0;

      if (participation.challenge.targetType === 'save_amount') {
        // Calculate savings from goals or round-ups
        const savings = await calculateSavingsProgress(userId, startDate, endDate);
        progressAmount = savings;
      } else if (participation.challenge.targetType === 'reduce_expense') {
        // Calculate expense reduction in specific category
        const reduction = await calculateExpenseReductionProgress(
          userId,
          participation.challenge.targetCategoryId,
          startDate,
          endDate
        );
        progressAmount = reduction;
      } else if (participation.challenge.targetType === 'increase_income') {
        // This would require income tracking - placeholder for now
        progressAmount = 0;
      }

      if (progressAmount > 0) {
        await updateProgress(participation.challengeId, userId, progressAmount);
      }
    }
  } catch (error) {
    console.error('Error calculating automatic progress:', error);
    throw error;
  }
};

/**
 * Calculate savings progress from goals and round-ups
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<number>} - Savings amount
 */
const calculateSavingsProgress = async (userId, startDate, endDate) => {
  try {
    // This is a simplified calculation - in reality, you'd track actual savings contributions
    // For now, we'll use goal progress as a proxy
    const goals = await db
      .select({
        currentAmount: goals.currentAmount,
        startDate: goals.startDate
      })
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.type, 'savings'),
        gte(goals.startDate, startDate),
        lte(goals.startDate, endDate)
      ));

    return goals.reduce((total, goal) => total + parseFloat(goal.currentAmount), 0);
  } catch (error) {
    console.error('Error calculating savings progress:', error);
    return 0;
  }
};

/**
 * Calculate expense reduction progress
 * @param {string} userId - User ID
 * @param {string} categoryId - Category ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<number>} - Reduction amount
 */
const calculateExpenseReductionProgress = async (userId, categoryId, startDate, endDate) => {
  try {
    // Calculate total expenses in the category for the period
    // This is a simplified version - you'd need to establish a baseline period
    const [{ total }] = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      })
      .from(expenses)
      .where(and(
        eq(expenses.userId, userId),
        eq(expenses.categoryId, categoryId),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate)
      ));

    // For reduction challenges, we need a baseline - this is simplified
    // In a real implementation, you'd compare to a previous period
    return Math.max(0, 1000 - total); // Assuming $1000 baseline
  } catch (error) {
    console.error('Error calculating expense reduction progress:', error);
    return 0;
  }
};

/**
 * Get global leaderboard across all users
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} - Global leaderboard
 */
export const getGlobalLeaderboard = async (filters = {}) => {
  try {
    const { limit = 50, timeframe = 'all' } = filters;
    
    let dateFilter = new Date(0); // Default to all time
    if (timeframe === 'weekly') {
      dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'monthly') {
      dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get user stats with their gamification points
    const leaderboard = await db
      .select({
        userId: userPoints.userId,
        totalPoints: userPoints.totalPoints,
        currentLevel: userPoints.currentLevel,
        totalChallengesCompleted: userChallengeStats.totalChallengesCompleted,
        totalWins: userChallengeStats.totalWins,
        currentStreak: userChallengeStats.currentStreak,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profilePicture: users.profilePicture
        }
      })
      .from(userPoints)
      .leftJoin(userChallengeStats, eq(userPoints.userId, userChallengeStats.userId))
      .innerJoin(users, eq(userPoints.userId, users.id))
      .orderBy(desc(userPoints.totalPoints))
      .limit(limit);

    return leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    throw error;
  }
};

/**
 * Get challenge categories
 * @returns {Promise<Array>} - List of challenge categories
 */
export const getChallengeCategories = async () => {
  try {
    return [
      { id: 'savings', name: 'Savings', icon: '💰', description: 'Save money for goals' },
      { id: 'budgeting', name: 'Budgeting', icon: '📊', description: 'Manage your budget' },
      { id: 'debt_payoff', name: 'Debt Payoff', icon: '💳', description: 'Pay off debt faster' },
      { id: 'emergency_fund', name: 'Emergency Fund', icon: '🛡️', description: 'Build emergency savings' },
      { id: 'investment', name: 'Investment', icon: '📈', description: 'Grow your investments' },
      { id: 'spending', name: 'Spending', icon: '🛒', description: 'Reduce unnecessary spending' }
    ];
  } catch (error) {
    console.error('Error fetching challenge categories:', error);
    throw error;
  }
};

/**
 * Get challenge templates
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} - List of challenge templates
 */
export const getChallengeTemplates = async (filters = {}) => {
  try {
    const { category, difficulty } = filters;
    
    let whereConditions = [eq(challengeTemplates.isActive, true)];
    
    if (category) {
      whereConditions.push(eq(challengeTemplates.category, category));
    }
    if (difficulty) {
      whereConditions.push(eq(challengeTemplates.difficulty, difficulty));
    }

    const templates = await db
      .select()
      .from(challengeTemplates)
      .where(and(...whereConditions))
      .orderBy(challengeTemplates.category);

    return templates;
  } catch (error) {
    console.error('Error fetching challenge templates:', error);
    throw error;
  }
};

/**
 * Get user's challenge statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - User's challenge stats
 */
export const getUserChallengeStats = async (userId) => {
  try {
    // Get or create user stats
    let [stats] = await db
      .select()
      .from(userChallengeStats)
      .where(eq(userChallengeStats.userId, userId));

    if (!stats) {
      [stats] = await db
        .insert(userChallengeStats)
        .values({ userId })
        .returning();
    }

    // Get gamification points
    const [points] = await db
      .select()
      .from(userPoints)
      .where(eq(userPoints.userId, userId));

    return {
      ...stats,
      totalPoints: points?.totalPoints || 0,
      level: points?.currentLevel || 1
    };
  } catch (error) {
    console.error('Error fetching user challenge stats:', error);
    throw error;
  }
};

/**
 * Get challenge comments
 * @param {string} challengeId - Challenge ID
 * @returns {Promise<Array>} - List of comments
 */
export const getChallengeComments = async (challengeId) => {
  try {
    const comments = await db
      .select({
        id: challengeComments.id,
        content: challengeComments.content,
        createdAt: challengeComments.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profilePicture: users.profilePicture
        }
      })
      .from(challengeComments)
      .innerJoin(users, eq(challengeComments.userId, users.id))
      .where(eq(challengeComments.challengeId, challengeId))
      .orderBy(desc(challengeComments.createdAt));

    return comments;
  } catch (error) {
    console.error('Error fetching challenge comments:', error);
    throw error;
  }
};

/**
 * Add a comment to a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @param {string} content - Comment content
 * @returns {Promise<Object>} - Created comment
 */
export const addChallengeComment = async (challengeId, userId, content) => {
  try {
    const [comment] = await db
      .insert(challengeComments)
      .values({
        challengeId,
        userId,
        content
      })
      .returning();

    // Log activity
    await db
      .insert(challengeActivity)
      .values({
        challengeId,
        userId,
        activityType: 'comment',
        metadata: { commentId: comment.id }
      });

    return comment;
  } catch (error) {
    console.error('Error adding challenge comment:', error);
    throw error;
  }
};

/**
 * Like a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Created like
 */
export const likeChallenge = async (challengeId, userId) => {
  try {
    const [like] = await db
      .insert(challengeLikes)
      .values({
        challengeId,
        userId
      })
      .onConflictDoNothing()
      .returning();

    if (!like) {
      throw new Error('Already liked');
    }

    // Log activity
    await db
      .insert(challengeActivity)
      .values({
        challengeId,
        userId,
        activityType: 'like'
      });

    return like;
  } catch (error) {
    if (error.message === 'Already liked') {
      throw error;
    }
    console.error('Error liking challenge:', error);
    throw error;
  }
};

/**
 * Unlike a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 */
export const unlikeChallenge = async (challengeId, userId) => {
  try {
    await db
      .delete(challengeLikes)
      .where(and(
        eq(challengeLikes.challengeId, challengeId),
        eq(challengeLikes.userId, userId)
      ));
  } catch (error) {
    console.error('Error unliking challenge:', error);
    throw error;
  }
};

/**
 * Get challenge like count and check if user liked
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Like info
 */
export const getChallengeLikes = async (challengeId, userId) => {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(challengeLikes)
      .where(eq(challengeLikes.challengeId, challengeId));

    const [userLike] = await db
      .select()
      .from(challengeLikes)
      .where(and(
        eq(challengeLikes.challengeId, challengeId),
        eq(challengeLikes.userId, userId)
      ));

    return {
      likeCount: count || 0,
      isLiked: !!userLike
    };
  } catch (error) {
    console.error('Error fetching challenge likes:', error);
    throw error;
  }
};

/**
 * Get challenge activity feed
 * @param {string} challengeId - Challenge ID
 * @returns {Promise<Array>} - List of activities
 */
export const getChallengeActivity = async (challengeId) => {
  try {
    const activities = await db
      .select({
        id: challengeActivity.id,
        activityType: challengeActivity.activityType,
        metadata: challengeActivity.metadata,
        createdAt: challengeActivity.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profilePicture: users.profilePicture
        }
      })
      .from(challengeActivity)
      .innerJoin(users, eq(challengeActivity.userId, users.id))
      .where(eq(challengeActivity.challengeId, challengeId))
      .orderBy(desc(challengeActivity.createdAt))
      .limit(50);

    return activities;
  } catch (error) {
    console.error('Error fetching challenge activity:', error);
    throw error;
  }
};

/**
 * Invite a user to a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} inviterId - Inviter user ID
 * @param {string} inviteeId - Invitee user ID
 * @returns {Promise<Object>} - Created invitation
 */
export const inviteToChallenge = async (challengeId, inviterId, inviteeId) => {
  try {
    // Check if challenge exists
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId));

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    // Check if already participating
    const [existingParticipant] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.userId, inviteeId)
      ));

    if (existingParticipant) {
      throw new Error('User is already participating in this challenge');
    }

    // Create invitation
    const [invitation] = await db
      .insert(challengeInvitations)
      .values({
        challengeId,
        inviterId,
        inviteeId,
        status: 'pending'
      })
      .onConflictDoNothing()
      .returning();

    if (!invitation) {
      throw new Error('Invitation already exists');
    }

    // Send notification
    const [invitee] = await db
      .select({ firstName: users.firstName })
      .from(users)
      .where(eq(users.id, inviteeId));

    await notificationService.sendNotification(inviteeId, {
      title: 'Challenge Invitation!',
      message: `You've been invited to join the challenge: ${challenge.title}`,
      type: 'info'
    });

    return invitation;
  } catch (error) {
    console.error('Error inviting to challenge:', error);
    throw error;
  }
};

/**
 * Respond to a challenge invitation
 * @param {string} invitationId - Invitation ID
 * @param {string} userId - User ID
 * @param {boolean} accept - Whether to accept the invitation
 * @returns {Promise<Object>} - Updated invitation
 */
export const respondToInvitation = async (invitationId, userId, accept) => {
  try {
    const [invitation] = await db
      .select()
      .from(challengeInvitations)
      .where(and(
        eq(challengeInvitations.id, invitationId),
        eq(challengeInvitations.inviteeId, userId),
        eq(challengeInvitations.status, 'pending')
      ));

    if (!invitation) {
      throw new Error('Invitation not found or already responded');
    }

    const [updatedInvitation] = await db
      .update(challengeInvitations)
      .set({
        status: accept ? 'accepted' : 'declined',
        respondedAt: new Date()
      })
      .where(eq(challengeInvitations.id, invitationId))
      .returning();

    if (accept) {
      // Auto-join the challenge
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, invitation.challengeId));

      await joinChallenge(invitation.challengeId, userId, parseFloat(challenge.targetAmount));
    }

    return updatedInvitation;
  } catch (error) {
    console.error('Error responding to invitation:', error);
    throw error;
  }
};

/**
 * Get user's challenge invitations
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - List of invitations
 */
export const getUserInvitations = async (userId) => {
  try {
    const invitations = await db
      .select({
        id: challengeInvitations.id,
        status: challengeInvitations.status,
        createdAt: challengeInvitations.createdAt,
        challenge: {
          id: challenges.id,
          title: challenges.title,
          description: challenges.description,
          targetType: challenges.targetType,
          targetAmount: challenges.targetAmount,
          endDate: challenges.endDate
        },
        inviter: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(challengeInvitations)
      .innerJoin(challenges, eq(challengeInvitations.challengeId, challenges.id))
      .innerJoin(users, eq(challengeInvitations.inviterId, users.id))
      .where(and(
        eq(challengeInvitations.inviteeId, userId),
        eq(challengeInvitations.status, 'pending')
      ))
      .orderBy(desc(challengeInvitations.createdAt));

    return invitations;
  } catch (error) {
    console.error('Error fetching user invitations:', error);
    throw error;
  }
};

/**
 * Create a challenge from a template
 * @param {string} templateId - Template ID
 * @param {string} creatorId - Creator user ID
 * @param {Object} overrides - Override values
 * @returns {Promise<Object>} - Created challenge
 */
export const createChallengeFromTemplate = async (templateId, creatorId, overrides = {}) => {
  try {
    const [template] = await db
      .select()
      .from(challengeTemplates)
      .where(and(
        eq(challengeTemplates.id, templateId),
        eq(challengeTemplates.isActive, true)
      ));

    if (!template) {
      throw new Error('Template not found');
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + template.defaultDurationDays);

    const challengeData = {
      creatorId,
      title: overrides.title || template.title,
      description: overrides.description || template.description,
      targetType: template.targetType,
      targetAmount: overrides.targetAmount || template.targetAmount,
      startDate: new Date(),
      endDate: overrides.endDate || endDate,
      difficulty: overrides.difficulty || template.difficulty,
      category: template.category,
      isPublic: overrides.isPublic !== undefined ? overrides.isPublic : true,
      maxParticipants: overrides.maxParticipants
    };

    return await createChallenge(challengeData);
  } catch (error) {
    console.error('Error creating challenge from template:', error);
    throw error;
  }
};

/**
 * Get recommended challenges for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - List of recommended challenges
 */
export const getRecommendedChallenges = async (userId) => {
  try {
    // Get user's active goals to recommend relevant challenges
    const userGoals = await db
      .select({
        type: goals.type,
        categoryId: goals.categoryId
      })
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.status, 'active')
      ));

    // Get recommended public challenges based on user's goals
    const recommended = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        description: challenges.description,
        targetType: challenges.targetType,
        targetAmount: challenges.targetAmount,
        currency: challenges.currency,
        endDate: challenges.endDate,
        metadata: challenges.metadata,
        participantCount: sql<number>`count(${challengeParticipants.id})`
      })
      .from(challenges)
      .leftJoin(challengeParticipants, eq(challenges.id, challengeParticipants.challengeId))
      .where(and(
        eq(challenges.isPublic, true),
        eq(challenges.status, 'active'),
        gte(challenges.endDate, new Date())
      ))
      .groupBy(challenges.id)
      .orderBy(desc(challengeParticipants.id))
      .limit(10);

    return recommended;
  } catch (error) {
    console.error('Error fetching recommended challenges:', error);
    throw error;
  }
};

export default {
  createChallenge,
  getPublicChallenges,
  getUserChallenges,
  joinChallenge,
  updateProgress,
  getChallengeLeaderboard,
  calculateAutomaticProgress,
  // New social features
  getGlobalLeaderboard,
  getChallengeCategories,
  getChallengeTemplates,
  getUserChallengeStats,
  getChallengeComments,
  addChallengeComment,
  likeChallenge,
  unlikeChallenge,
  getChallengeLikes,
  getChallengeActivity,
  inviteToChallenge,
  respondToInvitation,
  getUserInvitations,
  createChallengeFromTemplate,
  getRecommendedChallenges
};
