import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import governanceService from '../services/governanceService.js';
import deadMansSwitch from '../services/deadMansSwitch.js';

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { vaultId, userId, role, permissions } = req.body;

    const newRole = await governanceService.assignRole(vaultId, userId, role, permissions, req.user.id);
    res.success(newRole, 'Role assigned successfully');
}));

/**
 * @route   GET /api/governance/roles/:vaultId
 * @desc    Get all roles for a vault
 */
router.get('/roles/:vaultId', protect, asyncHandler(async (req, res) => {
    const roles = await governanceService.getVaultRoles(req.params.vaultId);
    res.success(roles);
}));

/**
 * @route   DELETE /api/governance/roles/:roleId
 * @desc    Revoke a role
 */
router.delete('/roles/:roleId', protect, asyncHandler(async (req, res) => {
    await governanceService.revokeRole(req.params.roleId, req.user.id);
    res.success(null, 'Role revoked successfully');
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

    res.success(request, 'Approval request created');
}));

/**
 * @route   GET /api/governance/approvals/:vaultId
 * @desc    Get pending approvals for a vault
 */
router.get('/approvals/:vaultId', protect, asyncHandler(async (req, res) => {
    const requests = await governanceService.getPendingApprovals(req.params.vaultId, req.user.id);
    res.success(requests);
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
    res.success(approved, 'Request approved');
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
    res.success(rejected, 'Request rejected');
}));

/**
 * @route   POST /api/governance/inheritance/rules
 * @desc    Create inheritance rule
 */
router.post('/inheritance/rules', protect, [
    body('beneficiaryId').isUUID(),
    body('assetType').isIn(['vault', 'fixed_asset', 'all']),
    body('distributionPercentage').optional().isFloat({ min: 0, max: 100 }),
], asyncHandler(async (req, res) => {
    const rule = await deadMansSwitch.addInheritanceRule(req.user.id, req.body);
    res.success(rule, 'Inheritance rule created');
}));

/**
 * @route   GET /api/governance/inheritance/rules
 * @desc    Get user's inheritance rules
 */
router.get('/inheritance/rules', protect, asyncHandler(async (req, res) => {
    const rules = await deadMansSwitch.getUserInheritanceRules(req.user.id);
    res.success(rules);
}));

/**
 * @route   DELETE /api/governance/inheritance/rules/:ruleId
 * @desc    Revoke inheritance rule
 */
router.delete('/inheritance/rules/:ruleId', protect, asyncHandler(async (req, res) => {
    await deadMansSwitch.revokeRule(req.params.ruleId, req.user.id);
    res.success(null, 'Inheritance rule revoked');
}));

/**
 * @route   GET /api/governance/inactivity/status
 * @desc    Get inactivity status
 */
router.get('/inactivity/status', protect, asyncHandler(async (req, res) => {
    const status = await deadMansSwitch.getInactivityStatus(req.user.id);
    res.success(status);
}));

/**
 * @route   POST /api/governance/inactivity/ping
 * @desc    Manual proof-of-life ping
 */
router.post('/inactivity/ping', protect, asyncHandler(async (req, res) => {
    await deadMansSwitch.updateActivity(req.user.id, 'manual_ping');
    res.success(null, 'Activity recorded');
}));

/**
 * @route   POST /api/governance/inactivity/verify
 * @desc    Verify proof-of-life challenge
 */
router.post('/inactivity/verify', protect, [
    body('token').isString(),
], asyncHandler(async (req, res) => {
    await deadMansSwitch.verifyChallenge(req.user.id, req.body.token);
    res.success(null, 'Challenge verified - you are alive!');
}));

export default router;
