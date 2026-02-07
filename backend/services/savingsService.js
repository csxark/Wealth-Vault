import { eq, and, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { users, goals, savingsRoundups } from '../db/schema.js';
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

export default {
  calculateRoundUpAmount,
  processRoundUp,
  processRoundUpTransfer,
  getUserSavingsSettings,
  updateUserSavingsSettings,
  getUserSavingsGoals,
  getRoundUpHistory,
};
