import express from 'express';
import { protect } from '../middleware/auth.js';
import taxHarvestEngine from '../services/taxHarvestEngine.js';
import taxLotService from '../services/taxLotService.js';
import washSaleTracker from '../services/washSaleTracker.js';
import cryptoTaxHarvestService from '../services/cryptoTaxHarvestService.js';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { washSaleWindows } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/tax/harvest/scan
 * @desc    Manual scan for tax-loss harvesting opportunities across all entities.
 */
router.get('/harvest/scan', protect, asyncHandler(async (req, res) => {
    // Mock prices for demonstration; real app pulls from marketDataService
    const currentPrices = { 'VTI': 210.00, 'BTC': 42000, 'AAPL': 160.00 };
    const opportunities = await taxHarvestEngine.scanOpportunities(req.user.id, currentPrices);
    new ApiResponse(200, opportunities, 'Tax harvest opportunities retrieved').send(res);
}));

/**
 * @route   POST /api/tax/harvest/execute
 * @desc    Execute a specific harvesting opportunity.
 */
router.post('/harvest/execute', protect, asyncHandler(async (req, res) => {
    const { opportunity } = req.body;
    if (!opportunity) return res.status(400).json({ message: 'Opportunity data required' });

    const result = await taxHarvestEngine.executeHarvest(req.user.id, opportunity);
    new ApiResponse(200, result, 'Tax loss successfully harvested — Wash-sale restriction activated for 30 days').send(res);
}));

/**
 * @route   GET /api/tax/inventory
 * @desc    Get detailed tax-lot inventory with specific identification.
 */
router.get('/inventory', protect, asyncHandler(async (req, res) => {
    const currentPrices = { 'VTI': 210.00, 'BTC': 42000, 'AAPL': 160.00 };
    const positions = await taxLotService.getUnrealizedPositions(req.user.id, currentPrices);
    new ApiResponse(200, positions, 'Specific tax-lot inventory retrieved').send(res);
}));

/**
 * @route   GET /api/tax/wash-sale/status
 * @desc    Check active wash-sale windows across all user entities.
 */
router.get('/wash-sale/status', protect, asyncHandler(async (req, res) => {
    const windows = await db.select().from(washSaleWindows)
        .where(and(
            eq(washSaleWindows.userId, req.user.id),
            eq(washSaleWindows.isActive, true)
        ));
    new ApiResponse(200, windows, 'Active wash-sale windows retrieved').send(res);
}));

/**
 * @route   GET /api/tax/optimization/crypto/harvest/scan
 * @desc    Scan crypto lots (including DeFi-origin lots) for harvesting opportunities.
 */
router.get('/crypto/harvest/scan', protect, asyncHandler(async (req, res) => {
    const { minLossUSD = 250 } = req.query;
    const opportunities = await cryptoTaxHarvestService.scanCryptoHarvestOpportunities(req.user.id, {
        minLossUSD: Number(minLossUSD),
    });

    new ApiResponse(200, {
        count: opportunities.length,
        opportunities,
    }, 'Crypto harvest opportunities retrieved').send(res);
}));

/**
 * @route   GET /api/tax/optimization/crypto/prices
 * @desc    Fetch live crypto prices for symbols.
 */
router.get('/crypto/prices', protect, asyncHandler(async (req, res) => {
    const { symbols = '' } = req.query;
    const parsedSymbols = String(symbols)
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

    const prices = await cryptoTaxHarvestService.getLiveCryptoPrices(parsedSymbols);
    new ApiResponse(200, {
        symbols: parsedSymbols,
        prices,
    }, 'Live crypto prices fetched').send(res);
}));

/**
 * @route   POST /api/tax/optimization/crypto/defi/parse
 * @desc    Parse DeFi transaction payloads into normalized taxable events.
 */
router.post('/crypto/defi/parse', protect, asyncHandler(async (req, res) => {
    const { transactions = [] } = req.body;
    const normalized = cryptoTaxHarvestService.parseDefiTransactions(transactions);

    new ApiResponse(200, {
        count: normalized.length,
        normalized,
    }, 'DeFi transactions parsed').send(res);
}));

/**
 * @route   POST /api/tax/optimization/crypto/defi/ingest
 * @desc    Parse and track DeFi transactions into tax-lot ledger.
 */
router.post('/crypto/defi/ingest', protect, asyncHandler(async (req, res) => {
    const { portfolioId, vaultId, transactions = [] } = req.body;
    if (!portfolioId || !vaultId) {
        return res.status(400).json({ message: 'portfolioId and vaultId are required' });
    }

    const result = await cryptoTaxHarvestService.ingestDefiTransactions(req.user.id, {
        portfolioId,
        vaultId,
        transactions,
    });

    new ApiResponse(201, result, 'DeFi transactions ingested into tax lots').send(res);
}));

/**
 * @route   GET /api/tax/optimization/crypto/duplicates/:symbol
 * @desc    Detect potential duplicate holdings across exchanges before harvest execution.
 */
router.get('/crypto/duplicates/:symbol', protect, asyncHandler(async (req, res) => {
    const duplicates = await cryptoTaxHarvestService.detectCrossExchangeDuplicates(req.user.id, req.params.symbol);
    new ApiResponse(200, {
        symbol: req.params.symbol,
        count: duplicates.length,
        duplicates,
    }, 'Cross-exchange duplicate detection complete').send(res);
}));

/**
 * @route   POST /api/tax/optimization/crypto/harvest/propose
 * @desc    Create automated harvest proposal with approval workflow.
 */
router.post('/crypto/harvest/propose', protect, asyncHandler(async (req, res) => {
    const proposal = await cryptoTaxHarvestService.proposeAutomatedHarvest(req.user.id, req.body || {});
    new ApiResponse(201, proposal, 'Crypto harvest proposal created').send(res);
}));

/**
 * @route   POST /api/tax/optimization/crypto/harvest/:eventId/approve
 * @desc    Approve a proposed harvest event.
 */
router.post('/crypto/harvest/:eventId/approve', protect, asyncHandler(async (req, res) => {
    const approved = await cryptoTaxHarvestService.approveHarvestProposal(req.user.id, req.params.eventId, req.user.id);
    new ApiResponse(200, approved, 'Harvest proposal approved').send(res);
}));

/**
 * @route   POST /api/tax/optimization/crypto/harvest/:eventId/execute
 * @desc    Execute an approved harvest event.
 */
router.post('/crypto/harvest/:eventId/execute', protect, asyncHandler(async (req, res) => {
    const execution = await cryptoTaxHarvestService.executeApprovedHarvest(req.user.id, req.params.eventId, req.body || {});
    new ApiResponse(200, execution, 'Approved crypto harvest executed').send(res);
}));

/**
 * @route   GET /api/tax/optimization/crypto/reports/:taxYear
 * @desc    Generate Form 8949, Schedule D, and crypto summary report.
 */
router.get('/crypto/reports/:taxYear', protect, asyncHandler(async (req, res) => {
    const { format = 'json' } = req.query;
    const report = await cryptoTaxHarvestService.generateCryptoTaxDocuments(
        req.user.id,
        Number(req.params.taxYear),
        String(format)
    );

    new ApiResponse(200, report, 'Crypto tax report generated').send(res);
}));

export default router;
