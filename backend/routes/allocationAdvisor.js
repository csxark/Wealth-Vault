/**
 * Asset Allocation Advisor API Routes
 * Issue #691: AI-Powered Smart Asset Allocation Advisor
 * 
 * Endpoints:
 * - GET  /api/advisor/profile              - User risk profile & financial capacity
 * - GET  /api/advisor/recommendation       - Personalized allocation recommendation
 * - GET  /api/advisor/glide-path           - Target-date glide path projections
 * - GET  /api/advisor/strategies           - Compare alternative strategies
 * - POST /api/advisor/rebalancing-needs    - Check rebalancing needs
 * - POST /api/advisor/education            - Get educational content based on profile
 */

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import userProfilingService from '../services/userProfilingService.js';
import allocationAdvisorService from '../services/allocationAdvisorService.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import AppError from '../utils/AppError.js';

const router = express.Router();

/**
 * @route   GET /api/advisor/profile
 * @desc    Get user's risk profile and financial capacity
 * @access  Private
 */
router.get('/profile', protect, asyncHandler(async (req, res) => {
    const riskProfile = await userProfilingService.getRiskTolerance(req.user.id);
    const capacity = await userProfilingService.getFinancialCapacity(req.user.id);
    const timeline = await userProfilingService.estimateRetirementTimeline(req.user.id);

    new ApiResponse(200, {
        riskProfile,
        capacity,
        timeline
    }, 'Risk profile calculated successfully').send(res);
}));

/**
 * @route   GET /api/advisor/recommendation
 * @desc    Get personalized asset allocation recommendation
 * @query   ?retirementAge=67&goals=[{yearsToGoal:5,priority:high}]
 * @access  Private
 */
router.get('/recommendation', protect, asyncHandler(async (req, res) => {
    const retirementAge = req.query.retirementAge ? parseInt(req.query.retirementAge) : 67;
    const goals = req.query.goals ? JSON.parse(req.query.goals) : [];

    const recommendation = await allocationAdvisorService.generateAllocationRecommendation(
        req.user.id,
        { retirementAge, goals }
    );

    new ApiResponse(200, recommendation, 'Allocation recommendation generated').send(res);
}));

/**
 * @route   GET /api/advisor/recommendation/ml
 * @desc    Get ML-style allocation recommendation
 * @query   ?retirementAge=67&marketVolatilityRegime=neutral&goalPriorityBias=balanced
 * @access  Private
 */
router.get('/recommendation/ml', protect, asyncHandler(async (req, res) => {
    const retirementAge = req.query.retirementAge ? parseInt(req.query.retirementAge) : 67;
    const marketVolatilityRegime = req.query.marketVolatilityRegime || 'neutral';
    const goalPriorityBias = req.query.goalPriorityBias || 'balanced';

    const recommendation = await allocationAdvisorService.generateMLAllocationRecommendation(
        req.user.id,
        { retirementAge, marketVolatilityRegime, goalPriorityBias }
    );

    new ApiResponse(200, recommendation, 'ML allocation recommendation generated').send(res);
}));

/**
 * @route   GET /api/advisor/glide-path
 * @desc    Get target-date glide path (30-year projection)
 * @query   ?retirementAge=67&targetType=glidePathModerate
 * @access  Private
 */
router.get('/glide-path', protect, asyncHandler(async (req, res) => {
    const retirementAge = req.query.retirementAge ? parseInt(req.query.retirementAge) : 67;
    const targetType = req.query.targetType || 'glidePathModerate';

    const glidePath = await allocationAdvisorService.generateGlidePath(
        req.user.id,
        { retirementAge, targetType }
    );

    new ApiResponse(200, glidePath, 'Glide path generated').send(res);
}));

/**
 * @route   GET /api/advisor/glide-path/dynamic
 * @desc    Get dynamic glide path adjusted for regime assumptions
 * @query   ?retirementAge=67&marketVolatilityRegime=neutral&inflationPressure=moderate
 * @access  Private
 */
router.get('/glide-path/dynamic', protect, asyncHandler(async (req, res) => {
    const retirementAge = req.query.retirementAge ? parseInt(req.query.retirementAge) : 67;
    const marketVolatilityRegime = req.query.marketVolatilityRegime || 'neutral';
    const inflationPressure = req.query.inflationPressure || 'moderate';

    const glidePath = await allocationAdvisorService.generateDynamicGlidePath(
        req.user.id,
        { retirementAge, marketVolatilityRegime, inflationPressure }
    );

    new ApiResponse(200, glidePath, 'Dynamic glide path generated').send(res);
}));

/**
 * @route   GET /api/advisor/strategies
 * @desc    Compare multiple allocation strategies
 * @query   ?retirementAge=67
 * @access  Private
 */
router.get('/strategies', protect, asyncHandler(async (req, res) => {
    const retirementAge = req.query.retirementAge ? parseInt(req.query.retirementAge) : 67;

    const comparison = await allocationAdvisorService.compareStrategies(
        req.user.id,
        { retirementAge }
    );

    new ApiResponse(200, comparison, 'Strategy comparison generated').send(res);
}));

/**
 * @route   POST /api/advisor/rebalancing-needs
 * @desc    Check rebalancing needs given current allocation
 * @body    { currentAllocation: {stocks: 60, bonds: 40}, targetAllocation?: {...} }
 * @access  Private
 */
router.post('/rebalancing-needs', protect, [
    body('currentAllocation').isObject().notEmpty(),
    body('targetAllocation').optional().isObject()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { currentAllocation, targetAllocation } = req.body;

    const rebalancing = await allocationAdvisorService.getRebalancingNeeds(
        req.user.id,
        currentAllocation,
        targetAllocation
    );

    new ApiResponse(200, rebalancing, 'Rebalancing analysis complete').send(res);
}));

/**
 * @route   POST /api/advisor/drift-analysis
 * @desc    Analyze allocation drift against target recommendation
 * @body    { currentAllocation: {...}, targetAllocation?: {...}, threshold?: number }
 * @access  Private
 */
router.post('/drift-analysis', protect, [
    body('currentAllocation').isObject().notEmpty(),
    body('targetAllocation').optional().isObject(),
    body('threshold').optional().isFloat({ min: 1, max: 25 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { currentAllocation, targetAllocation, threshold } = req.body;
    const result = await allocationAdvisorService.analyzeDrift(req.user.id, currentAllocation, {
        targetAllocation,
        threshold
    });

    new ApiResponse(200, result, 'Drift analysis complete').send(res);
}));

/**
 * @route   POST /api/advisor/rebalance-preview
 * @desc    Preview expected impact before portfolio rebalancing
 * @body    { currentAllocation: {...}, targetAllocation?: {...}, threshold?: number, marketVolatilityRegime?: string, goalPriorityBias?: string }
 * @access  Private
 */
router.post('/rebalance-preview', protect, [
    body('currentAllocation').isObject().notEmpty(),
    body('targetAllocation').optional().isObject(),
    body('threshold').optional().isFloat({ min: 1, max: 25 }),
    body('marketVolatilityRegime').optional().isString(),
    body('goalPriorityBias').optional().isString()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { currentAllocation, targetAllocation, threshold, marketVolatilityRegime, goalPriorityBias } = req.body;

    const preview = await allocationAdvisorService.generateRebalancePreview(req.user.id, currentAllocation, {
        targetAllocation,
        threshold,
        marketVolatilityRegime,
        goalPriorityBias
    });

    new ApiResponse(200, preview, 'Rebalance preview generated').send(res);
}));

/**
 * @route   POST /api/advisor/education
 * @desc    Get personalized educational content based on risk profile
 * @body    { topic?: 'asset-allocation' | 'bond-investing' | 'diversification' | 'rebalancing' }
 * @access  Private
 */
router.post('/education', protect, [
    body('topic').optional().isString()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const topic = req.body.topic || 'asset-allocation';
    const riskProfile = await userProfilingService.getRiskTolerance(req.user.id);

    // Generate personalized content
    const content = _generateEducationalContent(topic, riskProfile);

    new ApiResponse(200, content, 'Educational content generated').send(res);
}));

/**
 * @route   GET /api/advisor/risk-factors
 * @desc    Detailed breakdown of risk score components
 * @access  Private
 */
router.get('/risk-factors', protect, asyncHandler(async (req, res) => {
    const riskProfile = await userProfilingService.calculateRiskScore(req.user.id);

    new ApiResponse(200, {
        riskScore: riskProfile.riskScore,
        components: riskProfile.components,
        weights: riskProfile.weights,
        profile: riskProfile.profile,
        interpretation: _interpretRiskFactors(riskProfile)
    }, 'Risk factors detailed').send(res);
}));

/**
 * @route   GET /api/advisor/scenario
 * @desc    Model "what-if" scenarios with different parameters
 * @query   ?monthlyIncome=5000&yearsToRetirement=20&riskFactor=1.1
 * @access  Private
 */
router.get('/scenario', protect, asyncHandler(async (req, res) => {
    const baseRecommendation = await allocationAdvisorService.generateAllocationRecommendation(req.user.id);
    
    // Parse scenario parameters
    const scenarios = [];

    // Scenario 1: More aggressive (if user allows)
    scenarios.push({
        name: 'More Aggressive (Higher Growth)',
        description: 'Increased stock allocation for potentially higher returns',
        allocation: {
            stocks: Math.min(95, baseRecommendation.recommendedAllocation.stocks + 10),
            bonds: Math.max(0, baseRecommendation.recommendedAllocation.bonds - 8),
            alternatives: baseRecommendation.recommendedAllocation.alternatives,
            cash: Math.max(0, baseRecommendation.recommendedAllocation.cash - 2)
        }
    });

    // Scenario 2: More conservative (lower risk)
    scenarios.push({
        name: 'More Conservative (Lower Risk)',
        description: 'Increased bond allocation for capital preservation',
        allocation: {
            stocks: Math.max(10, baseRecommendation.recommendedAllocation.stocks - 10),
            bonds: Math.min(90, baseRecommendation.recommendedAllocation.bonds + 8),
            alternatives: baseRecommendation.recommendedAllocation.alternatives,
            cash: baseRecommendation.recommendedAllocation.cash + 2
        }
    });

    // Scenario 3: Earn target scenario
    scenarios.push({
        name: 'Target Return (6% annually)',
        description: 'Balanced portfolio targeting 6% annual return',
        allocation: baseRecommendation.recommendedAllocation
    });

    // Normalize and calculate metrics
    const scenarioResults = scenarios.map(scenario => {
        const alloc = scenario.allocation;
        const total = Object.values(alloc).reduce((sum, val) => sum + val, 0);
        
        // Normalize if needed
        if (total !== 100) {
            for (const key in alloc) {
                alloc[key] = parseFloat((alloc[key] / total * 100).toFixed(2));
            }
        }

        return {
            ...scenario,
            expectedReturn: _calculateExpectedReturn(alloc),
            volatility: _calculateVolatility(alloc)
        };
    });

    new ApiResponse(200, {
        baseRecommendation: baseRecommendation.recommendedAllocation,
        scenarios: scenarioResults
    }, 'Scenario analysis complete').send(res);
}));

// ====== PRIVATE HELPER FUNCTIONS ======

/**
 * Generate personalized educational content
 */
function _generateEducationalContent(topic, riskProfile) {
    const contents = {
        'asset-allocation': {
            title: 'Understanding Asset Allocation',
            description: 'Learn how to distribute your investments across different asset classes',
            sections: [
                {
                    heading: 'What is Asset Allocation?',
                    content: 'Asset allocation is the process of dividing your investment portfolio among different asset categories such as stocks, bonds, and cash. The goal is to balance risk and reward based on your goals and risk tolerance.'
                },
                {
                    heading: 'Your Recommended Allocation',
                    content: `Based on your risk profile (${riskProfile.level}), we recommend: ${_formatAllocation(riskProfile.recommendations)}`,
                    recommendation: riskProfile.recommendations
                },
                {
                    heading: 'Why This Matters',
                    content: 'Over the long term, your asset allocation will have more impact on your returns than individual stock picks. A well-balanced portfolio that matches your risk tolerance can help you achieve your financial goals.'
                }
            ]
        },
        'bond-investing': {
            title: 'Introduction to Bond Investing',
            description: 'Learn how bonds can provide income and stability to your portfolio',
            sections: [
                {
                    heading: 'Types of Bonds',
                    content: 'Government bonds (safest), corporate bonds (medium risk), and high-yield bonds (higher risk/return). Your allocation includes bonds to balance equity risk.'
                },
                {
                    heading: 'Bond Returns',
                    content: 'Bonds typically provide lower returns than stocks but with less volatility. They also provide income through interest payments.'
                },
                {
                    heading: 'When to Buy Bonds',
                    content: 'Bonds become more important as you approach retirement or when you want to reduce portfolio volatility.'
                }
            ]
        },
        'diversification': {
            title: 'The Power of Diversification',
            description: 'Learn why spreading investments across asset classes is crucial',
            sections: [
                {
                    heading: 'What is Diversification?',
                    content: 'Diversification means not putting all your eggs in one basket. By investing across different asset types, sectors, and geographies, you reduce the impact of any single investment underperforming.'
                },
                {
                    heading: 'Your Diversification',
                    content: `Your recommended allocation includes stocks (growth), bonds (stability), alternatives (diversification), and cash (liquidity).`
                },
                {
                    heading: 'Risk Reduction',
                    content: 'A diversified portfolio typically experiences smaller losses during market downturns and more stable long-term returns.'
                }
            ]
        },
        'rebalancing': {
            title: 'The Importance of Rebalancing',
            description: 'Keep your portfolio aligned with your goals through regular rebalancing',
            sections: [
                {
                    heading: 'What is Rebalancing?',
                    content: 'Rebalancing means adjusting your portfolio back to your target allocation. Over time, some investments may outperform others, causing your allocation to drift.'
                },
                {
                    heading: 'When to Rebalance',
                    content: 'Experts recommend rebalancing annually, or when any asset class drifts >5% from target. This discipline forces you to buy low and sell high.'
                },
                {
                    heading: 'Your Rebalancing Schedule',
                    content: 'For your profile, we recommend annual rebalancing or when any asset drifts >10% from target.'
                }
            ]
        }
    };

    return contents[topic] || contents['asset-allocation'];
}

/**
 * Format allocation as readable string
 */
function _formatAllocation(alloc) {
    const parts = [];
    if (alloc.stocks) parts.push(`${alloc.stocks.target}% Stocks`);
    if (alloc.bonds) parts.push(`${alloc.bonds.target}% Bonds`);
    if (alloc.alternatives) parts.push(`${alloc.alternatives.target}% Alternatives`);
    if (alloc.cash) parts.push(`${alloc.cash.target}% Cash`);
    return parts.join(', ');
}

/**
 * Interpret risk factors
 */
function _interpretRiskFactors(riskProfile) {
    const interpretations = [];

    const ageScore = riskProfile.components.age;
    if (ageScore >= 80) {
        interpretations.push('Age Factor: Young investor with many earning years ahead - can accept higher volatility');
    } else if (ageScore >= 50) {
        interpretations.push('Age Factor: Mid-career investor with moderate time horizon');
    } else {
        interpretations.push('Age Factor: Approaching retirement - prioritizing capital preservation');
    }

    const incomeScore = riskProfile.components.incomeCapacity;
    if (incomeScore >= 80) {
        interpretations.push('Income: Strong earning power allows for higher investment risk');
    } else if (incomeScore >= 50) {
        interpretations.push('Income: Adequate capacity to invest regularly');
    } else {
        interpretations.push('Income: Limited capacity for risk - focus on steady growth');
    }

    return {
        riskScore: riskProfile.riskScore,
        level: riskProfile.level,
        interpretations,
        overallMessage: `Your risk score of ${riskProfile.riskScore} suggests a ${riskProfile.level} investment approach.`
    };
}

/**
 * Calculate expected return (copied from service for convenience)
 */
function _calculateExpectedReturn(allocation) {
    const returns = {
        stocks: 0.10,
        bonds: 0.04,
        alternatives: 0.06,
        cash: 0.02
    };

    let expectedReturn = 0;
    for (const [asset, weight] of Object.entries(allocation)) {
        expectedReturn += (weight / 100) * (returns[asset] || 0);
    }

    return parseFloat((expectedReturn * 100).toFixed(2));
}

/**
 * Calculate volatility (copied from service for convenience)
 */
function _calculateVolatility(allocation) {
    const volatilities = {
        stocks: 0.15,
        bonds: 0.05,
        alternatives: 0.08,
        cash: 0.01
    };

    let volatility = 0;
    for (const [asset, weight] of Object.entries(allocation)) {
        volatility += (weight / 100) * (volatilities[asset] || 0);
    }

    return parseFloat((volatility * 100).toFixed(2));
}

export default router;
