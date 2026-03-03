import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import successionPilot from '../services/successionPilot.js';
import encryptionVault from '../utils/encryptionVault.js';
import consensusTransition from '../services/consensusTransition.js';
import probateAutomation from '../services/probateAutomation.js';
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

/**
 * @route   POST /api/succession/consensus/approve
 * @desc    Submit cryptographic approval for shard reconstruction
 */
router.post('/consensus/approve', protect, asyncHandler(async (req, res) => {
    const { shardId, signature, reconstructionRequestId } = req.body;

    const result = await consensusTransition.submitApproval(
        req.user.id,
        shardId,
        signature,
        reconstructionRequestId
    );

    if (result.success) {
        new ApiResponse(200, result, 'Approval submitted successfully').send(res);
    } else {
        new ApiResponse(400, result, 'Approval submission failed').send(res);
    }
}));

/**
 * @route   GET /api/succession/consensus/status/:reconstructionRequestId
 * @desc    Get consensus status for a reconstruction request
 */
router.get('/consensus/status/:reconstructionRequestId', protect, asyncHandler(async (req, res) => {
    const status = await consensusTransition.getConsensusStatus(req.params.reconstructionRequestId);
    new ApiResponse(200, status, 'Consensus status retrieved').send(res);
}));

/**
 * @route   GET /api/succession/ledger/generate/:willId
 * @desc    Generate digital asset ledger for probate
 */
router.get('/ledger/generate/:willId', protect, asyncHandler(async (req, res) => {
    // Verify user owns the will
    const [will] = await db.select()
        .from(digitalWillDefinitions)
        .where(and(eq(digitalWillDefinitions.id, req.params.willId), eq(digitalWillDefinitions.userId, req.user.id)));

    if (!will) {
        return new ApiResponse(404, null, 'Digital will not found').send(res);
    }

    const ledger = await probateAutomation.generateDigitalAssetLedger(req.user.id, req.params.willId);
    new ApiResponse(200, ledger, 'Digital asset ledger generated successfully').send(res);
}));

/**
 * @route   GET /api/succession/ledger/export/:willId
 * @desc    Export digital asset ledger in specified format
 */
router.get('/ledger/export/:willId', protect, asyncHandler(async (req, res) => {
    const { format = 'json' } = req.query;

    // Verify user owns the will
    const [will] = await db.select()
        .from(digitalWillDefinitions)
        .where(and(eq(digitalWillDefinitions.id, req.params.willId), eq(digitalWillDefinitions.userId, req.user.id)));

    if (!will) {
        return new ApiResponse(404, null, 'Digital will not found').send(res);
    }

    // Generate ledger
    const ledger = await probateAutomation.generateDigitalAssetLedger(req.user.id, req.params.willId);

    // Export in requested format
    const exportResult = await probateAutomation.exportLedger(ledger, format);

    // Set response headers
    res.setHeader('Content-Type', exportResult.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);

    // Send the file content
    res.send(exportResult.content);
}));

/**
 * @route   POST /api/succession/ledger/verify
 * @desc    Verify digital asset ledger signature and integrity
 */
router.post('/ledger/verify', protect, asyncHandler(async (req, res) => {
    const { ledger } = req.body;

    if (!ledger) {
        return new ApiResponse(400, null, 'Ledger data is required').send(res);
    }

    const isValid = probateAutomation.verifyLedgerSignature(ledger);

    new ApiResponse(200, {
        valid: isValid,
        verifiedAt: new Date().toISOString()
    }, isValid ? 'Ledger signature verified successfully' : 'Ledger signature verification failed').send(res);
}));

export default router;
