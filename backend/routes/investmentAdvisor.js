import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import investmentAdvisorService from '../services/investmentAdvisorService.js';
import riskProfileService from '../services/riskProfileService.js';
import portfolioService from '../services/portfolioService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * @route GET /api/investments/advisor/recommendations
 * @desc Get personalized investment recommendations
 * @access Private
 */
router.get('/recommendations', [
  query('portfolioId').optional().isUUID(),
  query('limit').optional().isInt({ min: 1, max: 20 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { portfolioId, limit } = req.query;
    
    const recommendations = await investmentAdvisorService.getPersonalizedRecommendations(
      req.user.id,
      portfolioId,
      parseInt(limit) || 10
    );

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
    });
  }
});

/**
 * @route GET /api/investments/advisor/portfolio-analysis
 * @desc Get comprehensive portfolio analysis
 * @access Private
 */
router.get('/portfolio-analysis', [
  query('portfolioId').optional().isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { portfolioId } = req.query;
    
    const analysis = await investmentAdvisorService.analyzePortfolio(req.user.id, portfolioId);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Error fetching portfolio analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio analysis',
    });
  }
});

/**
 * @route GET /api/investments/advisor/risk-profile
 * @desc Get user's risk profile
 * @access Private
 */
router.get('/risk-profile', async (req, res) => {
  try {
    const riskProfile = await riskProfileService.getRiskProfileWithAnalysis(req.user.id);

    res.json({
      success: true,
      data: riskProfile,
    });
  } catch (error) {
    console.error('Error fetching risk profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch risk profile',
    });
  }
});

/**
 * @route POST /api/investments/advisor/risk-profile
 * @desc Create or update user's risk profile
 * @access Private
 */
router.post('/risk-profile', [
  body('age').optional().isInt({ min: 18, max: 100 }),
  body('investmentExperience').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('investmentHorizon').optional().isIn(['short', 'medium', 'long']),
  body('incomeStability').optional().isIn(['very_stable', 'stable', 'variable']),
  body('emergencyFundMonths').optional().isInt({ min: 0 }),
  body('annualIncome').optional().isFloat({ min: 0 }),
  body('netWorth').optional().isFloat({ min: 0 }),
  body('debtAmount').optional().isFloat({ min: 0 }),
  body('canAffordLosses').optional().isBoolean(),
  body('understandsMarketVolatility').optional().isBoolean(),
  body('primaryGoal').optional().isIn(['growth', 'income', 'preservation', 'balanced']),
  body('hasDependents').optional().isBoolean(),
  body('retirementAge').optional().isInt({ min: 40, max: 80 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const profile = await riskProfileService.createOrUpdateRiskProfile(req.user.id, req.body);

    res.json({
      success: true,
      message: 'Risk profile updated successfully',
      data: profile,
    });
  } catch (error) {
    console.error('Error updating risk profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update risk profile',
    });
  }
});

/**
 * @route GET /api/investments/advisor/risk-assessment/questions
 * @desc Get risk assessment questions
 * @access Private
 */
router.get('/risk-assessment/questions', async (req, res) => {
  try {
    const questions = riskProfileService.getRiskAssessmentQuestions();

    res.json({
      success: true,
      data: questions,
    });
  } catch (error) {
    console.error('Error fetching risk assessment questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch risk assessment questions',
    });
  }
});

/**
 * @route POST /api/investments/advisor/risk-assessment/calculate
 * @desc Calculate risk score without saving
 * @access Private
 */
router.post('/risk-assessment/calculate', [
  body('age').optional().isInt({ min: 18, max: 100 }),
  body('investmentExperience').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('investmentHorizon').optional().isIn(['short', 'medium', 'long']),
  body('incomeStability').optional().isIn(['very_stable', 'stable', 'variable']),
  body('emergencyFundMonths').optional().isInt({ min: 0 }),
  body('annualIncome').optional().isFloat({ min: 0 }),
  body('netWorth').optional().isFloat({ min: 0 }),
  body('debtAmount').optional().isFloat({ min: 0 }),
  body('canAffordLosses').optional().isBoolean(),
  body('understandsMarketVolatility').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const riskAnalysis = riskProfileService.calculateRiskScore(req.body);

    res.json({
      success: true,
      data: riskAnalysis,
    });
  } catch (error) {
    console.error('Error calculating risk score:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate risk score',
    });
  }
});

/**
 * @route POST /api/investments/advisor/compare-allocation
 * @desc Compare current allocation with recommended
 * @access Private
 */
router.post('/compare-allocation', [
  body('allocation').isObject(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { allocation } = req.body;
    
    const comparison = await riskProfileService.compareWithRecommendedAllocation(
      req.user.id,
      allocation
    );

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error('Error comparing allocations:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to compare allocations',
    });
  }
});

/**
 * @route GET /api/investments/advisor/market-insights
 * @desc Get current market insights
 * @access Private
 */
router.get('/market-insights', async (req, res) => {
  try {
    const insights = await investmentAdvisorService.getMarketInsights();

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    console.error('Error fetching market insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch market insights',
    });
  }
});

export default router;
