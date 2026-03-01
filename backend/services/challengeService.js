import { eq, and, desc, gte, lte, or, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { challenges, challengeParticipants, users, expenses, categories } from '../db/schema.js';
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

export default {
  createChallenge,
  getPublicChallenges,
  getUserChallenges,
  joinChallenge,
  updateProgress,
  getChallengeLeaderboard,
  calculateAutomaticProgress
};
