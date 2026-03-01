/**
 * Consent Guard Middleware
 * Enforces multi-sig approval requirements for high-stakes transactions
 * Blocks unapproved transactions that require guardian consensus
 */

import { db } from '../config/db.js';
import { recursiveMultiSigRules, guardianVotes } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { findApplicableRule, evaluateApprovalStatus } from '../services/recursiveMultiSigEngine.js';

/**
 * Consent guard middleware - Check if transaction requires multi-sig approval
 * Usage: app.post('/api/expenses', authenticateToken, consentGuard, expenseController)
 */
export async function consentGuard(req, res, next) {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Extract transaction details
        const { vaultId, amount, triggerType = 'vault_withdrawal' } = req.body;

        if (!vaultId || amount === undefined) {
            // If no vault or amount specified, skip consent check
            return next();
        }

        // Check if there's an applicable multi-sig rule
        const rule = await findApplicableRule(vaultId, triggerType, parseFloat(amount));

        if (!rule) {
            // No rule applies - proceed without approval
            return next();
        }

        // Check if transaction has pending approval ID
        const transactionId = req.body.transactionId || req.header('X-Transaction-ID');

        if (!transactionId) {
            // No transaction ID provided - this is initial request
            return res.status(403).json({
                success: false,
                requiresApproval: true,
                error: 'Multi-sig approval required for this transaction',
                rule: {
                    id: rule.id,
                    name: rule.ruleName,
                    description: rule.ruleDescription,
                    approvalLogic: rule.approvalLogic,
                    timeoutHours: rule.approvalTimeoutHours
                },
                message: `This transaction requires guardian approval: ${rule.ruleName}`,
                action: 'request_approval'
            });
        }

        // Transaction ID provided - check approval status
        const approvalStatus = await evaluateApprovalStatus(rule.id, transactionId);

        if (!approvalStatus.approved) {
            // Not yet approved
            return res.status(403).json({
                success: false,
                requiresApproval: true,
                error: 'Transaction not yet approved by required guardians',
                approvalStatus,
                message: 'Waiting for guardian approvals',
                action: 'pending_approval'
            });
        }

        // Check if timed out
        if (approvalStatus.timedOut) {
            return res.status(403).json({
                success: false,
                error: 'Transaction approval has timed out',
                timeoutHours: approvalStatus.timeoutHours,
                message: 'Approval window expired - please request new approval',
                action: 'request_new_approval'
            });
        }

        // Approved - attach approval metadata to request
        req.multiSigApproval = {
            ruleId: rule.id,
            transactionId,
            approvalStatus,
            approvedAt: new Date()
        };

        console.log(`✅ Multi-sig approval verified for transaction ${transactionId}`);

        // Proceed to next middleware
        next();
    } catch (error) {
        console.error('Error in consent guard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify multi-sig approval',
            details: error.message
        });
    }
}

/**
 * Guardian permission checker - Verify guardian has specific permission
 * @param {string} permission - Permission to check ('initiate_recovery', 'approve_transaction', 'view_vault')
 */
export function requireGuardianPermission(permission) {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            const vaultId = req.params.vaultId || req.body.vaultId;

            if (!userId || !vaultId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing user ID or vault ID'
                });
            }

            // Check if user is guardian with required permission
            const { checkGuardianPermission } = await import('../services/guardianRegistry.js');
            const hasPermission = await checkGuardianPermission(userId, vaultId, permission);

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    error: `Guardian permission required: ${permission}`,
                    message: 'You do not have permission to perform this action'
                });
            }

            next();
        } catch (error) {
            console.error('Error checking guardian permission:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify guardian permission',
                details: error.message
            });
        }
    };
}

/**
 * Recovery status checker - Verify recovery request is in valid state
 * @param {Array<string>} allowedStatuses - Allowed recovery statuses
 */
export function requireRecoveryStatus(allowedStatuses) {
    return async (req, res, next) => {
        try {
            const recoveryId = req.params.recoveryId || req.body.recoveryId;

            if (!recoveryId) {
                return res.status(400).json({
                    success: false,
                    error: 'Recovery ID required'
                });
            }

            // Get recovery request
            const { getRecoveryRequest } = await import('../services/recoveryWorkflow.js');
            const recovery = await getRecoveryRequest(recoveryId);

            if (!allowedStatuses.includes(recovery.status)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid recovery status: ${recovery.status}`,
                    currentStatus: recovery.status,
                    allowedStatuses,
                    message: `Recovery must be in one of these states: ${allowedStatuses.join(', ')}`
                });
            }

            // Attach recovery to request
            req.recovery = recovery;

            next();
        } catch (error) {
            console.error('Error checking recovery status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify recovery status',
                details: error.message
            });
        }
    };
}

/**
 * Time-lock checker - Verify actions are within allowed time window
 * @param {string} timeField - Field name containing timestamp (e.g., 'cureExpiresAt')
 * @param {string} comparison - 'before' or 'after'
 */
export function requireTimeCheck(timeField, comparison = 'after') {
    return async (req, res, next) => {
        try {
            const recovery = req.recovery;

            if (!recovery) {
                return res.status(400).json({
                    success: false,
                    error: 'Recovery data not found in request'
                });
            }

            const timestamp = new Date(recovery[timeField]);
            const now = new Date();

            let isValid = false;
            if (comparison === 'after') {
                isValid = now >= timestamp;
            } else if (comparison === 'before') {
                isValid = now < timestamp;
            }

            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    error: `Time constraint violation: must be ${comparison} ${timeField}`,
                    timestamp: timestamp.toISOString(),
                    currentTime: now.toISOString(),
                    message: `Action cannot be performed yet (${comparison} ${timeField})`
                });
            }

            next();
        } catch (error) {
            console.error('Error checking time constraint:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify time constraint',
                details: error.message
            });
        }
    };
}

/**
 * Shard submission rate limiter - Prevent rapid shard submissions
 * Allows max N submissions per hour per guardian
 */
export function shardSubmissionLimiter(maxPerHour = 3) {
    const submissions = new Map(); // guardianId -> [timestamps]

    return async (req, res, next) => {
        try {
            const guardianId = req.body.guardianId;

            if (!guardianId) {
                return next();
            }

            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);

            // Get guardian's recent submissions
            if (!submissions.has(guardianId)) {
                submissions.set(guardianId, []);
            }

            const guardianSubmissions = submissions.get(guardianId);

            // Remove timestamps older than 1 hour
            const recentSubmissions = guardianSubmissions.filter(t => t > oneHourAgo);
            submissions.set(guardianId, recentSubmissions);

            // Check limit
            if (recentSubmissions.length >= maxPerHour) {
                return res.status(429).json({
                    success: false,
                    error: 'Shard submission rate limit exceeded',
                    maxPerHour,
                    recentSubmissions: recentSubmissions.length,
                    message: `Maximum ${maxPerHour} shard submissions per hour allowed`
                });
            }

            // Record this submission
            recentSubmissions.push(now);

            next();
        } catch (error) {
            console.error('Error in shard submission limiter:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check rate limit',
                details: error.message
            });
        }
    };
}

export default {
    consentGuard,
    requireGuardianPermission,
    requireRecoveryStatus,
    requireTimeCheck,
    shardSubmissionLimiter
};
