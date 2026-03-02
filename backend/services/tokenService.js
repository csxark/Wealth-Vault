import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import dbRouter from '../services/dbRouterService.js';
import { deviceSessions, tokenBlacklist } from '../db/schema.js';

/**
 * Token Management Service with Database Integration
 * Handles token generation, validation, and session management
 */

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Cookie options for refresh tokens
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: '/api/auth'
};

export const generateAccessToken = (userId, sessionId = null) => {
  return jwt.sign(
    { 
      userId, 
      sessionId,
      type: 'access' 
    },
    process.env.JWT_SECRET || 'fallback-secret',
    { 
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'wealth-vault',
      audience: 'wealth-vault-client'
    }
  );
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

export const createDeviceSession = async (userId, deviceInfo, ipAddress) => {
  const refreshToken = generateRefreshToken();
  const sessionId = crypto.randomBytes(16).toString('hex');
  const accessToken = generateAccessToken(userId, sessionId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Save session to database
  const [session] = await dbRouter.primaryDb
    .insert(deviceSessions)
    .values({
      id: sessionId,
      userId,
      deviceId: deviceInfo?.deviceId || 'unknown',
      deviceName: deviceInfo?.deviceName || 'Unknown Device',
      deviceType: deviceInfo?.deviceType || 'web',
      ipAddress,
      userAgent: deviceInfo?.userAgent,
      refreshToken,
      accessToken,
      expiresAt
    })
    .returning();

  return {
    sessionId: session.id,
    refreshToken: session.refreshToken,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt
  };
};

export const refreshAccessToken = async (refreshToken, ipAddress) => {
  if (!refreshToken) {
    throw new Error('Refresh token is required');
  }

  // Check if refresh token is blacklisted
  const [blacklisted] = await dbRouter.primaryDb
    .select()
    .from(tokenBlacklist)
    .where(and(
      eq(tokenBlacklist.token, refreshToken),
      eq(tokenBlacklist.tokenType, 'refresh')
    ));

  if (blacklisted) {
    throw new Error('Refresh token has been revoked');
  }

  // Find active device session with matching refresh token
  const [session] = await dbRouter.primaryDb
    .select()
    .from(deviceSessions)
    .where(and(
      eq(deviceSessions.refreshToken, refreshToken),
      eq(deviceSessions.isActive, true),
      gt(deviceSessions.expiresAt, new Date())
    ));

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  // Generate new tokens
  const newRefreshToken = generateRefreshToken();
  const newAccessToken = generateAccessToken(session.userId, session.id);

  // Update session with new tokens and activity
  await dbRouter.primaryDb
    .update(deviceSessions)
    .set({
      refreshToken: newRefreshToken,
      accessToken: newAccessToken,
      lastActivity: new Date(),
      ipAddress: ipAddress
    })
    .where(eq(deviceSessions.id, session.id));

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    sessionId: session.id
  };
};

export const blacklistToken = async (token, tokenType, userId, reason = 'logout') => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  await dbRouter.primaryDb
    .insert(tokenBlacklist)
    .values({
      token,
      tokenType,
      userId,
      reason,
      expiresAt
    });

  return { success: true };
};

export const isTokenBlacklisted = async (token) => {
  const [blacklisted] = await dbRouter.primaryDb
    .select()
    .from(tokenBlacklist)
    .where(and(
      eq(tokenBlacklist.token, token),
      gt(tokenBlacklist.expiresAt, new Date())
    ));

  return !!blacklisted;
};

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
  } catch (error) {
    throw new Error(`Invalid token: ${error.message}`);
  }
};

export const getDeviceSession = async (sessionId, userId) => {
  const [session] = await dbRouter.primaryDb
    .select()
    .from(deviceSessions)
    .where(and(
      eq(deviceSessions.id, sessionId),
      eq(deviceSessions.userId, userId),
      eq(deviceSessions.isActive, true)
    ));

  return session || null;
};

export const invalidateDeviceSession = async (sessionId) => {
  const result = await dbRouter.primaryDb
    .update(deviceSessions)
    .set({ isActive: false })
    .where(eq(deviceSessions.id, sessionId));

  return { success: result.rowCount > 0 };
};

export const getUserDeviceSessions = async (userId) => {
  return await dbRouter.primaryDb
    .select()
    .from(deviceSessions)
    .where(and(
      eq(deviceSessions.userId, userId),
      eq(deviceSessions.isActive, true)
    ));
};

export const invalidateAllUserSessions = async (userId) => {
  const result = await dbRouter.primaryDb
    .update(deviceSessions)
    .set({ isActive: false })
    .where(eq(deviceSessions.userId, userId));

  return { success: true };
};

export const cleanupExpiredTokens = async () => {
  const now = new Date();

  // Deactivate expired device sessions
  const expiredSessions = await dbRouter.primaryDb
    .update(deviceSessions)
    .set({ isActive: false })
    .where(gt(deviceSessions.expiresAt, now))
    .returning();

  // Remove expired blacklist entries
  const expiredBlacklist = await dbRouter.primaryDb
    .delete(tokenBlacklist)
    .where(gt(tokenBlacklist.expiresAt, now))
    .returning();

  return {
    sessionsRemoved: expiredSessions.length,
    tokensRemoved: expiredBlacklist.length
  };
};

export const revokeDeviceSession = async (sessionId, userId, reason = 'logout') => {
  // First get the session to blacklist the tokens
  const [session] = await dbRouter.primaryDb
    .select()
    .from(deviceSessions)
    .where(and(
      eq(deviceSessions.id, sessionId),
      eq(deviceSessions.userId, userId)
    ));

  if (session) {
    // Blacklist the current tokens
    if (session.accessToken) {
      await blacklistToken(session.accessToken, 'access', session.userId, reason);
    }
    if (session.refreshToken) {
      await blacklistToken(session.refreshToken, 'refresh', session.userId, reason);
    }
  }

  // Deactivate the session
  const result = await dbRouter.primaryDb
    .update(deviceSessions)
    .set({ isActive: false })
    .where(eq(deviceSessions.id, sessionId));

  return { success: result.rowCount > 0 };
};

export const revokeAllUserSessions = async (userId, reason = 'logout_all') => {
  // Get all active sessions for the user
  const sessions = await dbRouter.primaryDb
    .select()
    .from(deviceSessions)
    .where(and(
      eq(deviceSessions.userId, userId),
      eq(deviceSessions.isActive, true)
    ));

  // Blacklist all tokens from active sessions
  for (const session of sessions) {
    if (session.accessToken) {
      await blacklistToken(session.accessToken, 'access', userId, reason);
    }
    if (session.refreshToken) {
      await blacklistToken(session.refreshToken, 'refresh', userId, reason);
    }
  }

  // Deactivate all sessions
  const result = await dbRouter.primaryDb
    .update(deviceSessions)
    .set({ isActive: false })
    .where(eq(deviceSessions.userId, userId));

  return { success: true, revokedCount: sessions.length };
};

export const getUserSessions = async (userId) => {
  return await dbRouter.primaryDb
    .select({
      id: deviceSessions.id,
      deviceId: deviceSessions.deviceId,
      deviceName: deviceSessions.deviceName,
      deviceType: deviceSessions.deviceType,
      ipAddress: deviceSessions.ipAddress,
      userAgent: deviceSessions.userAgent,
      lastActivity: deviceSessions.lastActivity,
      createdAt: deviceSessions.createdAt,
      expiresAt: deviceSessions.expiresAt,
      isActive: deviceSessions.isActive
    })
    .from(deviceSessions)
    .where(and(
      eq(deviceSessions.userId, userId),
      eq(deviceSessions.isActive, true)
    ))
    .orderBy(deviceSessions.lastActivity);
};
