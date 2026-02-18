import rateLimit from 'express-rate-limit';

/**
 * AI & Compute Limiter (L3)
 * Prevents resource exhaustion from high-frequency Monte Carlo simulations.
 */
export const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each user to 20 simulations per hour
    message: {
        success: false,
        message: 'Compute resource limit reached. Please wait an hour before running more AI simulations.',
        code: 'COMPUTE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Use authenticated user ID if available, otherwise fall back to IP
        return req.user?.id || req.ip;
    }
});

/**
 * General Heavy Lift Limiter
 */
export const criticalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: {
        success: false,
        message: 'Frequent sensitive operations detected. Cooling down...',
        code: 'SENSITIVE_OP_LIMIT'
    }
});
