import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, checkOwnership } from '../middleware/auth.js';
import { securityInterceptor } from '../middleware/auditMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import assetService from '../services/assetService.js';
import projectionEngine from '../services/projectionEngine.js';
import marketData from '../services/marketData.js';
import riskEngine from '../services/riskEngine.js';
import ApiResponse from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @route   GET /api/assets
 * @desc    Get all user assets
 */
router.get('/', protect, asyncHandler(async (req, res) => {
    const assets = await assetService.getUserAssets(req.user.id);
    const portfolio = await assetService.getPortfolioValue(req.user.id);

    new ApiResponse(200, { assets, portfolio }, 'Assets fetched successfully').send(res);
}));

/**
 * @route   POST /api/assets
 * @desc    Create a new asset
 */
router.post('/', protect, securityInterceptor(), [
    body('name').notEmpty().trim(),
    body('category').isIn(['real_estate', 'vehicle', 'jewelry ', 'art', 'collectible', 'stock', 'crypto', 'other']),
    body('purchasePrice').isFloat({ gt: 0 }),
    body('currentValue').optional().isFloat({ gt: 0 }),
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const asset = await assetService.createAsset(req.user.id, req.body);
    new ApiResponse(201, asset, 'Asset created successfully').send(res);
}));

/**
 * @route   GET /api/assets/:id
 * @desc    Get asset by ID with valuation history
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
    const asset = await assetService.getAssetById(req.params.id, req.user.id);
    new ApiResponse(200, asset, 'Asset fetched successfully').send(res);
}));

/**
 * @route   PUT /api/assets/:id
 * @desc    Update asset details
 */
router.put('/:id', protect, checkOwnership('Asset'), securityInterceptor(), asyncHandler(async (req, res) => {
    const updated = await assetService.updateAsset(req.params.id, req.user.id, req.body);
    new ApiResponse(200, updated, 'Asset updated successfully').send(res);
}));

/**
 * @route   PUT /api/assets/:id/value
 * @desc    Update asset valuation
 */
router.put('/:id/value', protect, checkOwnership('Asset'), securityInterceptor(), [
    body('value').isFloat({ gt: 0 }),
    body('source').optional().isIn(['manual', 'market_adjustment', 'appraisal'])
], asyncHandler(async (req, res) => {
    const { value, source } = req.body;
    const updated = await assetService.updateAssetValue(req.params.id, value, source);
    new ApiResponse(200, updated, 'Valuation updated').send(res);
}));

/**
 * @route   DELETE /api/assets/:id
 * @desc    Delete an asset
 */
router.delete('/:id', protect, checkOwnership('Asset'), securityInterceptor(), asyncHandler(async (req, res) => {
    await assetService.deleteAsset(req.params.id, req.user.id);
    new ApiResponse(200, null, 'Asset deleted successfully').send(res);
}));

/**
 * @route   POST /api/assets/simulate
 * @desc    Run Monte Carlo simulation
 */
router.post('/simulate', protect, [
    body('timeHorizon').optional().isInt({ min: 1, max: 50 }),
    body('iterations').optional().isInt({ min: 100, max: 5000 }),
    body('inflationRate').optional().isFloat(),
    body('investmentReturn').optional().isFloat(),
], asyncHandler(async (req, res) => {
    const result = await projectionEngine.runSimulation(req.user.id, req.body);
    new ApiResponse(200, result, 'Simulation completed').send(res);
}));

/**
 * @route   GET /api/assets/simulations/history
 * @desc    Get past simulation results
 */
router.get('/simulations/history', protect, asyncHandler(async (req, res) => {
    const history = await projectionEngine.getSimulationHistory(req.user.id);
    new ApiResponse(200, history, 'Simulation history fetched successfully').send(res);
}));

/**
 * @route   GET /api/assets/market/indices
 * @desc    Get market indices
 */
router.get('/market/indices', protect, asyncHandler(async (req, res) => {
    const indices = await marketData.getAllIndices();
    new ApiResponse(200, indices, 'Market indices fetched successfully').send(res);
}));


/**
 * @route   GET /api/assets/risk-summary
 * @desc    Get quick risk overview for the asset dashboard
 */
router.get('/risk-summary', protect, asyncHandler(async (req, res) => {
    const [varMetric, beta] = await Promise.all([
        riskEngine.calculatePortfolioVaR(req.user.id),
        riskEngine.calculatePortfolioBeta(req.user.id)
    ]);

    new ApiResponse(200, {
        valueAtRisk: varMetric,
        portfolioBeta: beta,
        riskLevel: beta > 1.2 ? 'high' : beta > 0.8 ? 'moderate' : 'low'
    }, 'Risk summary fetched successfully').send(res);
}));

export default router;
