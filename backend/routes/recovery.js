/**
 * Recovery & Multi-Sig API Routes
 * REST endpoints for guardian management and social recovery workflows
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../config/db.js';
import { vaultGuardians } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// Services
import {
    nominateGuardian,
    getGuardiansForVault,
    getVaultsWhereGuardian,
    updateGuardianPermissions,
    activateGuardian,
    deactivateGuardian,
    verifyGuardianIdentity,
    getGuardianStatistics,
    checkGuardianPermission,
    generateGuardianInvitationLink,
    acceptGuardianInvitation
} from '../services/guardianRegistry.js';

import {
    initializeShamirSharingForVault,
    addGuardianToVault,
    removeGuardianFromVault,
    getVaultGuardians,
    getVaultThreshold
} from '../services/sssService.js';

import {
    initiateRecovery,
    submitGuardianShard,
    challengeRecovery,
    approveRecovery,
    executeRecovery,
    rejectRecovery,
    getRecoveryRequest,
    getVaultRecoveryRequests
} from '../services/recoveryWorkflow.js';

import {
    createMultiSigRule,
    findApplicableRule,
    evaluateApprovalStatus,
    requestApproval,
    submitGuardianApproval,
    getApprovalSummary
} from '../services/recursiveMultiSigEngine.js';

const router = express.Router();

// ============================================================================
// GUARDIAN MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/recovery/guardians/nominate
 * Nominate a user as guardian for a vault
 */
router.post('/guardians/nominate', authenticateToken, async (req, res) => {
    try {
        const { vaultId, userId: guardianUserId, email, name, role, permissions } = req.body;
        const ownerId = req.user.id;

        if (!vaultId || !guardianUserId || !email || !name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: vaultId, userId, email, name'
            });
        }

        const guardian = await nominateGuardian(vaultId, ownerId, {
            userId: guardianUserId,
            email,
            name,
            role,
            permissions
        });

        res.json({
            success: true,
            guardian,
            message: `Guardian ${name} nominated successfully`
        });
    } catch (error) {
        console.error('Error nominating guardian:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/recovery/vaults/:vaultId/guardians
 * Get all guardians for a vault
 */
router.get('/vaults/:vaultId/guardians', authenticateToken, async (req, res) => {
    try {
        const { vaultId } = req.params;
        const activeOnly = req.query.activeOnly !== 'false';

        const guardians = await getGuardiansForVault(vaultId, activeOnly);
        const stats = await getGuardianStatistics(vaultId);

        res.json({
            success: true,
            guardians,
            statistics: stats
        });
    } catch (error) {
        console.error('Error retrieving guardians:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/recovery/guardians/my-vaults
 * Get vaults where current user is a guardian
 */
router.get('/guardians/my-vaults', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const vaults = await getVaultsWhereGuardian(userId);

        res.json({
            success: true,
            count: vaults.length,
            vaults
        });
    } catch (error) {
        console.error('Error retrieving guardian vaults:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/recovery/guardians/:guardianId/permissions
 * Update guardian permissions
 */
router.put('/guardians/:guardianId/permissions', authenticateToken, async (req, res) => {
    try {
        const { guardianId } = req.params;
        const { canInitiateRecovery, canApproveTransactions, approvalWeight } = req.body;

        const updated = await updateGuardianPermissions(guardianId, {
            canInitiateRecovery,
            canApproveTransactions,
            approvalWeight
        });

        res.json({
            success: true,
            guardian: updated,
            message: 'Permissions updated successfully'
        });
    } catch (error) {
        console.error('Error updating permissions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/guardians/:guardianId/deactivate
 * Deactivate a guardian
 */
router.post('/guardians/:guardianId/deactivate', authenticateToken, async (req, res) => {
    try {
        const { guardianId } = req.params;
        const { reason } = req.body;

        const deactivated = await deactivateGuardian(guardianId, reason || 'No reason provided');

        res.json({
            success: true,
            guardian: deactivated,
            message: 'Guardian deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating guardian:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/guardians/accept-invitation
 * Accept guardian invitation
 */
router.post('/guardians/accept-invitation', async (req, res) => {
    try {
        const { invitationToken } = req.body;

        if (!invitationToken) {
            return res.status(400).json({
                success: false,
                error: 'Invitation token required'
            });
        }

        const guardian = await acceptGuardianInvitation(invitationToken);

        res.json({
            success: true,
            guardian,
            message: 'Invitation accepted successfully'
        });
    } catch (error) {
        console.error('Error accepting invitation:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// SHAMIR SECRET SHARING ENDPOINTS
// ============================================================================

/**
 * POST /api/recovery/vaults/:vaultId/initialize-sss
 * Initialize Shamir Secret Sharing for a vault
 */
router.post('/vaults/:vaultId/initialize-sss', authenticateToken, async (req, res) => {
    try {
        const { vaultId } = req.params;
        const { guardians, threshold } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(guardians) || guardians.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'At least 3 guardians required'
            });
        }

        const result = await initializeShamirSharingForVault(vaultId, userId, guardians, threshold);

        res.json({
            success: true,
            masterSecretHash: result.masterSecretHash,
            guardians: result.guardians,
            threshold: result.threshold,
            totalShards: result.totalShards,
            message: `Shamir Secret Sharing initialized with ${result.totalShards} guardians`
        });
    } catch (error) {
        console.error('Error initializing SSS:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/recovery/vaults/:vaultId/threshold
 * Get current threshold configuration
 */
router.get('/vaults/:vaultId/threshold', authenticateToken, async (req, res) => {
    try {
        const { vaultId } = req.params;
        const threshold = await getVaultThreshold(vaultId);

        res.json({
            success: true,
            ...threshold
        });
    } catch (error) {
        console.error('Error retrieving threshold:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// RECOVERY WORKFLOW ENDPOINTS
// ============================================================================

/**
 * POST /api/recovery/initiate
 * Initiate a recovery request
 */
router.post('/initiate', authenticateToken, async (req, res) => {
    try {
        const { vaultId, guardianId, newOwnerEmail, curePeriodDays } = req.body;

        if (!vaultId || !guardianId || !newOwnerEmail) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: vaultId, guardianId, newOwnerEmail'
            });
        }

        const recovery = await initiateRecovery(vaultId, guardianId, newOwnerEmail, curePeriodDays);

        res.json({
            success: true,
            recovery,
            message: 'Recovery initiated successfully'
        });
    } catch (error) {
        console.error('Error initiating recovery:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/:recoveryId/submit-shard
 * Submit guardian shard for recovery
 */
router.post('/:recoveryId/submit-shard', authenticateToken, async (req, res) => {
    try {
        const { recoveryId } = req.params;
        const { guardianId, decryptedShard } = req.body;

        if (!guardianId || !decryptedShard) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: guardianId, decryptedShard'
            });
        }

        const vote = await submitGuardianShard(recoveryId, guardianId, decryptedShard);

        res.json({
            success: true,
            vote,
            message: 'Shard submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting shard:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/:recoveryId/challenge
 * Challenge a recovery request
 */
router.post('/:recoveryId/challenge', authenticateToken, async (req, res) => {
    try {
        const { recoveryId } = req.params;
        const { reason } = req.body;
        const challengerUserId = req.user.id;

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Challenge reason required'
            });
        }

        const recovery = await challengeRecovery(recoveryId, challengerUserId, reason);

        res.json({
            success: true,
            recovery,
            message: 'Recovery challenged successfully'
        });
    } catch (error) {
        console.error('Error challenging recovery:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/:recoveryId/approve
 * Approve recovery (after cure period)
 */
router.post('/:recoveryId/approve', authenticateToken, async (req, res) => {
    try {
        const { recoveryId } = req.params;
        const recovery = await approveRecovery(recoveryId);

        res.json({
            success: true,
            recovery,
            message: 'Recovery approved successfully'
        });
    } catch (error) {
        console.error('Error approving recovery:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/:recoveryId/execute
 * Execute recovery (transfer ownership)
 */
router.post('/:recoveryId/execute', authenticateToken, async (req, res) => {
    try {
        const { recoveryId } = req.params;
        const executorUserId = req.user.id;

        const result = await executeRecovery(recoveryId, executorUserId);

        res.json({
            success: true,
            result,
            message: 'Recovery executed successfully - vault ownership transferred'
        });
    } catch (error) {
        console.error('Error executing recovery:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/:recoveryId/reject
 * Reject recovery request
 */
router.post('/:recoveryId/reject', authenticateToken, async (req, res) => {
    try {
        const { recoveryId } = req.params;
        const { reason } = req.body;

        await rejectRecovery(recoveryId, reason || 'No reason provided');

        res.json({
            success: true,
            message: 'Recovery rejected successfully'
        });
    } catch (error) {
        console.error('Error rejecting recovery:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/recovery/:recoveryId
 * Get recovery request details
 */
router.get('/:recoveryId', authenticateToken, async (req, res) => {
    try {
        const { recoveryId } = req.params;
        const recovery = await getRecoveryRequest(recoveryId);

        res.json({
            success: true,
            recovery
        });
    } catch (error) {
        console.error('Error retrieving recovery:', error);
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/recovery/vaults/:vaultId/requests
 * Get all recovery requests for a vault
 */
router.get('/vaults/:vaultId/requests', authenticateToken, async (req, res) => {
    try {
        const { vaultId } = req.params;
        const requests = await getVaultRecoveryRequests(vaultId);

        res.json({
            success: true,
            count: requests.length,
            requests
        });
    } catch (error) {
        console.error('Error retrieving recovery requests:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// MULTI-SIG ENDPOINTS
// ============================================================================

/**
 * POST /api/recovery/multi-sig/rules
 * Create a recursive multi-sig rule
 */
router.post('/multi-sig/rules', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const ruleConfig = req.body;

        const rule = await createMultiSigRule(ruleConfig.vaultId, userId, ruleConfig);

        res.json({
            success: true,
            rule,
            message: `Multi-sig rule "${rule.ruleName}" created successfully`
        });
    } catch (error) {
        console.error('Error creating multi-sig rule:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/multi-sig/request-approval
 * Request approval for a transaction
 */
router.post('/multi-sig/request-approval', authenticateToken, async (req, res) => {
    try {
        const { vaultId, transactionId, triggerType, amount } = req.body;

        if (!vaultId || !transactionId || !triggerType || amount === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: vaultId, transactionId, triggerType, amount'
            });
        }

        const result = await requestApproval(vaultId, transactionId, triggerType, amount);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error requesting approval:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/recovery/multi-sig/submit-vote
 * Submit guardian vote for transaction approval
 */
router.post('/multi-sig/submit-vote', authenticateToken, async (req, res) => {
    try {
        const { guardianId, transactionId, decision, comments } = req.body;

        if (!guardianId || !transactionId || !decision) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: guardianId, transactionId, decision'
            });
        }

        const vote = await submitGuardianApproval(guardianId, transactionId, decision, comments);

        res.json({
            success: true,
            vote,
            message: `Vote recorded: ${decision}`
        });
    } catch (error) {
        console.error('Error submitting vote:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/recovery/multi-sig/transactions/:transactionId/status
 * Get approval status for a transaction
 */
router.get('/multi-sig/transactions/:transactionId/status', authenticateToken, async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { ruleId } = req.query;

        if (!ruleId) {
            return res.status(400).json({
                success: false,
                error: 'ruleId query parameter required'
            });
        }

        const status = await evaluateApprovalStatus(ruleId, transactionId);
        const summary = await getApprovalSummary(transactionId);

        res.json({
            success: true,
            ...status,
            summary
        });
    } catch (error) {
        console.error('Error retrieving approval status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
