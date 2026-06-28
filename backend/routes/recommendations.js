/**
 * Investment Recommendations Routes
 * API endpoints for AI-powered investment recommendations, robo-advisor, and one-click rebalancing
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { roboAdvisorSettings } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import investmentRecommendationEngine from '../services/investmentRecommendationEngine.js';
import diversificationAnalysisService from '../services/diversificationAnalysisService.js';
import oneClickRebalancingService from '../services/oneClickRebalancingService.js';
import { logInfo } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   POST /api/recommendations/generate
 * @desc    Generate AI-powered investment recommendations
 * @access  Private
 */
router.post('/generate', protect, asyncHandler(async (req, res) => {
    const { portfolioId } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    logInfo(`Generating recommendations for portfolio ${portfolioId}`);
    
    const recommendations = await investmentRecommendationEngine.generateRecommendations(
        tenantId,
        userId,
        portfolioId
    );
    
    res.json(ApiResponse.success(recommendations, 'Recommendations generated successfully'));
}));

/**
 * @route   GET /api/recommendations/active
 * @desc    Get all active recommendations for user
 * @access  Private
 */
router.get('/active', protect, asyncHandler(async (req, res) => {
    const { portfolioId } = req.query;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    const recommendations = await investmentRecommendationEngine.getActiveRecommendations(
        tenantId,
        userId,
        portfolioId
    );
    
    res.json(ApiResponse.success(recommendations));
}));

/**
 * @route   POST /api/recommendations/:id/execute
 * @desc    Execute a specific recommendation
 * @access  Private
 */
router.post('/:id/execute', protect, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    const result = await investmentRecommendationEngine.executeRecommendation(
        tenantId,
        userId,
        parseInt(id)
    );
    
    res.json(ApiResponse.success(result, 'Recommendation executed successfully'));
}));

/**
 * @route   POST /api/recommendations/:id/dismiss
 * @desc    Dismiss a recommendation
 * @access  Private
 */
router.post('/:id/dismiss', protect, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    const result = await investmentRecommendationEngine.dismissRecommendation(
        tenantId,
        userId,
        parseInt(id),
        reason
    );
    
    res.json(ApiResponse.success(result, 'Recommendation dismissed'));
}));

/**
 * @route   GET /api/recommendations/settings
 * @desc    Get robo-advisor settings
 * @access  Private
 */
router.get('/settings', protect, asyncHandler(async (req, res) => {
    const { portfolioId } = req.query;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    const settings = await investmentRecommendationEngine.getRoboSettings(
        tenantId,
        userId,
        parseInt(portfolioId)
    );
    
    res.json(ApiResponse.success(settings));
}));

/**
 * @route   PUT /api/recommendations/settings
 * @desc    Update robo-advisor settings
 * @access  Private
 */
router.put('/settings', protect, asyncHandler(async (req, res) => {
    const { portfolioId, ...settings } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    // Update settings in database
    await db.update(roboAdvisorSettings)
        .set({
            ...settings,
            updatedAt: new Date()
        })
        .where(and(
            eq(roboAdvisorSettings.portfolioId, portfolioId),
            eq(roboAdvisorSettings.userId, userId)
        ));
    
    const updated = await investmentRecommendationEngine.getRoboSettings(
        tenantId,
        userId,
        portfolioId
    );
    
    res.json(ApiResponse.success(updated, 'Settings updated successfully'));
}));

/**
 * @route   POST /api/recommendations/diversification/analyze
 * @desc    Analyze portfolio diversification
 * @access  Private
 */
router.post('/diversification/analyze', protect, asyncHandler(async (req, res) => {
    const { portfolioId } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    const analysis = await diversificationAnalysisService.analyzeDiversification(
        tenantId,
        userId,
        portfolioId
    );
    
    res.json(ApiResponse.success(analysis, 'Diversification analysis complete'));
}));

/**
 * @route   GET /api/recommendations/diversification/latest
 * @desc    Get latest diversification analysis
 * @access  Private
 */
router.get('/diversification/latest', protect, asyncHandler(async (req, res) => {
    const { portfolioId } = req.query;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    const analysis = await diversificationAnalysisService.getLatestAnalysis(
        tenantId,
        userId,
        parseInt(portfolioId)
    );
    
    if (!analysis) {
        return res.status(404).json(ApiResponse.error('No diversification analysis found', 404));
    }
    
    res.json(ApiResponse.success(analysis));
}));

/**
 * @route   GET /api/recommendations/diversification/trend
 * @desc    Get diversification trend over time
 * @access  Private
 */
router.get('/diversification/trend', protect, asyncHandler(async (req, res) => {
    const { portfolioId, months = 6 } = req.query;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    const trend = await diversificationAnalysisService.getDiversificationTrend(
        tenantId,
        userId,
        parseInt(portfolioId),
        parseInt(months)
    );
    
    res.json(ApiResponse.success(trend));
}));

/**
 * @route   POST /api/recommendations/rebalancing/one-click
 * @desc    Execute one-click portfolio rebalancing
 * @access  Private
 */
router.post('/rebalancing/one-click', protect, asyncHandler(async (req, res) => {
    const { portfolioId, options = {} } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    logInfo(`Executing one-click rebalancing for portfolio ${portfolioId}`);
    
    const result = await oneClickRebalancingService.executeOneClickRebalancing(
        tenantId,
        userId,
        portfolioId,
        options
    );
    
    res.json(ApiResponse.success(result, result.message));
}));

/**
 * @route   POST /api/recommendations/rebalancing/preview
 * @desc    Preview rebalancing actions (dry run)
 * @access  Private
 */
router.post('/rebalancing/preview', protect, asyncHandler(async (req, res) => {
    const { portfolioId, options = {} } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    const preview = await oneClickRebalancingService.getRebalancingPreview(
        tenantId,
        userId,
        portfolioId,
        options
    );
    
    res.json(ApiResponse.success(preview));
}));

/**
 * @route   POST /api/recommendations/rebalancing/schedule
 * @desc    Schedule automatic rebalancing
 * @access  Private
 */
router.post('/rebalancing/schedule', protect, asyncHandler(async (req, res) => {
    const { portfolioId, schedule } = req.body;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    if (!schedule) {
        return res.status(400).json(ApiResponse.error('Schedule configuration is required', 400));
    }
    
    const result = await oneClickRebalancingService.scheduleAutomaticRebalancing(
        tenantId,
        userId,
        portfolioId,
        schedule
    );
    
    res.json(ApiResponse.success(result, result.message));
}));

/**
 * @route   GET /api/recommendations/rebalancing/check
 * @desc    Check if portfolio needs rebalancing
 * @access  Private
 */
router.get('/rebalancing/check', protect, asyncHandler(async (req, res) => {
    const { portfolioId, threshold = 5 } = req.query;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    const check = await oneClickRebalancingService.checkRebalancingNeeded(
        tenantId,
        userId,
        parseInt(portfolioId),
        parseFloat(threshold)
    );
    
    res.json(ApiResponse.success(check));
}));

/**
 * @route   GET /api/recommendations/summary
 * @desc    Get comprehensive recommendations summary
 * @access  Private
 */
router.get('/summary', protect, asyncHandler(async (req, res) => {
    const { portfolioId } = req.query;
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    
    if (!portfolioId) {
        return res.status(400).json(ApiResponse.error('Portfolio ID is required', 400));
    }
    
    // Get all recommendation data in parallel
    const [
        recommendations,
        diversification,
        rebalancingCheck,
        settings
    ] = await Promise.all([
        investmentRecommendationEngine.getActiveRecommendations(tenantId, userId, portfolioId),
        diversificationAnalysisService.getLatestAnalysis(tenantId, userId, parseInt(portfolioId)),
        oneClickRebalancingService.checkRebalancingNeeded(tenantId, userId, parseInt(portfolioId)),
        investmentRecommendationEngine.getRoboSettings(tenantId, userId, parseInt(portfolioId))
    ]);
    
    const summary = {
        activeRecommendations: recommendations,
        activeRecommendationsCount: recommendations.length,
        highPriorityCount: recommendations.filter(r => r.priority === 'high').length,
        diversification: diversification ? {
            score: diversification.diversificationScore,
            grade: diversification.diversificationGrade,
            riskLevel: diversification.riskLevel
        } : null,
        rebalancingNeeded: rebalancingCheck.needed,
        rebalancingDrift: rebalancingCheck.driftPercent,
        roboAdvisorEnabled: settings.enabledRecommendations || false,
        autoRebalanceEnabled: settings.autoRebalance || false
    };
    
    res.json(ApiResponse.success(summary));
}));

export default router;
