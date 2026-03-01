import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import taxService from '../services/taxService.js';
import harvestEngine from '../services/harvestEngine.js';
import taxLotService from '../services/taxLotService.js';
import reinvestmentService from '../services/reinvestmentService.js';
import { validateTaxDeductionLimit } from '../middleware/taxValidator.js';
import { taxGuard } from '../middleware/taxGuard.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import corporateService from '../services/corporateService.js';
import residencyEngine from '../services/residencyEngine.js';
import { taxNexusMappings, taxLossOpportunities, washSaleViolations, investments, taxLotHistory, harvestExecutionLogs, assetProxyMappings } from '../db/schema.js';
import db from '../config/db.js';
import taxScoutAI from '../services/taxScoutAI.js';
import { executeTaxLossSwap } from '../services/investmentService.js';
import { findLotDiscrepancies } from '../utils/taxMath.js';

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
 * @desc    Execute loss harvesting with Wash-Sale Shield (#460)
 */
router.post('/harvest/execute', protect, validateTaxDeductionLimit, taxGuard, asyncHandler(async (req, res) => {
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
      parseFloat(harvestLog.totalLossRealized)
    );

    // Update log with reinvestment info
    await db.update(harvestExecutionLogs)
      .set({ metadata: { ...harvestLog.metadata, reinvestment: reinvestmentResult, washSaleAnalysis: req.washSaleAnalysis } })
      .where(eq(harvestExecutionLogs.id, harvestLog.id));
  }

  const response = {
    harvestLog,
    reinvestmentResult,
    washSaleAnalysis: req.washSaleAnalysis
  };

  if (req.washSaleWarning) {
    response.warning = "Partial wash-sale disallowance applied to this harvest.";
  }

  return new ApiResponse(200, response, 'Tax harvesting executed successfully').send(res);
}));

/**
 * @route   GET /api/tax/history/harvests
 */
router.get('/history/harvests', protect, asyncHandler(async (req, res) => {
  const history = await db.query.harvestExecutionLogs.findMany({
    where: eq(harvestExecutionLogs.userId, req.user.id),
    orderBy: [desc(harvestExecutionLogs.executionDate)]
  });
  return new ApiResponse(200, history).send(res);
}));

/**
 * @route   GET /api/tax/lots/discrepancies
 * @desc    Generating complex "Lot Discrepancy" reports (#460)
 */
router.get('/lots/discrepancies', protect, asyncHandler(async (req, res) => {
  const { investmentId, threshold = 5 } = req.query;

  const investment = await db.query.investments.findFirst({
    where: eq(investments.id, investmentId)
  });

  if (!investment) return res.status(404).json(new ApiResponse(404, null, 'Investment not found'));

  const lots = await db.select().from(taxLotHistory).where(
    and(eq(taxLotHistory.userId, req.user.id), eq(taxLotHistory.investmentId, investmentId), eq(taxLotHistory.status, 'open'))
  );

  const currentPrice = parseFloat(investment.currentPrice || 0);
  const discrepancies = findLotDiscrepancies(lots, currentPrice, parseFloat(threshold));

  return new ApiResponse(200, {
    symbol: investment.symbol,
    currentPrice,
    threshold: `${threshold}%`,
    discrepancyCount: discrepancies.length,
    discrepancies
  }, 'Lot discrepancy report generated').send(res);
}));

/**
 * @route   POST /api/tax/lots/:id/sell
 * @desc    Record a tax-lot specific sale with Wash-Sale Shield (#460)
 */
router.post('/lots/:id/sell', protect, taxGuard, asyncHandler(async (req, res) => {
  const { quantity, salePrice } = req.body;

  // Find the lot
  const [lot] = await db.select().from(taxLotHistory).where(
    and(eq(taxLotHistory.id, req.params.id), eq(taxLotHistory.userId, req.user.id))
  );

  if (!lot || lot.status !== 'open') {
    return res.status(400).json({ success: false, message: 'Invalid or closed lot' });
  }

  const result = await taxLotService.closeLots(req.user.id, {
    investmentId: lot.investmentId,
    unitsSold: quantity,
    salePrice: salePrice || 0, // Should come from req.body or market
    method: 'SPECIFIC_ID',
    specificLotId: lot.id // We might need to update closeLots to support this
  });

  return new ApiResponse(200, {
    result,
    washSaleAnalysis: req.washSaleAnalysis
  }, 'Tax lot adjusted successfully').send(res);
}));

/**
 * @route   GET /api/tax/corporate/consolidated
 */
router.get('/corporate/consolidated', protect, asyncHandler(async (req, res) => {
  const data = await corporateService.calculateConsolidatedTaxLiability(req.user.id);
  return new ApiResponse(200, data, 'Consolidated tax liability calculated').send(res);
}));

/**
 * @route   GET /api/tax/nexus/exposure
 */
router.get('/nexus/exposure', protect, asyncHandler(async (req, res) => {
  const exposures = await db.select().from(taxNexusMappings).where(eq(taxNexusMappings.userId, req.user.id));
  return new ApiResponse(200, exposures, 'Nexus exposures retrieved').send(res);
}));

export default router;
