/**
 * Portfolio Rebalancing Routes
 * 
 * Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting
 * 
 * REST API for:
 * - Portfolio analysis and recommendations
 * - Rebalancing execution
 * - Tax-loss harvesting management
 * - Allocation target configuration
 * - Performance analytics
 */

import express from 'express';
import { body, validationResult, param, query } from 'express-validator';
import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import {
  portfolioHoldings,
  allocationTargets,
  rebalancingRecommendations,
  taxLots,
  rebalancingMetrics,
} from '../db/schema.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import portfolioRebalancingService from '../services/portfolioRebalancingService.js';
import taxLossHarvestingEngine from '../services/taxLossHarvestingEngine.js';
import multiCurrencyRebalancingService from '../services/multiCurrencyRebalancingService.js';
import advancedRebalancingOptimizer from '../services/advancedRebalancingOptimizer.js';

const router = express.Router();

/**
 * Middleware: Check ownership of allocation target
 */
const checkAllocationOwnership = asyncHandler(async (req, res, next) => {
  const [target] = await db
    .select()
    .from(allocationTargets)
    .where(
      and(
        eq(allocationTargets.id, req.params.allocationId),
        eq(allocationTargets.userId, req.user.id)
      )
    );

  if (!target) {
    return res.status(404).json({
      success: false,
      message: 'Allocation target not found',
    });
  }

  req.allocation = target;
  next();
});

/**
 * @swagger
 * /portfolio/holdings:
 *   get:
 *     summary: Get current portfolio holdings
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current holdings with valuations
 */
router.get(
  '/holdings',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const holdings = await portfolioRebalancingService.getPortfolioHoldings(
      req.user.id,
      tenantId
    );

    const totalValue = portfolioRebalancingService.calculatePortfolioValue(holdings);
    const allocations = portfolioRebalancingService.calculateAllocations(holdings, totalValue);

    res.json({
      success: true,
      data: {
        holdings,
        summary: {
          totalValue,
          holdingCount: holdings.length,
          allocations,
        },
      },
    });
  })
);

/**
 * @swagger
 * /portfolio/allocations:
 *   get:
 *     summary: Get all allocation targets
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Create new allocation target
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetName:
 *                 type: string
 *               strategy:
 *                 type: string
 *               riskProfile:
 *                 type: string
 *               allocations:
 *                 type: object
 */
router.get(
  '/allocations',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const targets = await db
      .select()
      .from(allocationTargets)
      .where(
        and(
          eq(allocationTargets.userId, req.user.id),
          eq(allocationTargets.tenantId, tenantId)
        )
      );

    res.json({
      success: true,
      data: { targets },
    });
  })
);

router.post(
  '/allocations',
  protect,
  [
    body('targetName').trim().isLength({ min: 3, max: 100 }),
    body('strategy').isIn(['conservative', 'balanced', 'aggressive', 'crypto', 'index-following']),
    body('riskProfile').isIn(['low', 'medium', 'high']),
    body('allocations').isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { targetName, strategy, riskProfile, allocations, rebalancingThreshold, autoRebalance } =
      req.body;
    const { tenantId } = req.user;

    const [newTarget] = await db
      .insert(allocationTargets)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        userId: req.user.id,
        targetName,
        strategy,
        riskProfile,
        allocations,
        rebalancingThreshold: rebalancingThreshold || 0.05,
        autoRebalance: autoRebalance || false,
        taxOptimization: true,
        preferTaxLoss: true,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: { target: newTarget },
    });
  })
);

/**
 * @swagger
 * /portfolio/allocations/{allocationId}/analyze:
 *   get:
 *     summary: Analyze portfolio for rebalancing opportunities
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: allocationId
 *         required: true
 *         schema:
 *           type: string
 */
router.get(
  '/allocations/:allocationId/analyze',
  protect,
  checkAllocationOwnership,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const recommendation = await portfolioRebalancingService.analyzePortfolioAndRecommend(
      req.user.id,
      tenantId,
      req.allocation.id
    );

    if (!recommendation) {
      return res.json({
        success: true,
        message: 'Portfolio is within acceptable variance bounds',
        data: null,
      });
    }

    res.json({
      success: true,
      data: { recommendation },
    });
  })
);

/**
 * @swagger
 * /portfolio/recommendations:
 *   get:
 *     summary: Get all rebalancing recommendations
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/recommendations',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { status, limit = 20 } = req.query;

    let query = db.select().from(rebalancingRecommendations).where(
      and(
        eq(rebalancingRecommendations.userId, req.user.id),
        eq(rebalancingRecommendations.tenantId, tenantId)
      )
    );

    if (status) {
      query = query.where(eq(rebalancingRecommendations.status, status));
    }

    const recommendations = await query.limit(parseInt(limit));

    res.json({
      success: true,
      data: { recommendations },
    });
  })
);

/**
 * @swagger
 * /portfolio/recommendations/{recommendationId}/execute:
 *   post:
 *     summary: Execute a rebalancing recommendation
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/recommendations/:recommendationId/execute',
  protect,
  [body('approvalNotes').optional().trim()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { tenantId } = req.user;
    const { approvalNotes } = req.body;

    const result = await portfolioRebalancingService.executeRebalancing(
      req.params.recommendationId,
      req.user.id,
      tenantId,
      approvalNotes
    );

    res.json({
      success: true,
      message: 'Rebalancing executed successfully',
      data: result,
    });
  })
);

/**
 * @swagger
 * /portfolio/tax-summary:
 *   get:
 *     summary: Get tax optimization summary
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/tax-summary',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const summary = await portfolioRebalancingService.getTaxOptimizationSummary(
      req.user.id,
      tenantId
    );

    res.json({
      success: true,
      data: { summary },
    });
  })
);

/**
 * @swagger
 * /portfolio/tax-lots:
 *   get:
 *     summary: Get tax lots (specific asset purchases for tax tracking)
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/tax-lots',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { assetSymbol, harvestable } = req.query;

    let query = db.select().from(taxLots).where(
      and(
        eq(taxLots.userId, req.user.id),
        eq(taxLots.tenantId, tenantId)
      )
    );

    if (assetSymbol) {
      query = query.where(eq(taxLots.assetSymbol, assetSymbol));
    }

    if (harvestable === 'true') {
      query = query.where(eq(taxLots.canBeHarvested, true));
    }

    const lots = await query;

    res.json({
      success: true,
      data: { lots },
    });
  })
);

/**
 * @swagger
 * /portfolio/history:
 *   get:
 *     summary: Get rebalancing transaction history
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/history',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { limit = 20 } = req.query;

    const history = await portfolioRebalancingService.getRebalancingHistory(
      req.user.id,
      tenantId,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { history },
    });
  })
);

/**
 * @swagger
 * /portfolio/analytics:
 *   get:
 *     summary: Get portfolio analytics and metrics
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/analytics',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { allocationId, periodType = 'monthly' } = req.query;

    if (!allocationId) {
      return res.status(400).json({
        success: false,
        message: 'allocationId is required',
      });
    }

    const analytics = await portfolioRebalancingService.getPortfolioAnalytics(
      req.user.id,
      tenantId,
      allocationId,
      periodType
    );

    res.json({
      success: true,
      data: { analytics },
    });
  })
);

/**
 * @swagger
 * /portfolio/allocations/{allocationId}:
 *   get:
 *     summary: Get specific allocation target
 *   patch:
 *     summary: Update allocation target
 *   delete:
 *     summary: Delete allocation target
 */
router.get(
  '/allocations/:allocationId',
  protect,
  checkAllocationOwnership,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: { allocation: req.allocation },
    });
  })
);

router.patch(
  '/allocations/:allocationId',
  protect,
  checkAllocationOwnership,
  asyncHandler(async (req, res) => {
    const { targetName, allocations, rebalancingThreshold, autoRebalance } = req.body;

    const [updated] = await db
      .update(allocationTargets)
      .set({
        ...(targetName && { targetName }),
        ...(allocations && { allocations }),
        ...(rebalancingThreshold !== undefined && { rebalancingThreshold }),
        ...(autoRebalance !== undefined && { autoRebalance }),
        updatedAt: new Date(),
      })
      .where(eq(allocationTargets.id, req.allocation.id))
      .returning();

    res.json({
      success: true,
      data: { allocation: updated },
    });
  })
);

router.delete(
  '/allocations/:allocationId',
  protect,
  checkAllocationOwnership,
  asyncHandler(async (req, res) => {
    await db
      .update(allocationTargets)
      .set({ isActive: false })
      .where(eq(allocationTargets.id, req.allocation.id));

    res.json({
      success: true,
      message: 'Allocation target deleted',
    });
  })
);

/**
 * TAX-LOSS HARVESTING ENDPOINTS
 */

/**
 * @swagger
 * /portfolio/harvesting/opportunities:
 *   get:
 *     summary: Get tax-loss harvesting opportunities
 *     tags: [Tax Harvesting]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/harvesting/opportunities',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const opportunities = await taxLossHarvestingEngine.findHarvestingOpportunities(
      req.user.id,
      tenantId
    );

    res.json({
      success: true,
      data: { 
        opportunities,
        totalHarvestable: opportunities.reduce((sum, op) => sum + op.harvestValue, 0),
        opportunityCount: opportunities.length,
      },
    });
  })
);

/**
 * @swagger
 * /portfolio/harvesting/year-end-strategy:
 *   get:
 *     summary: Get year-end tax harvesting strategy
 *     tags: [Tax Harvesting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: taxBracket
 *         schema:
 *           type: number
 *         description: Tax bracket (0.37 by default)
 */
router.get(
  '/harvesting/year-end-strategy',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { taxBracket = 0.35 } = req.query;

    const strategy = await taxLossHarvestingEngine.calculateYearEndStrategy(
      req.user.id,
      tenantId,
      parseFloat(taxBracket)
    );

    res.json({
      success: true,
      data: { strategy },
    });
  })
);

/**
 * @swagger
 * /portfolio/harvesting/carryforward:
 *   get:
 *     summary: Get capital loss carryforward amount
 *     tags: [Tax Harvesting]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/harvesting/carryforward',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { year } = req.query;

    const carryforward = await taxLossHarvestingEngine.getCapitalLossCarryforward(
      req.user.id,
      tenantId,
      year ? parseInt(year) : new Date().getFullYear()
    );

    res.json({
      success: true,
      data: { carryforward },
    });
  })
);

/**
 * @swagger
 * /portfolio/harvesting/wash-sale-check:
 *   post:
 *     summary: Check wash-sale compliance for a trade
 *     tags: [Tax Harvesting]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/harvesting/wash-sale-check',
  protect,
  [
    body('assetSymbol').trim().isLength({ min: 1 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { tenantId } = req.user;
    const { assetSymbol, saleDate } = req.body;

    const compliance = await taxLossHarvestingEngine.checkWashSaleCompliance(
      req.user.id,
      tenantId,
      assetSymbol,
      new Date(saleDate || Date.now())
    );

    res.json({
      success: true,
      data: { compliance },
    });
  })
);

/**
 * @swagger
 * /portfolio/harvesting/tax-lot/:lotId/implications:
 *   get:
 *     summary: Get tax implications for specific tax lot
 *     tags: [Tax Harvesting]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/harvesting/tax-lot/:lotId/implications',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const implications = await taxLossHarvestingEngine.getTaxLotTaxImplications(
      req.user.id,
      tenantId,
      req.params.lotId
    );

    res.json({
      success: true,
      data: { implications },
    });
  })
);

/**
 * MULTI-CURRENCY ENDPOINTS
 */

/**
 * @swagger
 * /portfolio/multi-currency/analysis:
 *   get:
 *     summary: Analyze portfolio in multiple currencies
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: baseCurrency
 *         schema:
 *           type: string
 *         description: Base currency for analysis (USD by default)
 */
router.get(
  '/multi-currency/analysis',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { baseCurrency = 'USD' } = req.query;

    const analysis = await multiCurrencyRebalancingService.analyzeMultiCurrencyPortfolio(
      req.user.id,
      tenantId,
      baseCurrency
    );

    res.json({
      success: true,
      data: { analysis },
    });
  })
);

/**
 * @swagger
 * /portfolio/multi-currency/exposure:
 *   get:
 *     summary: Get currency exposure summary
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/multi-currency/exposure',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;

    const exposure = await multiCurrencyRebalancingService.getCurrencyExposure(
      req.user.id,
      tenantId
    );

    res.json({
      success: true,
      data: { exposure },
    });
  })
);

/**
 * @swagger
 * /portfolio/multi-currency/hedging-strategy:
 *   get:
 *     summary: Get currency hedging recommendations
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/multi-currency/hedging-strategy',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { baseCurrency = 'USD' } = req.query;

    const strategy = await multiCurrencyRebalancingService.recommendHedgingStrategy(
      req.user.id,
      tenantId,
      baseCurrency
    );

    res.json({
      success: true,
      data: { strategy },
    });
  })
);

/**
 * @swagger
 * /portfolio/multi-currency/optimize-conversion:
 *   post:
 *     summary: Find optimal currency conversion path
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/multi-currency/optimize-conversion',
  protect,
  [
    body('fromCurrency').trim().isLength({ min: 3, max: 3 }),
    body('toCurrency').trim().isLength({ min: 3, max: 3 }),
    body('amount').isFloat({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { fromCurrency, toCurrency, amount } = req.body;

    const optimization = await multiCurrencyRebalancingService.optimizeCurrencyConversion(
      fromCurrency,
      toCurrency,
      parseFloat(amount)
    );

    res.json({
      success: true,
      data: { optimization },
    });
  })
);

/**
 * ADVANCED OPTIMIZATION ENDPOINTS
 */

/**
 * @swagger
 * /portfolio/optimization/scenarios:
 *   post:
 *     summary: Generate alternative rebalancing scenarios
 *     tags: [Optimization]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/optimization/scenarios',
  protect,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const { allocationId } = req.body;

    if (!allocationId) {
      return res.status(400).json({
        success: false,
        message: 'allocationId is required',
      });
    }

    // Get allocation target
    const [target] = await db
      .select()
      .from(allocationTargets)
      .where(
        and(
          eq(allocationTargets.id, allocationId),
          eq(allocationTargets.userId, req.user.id)
        )
      );

    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Allocation target not found',
      });
    }

    // Get current portfolio
    const holdings = await portfolioRebalancingService.getPortfolioHoldings(
      req.user.id,
      tenantId
    );
    const portfolioValue = portfolioRebalancingService.calculatePortfolioValue(holdings);
    const currentAllocations = portfolioRebalancingService.calculateAllocations(holdings, portfolioValue);
    const targetAllocations = portfolioRebalancingService.parseTargetAllocations(
      target.allocations,
      portfolioValue
    );

    const scenarios = advancedRebalancingOptimizer.generateAlternativeScenarios(
      currentAllocations,
      targetAllocations
    );

    res.json({
      success: true,
      data: { scenarios },
    });
  })
);

/**
 * @swagger
 * /portfolio/optimization/validate-moves:
 *   post:
 *     summary: Validate proposed rebalancing moves
 *     tags: [Optimization]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/optimization/validate-moves',
  protect,
  [
    body('moves').isArray(),
    body('constraints').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { tenantId } = req.user;
    const { moves, constraints = {} } = req.body;

    // Get current portfolio
    const holdings = await portfolioRebalancingService.getPortfolioHoldings(
      req.user.id,
      tenantId
    );
    const portfolioValue = portfolioRebalancingService.calculatePortfolioValue(holdings);
    const allocations = portfolioRebalancingService.calculateAllocations(holdings, portfolioValue);

    const validation = advancedRebalancingOptimizer.validateMoves(
      moves,
      allocations,
      constraints
    );

    res.json({
      success: validation.valid,
      data: { validation },
    });
  })
);

/**
 * @swagger
 * /portfolio/optimization/efficiency:
 *   post:
 *     summary: Calculate rebalancing efficiency score
 *     tags: [Optimization]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/optimization/efficiency',
  protect,
  [
    body('allocationId').trim().isUUID(),
    body('moves').isArray(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { tenantId } = req.user;
    const { allocationId, moves } = req.body;

    // Get allocation target
    const [target] = await db
      .select()
      .from(allocationTargets)
      .where(
        and(
          eq(allocationTargets.id, allocationId),
          eq(allocationTargets.userId, req.user.id)
        )
      );

    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Allocation target not found',
      });
    }

    // Get current portfolio
    const holdings = await portfolioRebalancingService.getPortfolioHoldings(
      req.user.id,
      tenantId
    );
    const portfolioValue = portfolioRebalancingService.calculatePortfolioValue(holdings);
    const currentAllocations = portfolioRebalancingService.calculateAllocations(holdings, portfolioValue);
    const targetAllocations = portfolioRebalancingService.parseTargetAllocations(
      target.allocations,
      portfolioValue
    );

    const efficiency = advancedRebalancingOptimizer.calculateEfficiencyScore(
      currentAllocations,
      targetAllocations,
      moves,
      moves
    );

    res.json({
      success: true,
      data: { efficiency },
    });
  })
);

export default router;
