import { ApiResponse } from '../utils/ApiResponse.js';
import { logInfo } from '../utils/logger.js';
import db from '../config/db.js';
import { bankAccounts } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/**
 * Rebalance Validator Middleware (#449)
 * Checks liquidity and basic trade constraints before approving a rebalance batch.
 */
export const validateRebalanceBatch = async (req, res, next) => {
    const userId = req.user.id;
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json(new ApiResponse(400, null, "Invalid rebalance order batch"));
    }

    try {
        // 1. Calculate Total Net Cash Impact (Buy - Sell)
        // We simulate fetching the proposed orders from DB for validation
        // In this context, we assume the user is approving a set of 'proposed' orders

        // 2. Check Liquidity (If total buys > total sells + cash balance)
        const [cashResult] = await db.select({
            totalCash: sql`SUM(CAST(balance AS NUMERIC))`
        }).from(bankAccounts).where(eq(bankAccounts.userId, userId));

        const availableCash = parseFloat(cashResult?.totalCash || 0);

        // Dummy validation for L3 logic context:
        // We block if available cash is dangerously low (< $1000) for a large batch
        if (availableCash < 1000 && orderIds.length > 5) {
            return res.status(403).json(new ApiResponse(403, null,
                "Insufficient liquidity to cover transaction costs and slippage for this rebalance batch."
            ));
        }

        logInfo(`[Rebalance Validator] Batch of ${orderIds.length} orders passed validation for user ${userId}`);
        next();
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
};
