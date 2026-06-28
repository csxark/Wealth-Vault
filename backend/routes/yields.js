import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import dividendService from '../services/dividendService.js';
import rebalanceEngine from '../services/rebalanceEngine.js';
import vaultService from '../services/vaultService.js';
import { reserveOperatingLiquidity } from '../services/forecastEngine.js';
import db from '../config/db.js';
import { autoReinvestConfigs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/yields/dividends/upcoming
 * @desc    Get upcoming dividend payments
 */
router.get('/dividends/upcoming', protect, asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    const dividends = await dividendService.getUpcomingDividends(req.user.id, parseInt(days));
    new ApiResponse(200, dividends).send(res);
}));

/**
 * @route   GET /api/yields/dividends/income
 * @desc    Get expected dividend income for a period
 */
router.get('/dividends/income', protect, asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const income = await dividendService.getExpectedDividendIncome(
        req.user.id,
        new Date(startDate),
        new Date(endDate)
    );
    new ApiResponse(200, income).send(res);
}));

/**
 * @route   POST /api/yields/dividends/sync
 * @desc    Sync dividend schedules from market data
 */
router.post('/dividends/sync', protect, asyncHandler(async (req, res) => {
    const synced = await dividendService.syncDividendSchedules(req.user.id);
    new ApiResponse(200, { synced }).send(res);
}));

/**
 * @route   GET /api/yields/cash-drag
 * @desc    Get cash drag metrics for all vaults
 */
router.get('/cash-drag', protect, asyncHandler(async (req, res) => {
    const { minExcess = 1000 } = req.query;
    const vaultsWithExcess = await vaultService.getVaultsWithExcessCash(req.user.id, parseFloat(minExcess));

    const totalDrag = vaultsWithExcess.reduce((sum, v) => sum + v.totalDragCost, 0);
    const totalExcess = vaultsWithExcess.reduce((sum, v) => sum + v.excessCash, 0);

    new ApiResponse(200, {
        vaults: vaultsWithExcess,
        summary: {
            totalExcessCash: parseFloat(totalExcess.toFixed(2)),
            totalDragCost: parseFloat(totalDrag.toFixed(2)),
            vaultCount: vaultsWithExcess.length
        }
    }).send(res);
}));

/**
 * @route   GET /api/yields/rebalance/drift
 * @desc    Calculate portfolio drift for a vault
 */
router.get('/rebalance/drift', protect, asyncHandler(async (req, res) => {
    const { vaultId } = req.query;
    const drift = await rebalanceEngine.calculatePortfolioDrift(req.user.id, vaultId);
    new ApiResponse(200, drift).send(res);
}));

/**
 * @route   GET /api/yields/rebalance/alpha
 * @desc    Calculate expected alpha from rebalancing
 */
router.get('/rebalance/alpha', protect, asyncHandler(async (req, res) => {
    const { vaultId, cashAmount } = req.query;
    const alpha = await rebalanceEngine.calculateRebalanceAlpha(
        req.user.id,
        vaultId,
        parseFloat(cashAmount)
    );
    new ApiResponse(200, alpha).send(res);
}));

/**
 * @route   POST /api/yields/rebalance/execute
 * @desc    Execute automatic rebalance
 */
router.post('/rebalance/execute', protect, asyncHandler(async (req, res) => {
    const { vaultId, cashAmount } = req.body;

    // Check operating liquidity first
    const liquidity = await reserveOperatingLiquidity(req.user.id);

    if (liquidity.adjustedAvailable < cashAmount) {
        return new ApiResponse(400, {
            error: 'Insufficient liquidity',
            available: liquidity.adjustedAvailable,
            requested: cashAmount,
            recommendation: liquidity.recommendation
        }).send(res);
    }

    const result = await rebalanceEngine.executeRebalance(req.user.id, vaultId, parseFloat(cashAmount));
    new ApiResponse(200, result).send(res);
}));

/**
 * @route   GET /api/yields/config
 * @desc    Get auto-reinvestment configuration
 */
router.get('/config', protect, asyncHandler(async (req, res) => {
    const { vaultId } = req.query;
    const config = await db.query.autoReinvestConfigs.findFirst({
        where: and(
            eq(autoReinvestConfigs.userId, req.user.id),
            eq(autoReinvestConfigs.vaultId, vaultId)
        )
    });
    new ApiResponse(200, config || {}).send(res);
}));

/**
 * @route   POST /api/yields/config
 * @desc    Update auto-reinvestment configuration
 */
router.post('/config', protect, asyncHandler(async (req, res) => {
    const { vaultId, isEnabled, reinvestmentStrategy, minimumCashThreshold, rebalanceThreshold, targetAllocation, parkingVaultId } = req.body;

    // Check if config exists
    const existing = await db.query.autoReinvestConfigs.findFirst({
        where: and(
            eq(autoReinvestConfigs.userId, req.user.id),
            eq(autoReinvestConfigs.vaultId, vaultId)
        )
    });

    if (existing) {
        // Update existing
        const [updated] = await db.update(autoReinvestConfigs)
            .set({
                isEnabled,
                reinvestmentStrategy,
                minimumCashThreshold: minimumCashThreshold?.toString(),
                rebalanceThreshold: rebalanceThreshold?.toString(),
                targetAllocation,
                parkingVaultId,
                updatedAt: new Date()
            })
            .where(eq(autoReinvestConfigs.id, existing.id))
            .returning();

        new ApiResponse(200, updated).send(res);
    } else {
        // Create new
        const [created] = await db.insert(autoReinvestConfigs).values({
            userId: req.user.id,
            vaultId,
            isEnabled,
            reinvestmentStrategy,
            minimumCashThreshold: minimumCashThreshold?.toString(),
            rebalanceThreshold: rebalanceThreshold?.toString(),
            targetAllocation,
            parkingVaultId
        }).returning();

        new ApiResponse(201, created).send(res);
    }
}));

/**
 * @route   GET /api/yields/liquidity-check
 * @desc    Check operating liquidity before cash sweep
 */
router.get('/liquidity-check', protect, asyncHandler(async (req, res) => {
    const { months = 3 } = req.query;
    const liquidity = await reserveOperatingLiquidity(req.user.id, parseInt(months));
    new ApiResponse(200, liquidity).send(res);
}));

export default router;
