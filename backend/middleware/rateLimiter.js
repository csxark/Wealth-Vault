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
  return undefined; // fallback to memory store
};

// ✅ SAFE key generator (no deprecated API)
const ipKey = (req) => req.ip || req.connection?.remoteAddress || "unknown";

// Enhanced rate limiter factory
const createRateLimiter = (options) => {
  return rateLimit({
    store: createStore(),
    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) => {
      // Prefer authenticated user
      if (req.user?.id) {
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
