import express from 'express';
import { protect } from '../middleware/auth.js';
import taxHarvestEngine from '../services/taxHarvestEngine.js';
import taxLotService from '../services/taxLotService.js';
import washSaleTracker from '../services/washSaleTracker.js';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @route   GET /api/tax/harvest/scan
 * @desc    Manual scan for tax-loss harvesting opportunities across all entities.
 */
router.get('/harvest/scan', protect, asyncHandler(async (req, res) => {
    // Mock prices for demonstration; real app pulls from marketDataService
    const currentPrices = { 'VTI': 210.00, 'BTC': 42000, 'AAPL': 160.00 };
    const opportunities = await taxHarvestEngine.scanOpportunities(req.user.id, currentPrices);
    new ApiResponse(200, opportunities, 'Tax harvest opportunities retrieved').send(res);
}));

/**
 * @route   POST /api/tax/harvest/execute
 * @desc    Execute a specific harvesting opportunity.
 */
router.post('/harvest/execute', protect, asyncHandler(async (req, res) => {
    const { opportunity } = req.body;
    if (!opportunity) return res.status(400).json({ message: 'Opportunity data required' });

    const result = await taxHarvestEngine.executeHarvest(req.user.id, opportunity);
    new ApiResponse(200, result, 'Tax loss successfully harvested — Wash-sale restriction activated for 30 days').send(res);
}));

/**
 * @route   GET /api/tax/inventory
 * @desc    Get detailed tax-lot inventory with specific identification.
 */
router.get('/inventory', protect, asyncHandler(async (req, res) => {
    const currentPrices = { 'VTI': 210.00, 'BTC': 42000, 'AAPL': 160.00 };
    const positions = await taxLotService.getUnrealizedPositions(req.user.id, currentPrices);
    new ApiResponse(200, positions, 'Specific tax-lot inventory retrieved').send(res);
}));

/**
 * @route   GET /api/tax/wash-sale/status
 * @desc    Check active wash-sale windows across all user entities.
 */
router.get('/wash-sale/status', protect, asyncHandler(async (req, res) => {
    const windows = await db.select().from(washSaleWindows)
        .where(and(
            eq(washSaleWindows.userId, req.user.id),
            eq(washSaleWindows.isActive, true)
        ));
    new ApiResponse(200, windows, 'Active wash-sale windows retrieved').send(res);
}));

export default router;
