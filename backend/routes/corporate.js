import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import ledgerBalancer from '../services/ledgerBalancer.js';
import payrollEngine from '../services/payrollEngine.js';
import treasuryService from '../services/treasuryService.js';
import taxFilingService from '../services/taxFilingService.js';
import { auditInterCompanyFlow } from '../middleware/auditInterceptor.js';
import db from '../config/db.js';
import { interCompanyTransfers, payrollBuckets, taxDeductionLedger, corporateEntities } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/corporate/ledger/summary
 * @desc    Get consolidated liquidity and inter-company float
 */
router.get('/ledger/summary', protect, asyncHandler(async (req, res) => {
    const { parentId } = req.query;
    const summary = await ledgerBalancer.calculateConsolidatedLiquidity(req.user.id, parentId);
    new ApiResponse(200, summary).send(res);
}));

/**
 * @route   POST /api/corporate/ledger/transfer
 * @desc    Propose an inter-company loan or distribusi
 */
router.post('/ledger/transfer', protect, auditInterCompanyFlow, asyncHandler(async (req, res) => {
    const transfer = await ledgerBalancer.proposeTransfer(req.user.id, req.body);
    new ApiResponse(201, transfer).send(res);
}));

/**
 * @route   POST /api/corporate/ledger/execute/:id
 * @desc    Execute a pending inter-company transfer
 */
router.post('/ledger/execute/:id', protect, asyncHandler(async (req, res) => {
    const result = await ledgerBalancer.executeTransfer(req.params.id);
    new ApiResponse(200, result).send(res);
}));

/**
 * @route   POST /api/corporate/payroll/calc
 * @desc    Calculate net-pay and withholdings
 */
router.post('/payroll/calc', protect, asyncHandler(async (req, res) => {
    const { grossAmount, jurisdiction, entityId } = req.body;
    const breakdown = await payrollEngine.calculatePaycheck(parseFloat(grossAmount), jurisdiction);

    // Auto-record to ledger if entityId provided
    if (entityId) {
        await payrollEngine.recordWithholdings(req.user.id, entityId, breakdown);
    }

    new ApiResponse(200, breakdown).send(res);
}));

/**
 * @route   POST /api/corporate/payroll/sweep/:bucketId
 * @desc    Manually trigger a payroll funding sweep
 */
router.post('/payroll/sweep/:bucketId', protect, asyncHandler(async (req, res) => {
    const result = await treasuryService.executePayrollSweep(req.user.id, req.params.bucketId);
    new ApiResponse(200, result).send(res);
}));

/**
 * @route   POST /api/corporate/tax/file
 * @desc    Generate tax filing for specific entries
 */
router.post('/tax/file', protect, asyncHandler(async (req, res) => {
    const { entityId, ledgerIds, format } = req.body;
    const filing = await taxFilingService.generateFiling(req.user.id, entityId, ledgerIds, format);
    new ApiResponse(200, filing).send(res);
}));

/**
 * @route   GET /api/corporate/history
 * @desc    Get inter-company transfer logs
 */
router.get('/history', protect, asyncHandler(async (req, res) => {
    const logs = await db.query.interCompanyTransfers.findMany({
        where: eq(interCompanyTransfers.userId, req.user.id),
        orderBy: [desc(interCompanyTransfers.createdAt)]
    });
    new ApiResponse(200, logs).send(res);
}));

/**
 * @route   GET /api/corporate/ledger/health/:entityId
 * @desc    Get real-time financial health metrics for an entity
 */
router.get('/ledger/health/:entityId', protect, asyncHandler(async (req, res) => {
    const health = await ledgerBalancer.calculateEntityHealth(req.params.entityId);
    new ApiResponse(200, health).send(res);
}));

/**
 * @route   GET /api/corporate/ledger/balance-sheet
 * @desc    Get consolidated group balance sheet
 */
router.get('/ledger/balance-sheet', protect, asyncHandler(async (req, res) => {
    const { parentId } = req.query;
    const balanceSheet = await ledgerBalancer.getConsolidatedBalanceSheet(req.user.id, parentId);
    new ApiResponse(200, balanceSheet).send(res);
}));

export default router;
