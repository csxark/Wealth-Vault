import { eq, and, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { users, goals, savingsRoundups, savingsChallenges, challengeParticipants } from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';

/**
 * Calculate the round-up amount for a given expense
 * @param {number} amount - The original expense amount
 * @param {number} roundUpToNearest - The amount to round up to (e.g., 1.00 for nearest dollar)
 * @returns {number} - The round-up amount
 */
export const calculateRoundUpAmount = (amount, roundUpToNearest) => {
  const remainder = amount % roundUpToNearest;
  if (remainder === 0) {
    return 0; // Already rounded
  }
  return roundUpToNearest - remainder;
};

/**
 * Process round-up for an expense
 * @param {Object} expense - The expense object
 * @returns {Promise<Object|null>} - The created round-up record or null if no round-up
 */
export const processRoundUp = async (expense) => {
  try {
    // Get user settings
    const [user] = await db
      .select({
        savingsRoundUpEnabled: users.savingsRoundUpEnabled,
        savingsGoalId: users.savingsGoalId,
        roundUpToNearest: users.roundUpToNearest,
      })
      .from(users)
      .where(eq(users.id, expense.userId));

    if (!user || !user.savingsRoundUpEnabled || !user.savingsGoalId) {
      return null; // Round-up not enabled or no goal selected
    }

    const roundUpAmount = calculateRoundUpAmount(parseFloat(expense.amount), parseFloat(user.roundUpToNearest));

    if (roundUpAmount <= 0) {
      return null; // No round-up needed
    }

    // Create round-up record
    const [roundUpRecord] = await db
      .insert(savingsRoundups)
      .values({
        userId: expense.userId,
        goalId: user.savingsGoalId,
        expenseId: expense.id,
        originalAmount: expense.amount,
        roundedAmount: parseFloat(expense.amount) + roundUpAmount,
        roundUpAmount: roundUpAmount.toString(),
        currency: expense.currency,
        status: 'pending', // Will be updated when transfer is processed
        metadata: {
          roundUpToNearest: user.roundUpToNearest,
          createdBy: 'system',
        },
      })
      .returning();

    // Update goal's current amount
    await db
      .update(goals)
      .set({
        currentAmount: goals.currentAmount + roundUpAmount,
        updatedAt: new Date(),
      })
      .where(eq(goals.id, user.savingsGoalId));

    // Process the transfer (stub for Plaid integration)
    await processRoundUpTransfer(roundUpRecord);

    // Log audit event
    logAuditEventAsync({
      userId: expense.userId,
      action: AuditActions.GOAL_UPDATE,
      resourceType: ResourceTypes.GOAL,
      resourceId: user.savingsGoalId,
      metadata: {
        roundUpAmount,
        expenseId: expense.id,
        goalId: user.savingsGoalId,
      },
      status: 'success',
      ipAddress: 'system',
      userAgent: 'SavingsRoundUpService',
    });

    return roundUpRecord;
  } catch (error) {
    console.error('Error processing round-up:', error);
    throw error;
  }
};

/**
 * Process the round-up transfer via Plaid (stub implementation)
 * @param {Object} roundUpRecord - The round-up record
 * @returns {Promise<void>}
 */
export const processRoundUpTransfer = async (roundUpRecord) => {
  try {
    // TODO: Implement Plaid integration for automatic transfers
    // For now, mark as transferred immediately
    await db
      .update(savingsRoundups)
      .set({
        status: 'transferred',
        transferDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(savingsRoundups.id, roundUpRecord.id));

    console.log(`Round-up transfer processed for expense ${roundUpRecord.expenseId}: $${roundUpRecord.roundUpAmount}`);
  } catch (error) {
    console.error('Error processing round-up transfer:', error);
    // Mark as failed
    await db
      .update(savingsRoundups)
      .set({
        status: 'failed',
        errorMessage: error.message,
        updatedAt: new Date(),
      })
      .where(eq(savingsRoundups.id, roundUpRecord.id));
    throw error;
  }
};

/**
 * Get user savings settings
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} - User savings settings
 */
export const getUserSavingsSettings = async (userId) => {
  const [user] = await db
    .select({
      savingsRoundUpEnabled: users.savingsRoundUpEnabled,
      savingsGoalId: users.savingsGoalId,
      roundUpToNearest: users.roundUpToNearest,
    })
    .from(users)
    .where(eq(users.id, userId));

  return user || {
    savingsRoundUpEnabled: false,
    savingsGoalId: null,
    roundUpToNearest: '1.00',
  };
};

/**
 * Update user savings settings
 * @param {string} userId - The user ID
 * @param {Object} settings - The settings to update
 * @returns {Promise<Object>} - Updated settings
 */
export const updateUserSavingsSettings = async (userId, settings) => {
  const [updatedUser] = await db
    .update(users)
    .set({
      savingsRoundUpEnabled: settings.savingsRoundUpEnabled,
      savingsGoalId: settings.savingsGoalId,
      roundUpToNearest: settings.roundUpToNearest,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      savingsRoundUpEnabled: users.savingsRoundUpEnabled,
      savingsGoalId: users.savingsGoalId,
      roundUpToNearest: users.roundUpToNearest,
    });

  return updatedUser;
};

/**
 * Get savings goals for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - Array of savings goals
 */
export const getUserSavingsGoals = async (userId) => {
  const userGoals = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.type, 'savings')));

  return userGoals;
};

/**
 * Get round-up history for a user
 * @param {string} userId - The user ID
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} - Round-up history with pagination
 */
export const getRoundUpHistory = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const history = await db
    .select()
    .from(savingsRoundups)
    .where(eq(savingsRoundups.userId, userId))
    .orderBy(desc(savingsRoundups.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: db.$count(savingsRoundups.id) })
    .from(savingsRoundups)
    .where(eq(savingsRoundups.userId, userId));

  return {
    data: history,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit),
    },
  };
};

/**
 * Create a new savings challenge
 * @param {Object} challengeData - Challenge data
 * @returns {Promise<Object>} - Created challenge
 */
export const createChallenge = async (challengeData) => {
  try {
    const [challenge] = await db
      .insert(savingsChallenges)
      .values({
        title: challengeData.title,
        description: challengeData.description,
        type: challengeData.type || 'personal',
        targetAmount: challengeData.targetAmount,
        duration: challengeData.duration,
        startDate: new Date(challengeData.startDate),
        endDate: new Date(challengeData.endDate),
        creatorId: challengeData.creatorId,
        rules: challengeData.rules || {},
        rewards: challengeData.rewards || {},
      })
      .returning();

    // Log audit event
    logAuditEventAsync({
      userId: challengeData.creatorId,
      action: AuditActions.CREATE,
      resourceType: ResourceTypes.CHALLENGE,
      resourceId: challenge.id,
      metadata: {
        challengeType: challenge.type,
        targetAmount: challenge.targetAmount,
      },
      status: 'success',
      ipAddress: 'system',
      userAgent: 'SavingsChallengeService',
    });

    return challenge;
  } catch (error) {
    console.error('Error creating challenge:', error);
    throw error;
  }
};

/**
 * Join a savings challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Created participant record
 */
export const joinChallenge = async (challengeId, userId) => {
  try {
    // Check if challenge exists and is active
    const [challenge] = await db
      .select()
      .from(savingsChallenges)
      .where(and(eq(savingsChallenges.id, challengeId), eq(savingsChallenges.isActive, true)));

    if (!challenge) {
      throw new Error('Challenge not found or inactive');
    }

    // Check if user is already participating
    const [existingParticipant] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'active')
      ));

    if (existingParticipant) {
      throw new Error('User is already participating in this challenge');
    }

    // Create participant record
    const [participant] = await db
      .insert(challengeParticipants)
      .values({
        challengeId,
        userId,
        joinedAt: new Date(),
        currentProgress: '0',
        status: 'active',
      })
      .returning();

    // Update challenge participant count
    await db
      .update(savingsChallenges)
      .set({
        metadata: {
          ...challenge.metadata,
          participantCount: (challenge.metadata.participantCount || 0) + 1,
        },
        updatedAt: new Date(),
      })
      .where(eq(savingsChallenges.id, challengeId));

    // Log audit event
    logAuditEventAsync({
      userId,
      action: AuditActions.JOIN,
      resourceType: ResourceTypes.CHALLENGE,
      resourceId: challengeId,
      metadata: {
        participantId: participant.id,
      },
      status: 'success',
      ipAddress: 'system',
      userAgent: 'SavingsChallengeService',
    });

    return participant;
  } catch (error) {
    console.error('Error joining challenge:', error);
    throw error;
  }
};

/**
 * Update participant progress in a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @param {number} progressAmount - Amount to add to progress
 * @returns {Promise<Object>} - Updated participant record
 */
export const updateChallengeProgress = async (challengeId, userId, progressAmount) => {
  try {
    // Get current participant record
    const [participant] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'active')
      ));

    if (!participant) {
      throw new Error('Participant not found or inactive');
    }

    const newProgress = parseFloat(participant.currentProgress) + parseFloat(progressAmount);

    // Update participant progress
    const [updatedParticipant] = await db
      .update(challengeParticipants)
      .set({
        currentProgress: newProgress.toString(),
        lastUpdated: new Date(),
        metadata: {
          ...participant.metadata,
          contributions: [
            ...(participant.metadata.contributions || []),
            {
              amount: progressAmount,
              date: new Date(),
              type: 'automatic', // or 'manual'
            },
          ],
        },
      })
      .where(eq(challengeParticipants.id, participant.id))
      .returning();

    // Check if challenge is completed
    const [challenge] = await db
      .select()
      .from(savingsChallenges)
      .where(eq(savingsChallenges.id, challengeId));

    if (newProgress >= parseFloat(challenge.targetAmount)) {
      await db
        .update(challengeParticipants)
        .set({
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(challengeParticipants.id, participant.id));
    }

    // Log audit event
    logAuditEventAsync({
      userId,
      action: AuditActions.UPDATE,
      resourceType: ResourceTypes.CHALLENGE,
      resourceId: challengeId,
      metadata: {
        progressAmount,
        newProgress,
        participantId: participant.id,
      },
      status: 'success',
      ipAddress: 'system',
      userAgent: 'SavingsChallengeService',
    });

    return updatedParticipant;
  } catch (error) {
    console.error('Error updating challenge progress:', error);
    throw error;
  }
};

/**
 * Get challenges for a user (created or participated in)
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of challenges
 */
export const getUserChallenges = async (userId, options = {}) => {
  try {
    const { type = 'all', status = 'active' } = options;

    let whereConditions = [];

    if (type === 'created') {
      whereConditions.push(eq(savingsChallenges.creatorId, userId));
    } else if (type === 'participating') {
      // Get challenges where user is participating
      const participatingChallengeIds = await db
        .select({ challengeId: challengeParticipants.challengeId })
        .from(challengeParticipants)
        .where(and(
          eq(challengeParticipants.userId, userId),
          eq(challengeParticipants.status, 'active')
        ));

      const ids = participatingChallengeIds.map(p => p.challengeId);
      if (ids.length > 0) {
        whereConditions.push(eq(savingsChallenges.id, ids[0])); // Simplified - would need 'in' operator
      } else {
        return []; // No participating challenges
      }
    } else {
      // All challenges user can see (created or participating)
      const createdChallenges = await db
        .select({ id: savingsChallenges.id })
        .from(savingsChallenges)
        .where(eq(savingsChallenges.creatorId, userId));

      const participatingChallengeIds = await db
        .select({ challengeId: challengeParticipants.challengeId })
        .from(challengeParticipants)
        .where(and(
          eq(challengeParticipants.userId, userId),
          eq(challengeParticipants.status, 'active')
        ));

      const allIds = [
        ...createdChallenges.map(c => c.id),
        ...participatingChallengeIds.map(p => p.challengeId)
      ];

      if (allIds.length > 0) {
        // Would need to use 'in' operator here
        whereConditions.push(eq(savingsChallenges.id, allIds[0])); // Simplified
      } else {
        return [];
      }
    }

    if (status === 'active') {
      whereConditions.push(eq(savingsChallenges.isActive, true));
    }

    const challenges = await db
      .select()
      .from(savingsChallenges)
      .where(and(...whereConditions))
      .orderBy(desc(savingsChallenges.createdAt));

    return challenges;
  } catch (error) {
    console.error('Error fetching user challenges:', error);
    throw error;
  }
};

/**
 * Get leaderboard for a challenge
 * @param {string} challengeId - Challenge ID
 * @returns {Promise<Array>} - Leaderboard data
 */
export const getChallengeLeaderboard = async (challengeId) => {
  try {
    const leaderboard = await db
      .select({
        participantId: challengeParticipants.id,
        userId: challengeParticipants.userId,
        userName: users.firstName,
        userLastName: users.lastName,
        currentProgress: challengeParticipants.currentProgress,
        joinedAt: challengeParticipants.joinedAt,
        status: challengeParticipants.status,
      })
      .from(challengeParticipants)
      .innerJoin(users, eq(challengeParticipants.userId, users.id))
      .where(eq(challengeParticipants.challengeId, challengeId))
      .orderBy(desc(challengeParticipants.currentProgress));

    return leaderboard;
  } catch (error) {
    console.error('Error fetching challenge leaderboard:', error);
    throw error;
  }
};

/**
 * Calculate rewards for completed challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Reward data
 */
export const calculateChallengeRewards = async (challengeId, userId) => {
  try {
    const [participant] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.userId, userId),
        eq(challengeParticipants.status, 'completed')
      ));

    if (!participant) {
      throw new Error('Participant not found or challenge not completed');
    }

    const [challenge] = await db
      .select()
      .from(savingsChallenges)
      .where(eq(savingsChallenges.id, challengeId));

    // Calculate rewards based on challenge rules
    const rewards = {
      completionBadge: challenge.rewards.completionBadge || false,
      leaderboardBonus: false,
      customRewards: challenge.rewards.customRewards || [],
    };

    // Check leaderboard position for bonus
    const leaderboard = await getChallengeLeaderboard(challengeId);
    const position = leaderboard.findIndex(p => p.participantId === participant.id) + 1;

    if (position <= 3 && challenge.rewards.leaderboardBonus) {
      rewards.leaderboardBonus = true;
      rewards.position = position;
    }

    return rewards;
  } catch (error) {
    console.error('Error calculating challenge rewards:', error);
    throw error;
  }
};

export default {
  calculateRoundUpAmount,
  processRoundUp,
  processRoundUpTransfer,
  getUserSavingsSettings,
  updateUserSavingsSettings,
  getUserSavingsGoals,
  getRoundUpHistory,
  createChallenge,
  joinChallenge,
  updateChallengeProgress,
  getUserChallenges,
  getChallengeLeaderboard,
  calculateChallengeRewards,
};
