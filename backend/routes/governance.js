import express from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import governanceService from '../services/governanceService.js';
import successionService from '../services/successionService.js';
import ApiResponse from '../utils/ApiResponse.js';
import AppError from '../utils/AppError.js';
import db from '../config/db.js';
import { assetStepUpLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';

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

export default router;

