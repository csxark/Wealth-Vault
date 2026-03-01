import { ApiResponse } from '../utils/ApiResponse.js';
import waccCalculator from '../services/waccCalculator.js';
import { logInfo } from '../utils/logger.js';

/**
 * Leverage Validator Middleware (L3)
 * Real-time guard that blocks new debt acquisition if WACC crosses a "Danger" threshold.
 * Prevents over-leveraging by checking cost-of-capital stability.
 */
export const validateLeverage = async (req, res, next) => {
    const userId = req.user.id;
    const { amount, interestRate } = req.body;

    try {
        logInfo(`[Leverage Validator] Checking WACC stability for user ${userId}`);

        const waccData = await waccCalculator.calculateUserWACC(userId);

        // Danger Threshold: If WACC > 12% or Cost of Debt > 10%
        const WACC_DANGER_LEVEL = 0.12;
        const DEBT_RATE_DANGER_LEVEL = 0.10;

        if (waccData.wacc > WACC_DANGER_LEVEL) {
            logInfo(`[Leverage Validator] REJECTED: WACC of ${(waccData.wacc * 100).toFixed(2)}% exceeds safety limit.`);

            return new ApiResponse(403, {
                currentWacc: waccData.wacc,
                threshold: WACC_DANGER_LEVEL,
                recommendation: 'Reduce existing high-interest debt before taking on new leverage.'
            }, 'Debt Acquisition Blocked: WACC threshold exceeded').send(res);
        }

        // Check if the individual new loan rate is already too high
        if (interestRate && parseFloat(interestRate) / 100 > DEBT_RATE_DANGER_LEVEL) {
            logInfo(`[Leverage Validator] REJECTED: New loan rate ${interestRate}% is too high.`);

            return new ApiResponse(403, {
                proposedRate: interestRate,
                threshold: DEBT_RATE_DANGER_LEVEL * 100
            }, 'Debt Acquisition Blocked: Interest rate exceeds safety ceiling').send(res);
        }

        next();
    } catch (error) {
        logInfo(`[Leverage Validator] Error during validation: ${error.message}`);
        next(error);
    }
};

/**
 * Debt Velocity Shield
 */
export const debtVelocityShield = async (req, res, next) => {
    // Logic to prevent "Debt Cycling" (taking new debt to pay old debt repeatedly in short bursts)
    next();
};
