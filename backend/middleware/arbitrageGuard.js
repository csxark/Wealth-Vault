import { ApiResponse } from '../utils/ApiResponse.js';
import { riskProfiles } from '../db/schema.js';
import db from '../config/db.js';
import { eq } from 'drizzle-orm';
import { logInfo } from '../utils/logger.js';

/**
 * Arbitrage Compliance Guard (L3)
 * Ensures capital movement between debt and investment accounts adheres to user risk-profiles.
 */
export const arbitrageGuard = async (req, res, next) => {
    const userId = req.user.id;
    const { actionType, amount } = req.body;

    // Check for high-risk actions
    if (actionType === 'LOAN_TO_INVEST' || actionType === 'LIQUIDATE_TO_PAYOFF') {
        const [profile] = await db.select().from(riskProfiles).where(eq(riskProfiles.userId, userId));

        if (!profile) {
            return res.status(403).json(new ApiResponse(403, null,
                "Risk Profile Missing: Please complete your financial risk assessment before executing automated arbitrage reallocation."
            ));
        }

        const numericAmount = parseFloat(amount || 0);

        // Compliance Logic: Prevent "Aggressive" reallocation if profile is "Low" risk
        if (profile.riskTolerance === 'low' && actionType === 'LOAN_TO_INVEST') {
            return res.status(403).json(new ApiResponse(403, null,
                "Compliance Violation: 'Loan-to-Invest' leverage is restricted for Conservative (Low) risk profiles."
            ));
        }

        // Safety cap: No single automated reallocation > 20% of net worth (simplified check)
        // Here we just use a hard cap for demonstration if needed, or check metadata
        if (numericAmount > 25000 && profile.riskTolerance !== 'aggressive') {
            logInfo(`[Arbitrage Guard] Blocked high-value reallocation for user ${userId}. Amount: ${numericAmount}`);
            return res.status(403).json(new ApiResponse(403, null,
                "Safety Threshold Breach: Large reallocations for non-aggressive profiles require manual multi-sig approval."
            ));
        }
    }

    next();
};
