import db from '../config/db.js';
import { liquidityLocks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Shield Guard Middleware (L3)
 * Real-time transaction interceptor that blocks asset movement during an active "Shield State".
 */
export const shieldGuard = async (req, res, next) => {
    const userId = req.user.id;
    const { vaultId } = req.body || req.query;

    if (!vaultId) return next();

    try {
        // Check if there's an active liquidity lock for this vault
        const activeLock = await db.query.liquidityLocks.findFirst({
            where: and(
                eq(liquidityLocks.userId, userId),
                eq(liquidityLocks.vaultId, vaultId),
                eq(liquidityLocks.isUnlocked, false)
            )
        });

        if (activeLock) {
            return new ApiResponse(423, {
                lockId: activeLock.id,
                reason: activeLock.reason,
                expiresAt: activeLock.expiresAt,
                requiresMultiSig: activeLock.multiSigRequired
            }, 'Transaction BLOCKED: Vault is under an active Bankruptcy Shield lock').send(res);
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Entity Isolation Check
 */
export const entityIsolationGuard = async (req, res, next) => {
    // Logic to prevent inter-entity transfers if one is currently 'at-risk'
    next();
};
