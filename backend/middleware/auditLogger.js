import { createAuditLogFromRequest } from '../services/auditLogService.js';
import { logger } from '../utils/logger.js';

export const auditLogger = (req, res, next) => {
  const startedAt = Date.now();
  req.auditContext = {
    startedAt
  };

  res.on('finish', () => {
    req.auditContext.responseTimeMs = Date.now() - startedAt;

    createAuditLogFromRequest(req, res).catch((error) => {
      logger.error('Failed to persist audit log', error, {
        requestId: req.requestId,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode
      });
    });
  });

  next();
};

export default {
  auditLogger
};
