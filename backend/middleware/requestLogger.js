import { logAccess, logError, logSecurityEvent, logDebug } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request logging middleware for API monitoring
 * Tracks all API requests with detailed metrics
 */

// Store request start times for performance measurement
const requestTimes = new Map();

/**
 * Generate unique request ID for tracking
 */
export const requestIdMiddleware = (req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

/**
 * Request logging middleware
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  requestTimes.set(req.requestId, startTime);

  // Log incoming request
  const requestInfo = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length') || 0,
    userId: req.user?.id || 'anonymous',
  };

  // Log sensitive endpoints with higher priority
  if (req.originalUrl.includes('/auth/') || req.originalUrl.includes('/admin/')) {
    logSecurityEvent('Sensitive endpoint access', 'low', requestInfo);
  }

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Log API access with performance metrics
    logAccess(req, res, responseTime);

    // Log slow request as performance issue
    if (responseTime > 5000) { // 5 seconds
      logError('Slow API Response', null, {
        requestId: req.requestId,
        responseTime: `${responseTime}ms`,
        url: req.originalUrl,
        method: req.method,
      });
    }

    // Cleanup request time store
    requestTimes.delete(req.requestId);

    // Call original end function
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Error logging middleware
 */
export const errorLogger = (err, req, res, next) => {
  const errorInfo = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
    statusCode: err.statusCode || 500,
  };

  // Log error with context
  logError('API Error', err, errorInfo);

  // Log security-related errors with higher severity
  if (err.statusCode === 401 || err.statusCode === 403) {
    logSecurityEvent('Authentication/Authorization failure', 'medium', errorInfo);
  }

  next(err);
};

/**
 * Rate limit logging middleware
 */
export const rateLimitLogger = (req, res, next) => {
  const originalStatus = res.status;
  res.status = function (code) {
    if (code === 429) {
      logSecurityEvent('Rate limit exceeded', 'high', {
        requestId: req.requestId,
        ip: req.ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id || 'anonymous',
      });
    }
    return originalStatus.call(this, code);
  };
  next();
};

/**
 * Database query logging helper
 */
export const logDatabaseOperation = (operation, table, duration, meta = {}) => {
  const logData = {
    operation,
    table,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // Log slow database queries
  if (duration > 1000) { // 1 second
    logError('Slow Database Query', null, logData);
  } else {
    // Only log in development to avoid log spam
    if (process.env.NODE_ENV === 'development') {
      logDebug('Database Operation', logData);
    }
  }
};

/**
 * API usage analytics collector
 */
class APIAnalytics {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      errorCount: 0,
      endpointStats: new Map(),
      userActivity: new Map(),
      responseTimeStats: [],
    };

    // Periodically log analytics
    setInterval(() => {
      this.logAnalytics();
    }, 60000); // Every minute
  }

  recordRequest(req, res, responseTime) {
    this.metrics.totalRequests++;

    // Track endpoint usage
    const endpoint = `${req.method} ${req.route?.path || req.originalUrl}`;
    const endpointData = this.metrics.endpointStats.get(endpoint) || { count: 0, totalTime: 0 };
    endpointData.count++;
    endpointData.totalTime += responseTime;
    this.metrics.endpointStats.set(endpoint, endpointData);

    // Track user activity
    if (req.user?.id) {
      const userId = req.user.id;
      const userStats = this.metrics.userActivity.get(userId) || { requests: 0, lastActivity: null };
      userStats.requests++;
      userStats.lastActivity = new Date();
      this.metrics.userActivity.set(userId, userStats);
    }

    // Track response times
    this.metrics.responseTimeStats.push(responseTime);

    // Keep only last 1000 response times
    if (this.metrics.responseTimeStats.length > 1000) {
      this.metrics.responseTimeStats = this.metrics.responseTimeStats.slice(-1000);
    }

    // Track errors
    if (res.statusCode >= 400) {
      this.metrics.errorCount++;
    }
  }

  logAnalytics() {
    const avgResponseTime =
      this.metrics.responseTimeStats.length > 0
        ? this.metrics.responseTimeStats.reduce((a, b) => a + b, 0) / this.metrics.responseTimeStats.length
        : 0;

    const analytics = {
      totalRequests: this.metrics.totalRequests,
      errorCount: this.metrics.errorCount,
      errorRate:
        this.metrics.totalRequests > 0
          ? ((this.metrics.errorCount / this.metrics.totalRequests) * 100).toFixed(2)
          : 0,
      averageResponseTime: Math.round(avgResponseTime),
      activeUsers: this.metrics.userActivity.size,
      topEndpoints: Array.from(this.metrics.endpointStats.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([endpoint, stats]) => ({
          endpoint,
          requests: stats.count,
          avgResponseTime: Math.round(stats.totalTime / stats.count),
        })),
    };

    logPerformance('API Analytics', analytics);

    // Reset metrics for next period
    this.resetMetrics();
  }

  resetMetrics() {
    this.metrics.totalRequests = 0;
    this.metrics.errorCount = 0;
    this.metrics.endpointStats.clear();
    this.metrics.responseTimeStats = [];

    // Keep user activity for longer period
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [userId, stats] of this.metrics.userActivity.entries()) {
      if (stats.lastActivity < oneHourAgo) {
        this.metrics.userActivity.delete(userId);
      }
    }
  }
}

// Create global analytics instance
const apiAnalytics = new APIAnalytics();

/**
 * Analytics middleware
 */
export const analyticsMiddleware = (req, res, next) => {
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const responseTime = Date.now() - requestTimes.get(req.requestId);
    apiAnalytics.recordRequest(req, res, responseTime);
    originalEnd.call(this, chunk, encoding);
  };
  next();
};

export { apiAnalytics };

export default {
  requestIdMiddleware,
  requestLogger,
  errorLogger,
  rateLimitLogger,
  analyticsMiddleware,
  logDatabaseOperation,
};
