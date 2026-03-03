import express from 'express';
import { db } from '../db/index.js';
import { successionPlans, successionHeirs, successionAccessShards } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { successionHeartbeatService } from '../services/successionHeartbeatService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get succession plan
router.get('/plan', authMiddleware, async (req, res) => {
    try {
        const plan = await db.select().from(successionPlans).where(eq(successionPlans.userId, req.user.id));
        if (plan.length === 0) return res.status(404).json({ message: 'No plan found' });

        const heirs = await db.select().from(successionHeirs).where(eq(successionHeirs.planId, plan[0].id));
        res.json({ ...plan[0], heirs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create/Update plan
router.post('/plan', authMiddleware, async (req, res) => {
    try {
        const { inactivityThresholdDays, gracePeriodDays, metadata } = req.body;

        const existing = await db.select().from(successionPlans).where(eq(successionPlans.userId, req.user.id));

        if (existing.length > 0) {
            await db.update(successionPlans)
                .set({ inactivityThresholdDays, gracePeriodDays, metadata, updatedAt: new Date() })
                .where(eq(successionPlans.userId, req.user.id));
        } else {
            await db.insert(successionPlans).values({
                userId: req.user.id,
                inactivityThresholdDays,
                gracePeriodDays,
                metadata
            });
        }

        res.json({ message: 'Succession plan updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Heartbeat check-in
router.post('/heartbeat', authMiddleware, async (req, res) => {
    try {
        await successionHeartbeatService.recordHeartbeat(req.user.id, 'app_checkin', req.ip);
        res.json({ message: 'Heartbeat recorded' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add heir
router.post('/heirs', authMiddleware, async (req, res) => {
    try {
        const { name, email, publicKey, role, shardIndex } = req.body;
        const plan = await db.select().from(successionPlans).where(eq(successionPlans.userId, req.user.id));

        if (plan.length === 0) return res.status(400).json({ message: 'Create a plan first' });

        await db.insert(successionHeirs).values({
            planId: plan[0].id,
            name,
            email,
            publicKey,
            role,
            shardIndex
        });

        res.json({ message: 'Heir added' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import successionService from '../services/successionService.js';
import successionHeartbeatService from '../services/successionHeartbeatService.js';
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
 * @route   POST /api/succession/heartbeat/email
 * @desc    Record email confirmation heartbeat
 */
router.post('/heartbeat/email', protect, asyncHandler(async (req, res) => {
    const { emailType } = req.body;
    const result = await successionHeartbeatService.recordEmailConfirmation(
        req.user.id,
        emailType || 'confirmation',
        {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        }
    );
    return new ApiResponse(200, result, 'Email heartbeat recorded').send(res);
}));

/**
 * @route   POST /api/succession/heartbeat/checkin
 * @desc    Record in-app check-in heartbeat
 */
router.post('/heartbeat/checkin', protect, asyncHandler(async (req, res) => {
    const { checkinType } = req.body;
    const result = await successionHeartbeatService.recordInAppCheckin(
        req.user.id,
        checkinType || 'manual',
        {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            sessionId: req.session?.id
        }
    );
    return new ApiResponse(200, result, 'Check-in heartbeat recorded').send(res);
}));

/**
 * @route   POST /api/succession/heartbeat/onchain
 * @desc    Record on-chain activity heartbeat
 */
router.post('/heartbeat/onchain', protect, asyncHandler(async (req, res) => {
    const { transactionHash, network } = req.body;
    if (!transactionHash) {
        return new ApiResponse(400, null, 'Transaction hash is required').send(res);
    }
    const result = await successionHeartbeatService.recordOnChainActivity(
        req.user.id,
        transactionHash,
        network || 'ethereum',
        {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        }
    );
    return new ApiResponse(200, result, 'On-chain heartbeat recorded').send(res);
}));

/**
 * @route   GET /api/succession/heartbeat/status
 * @desc    Get user's heartbeat status and inactivity score
 */
router.get('/heartbeat/status', protect, asyncHandler(async (req, res) => {
    const status = await successionHeartbeatService.getHeartbeatStatus(req.user.id);
    return new ApiResponse(200, status, 'Heartbeat status retrieved').send(res);
}));

/**
 * @route   GET /api/succession/heartbeat/history
 * @desc    Get user's heartbeat history
 */
router.get('/heartbeat/history', protect, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const history = await successionHeartbeatService.getHeartbeatHistory(req.user.id, limit);
    return new ApiResponse(200, history, 'Heartbeat history retrieved').send(res);
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
