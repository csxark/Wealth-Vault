import os from 'os';
import process from 'process';
import { logPerformance, logWarn, logError } from '../utils/logger.js';

/**
 * Performance monitoring service for system metrics
 * Tracks CPU, memory, and other system performance indicators
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      requestCount: 0,
      errorCount: 0,
      lastHealthCheck: null,
    };

    this.thresholds = {
      cpuUsage: 80, // 80%
      memoryUsage: 85, // 85%
      responseTime: 2000, // 2 seconds
      errorRate: 5, // 5%
    };

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Start performance monitoring with regular intervals
   */
  startMonitoring() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Performance health check every 5 minutes
    setInterval(() => {
      this.performHealthCheck();
    }, 300000);

    // Log uptime every hour
    setInterval(() => {
      this.logUptime();
    }, 3600000);
  }

  /**
   * Collect system performance metrics
   */
  collectSystemMetrics() {
    const cpuUsage = this.getCPUUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = this.getDiskUsage();

    const systemMetrics = {
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
      },
      memory: {
        usage: memoryUsage,
        total: Math.round(os.totalmem() / 1024 / 1024), // MB
        free: Math.round(os.freemem() / 1024 / 1024), // MB
        used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024), // MB
      },
      process: {
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: Math.round(os.uptime()),
      },
    };

    logPerformance('System Metrics', systemMetrics);

    // Check for performance issues
    this.checkPerformanceThresholds(systemMetrics);
  }

  /**
   * Calculate CPU usage percentage
   */
  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * (idle / total));

    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Calculate memory usage percentage
   */
  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return Math.round((used / total) * 100);
  }

  /**
   * Get disk usage information (simplified)
   */
  getDiskUsage() {
    return {
      available: 'N/A',
      used: 'N/A',
      total: 'N/A',
    };
  }

  /**
   * Check if performance metrics exceed thresholds
   */
  checkPerformanceThresholds(metrics) {
    if (metrics.cpu.usage > this.thresholds.cpuUsage) {
      logWarn('High CPU Usage Detected', {
        currentUsage: metrics.cpu.usage,
        threshold: this.thresholds.cpuUsage,
        loadAverage: metrics.cpu.loadAverage,
      });
    }

    if (metrics.memory.usage > this.thresholds.memoryUsage) {
      logWarn('High Memory Usage Detected', {
        currentUsage: metrics.memory.usage,
        threshold: this.thresholds.memoryUsage,
        usedMB: metrics.memory.used,
        totalMB: metrics.memory.total,
      });
    }
  }

  /**
   * Performance health check
   */
  performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      memoryUsage: process.memoryUsage(),
      cpuUsage: this.getCPUUsage(),
      requestCount: this.metrics.requestCount,
      errorCount: this.metrics.errorCount,
      errorRate:
        this.metrics.requestCount > 0
          ? ((this.metrics.errorCount / this.metrics.requestCount) * 100).toFixed(2)
          : 0,
    };

    let status = 'healthy';
    const issues = [];

    if (healthStatus.cpuUsage > this.thresholds.cpuUsage) {
      status = 'warning';
      issues.push(`High CPU usage: ${healthStatus.cpuUsage}%`);
    }

    if (healthStatus.memoryUsage.heapUsed / healthStatus.memoryUsage.heapTotal > 0.9) {
      status = 'warning';
      issues.push('High heap memory usage');
    }

    if (parseFloat(healthStatus.errorRate) > this.thresholds.errorRate) {
      status = 'critical';
      issues.push(`High error rate: ${healthStatus.errorRate}%`);
    }

    healthStatus.status = status;
    healthStatus.issues = issues;

    this.metrics.lastHealthCheck = healthStatus;

    if (status !== 'healthy') {
      logWarn('Health Check Warning', healthStatus);
    } else {
      logPerformance('Health Check', healthStatus);
    }
  }

  /**
   * Log application uptime
   */
  logUptime() {
    const uptime = {
      processUptime: Math.round(process.uptime()),
      systemUptime: Math.round(os.uptime()),
      startTime: new Date(this.metrics.startTime).toISOString(),
      currentTime: new Date().toISOString(),
    };

    logPerformance('Application Uptime', uptime);
  }

  /**
   * Record API request metrics
   */
  recordRequest(isError = false) {
    this.metrics.requestCount++;
    if (isError) this.metrics.errorCount++;
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return this.metrics.lastHealthCheck || {
      status: 'unknown',
      message: 'Health check not yet performed',
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    return {
      uptime: Math.round(process.uptime()),
      memoryUsage: process.memoryUsage(),
      cpuUsage: this.getCPUUsage(),
      systemMemoryUsage: this.getMemoryUsage(),
      requestCount: this.metrics.requestCount,
      errorCount: this.metrics.errorCount,
      errorRate:
        this.metrics.requestCount > 0
          ? ((this.metrics.errorCount / this.metrics.requestCount) * 100).toFixed(2)
          : 0,
      lastHealthCheck: this.metrics.lastHealthCheck?.timestamp || null,
    };
  }
}

// Create global performance monitor instance
const performanceMonitor = new PerformanceMonitor();

/**
 * Middleware to track request performance
 */
export const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();

  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;

    // Record request metrics
    performanceMonitor.recordRequest(isError);

    // Log slow request
    if (responseTime > performanceMonitor.thresholds.responseTime) {
      logWarn('Slow Request Detected', {
        url: req.originalUrl,
        method: req.method,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

export { performanceMonitor };
export default performanceMonitor;
