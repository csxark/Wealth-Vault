import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient, isRedisAvailable } from "../config/redis.js";

// Create store function with fallback (only check Redis once)
const createStore = () => {
  if (isRedisAvailable()) {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isReady) {
      return new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      });
    }
  }
  return undefined; // Falls back to memory store
};

// Enhanced rate limiter with proper headers and user identification
const createRateLimiter = (options) => {
  return rateLimit({
    store: createStore(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
      // Use user ID if authenticated, otherwise use express-rate-limit's IP helper
      if (req.user && req.user.id) {
        return `user:${req.user.id}`;
      }
      // Use the default IP key generator which handles IPv6 properly
      return rateLimit.defaultKeyGenerator(req, res);
    },
    handler: (req, res, next, options) => {
      res.status(429).json({
        success: false,
        message: options.message.message || options.message,
        retryAfter: Math.ceil(options.windowMs / 1000 / 60), // minutes
        limit: options.max,
        remaining: 0,
        resetTime: new Date(Date.now() + options.windowMs).toISOString(),
      });
    },
    ...options,
  });
};

/**
 * General API rate limiter
 * Limits each IP + User to 100 requests per 15 minutes
 */
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
});

/**
 * Strict rate limiter for authentication routes
 * Limits each IP to 5 requests per 15 minutes
 */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req, res) => `auth:${rateLimit.defaultKeyGenerator(req, res)}`, // Always use IP for auth
  message: {
    message: "Too many authentication attempts from this IP, please try again after 15 minutes",
  },
});

/**
 * Rate limiter for password reset
 * Limits each IP to 3 requests per hour
 */
export const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req, res) => `reset:${rateLimit.defaultKeyGenerator(req, res)}`,
  message: {
    message: "Too many password reset attempts, please try again after an hour",
  },
});

/**
 * Rate limiter for AI/Gemini endpoints
 * Limits each IP+User to 20 requests per 15 minutes
 */
export const aiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    message: "Too many AI requests, please try again after 15 minutes",
  },
});

/**
 * User-specific rate limiter for authenticated routes
 * Limits each authenticated user to 200 requests per 15 minutes
 */
export const userLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  skip: (req) => !req.user,
  message: {
    message: "You have exceeded the request limit. Please try again later.",
  },
});

export default {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  aiLimiter,
  userLimiter,
};
