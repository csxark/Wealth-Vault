import express from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import governanceService from '../services/governanceService.js';
import successionService from '../services/successionService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { AppError } from '../utils/AppError.js';
import db from '../config/db.js';
import { assetStepUpLogs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import shieldService from '../services/shieldService.js';
import riskEngine from '../services/riskEngine.js';
import anomalyScanner from '../services/anomalyScanner.js';
import hedgingOrchestrator from '../services/hedgingOrchestrator.js';
import { marketAnomalyDefinitions, syntheticVaultMappings, hedgeExecutionHistory, vaults } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/governance/roles
 * @desc    Assign a role to a user in a vault
 */
router.post('/roles', protect, [
    body('vaultId').isUUID(),
    body('userId').isUUID(),
    body('role').isIn(['owner', 'parent', 'child', 'trustee', 'beneficiary']),
    body('permissions').isObject(),
], asyncHandler(async (req, res) => {
    const { vaultId, userId, role, permissions } = req.body;
    const newRole = await governanceService.assignRole(vaultId, userId, role, permissions, req.user.id);
    new ApiResponse(201, newRole, 'Role assigned successfully').send(res);
}));

/**
 * @route   GET /api/governance/roles/:vaultId
 * @desc    Get all roles for a vault
 */
router.get('/roles/:vaultId', protect, asyncHandler(async (req, res) => {
    const roles = await governanceService.getVaultRoles(req.params.vaultId);
    new ApiResponse(200, roles).send(res);
}));

/**
 * @route   DELETE /api/governance/roles/:roleId
 * @desc    Revoke a role
 */
router.delete('/roles/:roleId', protect, asyncHandler(async (req, res) => {
    await governanceService.revokeRole(req.params.roleId, req.user.id);
    new ApiResponse(200, null, 'Role revoked successfully').send(res);
}));

/**
 * @route   POST /api/governance/approvals/request
 * @desc    Create an approval request
 */
router.post('/approvals/request', protect, [
    body('vaultId').isUUID(),
    body('resourceType').isIn(['expense', 'goal', 'transfer', 'role_change']),
    body('action').isIn(['create', 'update', 'delete']),
    body('requestData').isObject(),
], asyncHandler(async (req, res) => {
    const { vaultId, resourceType, action, requestData, amount } = req.body;
    const request = await governanceService.createApprovalRequest(
        vaultId,
        req.user.id,
        resourceType,
        action,
        requestData,
        amount
    );
    new ApiResponse(201, request, 'Approval request created').send(res);
}));

/**
 * @route   GET /api/governance/approvals/pending/:vaultId
 * @desc    Get pending approvals for a vault
 */
router.get('/approvals/pending/:vaultId', protect, asyncHandler(async (req, res) => {
    const requests = await governanceService.getPendingApprovals(req.params.vaultId, req.user.id);
    new ApiResponse(200, requests).send(res);
}));

/**
 * @route   POST /api/governance/approvals/:requestId/approve
 * @desc    Approve a request
 */
router.post('/approvals/:requestId/approve', protect, [
    body('reason').optional().isString(),
], asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const approved = await governanceService.approveRequest(req.params.requestId, req.user.id, reason);
    new ApiResponse(200, approved, 'Request approved').send(res);
}));

/**
 * @route   POST /api/governance/approvals/:requestId/reject
 * @desc    Reject a request
 */
router.post('/approvals/:requestId/reject', protect, [
    body('reason').isString(),
], asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const rejected = await governanceService.rejectRequest(req.params.requestId, req.user.id, reason);
    new ApiResponse(200, rejected, 'Request rejected').send(res);
}));

/**
 * @route   POST /api/governance/inheritance/rules
 * @desc    Create inheritance rule with advanced conditions
 */
router.post('/inheritance/rules', protect, [
    body('beneficiaryId').isUUID(),
    body('assetType').isIn(['vault', 'fixed_asset', 'portfolio', 'all']),
    body('distributionPercentage').optional().isNumeric(),
    body('conditions').optional().isObject(),
    body('executors').optional().isArray(),
], asyncHandler(async (req, res) => {
    const rule = await successionService.addInheritanceRule(req.user.id, req.body);
    new ApiResponse(201, rule, 'Advanced inheritance rule created').send(res);
}));

/**
 * @route   GET /api/governance/inheritance/rules
 * @desc    Get user's inheritance rules with executor details
 */
router.get('/inheritance/rules', protect, asyncHandler(async (req, res) => {
    const rules = await successionService.getUserInheritanceRules(req.user.id);
    new ApiResponse(200, rules).send(res);
}));

/**
 * @route   POST /api/governance/inheritance/:ruleId/approve
 * @desc    Executor approval for inheritance trigger (Multi-Sig)
 */
router.post('/inheritance/:ruleId/approve', protect, asyncHandler(async (req, res) => {
    const result = await successionService.approveInheritance(req.params.ruleId, req.user.id);
    new ApiResponse(200, result, 'Inheritance approval recorded').send(res);
}));

/**
 * @route   GET /api/governance/inheritance/step-up-logs
 * @desc    Get tax step-up basis history
 */
router.get('/inheritance/step-up-logs', protect, asyncHandler(async (req, res) => {
    const logs = await db.select().from(assetStepUpLogs).where(eq(assetStepUpLogs.inheritedBy, req.user.id));
    new ApiResponse(200, logs).send(res);
}));

/**
 * @route   DELETE /api/governance/inheritance/rules/:ruleId
 * @desc    Revoke inheritance rule
 */
router.delete('/inheritance/rules/:ruleId', protect, asyncHandler(async (req, res) => {
    await successionService.revokeRule(req.params.ruleId, req.user.id);
    new ApiResponse(200, null, 'Inheritance rule revoked').send(res);
}));

/**
 * @route   GET /api/governance/inactivity/status
 * @desc    Get inactivity status
 */
router.get('/inactivity/status', protect, asyncHandler(async (req, res) => {
    const status = await successionService.getInactivityStatus(req.user.id);
    new ApiResponse(200, status).send(res);
}));

/**
 * @route   POST /api/governance/inactivity/ping
 * @desc    Manual proof-of-life ping
 */
router.post('/inactivity/ping', protect, asyncHandler(async (req, res) => {
    await successionService.updateActivity(req.user.id, 'manual_ping');
    new ApiResponse(200, null, 'Activity recorded').send(res);
}));

/**
 * @route   POST /api/governance/inactivity/verify
 * @desc    Verify proof-of-life challenge
 */
router.post('/inactivity/verify', protect, [
    body('token').isString(),
], asyncHandler(async (req, res) => {
    await successionService.verifyChallenge(req.user.id, req.body.token);
    new ApiResponse(200, null, 'Challenge verified - you are alive!').send(res);
}));

/**
 * @route   POST /api/governance/multi-sig/quest
 * @desc    Propose a new multi-sig approval quest
 */
router.post('/multi-sig/quest', protect, asyncHandler(async (req, res) => {
    const quest = await governanceService.proposeQuest(req.user.id, req.body);
    new ApiResponse(201, quest, 'Approval quest proposed').send(res);
}));

/**
 * @route   POST /api/governance/multi-sig/sign/:questId
 * @desc    Cast a signature on a pending quest
 */
router.post('/multi-sig/sign/:questId', protect, asyncHandler(async (req, res) => {
    const updated = await governanceService.castSignature(req.user.id, req.params.questId);
    new ApiResponse(200, updated, 'Signature recorded').send(res);
}));

/**
 * @route   GET /api/governance/multi-sig/pending
 * @desc    Get pending actions for the current executor
 */
router.get('/multi-sig/pending', protect, asyncHandler(async (req, res) => {
    const actions = await governanceService.getPendingActions(req.user.id);
    new ApiResponse(200, actions).send(res);
}));

/**
 * @route   POST /api/governance/shield/trigger
 * @desc    Add a legal shield trigger rule
 */
router.post('/shield/trigger', protect, asyncHandler(async (req, res) => {
    const { entityId, triggerType, threshold } = req.body;
    const rule = await shieldService.addTriggerRule(req.user.id, entityId, triggerType, threshold);
    new ApiResponse(201, rule).send(res);
}));

/**
 * @route   POST /api/governance/shield/activate/:triggerId
 * @desc    Manual activation of emergency shield
 */
router.post('/shield/activate/:triggerId', protect, asyncHandler(async (req, res) => {
    const result = await shieldService.activateShield(req.user.id, req.params.triggerId);
    new ApiResponse(200, result, 'Emergency shield activated').send(res);
}));

/**
 * @route   POST /api/governance/shield/deactivate/:lockId
 * @desc    Consensus-based deactivation of liquidity lock
 */
router.post('/shield/deactivate/:lockId', protect, asyncHandler(async (req, res) => {
    const { approverIds } = req.body;
    const result = await shieldService.deactivateShield(req.user.id, req.params.lockId, approverIds);
    if (!result.success) return res.status(403).json(result);
    new ApiResponse(200, result).send(res);
}));

/**
 * @route   GET /api/governance/shield/status
 * @desc    Get current shielding status for user entities
 */
router.get('/shield/status', protect, asyncHandler(async (req, res) => {
    const triggers = await db.query.shieldTriggers.findMany({
        where: eq(shieldTriggers.userId, req.user.id)
    });
    const locks = await db.query.liquidityLocks.findMany({
        where: and(eq(liquidityLocks.userId, req.user.id), eq(liquidityLocks.isUnlocked, false))
    });
    new ApiResponse(200, { triggers, activeLocks: locks }).send(res);
}));

/**
 * @route   POST /api/governance/shield/sensitivity
 * @desc    Calibrate risk sensitivity levels
 */
router.post('/shield/sensitivity', protect, asyncHandler(async (req, res) => {
    const { level } = req.body;
    const result = await riskEngine.calibrateSensitivity(req.user.id, level);
    new ApiResponse(200, result).send(res);
}));

/**
 * @route   GET /api/governance/risk/system-status
 * @desc    Get real-time market anomaly scanner status
 */
router.get('/risk/system-status', protect, asyncHandler(async (req, res) => {
    const status = anomalyScanner.getSystemStatus();
    new ApiResponse(200, status).send(res);
}));

/**
 * @route   POST /api/governance/risk/reset
 * @desc    Manually reset system alert state to NORMAL
 */
router.post('/risk/reset', protect, asyncHandler(async (req, res) => {
    anomalyScanner.resetState();
    new ApiResponse(200, null, 'System state reset to NORMAL').send(res);
}));

/**
 * @route   GET /api/governance/risk/anomalies
 * @desc    Get detected market anomalies for the user
 */
router.get('/risk/anomalies', protect, asyncHandler(async (req, res) => {
    const history = await db.query.marketAnomalyDefinitions.findMany({
        where: eq(marketAnomalyDefinitions.userId, req.user.id),
        with: {
            executions: {
                orderBy: [desc(hedgeExecutionHistory.executionDate)],
                limit: 10
            }
        }
    });
    new ApiResponse(200, history).send(res);
}));

/**
 * @route   POST /api/governance/risk/hedge-rules
 * @desc    Create a new market anomaly detection and auto-hedge rule
 */
router.post('/risk/hedge-rules', protect, [
    body('anomalyType').isIn(['Flash-Crash', 'Hyper-Volatility', 'De-Pegging', 'Bank-Run']),
    body('detectionThreshold').isNumeric(),
    body('autoPivotEnabled').isBoolean().optional(),
], asyncHandler(async (req, res) => {
    const { anomalyType, detectionThreshold, autoPivotEnabled } = req.body;
    const [rule] = await db.insert(marketAnomalyDefinitions).values({
        userId: req.user.id,
        anomalyType,
        detectionThreshold: detectionThreshold.toString(),
        autoPivotEnabled: autoPivotEnabled ?? false,
    }).returning();
    new ApiResponse(201, rule).send(res);
}));

/**
 * @route   POST /api/governance/risk/synthetic-mappings
 * @desc    Map a volatile vault to a synthetic safe-haven vault
 */
router.post('/risk/synthetic-mappings', protect, [
    body('sourceVaultId').isUUID(),
    body('safeHavenVaultId').isUUID(),
    body('pivotTriggerRatio').isNumeric().optional(),
], asyncHandler(async (req, res) => {
    const { sourceVaultId, safeHavenVaultId, pivotTriggerRatio } = req.body;

    // Check ownership of both vaults
    const v1 = await db.query.vaults.findFirst({ where: and(eq(vaults.id, sourceVaultId), eq(vaults.ownerId, req.user.id)) });
    const v2 = await db.query.vaults.findFirst({ where: and(eq(vaults.id, safeHavenVaultId), eq(vaults.ownerId, req.user.id)) });

    if (!v1 || !v2) return next(new AppError(404, 'One or both vaults not found or unauthorized'));

    const [mapping] = await db.insert(syntheticVaultMappings).values({
        userId: req.user.id,
        sourceVaultId,
        safeHavenVaultId,
        pivotTriggerRatio: pivotTriggerRatio?.toString() || '0.50',
    }).returning();

    new ApiResponse(201, mapping).send(res);
}));

/**
 * @route   POST /api/governance/risk/freeze/lift
 * @desc    Manually lift liquidity freeze for the user's vaults
 */
router.post('/risk/freeze/lift', protect, asyncHandler(async (req, res) => {
    await hedgingOrchestrator.liftLiquidityFreeze(req.user.id);
    new ApiResponse(200, null, 'Liquidity freeze lifted').send(res);
}));

export default router;

