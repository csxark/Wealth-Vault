import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import successionService from '../services/successionService.js';
import db from '../config/db.js';
import { successionLogs, multiSigApprovals } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/succession/status
 * @desc    Get user's own inactivity/succession status
 */
router.get('/status', protect, asyncHandler(async (req, res) => {
    const status = await successionService.verifyChallenge(req.user.id); // Re-use for presence check
    return new ApiResponse(200, status, 'Activity status retrieved').send(res);
}));

/**
 * @route   GET /api/succession/pending
 * @desc    Get succession events awaiting executor approval
 */
router.get('/pending', protect, asyncHandler(async (req, res) => {
    const events = await successionService.getPendingSuccessions(req.user.id);
    return new ApiResponse(200, events, 'Pending successions retrieved').send(res);
}));

/**
 * @route   POST /api/succession/:id/approve
 * @desc    Cast a multi-sig approval for a succession event
 */
router.post('/:id/approve', protect, asyncHandler(async (req, res) => {
    const result = await successionService.castApproval(req.params.id, req.user.id, 'APPROVE', req);
    return new ApiResponse(200, result, 'Approval cast successfully').send(res);
}));

/**
 * @route   GET /api/succession/history
 * @desc    Get succession history for the user (as owner or beneficiary)
 */
router.get('/history', protect, asyncHandler(async (req, res) => {
    const logs = await db.select().from(successionLogs)
        .where(eq(successionLogs.userId, req.user.id))
        .orderBy(desc(successionLogs.activatedAt));
    return new ApiResponse(200, logs, 'Succession history retrieved').send(res);
}));

/**
 * @route   POST /api/succession/challenge/verify
 * @desc    Respond to a proof-of-life challenge
 */
router.post('/challenge/verify', protect, asyncHandler(async (req, res) => {
    const { token } = req.body;
    await successionService.verifyChallenge(req.user.id, token);
    return new ApiResponse(200, null, 'Challenge verified, activity reset').send(res);
}));

export default router;
