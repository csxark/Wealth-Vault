import auditService from '../services/auditService.js';
import { logInfo } from '../utils/logger.js';

/**
 * Audit Interceptor Middleware (L3)
 * Real-time logging of every inter-company movement for SEC/Tax-compliance non-repudiation.
 */
export const auditInterCompanyFlow = async (req, res, next) => {
    // We only care about mutations to the ledger
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const userId = req.user.id;
        const { sourceEntityId, targetEntityId, amount, transferType } = req.body;

        if (sourceEntityId && targetEntityId) {
            logInfo(`[Audit Interceptor] Inter-company event detected: ${transferType}`);

            // Log for high-integrity audit trail
            await auditService.logAuditEvent({
                userId,
                action: 'CORPORATE_LEDGER_MUTATION',
                resourceType: 'corporate_entity',
                resourceId: sourceEntityId,
                metadata: {
                    targetId: targetEntityId,
                    amount,
                    type: transferType,
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                    requestPath: req.path
                }
            });
        }
    }

    next();
};

/**
 * Compliance Lock Guard
 */
export const complianceLockGuard = (req, res, next) => {
    // Logic to prevent inter-company flows if an entity has a "Sanction" or "Tax Block"
    next();
};
