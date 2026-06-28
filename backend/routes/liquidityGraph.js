import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import liquidityOptimizerService from '../services/liquidityOptimizerService.js';

const router = express.Router();

/**
 * @route   GET /api/liquidity/graph/topology
 * @desc    Returns the current graph topology for routing visualization (#476)
 * @access  Private
 */
router.get('/topology', protect, asyncHandler(async (req, res) => {
    const topology = await liquidityOptimizerService.getOptimalGraphTopology(req.user.id);

    return res.json(new ApiResponse(200, topology, 'Graph topology retrieved successfully'));
}));

/**
 * @route   GET /api/liquidity/graph/metrics
 * @desc    Returns system-wide optimization efficiency metrics
 * @access  Private
 */
router.get('/metrics', protect, asyncHandler(async (req, res) => {
    const { default: auditService } = await import('../services/liquidityAuditService.js');
    const metrics = await auditService.getOptimizerPerformance(req.user.id);

    return res.json(new ApiResponse(200, metrics, 'Optimization metrics retrieved'));
}));

export default router;
