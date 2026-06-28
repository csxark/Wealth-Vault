import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient, isRedisAvailable } from "../config/redis.js";

/**
 * Rate Limiter with Dynamic Redis Store and Graceful Degradation
 * 
 * Creates rate limiters that:
 * - Use Redis for distributed rate limiting when available
 * - Automatically fall back to memory-based limiting if Redis unavailable
 * - Handle Redis connection state changes gracefully
 */

/**
 * Create store function with runtime Redis availability check
 * This is called on each rate limit check, allowing dynamic fallback
 */
const createStore = () => {
  // Check if Redis is available at request time
  if (isRedisAvailable()) {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isReady) {
      try {
        return new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
          prefix: 'rl:', // Rate limit prefix
        });
      } catch (error) {
        console.warn('⚠️ Failed to create Redis store, falling back to memory:', error.message);
      }
    }
  }
  // Falls back to memory store (not shared across instances)
  return undefined;
};

// ✅ SAFE key generator (no deprecated API)
const ipKey = (req) => req.ip || req.connection?.remoteAddress || "unknown";

// Enhanced rate limiter factory
const createRateLimiter = (options) => {
  return rateLimit({
    // Dynamic store creation - checked on each request
    store: createStore(),
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    keyGenerator: (req, res) => {
      // Use user ID if authenticated, otherwise use IP
      if (req.user && req.user.id) {
        return `user:${req.user.id}`;
      }
      // Fallback to IP
      return `ip:${ipKey(req)}`;
    },

    handler: (req, res, _next, options) => {
      res.status(429).json({
        success: false,
        message: options.message?.message || options.message,
        retryAfter: Math.ceil(options.windowMs / 1000),
        limit: options.max,
        remaining: 0,
        resetTime: new Date(Date.now() + options.windowMs).toISOString(),
      });
    },
    // Skip rate limiting for /health endpoint
    skip: (req) => {
      return req.path === '/api/health' || req.path === '/health';
    },
    ...options,
  });
};

/**
 * General API rate limiter
 */
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    message: "Too many requests, please try again after 15 minutes",
  },
});

/**
 * Auth limiter (IP-based only)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `auth:${ipKey(req)}`,
  message: {
    message:
      "Too many authentication attempts, please try again after 15 minutes",
  },
});

/**
 * Password reset limiter
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `reset:${ipKey(req)}`,
  message: {
    message: "Too many password reset attempts, please try again after an hour",
  },
});

/**
 * AI / Gemini limiter
 */
export const aiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many AI requests, please try again later",
  },
});

/**
 * User-specific limiter
 */
export const userLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
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
