import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import taxService from '../services/taxService.js';
import harvestEngine from '../services/harvestEngine.js';
import taxLotService from '../services/taxLotService.js';
import reinvestmentService from '../services/reinvestmentService.js';
import { validateTaxDeductionLimit } from '../middleware/taxValidator.js';
import { eq, and, desc } from 'drizzle-orm';
import corporateService from '../services/corporateService.js';
import residencyEngine from '../services/residencyEngine.js';
import { taxNexusMappings, taxLossOpportunities, washSaleViolations, investments } from '../db/schema.js';
import db from '../config/db.js';
import taxScoutAI from '../services/taxScoutAI.js';
import { executeTaxLossSwap } from '../services/investmentService.js';

const router = express.Router();

/**
 * @route   GET /api/tax/scout/scan
 * @desc    Trigger a Predictive Tax-Loss Harvesting scan (L3)
 */
router.get('/scout/scan', protect, asyncHandler(async (req, res) => {
  const opportunities = await taxScoutAI.scanForOpportunities(req.user.id);
  return new ApiResponse(200, opportunities, 'AI scan for harvesting opportunities completed').send(res);
}));

/**
 * @route   GET /api/tax/scout/opportunities
 * @desc    Review proposed tax-loss harvesting swaps
 */
router.get('/scout/opportunities', protect, asyncHandler(async (req, res) => {
  const opportunities = await db.query.taxLossOpportunities.findMany({
    where: and(eq(taxLossOpportunities.userId, req.user.id), eq(taxLossOpportunities.status, 'pending')),
    orderBy: [desc(taxLossOpportunities.unrealizedLoss)]
  });
  return new ApiResponse(200, opportunities).send(res);
}));

/**
 * @route   POST /api/tax/scout/swap
 * @desc    Execute a Tax-Loss Swap (Sell Asset A -> Buy Correlated Asset B)
 */
router.post('/scout/swap', protect, asyncHandler(async (req, res) => {
  const { opportunityId } = req.body;
  const result = await executeTaxLossSwap(req.user.id, opportunityId);
  return new ApiResponse(200, result, 'Swap algorithm executed successfully').send(res);
}));

/**
 * @route   GET /api/tax/scout/violations
 * @desc    Get Global Wash-Sale Prevention Matrix violations
 */
router.get('/scout/violations', protect, asyncHandler(async (req, res) => {
  const violations = await db.query.washSaleViolations.findMany({
    where: eq(washSaleViolations.userId, req.user.id),
    orderBy: [desc(washSaleViolations.violationDate)]
  });
  return new ApiResponse(200, violations).send(res);
}));

/**
 * @route   GET /api/tax/alpha
 * @desc    Get estimated tax savings from active harvesting
 */
router.get('/alpha', protect, asyncHandler(async (req, res) => {
  const alpha = await taxService.calculateTaxAlpha(req.user.id);
  return new ApiResponse(200, alpha, 'Tax alpha calculated').send(res);
}));

/**
 * @route   GET /api/tax/opportunities/scan
 * @desc    Scan for harvesting opportunities (L3)
 */
router.get('/opportunities/scan', protect, asyncHandler(async (req, res) => {
  const { minLoss = 500 } = req.query;
  const opportunities = await harvestEngine.scanOpportunities(req.user.id, parseFloat(minLoss));
  return new ApiResponse(200, opportunities).send(res);
}));

/**
 * @route   POST /api/tax/harvest/execute
 * @desc    Execute loss harvesting (L3)
 */
router.post('/harvest/execute', protect, validateTaxDeductionLimit, asyncHandler(async (req, res) => {
  const { investmentId, lotIds, enableReinvestment = true } = req.body;

  // 1. Execute Harvest
  const harvestLog = await harvestEngine.executeHarvest(req.user.id, investmentId, lotIds);

  // 2. Automated Reinvestment into Proxy (Wash Sale compliant)
  let reinvestmentResult = null;
  if (enableReinvestment && harvestLog.status === 'executed') {
    const investment = await db.query.investments.findFirst({
      where: eq(investments.id, investmentId)
    });

    reinvestmentResult = await reinvestmentService.executeProxyReinvestment(
      req.user.id,
      investment.symbol,
      parseFloat(harvestLog.totalLossRealized) // Reinvesting the sold principal amount
    );

    // Update log with reinvestment info
    await db.update(harvestExecutionLogs)
      .set({ metadata: { ...harvestLog.metadata, reinvestment: reinvestmentResult } })
      .where(eq(harvestExecutionLogs.id, harvestLog.id));
  }

  return new ApiResponse(200, {
    harvestLog,
    reinvestmentResult
  }, 'Tax harvesting executed successfully').send(res);
}));

/**
 * @route   GET /api/tax/history/harvests
 * @desc    Get historical harvest logs
 */
router.get('/history/harvests', protect, asyncHandler(async (req, res) => {
  const history = await db.query.harvestExecutionLogs.findMany({
    where: eq(harvestExecutionLogs.userId, req.user.id),
    orderBy: [desc(harvestExecutionLogs.executionDate)]
  });
  return new ApiResponse(200, history).send(res);
}));

/**
 * @route   GET /api/tax/proxies
 * @desc    Get market proxy mappings
 */
router.get('/proxies', protect, asyncHandler(async (req, res) => {
  const proxies = await db.query.assetProxyMappings.findMany({
    where: eq(assetProxyMappings.isActive, true)
  });
  return new ApiResponse(200, proxies).send(res);
}));

/**
 * @route   POST /api/tax/lots/:id/sell
 * @desc    Simulate/Record a tax-lot specific sale (HIFO Optimization)
 */
router.post('/lots/:id/sell', protect, asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const [lot] = await db.select().from(taxLots).where(and(eq(taxLots.id, req.params.id), eq(taxLots.userId, req.user.id)));

  if (!lot || parseFloat(lot.quantity) < quantity) {
    return res.status(400).json({ success: false, message: 'Invalid lot or quantity' });
  }

  // Logic to mark lot as partially/fully sold
  const updated = await db.update(taxLots)
    .set({
      quantity: (parseFloat(lot.quantity) - quantity).toString(),
      isSold: parseFloat(lot.quantity) - quantity <= 0
    })
    .where(eq(taxLots.id, req.params.id))
    .returning();

  return new ApiResponse(200, updated, 'Tax lot adjusted').send(res);
}));

/**
 * @route   GET /api/tax/corporate/consolidated
 * @desc    Get consolidated corporate tax liability and blended rate
 */
router.get('/corporate/consolidated', protect, asyncHandler(async (req, res) => {
  const data = await corporateService.calculateConsolidatedTaxLiability(req.user.id);
  return new ApiResponse(200, data, 'Consolidated tax liability calculated').send(res);
}));

/**
 * @route   GET /api/tax/nexus/exposure
 * @desc    Get tax nexus exposures across jurisdictions
 */
router.get('/nexus/exposure', protect, asyncHandler(async (req, res) => {
  const exposures = await db.select().from(taxNexusMappings).where(eq(taxNexusMappings.userId, req.user.id));
  return new ApiResponse(200, exposures, 'Nexus exposures retrieved').send(res);
}));

/**
 * @route   POST /api/tax/nexus/override
 * @desc    Override tax rate for a specific nexus jurisdiction
 */
router.post('/nexus/override', protect, asyncHandler(async (req, res) => {
  const { mappingId, rateOverride } = req.body;
  await db.update(taxNexusMappings)
    .set({ taxRateOverride: rateOverride.toString() })
    .where(and(eq(taxNexusMappings.id, mappingId), eq(taxNexusMappings.userId, req.user.id)));
  return new ApiResponse(200, null, 'Tax rate override applied').send(res);
}));

export default router;
