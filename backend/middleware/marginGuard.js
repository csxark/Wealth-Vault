import { ApiResponse } from '../utils/ApiResponse.js';
import marginEngine from '../services/marginEngine.js';
import { logInfo } from '../utils/logger.js';

/**
 * Margin Guard Middleware (#447)
 * Intercepts actions that would drop the user's collateral ratio below safety thresholds.
 */
export const enforceMarginSafety = async (req, res, next) => {
    const userId = req.user.id;

    try {
        const risk = await marginEngine.calculateRiskPosition(userId);

        // Safety threshold: Block new leverage or withdrawals if LTV > 75%
        if (parseFloat(risk.ltv) > 75) {
            logInfo(`[Margin Guard] Blocking transaction for user ${userId}. LTV too high: ${risk.ltv}%`);

            return res.status(403).json(new ApiResponse(403, null,
                `Margin Safety Breach: Your current Loan-to-Value (LTV) is ${risk.ltv}%. ` +
                `Outbound transfers and new debt are locked until ratio drops below 75%.`
            ));
        }

        // Warning threshold
        if (parseFloat(risk.ltv) > 60) {
            logInfo(`[Margin Guard] Transaction permitted with warning for user ${userId}. LTV: ${risk.ltv}%`);
            // We could add a custom header or metadata here
        }

        next();
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
};
