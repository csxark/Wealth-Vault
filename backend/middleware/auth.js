import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import * as schema from '../db/schema.js';

// Helper to map model names to schema tables
const getTable = (modelName) => {
  const map = {
    'User': schema.users,
    'Expense': schema.expenses,
    'Category': schema.categories,
    'Goal': schema.goals
  };
  return map[modelName];
};

// Middleware to protect routes
export const protect = async (req, res, next) => {
  try {
    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    let token;

    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded || !decoded.id) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token format.'
        });
      }

      // Get user from token
      // Note: We select all fields except password by excluding it essentially
      const [user] = await db.select().from(users).where(eq(users.id, decoded.id));

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found or token expired.'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated.'
        });
      }

      // Remove password from user object
      delete user.password;

      // Add user to request object
      req.user = user;
      next();
    } catch (error) {
      console.error('Token verification error:', error);

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.'
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired.'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Authentication failed.'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error in authentication.'
    });
  }
};

// Middleware to check if user is the owner of the resource
export const checkOwnership = (modelName) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user.id; // Drizzle user object has 'id', not '_id'

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

      // Check if user owns the resource
      if (resource.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own resources.'
        });
      }

      req.resource = resource;
      next();
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

// Rate limiting helper (basic implementation)
export const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    if (requests.has(ip)) {
      const userRequests = requests.get(ip).filter(timestamp => timestamp > windowStart);
      requests.set(ip, userRequests);
    }

    const userRequests = requests.get(ip) || [];

    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.'
      });
    }

    userRequests.push(now);
    requests.set(ip, userRequests);

    next();
  };
};
