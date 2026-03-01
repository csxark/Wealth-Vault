/**
 * Settlements Routes
 * API endpoints for debt settlement management in collaborative vaults
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { checkVaultAccess, isSettlementAdmin, canCreateSettlement } from '../middleware/vaultAuth.js';
import { body, query, param, validationResult } from 'express-validator';
import {
    getSimplifiedDebts,
    getUserDebtBreakdown,
    createSettlement,
    confirmSettlement,
    cancelSettlement,
    getSettlementHistory,
    getUserPendingSettlements
} from '../services/settlementService.js';

const router = express.Router();

/**
 * @route   GET /api/settlements/vault/:vaultId/simplified
 * @desc    Get simplified debt structure (who owes whom) for a vault
 * @access  Private (Vault Members)
 */
router.get(
    '/vault/:vaultId/simplified',
    protect,
    checkVaultAccess(['owner', 'member', 'settlement_admin']),
    async (req, res) => {
        try {
            const { vaultId } = req.params;
            
            const debts = await getSimplifiedDebts(vaultId);
            
            res.json({
                success: true,
                data: debts
            });
        } catch (error) {
            console.error('Error fetching simplified debts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch debt structure',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/settlements/vault/:vaultId/my-breakdown
 * @desc    Get detailed debt breakdown for current user in a vault
 * @access  Private (Vault Members)
 */
router.get(
    '/vault/:vaultId/my-breakdown',
    protect,
    checkVaultAccess(['owner', 'member', 'settlement_admin']),
    async (req, res) => {
        try {
            const { vaultId } = req.params;
            const userId = req.user.id;
            
            const breakdown = await getUserDebtBreakdown(vaultId, userId);
            
            res.json({
                success: true,
                data: breakdown
            });
        } catch (error) {
            console.error('Error fetching user debt breakdown:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch debt breakdown',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/settlements/vault/:vaultId/user/:userId/breakdown
 * @desc    Get detailed debt breakdown for a specific user (admin only)
 * @access  Private (Settlement Admin)
 */
router.get(
    '/vault/:vaultId/user/:userId/breakdown',
    protect,
    isSettlementAdmin,
    async (req, res) => {
        try {
            const { vaultId, userId } = req.params;
            
            const breakdown = await getUserDebtBreakdown(vaultId, userId);
            
            res.json({
                success: true,
                data: breakdown
            });
        } catch (error) {
            console.error('Error fetching user debt breakdown:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch debt breakdown',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/settlements/create
 * @desc    Create a new settlement between two users
 * @access  Private (Vault Members - must involve themselves)
 */
router.post(
    '/create',
    protect,
    canCreateSettlement,
    [
        body('vaultId').notEmpty().withMessage('Vault ID is required'),
        body('payerId').notEmpty().withMessage('Payer ID is required'),
        body('payeeId').notEmpty().withMessage('Payee ID is required'),
        body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
        body('description').optional().isString()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { vaultId, payerId, payeeId, amount, description } = req.body;

            if (payerId === payeeId) {
                return res.status(400).json({
                    success: false,
                    message: 'Payer and payee cannot be the same user'
                });
            }

            const settlement = await createSettlement({
                vaultId,
                payerId,
                payeeId,
                amount,
                description
            });

            res.status(201).json({
                success: true,
                message: 'Settlement created successfully',
                data: settlement
            });
        } catch (error) {
            console.error('Error creating settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create settlement',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/settlements/:settlementId/confirm
 * @desc    Confirm a settlement (by payer or payee)
 * @access  Private
 */
router.post(
    '/:settlementId/confirm',
    protect,
    [
        param('settlementId').notEmpty().withMessage('Settlement ID is required'),
        body('role').isIn(['payer', 'payee']).withMessage('Role must be payer or payee')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { settlementId } = req.params;
            const { role } = req.body;
            const userId = req.user.id;

            const settlement = await confirmSettlement(settlementId, userId, role);

            res.json({
                success: true,
                message: settlement.status === 'confirmed' 
                    ? 'Settlement confirmed by both parties' 
                    : 'Settlement confirmation recorded',
                data: settlement
            });
        } catch (error) {
            console.error('Error confirming settlement:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * @route   POST /api/settlements/:settlementId/cancel
 * @desc    Cancel a pending settlement
 * @access  Private
 */
router.post(
    '/:settlementId/cancel',
    protect,
    param('settlementId').notEmpty().withMessage('Settlement ID is required'),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { settlementId } = req.params;
            const userId = req.user.id;

            const settlement = await cancelSettlement(settlementId, userId);

            res.json({
                success: true,
                message: 'Settlement cancelled successfully',
                data: settlement
            });
        } catch (error) {
            console.error('Error cancelling settlement:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * @route   GET /api/settlements/vault/:vaultId/history
 * @desc    Get settlement history for a vault
 * @access  Private (Vault Members)
 */
router.get(
    '/vault/:vaultId/history',
    protect,
    checkVaultAccess(['owner', 'member', 'settlement_admin']),
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
        query('status').optional().isIn(['pending', 'confirmed', 'cancelled'])
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { vaultId } = req.params;
            const { limit = 50, offset = 0, status } = req.query;

            const history = await getSettlementHistory(vaultId, {
                limit: parseInt(limit),
                offset: parseInt(offset),
                status
            });

            res.json({
                success: true,
                data: history,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    count: history.length
                }
            });
        } catch (error) {
            console.error('Error fetching settlement history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch settlement history',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/settlements/my-pending
 * @desc    Get all pending settlements for current user across all vaults
 * @access  Private
 */
router.get(
    '/my-pending',
    protect,
    async (req, res) => {
        try {
            const userId = req.user.id;
            
            const pendingSettlements = await getUserPendingSettlements(userId);

            res.json({
                success: true,
                data: pendingSettlements,
                count: pendingSettlements.length
            });
        } catch (error) {
            console.error('Error fetching pending settlements:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch pending settlements',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/settlements/vault/:vaultId/stats
 * @desc    Get settlement statistics for a vault
 * @access  Private (Settlement Admin)
 */
router.get(
    '/vault/:vaultId/stats',
    protect,
    isSettlementAdmin,
    async (req, res) => {
        try {
            const { vaultId } = req.params;
            
            // Get simplified debts and settlement history
            const [debts, allHistory] = await Promise.all([
                getSimplifiedDebts(vaultId),
                getSettlementHistory(vaultId, { limit: 1000 })
            ]);

            const pendingSettlements = allHistory.filter(h => h.settlement.status === 'pending');
            const confirmedSettlements = allHistory.filter(h => h.settlement.status === 'confirmed');

            const totalPending = pendingSettlements.reduce((sum, s) => 
                sum + parseFloat(s.settlement.amount), 0
            );

            const totalSettled = confirmedSettlements.reduce((sum, s) => 
                sum + parseFloat(s.settlement.amount), 0
            );

            res.json({
                success: true,
                data: {
                    totalOutstanding: debts.totalDebt,
                    totalPendingSettlements: Math.round(totalPending * 100) / 100,
                    totalSettled: Math.round(totalSettled * 100) / 100,
                    memberCount: debts.memberCount,
                    transactionCount: debts.transactions.length,
                    pendingCount: pendingSettlements.length,
                    confirmedCount: confirmedSettlements.length
                }
            });
        } catch (error) {
            console.error('Error fetching vault settlement stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch settlement statistics',
                error: error.message
            });
        }
    }
);

export default router;
