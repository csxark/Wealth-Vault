import rateLimit from "express-rate-limit";

/**
 * General API rate limiter
 * Limits each IP + User to 100 requests per 15 minutes
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP+User to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many requests from this IP, please try again after 15 minutes",
    retryAfter: 15,
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * Strict rate limiter for authentication routes
 * Limits each IP to 5 requests per 15 minutes
 * Helps prevent brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login/register attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    success: false,
    message:
      "Too many authentication attempts from this IP, please try again after 15 minutes",
    retryAfter: 15,
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * Rate limiter for password reset
 * Limits each IP to 3 requests per hour
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset attempts, please try again after an hour",
    retryAfter: 60,
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * Rate limiter for AI/Gemini endpoints
 * Limits each IP+User to 20 requests per 15 minutes
 */
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit AI requests to prevent API abuse
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many AI requests, please try again after 15 minutes",
    retryAfter: 15,
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * User-specific rate limiter for authenticated routes
 * Limits each authenticated user to 200 requests per 15 minutes
 */
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Higher limit for authenticated users
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.user, // Skip if not authenticated
  message: {
    success: false,
    message: "You have exceeded the request limit. Please try again later.",
    retryAfter: 15,
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
});

export default {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  aiLimiter,
  userLimiter,
};
