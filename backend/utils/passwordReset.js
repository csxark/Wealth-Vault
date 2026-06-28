/**
 * Password Reset Utilities
 * Handles secure password reset token generation, validation, and management
 */

import crypto from 'crypto';
import { db } from '../config/db.js';
import { passwordResetTokens } from '../db/schema.js';
import { eq, and, lt } from 'drizzle-orm';

/**
 * Generate a secure password reset token
 * @returns {object} Token object with plain and hashed versions
 */
export function generatePasswordResetToken() {
  // Generate a random 32-byte token
  const token = crypto.randomBytes(32).toString('hex');

  // Hash the token for secure storage
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return {
    token,
    hashedToken,
  };
}

/**
 * Create a password reset token for a user
 * @param {string} userId - User ID
 * @returns {Promise<object>} Created token record
 */
export async function createPasswordResetToken(userId) {
  // Clean up expired tokens for this user first
  await cleanupExpiredTokens(userId);

  const { token, hashedToken } = generatePasswordResetToken();

  // Set expiration to 1 hour from now
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const [resetToken] = await db
    .insert(passwordResetTokens)
    .values({
      userId,
      token,
      hashedToken,
      expiresAt,
    })
    .returning();

  return resetToken;
}

/**
 * Verify a password reset token
 * @param {string} token - Plain token from URL
 * @returns {Promise<object|null>} Token record if valid, null if invalid
 */
export async function verifyPasswordResetToken(token) {
  if (!token) return null;

  // Hash the provided token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.hashedToken, hashedToken),
        eq(passwordResetTokens.used, false),
        lt(passwordResetTokens.expiresAt, new Date()) // expires_at > NOW()
      )
    );

  return resetToken || null;
}

/**
 * Mark a password reset token as used
 * @param {string} tokenId - Token ID
 * @returns {Promise<boolean>} Success status
 */
export async function markTokenAsUsed(tokenId) {
  try {
    await db
      .update(passwordResetTokens)
      .set({
        used: true,
        usedAt: new Date(),
      })
      .where(eq(passwordResetTokens.id, tokenId));

    return true;
  } catch (error) {
    console.error('Error marking token as used:', error);
    return false;
  }
}

/**
 * Clean up expired tokens for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of tokens cleaned up
 */
export async function cleanupExpiredTokens(userId) {
  try {
    const result = await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          lt(passwordResetTokens.expiresAt, new Date())
        )
      );

    return result.rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
    return 0;
  }
}

/**
 * Clean up all expired tokens (for scheduled cleanup)
 * @returns {Promise<number>} Number of tokens cleaned up
 */
export async function cleanupAllExpiredTokens() {
  try {
    const result = await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));

    return result.rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up all expired tokens:', error);
    return 0;
  }
}

/**
 * Get password reset token by ID
 * @param {string} tokenId - Token ID
 * @returns {Promise<object|null>} Token record or null
 */
export async function getPasswordResetToken(tokenId) {
  try {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.id, tokenId));

    return token || null;
  } catch (error) {
    console.error('Error getting password reset token:', error);
    return null;
  }
}

/**
 * Validate token format
 * @param {string} token - Token to validate
 * @returns {boolean} True if format is valid
 */
export function isValidResetTokenFormat(token) {
  if (!token || typeof token !== 'string') return false;

  // Token should be 64 characters (32 bytes in hex)
  return /^[a-f0-9]{64}$/.test(token);
}