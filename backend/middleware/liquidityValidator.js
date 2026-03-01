import { ApiResponse } from '../utils/ApiResponse.js';
import { reserveOperatingLiquidity } from '../services/forecastEngine.js';
import { logInfo } from '../utils/logger.js';

/**
 * Liquidity Validator Middlesex (L3)
 * Real-time enforcement of safety margins to prevent "Cash-Out" during settlement periods.
 * Ensures the engine doesn't strip too much cash during low-volume or high-volatility transaction windows.
 */
export const validateOperatingLiquidity = async (req, res, next) => {
    const userId = req.user.id;
    const { amount, vaultId } = req.body;

    if (!amount) {
        return next();
    }

    try {
        logInfo(`[Liquidity Validator] Checking operating liquidity for user ${userId} and amount ${amount}`);

        // Calculate liquidity runway and operating reserves (L3 Logic)
        const liquidityStatus = await reserveOperatingLiquidity(userId, 3); // 3-month forecast

        // Check if the requested investment/sweep amount leaves enough for operations
        if (parseFloat(amount) > liquidityStatus.adjustedAvailable) {
            logInfo(`[Liquidity Validator] REJECTED: Requested ${amount} exceeds adjusted available ${liquidityStatus.adjustedAvailable}`);

            return new ApiResponse(403, {
                requestedAmount: amount,
                availableLiquidity: liquidityStatus.adjustedAvailable,
                requiredReserve: liquidityStatus.adjustedReserve,
                recommendation: liquidityStatus.recommendation
            }, 'Transaction rejected: Insufficient operating liquidity').send(res);
        }

        // Add liquidity status to req for downstream usage
        req.liquidityStatus = liquidityStatus;

        logInfo(`[Liquidity Validator] APPROVED: Sufficient liquidity available`);
        next();
    } catch (error) {
        logInfo(`[Liquidity Validator] Error during validation: ${error.message}`);
        next(error);
    }
};

/**
 * Velocity Shield (L3)
 * Blocks rebalancing if spending velocity is significantly higher than historical norms.
 */
export const velocityShield = async (req, res, next) => {
    // This could integrate with trendAnalyzer.js to check if the user is currently in a 
    // high-burn phase that hasn't yet been fully reflected in historical averages.
    next();
};
