import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import vaultConsolidator from '../services/vaultConsolidator.js';
import crossVaultAnalytics from '../services/crossVaultAnalytics.js';

const router = express.Router();

/**
 * @route   POST /api/vault-consolidation/groups
 * @desc    Create a new vault group for consolidation
 * @access  Private
 */
router.post(
    '/groups',
    protect,
    [
        body('name').notEmpty().withMessage('Group name is required'),
        body('vaultIds').isArray().withMessage('Vault IDs must be an array')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const group = await vaultConsolidator.createVaultGroup(req.user.id, req.body);
        res.status(201).json({ success: true, data: group });
    })
);

/**
 * @route   GET /api/vault-consolidation/groups
 * @desc    Get user's consolidation groups
 * @access  Private
 */
router.get(
    '/groups',
    protect,
    asyncHandler(async (req, res) => {
        const groups = await vaultConsolidator.getUserGroups(req.user.id);
        res.json({ success: true, data: groups });
    })
);

/**
 * @route   POST /api/vault-consolidation/sync/:groupId
 * @desc    Manually trigger consolidation sync
 * @access  Private
 */
router.post(
    '/sync/:groupId',
    protect,
    asyncHandler(async (req, res) => {
        const snapshot = await vaultConsolidator.consolidateGroup(req.params.groupId);
        res.json({ success: true, data: snapshot });
    })
);

/**
 * @route   GET /api/vault-consolidation/analytics/:groupId
 * @desc    Get consolidated analytics for a group
 * @access  Private
 */
router.get(
    '/analytics/:groupId',
    protect,
    asyncHandler(async (req, res) => {
        const analytics = await crossVaultAnalytics.getGroupInsights(req.params.groupId);
        res.json({ success: true, data: analytics });
    })
);

/**
 * @route   POST /api/vault-consolidation/analytics/:groupId/generate
 * @desc    Trigger fresh analytics generation
 * @access  Private
 */
router.post(
    '/analytics/:groupId/generate',
    protect,
    asyncHandler(async (req, res) => {
        const analytics = await crossVaultAnalytics.generateGroupAnalytics(req.params.groupId);
        res.json({ success: true, data: analytics });
    })
);

/**
 * @route   GET /api/vault-consolidation/history/:groupId
 * @desc    Get historical performance of a vault group
 * @access  Private
 */
router.get(
    '/history/:groupId',
    protect,
    asyncHandler(async (req, res) => {
        const history = await crossVaultAnalytics.getPerformanceHistory(req.params.groupId);
        res.json({ success: true, data: history });
    })
);

export default router;
