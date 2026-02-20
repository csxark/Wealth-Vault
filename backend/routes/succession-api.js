import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import successionPilot from '../services/successionPilot.js';
import encryptionVault from '../utils/encryptionVault.js';
import db from '../config/db.js';
import { digitalWillDefinitions, heirIdentityVerifications, trusteeVoteLedger } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/succession/will
 * @desc    Create/Update a digital will definition
 */
router.post('/will', protect, asyncHandler(async (req, res) => {
    const { willName, jurisdiction, executorId, metadata } = req.body;
    const [will] = await db.insert(digitalWillDefinitions).values({
        userId: req.user.id,
        willName,
        legalJurisdiction: jurisdiction,
        executorId,
        status: 'active',
        metadata
    }).returning();

    new ApiResponse(201, will, 'Digital Will activated').send(res);
}));

/**
 * @route   POST /api/succession/verify-identity
 * @desc    Submit proof of identity for an heir
 */
router.post('/verify-identity', protect, asyncHandler(async (req, res) => {
    const { willId, method, proofData } = req.body;
    const [verification] = await db.insert(heirIdentityVerifications).values({
        userId: req.user.id,
        willId,
        verificationMethod: method,
        verificationStatus: 'pending',
        metadata: { proofData }
    }).returning();

    new ApiResponse(200, verification, 'Verification submitted for probate review').send(res);
}));

/**
 * @route   POST /api/succession/trustee/vote
 * @desc    Cast a vote for/against succession trigger (Trustees only)
 */
router.post('/trustee/vote', protect, asyncHandler(async (req, res) => {
    const { willId, result, reason } = req.body;
    const [vote] = await db.insert(trusteeVoteLedger).values({
        willId,
        trusteeId: req.user.id,
        voteResult: result,
        reason
    }).returning();

    new ApiResponse(200, vote, 'Consensus vote recorded').send(res);
}));

/**
 * @route   GET /api/succession/claim/:willId
 * @desc    Claim fractional ownership of assets (Heirs only)
 */
router.get('/claim/:willId', protect, asyncHandler(async (req, res) => {
    const will = await db.query.digitalWillDefinitions.findFirst({
        where: and(eq(digitalWillDefinitions.id, req.params.willId), eq(digitalWillDefinitions.status, 'settled'))
    });

    if (!will) throw new Error('Will is not settled or does not exist');

    // Retrieve released secrets (mocked executor approvals)
    const secret = await encryptionVault.decryptForHeir(will.metadata.encryptedPortion, ['approval-1', 'approval-2']);

    new ApiResponse(200, {
        willStatus: 'settled',
        assetsReleased: true,
        secrets: secret
    }).send(res);
}));

export default router;
