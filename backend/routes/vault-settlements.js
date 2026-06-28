import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import settlementEngine from '../services/settlementEngine.js';
import { validateSettlement } from '../middleware/settlementValidator.js';
import { db } from '../db/index.js';
import { settlements, p2pRequests, internalLedger } from '../db/schema.js';
import { eq, or, and, desc } from 'drizzle-orm';
import asyncHandler from 'express-async-handler';

const router = express.Router();

/**
 * @desc Create Inter-Vault Settlement
 * @route POST /api/vault-settlements/internal
 */
router.post('/internal', protect, validateSettlement, asyncHandler(async (req, res) => {
    const { sourceVaultId, destinationVaultId, amount, currency } = req.body;

    const request = await settlementEngine.createSettlementRequest(
        req.user.id,
        sourceVaultId,
        destinationVaultId,
        amount,
        currency
    );

    const result = await settlementEngine.executeInternalSettlement(request.id);

    res.status(201).json({ success: true, data: result });
}));

/**
 * @desc Create P2P Request
 * @route POST /api/vault-settlements/p2p/request
 */
router.post('/p2p/request', protect, asyncHandler(async (req, res) => {
    const { receiverId, amount, currency, note } = req.body;

    const [request] = await db.insert(p2pRequests).values({
        senderId: req.user.id,
        receiverId,
        amount: amount.toString(),
        currency,
        note,
        status: 'pending'
    }).returning();

    res.status(201).json({ success: true, data: request });
}));

/**
 * @desc Accept/Settle P2P Request
 * @route POST /api/vault-settlements/p2p/settle/:id
 */
router.post('/p2p/settle/:id', protect, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { senderVaultId, receiverVaultId } = req.body;

    const requestData = await db.select().from(p2pRequests).where(eq(p2pRequests.id, id)).limit(1);
    if (requestData.length === 0) return res.status(404).json({ message: "P2P Request not found" });

    const p2p = requestData[0];
    if (p2p.receiverId !== req.user.id) return res.status(403).json({ message: "Unauthorized" });

    // Execute actual move
    const result = await settlementEngine.processP2PTransfer(
        p2p.senderId,
        p2p.receiverId,
        p2p.amount,
        p2p.currency,
        senderVaultId,
        receiverVaultId
    );

    await db.update(p2pRequests).set({ status: 'settled', updatedAt: new Date() }).where(eq(p2pRequests.id, id));

    res.json({ success: true, data: result });
}));

/**
 * @desc Get User Ledger Logs
 * @route GET /api/vault-settlements/ledger
 */
router.get('/ledger', protect, asyncHandler(async (req, res) => {
    const logs = await db.select()
        .from(internalLedger)
        .where(eq(internalLedger.userId, req.user.id))
        .orderBy(desc(internalLedger.createdAt))
        .limit(100);

    res.json({ success: true, data: logs });
}));

export default router;
