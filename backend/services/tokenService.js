import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, lt } from 'drizzle-orm';
import db from '../config/db.js';
import { deviceSessions, tokenBlacklist, users } from '../db/schema.js';
import { getRedisClient } from '../config/redis.js';

/**
 * Enhanced Token Management Service
 * Handles access tokens, refresh tokens, device sessions, and blacklisting
 */

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const DEVICE_SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate access token (short-lived)
 */
export const generateAccessToken = (userId, sessionId) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  
  return jwt.sign(
    { 
      id: userId, 
      sessionId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    }, 
    process.env.JWT_SECRET, 
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generate refresh token (long-lived)
 */
export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * Create device session with tokens
 */
export const createDeviceSession = async (userId, deviceInfo, ipAddress) => {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + DEVICE_SESSION_EXPIRY);
  
  // Create device session
  const [session] = await db.insert(deviceSessions).values({
    userId,
    deviceId: deviceInfo.deviceId || crypto.randomUUID(),
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'web',
    ipAddress,
    userAgent: deviceInfo.userAgent,
    refreshToken,
    expiresAt,
    lastActivity: new Date(),
  }).returning();

  // Generate access token with session ID
  const accessToken = generateAccessToken(userId, session.id);
  
  // Update session with access token
  await db.update(deviceSessions)
    .set({ accessToken })
    .where(eq(deviceSessions.id, session.id));

  return {
    accessToken,
    refreshToken,
    sessionId: session.id,
    expiresIn: 15 * 60, // 15 minutes in seconds
    refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  };
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (refreshToken, ipAddress) => {
  // Find active session with refresh token
  const [session] = await db
    .select()
    .from(deviceSessions)
    .where(
      and(
        eq(deviceSessions.refreshToken, refreshToken),
        eq(deviceSessions.isActive, true),
        lt(new Date(), deviceSessions.expiresAt)
      )
    );

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  // Check if refresh token is blacklisted
  const [blacklistedToken] = await db
    .select()
    .from(tokenBlacklist)
    .where(eq(tokenBlacklist.token, refreshToken));

  if (blacklistedToken) {
    throw new Error('Refresh token has been revoked');
  }

  // Generate new access token
  const newAccessToken = generateAccessToken(session.userId, session.id);
  
  // Update session activity and access token
  await db.update(deviceSessions)
    .set({ 
      accessToken: newAccessToken,
      lastActivity: new Date(),
      ipAddress: ipAddress || session.ipAddress
    })
    .where(eq(deviceSessions.id, session.id));

  return {
    accessToken: newAccessToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
    sessionId: session.id,
  };
};

/**
 * Blacklist token (logout, password change, etc.)
 */
export const blacklistToken = async (token, tokenType, userId, reason = 'logout') => {
  try {
    // Decode token to get expiration
    const decoded = jwt.decode(token);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Add to blacklist
    await db.insert(tokenBlacklist).values({
      token,
      tokenType,
      userId,
      reason,
      expiresAt,
    });

    // Also add to Redis for faster lookup (if available)
    const redisClient = getRedisClient();
    if (redisClient) {
      const ttl = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      await redisClient.setEx(`blacklist:${token}`, ttl, reason);
    }

    return true;
  } catch (error) {
    console.error('Error blacklisting token:', error);
    return false;
  }
};

/**
 * Check if token is blacklisted
 */
export const isTokenBlacklisted = async (token) => {
  // Check Redis first (faster)
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const result = await redisClient.get(`blacklist:${token}`);
      if (result) return true;
    } catch (error) {
      console.warn('Redis blacklist check failed:', error.message);
    }
  }

  // Fallback to database
  const [blacklistedToken] = await db
    .select()
    .from(tokenBlacklist)
    .where(eq(tokenBlacklist.token, token));

  return !!blacklistedToken;
};

/**
 * Revoke device session (logout from specific device)
 */
export const revokeDeviceSession = async (sessionId, userId, reason = 'logout') => {
  const [session] = await db
    .select()
    .from(deviceSessions)
    .where(
      and(
        eq(deviceSessions.id, sessionId),
        eq(deviceSessions.userId, userId)
      )
    );

  if (!session) {
    throw new Error('Session not found');
  }

  // Blacklist both tokens
  if (session.accessToken) {
    await blacklistToken(session.accessToken, 'access', userId, reason);
  }
  if (session.refreshToken) {
    await blacklistToken(session.refreshToken, 'refresh', userId, reason);
  }

  // Deactivate session
  await db.update(deviceSessions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(deviceSessions.id, sessionId));

  return true;
};

/**
 * Revoke all user sessions (logout from all devices)
 */
export const revokeAllUserSessions = async (userId, reason = 'security') => {
  // Get all active sessions
  const sessions = await db
    .select()
    .from(deviceSessions)
    .where(
      and(
        eq(deviceSessions.userId, userId),
        eq(deviceSessions.isActive, true)
      )
    );

  // Blacklist all tokens
  for (const session of sessions) {
    if (session.accessToken) {
      await blacklistToken(session.accessToken, 'access', userId, reason);
    }
    if (session.refreshToken) {
      await blacklistToken(session.refreshToken, 'refresh', userId, reason);
    }
  }

  // Deactivate all sessions
  await db.update(deviceSessions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(deviceSessions.userId, userId));

  return sessions.length;
};

/**
 * Get user's active sessions
 */
export const getUserSessions = async (userId) => {
  return await db
    .select({
      id: deviceSessions.id,
      deviceName: deviceSessions.deviceName,
      deviceType: deviceSessions.deviceType,
      ipAddress: deviceSessions.ipAddress,
      lastActivity: deviceSessions.lastActivity,
      createdAt: deviceSessions.createdAt,
    })
    .from(deviceSessions)
    .where(
      and(
        eq(deviceSessions.userId, userId),
        eq(deviceSessions.isActive, true),
        lt(new Date(), deviceSessions.expiresAt)
      )
    );
};

/**
 * Clean expired tokens and sessions
 */
export const cleanupExpiredTokens = async () => {
  const now = new Date();
  
  // Remove expired blacklisted tokens
  await db.delete(tokenBlacklist)
    .where(lt(tokenBlacklist.expiresAt, now));
  
  // Deactivate expired sessions
  await db.update(deviceSessions)
    .set({ isActive: false })
    .where(lt(deviceSessions.expiresAt, now));
  
  console.log('✅ Expired tokens and sessions cleaned up');
};

/**
 * Verify and decode access token
 */
export const verifyAccessToken = async (token) => {
  try {
    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      throw new Error('Token has been revoked');
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

export default {
  generateAccessToken,
  generateRefreshToken,
  createDeviceSession,
  refreshAccessToken,
  blacklistToken,
  isTokenBlacklisted,
  revokeDeviceSession,
  revokeAllUserSessions,
  getUserSessions,
  cleanupExpiredTokens,
  verifyAccessToken,
};