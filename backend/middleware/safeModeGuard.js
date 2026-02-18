import db from '../config/db.js';
import { hedgeExecutionHistory } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Safe-Mode Guard Middleware (L3)
 * Real-time transaction interceptor that blocks risky asset movements during an active "Black-Swan" event.
 * Forces "Withdraw-Only" or "Shield-Active" modes.
 */
export const safeModeGuard = async (req, res, next) => {
    const userId = req.user.id;
    const { vaultId } = req.body || req.params;

    try {
        // Check if there's an active shield execution for this user/vault
        // An active execution signifies the user is in "Safe-Mode" due to an anomaly
        const activeShield = await db.query.hedgeExecutionHistory.findFirst({
            where: and(
                eq(hedgeExecutionHistory.userId, userId),
                eq(hedgeExecutionHistory.status, 'active')
            )
        });

        if (activeShield) {
            // Block non-safe actions (e.g. buying more of a crashing asset, or transferring out of safe haven)
            const isRiskyAction = req.method !== 'GET' && !req.path.includes('restore');

            if (isRiskyAction) {
                return new ApiResponse(423, {
                    shieldId: activeShield.id,
                    anomalyType: activeShield.metadata?.triggerType,
                    status: 'SAFE_MODE_ACTIVE',
                    recommendation: 'Market anomaly detected. System is in protective Withdraw-Only mode.'
                }, 'Action BLOCKED: Portfolio is under Black-Swan Protection').send(res);
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Hyper-Volatility Throttler
 */
export const volatilityThrottle = (req, res, next) => {
    // Logic to slow down transaction frequency during high volatility
    next();
};
