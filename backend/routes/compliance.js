import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import residencyEngine from '../services/residencyEngine.js';
import taxWithholdingService from '../services/taxWithholdingService.js';
import treatyService from '../services/treatyService.js';
import db from '../config/db.js';
import { taxResidencyHistory, jurisdictionTaxRules, withholdingLedger } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/compliance/residency
 * @desc    Get current tax residency status and history
 */
router.get('/residency', protect, asyncHandler(async (req, res) => {
    const history = await db.query.taxResidencyHistory.findMany({
        where: eq(taxResidencyHistory.userId, req.user.id),
        orderBy: [desc(taxResidencyHistory.startDate)]
    });
    new ApiResponse(200, history).send(res);
}));

/**
 * @route   POST /api/compliance/residency/verify
 * @desc    Manually trigger residency recalculation
 */
router.post('/residency/verify', protect, asyncHandler(async (req, res) => {
    const result = await residencyEngine.recalculateResidency(req.user.id);
    new ApiResponse(200, result, 'Residency status updated successfully').send(res);
}));

/**
 * @route   GET /api/compliance/withholding
 * @desc    Get global withholding report
 */
router.get('/withholding', protect, asyncHandler(async (req, res) => {
    const report = await taxWithholdingService.getWithholdingReport(req.user.id);
    new ApiResponse(200, report).send(res);
}));

/**
 * @route   POST /api/compliance/withholding/estimate
 * @desc    Estimate withholding for a prospective income event
 */
router.post('/withholding/estimate', protect, asyncHandler(async (req, res) => {
    const { vaultId, amount, type } = req.body;
    const estimation = await taxWithholdingService.estimateWithholding(req.user.id, vaultId, parseFloat(amount), type);
    new ApiResponse(200, estimation).send(res);
}));

/**
 * @route   GET /api/compliance/treaty/:sourceCountry
 * @desc    Check treaty benefits for current primary residency
 */
router.get('/treaty/:sourceCountry', protect, asyncHandler(async (req, res) => {
    const target = await residencyEngine.getPrimaryJurisdiction(req.user.id);
    const dividendRate = await treatyService.getReducedRate(req.params.sourceCountry, target, 'dividend');
    const interestRate = await treatyService.getReducedRate(req.params.sourceCountry, target, 'interest');

    new ApiResponse(200, {
        source: req.params.sourceCountry,
        target,
        dividendRate: `${dividendRate}%`,
        interestRate: `${interestRate}%`,
        isTreatyProtected: dividendRate < 30 || interestRate < 30
    }).send(res);
}));

export default router;
