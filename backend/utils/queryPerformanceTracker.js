/**
 * Query Performance Tracker
 * Tracks and analyzes database query performance
 */

import logger from '../utils/logger.js';

class QueryPerformanceTracker {
  constructor() {
    this.queries = [];
    this.stats = {
      totalQueries: 0,
      slowQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDuration: 0,
    };
    
    this.thresholds = {
      slowQuery: 1000, // 1 second
      verySlowQuery: 3000, // 3 seconds
    };
    
    // Clean old queries every hour
    setInterval(() => this.cleanOldQueries(), 3600000);
  }
  
  /**
   * Record a query execution
   */
  recordQuery(queryName, duration, cached = false, metadata = {}) {
    this.stats.totalQueries++;
    this.stats.totalDuration += duration;
    
    if (cached) {
      this.stats.cacheHits++;
    } else {
      this.stats.cacheMisses++;
    }
    
    const query = {
      name: queryName,
      duration,
      cached,
      timestamp: Date.now(),
      ...metadata,
    };
    
    // Track slow queries
    if (duration > this.thresholds.slowQuery) {
      this.stats.slowQueries++;
      
      const level = duration > this.thresholds.verySlowQuery ? 'error' : 'warn';
      logger[level]('Slow query detected:', {
        query: queryName,
        duration: `${duration}ms`,
        cached,
        ...metadata,
      });
    }
    
    // Keep last 1000 queries
    this.queries.push(query);
    if (this.queries.length > 1000) {
      this.queries.shift();
    }
  }
  
  /**
   * Get query statistics
   */
  getStats() {
    const avgDuration = this.stats.totalQueries > 0
      ? Math.round(this.stats.totalDuration / this.stats.totalQueries)
      : 0;
    
    const cacheHitRate = this.stats.totalQueries > 0
      ? ((this.stats.cacheHits / this.stats.totalQueries) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.stats,
      averageDuration: avgDuration,
      cacheHitRate: `${cacheHitRate}%`,
    };
  }
  
  /**
   * Get slowest queries
   */
  getSlowestQueries(limit = 10) {
    return [...this.queries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }
  
  /**
   * Get recent queries
   */
  getRecentQueries(limit = 20) {
    return this.queries.slice(-limit).reverse();
  }
  
  /**
   * Get queries by name
   */
  getQueriesByName(name, limit = 10) {
    return this.queries
      .filter((q) => q.name.includes(name))
      .slice(-limit)
      .reverse();
  }
  
  /**
   * Clean old queries (older than 1 hour)
   */
  cleanOldQueries() {
    const oneHourAgo = Date.now() - 3600000;
    const before = this.queries.length;
    this.queries = this.queries.filter((q) => q.timestamp > oneHourAgo);
    const after = this.queries.length;
    
    if (before !== after) {
      logger.debug(`Cleaned ${before - after} old query records`);
    }
  }
  
  /**
   * Generate performance report
   */
  generateReport() {
    const stats = this.getStats();
    const slowest = this.getSlowestQueries(5);
    const recent = this.getRecentQueries(10);
    
    return {
      summary: stats,
      slowestQueries: slowest,
      recentQueries: recent,
      recommendations: this.generateRecommendations(stats, slowest),
    };
  }
  
  /**
   * Generate performance recommendations
   */
  generateRecommendations(stats, slowQueries) {
    const recommendations = [];
    
    // Check cache hit rate
    const cacheHitRate = parseFloat(stats.cacheHitRate);
    if (cacheHitRate < 50 && stats.totalQueries > 100) {
      recommendations.push({
        type: 'cache',
        priority: 'high',
        message: `Cache hit rate is low (${stats.cacheHitRate}). Consider caching more frequently accessed data.`,
      });
    }
    
    // Check slow queries
    const slowQueryRate = (stats.slowQueries / stats.totalQueries) * 100;
    if (slowQueryRate > 10) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `${slowQueryRate.toFixed(1)}% of queries are slow. Review query optimization and indexing.`,
      });
    }
    
    // Check specific slow queries
    if (slowQueries.length > 0) {
      const queryNames = [...new Set(slowQueries.map((q) => q.name))];
      recommendations.push({
        type: 'query',
        priority: 'medium',
        message: `The following queries need optimization: ${queryNames.join(', ')}`,
        queries: queryNames,
      });
    }
    
    // Check average duration
    if (stats.averageDuration > 500) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: `Average query duration is ${stats.averageDuration}ms. Consider adding indexes or optimizing queries.`,
      });
    }
    
    return recommendations;
  }
  
  /**
   * Reset statistics
   */
  reset() {
    this.queries = [];
    this.stats = {
      totalQueries: 0,
      slowQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDuration: 0,
    };
  }
}

// Create global instance
const queryTracker = new QueryPerformanceTracker();

/**
 * Middleware to wrap query execution with performance tracking
 */
export const trackQuery = (queryName, metadata = {}) => {
  return async (queryFn) => {
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      queryTracker.recordQuery(queryName, duration, false, metadata);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      queryTracker.recordQuery(queryName, duration, false, {
        ...metadata,
        error: error.message,
      });
      throw error;
    }
  };
};

/**
 * Track cached query
 */
export const trackCachedQuery = (queryName, duration, metadata = {}) => {
  queryTracker.recordQuery(queryName, duration, true, metadata);
};

export { queryTracker };
export default queryTracker;
