import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import entityService from '../services/entityService.js';
import ledgerService from '../services/ledgerService.js';
import db from '../config/db.js';

const router = express.Router();

/**
 * @route   GET /api/entities
 * @desc    Get all entities for the user
 */
router.get('/', protect, asyncHandler(async (req, res) => {
    const list = await entityService.getUserEntities(req.user.id);
    return new ApiResponse(200, list, 'Entities retrieved').send(res);
}));

/**
 * @route   POST /api/entities
 * @desc    Create a new legal entity (LLC, Trust, etc.)
 */
router.post('/', protect, asyncHandler(async (req, res) => {
    const entity = await entityService.createEntity(req.user.id, req.body);
    return new ApiResponse(201, entity, 'Entity created').send(res);
}));

/**
 * @route   GET /api/entities/:id
 * @desc    Get entity details and inter-company balances
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
    const details = await entityService.getEntityDetails(req.params.id, req.user.id);
    return new ApiResponse(200, details, 'Entity details retrieved').send(res);
}));

/**
 * @route   POST /api/entities/transfer
 * @desc    Record an inter-company movement (Loan, Reimbursement)
 */
router.post('/transfer', protect, asyncHandler(async (req, res) => {
    const transfer = await ledgerService.recordTransfer(req.user.id, req.body);
    return new ApiResponse(201, transfer, 'Inter-company transfer recorded').send(res);
}));

/**
 * @route   GET /api/entities/consolidate/:idA/:idB
 * @desc    Get net exposure between two entities
 */
router.get('/consolidate/:idA/:idB', protect, asyncHandler(async (req, res) => {
    const balance = await ledgerService.getConsolidatedBalance(req.params.idA, req.params.idB, req.user.id);
    return new ApiResponse(200, balance, 'Net exposure calculated').send(res);
}));

export default router;
