import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { users, deviceSessions } from '../db/schema.js';
import * as schema from '../db/schema.js';
import { verifyAccessToken, isTokenBlacklisted } from '../services/tokenService.js';

// Helper to map model names to schema tables
const getTable = (modelName) => {
  const map = {
    'User': schema.users,
    'Expense': schema.expenses,
    'Category': schema.categories,
    'Goal': schema.goals,
    'Asset': schema.fixedAssets,
    'Investment': schema.investments
  };
  return map[modelName];
};

// Enhanced middleware to protect routes with session validation
export const protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    try {
      // Verify token using enhanced token service
      const decoded = await verifyAccessToken(token);

      if (!decoded || !decoded.id) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token format.',
          code: 'INVALID_TOKEN'
        });
      }

      // Verify session exists and is active
      if (decoded.sessionId) {
        const [session] = await db
          .select()
          .from(deviceSessions)
          .where(
            and(
              eq(deviceSessions.id, decoded.sessionId),
              eq(deviceSessions.userId, decoded.id),
              eq(deviceSessions.isActive, true)
            )
          );

        if (!session) {
          return res.status(401).json({
            success: false,
            message: 'Session not found or expired.',
            code: 'SESSION_EXPIRED'
          });
        }

        // Update last activity
        await db.update(deviceSessions)
          .set({ lastActivity: new Date() })
          .where(eq(deviceSessions.id, session.id));
      }

      // Get user from token
      const [user] = await db.select().from(users).where(eq(users.id, decoded.id));

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found or token expired.',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated.',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Remove password from user object
      delete user.password;

      // Add user and session info to request object
      req.user = user;
      req.sessionId = decoded.sessionId;
      req.tokenExp = decoded.exp;

      next();
    } catch (error) {
      console.error('Token verification error:', error);

      if (error.message.includes('revoked')) {
        return res.status(401).json({
          success: false,
          message: 'Token has been revoked.',
          code: 'TOKEN_REVOKED'
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.',
          code: 'INVALID_TOKEN'
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired.',
          code: 'TOKEN_EXPIRED',
          shouldRefresh: true
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Authentication failed.',
        code: 'AUTH_FAILED'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error in authentication.',
      code: 'SERVER_ERROR'
    });
  }
};

// Middleware to check if user is the owner of the resource or has access via vault
export const checkOwnership = (modelName) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id || req.params.expenseId || req.params.goalId;
      const userId = req.user.id;

      const table = getTable(modelName);
      if (!table) {
        throw new Error(`Unknown model name: ${modelName}`);
      }

      // Find resource
      const [resource] = await db.select().from(table).where(eq(table.id, resourceId));

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: `${modelName} not found.`
        });
      }

      // Check if user owns the resource personaly
      if (resource.userId === userId) {
        req.resource = resource;
        return next();
      }

      // Check if resource belongs to a vault and user is a member
      if (resource.vaultId) {
        const [membership] = await db
          .select()
          .from(schema.vaultMembers)
          .where(
            and(
              eq(schema.vaultMembers.vaultId, resource.vaultId),
              eq(schema.vaultMembers.userId, userId)
            )
          );

        if (membership) {
          req.resource = resource;
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to access this resource.'
      });
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error in ownership check.'
      });
    }
  };
};

// Middleware to check if user has required role (for future use)
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // For now, all authenticated users have access
    // In the future, you can add role-based access control here
    next();
  };
};

// Optional authentication middleware
export const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [user] = await db.select().from(users).where(eq(users.id, decoded.id));

        if (user && user.isActive) {
          delete user.password;
          req.user = user;
        }
      } catch (error) {
        // Token is invalid, but we don't block the request
        console.log('Invalid token in optional auth:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
};
