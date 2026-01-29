import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Create logs directories if they don't exist
const ensureLogDirectories = () => {
  const logDirs = ['logs', 'logs/error', 'logs/combined', 'logs/access', 'logs/performance'];
  logDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureLogDirectories();

// Custom log format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let logEntry = { timestamp, level, message, ...meta };
    if (stack) logEntry.stack = stack;
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Rotating file transport for error logs
const errorFileTransport = new DailyRotateFile({
  filename: 'logs/error/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

// Rotating file transport for combined logs
const combinedFileTransport = new DailyRotateFile({
  filename: 'logs/combined/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
});

// Access log transport for API requests
const accessFileTransport = new DailyRotateFile({
  filename: 'logs/access/access-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  format: logFormat,
});

// Main logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'wealth-vault-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [errorFileTransport, combinedFileTransport],
  exceptionHandlers: [new winston.transports.File({ filename: 'logs/exceptions.log' })],
  rejectionHandlers: [new winston.transports.File({ filename: 'logs/rejections.log' })],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug',
    })
  );
}

// Separate logger for access logs
const accessLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [accessFileTransport],
});

// Performance logger
const performanceLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: 'logs/performance/perf-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '7d',
      format: logFormat,
    }),
  ],
});

// Helper functions
export const logInfo = (message, meta = {}) => logger.info(message, meta);
export const logError = (message, error = null, meta = {}) => {
  const logData = { ...meta };
  if (error) {
    logData.error = { message: error.message, stack: error.stack, name: error.name };
  }
  logger.error(message, logData);
};
export const logWarn = (message, meta = {}) => logger.warn(message, meta);
export const logDebug = (message, meta = {}) => logger.debug(message, meta);

// API access logging
export const logAccess = (req, res, responseTime) => {
  accessLogger.info('API Request', {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
    contentLength: res.get('Content-Length') || 0,
  });
};

// Performance metrics logging
export const logPerformance = (metric, value, meta = {}) => {
  performanceLogger.info('Performance Metric', {
    metric,
    value,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// Database query logging
export const logDatabaseQuery = (query, duration, meta = {}) => {
  logger.debug('Database Query', {
    query: query.substring(0, 200),
    duration: `${duration}ms`,
    ...meta,
  });
};

// Security event logging
export const logSecurityEvent = (event, severity = 'medium', meta = {}) => {
  logger.warn('Security Event', {
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

export { logger, accessLogger, performanceLogger };
export default logger;
